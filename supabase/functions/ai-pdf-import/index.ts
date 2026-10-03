// supabase/functions/ai-pdf-import/index.ts
//
// "Import from PDF" — runs MockSetu's extraction prompt against a creator's PDF
// with the platform's Gemini key, and hands the raw reply back to the exam page,
// which parses and imports it with the same code path as a manual JSON upload.
//
// ─── SHAPE OF A JOB ──────────────────────────────────────────────────────────
// A full paper is too much for one Gemini call to emit quickly: the work is
// decode-bound — ~25k output tokens plus ~38k thinking tokens on a 100-question
// paper — and a model produces those one after another however fast the network
// is. So a job is split:
//
//   1. an INDEX pass reads the paper's shape and transcribes the answer key;
//   2. N extraction workers each emit their own range of printed question
//      numbers, in parallel, each on a different key in the chain;
//   3. the parts are merged, deterministically and server-side, back into the
//      single delimited JSON block the browser already knows how to import.
//
// Step 3 is the contract with the client and it has not changed: the exam page
// still receives one `rawOutput` string in the v1.0 schema and still parses it
// with parseExamJson. Nothing in the browser knows the split exists.
//
// The orchestration lives in orchestrator.ts; this file is the front door.
// When migration 20260916000000 has not been pasted yet, the columns that plan
// needs are missing and the import runs legacy.ts — the single pass that
// shipped before — so deploying this function is never a step that breaks a
// working feature.
//
// ─── WHY A JOB + POLL DESIGN ─────────────────────────────────────────────────
// Supabase Edge Functions must answer within 150 s and live at most 150 s
// (Free) / 400 s (paid) of wall clock, while a paper takes Gemini minutes. So
// `start` answers immediately and the dialog polls `status` every 4 s — and
// every one of those polls is a scheduler tick: it reaps finished workers,
// fails and relaunches ones past their deadline, starts what is queued, and
// merges when the last part lands. No cron, no queue service, no client change.
//
//   engine "background"  Gemini runs the worker on ITS side (Interactions API,
//                        background=true). Survives the tab closing, the
//                        function dying, everything.
//   engine "live"        For models that refuse background mode. The call runs
//                        inside a worker via EdgeRuntime.waitUntil, bounded by
//                        the wall clock — which a SLICE of a paper fits inside
//                        comfortably where a whole paper did not.
//
// ─── SECURITY — every action, in this order ──────────────────────────────────
//   1. a real signed-in user (the JWT is verified with auth.getUser, not just
//      accepted by the gateway — the anon key is also a valid JWT);
//   2. profiles.can_use_ai_import for that user (the admin grant);
//   3. the exam belongs to that user and is not published;
//   4. the PDF path sits under the user's own storage folder;
//   5. at most JOBS_PER_HOUR starts per user, and one running job per
//      exam+language unless the caller says `force`.
// The prompt is built HERE from the shared module — the client never supplies
// prompt text, so the function cannot be used as a general Gemini proxy.
//
// ─── KEYS ────────────────────────────────────────────────────────────────────
// GEMINI_API_KEY is primary; GEMINI_API_KEY_FALLBACK, GEMINI_API_KEY_FALLBACK2
// and GEMINI_API_KEY_FALLBACK3 are optional extras, and each is meant to be a
// SEPARATE Google project — four keys on one account share one quota and buy
// nothing. Work is spread across them from the start rather than piling onto
// the primary until it refuses: each job opens one key on from the previous
// job (round-robin), hands worker i the slot after worker i-1, and a retry
// moves on again. A key that refuses is REMEMBERED for as long as this isolate
// lives — a minute for a per-minute quota, hours for a daily one — and gets no
// new work while any other key is healthy, so the next job does not rediscover
// the same refusal. A call that meets a refusal at the door walks to the next
// key inside the same request instead of failing and waiting for a poll to
// relaunch it. See gemini.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { EXTRACTION_PROMPT_VERSION } from "../../../src/lib/extractionPrompt.js";
import { configuredSlotCount, currentGetVariant, keyHealth, modelHealth, nextJobOffset, slotAt } from "./gemini.ts";
import { buildWholePaperPrompt } from "./prompts.ts";
import {
  CONTROL_COLUMNS,
  MAX_CUT_BYTES,
  type TickContext,
  adoptPlanIfReady,
  beginJob,
  cleanupParts,
  modelChain,
  newOrchestration,
  progressLine,
  tick,
} from "./orchestrator.ts";
import { pdfPageCount } from "./pdf.ts";
import { BACKGROUND_STALE_MS, pollJob, runLiveJob, startBackgroundJob } from "./legacy.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/**
 * Which build is live.
 *
 * This exists because "is the new function actually deployed?" was, for a while,
 * unanswerable without starting a real import and watching the clock — and the
 * answer turned out to be no, three times running — and a fourth time on
 * 2026-09-23, when this check found the live build still predated it. It rides
 * on EVERY response this function writes, the 401 included, so one curl settles
 * it. The request has to get PAST THE GATEWAY first: config.toml sets
 * verify_jwt = true, so a request with no JWT is answered by the gateway with
 * its own 401 ({"code":"UNAUTHORIZED_NO_AUTH_HEADER"}) and never reaches this
 * code or this header. The project's anon key is a valid JWT:
 *
 *   curl -s -D - -o /dev/null -X POST \
 *     https://<project>.supabase.co/functions/v1/ai-pdf-import \
 *     -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" \
 *     -d '{}' | grep -i x-ai-import-version
 *
 * The function's own 401 ("sign_in_required") carrying the header is the proof.
 * Bump it whenever this function is changed in a way worth telling apart.
 */
