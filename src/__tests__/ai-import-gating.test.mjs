/**
 * AI PDF IMPORT — off for everyone, on per creator, enforced on the server.
 *
 * Run with: node src/__tests__/ai-import-gating.test.mjs
 *
 * Pattern guards over the files that carry the feature. They pin the
 * properties that a refactor could silently lose:
 *
 *  1. OFF UNTIL GRANTED. The menu item renders only behind canUseAiImport, the
 *     access read fails closed, and the migration defaults the grant to false.
 *  2. THE SERVER DOES NOT TRUST THE CLIENT. The edge function verifies the user,
 *     re-reads the grant, checks exam ownership and the storage path prefix,
 *     builds the prompt itself, and never accepts prompt text from the request.
 *  3. THE GATEWAY CHECK IS ON. Both functions require a project JWT.
 *  4. THE ADMIN CONSOLE CAN FLIP IT. RPC + badge + menu item, same shape as the
 *     paper-type grant.
 *  5. RESULTS FLOW THROUGH THE MANUAL PIPELINE. The dialog reuses parseExamJson,
 *     buildSectionCreationPlan, autoSnip and the page's commitJson.
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/**
 * The whole edge function, every module concatenated.
 *
 * These checks are about what the FUNCTION does, not about which file a line
 * sits in. When parallel extraction split index.ts into gemini.ts / prompts.ts
 * / merge.ts / orchestrator.ts / legacy.ts, every invariant below still held and
 * yet five tests went red — they were pinned to a filename. Reading the
 * directory keeps them pinned to the behaviour instead, and a new module is
 * covered the moment it is added.
 */
const FN_DIR = "supabase/functions/ai-pdf-import";
const readFunction = () =>
  readdirSync(resolve(ROOT, FN_DIR))
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f) => read(`${FN_DIR}/${f}`))
    .join("\n\n");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
const has = (text, needle, msg) => {
  if (!text.includes(needle)) throw new Error(msg ?? `missing: ${needle}`);
};
const lacks = (text, needle, msg) => {
  if (text.includes(needle)) throw new Error(msg ?? `must not contain: ${needle}`);
};

const examDetail = read("src/pages/ExamDetail.tsx");
const admin = read("src/pages/AdminDashboard.tsx");
const settings = read("src/lib/aiImportSettings.ts");
const hook = read("src/hooks/use-ai-import-access.ts");
const fn = readFunction();
const config = read("supabase/config.toml");
const migration = read("supabase/migrations/20260912000000_ai_pdf_import.sql");
const dialog = read("src/components/AiPdfImportDialog.tsx");
const service = read("src/services/aiImportService.ts");
const types = read("src/integrations/supabase/types.ts");

console.log("\n1. Off until granted");
test("the menu item renders only behind canUseAiImport", () => {
  const i = examDetail.indexOf("Import from PDF");
  if (i < 0) throw new Error("menu item missing");
  const before = examDetail.slice(Math.max(0, i - 400), i);
  has(before, "{canUseAiImport && (", "menu item is not wrapped in the grant");
});
test("the dialog mounts only behind canUseAiImport", () => {
  const i = examDetail.indexOf("<AiPdfImportDialog");
  if (i < 0) throw new Error("dialog not rendered");
  const before = examDetail.slice(Math.max(0, i - 300), i);
  has(before, "canUseAiImport &&", "dialog is not gated");
});
test("the access read fails closed on every path", () => {
  has(settings, "return false;", "no false path");
  has(settings, "catch {", "no catch");
  has(settings, 'tableHasColumn("profiles", AI_IMPORT_ACCESS_COLUMN)', "does not probe the column first");
  has(settings, ".maybeSingle()", "single() would throw on a missing profile row");
  has(hook, "useState(false)", "hook does not start false");
});
test("the migration defaults the grant to false and NOT NULL", () => {
  has(migration, "ADD COLUMN IF NOT EXISTS can_use_ai_import boolean");
  has(migration, "ALTER COLUMN can_use_ai_import SET DEFAULT false");
  has(migration, "ALTER COLUMN can_use_ai_import SET NOT NULL");
});

