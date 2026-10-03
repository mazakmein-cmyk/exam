// supabase/functions/ai-pdf-import/merge.ts
//
// Splitting the paper and putting it back together.
//
// THE CONTRACT THIS FILE DEFENDS: whatever happens in here, the client receives
// ONE delimited JSON block in the v1.0 schema — the same thing a creator would
// have pasted by hand, and the same thing a single unsharded run produced. The
// browser-side parseExamJson / buildSectionCreationPlan / autoSnip / commitJson
// path is not told that parallel import exists and must never need to be.
//
// So the merge is deliberately dumb and deterministic: parse each worker's
// JSON, concatenate the questions in shard order, keep the first copy of a
// duplicate, and re-serialise. No model is asked to stitch anything together —
// a model that could be trusted to merge reliably could have been trusted to
// emit the whole paper in one pass, which is the thing being avoided.

import type { Slice } from "./prompts.ts";
// The same repair library the browser's jsonImportParser applies to a manual
// paste. Pinned to the version in package.json so both sides forgive the same
// things. The merge test resolves this URL to the local package.
import { jsonrepair } from "https://esm.sh/jsonrepair@3.14.0";

// deno-lint-ignore no-explicit-any
type Json = any;

export const JSON_START = "<<<EXAM_JSON_START>>>";
export const JSON_END = "<<<EXAM_JSON_END>>>";

/**
 * Parse the JSON between two delimiters, forgiving the things models actually
 * do rather than the things they promise.
 *
 * In order: the exact span between the delimiters; the same span trimmed of a
 * ```json fence; the widest brace-balanced span inside it. Each is tried
 * strictly, then with trailing commas removed, then through jsonrepair — the
 * SAME repair the browser applies to a pasted reply. That last step matters on
 * a maths paper: a model that writes "\sqrt" with one backslash has produced
 * invalid JSON that the browser would quietly have fixed, and failing the
 * worker here instead would retry every slice three times and import nothing.
 * Anything still unparseable is null, and the caller treats the worker as
 * failed — a half-read shard is retried, which is cheap.
 */
