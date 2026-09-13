// supabase/functions/ai-pdf-import/index.ts
//
// "Import from PDF" — runs MockSetu's extraction prompt against a creator's PDF
// with the platform's Gemini key, and hands the raw reply back to the exam page,
// which parses and imports it with the same code path as a manual JSON upload.
//
// Why a job + poll design and not one long request: Supabase Edge Functions
// must answer within 150 s and live at most 150 s (Free) / 400 s (paid) of wall
// clock, while a full paper takes Gemini 1–5 minutes. So:
//
//   engine "background"  Gemini runs the job on ITS side (Interactions API,
//                        background=true). `start` returns in ~3 s with an
//                        interaction id; `status` polls it. Survives the tab
//                        closing, the function dying, everything.
//   engine "live"        For models that refuse background mode. `start` still
//                        answers immediately and the Gemini call continues in
//                        the same worker via EdgeRuntime.waitUntil, bounded by
//                        the wall-clock limit. `status` marks a job that
//                        outlived that limit as failed with a plain explanation.
//
// Security — every action, in this order:
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
// Keys: GEMINI_API_KEY is primary; GEMINI_API_KEY_FALLBACK,
// GEMINI_API_KEY_FALLBACK2 and GEMINI_API_KEY_FALLBACK3 are optional extras.
// A call refused with 403/429/5xx walks down that chain, skipping slots with
// no secret set, and the slot that finally served it is stored — a background
// interaction can only be polled with the key that created it, so a poll never
// switches keys.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import {
  EXTRACTION_PROMPT_VERSION,
  fillExtractionPromptContext,
  hasDelimitedExtraction,
} from "../../../src/lib/extractionPrompt.js";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Engine = "background" | "live";
type KeySlot = "primary" | "fallback" | "fallback2" | "fallback3";

/** Models the UI may ask for. Anything else is refused before Gemini is called. */
const MODELS: Record<string, { engine: Engine }> = {
  "gemini-3.5-flash": { engine: "background" },
  "gemini-2.5-flash": { engine: "live" },
};

const BUCKET = "exam-pdfs";
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const JOBS_PER_HOUR = 12;
/** A live job older than this is dead: no plan's wall clock reaches it. */
const LIVE_STALE_MS = 7 * 60 * 1000;
/** A background job older than this is abandoned rather than polled forever. */
const BACKGROUND_STALE_MS = 45 * 60 * 1000;
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const API_REVISION = "2026-05-20";
/** Gemini statuses worth retrying on the next key. 403 covers a suspended key. */
const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Json = any;

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

/**
 * The key chain, in the order it is walked. Each slot is meant to be a separate
 * Gemini project: a key that is over its free-tier quota (429) or suspended
 * (403) is out for the moment as a whole, so what the next slot buys is a
 * different account — not a retry of the same one. A project may set one key or
 * all four; slots with no secret are skipped.
 */
const KEY_SLOTS: KeySlot[] = ["primary", "fallback", "fallback2", "fallback3"];
const KEY_ENV: Record<KeySlot, string> = {
  primary: "GEMINI_API_KEY",
  fallback: "GEMINI_API_KEY_FALLBACK",
  fallback2: "GEMINI_API_KEY_FALLBACK2",
  fallback3: "GEMINI_API_KEY_FALLBACK3",
};

function keyFor(slot: KeySlot): string | undefined {
  const key = Deno.env.get(KEY_ENV[slot])?.trim();
  return key ? key : undefined;
}

/** How many slots actually hold a key. 0 means the feature is not configured. */
function configuredSlotCount(): number {
  return KEY_SLOTS.filter((slot) => keyFor(slot) !== undefined).length;
}

/**
 * A slot name read back off a job row. Rows written before the chain grew hold
 * only 'primary' or 'fallback'; an unrecognised name reads as 'primary' rather
 * than throwing mid-poll. This checks the NAME only — whether that slot still
 * holds a key is a separate question, and handleStatus asks it before polling.
 */
function asKeySlot(value: unknown): KeySlot {
  return KEY_SLOTS.includes(value as KeySlot) ? (value as KeySlot) : "primary";
}