console.log("\n2. The server does not trust the client");
test("the function verifies the user with auth.getUser, not just the gateway", () => {
  has(fn, "auth.getUser(token)");
  has(fn, '"sign_in_required"');
});
test("the function re-reads the grant on every call", () => {
  has(fn, 'select("can_use_ai_import")');
  has(fn, "profile.can_use_ai_import !== true");
  has(fn, '"not_enabled"');
});
test("start checks exam ownership, publish state and the storage path prefix", () => {
  has(fn, "exam.user_id !== userId");
  has(fn, "exam.is_published");
  has(fn, "storagePath.startsWith(`${userId}/${examId}/`)");
  has(fn, 'storagePath.includes("..")');
});
test("start builds the prompt server-side and refuses unknown models", () => {
  has(fn, "fillExtractionPromptContext(");
  has(fn, "buildWholePaperPrompt(", "the unsharded prompt must still be built from the shared module");
  lacks(fn, "body?.prompt", "prompt text is read from the request");
  lacks(fn, "body.prompt", "prompt text is read from the request");
  has(fn, "MODELS[model]");
  has(fn, '"bad_model"');
});
test("start is rate-limited and de-duplicated per exam+language", () => {
  has(fn, "JOBS_PER_HOUR");
  has(fn, '"rate_limited"');
  has(fn, 'in("status", ["queued", "running"])');
});
test("the key chain has four slots and walks them in order", () => {
  for (const env of [
    '"GEMINI_API_KEY"',
    '"GEMINI_API_KEY_FALLBACK"',
    '"GEMINI_API_KEY_FALLBACK2"',
    '"GEMINI_API_KEY_FALLBACK3"',
  ]) {
    has(fn, env);
  }
  has(fn, 'const KEY_SLOTS: KeySlot[] = ["primary", "fallback", "fallback2", "fallback3"]');
  has(fn, "[preferred, ...KEY_SLOTS.filter((slot) => slot !== preferred)]");
  has(fn, "keyFor(slot) }))", "unconfigured slots must be skipped, not called with undefined");
});
test("a background job is polled with the key that made it", () => {
  has(fn, "api_key_slot");
  has(fn, "const slot = asKeySlot(job.api_key_slot);");
  has(fn, "job.interaction_id}`, {}, slot, false", "poll must not switch keys");
  lacks(fn, "job.api_key_slot, true", "poll must not be allowed to fall back");
  // Parallel import polls per worker, and each worker's slot is pinned the same
  // way: the interaction belongs to the key that created it.
  has(fn, "shard.interactionId}`, {}, shard.slot, false", "a worker's poll must not switch keys either");
  has(fn, "if (!keyFor(slot)) {", "a job whose key slot is gone must fail with a reason");
});
test("a dead key routes to the next slot, and a bad request does not", () => {
  // Google answers a deleted or rotated key with 400 API_KEY_INVALID, which is
  // not a 5xx and not 403 — without this the chain strands on a dead key.
  has(fn, "function shouldTryNextKey(");
  has(fn, "API_KEY_INVALID");
  has(fn, "if (!shouldTryNextKey(err)) return last;");
  lacks(fn, "RETRYABLE = new Set([400", "a plain 400 must not burn every key");
});
test("a Gemini error body is read once, in both of Gemini's shapes", () => {
  // /interactions wraps its error in a one-element array; /models/* does not.
  has(fn, "Array.isArray(parsed) ? parsed[0]?.error : parsed?.error");
  has(fn, "if (res?.ok) {\n      markKeyHealthy(slot);\n      return { ok: true, res, slot, tried: i + 1, variant: isGet ? getVariant : undefined };", "a success body must stay unread");
  lacks(fn, "await geminiErrorMessage(", "geminiErrorMessage must be pure, not re-read the stream");
});
test("every Gemini call has a deadline", () => {
  // An unbounded fetch is how an import "keeps running": nothing retries a
  // request that has not failed yet, so a socket Gemini never answers on holds
  // the worker until the platform kills it.
  has(fn, "const control = new AbortController();");
  has(fn, "control.abort()");
  has(fn, "signal: control.signal");
  has(fn, "RETRYABLE = new Set([403, 404, 408,", "a timed-out call must move to the next key");
  lacks(fn, "BACKGROUND_STALE_MS = 45 * 60 * 1000", "45 minutes of polling is not a deadline");
});
test("the job itself cannot outlive its deadline", () => {
  has(fn, "AI_IMPORT_JOB_DEADLINE_MS");
  has(fn, "Date.now() > ms(orch.deadlineAt)", "the deadline must be checked before any other work");
  has(fn, "MAX_ATTEMPTS", "a worker must give up eventually");
});
test("running out of time salvages the parts that did finish", () => {
  // The first version of this failed the job outright. Three of four workers
  // finishing meant the creator got ZERO questions while three quarters of the
  // paper sat in shard_results with no code path left that could read it —
  // publicJob only ships rawOutput on a completed job, and a failed job is
  // never resumed. The deadline must write off what is in flight and merge the
  // rest, exactly as a clean finish does.
  has(fn, 'salvage.phase = "merging"', "the deadline must route through the merge, not straight to failed");
  has(fn, 'salvage.shards.some((s) => s.status === "done")', "it must check whether anything is worth merging");
  has(fn, "return await finish(ctx, salvage)");
  lacks(
    fn,
    "const done = orch.shards.filter((s) => s.status === \"done\").length;",
    "the deadline must not merely COUNT the finished parts in an error string and discard them"
  );
});
test("a retry that cannot finish before the deadline is not started", () => {
  // MAX_ATTEMPTS x BG_SHARD_MS is 12 minutes, longer than the whole job's
  // deadline, so without this the job burns its last minute on a worker that is
  // certain to be cut off and arrives with one fewer finished part.
  has(fn, "ms(next.deadlineAt) - Date.now() < budget");
});
test("parallel workers are spread across the key chain, not stacked on primary", () => {
  has(fn, "export function slotAt(");
  has(fn, "slot: slotAt(orch.keyOffset + i)", "worker i must open on a different key from worker i-1");
  has(fn, "shard.slot = slotAt(next.keyOffset + shard.i + shard.attempt)", "a retry must move to another account");
});
test("a key that just refused is remembered, and not handed the next job", () => {
  // Every job used to open on whichever key its offset landed on — including a
  // key that had said 429 four seconds earlier — and burned a whole attempt
  // rediscovering it. The chain now rests a refused key for as long as its
  // quota window says, and slotAt() positions over the healthy keys only.
  has(fn, "const cooldowns = new Map<KeySlot, Cooldown>();");
  has(fn, "export function markKeyRefused(");
  has(fn, "markKeyRefused(slot, err);", "every refusal must be remembered, whether or not the chain walks on");
  has(fn, "const healthy = healthySlots();", "slotAt must prefer keys that are not resting");
  has(fn, "const chain = healthy.length ? healthy : configuredSlots();", "…but must never leave the chain empty");
  has(fn, "retryDelay", "a 429's RetryInfo decides how long the rest is");
  has(fn, "quotaId", "a daily quota must rest for hours, not a minute");
  has(fn, "markKeyHealthy(slot);", "a key that answers is healthy again, whatever it said before");
});
test("jobs move round the chain one step at a time, not at random", () => {
  has(fn, "export function nextJobOffset(");
  has(fn, "keyOffset: nextJobOffset()");
  lacks(fn, "Math.random() * Math.max(1, configuredSlotCount())", "a random offset puts consecutive jobs on the same key");
  has(fn, "preferred: KeySlot = slotAt(nextJobOffset())", "the single pass must rotate too, not open on primary every time");
  lacks(fn, '    "primary",\n    true,\n    60_000', "a background start hard-wired to primary");
  has(fn, "slotAt(nextJobOffset())", "the live single pass must not open on slotAt(0) every time");
  lacks(fn, "slotAt(0))", "slotAt(0) is 'primary' by another name");
});
test("a worker may walk the chain when it STARTS, never when it POLLS", () => {
  // A refusal at the door is cheap to route around inside the same call, and
  // waiting for the next poll to relaunch cost a whole attempt. A poll is
  // pinned: Gemini shows an interaction only to the key that made it.
  has(fn, '`/models/${model}:generateContent`,\n    { method: "POST", body },\n    slot,\n    true,');
  has(fn, '"/interactions",\n    { method: "POST", body },\n    slot,\n    true,');
  has(fn, "p_slot: slot ?? shard.slot", "the slot recorded must be the one that ACCEPTED the interaction");
  has(fn, "const deadline = Date.now() + Math.max(1000, timeoutMs);", "walking the chain must not multiply the timeout");
  has(fn, "if (i > 0 && remaining < 5_000) break;");
});
test("the whole-paper fallback gets the single pass's clock, not a slice's", () => {
  // A whole paper handed a four-minute slice deadline was reaped, relaunched
  // and paid for three times, then failed — on the path that exists so the
  // import works no matter what.
  has(fn, "function shardBudgetMs(");
  has(fn, "return shard.whole ? BACKGROUND_STALE_MS : BG_SHARD_MS();");
  has(fn, "function fallBackToWholePaper(");
  has(
    fn,
    "next.deadlineAt = new Date(Date.now() + shardBudgetMs(next.shards[0]) + 60_000).toISOString();",
    "the job deadline must be re-armed for the fallback"
  );
  lacks(fn, "shardDeadline(ctx.engine)", "a deadline keyed on the engine alone cannot tell a slice from a paper");
  lacks(fn, 'shardDeadline("background")', "same");
  has(fn, "PLAN_ATTEMPTS", "the index pass must give up sooner than a worker does");
  has(fn, "planShard.attempt < PLAN_ATTEMPTS()");
});
test("a reply that was cut off splits the slice instead of retrying it whole", () => {
  has(fn, "export function splitSlices(");
  has(fn, "if (!shard.whole && isCutOff(shard.error)) {");
  has(fn, "const halves = splitSlices(shard.slices);");
  has(fn, "shard.slices = head;");
  has(fn, "for (const shard of [...next.shards]) {", "the reap loop must iterate a copy while it adds workers");
  has(fn, "WHOLE_CUT_OFF_MESSAGE", "a cut-off whole paper gets the creator-facing advice, not the slice's");
});
test("the build can report itself: version, split availability, key chain", () => {
  has(fn, 'case "health":');
  has(fn, "keys: keyHealth()");
  has(fn, "const parallel = await parallelAvailable(service);");
});
test("the creator can choose how the paper is read, and 'single' is absolute", () => {
  // "All in one go" is the escape hatch for a paper the split gets wrong, so it
  // must never quietly become a parallel run. The other direction is allowed to
  // degrade: asking for the split on a database that cannot plan one gets a
  // single pass, and the reply says so rather than showing the wrong story.
  has(fn, 'body?.mode === "single"');
  has(fn, 'const parallel = requestedMode !== "single" && canParallel;');
  has(fn, 'mode: job.orchestration ? "parallel" : "single"', "the reply must report what actually ran");
  has(service, "AI_IMPORT_MODES");
  has(service, 'export const DEFAULT_AI_IMPORT_MODE: AiImportMode = "parallel";');
  has(dialog, "mode: ctx.readMode", "the dialog must send the choice");
});
test("the deployed build can be identified without running an import", () => {
  // "Is the new function actually live?" was unanswerable for three rounds, and
  // the answer was no every time. The version rides on every response, the 401
  // included, so one curl settles it.
  has(fn, "const FUNCTION_VERSION =");
  has(fn, '"x-ai-import-version": FUNCTION_VERSION');
  has(fn, '"Access-Control-Expose-Headers": "x-ai-import-version"');
});
test("the parallel migration's array paths are typed, and the paste proves the functions run", () => {
  // The 2026-09-16 bodies did `target || 'status'` on a text[]; Postgres reads
  // text[] || 'unknown' as array || array and raises 22P02 "malformed array
  // literal" at plan time, on every call, even on the CASE branch not taken.
  // Both RPCs existed and were locked down, so every existence probe passed —
  // and every import silently ran the single pass for eleven days.
  const parallel = read("supabase/migrations/20260916000000_ai_import_parallel.sql");
  for (const key of ["status", "error", "interactionId", "slot", "deadlineAt"]) {
    has(parallel, `target || '${key}'::text`, `path literal '${key}' must be cast to text`);
    lacks(parallel, `target || '${key}',`, `untyped path literal '${key}' — this is the 22P02`);
    lacks(parallel, `target || '${key}' `, `untyped path literal '${key}' — this is the 22P02`);
  }
  // Existence is not proof. The file must CALL both functions before it ends.
  has(parallel, "PERFORM public.ai_import_record_shard(probe, 0, NULL, 'done', NULL, 0);");
  has(parallel, "PERFORM public.ai_import_record_shard(probe, -1,");
  has(parallel, "PERFORM public.ai_import_mark_shard_running(probe, 0, 'probe', 'primary', now()::text);");
  has(parallel, "p.proname = 'ai_import_record_shard' AND p.pronargs = 5", "the paste must check the old overload is gone");
});
test("a single pass that was not asked for says why, where the creator can read it", () => {
  // The probe's failure used to be a console.warn in function logs nobody
  // opens. It now rides on every status reply and the dialog prints it.
  has(fn, "function splitBlockedBy(");
  has(fn, "splitBlockedBy: job.orchestration ? null : splitBlockedBy()");
  has(fn, "parallelReason: parallel ? null : splitBlockedBy()");
  has(fn, "Re-paste it in the SQL editor; this is re-checked every minute.");
  has(fn, "const PARALLEL_RECHECK_MS = 60 * 1000;", "a paste must take effect within a minute, not five");
  has(service, "splitBlockedBy?: string | null;");
  has(dialog, "st.splitBlockedBy", "the dialog must show the server's reason");
  // The "taking longer" line used to REPLACE the live line that names the
  // mode — exactly when the creator most needed to know which mode was running.
  has(dialog, "{active && slow && (");
  has(dialog, "{active && step.live && (");
  lacks(dialog, "{active && (slow || step.live) && (", "slow and live must both render, not one or the other");
});
test("the index pass runs on the model's engine, not always live", () => {
  // A 60-page paper cannot be read inside a 110 s live call. On the background
  // engine the index pass is a background interaction, polled like a worker.
  has(fn, "async function launchPlan(");
  has(fn, 'engine: planModel === ctx.model ? ctx.engine : "live",\n    slot: slotForModel(planModel, orch.keyOffset),\n    attempt: 1,', "the plan shard must take the job's engine (or live, when it opens on a substitute model)");
  has(fn, "if (shard.i < 0) {\n      await recordPlanText(ctx, shard, text);", "a polled index pass must be read as a PLAN block");
  has(fn, "? [planShard]", "the tick must poll a background index pass");
  lacks(fn, 'engine: "live",\n    slot: slotAt(orch.keyOffset)', "the index pass hard-wired to live");
});
test("a worker's progress is observed, remembered, and shown — and visible progress is not killed", () => {
  // The first index pass on the 60-page JEE paper was written off after five
  // minutes with no record of whether Gemini was working or queueing, and the
  // retry erased the reason. Now every poll records what Gemini said (on
  // change), every ended attempt is kept, the dialog gets a plain-words line,
  // and an attempt Gemini reports as in progress is extended once.
  has(fn, "async function noteObserved(");
  has(fn, "return await noteObserved(ctx, shard, st, variant", "a poll must record queued / in_progress");
  has(fn, '"poll failed",\n      `HTTP ${error?.status', "a failing poll must be recorded too — it looks identical to a hung worker otherwise");
  has(fn, "function endAttempt(");
  has(fn, 'const lastError = shard.error ?? "failed";\n        endAttempt(shard, lastError);', "a worker retry must keep the reason");
  has(fn, "function extendIfProgressing(");
  has(fn, 'shard.observed?.status !== "in_progress"');
  has(fn, "export function progressLine(");
  has(fn, "progress: job.orchestration && job.status === \"running\" ? progressLine(job.orchestration) : null");
  has(service, "progress?: string | null;");
  has(dialog, "st.progress", "the dialog must show the progress line");
  // The index pass asks for low thinking, and falls back if refused.
  has(fn, '{ thinkingLevel: "low" }');
  has(fn, "/thinking/i.test(started.error)");
});
test("a status poll that Gemini refuses tries the other request shapes and remembers the winner", () => {
  // 2026-09-23: every GET /interactions/{id} came back "400 Request contains
  // an invalid argument" while the POST with the same headers succeeded. Work
  // finished on Google's side and nobody ever saw it. A poll must not have one
  // fixed shape it can fail with forever.
  has(fn, "const GET_VARIANTS: GetVariant[] = [");
  has(fn, "if (isGet && error?.status === 400) {");
  has(fn, "getVariant = vi;");
  has(fn, "if (v.contentType) headers[\"Content-Type\"] = \"application/json\";", "a bodiless GET must be able to go without Content-Type");
  has(fn, "pollShape: currentGetVariant()", "health must report which shape is in use");
  has(fn, 'variant ? `poll shape ${variant}` : undefined', "the job row must record a non-default shape");
});
test("the paper is cut by PAGES, one chunk per tick, and no step reads the whole PDF", () => {
  // Three live index passes on the 25-page JEE paper ran out their 110 s on
  // three keys just READING the PDF. Pages are known from the file itself, so
  // the split needs no model to have read anything, and each call sees ~5
  // pages. pdf-lib costs ~0.7 s CPU per load+save against a 2 s cap → one
  // chunk per tick.
  has(fn, "export async function pdfPageCount(");
  has(fn, "export async function pdfSlice(");
  has(fn, "const CHUNKS_PER_TICK = 1;");
  has(fn, "async function materialiseChunk(");
  has(fn, 'pages: isPageMode(orch) ? keyWindow(orch.pageCount!, "tail") : null,', "the index pass must read only the key pages");
  has(fn, 'const which = lastOutcome.includes(NO_KEY_ON_TAIL) ? "head" : "tail";', "no key at the back → read the front");
  has(fn, "next.shards = buildPageShards(next, ctx.engine, null);", "a failed index pass must still import the paper, without answers");
  has(fn, "if (value && shard.pages) fixChunkPageNumbers(value, shard.pages);", "figure pages must be paper pages");
  has(fn, "const halves = splitPageChunk(shard.pages, next.pageCount ?? shard.pages.ctxTo);", "a long chunk is halved by pages");
  has(fn, "await cleanupParts(service, BUCKET, job);", "chunk files must be removed when the job ends");
  has(fn, "job.orchestration.partsDir = `${userId}/${examId}/ai-import-parts/${job.id}`;", "chunks live under the creator's own folder");
  has(fn, "if (bytes.byteLength <= MAX_CUT_BYTES()) {", "a huge PDF must not be loaded twice into memory");
});
test("a model that does not answer is swapped for the other Flash model on retry", () => {
  // 3.5 Flash timed out on a TEN-page chunk three times on three keys the same
  // day its background endpoint broke. A model can have a bad day; a retry
  // that cannot leave it is not a retry.
  has(fn, "export function otherModel(");
  has(fn, "function modelForRetry(");
  // 2.5 Flash answered 404 to these keys the same day: the fallback is a
  // CHAIN, configurable without a redeploy, and a 404 takes a model out of it.
  has(fn, 'Deno.env.get("AI_IMPORT_MODEL_CHAIN")');
  // Availability is per (model, key): 2.5 Flash 404'd on three keys and worked
  // on the fourth. A 404 walks to the next key and marks only that pair.
  has(fn, "RETRYABLE = new Set([403, 404, 408,", "a 404 must try the next key — availability is per Google project");
  has(fn, "if (err.status === 404) markModelDeadOnKey(model, slot);");
  has(fn, "if (err.status === 408 || err.status === 503) markModelSlow(model);");
  has(fn, "export function slotForModel(");
  has(fn, "export function startingModel(");
  has(fn, "const planModel = startingModel(ctx.model);", "a new job must not open on a model that just stalled");
  has(fn, "if (/not available to any/i.test(e)) return otherModel(current);", "404 on every key must switch model on the spot — the job's own evidence beats isolate memory");
  has(fn, "if (/not available/i.test(e)) return keysWithModel(current).length ? current : otherModel(current);");
  has(fn, "planShard.model = modelForRetry(planShard.model ?? ctx.model, lastOutcome);");
  has(fn, "const nextModel = modelForRetry(shard.model ?? ctx.model, lastError);");
  has(fn, "const model = shard.model ?? ctx.model;");
  has(fn, 'model: modelsUsed.length ? modelsUsed.join(" + ") : ctx.model,', "the summary must name every model that contributed");
  // Five retries four seconds apart all land in the same bad minute at Google.
  has(fn, "shard.notBefore = new Date(Math.min(Date.now() + pause,", "a stalled part must pause before its next attempt");
  has(fn, 's.status === "queued" && ms(s.notBefore) <= Date.now()', "a pausing part must not be launched early");
});
test("the server merge forgives what the browser forgives", () => {
  const pkg = JSON.parse(read("package.json"));
  const pinned = String(pkg.dependencies?.jsonrepair ?? "").replace(/^[\^~]/, "");
  if (!pinned) throw new Error("package.json no longer depends on jsonrepair");
  has(fn, `from "https://esm.sh/jsonrepair@${pinned}"`, `merge.ts must import the same jsonrepair version the browser uses (${pinned})`);
  has(fn, "asObject(JSON.parse(jsonrepair(candidate)))");
  // …but not more: jsonrepair turns prose into a JSON string, and prose must
  // stay a failure the caller can retry.
  has(fn, "const asObject = (v: unknown): Json | null =>");
});
test("the deploy workflow pins the .env project and proves the header afterwards", () => {
  // Four stale deploys in eleven days, one of them to the project config.toml
  // names instead of the one .env names. The workflow exists so the ref is
  // never typed by hand and a deploy that did not land fails the job.
  const wf = read(".github/workflows/deploy-ai-pdf-import.yml");
  const pinned = wf.match(/SUPABASE_PROJECT_REF:\s*([a-z0-9]+)/)?.[1];
  if (!pinned) throw new Error("the workflow must pin SUPABASE_PROJECT_REF to a literal ref");
  // .env is gitignored, so it is only there on a developer's machine. When it
  // is, the ref must be the one it points at — that is the whole point.
  let env = null;
  try {
    env = read(".env");
  } catch {
    /* CI checkout: nothing to compare against */
  }
  const envRef = env?.match(/VITE_SUPABASE_URL="?https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (envRef && envRef !== pinned) {
    throw new Error(`the workflow deploys to ${pinned} but .env points at ${envRef}`);
  }
  has(wf, 'functions deploy ai-pdf-import --project-ref "$SUPABASE_PROJECT_REF"');
  has(wf, "x-ai-import-version", "the workflow must read the live header back");
  has(wf, "FUNCTION_VERSION", "…and compare it with the version in the code");
  lacks(wf, "secrets.SUPABASE_ACCESS_TOKEN == ''", "a step if: cannot read the secrets context; map it to env first");
  lacks(wf, "GEMINI_API_KEY", "Gemini keys are function secrets, not CI secrets");
});
test("the parallel path degrades to the single pass instead of failing", () => {
  has(fn, "AI_IMPORT_PARALLEL");
  has(fn, "wholePaperShard(", "an unusable index pass must fall back to one whole-paper run");
  has(fn, "parallelAvailable(", "a database without the migration must still import");
});
test("the merged reply is the same contract the browser already parses", () => {
  has(fn, 'export const JSON_START = "<<<EXAM_JSON_START>>>"');
  has(fn, 'export const JSON_END = "<<<EXAM_JSON_END>>>"');
  has(fn, "export function toDelimited(");
  has(fn, "schema_version: schemaVersion");
  has(fn, "_extraction_summary:");
  // The model reliably invents its own name — it has called itself "GPT-4o"
  // and "Claude 3.5 Sonnet" — so the merge must stamp it, not copy it.
  has(fn, "model: opts.model", "the model name must be set server-side");
});
test("the migration accepts every slot name the function can write", () => {
  for (const slot of ["primary", "fallback", "fallback2", "fallback3"]) {
    has(migration, `'${slot}'`);
  }
  has(migration, "ai_import_jobs_api_key_slot_check");
  has(migration, "DROP CONSTRAINT IF EXISTS ai_import_jobs_api_key_slot_check",
    "an already-applied database must get the widened check too");
});
test("status only ever returns the creator's own job", () => {
  has(fn, "job.user_id !== userId");
});
test("the function contains no API key literal", () => {
  lacks(fn, "AQ.Ab8", "a Gemini key literal is in the source");
  lacks(fn, "AIza", "a Google API key literal is in the source");
});