const FUNCTION_VERSION = "2026-09-23.parallel-19-rotate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-ai-import-version",
  "x-ai-import-version": FUNCTION_VERSION,
};

type Engine = "background" | "live";

/**
 * Which engine 3.5 Flash runs on.
 *
 * It was "background" (Interactions API, background: true, polled by id) and
 * that worked — two jobs completed that way on 2026-09-17. On 2026-09-23 every
 * GET /interactions/{id} came back 400 ("Request contains an invalid argument"
 * or "API key not valid", alternating, on identical requests and on every key)
 * while the POST that created the interaction succeeded. Seven request shapes
 * were tried; all refused. Work finished on Google's side and nothing could
 * see it, so every attempt ran to its deadline and every import failed.
 *
 * generateContent never stopped working, so 3.5 Flash runs on it — the same
 * live engine 2.5 Flash uses — and the split is what makes that fit the
 * platform's wall clock: twelve-question slices instead of a whole paper. Set
 * AI_IMPORT_35_ENGINE=background to go back once Google's retrieve call works
 * again; the background code path is intact and the poll self-heals its
 * request shape.
 */
const ENGINE_35: Engine = Deno.env.get("AI_IMPORT_35_ENGINE") === "background" ? "background" : "live";

/** Models the UI may ask for. Anything else is refused before Gemini is called. */
const MODELS: Record<string, { engine: Engine }> = {
  "gemini-3.5-flash": { engine: ENGINE_35 },
  "gemini-2.5-flash": { engine: "live" },
};

const BUCKET = "exam-pdfs";
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const JOBS_PER_HOUR = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Json = any;
// deno-lint-ignore no-explicit-any
type Client = any;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

const isoNow = () => new Date().toISOString();