export function extractDelimitedJson(text: string, start: string, end: string): Json | null {
  const s = String(text ?? "");
  const a = s.indexOf(start);
  if (a < 0) return null;
  const b = s.indexOf(end, a + start.length);
  const span = b > a ? s.slice(a + start.length, b) : s.slice(a + start.length);

  const candidates: string[] = [];
  const bare = span.trim();
  candidates.push(bare);
  candidates.push(bare.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
  const open = bare.indexOf("{");
  const close = bare.lastIndexOf("}");
  if (open >= 0 && close > open) candidates.push(bare.slice(open, close + 1));

  // Only an OBJECT is a result. jsonrepair is forgiving enough to turn a
  // paragraph of prose into a JSON string, and "the model replied in prose" has
  // to stay a failure the caller can retry, not a string handed to the merge.
  const asObject = (v: unknown): Json | null =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const v = asObject(JSON.parse(candidate));
      if (v) return v;
    } catch {
      /* strict failed — try the cheap fix */
    }
    try {
      const v = asObject(JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1")));
      if (v) return v;
    } catch {
      /* still invalid — the browser's repair, next */
    }
    try {
      const v = asObject(JSON.parse(jsonrepair(candidate)));
      if (v) return v;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

// ─── Planning the split ──────────────────────────────────────────────────────

export type PlanSection = {
  name: string;
  from: number;
  to: number;
  count: number;
  /** Paper pages the section spans, when the index pass could see them. Page mode uses lastPage to avoid cutting chunks made only of key pages. */
  firstPage?: number | null;
  lastPage?: number | null;
};

export type ParsedPlan = {
  sections: PlanSection[];
  totalQuestions: number;
  answerKey: Json | null;
  marksConfig: Json | null;
  pages: number | null;
  numbering: string;
  notes: string;
};

const asInt = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/**
 * Read the index pass into something the splitter can use, or return null if it
 * is not trustworthy enough to split on.
 *
 * Returning null is a FEATURE. A paper this pass could not index is not a paper
 * to guess at: the orchestrator falls straight back to one whole-paper run,
 * which is exactly the behaviour that shipped before and is known to work. The
 * split is an optimisation, and an optimisation that cannot verify its own
 * premise has to decline.
 */
export function readPlan(raw: Json): ParsedPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const rows = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: PlanSection[] = [];

  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    const from = asInt(row?.first_q_no);
    const to = asInt(row?.last_q_no);
    if (!name || from === null || to === null) continue;
    if (from < 0 || to < from) continue;
    const span = to - from + 1;
    // A span this wide is a misread, not a section. Splitting on it would hand
    // a worker a range with nothing in most of it and leave real questions to
    // nobody, so the whole plan is discarded rather than half-trusted.
    if (span > 600) return null;
    const count = asInt(row?.count);
    const firstPage = asInt(row?.first_page);
    const lastPage = asInt(row?.last_page);
    sections.push({
      name,
      from,
      to,
      count: count && count > 0 ? Math.min(count, span) : span,
      firstPage: firstPage && firstPage > 0 ? firstPage : null,
      lastPage: lastPage && lastPage > 0 ? lastPage : null,
    });
  }

  if (!sections.length) return null;

  const summed = sections.reduce((n, s) => n + s.count, 0);
  const declared = asInt(raw?.total_questions);
  const total = declared && declared > 0 ? declared : summed;
  if (summed <= 0) return null;

  return {
    sections,
    totalQuestions: total,
    answerKey: raw?.answer_key && typeof raw.answer_key === "object" ? raw.answer_key : null,
    marksConfig: raw?.marks_config && typeof raw.marks_config === "object" ? raw.marks_config : null,
    pages: asInt(raw?.pages),
    numbering: String(raw?.numbering ?? "unknown"),
    notes: String(raw?.notes ?? "").slice(0, 400),
  };
}

/**
 * Cut the paper into `shardCount` roughly equal runs of printed question
 * numbers, never splitting a section in a way that loses its boundaries.
 *
 * Splitting happens on PRINTED numbers, not on positions, because that is the
 * only identifier a worker and the merge can both name without having read each
 * other's output. Two workers that agree "you take 31-60" cannot overlap, and a
 * question is missing only if its number is missing — which the merge can check
 * afterwards without trusting anybody's self-report.
 */
export function planShards(plan: ParsedPlan, shardCount: number): Slice[][] {
  const n = Math.max(1, Math.trunc(shardCount));
  if (n === 1) {
    return [plan.sections.map((s) => ({ section: s.name, from: s.from, to: s.to }))];
  }

  const totalSpan = plan.sections.reduce((acc, s) => acc + (s.to - s.from + 1), 0);
  const per = Math.max(1, Math.ceil(totalSpan / n));

  const shards: Slice[][] = [];
  let current: Slice[] = [];
  let room = per;

  for (const section of plan.sections) {
    let cursor = section.from;
    while (cursor <= section.to) {
      // Never leave a tail of one or two numbers to its own worker: the fixed
      // cost of a run (reading the PDF, finding the section) dwarfs emitting
      // two questions, so a stub shard is pure latency.
      const remaining = section.to - cursor + 1;
      const take = remaining - room <= 2 ? remaining : Math.min(room, remaining);
      const end = cursor + take - 1;
      current.push({ section: section.name, from: cursor, to: end });
      cursor = end + 1;
      room -= take;
      if (room <= 0 && shards.length < n - 1) {
        shards.push(current);
        current = [];
        room = per;
      }
    }
  }
  if (current.length) shards.push(current);
  return shards.filter((s) => s.length > 0);
}

/**
 * Cut one worker's slices in two at a printed-number boundary, as evenly as the
 * numbers allow.
 *
 * This is what a worker whose reply was CUT OFF gets instead of a retry. A cut
 * reply means the slice is too long for one answer, and the same slice on
 * another key is cut at the same place; half the slice is not. Null when there
 * are two questions or fewer — a slice that small and still too long is not a
 * length problem, and splitting it would only hide whatever it is.
 */
export function splitSlices(slices: Slice[]): [Slice[], Slice[]] | null {
  const total = slices.reduce((n, s) => n + Math.max(0, s.to - s.from + 1), 0);
  if (total <= 2) return null;
  const head: Slice[] = [];
  const tail: Slice[] = [];
  let room = Math.ceil(total / 2);
  for (const s of slices) {
    const span = s.to - s.from + 1;
    if (span <= 0) continue;
    if (room <= 0) {
      tail.push({ ...s });
    } else if (span <= room) {
      head.push({ ...s });
      room -= span;
    } else {
      head.push({ section: s.section, from: s.from, to: s.from + room - 1 });
      tail.push({ section: s.section, from: s.from + room, to: s.to });
      room = 0;
    }
  }
  if (!head.length || !tail.length) return null;
  return [head, tail];
}

/** How many workers this paper is worth, given the tuning and the key chain. */
export function shardCountFor(totalQuestions: number, target: number, max: number): number {
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) return 1;
  return Math.max(1, Math.min(max, Math.ceil(totalQuestions / Math.max(4, target))));
}

// ─── Putting it back together ────────────────────────────────────────────────

