/**
 * LIVE EXAM v2 — PHASE 6: D1, THE SESSION REPORT
 *
 * Run with: node src/__tests__/live-v2-phase6.test.mjs
 *
 * Two properties carry the weight here, and neither would throw if broken:
 *
 *  1. The report is GENERATED, not requested. Behind a button it gets read by
 *     roughly one creator in five, and being read is the entire value.
 *  2. A shareable link cannot leak a name. It is the one URL in this product that
 *     can travel beyond the room — into a staff group chat and from there
 *     anywhere — and it is served without authentication.
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

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");
const readMigration = (f) => readFileSync(resolve(ROOT, "supabase", "migrations", f), "utf-8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const stripSqlComments = (s) => s.replace(/--[^\n]*/g, "");

const SQL = readMigration("20260807000000_live_v2_report.sql");
const PAGE = readSrc("pages/LiveExamReport.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const APP = readSrc("App.tsx");

function fnBody(name) {
  const start = SQL.indexOf(`FUNCTION public.${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  return stripSqlComments(SQL.slice(start, SQL.indexOf("$$;", start)));
}

// ─── [1] Generated, not requested ───────────────────────────────────────────
console.log("\n[1] The report is generated, not requested");

test("end_live_session builds the payload before returning", () => {
  const body = fnBody("end_live_session");
  assert(/build_live_exam_report/.test(body), "the report must be built at End");
  assert(
    body.indexOf("compute_live_rankings") < body.indexOf("build_live_exam_report"),
    "and AFTER the backfill and rankings, so it sees final numbers"
  );
});

test("a failure to build cannot fail the end of a session", () => {
  const body = fnBody("end_live_session");
  assert(
    /EXCEPTION WHEN OTHERS THEN\s*\n\s*RAISE WARNING 'build_live_exam_report failed/.test(body),
    "a report is valuable; it is not worth failing a session over"
  );
});

test("the creator is taken to the report automatically", () => {
  const code = stripComments(CONTROL);
  assert(
    /navigate\(`\/live-exam\/\$\{creatorId\}\/\$\{liveExamId\}\/report`\)/.test(code),
    "landing on the editor again is how a report goes unread"
  );
});

test("an old session with no stored report is built on demand, not shown empty", () => {
  const body = fnBody("get_live_exam_report");
  assert(
    /IF v_payload IS NULL THEN[\s\S]{0,400}build_live_exam_report/.test(body),
    "sessions that ended before D1 shipped must still produce a report"
  );
});

// ─── [2] The public link cannot leak ────────────────────────────────────────
console.log("\n[2] The shareable link");

test("it is off by default and requires a real token", () => {
  const body = fnBody("get_live_exam_report_by_token");
  assert(/report_public = true/.test(body), "sharing must be opted into");
  assert(/length\(p_token\) < 16/.test(body), "and a short or empty token rejected outright");
});

test("it returns nothing rather than erroring on an unknown token", () => {
  const body = fnBody("get_live_exam_report_by_token");
  assert(
    /RETURN NULL; /.test(body) && !/RAISE EXCEPTION/.test(body),
    "an error message would confirm which tokens exist"
  );
});

test("names are masked from the CURRENT privacy setting, not from compute time", () => {
  const body = fnBody("get_live_exam_report_by_token");
  assert(
    /NOT v_exam\.privacy_mode/.test(body),
    "the setting must be read on every request, so turning privacy on retroactively masks a link already sent"
  );
});

test("the stored payload holds ids, never names", () => {
  const build = fnBody("build_live_exam_report");
  assert(/'user_id',\s*lm\.user_id/.test(build), "moments store an id");
  assert(/'user_id',\s*lp\.user_id/.test(build), "attendance stores an id");
  assert(
    !/'display_name',\s*lp\.display_name/.test(build),
    "baking a name in is exactly the bug that produced the fastest_user_name leak in Phase 1"
  );
});

test("name resolution is a separate, shared step", () => {
  assert(
    /FUNCTION public\.live_report_with_names/.test(SQL),
    "both read paths must resolve through one function, or they will diverge"
  );
  const creator = fnBody("get_live_exam_report");
  const publicFn = fnBody("get_live_exam_report_by_token");
  assert(/live_report_with_names/.test(creator) && /live_report_with_names/.test(publicFn));
});

test("the creator's own view shows real names; the public one does not decide for itself", () => {
  const creator = fnBody("get_live_exam_report");
  assert(
    /live_report_with_names\(p_live_exam_id, v_payload, true\)/.test(creator),
    "the creator's private page is the one screen allowed to show real names"
  );
  // The identifier, not the word: the sharing panel's copy legitimately explains
  // the setting to the creator ("names follow your privacy setting"). What must
  // not exist is a client-side BRANCH on it — masking is decided server-side so
  // there is no path here to get it wrong.
  const page = stripComments(PAGE);
  assert(
    !/privacy_mode|privacyMode/.test(page),
    "the page must not read the privacy flag at all, let alone branch on it"
  );
  assert(
    /report\?\.names\?\.\[userId\]/.test(page),
    "names must come only from the payload the server already masked"
  );
});

test("the token survives being switched off and on", () => {
  const body = fnBody("set_live_report_sharing");
  assert(
    /IF p_enabled AND v_token IS NULL THEN/.test(body),
    "minting a new token on every enable would silently break a link already sent"
  );
  assert(/gen_random_bytes\(18\)/.test(body), "and it must be long enough not to be guessed");
});

test("students have no direct read of the reports table", () => {
  const policies = SQL.slice(SQL.indexOf("ALTER TABLE public.live_exam_reports ENABLE ROW LEVEL SECURITY"));
  const policyNames = [...policies.matchAll(/CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);
  assert(
    policyNames.length === 1 && /Creator/.test(policyNames[0]),
    `expected only a creator policy, found: ${policyNames.join(", ") || "(none)"}`
  );
});

// ─── [3] Content ────────────────────────────────────────────────────────────
console.log("\n[3] What the report actually says");

test("questions are ordered hardest first", () => {
  const build = fnBody("build_live_exam_report");
  assert(
    /ORDER BY q\.accuracy_pct NULLS LAST/.test(build),
    "'what do I reteach' must be the top of the list, not a scroll away"
  );
});

test("it explains WHY each question was hard, not just that it was", () => {
  assert(
    /classifyDistribution/.test(PAGE),
    "a question everyone got wrong and one the class split on need different lessons"
  );
  assert(/shared belief, not guessing/.test(PAGE), "and says so in words");
});

test("pacing comes from the unlock log, including granted time and undos", () => {
  const build = fnBody("build_live_exam_report");
  assert(/live_unlock_log/.test(build), "the only place that history exists");
  assert(/extra_seconds/.test(build) && /undo_count/.test(build));
  assert(
    /undone_at IS NULL/.test(build),
    "a withdrawn unlock must not appear in the timeline as if it happened"
  );
});

test("empty sections say so rather than vanishing", () => {
  assert(
    /Nothing to display/.test(PAGE),
    "a section that silently disappears reads as a bug in the report"
  );
  assert(/const NA = /.test(PAGE), "and a missing number shows N/A");
});

test("the public route is mounted, and under the toaster layout", () => {
  assert(/live-report\/:token/.test(APP), "the public route must exist");
  const presentBlock = APP.slice(APP.indexOf("element: <PresentLayout />"));
  assert(
    !/live-report/.test(presentBlock),
    "a report is read on a laptop; a copy-confirmation toast is welcome there"
  );
});

// ─── [4] No regressions ─────────────────────────────────────────────────────
console.log("\n[4] Nothing earlier regressed");

test("end_live_session still flips status BEFORE its analytics backfill", () => {
  // The analytics gate short-circuits on status='ended'; swapping these two would
  // make every "End" pressed while a question is open fail.
  const body = fnBody("end_live_session");
  assert(
    body.indexOf("status = 'ended'") < body.indexOf("compute_live_question_analytics"),
    "this ordering is load-bearing and is documented in the migration"
  );
});

test("the report never reads the base participants table from the client", () => {
  const page = stripComments(PAGE);
  assert(
    !/fetchLeaderboard|live_participants/.test(page),
    "everything comes through the masked report payload"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exitCode = 1;
}
console.log(`${"─".repeat(60)}\n`);
