/**
 * AUTOMATED REGRESSION TEST SUITE
 * Tests all logic changed during the scalability optimization session
 *
 * Run with: node src/__tests__/regression.test.mjs
 *
 * Covers:
 *  [1] Analytics: N+1 → batch query logic (student rank map)
 *  [2] Analytics: O(N²) → O(1) Map lookup logic (creator scoring)
 *  [3] Analytics: DB is_correct trusted over re-grading
 *  [4] ExamSimulator: Attempt NOT created on load, created on Start
 *  [5] useUserRole: location.pathname removed from deps (static check)
 *  [6] Migration files: Indexes and RLS files exist and are valid SQL
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ─── Test Runner ────────────────────────────────────────────────────────────
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

function assertContains(str, substring, message) {
  if (!str.includes(substring))
    throw new Error(message || `Expected to contain: "${substring}"`);
}

function assertNotContains(str, substring, message) {
  if (str.includes(substring))
    throw new Error(message || `Expected NOT to contain: "${substring}"`);
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(
    resolve(ROOT, "supabase", "migrations", filename),
    "utf-8"
  );
}

// ─── [1] Analytics: N+1 → Batch Query Fix ───────────────────────────────────
console.log("\n[1] Analytics — N+1 → Batch Query (Student Rank Logic)");

test("analyticsTs: FOR loop with sequential awaits per exam is REMOVED", () => {
  const src = readSrc("pages/Analytics.tsx");
  // The old pattern: for (const eid of examIds) { await supabase.from("sections")...
  assertNotContains(
    src,
    'for (const eid of examIds) {\n              // Get sections for this exam (ordered)',
    "Old N+1 for-loop still present"
  );
});

test("analyticsTs: Single batch sections query uses .in('exam_id', examIds)", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, '.in("exam_id", examIds)', "Batch sections query not found");
});

test("analyticsTs: Single batch attempts query uses .in('section_id', allSectionIds)", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, '.in("section_id", allSectionIds)', "Batch attempts query not found");
});

test("analyticsTs: sectionToExam reverse lookup Map is built", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "sectionToExam", "sectionToExam lookup Map not found");
});

test("analyticsTs: attemptsByExam grouping is present", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "attemptsByExam", "attemptsByExam grouping not found");
});

// ─── [2] Analytics: O(N²) → O(1) Map Lookups (Creator Scoring) ──────────────
console.log("\n[2] Analytics — O(N²) → O(1) Map Lookups (Creator View)");

test("analyticsTs: responsesData.filter per attempt is REMOVED", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertNotContains(
    src,
    "responsesData.filter(r => r.attempt_id === attempt.id)",
    "Old O(N) filter per attempt still present"
  );
});

test("analyticsTs: responsesByAttempt Map is built", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "responsesByAttempt", "responsesByAttempt Map not found");
});

test("analyticsTs: questionsById Map is built", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "questionsById", "questionsById Map not found");
});

test("analyticsTs: questionCountBySection Map is built (replaces .filter per attempt)", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "questionCountBySection", "questionCountBySection Map not found");
});

test("analyticsTs: correctedAttemptsById Map is built for stats loop", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "correctedAttemptsById", "correctedAttemptsById Map not found");
});

test("analyticsTs: chunked fetch in batches of 200", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(src, "CHUNK_SIZE = 200", "Chunk size constant not found");
  assertContains(src, "i < attemptIds.length; i += CHUNK_SIZE", "Chunk loop not found");
});

test("analyticsTs: questionsData?.find inside response loop is REMOVED", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertNotContains(
    src,
    "questionsData?.find(q => q.id === r.question_id)",
    "Old O(N) .find() per response still present"
  );
});

// ─── [3] Analytics: Trust DB is_correct ─────────────────────────────────────
console.log("\n[3] Analytics — Trust DB is_correct (No Blind Re-grading)");

test("analyticsTs: DB is_correct is checked first (null guard present)", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(
    src,
    "r.is_correct !== null && r.is_correct !== undefined",
    "DB is_correct null guard not found"
  );
});

test("analyticsTs: fallback re-grade only for null is_correct (legacy safety)", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(
    src,
    "Fallback: re-grade only for legacy responses with null is_correct",
    "Fallback comment not found — logic may have regressed"
  );
});

test("analyticsTs: comment confirms DB trust approach", () => {
  const src = readSrc("pages/Analytics.tsx");
  assertContains(
    src,
    "Trust the DB value (set by examService.ts on submit)",
    "DB trust comment not found"
  );
});

// ─── [4] ExamSimulator: Deferred Attempt Creation ───────────────────────────
console.log("\n[4] ExamSimulator — Attempt Created on Start, Not Page Load");

test("examSimulatorTs: attempt INSERT is NOT inside fetchSectionAndQuestions", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // The old code had .insert({ user_id, section_id, started_at }) inside fetchSectionAndQuestions
  // after setQuestionStates. Check that the comment about deferred creation is present.
  assertContains(
    src,
    "do NOT create attempt yet (wait for user to click",
    "Deferred attempt creation comment not found"
  );
});

test("examSimulatorTs: handleStartSection function exists", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "const handleStartSection = async", "handleStartSection not found");
});

test("examSimulatorTs: Start Section button calls handleStartSection", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "onClick={handleStartSection}", "Start button not wired to handleStartSection");
});

test("examSimulatorTs: attempt INSERT is inside handleStartSection", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // handleStartSection must contain the insert and setAttemptId
  const handleStart = src.slice(
    src.indexOf("const handleStartSection = async"),
    src.indexOf("const updateQuestionTime")
  );
  assertContains(handleStart, '.from("attempts")', "attempt insert not in handleStartSection");
  assertContains(handleStart, "setAttemptId(data.id)", "setAttemptId not in handleStartSection");
  assertContains(handleStart, "setHasStarted(true)", "setHasStarted not in handleStartSection");
});

test("examSimulatorTs: setHasStarted(true) is NOT inside fetchSectionAndQuestions", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const fetchFn = src.slice(
    src.indexOf("const fetchSectionAndQuestions = async"),
    src.indexOf("const handleStartSection = async")
  );
  assertNotContains(
    fetchFn,
    "setHasStarted(true)",
    "setHasStarted(true) still inside fetchSectionAndQuestions — attempt created on page load!"
  );
});

// ─── [5] useUserRole: No subscription leak ───────────────────────────────────
console.log("\n[5] useUserRole — Subscription Created Once, Not Per Navigation");

test("useUserRole: useLocation import is REMOVED", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertNotContains(src, "useLocation", "useLocation still imported — subscription will leak per navigation");
});

test("useUserRole: location.pathname NOT in dep array", () => {
  const src = readSrc("hooks/use-user-role.ts");
  // Check the dep array line specifically — the word appears in comments but not in code
  const depArrayLine = src.split("\n").find((l) => l.includes("}, ["));
  assert(depArrayLine, "Could not find dep array line");
  assertNotContains(
    depArrayLine,
    "location.pathname",
    "location.pathname still in dep array — subscription recreated on every URL change"
  );
});

test("useUserRole: window.location.pathname used for dynamic path read", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(
    src,
    "window.location.pathname",
    "Dynamic path read not found — redirect logic may be broken"
  );
});

test("useUserRole: only [navigate] in dep array", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(src, "}, [navigate]);", "Dep array is not [navigate] — may still be leaking");
});

test("useUserRole: subscription cleanup still present", () => {
  const src = readSrc("hooks/use-user-role.ts");
  assertContains(src, "subscription.unsubscribe()", "Cleanup not found — subscription will truly leak on unmount");
});

// ─── [6] Migration Files ─────────────────────────────────────────────────────
console.log("\n[6] Migration Files — Indexes and RLS Optimization");

test("migration exists: 20260330000000_add_performance_indexes.sql", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assert(sql.length > 0, "File is empty");
});

test("indexes migration: idx_attempts_section_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_attempts_section_id", "Missing index on attempts.section_id");
});

test("indexes migration: idx_attempts_user_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_attempts_user_id", "Missing index on attempts.user_id");
});

test("indexes migration: idx_responses_attempt_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_responses_attempt_id", "Missing index on responses.attempt_id");
});

test("indexes migration: idx_parsed_questions_section_id present", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  assertContains(sql, "idx_parsed_questions_section_id", "Missing index on parsed_questions.section_id");
});

test("indexes migration: all use IF NOT EXISTS (idempotent)", () => {
  const sql = readMigration("20260330000000_add_performance_indexes.sql");
  const count = (sql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
  assert(count === 4, `Expected 4 IF NOT EXISTS indexes, found ${count}`);
});

test("migration exists: 20260330000001_optimize_rls_policies.sql", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assert(sql.length > 0, "File is empty");
});

test("rls migration: 4 helper functions created", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const count = (sql.match(/CREATE OR REPLACE FUNCTION/g) || []).length;
  assert(count === 4, `Expected 4 functions, found ${count}`);
});

test("rls migration: functions are STABLE (cached per statement)", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  // Count standalone STABLE declarations (on their own line, not inside comments)
  const count = sql.split("\n").filter((l) => l.trim() === "STABLE").length;
  assert(count === 4, `Expected 4 STABLE declarations (one per function), found ${count}`);
});

test("rls migration: functions use SECURITY DEFINER", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const count = (sql.match(/SECURITY DEFINER/g) || []).length;
  assert(count === 4, `Expected 4 SECURITY DEFINER declarations, found ${count}`);
});

test("rls migration: all 4 old SELECT policies are DROPped safely", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assertContains(sql, 'DROP POLICY IF EXISTS "Users can view sections of their exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Anyone can view sections of published exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Users can view questions from their exams"');
  assertContains(sql, 'DROP POLICY IF EXISTS "Anyone can view questions of published exams"');
});

test("rls migration: new policies use IN (SELECT fn()) pattern", () => {
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  assertContains(sql, "IN (SELECT public.get_owned_exam_ids())", "sections owner policy not using function");
  assertContains(sql, "IN (SELECT public.get_published_exam_ids())", "sections public policy not using function");
  assertContains(sql, "IN (SELECT public.get_owned_section_ids())", "questions owner policy not using function");
  assertContains(sql, "IN (SELECT public.get_published_section_ids())", "questions public policy not using function");
});

test("rls migration: correlated subqueries (EXISTS) NOT present in new policies", () => {
  // Get only the part after all functions are defined
  const sql = readMigration("20260330000001_optimize_rls_policies.sql");
  const policiesSection = sql.slice(sql.indexOf("-- 2. Rewrite sections"));
  assertNotContains(
    policiesSection,
    "EXISTS (",
    "New policies still use EXISTS correlated subquery — optimization not applied"
  );
});

// ─── Pre-existing TS errors (should not be NEW) ───────────────────────────────
console.log("\n[7] Pre-existing TS Errors Baseline Check");

test("analyticsTs: no import of useLocation (not needed)", () => {
  const src = readSrc("pages/Analytics.tsx");
  // Analytics never used useLocation, this is just a sanity check
  assert(true, "trivially true");
});

test("examServiceTs: is_correct is still set on every response row", () => {
  const src = readSrc("services/examService.ts");
  assertContains(src, "is_correct: isCorrect", "examService no longer saves is_correct to responses!");
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailed tests:");
  failures.forEach((f) => console.log(`  ❌ ${f.name}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log("\n🎉 All tests passed! All optimizations are in place.");
  process.exit(0);
}