console.log("\n3. The gateway check is on");
test("ai-pdf-import and parse-pdf both require a JWT", () => {
  const block = (name) => {
    const i = config.indexOf(`[functions.${name}]`);
    if (i < 0) throw new Error(`no config block for ${name}`);
    return config.slice(i, i + 80);
  };
  has(block("ai-pdf-import"), "verify_jwt = true");
  has(block("parse-pdf"), "verify_jwt = true");
});

console.log("\n4. The admin console can flip it");
test("migration ships the setter RPC and carries the grant in admin_get_all_users", () => {
  has(migration, "FUNCTION public.admin_set_ai_import_access(");
  has(migration, "SECURITY DEFINER");
  has(migration, "Admin privileges required");
  has(migration, "coalesce(p.can_use_ai_import, false) AS can_use_ai_import");
  has(migration, "coalesce(p.can_set_paper_type, false) AS can_set_paper_type", "must carry the existing grant forward too");
  has(migration, "admin_engaged_sittings(u.id)", "must keep the engaged-attempts count from 20260851000000");
});
test("admin dashboard calls the RPC and shows a badge + menu item", () => {
  has(admin, "'admin_set_ai_import_access'");
  has(admin, "handleSetAiImportAccess");
  has(admin, "user.can_use_ai_import && (");
  has(admin, "'Allow AI PDF Import'");
  has(admin, "20260912000000_ai_pdf_import.sql", "pre-migration error does not say which file to paste");
});
test("jobs table is RLS-enabled with a SELECT-only own-rows policy", () => {
  has(migration, "CREATE TABLE IF NOT EXISTS public.ai_import_jobs");
  has(migration, "ALTER TABLE public.ai_import_jobs ENABLE ROW LEVEL SECURITY");
  has(migration, "FOR SELECT");
  has(migration, "USING (auth.uid() = user_id)");
  lacks(migration, "FOR INSERT", "clients must not insert job rows");
  lacks(migration, "FOR UPDATE", "clients must not update job rows");
});
test("generated types know the new column and table", () => {
  has(types, "can_use_ai_import: boolean");
  has(types, "ai_import_jobs: {");
});

