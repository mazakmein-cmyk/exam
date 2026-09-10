/**
 * REPORT SHARE LINKS ARE ACTUAL SECRETS (issue 8)
 *
 * Run with: node src/__tests__/live-report-token-secrecy.test.mjs
 *
 * report_share_token lived as a plain column on live_exams, whose student
 * SELECT policy has no column restriction — one request listed every shared
 * report token on the platform, and every student already received their
 * room's token inside the exam row. The payload behind the token carried
 * every question's correct_answer plus the origin exam id, and live exams are
 * duplicated to re-run: a shared report was next period's answer key.
 *
 * Migration 20260835000000 moves tokens into live_report_shares (creator-only
 * SELECT, writes only via the definer function), scrubs the enumerable
 * column, and strips correct_answer/origin_exam_id from the token read path.
 * The creator's own report keeps everything. These assertions pin all of it,
 * plus the client's vault-first-with-legacy-fallback read.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260835000000_report_tokens_are_secrets.sql"),
  "utf-8"
);
const SERVICE = readFileSync(resolve(ROOT, "src/services/liveExamService.ts"), "utf-8");
const REPORT = readFileSync(resolve(ROOT, "src/pages/LiveExamReport.tsx"), "utf-8");

console.log("\nREPORT SHARE LINKS ARE ACTUAL SECRETS\n");

// ─── [1] The vault ───────────────────────────────────────────────────────────

test("tokens move to a table students cannot read", () => {
  assert(
    MIGRATION.includes("CREATE TABLE IF NOT EXISTS public.live_report_shares"),
    "the vault table is gone"
  );
  assert(
    MIGRATION.includes("ENABLE ROW LEVEL SECURITY"),
    "RLS must be on or the vault is a second copy of the leak"
  );
  assert(
    MIGRATION.includes('"Creator can read own report shares"'),
    "the creator needs their own row (the report page shows the current link)"
  );
  assert(
    MIGRATION.includes("must have exactly the one creator policy"),
    "the self-check must prove no student policy sneaks in later"
  );
});

test("every minted token moves over, then the readable copy is scrubbed", () => {
  assert(
    /INSERT INTO public\.live_report_shares \(live_exam_id, token, enabled\)\s+SELECT id, report_share_token, report_public/.test(
      MIGRATION
    ),
    "existing share links must keep working after the move"
  );
  assert(
    /UPDATE public\.live_exams\s+SET report_share_token = NULL\s+WHERE report_share_token IS NOT NULL/.test(
      MIGRATION
    ),
    "the enumerable column must be emptied"
  );
  assert(
    MIGRATION.includes("live_exams still carries report tokens"),
    "the self-check must prove the scrub ran"
  );
});

test("the mint function writes the vault and never the exam row", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.set_live_report_sharing"),
    MIGRATION.indexOf("GRANT EXECUTE ON FUNCTION public.set_live_report_sharing")
  );
  assert(
    fn.includes("INSERT INTO public.live_report_shares"),
    "the token must be stored in the vault"
  );
  assert(
    fn.includes("report_share_token = NULL"),
    "the exam row must be kept scrubbed on every toggle"
  );
  assert(
    fn.includes("REPORT_NOT_CREATOR"),
    "only the creator may mint or toggle"
  );
});

// ─── [2] The token path serves no answer keys ────────────────────────────────

test("the token lookup goes through the vault", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.get_live_exam_report_by_token")
  );
  assert(
    /FROM public\.live_report_shares s\s+JOIN public\.live_exams le ON le\.id = s\.live_exam_id\s+WHERE s\.token = p_token AND s\.enabled = true/.test(
      fn
    ),
    "the read must key on the vault's token + enabled, not live_exams columns"
  );
});

test("the shared report drops correct answers and the origin exam id", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.get_live_exam_report_by_token")
  );
  assert(
    fn.includes("t.e - 'correct_answer'"),
    "a shared report with keys in it is next period's answer sheet"
  );
  assert(
    fn.includes("- 'origin_exam_id'"),
    "the origin exam id points straight at the paper that gets re-run"
  );
  assert(
    fn.includes("live_report_masked_ids"),
    "the id masking from 20260834000000 must stay on this path"
  );
});

test("the creator's own report path is untouched", () => {
  assert(
    !MIGRATION.includes("FUNCTION public.get_live_exam_report(p_live_exam_id"),
    "get_live_exam_report must not be redefined — the owner keeps keys and ids"
  );
});

// ─── [3] The client reads the vault, and survives the migration gap ─────────

test("the service exposes a creator-only vault read", () => {
  assert(
    SERVICE.includes('from("live_report_shares")'),
    "fetchLiveReportShare must query the vault"
  );
  assert(
    SERVICE.includes('select("token, enabled")'),
    "two columns; nothing else leaves the vault"
  );
});

test("the report page tries the vault first and falls back to legacy columns", () => {
  const start = REPORT.indexOf("const share = await fetchLiveReportShare(liveExamId)");
  assert(start !== -1, "the vault read is gone from the report page");
  // indexOf from `start`, not from 0 — "fetchLiveDeepDive" also appears in the
  // import block at the top of the file.
  const load = REPORT.slice(start, REPORT.indexOf("fetchLiveDeepDive", start));
  assert(
    load.includes("share && share.enabled ? share.token : null"),
    "the vault row decides the toggle state"
  );
  assert(
    load.includes("exam.report_public ? exam.report_share_token : null"),
    "before the migration is pasted, the legacy columns still answer — no dead toggle"
  );
});

// ─── Results ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("─".repeat(60) + "\n");