/** What the client sees. raw_output only rides along on a completed job. */
function publicJob(job: Json, includeOutput: boolean) {
  const created = new Date(job.created_at).getTime();
  const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  return {
    jobId: job.id,
    status: job.status,
    engine: job.engine,
    model: job.model,
    language: job.language,
    createdAt: job.created_at,
    completedAt: job.completed_at ?? null,
    elapsedMs: Math.max(0, end - created),
    storagePath: job.storage_path,
    pdfName: job.pdf_name ?? null,
    pdfUrl: job.pdf_url ?? null,
    error: job.error ?? null,
    // What actually ran, not what was asked for. A creator who picked the split
    // on a database that cannot plan one gets a single pass, and the dialog has
    // to be able to say so rather than show a progress story that is not true.
    mode: job.orchestration ? "parallel" : "single",
    // Why a single pass ran, when the split could not: the database error,
    // verbatim, so "chunking is not working" comes with its own diagnosis.
    splitBlockedBy: job.orchestration ? null : splitBlockedBy(),
    // Where the split is right now, in words: "indexing the paper · attempt 1
    // of 2 · key fallback3 · Gemini says in progress · 214s in". The creator
    // watching a seven-minute step deserves to know which part of it is slow.
    progress: job.orchestration && job.status === "running" ? progressLine(job.orchestration) : null,
    rawOutput: includeOutput && job.status === "completed" ? job.raw_output ?? null : undefined,
  };
}

// ─── Is the parallel path available on this database? ────────────────────────
//
// Migration 20260916000000 is pasted by hand, so "the columns are not there
// yet" is a normal state, not an error. It is probed once per worker and the
// answer is cached — a negative answer only briefly, because the whole point is
// that the import gets faster the moment the SQL lands without anyone having to
// redeploy the function.

let parallelCache: { value: boolean; at: number; reason: string | null } | null = null;
// A minute, not five: the fix for a broken database is a paste in the SQL
// editor, and the creator retrying right after it should see the split, not
// four more minutes of the slow path.
const PARALLEL_RECHECK_MS = 60 * 1000;

/**
 * Why the split is not running, in a sentence the creator sees.
 *
 * For eleven days every import on this project ran the single pass because the
 * two RPCs the split needs raised 22P02 on every call, and the only trace was a
 * console.warn in function logs nobody opens. The reason now rides on every
 * status reply and the dialog prints it next to "all in one go" — a degraded
 * path that says WHY it degraded is a bug report; one that does not is a week.
 */
function splitBlockedBy(): string | null {
  if (Deno.env.get("AI_IMPORT_PARALLEL") === "off") return "Split switched off by the admin (AI_IMPORT_PARALLEL=off).";
  return parallelCache && !parallelCache.value ? parallelCache.reason : null;
}

async function parallelAvailable(service: Client): Promise<boolean> {
  if (Deno.env.get("AI_IMPORT_PARALLEL") === "off") return false;
  const now = Date.now();
  if (parallelCache && (parallelCache.value || now - parallelCache.at < PARALLEL_RECHECK_MS)) {
    return parallelCache.value;
  }
  // Both halves of the migration are checked, because a database with the
  // columns but not the functions is the worst of the three states: planning
  // would start workers whose results nothing could record, and every job would
  // sit there until its deadline. The RPC probe names a job id that cannot
  // exist, so it matches no row and changes nothing — it only answers "does
  // this function exist".
  const probeJob = "00000000-0000-0000-0000-000000000000";
  const [columns, recorder, marker] = await Promise.all([
    service.from("ai_import_jobs").select("orchestration, shard_results").limit(1),
    service.rpc("ai_import_record_shard", {
      p_job: probeJob,
      p_index: 0,
      p_payload: null,
      p_status: "done",
      p_error: null,
      p_attempt: 0,
    }),
    service.rpc("ai_import_mark_shard_running", {
      p_job: probeJob,
      p_index: 0,
      p_interaction: "probe",
      p_slot: "primary",
      p_deadline: new Date().toISOString(),
    }),
  ]);
  const missing = columns.error ?? recorder.error ?? marker.error;
  const value = !missing;
  let reason: string | null = null;
  if (missing) {
    const where = columns.error ? "the plan columns" : recorder.error ? "ai_import_record_shard" : "ai_import_mark_shard_running";
    reason =
      `Split unavailable — migration 20260916000000 is not applied or is broken on this project ` +
      `(${where}: ${missing.message}). Re-paste it in the SQL editor; this is re-checked every minute.`;
    console.warn(`[ai-pdf-import] running single-pass imports: ${reason}`);
  }
  parallelCache = { value, at: now, reason };
  return value;
}