console.log("\n5. Results flow through the manual pipeline");
test("the dialog reuses the parser, section plan, snipper and commitJson", () => {
  has(dialog, "parseExamJson(");
  has(dialog, "buildSectionCreationPlan(");
  has(dialog, "autoSnip(");
  has(dialog, "commitJson(report, ctx.mode, ctx.language");
  has(dialog, "uploadQuestionImage(");
  has(dialog, "normalizeReportOptionLabels(");
});
test("the dialog offers both models and defaults to 3.5 Flash", () => {
  has(service, '"gemini-3.5-flash"');
  has(service, '"gemini-2.5-flash"');
  has(service, 'DEFAULT_AI_IMPORT_MODEL: AiImportModelId = "gemini-3.5-flash"');
  // 3.5 Flash ran in the background until 2026-09-23, when Gemini's retrieve
  // call began refusing every poll. It runs live now, behind a switch.
  has(fn, '"gemini-3.5-flash": { engine: ENGINE_35 }');
  has(fn, 'Deno.env.get("AI_IMPORT_35_ENGINE") === "background" ? "background" : "live"');
  has(fn, '"gemini-2.5-flash": { engine: "live" }');
  has(service, 'id: "gemini-3.5-flash",\n    label: "Gemini 3.5 Flash",\n    badge: "Recommended",');
  lacks(service, 'detail: "Runs in the background — close this window and come back."', "the dialog must not promise a background run the server no longer does");
});
test("a failed step offers a retry, and closing mid-write is blocked", () => {
  has(dialog, "Retry this step");
  has(dialog, "if (!next && committing) return;");
  has(dialog, "beforeunload");
});
test("the dialog resumes an unfinished job on reopen", () => {
  has(dialog, "findLastAiImportJob(examId)", "one query fetches the last run; its resumable flag drives Continue");
  has(dialog, "lastJob.resumable");
  has(service, "export async function findLastAiImportJob");
  has(dialog, "downloadAiImportPdf(", "a resumed job cannot cut figures without fetching the PDF back");
  has(dialog, "ackAiImport(");
});
test("client uploads under the creator's own folder, as the bucket policy requires", () => {
  has(service, "`${userId}/${examId}/ai-import-${language}-${Date.now()}.pdf`");
});