/** A Gemini error body, read once by gemini() so no caller re-reads the stream. */
type GeminiError = { status: number; message: string; reason: string };

/**
 * Pull the error out of a failed Gemini response.
 *
 * Two shapes in the wild: /models/* returns `{error:{…}}` while /interactions
 * wraps it in a ONE-ELEMENT ARRAY, `[{error:{…}}]`. Reading only the object
 * shape is why a failed background start used to report a bare
 * "Gemini error 400." with the actual reason — "API key not valid" — dropped.
 */
async function readGeminiError(res: Response): Promise<GeminiError> {
  let message = "";
  let reason = "";
  try {
    const parsed = JSON.parse(await res.text());
    const err = (Array.isArray(parsed) ? parsed[0]?.error : parsed?.error) ?? {};
    message = typeof err?.message === "string" ? err.message : "";
    const detail = (err?.details ?? []).find((d: Json) => d?.reason)?.reason;
    reason = String(detail ?? err?.status ?? "");
  } catch {
    /* body missing, empty, or not JSON */
  }
  return { status: res.status, message, reason };
}

/**
 * Should the chain move to the next key? 403/429/5xx are the key's problem, so
 * a different account is worth trying. A 400 is normally OUR bad request and
 * repeating it on four keys is pointless — except API_KEY_INVALID, which is
 * what Google returns for a deleted or rotated key. That one is precisely what
 * the next slot exists for, and treating it as fatal would strand the chain on
 * a dead key.
 */
function shouldTryNextKey(err: GeminiError): boolean {
  if (RETRYABLE.has(err.status)) return true;
  return (
    err.status === 400 &&
    (/API_KEY_INVALID/i.test(err.reason) || /api key not valid/i.test(err.message))
  );
}

/**
 * Call Gemini with a key slot. When `allowFallback` is set, a failure the chain
 * can route around moves on to the next configured slot, starting from
 * `preferred`; otherwise only `preferred` is used. Returns the slot that
 * produced the response, `tried` — how many keys the chain burned getting there,
 * since a caller writing an error sentence needs to know whether one key or
 * every key said no — and, for a failure, the parsed error body.
 */