type PdfLoader = { bytes: () => Promise<Uint8Array>; base64: () => Promise<string> };

/** Downloads the PDF at most once per invocation; base64 is derived from the same bytes on demand. */
function pdfLoader(service: Client, storagePath: string, preloaded?: Uint8Array): PdfLoader {
  let bytes: Uint8Array | null = preloaded ?? null;
  let b64: string | null = null;
  const load = async () => {
    if (bytes) return bytes;
    const { data: file, error } = await service.storage.from(BUCKET).download(storagePath);
    if (error || !file) throw new Error("The uploaded PDF could not be read from storage.");
    bytes = new Uint8Array(await file.arrayBuffer());
    return bytes;
  };
  return {
    bytes: load,
    base64: async () => (b64 ??= encodeBase64(await load())),
  };
}

function tickContext(service: Client, job: Json, loader: PdfLoader): TickContext {
  return {
    service,
    job,
    pdf: loader.base64,
    pdfBytes: loader.bytes,
    bucket: BUCKET,
    engine: (MODELS[job.model]?.engine ?? job.engine ?? "live") as Engine,
    model: job.model,
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function handleStart(service: Client, userId: string, body: Json): Promise<Response> {
  const examId = String(body?.examId ?? "");
  const language = String(body?.language ?? "").trim().toLowerCase();
  const model = String(body?.model ?? "");
  const storagePath = String(body?.storagePath ?? "");
  const pdfName = body?.pdfName ? String(body.pdfName).slice(0, 200) : null;
  const force = body?.force === true;
  // How the creator asked for the paper to be read. Anything unrecognised means
  // "no preference" and takes the default, rather than refusing the import over
  // a spelling.
  const requestedMode = body?.mode === "single" ? "single" : body?.mode === "parallel" ? "parallel" : "auto";

  if (!UUID_RE.test(examId)) return fail(400, "bad_request", "Missing exam.");
  if (language !== "en" && language !== "hi") return fail(400, "bad_request", "Language must be en or hi.");
  const modelSpec = MODELS[model];
  if (!modelSpec) return fail(400, "bad_model", "That model is not available for import.");
  // The client uploads to `${user.id}/${examId}/…pdf`; anything else is refused
  // before Storage is touched, so a caller cannot make the platform read other
  // people's files.
  const pathOk =
    storagePath.startsWith(`${userId}/${examId}/`) &&
    /\.pdf$/i.test(storagePath) &&
    !storagePath.includes("..") &&
    storagePath.length < 400;
  if (!pathOk) return fail(400, "bad_request", "The uploaded PDF could not be found for this exam.");

  const { data: exam, error: examErr } = await service
    .from("exams")
    .select("id, user_id, is_published, supported_languages")
    .eq("id", examId)
    .maybeSingle();
  if (examErr) return fail(500, "db_error", examErr.message);
  if (!exam || exam.user_id !== userId) return fail(404, "not_found", "Exam not found.");
  if (exam.is_published) return fail(409, "published", "Unpublish the exam before importing questions.");
  const supported: string[] = Array.isArray(exam.supported_languages) && exam.supported_languages.length
    ? exam.supported_languages
    : ["en"];
  if (!supported.includes(language)) return fail(400, "bad_request", "This exam does not have that language.");

  // Probed once here rather than just before the insert, because the reuse
  // query below has to know whether `orchestration` is a column it may select.
  const canParallel = await parallelAvailable(service);

  // One running job per exam+language, unless the caller explicitly restarts.
  if (!force) {
    const { data: active } = await service
      .from("ai_import_jobs")
      .select(
        "id,status,engine,model,language,created_at,completed_at,storage_path,pdf_name,pdf_url,error" +
          (canParallel ? ",orchestration" : "")
      )
      .eq("exam_id", examId)
      .eq("language", language)
      .in("status", ["queued", "running"])
      .gte("created_at", new Date(Date.now() - BACKGROUND_STALE_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return json({ ...publicJob(active, false), reused: true });
  }

  const { count } = await service
    .from("ai_import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= JOBS_PER_HOUR) {
    return fail(429, "rate_limited", `You have started ${JOBS_PER_HOUR} imports in the last hour. Try again later.`);
  }

  // Section names come from the database, not the request: the prompt and the
  // client-side parse must see the same list, and the client reads the same rows.
  const { data: secRows, error: secErr } = await service
    .from("sections")
    .select("name, sort_order, language")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });
  if (secErr) return fail(500, "db_error", secErr.message);
  const sectionNames: string[] = (secRows ?? [])
    .filter((s: Json) => s.language === language)
    .map((s: Json) => String(s.name ?? "").trim())
    .filter(Boolean);

  const { data: file, error: dlErr } = await service.storage.from(BUCKET).download(storagePath);
  if (dlErr || !file) return fail(400, "pdf_missing", "The uploaded PDF could not be read. Upload it again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, "pdf_missing", "The uploaded PDF is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) return fail(413, "pdf_too_large", "PDF is over 40 MB. Split it or compress it first.");
  const pdfBase64 = encodeBase64(bytes);
  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(storagePath);

  // The split is used when the creator asked for it (or expressed no
  // preference) AND the database can plan one. "single" is honoured absolutely:
  // it is the escape hatch for a paper the split gets wrong, so it must never
  // quietly become a parallel run.
  const parallel = requestedMode !== "single" && canParallel;
  const row: Json = {
    user_id: userId,
    exam_id: examId,
    language,
    model,
    engine: modelSpec.engine,
    status: "queued",
    storage_path: storagePath,
    pdf_name: pdfName,
    pdf_url: pub?.publicUrl ?? null,
    section_names: sectionNames,
    prompt_version: EXTRACTION_PROMPT_VERSION,
  };
  const orchestration = parallel ? newOrchestration() : null;
  if (orchestration) row.orchestration = orchestration;

  let job: Json | null = null;
  {
    const { data, error } = await service.from("ai_import_jobs").insert(row).select(CONTROL_COLUMNS).single();
    if (error && orchestration) {
      // PostgREST can serve a stale column list for a while after a migration,
      // so "that column does not exist" here is a cache answer, not a verdict.
      // Drop the plan and run the single pass rather than refusing the import.
      console.warn("[ai-pdf-import] insert with orchestration failed, falling back:", error.message);
      parallelCache = {
        value: false,
        at: Date.now(),
        reason: `Split unavailable — the database refused the job's plan column (${error.message}). Re-checked every minute.`,
      };
      delete row.orchestration;
      const retry = await service.from("ai_import_jobs").insert(row).select("*").single();
      if (retry.error || !retry.data) {
        return fail(500, "db_error", retry.error?.message ?? "Could not record the job.");
      }
      job = retry.data;
    } else if (error || !data) {
      return fail(500, "db_error", error?.message ?? "Could not record the job.");
    } else {
      job = data;
    }
  }

  // ── The parallel path ──
  if (job.orchestration) {
    // Page mode: cut the PDF into page chunks so no call ever reads the whole
    // paper (pdf.ts). Needs the page count, which pdf-lib reads here — about
    // 0.7 s of CPU on a 2.4 MB paper. A PDF pdf-lib cannot read, or one too
    // big to hold twice in memory, runs as one PDF the way it did before.
    if (bytes.byteLength <= MAX_CUT_BYTES()) {
      const pageCount = await pdfPageCount(bytes);
      if (pageCount) {
        job.orchestration.pageCount = pageCount;
        job.orchestration.partsDir = `${userId}/${examId}/ai-import-parts/${job.id}`;
      }
    }
    const ctx = tickContext(service, job, pdfLoader(service, storagePath, bytes));
    await beginJob(ctx, job.orchestration, pdfBase64, true);
    return json({ ...publicJob({ ...job, status: "running" }, false), reused: false });
  }

  // ── The single pass ──
  const prompt = buildWholePaperPrompt({ language, sectionNames });
  if (modelSpec.engine === "background") {
    const error = await startBackgroundJob(service, job.id, model, prompt, pdfBase64);
    if (error) return fail(502, "gemini_error", error);
    return json({ ...publicJob({ ...job, status: "running" }, false), reused: false });
  }
  await service.from("ai_import_jobs").update({ status: "running", updated_at: isoNow() }).eq("id", job.id);
  const work = runLiveJob(service, job.id, model, prompt, pdfBase64, slotAt(nextJobOffset()));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(work);
  } else {
    // Local dev without background tasks: finish inline so the job still lands.
    await work;
  }
  return json({ ...publicJob({ ...job, status: "running" }, false), reused: false });
}

async function loadOwnJob(
  service: Client,
  userId: string,
  body: Json,
  columns: string
): Promise<{ job?: Json; res?: Response }> {
  const jobId = String(body?.jobId ?? "");
  if (!UUID_RE.test(jobId)) return { res: fail(400, "bad_request", "Missing job.") };
  const { data: job, error } = await service.from("ai_import_jobs").select(columns).eq("id", jobId).maybeSingle();
  if (error) return { res: fail(500, "db_error", error.message) };
  if (!job || job.user_id !== userId) return { res: fail(404, "not_found", "Import job not found.") };
  return { job };
}

/** A completed job's reply, fetched only when it is actually being sent. */
async function withOutput(service: Client, job: Json, includeOutput: boolean): Promise<Json> {
  if (!includeOutput || job.status !== "completed" || job.raw_output !== undefined) return job;
  const { data } = await service.from("ai_import_jobs").select("raw_output").eq("id", job.id).maybeSingle();
  return { ...job, raw_output: data?.raw_output ?? null };
}

async function handleStatus(service: Client, userId: string, body: Json): Promise<Response> {
  const parallel = await parallelAvailable(service);
  const columns = parallel ? CONTROL_COLUMNS : "*";
  const loaded = await loadOwnJob(service, userId, body, columns);
  if (loaded.res) return loaded.res;
  let job = loaded.job!;
  const includeOutput = body?.includeOutput !== false;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    if (job.orchestration) await cleanupParts(service, BUCKET, job);
    return json(publicJob(await withOutput(service, job, includeOutput), includeOutput));
  }

  // ── The parallel path: every poll is a scheduler tick ──
  if (job.orchestration) {
    job = await adoptPlanIfReady(service, job);
    const ctx = tickContext(service, job, pdfLoader(service, job.storage_path));
    const outcome = await tick(ctx);
    if (outcome.changed) {
      const { data: fresh } = await service
        .from("ai_import_jobs")
        .select(CONTROL_COLUMNS)
        .eq("id", job.id)
        .maybeSingle();
      if (fresh) job = fresh;
    }
    // The chunk PDFs have done their job once the paper is merged or given up on.
    if (outcome.finished && (job.status === "completed" || job.status === "failed")) {
      await cleanupParts(service, BUCKET, job);
    }
    return json(publicJob(await withOutput(service, job, includeOutput), includeOutput));
  }

  // ── The single pass ──
  const patch = await pollJob(service, job);
  if (patch) job = { ...job, ...patch };
  return json(publicJob(job, includeOutput));
}

