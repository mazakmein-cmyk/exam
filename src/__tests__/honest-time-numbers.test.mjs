/**
 * HONEST TIME NUMBERS (issue 12 + the solve-time comparison)
 *
 * Run with: node src/__tests__/honest-time-numbers.test.mjs
 *
 * Two time features, one migration (20260838000000):
 *
 * 1. "Avg Time / Question" divided by the paper's FULL question count, so
 *    abandoning 90 of 100 questions read as being 10x faster — the metric
 *    rewarded quitting. submit_exam_attempt now counts the questions the
 *    student actually opened (questions_visited) while it grades, and the
 *    tile divides by that, falling back to the old denominator on rows older
 *    than the migration.
 *
 * 2. A student could see they spent 3 minutes on Q17 with no idea whether
 *    that is slow or normal. The review page now shows "Avg time to solve
 *    correctly" per question — the average over CORRECT answers, aggregates
 *    only, no identities, served only to people who sat (or own) the exam.
 *    Owner's wording: generic, never "class average".
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
  resolve(ROOT, "supabase/migrations/20260838000000_question_time_stats.sql"),
  "utf-8"
);
const ANALYTICS = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");
const REVIEW = readFileSync(resolve(ROOT, "src/pages/ExamReview.tsx"), "utf-8");

console.log("\nHONEST TIME NUMBERS\n");

// ─── [1] The visited count ───────────────────────────────────────────────────

test("submit counts visited questions from the rows it just graded", () => {
  assert(
    MIGRATION.includes("COALESCE(s.time_spent_seconds, 0) > 0") &&
      MIGRATION.includes("s.status IN ('viewed', 'attempted')"),
    "visited = spent time on it, moved through it, or answered it"
  );
  assert(
    MIGRATION.includes("questions_visited     = v_visited"),
    "the attempt stamp must write the visited count"
  );
  assert(
    MIGRATION.includes("avg_time_per_question = v_time_on_questions::numeric / v_total"),
    "avg_time_per_question must keep its old base — the dashboard reconstructs total time as avg x total_questions"
  );
});

test("the visited and answered counts join the column lock", () => {
  assert(
    MIGRATION.includes("NEW.questions_visited     IS DISTINCT FROM OLD.questions_visited"),
    "a browser rewriting questions_visited re-fakes the speed metric"
  );
  assert(
    MIGRATION.includes("NEW.questions_answered    IS DISTINCT FROM OLD.questions_answered"),
    "a browser rewriting questions_answered re-fakes the accuracy tile"
  );
  assert(
    MIGRATION.includes("NEW.clock_deadline_at     IS DISTINCT FROM OLD.clock_deadline_at"),
    "rebuilding the lock must not drop the columns 20260837000000 protected"
  );
});

test("answered = the shared hasAnswer rule, stamped in the same pass (issue 13)", () => {
  assert(
    MIGRATION.includes("public.mock_answer_present(s.selected_answer)"),
    "'answered' must mean the stored answer passes hasAnswer — '' and [] are not answers"
  );
  assert(
    MIGRATION.includes("questions_answered    = v_answered"),
    "the attempt stamp must write the answered count"
  );
  assert(
    MIGRATION.includes("apply 20260833000000_blank_answers_are_unanswered.sql first"),
    "the answered rule depends on mock_answer_present — the guard must say so"
  );
});

test("the dashboard shows BOTH numbers, each explained (issue 13, option B)", () => {
  assert(
    ANALYTICS.includes("(a as any).questions_answered ?? a.total_questions ?? 0"),
    "true accuracy must fall back to the old denominator on pre-migration rows"
  );
  assert(
    ANALYTICS.includes("{trueAccuracy.toFixed(1)}%"),
    "the big number on the Accuracy tile must be true accuracy"
  );
  assert(
    /Score: <span[^>]*>\{overallAccuracy\.toFixed\(1\)\}%/.test(ANALYTICS),
    "the score% must stay visible beside it — it is a real, useful number under its honest name"
  );
  // The owner asked for tooltips explaining what each number is and how it is
  // calculated — both must exist, and both must actually explain the division.
  assert(
    ANALYTICS.includes("correct answers ÷ questions answered"),
    "the Accuracy tooltip must state the calculation"
  );
  assert(
    ANALYTICS.includes("skipping lowers your score, not your accuracy"),
    "the Score tooltip must state the difference in plain words"
  );
  assert(
    ANALYTICS.includes("Avg Score %"),
    "the creator tile must stop calling its score percentage 'Accuracy / Q'"
  );
});

test("the tile divides by visited, with the old denominator as fallback", () => {
  assert(
    ANALYTICS.includes("(a as any).questions_visited ?? a.total_questions ?? 0"),
    "rows older than the migration must fall back, not read as zero"
  );
  assert(
    ANALYTICS.includes("totalTimeSpentQs / totalVisitedQs"),
    "the speed tile must divide by questions actually opened"
  );
  assert(
    ANALYTICS.includes("Avg Time / Attempted Question") &&
      ANALYTICS.includes("Avg Time / Attempted Q"),
    "both tiles must say what the number now means"
  );
});

// ─── [2] The solve-time comparison ───────────────────────────────────────────

test("the stats function serves aggregates to participants only", () => {
  // Bounded at the GRANT line — running to end-of-file would sweep in the
  // self-check block, whose probes mention 'user_id' as a string.
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.get_exam_question_time_stats"),
    MIGRATION.indexOf("REVOKE EXECUTE ON FUNCTION public.get_exam_question_time_stats")
  );
  assert(
    fn.includes("e.user_id = auth.uid()") && fn.includes("a.user_id = auth.uid()"),
    "only the exam's creator or someone who attempted it may ask"
  );
  assert(
    fn.includes("a.user_id <> e.user_id"),
    "the creator's own attempts must not feed the averages"
  );
  assert(
    fn.includes("= true") && fn.includes("grade_mock_answer"),
    "the average is over CORRECT answers — solve time, not stare time"
  );
  assert(
    fn.includes("'avg_seconds'") && fn.includes("'solved_count'") && !fn.includes("'user_id'"),
    "aggregates only — no identity may ride along"
  );
});

test("the review page shows it with the owner's generic wording", () => {
  assert(
    REVIEW.includes("Avg time to solve correctly:"),
    "the label is gone"
  );
  assert(
    !/class avg|class average/i.test(REVIEW),
    "owner's wording: never say class average"
  );
  assert(
    REVIEW.includes('get_exam_question_time_stats", { p_exam_id: examId }'),
    "the stats ride the review page's existing parallel load — one cold-path call"
  );
  assert(
    REVIEW.includes("?? {}"),
    "a database without the migration must degrade to showing nothing extra"
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
