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

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

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
const fn = read("supabase/functions/ai-pdf-import/index.ts");
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
  has(fn, "fillExtractionPromptContext({ language, sectionNames })");
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
test("a fallback key exists and a background job is polled with the key that made it", () => {
  has(fn, 'Deno.env.get("GEMINI_API_KEY_FALLBACK")');
  has(fn, "api_key_slot");
  has(fn, "job.api_key_slot as KeySlot, false", "poll must not switch keys");
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
  has(fn, '"gemini-3.5-flash": { engine: "background" }');
  has(fn, '"gemini-2.5-flash": { engine: "live" }');
});
test("a failed step offers a retry, and closing mid-write is blocked", () => {
  has(dialog, "Retry this step");
  has(dialog, "if (!next && committing) return;");
  has(dialog, "beforeunload");
});
test("the dialog resumes an unfinished job on reopen", () => {
  has(dialog, "findResumableAiImportJob(examId)");
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