async function handleCancel(service: Client, userId: string, body: Json): Promise<Response> {
  const parallel = await parallelAvailable(service);
  const { job, res } = await loadOwnJob(service, userId, body, "id,user_id,status" + (parallel ? ",orchestration" : ""));
  if (res) return res;
  if (job.orchestration) await cleanupParts(service, BUCKET, job);
  if (job.status === "queued" || job.status === "running") {
    // We do not ask Gemini to stop — a background interaction cannot be
    // reliably cancelled and a live one is already in flight. Marking the row
    // is what matters: it frees the exam+language slot for a fresh start, and
    // the scheduler only ever advances a job whose status is still running.
    await service
      .from("ai_import_jobs")
      .update({
        status: "cancelled",
        error: "Cancelled by the creator.",
        completed_at: isoNow(),
        updated_at: isoNow(),
      })
      .eq("id", job.id);
  }
  return json({
    jobId: job.id,
    status: job.status === "queued" || job.status === "running" ? "cancelled" : job.status,
  });
}

/**
 * What is live, in one call: the build, whether the split can run on this
 * database, which models are offered, and the state of the key chain. Behind
 * the same gate as every other action, because "why is my import slow" is
 * usually answered in here and a granted creator is who asks it.
 */
async function handleHealth(service: Client): Promise<Response> {
  const parallel = await parallelAvailable(service);
  return json({
    version: FUNCTION_VERSION,
    parallel,
    parallelReason: parallel ? null : splitBlockedBy(),
    models: Object.keys(MODELS),
    modelChain: modelChain(),
    modelHealth: modelHealth(),
    keys: keyHealth(),
    pollShape: currentGetVariant(),
  });
}

