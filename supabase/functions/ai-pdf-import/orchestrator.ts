// supabase/functions/ai-pdf-import/orchestrator.ts
//
// The importer as a work queue instead of one long wish.
//
// ─── WHY ─────────────────────────────────────────────────────────────────────
// A full paper used to be ONE Gemini call that emitted every question. That
// call is decode-bound: the measured SBI run produced ~25k output tokens plus
// ~38k thinking tokens, and a model emits those one after another no matter how
// fast the network is. 126 s on 3.5 Flash, 270 s on 2.5 Flash, and nothing
// about keys, quotas or retries moves that number — the only way to finish
// sooner is to have several models emitting different parts at the same time.
//
// So a job is now: one small INDEX pass that reads the paper's shape and
// transcribes the answer key, then N extraction workers that each emit their
// own slice of the question numbers, then a deterministic merge. N workers that
// each emit a quarter of the output finish in roughly a quarter of the time,
// and — the part that matters more — a worker that stalls costs one quarter of
// a retry instead of the whole paper.
//
// ─── WHAT DRIVES IT ──────────────────────────────────────────────────────────
// Nothing new. The dialog already polls `status` every 4 s, so every poll is a
// scheduler tick: reap what has finished, fail what is past its deadline,
// relaunch it on the next key, launch what is queued, and merge when the last
// worker lands. No cron, no queue service, no client change.
//
// ─── WHY IT CANNOT RUN FOR THIRTY MINUTES ────────────────────────────────────
// Three deadlines, all of them enforced by a tick rather than hoped for:
//   • every fetch to Gemini is aborted at its timeout (see gemini.ts);
//   • every worker has its own deadline and is relaunched on another key when
//     it passes, at most MAX_ATTEMPTS times;
//   • the whole job has a hard deadline, after which it fails with a sentence
//     the creator can act on.
// The old code's only backstop was a 45-minute staleness check, which is why an
// import could sit on "running" long past the point of being worth waiting for.

import {
  type KeySlot,
  asKeySlot,
  gemini,
  generateContentText,
  geminiErrorMessage,
  interactionText,
  isModelSlow,
  keyFor,
  keysWithModel,
  nextJobOffset,
  slotAt,
  slotForModel,
} from "./gemini.ts";
// rotateSlot is intentionally not used here: a retry picks its key from the
// job's own offset plus the attempt number, so two workers retrying at the same
// moment land on different accounts instead of both stepping onto the next one.
import {
  PLAN_END,
  PLAN_START,
  type Slice,
  buildPageShardPrompt,
  buildPlanPrompt,
  buildShardPrompt,
  buildWholePaperPrompt,
} from "./prompts.ts";
import {
  type PageChunk,
  encodeBase64,
  fixChunkPageNumbers,
  keyWindow,
  pdfSlice,
  planPageChunks,
  splitPageChunk,
} from "./pdf.ts";
import {
  JSON_END,
  JSON_START,
  type ParsedPlan,
  type ShardResult,
  extractDelimitedJson,
  mergeShards,
  planShards,
  readPlan,
  shardCountFor,
  splitSlices,
  toDelimited,
} from "./merge.ts";
// The single pass's clock. The whole-paper fallback IS the single pass, so it
// is given the single pass's time rather than a slice's.
import { BACKGROUND_STALE_MS } from "./legacy.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
// deno-lint-ignore no-explicit-any
type Client = any;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

export const ORCH_VERSION = 2;

function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/**
 * Questions one worker is aimed at. Twelve, not twenty-two: on the live engine
 * a call must finish inside the platform's wall clock (LIVE_CALL_MS), and a
 * slice of twelve formula-heavy JEE questions is the size that reliably does.
 * Small enough to finish fast, big enough that reading the PDF is worth it.
 */
const TARGET_PER_SHARD = () => envInt("AI_IMPORT_SHARD_SIZE", 12);
/**
 * PAGES one worker is handed when the PDF can be cut (see pdf.ts). Five: on
 * the image-heavy JEE paper five pages read in well under a minute, and a
 * five-page chunk holds roughly ten to twelve questions — about what a
 * question-number slice was aiming at anyway.
 */
const TARGET_PAGES = () => envInt("AI_IMPORT_PAGES_PER_PART", 5);
/** Chunk PDFs cut per tick. pdf-lib costs ~0.7 s of CPU for a load plus a save and the platform allows 2 s per request. */
const CHUNKS_PER_TICK = 1;
/** PDFs bigger than this are not cut: pdf-lib would hold the whole thing in memory twice. They run as one PDF, as before. */
const MAX_CUT_BYTES = () => envInt("AI_IMPORT_MAX_CUT_BYTES", 15 * 1024 * 1024);
export { MAX_CUT_BYTES };
/** Ceiling on workers per job. More workers means more copies of the PDF read, and past a point the fixed cost stops paying. */
const MAX_SHARDS = () => envInt("AI_IMPORT_MAX_SHARDS", 6);
/**
 * The whole job, start to merge. The creator sees a real failure at this point
 * rather than an open-ended wait. Eighteen minutes, sized for a long paper: a
 * background index pass (5 min, extended once to 10 if Gemini reports it in
 * progress — the 60-page JEE paper needed more than 5), the slices (5 min,
 * same extension), and the merge. Too short loses finished work; too long only
 * costs waiting, and the deadline salvages whatever landed either way. The
 * single pass never finished that paper in 25.
 */
const JOB_DEADLINE_MS = () => envInt("AI_IMPORT_JOB_DEADLINE_MS", 18 * 60_000);
/** One generateContent call. Must stay under the platform wall clock (150 s Free). */
const LIVE_CALL_MS = () => envInt("AI_IMPORT_LIVE_CALL_MS", 128_000);
/**
 * How long a background worker may sit on Gemini's side before it is written
 * off and restarted elsewhere. Five minutes: a slice of a 60-page JEE paper is
 * 60 pages to read plus 18 formula-heavy questions to emit, and Gemini's
 * background queue adds its own wait before the model starts.
 */
const BG_SHARD_MS = () => envInt("AI_IMPORT_SHARD_DEADLINE_MS", 300_000);
/** The index pass. Small output, so this is generous already. */
const PLAN_CALL_MS = () => envInt("AI_IMPORT_PLAN_CALL_MS", 110_000);
/**
 * Attempts per worker, each on the next key — and, after a stall, the next
 * model. Five, not three: on 2026-09-23 a part lost all three of its attempts
 * to "busy" and "not available" from two different models and pages 21–25 of
 * the paper went unimported while the job still had six minutes on its clock.
 * The job deadline, not this number, is what bounds the wait.
 */
const MAX_ATTEMPTS = () => envInt("AI_IMPORT_MAX_ATTEMPTS", 8);
/**
 * Attempts for the INDEX pass, which is fewer than for a worker on purpose. Each
 * attempt can take two minutes, and three of them would spend six of the job's
 * eight minutes learning that this paper cannot be indexed — leaving the
 * whole-paper fallback no time at all. Two tries on two keys is enough to rule
 * out a bad key or a bad minute; after that the split is not worth chasing.
 */
const PLAN_ATTEMPTS = () => envInt("AI_IMPORT_PLAN_ATTEMPTS", 3);

/**
 * The Flash models to fall through, in order, when one does not answer. Every
 * entry runs on the live engine. Overridable without a redeploy:
 * AI_IMPORT_MODEL_CHAIN="gemini-3.5-flash,gemini-3.8-flash,…". 2.5 Flash is
 * last because on 2026-09-23 it answered 404 "not available" to these keys —
 * it had been retired since the September checks — and a model that 404s is
 * remembered as dead for the rest of the isolate's life and skipped.
 */