async function gemini(
  path: string,
  init: { method?: string; body?: Json },
  preferred: KeySlot,
  allowFallback: boolean
): Promise<{ res: Response; slot: KeySlot; tried: number; error?: GeminiError }> {
  const order: KeySlot[] = allowFallback
    ? [preferred, ...KEY_SLOTS.filter((slot) => slot !== preferred)]
    : [preferred];
  const chain = order
    .map((slot) => ({ slot, key: keyFor(slot) }))
    .filter((entry): entry is { slot: KeySlot; key: string } => entry.key !== undefined);
  if (!chain.length) throw new Error("No Gemini key is configured on this project.");

  let last!: { res: Response; slot: KeySlot; tried: number; error?: GeminiError };
  for (let i = 0; i < chain.length; i++) {
    const { slot, key } = chain[i];
    const res = await fetch(`${GEMINI}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
        "Api-Revision": API_REVISION,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    // A success hands the body back untouched — only a failure is read here,
    // and then it is read exactly once, so no caller can hit a consumed stream.
    if (res.ok) return { res, slot, tried: i + 1 };
    const error = await readGeminiError(res);
    last = { res, slot, tried: i + 1, error };
    if (!shouldTryNextKey(error)) return last;
    console.warn(
      `[ai-pdf-import] Gemini ${res.status}${error.reason ? ` (${error.reason})` : ""} on the ` +
        `${slot} key for ${path} (slot ${i + 1} of ${chain.length})`
    );
  }
  return last;
}

/**
 * Turn a parsed Gemini error into one sentence a creator can act on. `tried` is
 * how many keys gave this same answer: with a chain of four, "wait a minute and
 * retry" is honest after one key and a lie after all of them.
 */
function geminiErrorMessage(err: GeminiError, tried = 1): string {
  const { status, message } = err;
  if (status === 429) {
    return tried > 1
      ? `Gemini is over its quota on all ${tried} platform keys. Wait a few minutes and retry, or ask the MockSetu admin to add another key.`
      : "Gemini is over its quota right now. Wait a minute and retry.";
  }
  if (status === 503) {
    return tried > 1
      ? `Gemini is busy on all ${tried} platform keys. Retry in a few minutes.`
      : "Gemini is busy right now. Retry in a moment.";
  }
  if (status === 403) {
    return tried > 1
      ? `Gemini refused all ${tried} platform keys. Ask the MockSetu admin to check them.`
      : "Gemini refused the platform key. Ask the MockSetu admin to check the key.";
  }
  if (shouldTryNextKey(err) && status === 400) {
    return tried > 1
      ? `Gemini rejected all ${tried} platform keys as invalid. Ask the MockSetu admin to re-set them.`
      : "Gemini rejected the platform key as invalid. Ask the MockSetu admin to re-set it.";
  }
  if (status === 404) return "This Gemini model is not available to the platform key any more.";
  return message ? `Gemini error ${status}: ${message}` : `Gemini error ${status}.`;
}

/** Text of the model's reply from an Interactions API object — model_output steps only. */
function interactionText(interaction: Json): string {
  const out: string[] = [];
  if (typeof interaction?.output_text === "string") out.push(interaction.output_text);
  for (const step of interaction?.steps ?? []) {
    if (step?.type !== "model_output") continue;
    for (const c of step?.content ?? []) if (c?.type === "text" && c.text) out.push(c.text);
  }
  return out.join("\n");
}

/** Text of a generateContent reply. */
function generateContentText(reply: Json): string {
  const parts = reply?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: Json) => p?.text).filter(Boolean).join("\n");
}

function isoNow(): string {
  return new Date().toISOString();
}

// deno-lint-ignore no-explicit-any
type Client = ReturnType<typeof createClient<any>>;

async function updateJob(service: Client, id: string, patch: Record<string, Json>) {
  const { error } = await service
    .from("ai_import_jobs")
    .update({ ...patch, updated_at: isoNow() })
    .eq("id", id);
  if (error) console.error("[ai-pdf-import] job update failed:", error.message);
}

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
    rawOutput: includeOutput && job.status === "completed" ? job.raw_output ?? null : undefined,
  };
}

// ─── Live engine: the Gemini call continues after the response is sent ───────
async function runLiveJob(
  service: Client,
  jobId: string,
  model: string,
  prompt: string,
  pdfBase64: string,
  preferred: KeySlot
) {
  try {
    const body: Json = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 65536 },
    };
    const budget = Deno.env.get("AI_IMPORT_THINKING_BUDGET");
    if (budget !== undefined && budget !== "" && Number.isFinite(Number(budget))) {
      body.generationConfig.thinkingConfig = { thinkingBudget: Number(budget) };
    }
    const { res, slot, tried, error } = await gemini(`/models/${model}:generateContent`, { method: "POST", body }, preferred, true);
    if (!res.ok) {
      const failure = error ?? await readGeminiError(res);
      await updateJob(service, jobId, { status: "failed", api_key_slot: slot, error: geminiErrorMessage(failure, tried), completed_at: isoNow() });
      return;
    }
    const reply = await res.json();
    const text = generateContentText(reply);
    const finish = reply?.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") {
      await updateJob(service, jobId, { status: "failed", api_key_slot: slot, error: "Gemini's reply was cut off — the paper is too long for one pass. Split the PDF, or import one language at a time.", completed_at: isoNow(), usage: reply?.usageMetadata ?? null });
      return;
    }
    if (!hasDelimitedExtraction(text)) {
      await updateJob(service, jobId, { status: "failed", api_key_slot: slot, error: "Gemini replied without the JSON block. Retry, or try the other model.", completed_at: isoNow(), usage: reply?.usageMetadata ?? null, raw_output: text.slice(0, 4000) });
      return;
    }
    await updateJob(service, jobId, { status: "completed", api_key_slot: slot, raw_output: text, usage: reply?.usageMetadata ?? null, completed_at: isoNow(), error: null });
  } catch (e) {
    await updateJob(service, jobId, { status: "failed", error: `Gemini call failed: ${e instanceof Error ? e.message : String(e)}`, completed_at: isoNow() });
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
async function handleStart(service: Client, userId: string, body: Json): Promise<Response> {
  const examId = String(body?.examId ?? "");
  const language = String(body?.language ?? "").trim().toLowerCase();
  const model = String(body?.model ?? "");
  const storagePath = String(body?.storagePath ?? "");
  const pdfName = body?.pdfName ? String(body.pdfName).slice(0, 200) : null;
  const force = body?.force === true;

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

  // One running job per exam+language, unless the caller explicitly restarts.
  if (!force) {
    const { data: active } = await service
      .from("ai_import_jobs")
      .select("*")
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

  let prompt: string;
  try {
    prompt = fillExtractionPromptContext({ language, sectionNames });
  } catch (e) {
    return fail(500, "prompt_error", e instanceof Error ? e.message : String(e));
  }

  const { data: file, error: dlErr } = await service.storage.from(BUCKET).download(storagePath);
  if (dlErr || !file) return fail(400, "pdf_missing", "The uploaded PDF could not be read. Upload it again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, "pdf_missing", "The uploaded PDF is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) return fail(413, "pdf_too_large", "PDF is over 40 MB. Split it or compress it first.");
  const pdfBase64 = encodeBase64(bytes);
  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: job, error: insErr } = await service
    .from("ai_import_jobs")
    .insert({
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
    })
    .select("*")
    .single();
  if (insErr || !job) return fail(500, "db_error", insErr?.message ?? "Could not record the job.");

  if (modelSpec.engine === "background") {
    const { res, slot, tried, error: geminiError } = await gemini(
      "/interactions",
      {
        method: "POST",
        body: {
          model,
          input: [
            { type: "text", text: prompt },
            { type: "document", mime_type: "application/pdf", data: pdfBase64 },
          ],
          background: true,
          generation_config: { temperature: 0, max_output_tokens: 65536 },
        },
      },
      "primary",
      true
    );
    if (!res.ok) {
      const message = geminiErrorMessage(geminiError ?? await readGeminiError(res), tried);
      await updateJob(service, job.id, { status: "failed", api_key_slot: slot, error: message, completed_at: isoNow() });
      return fail(502, "gemini_error", message);
    }
    const created = await res.json();
    if (!created?.id) {
      await updateJob(service, job.id, { status: "failed", api_key_slot: slot, error: "Gemini did not return a job id.", completed_at: isoNow() });
      return fail(502, "gemini_error", "Gemini did not return a job id.");
    }
    await updateJob(service, job.id, { status: "running", interaction_id: created.id, api_key_slot: slot });
    return json({ ...publicJob({ ...job, status: "running" }, false), reused: false });
  }

  // Live engine: answer now, keep working.
  await updateJob(service, job.id, { status: "running" });
  const work = runLiveJob(service, job.id, model, prompt, pdfBase64, "primary");
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && typeof EdgeRuntime.waitUntil === "function") {
    EdgeRuntime.waitUntil(work);
  } else {
    // Local dev without background tasks: finish inline so the job still lands.
    await work;
  }
  return json({ ...publicJob({ ...job, status: "running" }, false), reused: false });
}

async function loadOwnJob(service: Client, userId: string, body: Json): Promise<{ job?: Json; res?: Response }> {
  const jobId = String(body?.jobId ?? "");
  if (!UUID_RE.test(jobId)) return { res: fail(400, "bad_request", "Missing job.") };
  const { data: job, error } = await service.from("ai_import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) return { res: fail(500, "db_error", error.message) };
  if (!job || job.user_id !== userId) return { res: fail(404, "not_found", "Import job not found.") };
  return { job };
}

async function handleStatus(service: Client, userId: string, body: Json): Promise<Response> {
  const { job, res } = await loadOwnJob(service, userId, body);
  if (res) return res;
  const includeOutput = body?.includeOutput !== false;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return json(publicJob(job, includeOutput));
  }

  const ageMs = Date.now() - new Date(job.created_at).getTime();

  if (job.engine === "live") {
    if (ageMs > LIVE_STALE_MS) {
      const error = "The server ran out of time before Gemini finished — the hosting plan caps each run. Retry with Gemini 3.5 Flash, which runs in the background.";
      await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
      return json(publicJob({ ...job, status: "failed", error }, false));
    }
    return json(publicJob(job, false));
  }

  // background
  if (!job.interaction_id) return json(publicJob(job, false));
  if (ageMs > BACKGROUND_STALE_MS) {
    const error = "Gemini did not finish within 45 minutes. Retry the import.";
    await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
    return json(publicJob({ ...job, status: "failed", error }, false));
  }
  // Polling is pinned to the slot that created the interaction — Gemini will
  // not show it to any other key — so a slot whose secret has since been
  // removed cannot be polled at all. Say that, instead of a bare 500 from the
  // empty chain or a confusing 404 from guessing another key.
  const slot = asKeySlot(job.api_key_slot);
  if (!keyFor(slot)) {
    const error = "The Gemini key that started this import is no longer configured. Start the import again.";
    await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
    return json(publicJob({ ...job, status: "failed", error }, false));
  }
  const { res: gres } = await gemini(`/interactions/${job.interaction_id}`, {}, slot, false);
  if (!gres.ok) {
    // A transient poll failure is not a failed job; only 404 means it is gone.
    if (gres.status === 404) {
      const error = "Gemini lost this job. Retry the import.";
      await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow() });
      return json(publicJob({ ...job, status: "failed", error }, false));
    }
    return json(publicJob(job, false));
  }
  const interaction = await gres.json();
  const st = String(interaction?.status ?? "");
  if (st === "in_progress" || st === "queued" || st === "requires_action") {
    return json(publicJob(job, false));
  }
  if (st === "completed") {
    const text = interactionText(interaction);
    if (!hasDelimitedExtraction(text)) {
      const error = "Gemini replied without the JSON block. Retry, or try the other model.";
      await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow(), usage: interaction?.usage ?? null, raw_output: text.slice(0, 4000) });
      return json(publicJob({ ...job, status: "failed", error }, false));
    }
    const completed_at = isoNow();
    await updateJob(service, job.id, { status: "completed", raw_output: text, usage: interaction?.usage ?? null, completed_at, error: null });
    return json(publicJob({ ...job, status: "completed", raw_output: text, completed_at }, includeOutput));
  }
  const error =
    st === "incomplete" || st === "budget_exceeded"
      ? "Gemini's reply was cut off — the paper is too long for one pass. Split the PDF, or import one language at a time."
      : `Gemini stopped with status "${st || "unknown"}". Retry the import.`;
  await updateJob(service, job.id, { status: "failed", error, completed_at: isoNow(), usage: interaction?.usage ?? null });
  return json(publicJob({ ...job, status: "failed", error }, false));
}

async function handleCancel(service: Client, userId: string, body: Json): Promise<Response> {
  const { job, res } = await loadOwnJob(service, userId, body);
  if (res) return res;
  if (job.status === "queued" || job.status === "running") {
    // We do not ask Gemini to stop — a background interaction cannot be
    // reliably cancelled and a live one is already in flight. Marking the row
    // is what matters: it frees the exam+language slot for a fresh start.
    await updateJob(service, job.id, { status: "cancelled", error: "Cancelled by the creator.", completed_at: isoNow() });
  }
  return json({ jobId: job.id, status: job.status === "queued" || job.status === "running" ? "cancelled" : job.status });
}

async function handleAck(service: Client, userId: string, body: Json): Promise<Response> {
  const { job, res } = await loadOwnJob(service, userId, body);
  if (res) return res;
  // The result has been imported: remember that, and drop the 100–500 KB
  // reply — the questions now live in parsed_questions.
  await updateJob(service, job.id, { imported_at: isoNow(), raw_output: null });
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
      default:
        return fail(400, "bad_request", "Unknown action.");
    }
  } catch (e) {
    console.error("[ai-pdf-import] unhandled:", e);
    return fail(500, "internal", e instanceof Error ? e.message : "Unexpected error.");
  }
});
