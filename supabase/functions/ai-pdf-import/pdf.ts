// supabase/functions/ai-pdf-import/pdf.ts
//
// Cutting the PDF itself into page ranges.
//
// ─── WHY ─────────────────────────────────────────────────────────────────────
// Everything before this split the WORK (which question numbers a worker
// emits) but still handed every worker the WHOLE PDF. That was fine while
// Gemini ran the work in the background. On 2026-09-23 the background
// retrieve call broke (see index.ts), every call became a live call bounded by
// the platform's 150 s wall clock, and a live call has to READ the whole PDF
// before it can say anything: the 25-page JEE "faculty copy" carries ~2,600
// embedded images, and even the small index pass — a few hundred output tokens
// — ran out its 110 s just looking at them, three times on three keys. No
// prompt, key or thinking setting changes how long a model takes to look at 25
// image-heavy pages.
//
// What does change it is showing each call fewer pages. A worker that receives
// a five-page PDF finishes in a fraction of the time, the index pass that only
// needs the answer key gets the last pages where keys are printed, and no step
// anywhere has to read the paper end to end in one call.
//
// ─── COST ────────────────────────────────────────────────────────────────────
// pdf-lib, measured on that same 2.4 MB PDF under Node: load ≈ 650 ms wall,
// one chunk saved ≈ 300–1200 ms wall, ≈ 700 ms of CPU for load plus three
// chunks together. The platform caps CPU at 2 s per request, so a tick cuts
// ONE chunk (load + one save) and leaves the rest to the next tick four
// seconds later — a few seconds of latency against a hard kill.
//
// The page arithmetic lives in pages.ts so the tests can check it without a
// PDF library.

import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

export { encodeBase64 };
export { type PageChunk, fixChunkPageNumbers, keyWindow, planPageChunks, splitPageChunk } from "./pages.ts";

const loadOpts = { ignoreEncryption: true, updateMetadata: false } as const;

/** How many pages the PDF has, or null when pdf-lib cannot read it (then the whole PDF is sent, as before). */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(bytes, loadOpts);
    const n = doc.getPageCount();
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    console.warn("[ai-pdf-import] pdf-lib could not read the PDF:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** A new PDF holding pages from..to (1-based, inclusive) of `bytes`. */
export async function pdfSlice(bytes: Uint8Array, from: number, to: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, loadOpts);
  const n = src.getPageCount();
  const a = Math.max(1, Math.min(n, from));
  const b = Math.max(a, Math.min(n, to));
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = a; p <= b; p++) indices.push(p - 1);
  const pages = await out.copyPages(src, indices);
  for (const page of pages) out.addPage(page);
  return await out.save({ useObjectStreams: true });
}