export function modelChain(): string[] {
  const raw = Deno.env.get("AI_IMPORT_MODEL_CHAIN");
  // 2.5 Flash second: on 2026-09-23 it was the model that actually delivered
  // (five of six page parts) while 3.5 never answered and 3.8 answered once.
  const list = (raw ? raw.split(",") : ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.8-flash", "gemini-3-flash-preview"])
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ["gemini-3.5-flash"];
}

/** A model no key can call any more. Availability is per (model, key) — see gemini.ts. */
const isModelDead = (model: string) => keysWithModel(model).length === 0;

/**
 * The next model in the chain after `current` that some key can still call —
 * preferring one that has not stalled in the last ten minutes — or `current`
 * when there is nowhere else to go.
 */
export function otherModel(current: string): string {
  const chain = modelChain();
  const start = chain.indexOf(current);
  const others: string[] = [];
  for (let k = 1; k <= chain.length; k++) {
    const m = chain[(((start >= 0 ? start : -1) + k) % chain.length + chain.length) % chain.length];
    if (m !== current) others.push(m);
  }
  const alive = others.filter((m) => !isModelDead(m));
  // When this isolate's memory says every other model is dead, the memory is
  // more likely stale than the whole chain gone — and repeating the model that
  // just stalled is the one choice known to be wrong. Rotate anyway.
  const pool = alive.length ? alive : others;
  return pool.find((m) => !isModelSlow(m)) ?? pool[0] ?? current;
}

/**
 * The model a job or worker should START on. The creator asked for
 * `requested`; if that model timed out or said "busy" within the last ten
 * minutes on this isolate, new work opens on the next one instead of spending
 * another 110 s learning the same thing.
 */
export function startingModel(requested: string): string {
  if (!isModelSlow(requested) && !isModelDead(requested)) return requested;
  const alt = otherModel(requested);
  return alt;
}

/** Did this attempt fail in a way that says "this model is not answering right now"? */
const isModelStall = (error: string | null | undefined) => /did not answer|busy|overloaded|503/i.test(error ?? "");

/**
 * The model a worker's next attempt should use. A stall (timeout, 503) moves
 * to another model. "Not available" is about the KEY it was tried on: stay on
 * the model if some other key still has it — the slot chooser will pick one —
 * and only move on when no key does.
 */
function modelForRetry(current: string, lastError: string | null | undefined): string {
  const e = lastError ?? "";
  // "not available to ANY of the keys": the call already walked the whole
  // chain and every key said 404. That is the job's own evidence, and it beats
  // this isolate's memory — which may be empty, because the walk happened in
  // another isolate. Move model now rather than spend another attempt.
  if (/not available to any/i.test(e)) return otherModel(current);
  if (/not available/i.test(e)) return keysWithModel(current).length ? current : otherModel(current);
  return isModelStall(e) ? otherModel(current) : current;
}

/** The reason a worker records when Gemini stopped mid-reply. The scheduler reads it back to decide to split rather than retry. */
const CUT_OFF_MESSAGE = "Gemini's reply was cut off — that slice is too long for one pass.";
const WHOLE_CUT_OFF_MESSAGE =
  "Gemini's reply was cut off — the paper is too long for one pass. Split the PDF, or import one language at a time.";
/**
 * Was this slice too big for one call? A reply that was cut off says so
 * directly; a live call that ran out of time says the same thing in a
 * different way — the model was still emitting when the clock ran out — and
 * sending the same slice to another key buys nothing but the same clock.
 */
const isCutOff = (error: string | null | undefined) => /cut off|did not answer (in time|within)/i.test(error ?? "");
/**
 * Base64 bytes a single invocation may hold in flight while launching workers.
 * Each launch serialises its own copy of the PDF into a request body, so four
 * concurrent launches of a 27 MB base64 payload is ~108 MB of transient string
 * — enough to be killed for memory. Past this budget the launches are spread
 * over consecutive ticks instead, which costs a few seconds and cannot OOM.
 */
const LAUNCH_BUDGET_BYTES = () => envInt("AI_IMPORT_LAUNCH_BUDGET_BYTES", 40 * 1024 * 1024);
/** How long one tick may claim the right to change the plan. */
const LEASE_MS = 20_000;
/**
 * Width of a polling slot, in ms.
 *
 * Polling costs requests, and on the free tier requests are the scarce thing:
 * the dialog ticks every 4 s, so polling four workers on every tick would be 60
 * requests a minute against a per-project allowance nearer ten. Instead each
 * tick polls only the worker whose slot the clock is currently in, which keeps
 * the whole job at roughly one poll per tick however many workers it has, and
 * spreads those polls across the keys the workers are running on.
 */
const POLL_SLOT_MS = 3_000;
/** Fewest polling slots to spread across, so a one-worker job is not polled on every tick. */
const MIN_POLL_SLOTS = 3;

export type ShardState = {
  i: number;
  slices: Slice[];
  status: "queued" | "running" | "done" | "failed";
  engine: "background" | "live";
  slot: KeySlot;
  attempt: number;
  interactionId?: string | null;
  startedAt?: string | null;
  deadlineAt?: string | null;
  error?: string | null;
  /** True for the single whole-paper worker used when the split is declined. */
  whole?: boolean;
  /**
   * Do not relaunch before this time. Set after a stall ("busy", timeout,
   * "not available"): five attempts fired four seconds apart all land in the
   * same bad minute at Google and are all wasted. A short, growing pause
   * spends them across the minutes instead.
   */
  notBefore?: string | null;
  /**
   * A model override for this attempt. Set when the job's model did not
   * answer in time or was "busy": the retry goes to the OTHER Flash model
   * rather than back to the one that just stalled. On 2026-09-23 3.5 Flash
   * timed out on a ten-page chunk three times running while its background
   * endpoint was also broken — a model can have a bad day, and a retry that
   * cannot leave it is not a retry.
   */
  model?: string | null;
  /**
   * The PAGES this worker is handed, when the PDF was cut (pdf.ts). Set on
   * every worker of a page-mode job and on the index pass (the key pages);
   * `path` is the chunk PDF in storage once it has been cut, null until then.
   * A worker with `pages` has empty `slices`: it owns pages, not numbers.
   */
  pages?: PageChunk | null;
  /**
   * What Gemini last said about this attempt — "queued", "in_progress", a poll
   * error — and when. Written on CHANGE only, so it costs a handful of writes
   * per worker. It is the difference between "the index pass ran past its
   * deadline" and knowing whether the model was working the whole time or the
   * request sat in Google's queue: the first attempt on the 60-page JEE paper
   * was written off after five minutes with no record of which.
   */
  observed?: { at: string; status: string; note?: string } | null;
  /**
   * Every earlier attempt: which key, how long, how it ended, what Gemini was
   * last seen saying. A retry used to overwrite the slot and clear the error,
   * which erased the very reason it was retrying.
   */
  history?: {
    attempt: number;
    slot: KeySlot;
    startedAt?: string | null;
    endedAt: string;
    outcome: string;
    observed?: string | null;
  }[];
  /**
   * Set when this attempt's deadline was extended once because Gemini reported
   * it in progress. A deadline exists to catch work that is hung or lost;
   * work that is visibly progressing is neither, and killing it only to start
   * the same five minutes again on another key is how a long paper never
   * finishes. One extension, then the deadline is final.
   */
  extended?: boolean;
};

export type Orchestration = {
  v: number;
  phase: "planning" | "extracting" | "merging" | "done";
  deadlineAt: string;
  leaseUntil?: string | null;
  keyOffset: number;
  plan?: ParsedPlan | null;
  planShard?: ShardState | null;
  shards: ShardState[];
  note?: string;
  /** Pages in the PDF, when pdf-lib could read it. Null means "send the whole PDF", the pre-page-mode behaviour. */
  pageCount?: number | null;
  /** Storage folder the chunk PDFs are written to; removed when the job is acknowledged or ends. */
  partsDir?: string | null;
  /** Set once the chunk files have been removed, so cleanup runs once. */
  partsCleaned?: boolean;
};

/** Is this job cutting the PDF into page chunks? */
export function isPageMode(orch: Orchestration | null | undefined): boolean {
  return !!orch && !!orch.pageCount && orch.pageCount > 0 && !!orch.partsDir;
}

const isoNow = () => new Date().toISOString();
const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** Columns a tick needs. Deliberately excludes raw_output and shard_results, which are hundreds of KB and are read only at merge time. */
export const CONTROL_COLUMNS =
  "id,user_id,exam_id,language,model,engine,status,interaction_id,api_key_slot," +
  "storage_path,pdf_name,pdf_url,section_names,prompt_version,usage,error," +
  "created_at,updated_at,completed_at,imported_at,orchestration";

export type TickContext = {
  service: Client;
  job: Json;
  /** Loads and base64-encodes the PDF at most once per invocation. */
  pdf: () => Promise<string>;
  /** The raw PDF bytes, loaded at most once per invocation — what pdf-lib cuts. */
  pdfBytes: () => Promise<Uint8Array>;
  /** Storage bucket the PDF and its chunks live in. */
  bucket: string;
  /** The engine the chosen model supports for extraction. */
  engine: "background" | "live";
  model: string;
};

// ─── Cutting the PDF ─────────────────────────────────────────────────────────

/**
 * Cut one chunk out of the original PDF, store it, and hand back its base64.
 * About a second of CPU (pdf-lib load + one save), which is why callers do at
 * most CHUNKS_PER_TICK of these per tick. Errors come back as a sentence, not
 * a throw: a chunk that cannot be cut fails its worker, not the tick.
 */
async function materialiseChunk(
  ctx: TickContext,
  chunk: PageChunk
): Promise<{ path: string; base64: string } | { error: string }> {
  const orch = ctx.job.orchestration as Orchestration | null;
  const dir = orch?.partsDir;
  if (!dir) return { error: "This job has no folder for its page chunks." };
  try {
    const bytes = await ctx.pdfBytes();
    const sliced = await pdfSlice(bytes, chunk.from, chunk.ctxTo);
    const path = `${dir}/p${chunk.from}-${chunk.ctxTo}.pdf`;
    const { error } = await ctx.service.storage
      .from(ctx.bucket)
      .upload(path, new Blob([sliced], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
    if (error) return { error: `Could not store pages ${chunk.from}–${chunk.ctxTo}: ${error.message}` };
    return { path, base64: encodeBase64(sliced) };
  } catch (e) {
    return {
      error: `Could not cut pages ${chunk.from}–${chunk.ctxTo} out of the PDF: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** A chunk that was cut on an earlier tick, read back for a retry. */
async function chunkBase64(ctx: TickContext, path: string): Promise<string> {
  const { data, error } = await ctx.service.storage.from(ctx.bucket).download(path);
  if (error || !data) throw new Error(`The page chunk ${path} could not be read back from storage.`);
  return encodeBase64(new Uint8Array(await data.arrayBuffer()));
}

/**
 * Remove the chunk PDFs of a finished job. Idempotent and best-effort: a
 * chunk left behind costs a few hundred KB of storage, not correctness.
 */
export async function cleanupParts(service: Client, bucket: string, job: Json): Promise<void> {
  const orch = job?.orchestration as Orchestration | null;
  if (!orch?.partsDir || orch.partsCleaned) return;
  try {
    const { data } = await service.storage.from(bucket).list(orch.partsDir, { limit: 100 });
    const paths = (data ?? []).map((f: Json) => `${orch.partsDir}/${f.name}`);
    if (paths.length) await service.storage.from(bucket).remove(paths);
  } catch (e) {
    console.warn("[ai-pdf-import] could not remove page chunks:", e instanceof Error ? e.message : String(e));
  }
  await patchJob(service, job.id, { orchestration: { ...orch, partsCleaned: true } });
}

// ─── Row plumbing ────────────────────────────────────────────────────────────

async function patchJob(service: Client, id: string, patch: Record<string, Json>) {
  const { error } = await service
    .from("ai_import_jobs")
    .update({ ...patch, updated_at: isoNow() })
    .eq("id", id);
  if (error) console.error("[ai-pdf-import] job update failed:", error.message);
}

/**
 * Write the plan back, but only if nobody else has touched the row since it was
 * read. A worker finishing writes its result through an atomic RPC that also
 * bumps updated_at, so a tick that lost the race simply drops its write and
 * re-decides on the next poll four seconds later — which is always safe,
 * because a tick's decisions are derived from the row and never from memory.
 */
async function casOrchestration(
  service: Client,
  job: Json,
  next: Orchestration,
  extra: Record<string, Json> = {}
): Promise<boolean> {
  const { data, error } = await service
    .from("ai_import_jobs")
    .update({ ...extra, orchestration: next, updated_at: isoNow() })
    .eq("id", job.id)
    .eq("updated_at", job.updated_at)
    .select("id");
  if (error) {
    console.error("[ai-pdf-import] orchestration write failed:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Record one worker's result. Atomic on the database side (see the
 * ai_import_record_shard migration): it merges the payload into shard_results
 * and stamps the worker's status inside orchestration in a single statement, so
 * two workers finishing at the same moment cannot lose each other's output.
 */
async function recordShard(
  service: Client,
  jobId: string,
  shard: ShardState,
  payload: Json,
  status: "done" | "failed",
  error: string | null
): Promise<boolean> {
  const { error: rpcErr } = await service.rpc("ai_import_record_shard", {
    p_job: jobId,
    p_index: shard.i,
    p_payload: payload ?? null,
    p_status: status,
    p_error: error,
    // Which attempt is speaking. A worker written off for running long can
    // still finish afterwards and report itself; the database drops a write
    // that names an attempt older than the one now in flight, so a ghost
    // cannot fail its own replacement.
    p_attempt: shard.attempt,
  });
  if (rpcErr) {
    console.error("[ai-pdf-import] recordShard failed:", rpcErr.message);
    return false;
  }
  return true;
}

/**
 * Remember what Gemini just said about a worker's interaction, if it changed.
 * Best-effort: a write that loses the compare-and-swap is simply dropped and
 * the next poll says it again. Returns true when the row changed, so the tick
 * re-reads before deciding anything.
 */
async function noteObserved(ctx: TickContext, shard: ShardState, status: string, note?: string): Promise<boolean> {
  if (shard.observed?.status === status && (shard.observed?.note ?? undefined) === note) return false;
  const orch = ctx.job.orchestration as Orchestration | null;
  if (!orch) return false;
  const next: Orchestration = JSON.parse(JSON.stringify(orch));
  const target = shard.i < 0 ? next.planShard : next.shards.find((s) => s.i === shard.i);
  if (!target || target.attempt !== shard.attempt) return false;
  target.observed = { at: isoNow(), status, ...(note ? { note } : {}) };
  return await casOrchestration(ctx.service, ctx.job, next);
}

/** Close the books on the attempt in flight, before a retry rewrites the slot and clears the error. */
function endAttempt(shard: ShardState, outcome: string) {
  const history = (shard.history ??= []);
  history.push({
    attempt: shard.attempt,
    slot: shard.slot,
    startedAt: shard.startedAt ?? null,
    endedAt: isoNow(),
    outcome: outcome.slice(0, 200),
    observed: shard.observed ? `${shard.observed.status} @ ${shard.observed.at}` : null,
  });
  if (history.length > 8) history.splice(0, history.length - 8);
  shard.observed = null;
  shard.extended = false;
}

/**
 * A worker at its deadline that Gemini still reports as in progress gets ONE
 * extension of the same budget instead of being written off. Returns true when
 * it was extended (the caller leaves it running).
 */
function extendIfProgressing(shard: ShardState, budgetMs: number): boolean {
  if (shard.extended || shard.observed?.status !== "in_progress") return false;
  shard.extended = true;
  shard.deadlineAt = new Date(Date.now() + budgetMs).toISOString();
  (shard.history ??= []).push({
    attempt: shard.attempt,
    slot: shard.slot,
    startedAt: shard.startedAt ?? null,
    endedAt: isoNow(),
    outcome: `deadline extended once — Gemini reported in_progress at ${shard.observed?.at}`,
    observed: shard.observed ? `${shard.observed.status} @ ${shard.observed.at}` : null,
  });
  return true;
}

/** One line for the dialog: where the job is and what Gemini last said. Plain words, no ids. */
export function progressLine(orch: Orchestration): string {
  const since = (iso?: string | null) => (iso ? `${Math.max(0, Math.round((Date.now() - ms(iso)) / 1000))}s in` : "");
  const said = (s?: ShardState | null) =>
    s?.observed
      ? `${s.observed.status.replace(/_/g, " ")}${s.observed.note ? ` (${s.observed.note})` : ""}`
      : s?.engine === "live"
        ? "live call"
        : "not polled yet";
  if (orch.phase === "planning") {
    const p = orch.planShard;
    if (!p) return "indexing the paper";
    const where = p.pages ? `reading pages ${p.pages.from}–${p.pages.ctxTo} for the answer key` : "indexing the paper";
    return `${where} · attempt ${p.attempt} of ${PLAN_ATTEMPTS()}${p.model ? ` · switched to ${p.model}` : ""} · key ${p.slot} · Gemini says ${said(p)} · ${since(p.startedAt)}${p.extended ? " · deadline extended once" : ""}`;
  }
  if (orch.phase === "extracting") {
    const n = orch.shards.length;
    const finished = orch.shards.filter((s) => s.status === "done").length;
    const running = orch.shards.filter((s) => s.status === "running");
    const failed = orch.shards.filter((s) => s.status === "failed").length;
    const retried = orch.shards.filter((s) => s.attempt > 1).length;
    const bits = [`${n} part${n === 1 ? "" : "s"}`, `${finished} done`, `${running.length} running`];
    if (retried) bits.push(`${retried} retried`);
    if (failed) bits.push(`${failed} failed`);
    const pausing = orch.shards.filter((s) => s.status === "queued" && ms(s.notBefore) > Date.now());
    if (pausing.length) bits.push(`${pausing.length} waiting a moment after Gemini said busy`);
    if (running.length) {
      bits.push(
        `Gemini says ${running
          .map((s) => `part ${s.i + 1}${s.pages ? ` (pages ${s.pages.from}–${s.pages.to})` : ""}${s.model ? ` on ${s.model}` : ""}: ${said(s)}`)
          .join(", ")}`
      );
    }
    if (orch.shards[0]?.whole) bits.unshift("whole paper in one pass (index unavailable)");
    else if (isPageMode(orch)) bits.unshift(`${orch.pageCount} pages cut into parts`);
    return bits.join(" · ");
  }
  if (orch.phase === "merging") return "merging the parts";
  return "done";
}

function background(promise: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise.catch((e) => console.error("[ai-pdf-import] background task:", e)));
  } else {
    // Local dev without background tasks: let it run, and swallow so an
    // unhandled rejection cannot take the worker down.
    promise.catch((e) => console.error("[ai-pdf-import] background task:", e));
  }
}

// ─── Calling Gemini ──────────────────────────────────────────────────────────

type ThinkingLevel = "minimal" | "low" | "medium" | "high";

function liveBody(prompt: string, pdfBase64: string, opts: { thinkingLevel?: ThinkingLevel } = {}): Json {
  const body: Json = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 65536 },
  };
  const budget = Deno.env.get("AI_IMPORT_THINKING_BUDGET");
  if (budget !== undefined && budget !== "" && Number.isFinite(Number(budget))) {
    body.generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };
  }
  // Gemini 3.x: thinkingLevel (minimal | low | medium | high). Only the index
  // pass asks for less — it transcribes, it does not reason. Workers keep the
  // default: thinking budget 0 left 42 of 100 questions as placeholders.
  if (opts.thinkingLevel) {
    body.generationConfig.thinkingConfig = { ...(body.generationConfig.thinkingConfig ?? {}), thinkingLevel: opts.thinkingLevel };
  }
  return body;
}

function interactionBody(model: string, prompt: string, pdfBase64: string): Json {
  return {
    model,
    input: [
      { type: "text", text: prompt },
      { type: "document", mime_type: "application/pdf", data: pdfBase64 },
    ],
    background: true,
    generation_config: { temperature: 0, max_output_tokens: 65536 },
  };
}

type LiveOutcome = { text?: string; usage?: Json; error?: string; retryable: boolean; slot: KeySlot };

/**
 * One live generateContent call, bounded by `timeoutMs`.
 *
 * It OPENS on `slot` and may walk the chain from there. A key that refuses at
 * the door — over quota, suspended, deleted — is a start-time failure, and
 * moving to the next key inside the same call costs about a second; failing
 * the worker and waiting for the next poll to relaunch it cost a whole attempt
 * and four seconds, and with three attempts a job could spend all of them
 * discovering keys that a warm chain already knew were resting. The slot that
 * actually answered comes back so the caller can record it.
 */
async function callLive(
  model: string,
  prompt: string,
  pdfBase64: string,
  slot: KeySlot,
  timeoutMs: number,
  opts: { thinkingLevel?: ThinkingLevel } = {}
): Promise<LiveOutcome> {
  const body = liveBody(prompt, pdfBase64, opts);
  const { ok, res, slot: served, tried, error } = await gemini(
    `/models/${model}:generateContent`,
    { method: "POST", body },
    slot,
    true,
    timeoutMs
  );
  if (!ok || !res) {
    const err = error ?? { status: 500, message: "", reason: "" };
    // (gemini.ts has already remembered a 404 as "this model on this key" and a
    // 408/503 as "this model is slow right now".)
    return { error: geminiErrorMessage(err, tried), retryable: true, slot: served };
  }
  const reply = await res.json();
  const finish = reply?.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") {
    return {
      error: CUT_OFF_MESSAGE,
      usage: reply?.usageMetadata ?? null,
      retryable: false,
      slot: served,
    };
  }
  return { text: generateContentText(reply), usage: reply?.usageMetadata ?? null, retryable: true, slot: served };
}

// ─── The index pass ──────────────────────────────────────────────────────────

/** The index pass's deadline for one attempt, by the engine it runs on. */
function planDeadline(engine: "background" | "live"): string {
  return new Date(Date.now() + (engine === "background" ? BG_SHARD_MS() : PLAN_CALL_MS()) + 10_000).toISOString();
}

/** The reason the index pass records when the key pages held no key — the retry reads the front of the paper instead. */
const NO_KEY_ON_TAIL = "no answer key on the last pages";

/** Read the index pass's reply and record it — the same for a live reply and a polled background one. */
async function recordPlanText(ctx: TickContext, shard: ShardState, text: string) {
  const raw = extractDelimitedJson(text, PLAN_START, PLAN_END);
  const plan = readPlan(raw);
  if (!plan) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", "The index pass could not be read.");
    return;
  }
  // In page mode the index pass reads only the LAST pages. A paper that prints
  // its key at the front comes back "found: false" from there; that is not a
  // failed pass, it is the wrong window, and the retry reads the front.
  if (shard.pages && shard.pages.from > 1 && shard.attempt < PLAN_ATTEMPTS() && plan.answerKey?.found === false) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", NO_KEY_ON_TAIL);
    return;
  }
  await recordShard(ctx.service, ctx.job.id, shard, plan as Json, "done", null);
}

/** The live index pass: one generateContent call, then record. */
async function runPlan(ctx: TickContext, shard: ShardState, prompt: string, pdfBase64: string) {
  const started = Date.now();
  const model = shard.model ?? ctx.model;
  let out = await callLive(model, prompt, pdfBase64, shard.slot, PLAN_CALL_MS(), { thinkingLevel: "low" });
  if (out.error && /thinking/i.test(out.error)) {
    // The model or API revision does not take thinkingLevel (2.5 Flash uses a
    // budget, not a level). Low thinking is a speed-up, not a requirement.
    const left = PLAN_CALL_MS() - (Date.now() - started);
    if (left > 20_000) out = await callLive(model, prompt, pdfBase64, shard.slot, left);
  }
  if (out.error || !out.text) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", `${out.error ?? "The index pass returned nothing."} [${model}]`);
    return;
  }
  await recordPlanText(ctx, shard, out.text);
}

/**
 * Start the index pass on whatever engine the chosen model supports.
 *
 * The first cut ran it live regardless, on the theory that a few hundred
 * output tokens come back in seconds and a background interaction adds queue
 * time. That theory was written against a 27-page paper. A 60-page JEE
 * "faculty copy" with solutions has to be READ before those tokens can be
 * emitted, and reading it inside a live call is a race against the platform's
 * 150 s wall clock that a long paper loses — twice, because the pass is tried
 * twice — before the whole thing falls back to a single pass that takes
 * twenty-five minutes on the same paper. So on the background engine the
 * index pass is a background interaction like any worker: polled by the tick,
 * bounded by BG_SHARD_MS, and not bounded by the wall clock at all.
 */
async function launchPlan(ctx: TickContext, shard: ShardState, pdfBase64: string) {
  const orch = ctx.job.orchestration as Orchestration | null;
  const prompt = buildPlanPrompt({
    language: ctx.job.language,
    sectionNames: ctx.job.section_names ?? [],
    // Page mode: the attached PDF is only the key pages, and the model is told so.
    window:
      shard.pages && orch?.pageCount
        ? { from: shard.pages.from, to: shard.pages.ctxTo, total: orch.pageCount }
        : null,
  });
  if (shard.engine !== "background") {
    await runPlan(ctx, shard, prompt, pdfBase64);
    return;
  }
  let started = await startBackgroundShard(ctx, prompt, pdfBase64, shard.slot, { thinkingLevel: "low" });
  if (started.error && /thinking/i.test(started.error)) {
    // The API did not take the field (an older model revision, a renamed key).
    // Low thinking is a speed-up, not a requirement: start without it.
    console.warn(`[ai-pdf-import] index pass: thinking_level refused (${started.error}); retrying with the default`);
    started = await startBackgroundShard(ctx, prompt, pdfBase64, shard.slot);
  }
  const { interactionId, slot, error } = started;
  if (error || !interactionId) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", error ?? "Gemini did not start the index pass.");
    return;
  }
  const { error: markErr } = await ctx.service.rpc("ai_import_mark_shard_running", {
    p_job: ctx.job.id,
    p_index: shard.i,
    p_interaction: interactionId,
    p_slot: slot ?? shard.slot,
    p_deadline: planDeadline("background"),
  });
  if (markErr) {
    console.error(`[ai-pdf-import] could not record the index pass interaction ${interactionId}: ${markErr.message}`);
    await recordShard(
      ctx.service,
      ctx.job.id,
      shard,
      null,
      "failed",
      "The import could not record the index pass. Ask the MockSetu admin to check that migration 20260916000000 is applied."
    );
  }
}

// ─── Extraction workers ──────────────────────────────────────────────────────

function promptForShard(ctx: TickContext, orch: Orchestration, shard: ShardState): string {
  if (shard.whole) {
    return buildWholePaperPrompt({
      language: ctx.job.language,
      sectionNames: ctx.job.section_names ?? [],
    });
  }
  if (shard.pages && orch.pageCount) {
    return buildPageShardPrompt({
      language: ctx.job.language,
      sectionNames: ctx.job.section_names ?? [],
      pages: { from: shard.pages.from, to: shard.pages.to, ctxTo: shard.pages.ctxTo, total: orch.pageCount },
      answerKeyJson: orch.plan?.answerKey ? JSON.stringify(orch.plan.answerKey, null, 2) : null,
      sectionRanges: orch.plan?.sections?.length
        ? orch.plan.sections.map((s) => ({
            name: s.name,
            from: s.from,
            to: s.to,
            firstPage: s.firstPage ?? null,
            lastPage: s.lastPage ?? null,
          }))
        : null,
      // Which pages the index pass read — the section list above is only as
      // complete as those pages.
      indexedPages: orch.planShard?.pages
        ? { from: orch.planShard.pages.from, to: orch.planShard.pages.ctxTo }
        : null,
      totalQuestions: orch.plan?.totalQuestions ?? null,
      shardIndex: shard.i,
      shardCount: Math.max(1, orch.shards.length),
    });
  }
  return buildShardPrompt({
    language: ctx.job.language,
    sectionNames: ctx.job.section_names ?? [],
    slices: shard.slices,
    answerKeyJson: orch.plan?.answerKey ? JSON.stringify(orch.plan.answerKey, null, 2) : null,
    totalQuestions: orch.plan?.totalQuestions ?? null,
    shardIndex: shard.i,
    shardCount: Math.max(1, orch.shards.length),
  });
}

/**
 * Start a background worker on Gemini's side. Returns the interaction id and the
 * slot that accepted it, or an error sentence.
 *
 * Opening may walk the chain (a refusal at the door is cheap to route around);
 * what comes back is the slot that ACTUALLY holds the interaction, and that is
 * the slot the caller must record, because Gemini will show the interaction to
 * no other key. Polling, later, is pinned to it.
 */
async function startBackgroundShard(
  ctx: TickContext,
  prompt: string,
  pdfBase64: string,
  slot: KeySlot,
  opts: { thinkingLevel?: "minimal" | "low" | "medium" | "high" } = {}
): Promise<{ interactionId?: string; slot: KeySlot; error?: string }> {
  const body = interactionBody(ctx.model, prompt, pdfBase64);
  // Gemini 3.x takes `thinking_level` (minimal | low | medium | high, default
  // medium). Only the index pass asks for less: it transcribes, it does not
  // reason, and on a 60-page paper the default level was still thinking when
  // its five minutes ran out. Extraction workers keep the default — thinking
  // budget 0 left 42 of 100 questions as placeholders in the 2.5 Flash checks.
  if (opts.thinkingLevel) body.generation_config.thinking_level = opts.thinkingLevel;
  const { ok, res, slot: served, tried, error } = await gemini(
    "/interactions",
    { method: "POST", body },
    slot,
    true,
    60_000
  );
  if (!ok || !res) {
    return { slot: served, error: geminiErrorMessage(error ?? { status: 500, message: "", reason: "" }, tried) };
  }
  const created = await res.json();
  if (!created?.id) return { slot: served, error: "Gemini did not return a job id." };
  return { interactionId: String(created.id), slot: served };
}

/** Run a live worker to completion and record whatever it produced. */
async function runLiveShard(ctx: TickContext, shard: ShardState, prompt: string, pdfBase64: string) {
  const model = shard.model ?? ctx.model;
  const out = await callLive(model, prompt, pdfBase64, shard.slot, LIVE_CALL_MS());
  if (out.slot !== shard.slot) {
    console.warn(`[ai-pdf-import] part ${shard.i} opened on ${shard.slot} but was served by ${out.slot}`);
  }
  if (out.error || !out.text) {
    const reason = out.error === CUT_OFF_MESSAGE && shard.whole ? WHOLE_CUT_OFF_MESSAGE : out.error;
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", `${reason ?? "Gemini returned nothing."} [${model}]`);
    return;
  }
  const obj = extractDelimitedJson(out.text, JSON_START, JSON_END);
  if (!obj) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", "Gemini replied without a readable JSON block.");
    return;
  }
  await recordShard(ctx.service, ctx.job.id, shard, obj, "done", null);
}

// ─── The tick ────────────────────────────────────────────────────────────────

/**
 * How long one attempt of this worker may run before it is written off.
 *
 * A slice gets a slice's budget. The whole-paper fallback gets the SINGLE
 * PASS's budget, because it is the single pass: a 27-page paper took 126 s on
 * 3.5 Flash and a 55-page one was seen finishing after 21 minutes. Handing that
 * a four-minute slice deadline meant reaping it, relaunching it on the next
 * key, paying for it three times over and failing anyway — the path that
 * exists to make the import work no matter what was the one path that could
 * not. The live engine is bounded by the platform's wall clock whatever the
 * paper's size, so its budget is the same either way.
 */
function shardBudgetMs(shard: Pick<ShardState, "engine" | "whole">): number {
  if (shard.engine !== "background") return LIVE_CALL_MS() + 12_000;
  return shard.whole ? BACKGROUND_STALE_MS : BG_SHARD_MS();
}

function shardDeadline(shard: Pick<ShardState, "engine" | "whole">): string {
  return new Date(Date.now() + shardBudgetMs(shard)).toISOString();
}

/**
 * Build the extraction workers once the index pass has landed.
 *
 * The number of workers is the smaller of "one per TARGET_PER_SHARD questions"
 * and MAX_SHARDS, and each one opens on a different key. With four keys
 * configured that is four accounts carrying a quarter of the paper each, which
 * is both faster and much further from the free tier's per-project quota than
 * one key carrying all of it.
 */
function buildShards(orch: Orchestration, plan: ParsedPlan, engine: "background" | "live"): ShardState[] {
  const wanted = shardCountFor(plan.totalQuestions, TARGET_PER_SHARD(), MAX_SHARDS());
  const groups = planShards(plan, wanted);
  return groups.map((slices, i) => ({
    i,
    slices,
    status: "queued" as const,
    engine,
    slot: slotAt(orch.keyOffset + i),
    attempt: 0,
  }));
}

/**
 * Page-mode workers: one per run of pages, cut from the PDF on later ticks.
 *
 * This needs NO plan. Question-number slicing had to know where the questions
 * were before it could split, and on a long paper the pass that found out ran
 * out of time — twice — and the whole job fell back to one call that could
 * not finish either. Pages are known from the PDF itself. When the index pass
 * did land, it improves the split (no chunks made only of key pages) and the
 * result (the key and the section ranges go to every worker); when it did not,
 * the paper still imports, without answers, and says so.
 */
function buildPageShards(orch: Orchestration, engine: "background" | "live", plan: ParsedPlan | null): ShardState[] {
  const pages = orch.pageCount ?? 0;
  const lastQuestionPage = plan?.sections?.length
    ? plan.sections.reduce<number | null>((acc, s) => {
        const lp = s.lastPage ?? null;
        return lp && (acc === null || lp > acc) ? lp : acc;
      }, null)
    : null;
  const chunks = planPageChunks(pages, TARGET_PAGES(), MAX_SHARDS(), lastQuestionPage);
  // Open on a model that is answering right now, on a key that has it. The
  // best evidence is the job's own: if the index pass had to leave the
  // requested model and succeeded elsewhere, that is where the workers start.
  // (The isolate-level "slow" memory does not survive the hop between the
  // request that saw the stall and the one that builds the workers.)
  const proven = orch.planShard?.status === "done" ? orch.planShard.model ?? null : null;
  const requested = proven ?? orch.shards.find((s) => s.model)?.model ?? null;
  return chunks.map((chunk, i) => {
    const model = startingModel(requested ?? ORCH_DEFAULT_MODEL.get(orch) ?? "gemini-3.5-flash");
    const override = model !== (ORCH_DEFAULT_MODEL.get(orch) ?? model) ? model : null;
    return {
      i,
      slices: [],
      pages: chunk,
      status: "queued" as const,
      engine: override ? ("live" as const) : engine,
      slot: slotForModel(model, orch.keyOffset + i),
      attempt: 0,
      model: override,
    };
  });
}

/** The job's requested model, remembered per orchestration object so builders can tell an override from the default. */
const ORCH_DEFAULT_MODEL = new WeakMap<Orchestration, string>();

/** The single whole-paper worker: what runs when the split is declined or the index pass gives up. */
function wholePaperShard(orch: Orchestration, engine: "background" | "live"): ShardState[] {
  return [
    {
      i: 0,
      slices: [],
      status: "queued",
      engine,
      slot: slotAt(orch.keyOffset),
      attempt: 0,
      whole: true,
    },
  ];
}

/**
 * Give up on the split: one worker, the whole paper — exactly what shipped
 * before parallel import existed.
 *
 * The job's deadline is re-armed from THIS moment with the single pass's
 * budget. It was sized for an index pass plus parallel slices; a whole paper in
 * one stream is a different job, and launching it into whatever was left of the
 * split's eight minutes was a guaranteed "ran out of time".
 */
function fallBackToWholePaper(next: Orchestration, engine: "background" | "live", why: string) {
  next.phase = "extracting";
  next.shards = wholePaperShard(next, engine);
  next.note = `single pass (${why})`;
  next.deadlineAt = new Date(Date.now() + shardBudgetMs(next.shards[0]) + 60_000).toISOString();
}

export function newOrchestration(): Orchestration {
  return {
    v: ORCH_VERSION,
    phase: "planning",
    deadlineAt: new Date(Date.now() + JOB_DEADLINE_MS()).toISOString(),
    leaseUntil: null,
    // Where in the key chain this job opens: one step on from the previous
    // job, over the keys that are not resting. Counting, not random — random
    // spread load on average and put two consecutive imports on the same key
    // often enough to be noticed.
    keyOffset: nextJobOffset(),
    plan: null,
    planShard: null,
    shards: [],
  };
}

/** Kick off the index pass. Called from `start`, in the request that created the job. */
export async function beginJob(ctx: TickContext, orch: Orchestration, pdfBase64: string, sharded: boolean) {
  ORCH_DEFAULT_MODEL.set(orch, ctx.model);
  if (!sharded) {
    orch.phase = "extracting";
    const shards = wholePaperShard(orch, ctx.engine);
    shards[0].status = "running";
    shards[0].startedAt = isoNow();
    shards[0].deadlineAt = shardDeadline(shards[0]);
    orch.deadlineAt = new Date(Date.now() + shardBudgetMs(shards[0]) + 60_000).toISOString();
    orch.shards = shards;
    orch.note = "single pass";
    await patchJob(ctx.service, ctx.job.id, {
      status: "running",
      api_key_slot: asKeySlot(shards[0].slot),
      orchestration: orch,
    });
    background(launchShards({ ...ctx, job: { ...ctx.job, orchestration: orch } }, orch, shards, pdfBase64));
    return;
  }
  // A model that stalled in the last ten minutes is not where a new job opens.
  const planModel = startingModel(ctx.model);
  const planShard: ShardState = {
    i: -1,
    slices: [],
    status: "running",
    // The same engine as the workers: background where the model allows it,
    // so a long paper's index pass is not raced against the wall clock.
    engine: planModel === ctx.model ? ctx.engine : "live",
    slot: slotForModel(planModel, orch.keyOffset),
    attempt: 1,
    startedAt: isoNow(),
    deadlineAt: planDeadline(planModel === ctx.model ? ctx.engine : "live"),
    model: planModel === ctx.model ? null : planModel,
    // Page mode: read only the last pages, where the key is printed. A whole
    // 25-page image-heavy paper took longer to read than one live call allows.
    pages: isPageMode(orch) ? keyWindow(orch.pageCount!, "tail") : null,
  };
  orch.planShard = planShard;
  let planPdf = pdfBase64;
  if (planShard.pages) {
    const made = await materialiseChunk({ ...ctx, job: { ...ctx.job, orchestration: orch } }, planShard.pages);
    if ("error" in made) {
      // Cutting failed: the index pass reads the whole PDF, as it did before.
      console.warn("[ai-pdf-import] index pass falls back to the whole PDF:", made.error);
      planShard.pages = null;
    } else {
      planShard.pages.path = made.path;
      planPdf = made.base64;
    }
  }
  await patchJob(ctx.service, ctx.job.id, {
    status: "running",
    api_key_slot: planShard.slot,
    orchestration: orch,
  });
  background(launchPlan({ ...ctx, job: { ...ctx.job, orchestration: orch } }, planShard, planPdf));
}

/**
 * Launch the given workers, as far as the memory budget allows in one
 * invocation. Whatever does not fit is left for the next tick four seconds
 * later — a few seconds of latency being a much better trade than a worker
 * killed for memory halfway through starting.
 *
 * `orch` is the WHOLE plan even when only some of its workers are being
 * launched: the prompt tells each worker it is "part i of n", and a worker told
 * it is part 1 of 2 when it is really part 1 of 4 would believe half the paper
 * was its responsibility.
 */
async function launchShards(
  ctx: TickContext,
  orch: Orchestration,
  shards: ShardState[],
  pdfBase64: string,
  /** Page mode: each worker's own chunk, by worker index. Absent → the whole PDF. */
  payloads?: Map<number, string>
) {
  const allowed = payloads ? shards.length : Math.max(1, Math.floor(LAUNCH_BUDGET_BYTES() / Math.max(1, pdfBase64.length)));
  const batch = shards.slice(0, allowed);
  if (!batch.length) return;

  await Promise.all(
    batch.map(async (shard) => {
      const prompt = promptForShard(ctx, orch, shard);
      const pdf = payloads?.get(shard.i) ?? pdfBase64;
      if (shard.engine === "live") {
        await runLiveShard(ctx, shard, prompt, pdf);
        return;
      }
      const { interactionId, slot, error } = await startBackgroundShard(ctx, prompt, pdf, shard.slot);
      if (error || !interactionId) {
        await recordShard(ctx.service, ctx.job.id, shard, null, "failed", error ?? "Gemini did not start the job.");
        return;
      }
      // A started background worker has to be remembered immediately: its
      // interaction id is the only handle on work that is now running and being
      // billed, and losing it would leave the job polling nothing. The slot
      // written is the one that ACCEPTED the interaction — the start may have
      // walked past a resting key — because only that key can poll it.
      const { error: markErr } = await ctx.service.rpc("ai_import_mark_shard_running", {
        p_job: ctx.job.id,
        p_index: shard.i,
        p_interaction: interactionId,
        p_slot: slot ?? shard.slot,
        p_deadline: shardDeadline(shard),
      });
      if (markErr) {
        console.error(
          `[ai-pdf-import] could not record interaction ${interactionId} for part ${shard.i}: ${markErr.message}`
        );
        await recordShard(
          ctx.service,
          ctx.job.id,
          shard,
          null,
          "failed",
          "The import could not record this part. Ask the MockSetu admin to check that migration 20260916000000 is applied."
        );
      }
    })
  );
}

/** Poll one background worker. Returns true when the job row changed. */
async function pollBackgroundShard(ctx: TickContext, shard: ShardState): Promise<boolean> {
  if (!shard.interactionId) return false;
  if (!keyFor(shard.slot)) {
    await recordShard(ctx.service, ctx.job.id, shard, null, "failed", "The Gemini key that started this slice is no longer configured.");
    return true;
  }
  const { ok, res, error, variant } = await gemini(`/interactions/${shard.interactionId}`, {}, shard.slot, false, 25_000);
  if (!ok || !res) {
    // A transient poll failure is not a failed worker — only a 404 means Gemini
    // has genuinely lost it. Everything else is left to the deadline — but
    // REMEMBERED, because a poll that fails every time (a 429 on this key, say)
    // looks exactly like a worker that never finishes, and the row has to be
    // able to tell the two apart.
    if (error?.status === 404) {
      await recordShard(ctx.service, ctx.job.id, shard, null, "failed", "Gemini lost this slice.");
      return true;
    }
    return await noteObserved(
      ctx,
      shard,
      "poll failed",
      `HTTP ${error?.status ?? "?"}${error?.reason ? " " + error.reason : ""}${error?.message ? ": " + error.message.slice(0, 700) : ""}`
    );
  }
  const interaction = await res.json();
  const st = String(interaction?.status ?? "");
  if (st === "in_progress" || st === "queued" || st === "requires_action") {
    // The GET shape is recorded alongside so a row shows which request Gemini
    // accepted after refusing the documented one.
    return await noteObserved(ctx, shard, st, variant ? `poll shape ${variant}` : undefined);
  }
  if (st === "completed") {
    const text = interactionText(interaction);
    // Index -1 is the index pass: a PLAN block, not a paper.
    if (shard.i < 0) {
      await recordPlanText(ctx, shard, text);
      return true;
    }
    const obj = extractDelimitedJson(text, JSON_START, JSON_END);
    if (!obj) {
      await recordShard(ctx.service, ctx.job.id, shard, null, "failed", "Gemini replied without a readable JSON block.");
      return true;
    }
    await recordShard(ctx.service, ctx.job.id, shard, obj, "done", null);
    return true;
  }
  const why =
    st === "incomplete" || st === "budget_exceeded"
      ? shard.whole
        ? WHOLE_CUT_OFF_MESSAGE
        : CUT_OFF_MESSAGE
      : `Gemini stopped with status "${st || "unknown"}".`;
  await recordShard(ctx.service, ctx.job.id, shard, null, "failed", why);
  return true;
}

export type TickOutcome = { changed: boolean; finished: boolean };

/**
 * One scheduler tick. Everything that changes the plan happens under a lease,
 * so two overlapping polls cannot launch the same worker twice; everything that
 * only observes Gemini happens outside it, so a held lease never stops a
 * finished worker from being noticed.
 */
export async function tick(ctx: TickContext): Promise<TickOutcome> {
  const orch = ctx.job.orchestration as Orchestration | null;
  if (!orch || orch.v !== ORCH_VERSION) return { changed: false, finished: false };
  ORCH_DEFAULT_MODEL.set(orch, ctx.model);

  // 1. The hard deadline, before anything else. This is the backstop that makes
  //    "it ran for thirty minutes and was still running" impossible.
  //
  //    RUNNING OUT OF TIME IS NOT A REASON TO THROW THE PAPER AWAY. Three of
  //    four workers finishing is three quarters of a paper the creator can
  //    import and finish by hand, and it is already sitting in shard_results.
  //    Failing the job outright here would strand it: publicJob only ships
  //    rawOutput on a completed job, a failed job is never resumed, and no
  //    other code path can reach those rows again. So the deadline writes off
  //    whatever is still in flight and hands the rest to the SAME merge a clean
  //    finish uses — which already names the missing question numbers in
  //    needs_manual_review. Only a job with nothing at all to show fails.
  if (Date.now() > ms(orch.deadlineAt)) {
    const salvage: Orchestration = JSON.parse(JSON.stringify(orch));
    for (const shard of salvage.shards) {
      if (shard.status !== "done") {
        shard.status = "failed";
        shard.error = shard.error ?? "That part ran out of time.";
      }
    }
    if (salvage.shards.some((s) => s.status === "done")) {
      salvage.phase = "merging";
      salvage.leaseUntil = new Date(Date.now() + 60_000).toISOString();
      if (await casOrchestration(ctx.service, ctx.job, salvage)) return await finish(ctx, salvage);
      return { changed: true, finished: false };
    }
    await patchJob(ctx.service, ctx.job.id, {
      status: "failed",
      error: "The import ran out of time before Gemini produced anything. Retry, or try the other model.",
      completed_at: isoNow(),
    });
    return { changed: true, finished: true };
  }

  // 2. Observe. Polling is idempotent, so it runs whether or not this tick
  //    holds the lease, and a worker that finished is recorded by the atomic
  //    RPC rather than by rewriting the plan from memory.
  let changed = false;
  {
    // Whatever is running on Gemini's side right now: the workers while
    // extracting, or the index pass while planning (when it is a background
    // interaction — a live index pass records itself when its call returns).
    const planShard = orch.planShard;
    const inFlight: ShardState[] =
      orch.phase === "extracting"
        ? orch.shards.filter((s) => s.status === "running" && s.engine === "background")
        : orch.phase === "planning" &&
            planShard?.status === "running" &&
            planShard.engine === "background" &&
            planShard.interactionId
          ? [planShard]
          : [];
    if (inFlight.length) {
      // Only the worker whose polling slot the clock is currently in. At most
      // one Gemini request per tick, whatever the paper's size, so a six-worker
      // job does not poll its way into the per-key rate limit it was split to
      // avoid. The floor of MIN_POLL_SLOTS matters for the one-worker case:
      // without it a single worker would be polled on every 4 s tick, which is
      // 15 requests a minute against a free-tier allowance nearer ten.
      const slots = Math.max(inFlight.length, MIN_POLL_SLOTS);
      const bucket = Math.floor(Date.now() / POLL_SLOT_MS) % slots;
      if (bucket < inFlight.length) {
        changed = await pollBackgroundShard(ctx, inFlight[bucket]);
        if (changed) return { changed: true, finished: false }; // re-read on the next tick
      }
    }
  }

  // 3. Decide. One tick at a time.
  const leaseHeld = ms(orch.leaseUntil) > Date.now();
  if (leaseHeld) return { changed, finished: false };

  const next: Orchestration = JSON.parse(JSON.stringify(orch));
  ORCH_DEFAULT_MODEL.set(next, ctx.model);
  next.leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();

  // A merge that was interrupted — the worker died, the platform recycled it —
  // is simply redone. Every worker's output is still in shard_results, so this
  // costs one database read and no Gemini call at all.
  if (next.phase === "merging") {
    next.leaseUntil = new Date(Date.now() + 60_000).toISOString();
    if (await casOrchestration(ctx.service, ctx.job, next)) return await finish(ctx, next);
    return { changed: true, finished: false };
  }

  const planShard = next.planShard;

  if (next.phase === "planning" && planShard) {
    if (planShard.status === "done") {
      // The index pass landed but its result has not been lifted into the plan
      // yet (adoptPlanIfReady lost a race). Wait a tick rather than treating a
      // finished pass as a missing one and paying for it twice.
      if (!next.plan) return { changed, finished: false };
      next.phase = "extracting";
      if (isPageMode(next)) {
        next.shards = buildPageShards(next, ctx.engine, next.plan);
        next.note = `${next.shards.length} parts by page · ${next.plan.totalQuestions} questions · key ${next.plan.answerKey?.found ? "found" : "not found"}`;
      } else {
        next.shards = buildShards(next, next.plan, ctx.engine);
        next.note = `${next.shards.length} parts · ${next.plan.totalQuestions} questions`;
      }
    } else if (planShard.status === "failed" || Date.now() > ms(planShard.deadlineAt)) {
      const timedOut = planShard.status !== "failed";
      if (timedOut && extendIfProgressing(planShard, planShard.engine === "background" ? BG_SHARD_MS() : PLAN_CALL_MS())) {
        // Gemini says it is still working on it. Leave it be — once.
        await casOrchestration(ctx.service, ctx.job, next);
        return { changed: true, finished: false };
      }
      const lastOutcome = planShard.error ?? (timedOut ? "ran past its deadline" : "failed");
      endAttempt(planShard, lastOutcome);
      if (planShard.attempt < PLAN_ATTEMPTS()) {
        // Retry the index pass on the next key — and on the OTHER model when
        // this one did not answer, since the key was not what stalled.
        planShard.attempt += 1;
        planShard.model = modelForRetry(planShard.model ?? ctx.model, lastOutcome);
        planShard.slot = slotForModel(planShard.model, next.keyOffset + planShard.attempt);
        planShard.engine = planShard.model !== ctx.model ? "live" : (planShard.engine ?? ctx.engine);
        if (planShard.model === ctx.model) planShard.model = null;
        planShard.status = "running";
        planShard.error = null;
        planShard.interactionId = null;
        planShard.startedAt = isoNow();
        planShard.deadlineAt = planDeadline(planShard.engine);
        let pdf: string;
        if (isPageMode(next)) {
          // The key pages held no key → read the FRONT of the paper. Anything
          // else (timeout, 503) → the same tail window on another key.
          const which = lastOutcome.includes(NO_KEY_ON_TAIL) ? "head" : "tail";
          planShard.pages = keyWindow(next.pageCount!, which);
          const made = await materialiseChunk({ ...ctx, job: { ...ctx.job, orchestration: next } }, planShard.pages);
          if ("error" in made) {
            planShard.pages = null;
            pdf = await ctx.pdf();
          } else {
            planShard.pages.path = made.path;
            pdf = made.base64;
          }
        } else {
          pdf = await ctx.pdf();
        }
        if (await casOrchestration(ctx.service, ctx.job, next)) {
          background(launchPlan({ ...ctx, job: { ...ctx.job, orchestration: next } }, planShard, pdf));
        }
        return { changed: true, finished: false };
      }
      planShard.status = "failed";
      planShard.error = planShard.error ?? "ran past its deadline";
      if (isPageMode(next)) {
        // No key, no ranges — but the pages are known from the PDF itself, so
        // the paper is still cut and imported. Without answers, and it says so.
        next.phase = "extracting";
        next.shards = buildPageShards(next, ctx.engine, null);
        next.note = `${next.shards.length} parts by page · no answer key found`;
      } else {
        // The index pass is an optimisation. When it cannot be had, fall back
        // to exactly what shipped before: one worker, the whole paper, one pass
        // — with the single pass's clock, not the split's leftovers.
        fallBackToWholePaper(next, ctx.engine, "index unavailable");
      }
    } else {
      return { changed, finished: false };
    }
  }

  if (next.phase === "extracting") {
    // Reap workers that ran past their deadline and put them back on another key.
    // Iterated over a copy: a cut-off worker adds a new worker to the plan
    // mid-loop, and the new one is queued, not failed, so it has nothing to do
    // here — but the loop's bounds should not depend on that.
    for (const shard of [...next.shards]) {
      if (shard.status === "running" && Date.now() > ms(shard.deadlineAt)) {
        // Still visibly working on Gemini's side? Once, let it finish.
        if (extendIfProgressing(shard, shardBudgetMs(shard))) continue;
        shard.status = "failed";
        shard.error = shard.error ?? "That part ran past its deadline.";
      }
      if (shard.status === "failed" && shard.attempt < MAX_ATTEMPTS()) {
        // Only retry if the retry can actually finish. One worker's budget is
        // MAX_ATTEMPTS x its own deadline — 12 minutes for a background worker
        // — which is longer than the job's whole deadline. Without this check a
        // job spends its last minute starting a worker that is guaranteed to be
        // cut off, pays Gemini for it, and arrives at the deadline with one
        // fewer finished part than it could have had. Out of time is out of
        // attempts: leave it failed and let the merge take what did land.
        const budget = shardBudgetMs(shard);
        if (ms(next.deadlineAt) - Date.now() < budget + 15_000) continue;
        const lastError = shard.error ?? "failed";
        endAttempt(shard, lastError);
        // A model that did not answer gets swapped for the other one; a key
        // that refused gets swapped below by the slot rotation.
        const nextModel = modelForRetry(shard.model ?? ctx.model, lastError);
        if (nextModel !== (shard.model ?? ctx.model)) {
          shard.model = nextModel === ctx.model ? null : nextModel;
          shard.engine = nextModel === ctx.model ? ctx.engine : "live";
        }
        // Google said "busy" or "not available": wait before the next try —
        // 20 s, 40 s, 60 s, then 90 s — bounded by what the job deadline allows.
        if (isModelStall(lastError) || /not available/i.test(lastError)) {
          const pause = Math.min(90_000, 20_000 * (shard.attempt + 1));
          const latest = ms(next.deadlineAt) - budget - 15_000;
          shard.notBefore = new Date(Math.min(Date.now() + pause, Math.max(Date.now(), latest))).toISOString();
        } else {
          shard.notBefore = null;
        }
        // A reply that was CUT OFF is not the key's fault and not the network's:
        // the slice is too long for one reply, and the same slice on another key
        // is cut at the same place. So the slice is halved instead — this worker
        // keeps the first half and a new worker takes the second. The merge
        // reads every worker's slices, so nothing downstream has to know; the
        // whole-paper fallback has no slices to halve and is left to its message.
        if (!shard.whole && isCutOff(shard.error)) {
          if (shard.pages) {
            // Page mode: halve the PAGES. Both halves are cut afresh on later ticks.
            const halves = splitPageChunk(shard.pages, next.pageCount ?? shard.pages.ctxTo);
            if (halves) {
              const [head, tail] = halves;
              const j = next.shards.length;
              shard.pages = head;
              // The second half inherits the model the first half is moving
              // to: a split caused by a stall would otherwise open its new
              // worker on the very model that stalled.
              next.shards.push({
                i: j,
                slices: [],
                pages: tail,
                status: "queued",
                engine: shard.engine,
                slot: slotForModel(shard.model ?? ctx.model, next.keyOffset + j),
                attempt: 0,
                model: shard.model ?? null,
              });
              next.note = `${next.shards.length} parts by page (a long part was split)`;
            }
          } else {
            const halves = splitSlices(shard.slices);
            if (halves) {
              const [head, tail] = halves;
              const j = next.shards.length;
              shard.slices = head;
              next.shards.push({
                i: j,
                slices: tail,
                status: "queued",
                engine: shard.engine,
                slot: slotForModel(shard.model ?? ctx.model, next.keyOffset + j),
                attempt: 0,
                model: shard.model ?? null,
              });
              next.note = `${next.shards.length} parts · ${next.plan?.totalQuestions ?? "?"} questions (a long part was split)`;
            }
          }
        }
        shard.attempt += 1;
        shard.slot = slotAt(next.keyOffset + shard.i + shard.attempt);
        // …but never a key that cannot call this worker's model.
        shard.slot = slotForModel(shard.model ?? ctx.model, next.keyOffset + shard.i + shard.attempt);
        shard.status = "queued";
        shard.interactionId = null;
        shard.error = null;
        shard.startedAt = null;
        shard.deadlineAt = null;
      }
    }

    const queued = next.shards.filter((s) => s.status === "queued" && ms(s.notBefore) <= Date.now());
    if (queued.length) {
      // Only the workers this tick will actually launch are moved to running,
      // and that status is written BEFORE the launch, so a tick arriving four
      // seconds later cannot start the same worker twice.
      let pdf = "";
      let batch: ShardState[];
      let payloads: Map<number, string> | undefined;
      if (isPageMode(next)) {
        // One chunk cut per tick (CPU), read back when it was cut earlier.
        batch = queued.slice(0, CHUNKS_PER_TICK);
        payloads = new Map();
        for (const shard of batch) {
          if (!shard.pages) continue;
          try {
            if (!shard.pages.path) {
              const made = await materialiseChunk({ ...ctx, job: { ...ctx.job, orchestration: next } }, shard.pages);
              if ("error" in made) {
                shard.status = "failed";
                shard.error = made.error;
                continue;
              }
              shard.pages.path = made.path;
              payloads.set(shard.i, made.base64);
            } else {
              payloads.set(shard.i, await chunkBase64(ctx, shard.pages.path));
            }
          } catch (e) {
            shard.status = "failed";
            shard.error = e instanceof Error ? e.message : String(e);
          }
        }
        batch = batch.filter((s) => s.status === "queued");
      } else {
        // The PDF is loaded before anything is marked running, because how many
        // workers can safely be started in one invocation depends on how big it
        // turned out to be.
        pdf = await ctx.pdf();
        const allowed = Math.max(1, Math.floor(LAUNCH_BUDGET_BYTES() / Math.max(1, pdf.length)));
        batch = queued.slice(0, allowed);
      }
      for (const shard of batch) {
        shard.status = "running";
        shard.startedAt = isoNow();
        shard.deadlineAt = shardDeadline(shard);
      }
      if (await casOrchestration(ctx.service, ctx.job, next, { api_key_slot: asKeySlot(batch[0]?.slot ?? next.shards[0]?.slot) })) {
        if (batch.length) background(launchShards({ ...ctx, job: { ...ctx.job, orchestration: next } }, next, batch, pdf, payloads));
      }
      return { changed: true, finished: false };
    }

    // A worker waiting out its pause is neither running nor finished; the job
    // is not terminal while one exists, and the plan must be written so the
    // pause (set above) survives to the next tick.
    const waiting = next.shards.some((s) => s.status === "queued");
    const terminal = !waiting && next.shards.every((s) => s.status === "done" || s.status === "failed");
    if (terminal) {
      next.phase = "merging";
      // The lease is EXTENDED across the merge, not released: merging writes
      // raw_output, and a second tick merging the same parts concurrently would
      // race to write the same paper twice. If this worker dies mid-merge the
      // lease expires and the next tick redoes it from shard_results, which is
      // still all there.
      next.leaseUntil = new Date(Date.now() + 60_000).toISOString();
      if (await casOrchestration(ctx.service, ctx.job, next)) {
        return await finish(ctx, next);
      }
      return { changed: true, finished: false };
    }
  }

  // Nothing to decide: workers are in flight and none of them has come back.
  // Writing the row anyway — every four seconds, for the length of the job —
  // would cost two queries a tick and keep bumping updated_at under the atomic
  // writers that use it to detect a lost race. The lease is only worth taking
  // when there is something to protect.
  const unchanged =
    JSON.stringify({ ...orch, leaseUntil: null }) === JSON.stringify({ ...next, leaseUntil: null });
  if (unchanged) return { changed, finished: false };

  await casOrchestration(ctx.service, ctx.job, next);
  return { changed: true, finished: false };
}

/**
 * All workers are terminal: assemble the paper and write it where the client
 * already looks for it.
 *
 * A partial result is still a result. A paper whose fourth worker never came
 * back is 75 questions the creator can import and finish by hand, and that is
 * strictly better than the old all-or-nothing failure — so the job completes,
 * and what is missing is recorded in needs_manual_review where the summary card
 * already shows it.
 */
async function finish(ctx: TickContext, orch: Orchestration): Promise<TickOutcome> {
  const { data, error } = await ctx.service
    .from("ai_import_jobs")
    .select("shard_results")
    .eq("id", ctx.job.id)
    .maybeSingle();
  if (error) {
    await patchJob(ctx.service, ctx.job.id, {
      status: "failed",
      error: "The import finished but its parts could not be read back.",
      completed_at: isoNow(),
    });
    return { changed: true, finished: true };
  }

  const box = (data?.shard_results ?? {}) as Record<string, Json>;
  // EVERY worker is handed to the merge, including ones that came back with
  // nothing. A worker's slices are what it was ASKED for, and the merge reports
  // the difference between that and what arrived — so a part that failed
  // outright still names the exact question numbers the creator has to add by
  // hand, instead of vanishing from the tally along with its output.
  const results: ShardResult[] = orch.shards.map((shard) => {
    const obj = box[String(shard.i)];
    const value = obj && typeof obj === "object" ? obj : null;
    // A page-mode worker was asked for PAPER page numbers; one that answered
    // with chunk-relative ones is corrected so figures are cut from the right
    // page of the real PDF.
    if (value && shard.pages) fixChunkPageNumbers(value, shard.pages);
    return { slices: shard.slices, obj: value };
  });
  // Page-mode workers own pages, not numbers, so the gap report — "asked for
  // and never arrived" — is measured against the ranges the index pass read
  // off the key, attached to the first worker for the accounting.
  if (isPageMode(orch) && orch.plan?.sections?.length && results.length) {
    results[0].slices = orch.plan.sections.map((s) => ({ section: s.name, from: s.from, to: s.to }));
  }

  if (!results.some((r) => r.obj)) {
    const why = orch.shards.find((s) => s.error)?.error ?? "Gemini did not return anything usable.";
    await patchJob(ctx.service, ctx.job.id, { status: "failed", error: why, completed_at: isoNow() });
    return { changed: true, finished: true };
  }

  const modelsUsed = Array.from(
    new Set(orch.shards.filter((s) => s.status === "done").map((s) => s.model ?? ctx.model))
  );
  const { merged, stats } = mergeShards({
    language: ctx.job.language,
    plan: orch.plan ?? null,
    shards: results,
    sectionNames: Array.isArray(ctx.job.section_names) ? ctx.job.section_names : [],
    model: modelsUsed.length ? modelsUsed.join(" + ") : ctx.model,
    pdfName: ctx.job.pdf_name ?? null,
    promptVersion: ctx.job.prompt_version ?? "1.0",
  });

  const lost = orch.shards.filter((s) => s.status === "failed");
  if (lost.length) {
    merged._extraction_summary.needs_manual_review.push({
      section: merged.sections[0]?.name ?? "",
      q_no: merged.sections[0]?.questions?.[0]?.q_no ?? 1,
      reason: `import — ${lost.length} of ${orch.shards.length} parts did not come back (${lost[0].error ?? "no reason given"}); those questions are missing and must be added by hand`,
    });
  }
  for (const gap of stats.missing.slice(0, 10)) {
    merged._extraction_summary.needs_manual_review.push({
      section: gap.section,
      q_no: gap.qNos[0],
      reason: `import — ${gap.qNos.length} question number(s) not returned: ${gap.qNos.slice(0, 20).join(", ")}${gap.qNos.length > 20 ? "…" : ""}`,
    });
  }

  if (!merged.sections.length) {
    await patchJob(ctx.service, ctx.job.id, {
      status: "failed",
      error: "Gemini returned no questions for this paper. Retry, or try the other model.",
      completed_at: isoNow(),
    });
    return { changed: true, finished: true };
  }

  const done: Orchestration = { ...orch, phase: "done", leaseUntil: null };
  await patchJob(ctx.service, ctx.job.id, {
    status: "completed",
    raw_output: toDelimited(merged),
    orchestration: done,
    completed_at: isoNow(),
    error: null,
    usage: {
      parts: orch.shards.length,
      parts_failed: lost.length,
      questions: stats.questions,
      answered: stats.answered,
      missing: stats.missingCount,
    },
  });
  return { changed: true, finished: true };
}

/**
 * Gemini's reply carries a plan when the index pass just landed, so a tick that
 * sees `planShard.status === "done"` needs the plan object too. It arrives in
 * shard_results under the key "-1"; this lifts it into the orchestration so
 * every later tick reads it from the small column.
 */
export async function adoptPlanIfReady(service: Client, job: Json): Promise<Json> {
  const orch = job.orchestration as Orchestration | null;
  if (!orch || orch.phase !== "planning" || orch.planShard?.status !== "done" || orch.plan) return job;
  const { data } = await service.from("ai_import_jobs").select("shard_results").eq("id", job.id).maybeSingle();
  const plan = (data?.shard_results ?? {})["-1"];
  if (!plan) return job;
  const next: Orchestration = { ...orch, plan };
  const { data: rows } = await service
    .from("ai_import_jobs")
    .update({ orchestration: next, updated_at: isoNow() })
    .eq("id", job.id)
    .eq("updated_at", job.updated_at)
    .select("updated_at");
  if (rows?.length) return { ...job, orchestration: next, updated_at: rows[0].updated_at };
  return job;
}