// ─── 6. A FAILED JOB TELLS THE CREATOR WHY ──────────────────────────────────
// The function answers a failed job as a job object whose "error" field is the
// reason (a string); it answers a refused request as {error:{code,message}}.
// The client must tell the two apart, or every failed job reads "Import failed."
test("a job object carrying a string error is data, not a failure envelope", () => {
  has(fn, "error: job.error ?? null", "the job shape carries the failure reason under error");
  has(service, 'typeof envelope === "object"', "only an object-shaped error is the failure envelope");
  lacks(service, "if ((data as any)?.error) {", "a truthy string error must not be treated as an envelope");
});
test("the dialog shows the job reason and starts fresh on retry", () => {
  has(dialog, "throw new Error(st.error ??", "the failed job reason is what the dialog shows");
  has(dialog, "ctx.jobId = null; // a failed job is not resumed", "Retry must start a new job, not poll the dead one");
});


// ─── 7. A FLAKY GEMINI READ IS RETRIED ONCE BEFORE THE CREATOR IS ASKED ──────
// Quota blips, a reply without the JSON block, a lost job: the dialog tries the
// Gemini step once more on its own, then shows the failure card with Retry.
test("a failed Gemini read or unreadable reply is retried once automatically", () => {
  has(dialog, "const AUTO_RETRIES = 1;");
  has(dialog, '(id === "gemini" || id === "parse") && ctx.autoRetries < AUTO_RETRIES', "only the Gemini stages are retried on their own");
  has(dialog, 'i = STEP_ORDER.indexOf("gemini") - 1;', "the retry re-runs from the Gemini step");
  has(dialog, "ctx.autoRetries += 1;", "one automatic retry, not a loop");
  has(dialog, "autoRetries: 0,", "each attempt starts with its retry unspent");
});
test("the manual Retry asks Gemini again when the reply could not be read", () => {
  has(dialog, "Retry this step");
  has(dialog, 'if (failure.stepId === "parse") {');
  has(dialog, "discardReply(ctx);\n      void runFrom(\"gemini\");", "re-parsing the same reply would fail the same way");
});