/**
 * One worker's contribution. `obj` is null for a worker that came back with
 * nothing — it is still passed in, because `slices` is the record of what that
 * worker was asked for and the gap report is computed from it.
 */
export type ShardResult = { slices: Slice[]; obj: Json | null };

export type MergeStats = {
  sections: number;
  questions: number;
  answered: number;
  /** Printed numbers a worker was asked for and did not emit. */
  missing: { section: string; qNos: number[] }[];
  missingCount: number;
};

/** Every printed q_no a question object claims, as an integer or null. */
function qNoOf(q: Json): number | null {
  return asInt(q?.q_no);
}

function pushUnique(into: Json[], from: unknown, seen: Set<string>, cap: number) {
  if (!Array.isArray(from)) return;
  for (const entry of from) {
    if (into.length >= cap) return;
    const fingerprint = JSON.stringify(entry ?? null);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    into.push(entry);
  }
}

function looksLikeMarks(config: Json): boolean {
  const d = config?.exam_default;
  return !!d && typeof d === "object" && Number.isFinite(Number(d.marks_correct));
}

/**
 * Merge the workers' JSON into the single object the client parses.
 *
 * Order is everything here, because the importer numbers questions by their
 * POSITION in the array. Shards are merged in the order they were cut, and each
 * shard emitted its slice in printed order, so concatenation reproduces printed
 * order across the whole paper. A duplicate on a boundary keeps the copy from
 * the earlier shard — the one whose range actually owned it.
 */
/**
 * The key two section names are the same section under. "MATHEMATICS" on the
 * page a worker saw the heading on and "Mathematics" on the pages another
 * worker saw no heading on are one section; case, spacing and punctuation
 * never make two.
 */
