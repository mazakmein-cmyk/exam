// supabase/functions/ai-pdf-import/pages.ts
//
// The arithmetic of cutting a paper into page ranges — no PDF library, so the
// merge test can bundle and check it. pdf.ts does the actual cutting.

// deno-lint-ignore no-explicit-any
type Json = any;

/** One worker's pages: it OWNS from..to and is shown up to ctxTo (one extra page) so a question that runs over the boundary is seen whole. */
export type PageChunk = { from: number; to: number; ctxTo: number; path?: string | null };

/**
 * Cut `pages` into at most `maxChunks` runs of about `targetPages` each, in
 * order, every chunk shown one page of context past what it owns.
 *
 * Only pages 1..lastQuestionPage are cut when that is known (the index pass
 * reports each section's last page): a chunk made of nothing but the answer
 * key or the solutions would have no questions to emit and might "extract" the
 * restated ones from the solutions instead.
 */
export function planPageChunks(
  pages: number,
  targetPages: number,
  maxChunks: number,
  lastQuestionPage?: number | null
): PageChunk[] {
  const total = Math.max(1, Math.trunc(pages));
  const last = lastQuestionPage && lastQuestionPage >= 1 && lastQuestionPage <= total ? Math.trunc(lastQuestionPage) : total;
  const n = Math.max(1, Math.min(Math.max(1, maxChunks), Math.ceil(last / Math.max(1, targetPages))));
  const per = Math.ceil(last / n);
  const out: PageChunk[] = [];
  for (let from = 1; from <= last; from += per) {
    const to = Math.min(last, from + per - 1);
    out.push({ from, to, ctxTo: Math.min(total, to + 1), path: null });
  }
  return out;
}

/**
 * The pages the index pass reads. Answer keys are printed at the END —
 * after the questions, after the rough-work pages, inside a solutions booklet
 * — so the tail. Long enough to hold a solutions section on a long paper,
 * short enough to read inside one live call.
 */
export function keyWindow(pages: number, which: "tail" | "head"): PageChunk {
  const total = Math.max(1, Math.trunc(pages));
  const len = Math.min(12, Math.max(6, Math.ceil(total * 0.4)), total);
  if (which === "head") return { from: 1, to: len, ctxTo: len, path: null };
  return { from: Math.max(1, total - len + 1), to: total, ctxTo: total, path: null };
}

/** Halve a chunk's owned pages; null when it owns a single page (nothing left to halve). */
export function splitPageChunk(chunk: PageChunk, pages: number): [PageChunk, PageChunk] | null {
  const owned = chunk.to - chunk.from + 1;
  if (owned < 2) return null;
  const mid = chunk.from + Math.ceil(owned / 2) - 1;
  return [
    { from: chunk.from, to: mid, ctxTo: Math.min(pages, mid + 1), path: null },
    { from: mid + 1, to: chunk.to, ctxTo: Math.min(pages, chunk.to + 1), path: null },
  ];
}

/**
 * A worker was told "attached page 1 is paper page FROM" and asked to report
 * PAPER page numbers. When one reports chunk-relative pages anyway — every
 * page it names sits inside 1..(chunk length) while the chunk starts later in
 * the paper — shift them, so the figure snipper opens the right page of the
 * real PDF. Only unambiguous cases are touched.
 */
export function fixChunkPageNumbers(obj: Json, chunk: PageChunk): void {
  if (chunk.from <= 1 || !obj || typeof obj !== "object") return;
  const len = chunk.ctxTo - chunk.from + 1;
  const pagesSeen: number[] = [];
  const visit = (o: Json) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) visit(x);
      return;
    }
    if (Number.isInteger(o.page)) pagesSeen.push(o.page);
    for (const v of Object.values(o)) visit(v);
  };
  visit(obj);
  if (!pagesSeen.length) return;
  const allRelative = pagesSeen.every((p) => p >= 1 && p <= len);
  const anyOutsideChunk = pagesSeen.some((p) => p < chunk.from || p > chunk.ctxTo);
  if (!(allRelative && anyOutsideChunk)) return;
  const shift = (o: Json) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) {
      for (const x of o) shift(x);
      return;
    }
    if (Number.isInteger(o.page)) o.page = o.page + chunk.from - 1;
    for (const v of Object.values(o)) shift(v);
  };
  shift(obj);
}