// ─── 8. A STEP CAN BE RUN AGAIN BY HAND, WITH THE SAME PDF ───────────────────
// Gemini sometimes reads a paper badly. The creator can redo the Gemini step
// (a fresh job, the PDF is not uploaded twice) and the following steps run on
// their own; from the summary, the whole import can be run again.
test("a redo re-reads the same PDF with a fresh Gemini job and continues", () => {
  has(dialog, 'const REDOABLE = new Set<StepId>(["gemini", "parse", "sections", "figures"]);', "upload has nothing to redo, save must never be");
  has(dialog, "force: ctx.forceNewJob,", "a redo must not be handed the job it is abandoning");
  has(dialog, 'const from: StepId = stepId === "parse" ? "gemini" : stepId;', "a parse redo is a Gemini redo");
  has(dialog, "if (ctx.jobId && !ctx.rawOutput) void cancelAiImport(ctx.jobId).catch(() => {});", "a still-running job is cancelled");
  has(dialog, "if (!ctx || committing || !REDOABLE.has(stepId)) return;", "never while rows are being written");
  has(dialog, "Run again with this PDF");
});


// ─── 9. THE LAST RUN CAN BE READ AGAIN FROM SETUP ─────────────────────────────
// Close the dialog mid-run, reopen it: Setup shows the last run (any status,
// up to a day old) and "Read again" starts a fresh Gemini job on the PDF that is
// already in storage — no re-upload, no finding the file again — then continues.
test("Setup offers to read the last run's PDF again without re-uploading", () => {
  has(dialog, "const readAgainFromLastJob = async () => {");
  has(dialog, "storagePath: job.storagePath,", "the stored PDF is reused");
  has(dialog, "forceNewJob: true,", "a fresh Gemini job even if the old one is still running");
  has(dialog, 'void runFrom("gemini");');
  has(dialog, "Read again");
  has(service, "const LAST_JOB_MAX_MS = 24 * 60 * 60 * 1000;");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
