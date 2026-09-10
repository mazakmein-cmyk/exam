/**
 * CREATOR PAGES REDIRECT NON-OWNERS (issue 34)
 *
 * Run with: node src/__tests__/creator-page-ownership.test.mjs
 *
 * Three creator pages had no ownership check and relied entirely on RLS:
 * /exam/:examId (ExamDetail), the section question editor (ManualFixEditor),
 * and Analytics' creator branch (?examId=). Since the answer-key withholding
 * landed they degraded to a HOLLOW page rather than a leak — but a hollow
 * creator UI for strangers is one careless future query away from leaking
 * again, and a student pasting ?examId= fell straight into the creator branch.
 *
 * The gates cost zero extra Supabase calls, by construction:
 *   - the owner id arrives on requests each page already made (ExamDetail and
 *     Analytics always fetched the exam row; ManualFixEditor now EMBEDS the
 *     owner in its existing section read),
 *   - the caller's id comes from getSession(), which reads the locally cached
 *     session rather than the network.
 * These assertions pin the gates and the zero-call construction.
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

const DETAIL = readFileSync(resolve(ROOT, "src/pages/ExamDetail.tsx"), "utf-8");
const EDITOR = readFileSync(resolve(ROOT, "src/pages/ManualFixEditor.tsx"), "utf-8");
const ANALYTICS = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");

console.log("\nCREATOR PAGES REDIRECT NON-OWNERS\n");

// ─── [1] ExamDetail ──────────────────────────────────────────────────────────

test("ExamDetail redirects anyone who is not the exam's creator", () => {
  const gate = DETAIL.indexOf(
    '(examData as any).user_id !== session.user.id'
  );
  assert(gate !== -1, "the ownership comparison is gone");
  const after = DETAIL.slice(gate, gate + 400);
  assert(
    after.includes('navigate("/dashboard", { replace: true })'),
    "a non-owner must be redirected, not shown a hollow editor"
  );
  assert(
    DETAIL.includes('(examError as any).code !== "PGRST116"'),
    "zero rows (RLS hiding an unpublished exam) must redirect too, not toast a generic error"
  );
});

test("ExamDetail's gate reads the LOCAL session, not the network", () => {
  const fetchFn = DETAIL.slice(
    DETAIL.indexOf("const fetchExamData = async"),
    DETAIL.indexOf("const fetchExamData = async") + 4000
  );
  assert(
    fetchFn.includes("supabase.auth.getSession()"),
    "getSession is the cached session — getUser would add an auth round-trip to every editor load"
  );
  assert(
    !fetchFn.includes("supabase.auth.getUser()"),
    "fetchExamData must not add a network auth call"
  );
});

// ─── [2] ManualFixEditor ─────────────────────────────────────────────────────

test("ManualFixEditor carries the owner on its existing section read", () => {
  // The embed has since grown language / section_group_id / primary_language
  // (structure is decided in the primary language and mirrored to twins). Still
  // one request; the owner still rides along on it.
  assert(
    EDITOR.includes('select("name, pdf_url, language, section_group_id, exam:exams(user_id, primary_language)")'),
    "the owner id must be EMBEDDED in the section fetch — a separate exams query would be a new call"
  );
  assert(
    !EDITOR.includes('from("exams")'),
    "no standalone exams request may appear in this page"
  );
});

test("ManualFixEditor redirects non-owners and hidden sections alike", () => {
  const gate = EDITOR.indexOf("ownerId !== session.user.id");
  assert(gate !== -1, "the ownership comparison is gone");
  assert(
    EDITOR.includes("if (!section || !session?.user || ownerId !== session.user.id)"),
    "a null section (RLS-hidden) and a null session must redirect exactly like a wrong owner"
  );
  const after = EDITOR.slice(gate, gate + 400);
  assert(
    after.includes('navigate("/dashboard", { replace: true })'),
    "a non-owner must be redirected"
  );
});

// ─── [3] Analytics' creator branch ───────────────────────────────────────────

test("a student pasting ?examId= no longer lands in the creator branch", () => {
  const gate = ANALYTICS.indexOf("(examData as any).user_id !== user.id");
  assert(gate !== -1, "the ownership comparison is gone");
  const after = ANALYTICS.slice(gate, gate + 400);
  assert(
    after.includes(
      'navigate(role === "creator" ? "/dashboard" : "/analytics", { replace: true })'
    ),
    "a student goes to their own analytics; a non-owner creator to their dashboard"
  );
  assert(
    ANALYTICS.includes('(examError as any).code !== "PGRST116"'),
    "an RLS-hidden exam (zero rows) must take the redirect path, not throw"
  );
});

test("the Analytics gate reuses ids the page already fetched", () => {
  // user comes from the getUser() call this page has always made at the top of
  // fetchData; the owner comes from the exam select that has always named
  // user_id. The gate must not have introduced any new request.
  assert(
    ANALYTICS.includes('select("name, user_id, primary_language")'),
    "the exam select must keep carrying user_id — that IS the gate's data source"
  );
  assert(
    (ANALYTICS.match(/supabase\.auth\.getUser\(\)/g) || []).length === 1,
    "exactly the one pre-existing getUser call — the gate must not add another"
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