export function sectionKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function mergeShards(opts: {
  language: string;
  plan: ParsedPlan | null;
  shards: ShardResult[];
  model: string;
  pdfName: string | null;
  promptVersion: string;
  /** The exam's own section names: when a worker's name matches one of these ignoring case, that spelling wins. */
  sectionNames?: string[];
}): { merged: Json; stats: MergeStats } {
  const bySection = new Map<string, { name: string; questions: Json[]; seen: Set<number>; marks?: Json }>();
  const order: string[] = [];
  const preferred = new Map<string, string>();
  for (const n of opts.sectionNames ?? []) {
    const k = sectionKey(n);
    if (k && !preferred.has(k)) preferred.set(k, String(n).trim());
  }
  const displayName = (name: string) => preferred.get(sectionKey(name)) ?? name;

  // Plan order first: the exam's own section order is what the creator expects
  // to see, and a worker that renamed or reordered its sections cannot drag the
  // paper out of order if the shape was decided before any of them replied.
  for (const s of opts.plan?.sections ?? []) {
    const k = sectionKey(s.name);
    if (!k || bySection.has(k)) continue;
    bySection.set(k, { name: displayName(s.name), questions: [], seen: new Set() });
    order.push(k);
  }

  const skipped: Json[] = [];
  const review: Json[] = [];
  const skipSeen = new Set<string>();
  const reviewSeen = new Set<string>();
  let marksConfig: Json | null = null;
  let imagePadding: number | null = null;
  let schemaVersion = "1.0";
  let marksSource = "not_present";
  let answersSource = "not_present";

  for (const shard of opts.shards) {
    const obj = shard.obj;
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.schema_version === "string" && obj.schema_version) schemaVersion = obj.schema_version;
    if (!marksConfig && looksLikeMarks(obj.marks_config)) marksConfig = obj.marks_config;
    if (imagePadding === null) {
      const pad = asInt(obj.image_padding_pct);
      if (pad !== null) imagePadding = pad;
    }
    const summary = obj._extraction_summary ?? {};
    if (summary.marks_source === "found_in_pdf") marksSource = "found_in_pdf";
    if (summary.answers_source === "found_in_pdf") answersSource = "found_in_pdf";
    pushUnique(skipped, summary.skipped, skipSeen, 400);
    pushUnique(review, summary.needs_manual_review, reviewSeen, 800);

    for (const section of Array.isArray(obj.sections) ? obj.sections : []) {
      const name = String(section?.name ?? "").trim();
      if (!name) continue; // the parser drops a nameless section and its questions
      const k = sectionKey(name);
      if (!k) continue;
      let bucket = bySection.get(k);
      if (!bucket) {
        bucket = { name: displayName(name), questions: [], seen: new Set() };
        bySection.set(k, bucket);
        order.push(k);
      }
      if (!bucket.marks && looksLikeMarks(section?.marks_config)) bucket.marks = section.marks_config;
      for (const q of Array.isArray(section?.questions) ? section.questions : []) {
        if (!q || typeof q !== "object") continue;
        const n = qNoOf(q);
        // A question with no readable number cannot be deduped, so it is kept
        // as-is: losing a real question to protect against a duplicate is the
        // worse trade when the duplicate is visible in review and the loss is not.
        if (n !== null) {
          if (bucket.seen.has(n)) continue;
          bucket.seen.add(n);
        }
        bucket.questions.push(q);
      }
    }
  }

  const sections = order
    .map((k) => bySection.get(k)!)
    .filter((b) => b && b.questions.length > 0)
    .map((b) => {
      const out: Json = { name: b.name };
      if (b.marks) out.marks_config = b.marks;
      out.questions = b.questions;
      return out;
    });

  // What was asked for and never arrived. Computed from the slices, not from
  // any worker's own count: a worker that quietly stopped early reports a
  // consistent summary of the work it did do, so self-reports cannot catch it.
  const missing: { section: string; qNos: number[] }[] = [];
  let missingCount = 0;
  const askedBySection = new Map<string, { name: string; want: Set<number> }>();
  for (const shard of opts.shards) {
    for (const slice of shard.slices) {
      const k = sectionKey(slice.section);
      let entry = askedBySection.get(k);
      if (!entry) {
        entry = { name: displayName(slice.section), want: new Set<number>() };
        askedBySection.set(k, entry);
      }
      for (let n = slice.from; n <= slice.to; n++) entry.want.add(n);
    }
  }
  for (const [k, { name, want }] of askedBySection) {
    const got = bySection.get(k)?.seen ?? new Set<number>();
    const gaps: number[] = [];
    for (const n of want) if (!got.has(n)) gaps.push(n);
    if (gaps.length) {
      gaps.sort((x, y) => x - y);
      missing.push({ section: name, qNos: gaps });
      missingCount += gaps.length;
    }
  }

  const questions = sections.reduce((n, s) => n + s.questions.length, 0);
  let answered = 0;
  for (const s of sections) {
    for (const q of s.questions) {
      const a = q?.correct_answer;
      if (a === null || a === undefined || a === "") continue;
      if (Array.isArray(a) ? a.length > 0 : String(a).trim() !== "") answered++;
    }
  }

  const answerKey: Json = opts.plan?.answerKey ? { ...opts.plan.answerKey } : null;
  if (answerKey) {
    // The index pass owns the transcript; the counts describe the merged paper,
    // so they are recomputed here rather than carried over from a pass that had
    // not yet seen a single question.
    answerKey.answered = answered;
    answerKey.left_null = Math.max(0, questions - answered);
  }

  if (!marksConfig && opts.plan?.marksConfig) {
    const p = opts.plan.marksConfig;
    const correct = Number(p?.marks_correct);
    if (Number.isFinite(correct)) {
      marksConfig = {
        exam_default: {
          marks_correct: correct,
          marks_wrong: Math.abs(Number(p?.marks_wrong) || 0),
          marks_skipped: Number(p?.marks_skipped) || 0,
          mcq_mode: "all_or_nothing",
          mcq_wrong_penalty: "flat",
          rounding_strategy: "none",
        },
      };
    }
  }

  const merged: Json = {
    schema_version: schemaVersion,
    language: opts.language,
    _extraction_summary: {
      source_pdf: opts.pdfName ?? "",
      // Set here, never taken from the reply: the model reliably invents this
      // field, having previously named itself "GPT-4o" and "Claude 3.5 Sonnet".
      model: opts.model,
      extraction: `mocksetu parallel import · ${opts.shards.length} worker${opts.shards.length === 1 ? "" : "s"} · prompt ${opts.promptVersion}`,
      total_in_pdf: opts.plan?.totalQuestions ?? questions,
      extracted: questions,
      skipped,
      needs_manual_review: review,
      marks_source: marksSource,
      answers_source: answersSource,
      answer_key: answerKey ?? {
        found: false,
        applied: false,
        format: "none",
        pages: [],
        label_style: "none",
        numbering: "unknown",
        sets_in_key: [],
        set_used: null,
        transcript: {},
        answered,
        left_null: Math.max(0, questions - answered),
        note: "",
      },
    },
    ...(marksConfig ? { marks_config: marksConfig } : {}),
    sections,
    image_padding_pct: imagePadding ?? 5,
  };

  return {
    merged,
    stats: { sections: sections.length, questions, answered, missing, missingCount },
  };
}

/** Wrap the merged object in the delimiters the client's parser looks for. */
export function toDelimited(merged: Json): string {
  return `${JSON_START}\n${JSON.stringify(merged, null, 2)}\n${JSON_END}`;
}