async function handleAck(service: Client, userId: string, body: Json): Promise<Response> {
  const parallel = await parallelAvailable(service);
  const { job, res } = await loadOwnJob(service, userId, body, "id,user_id" + (parallel ? ",orchestration" : ""));
  if (res) return res;
  if (job.orchestration) await cleanupParts(service, BUCKET, job);
  // The result has been imported: remember that, and drop the reply along with
  // the parts it was merged from — together they are the better part of a
  // megabyte, and the questions now live in parsed_questions.
  const patch: Json = { imported_at: isoNow(), raw_output: null, updated_at: isoNow() };
  if (await parallelAvailable(service)) patch.shard_results = null;
  const { error } = await service.from("ai_import_jobs").update(patch).eq("id", job.id);
  if (error) {
    delete patch.shard_results;
    await service.from("ai_import_jobs").update(patch).eq("id", job.id);
  }
  return json({ jobId: job.id, ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only.");

  try {
    // Legacy names first (what this project injects today), new-style key
    // names as fallback so a future switch to publishable/secret keys does
    // not silently break the function.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return fail(503, "not_configured", "The function is missing its Supabase keys. Redeploy it from the Supabase dashboard or CLI.");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail(401, "sign_in_required", "Sign in to import from PDF.");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !user) return fail(401, "sign_in_required", "Your session has expired. Sign in again.");

    const service = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profErr } = await service
      .from("profiles")
      .select("can_use_ai_import")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) {
      // Column missing = migration not applied. Say so instead of a bare 500.
      const msg = /can_use_ai_import|schema cache/i.test(profErr.message)
        ? "AI import is not set up on this project yet (migration 20260912000000 not applied)."
        : profErr.message;
      return fail(503, "not_configured", msg);
    }
    if (!profile || profile.can_use_ai_import !== true) {
      return fail(403, "not_enabled", "AI import is not enabled for this account.");
    }
    if (configuredSlotCount() === 0) {
      return fail(503, "not_configured", "No Gemini key is configured on this project.");
    }

    const body = await req.json().catch(() => null);
    switch (body?.action) {
      case "start":
        return await handleStart(service, user.id, body);
      case "status":
        return await handleStatus(service, user.id, body);
      case "cancel":
        return await handleCancel(service, user.id, body);
      case "ack":
        return await handleAck(service, user.id, body);
      case "health":
        return await handleHealth(service);
      default:
        return fail(400, "bad_request", "Unknown action.");
    }
  } catch (e) {
    console.error("[ai-pdf-import] unhandled:", e);
    return fail(500, "internal", e instanceof Error ? e.message : "Unexpected error.");
  }
});
