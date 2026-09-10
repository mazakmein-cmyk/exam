/**
 * STUDENTS CANNOT MARK THEIR OWN ANSWERS CORRECT
 *
 * Run with: node src/__tests__/responses-columns-locked.test.mjs
 *
 * 20260837000000 locked the attempts row, so a student cannot PATCH their own
 * score. The answer sheet under it kept the day-one policies: row-level only
 * ("rows belonging to your own attempt"), no column restriction, no trigger —
 * so responses.is_correct was still a student-writable field.
 *
 * It is load-bearing because the creator dashboard does not read the locked
 * score. get_exam_analytics sums COALESCE(r.is_correct, grade_mock_answer(...))
 * per attempt and Analytics.tsx overwrites attempt.score with that count, so
 * Top Students, Score Distribution, the accuracy tiles and every per-question
 * difficulty number come from the answer sheet.
 *
 * The COALESCE is the second half: a NULL verdict is re-graded on the fly, so
 * INSERTing a fresh correct answer AFTER handing the paper in was counted too.
 * That is why the lock needs both halves — the column AND the submitted seal.
 *
 * Migration 20260842000000 adds a BEFORE INSERT OR UPDATE trigger. Browser
 * roles may write selected_answer / is_marked_for_review / time_spent_seconds /
 * status on an OPEN attempt — exactly what examProgress.flushProgress sends —
 * and nothing else. Server functions pass because they run as their owning role.
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
  resolve(ROOT, "supabase/migrations/20260842000000_responses_columns_locked.sql"),
  "utf-8"
);
const PROGRESS = readFileSync(resolve(ROOT, "src/services/examProgress.ts"), "utf-8");
const EXAM_SVC = readFileSync(resolve(ROOT, "src/services/examService.ts"), "utf-8");

const FN = MIGRATION.slice(
  MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.responses_lock_columns"),
  MIGRATION.indexOf("DROP TRIGGER IF EXISTS")
);

console.log("\nSTUDENTS CANNOT MARK THEIR OWN ANSWERS CORRECT\n");

// ─── [1] The lock itself ─────────────────────────────────────────────────────

test("the verdict and the identity columns are inside the lock", () => {
  for (const col of ["is_correct", "id", "attempt_id", "question_id"]) {
    assert(
      new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(FN),
      `the lock lost ${col} — a student could rewrite it`
    );
  }
});

test("the in-exam columns are deliberately NOT locked", () => {
  // flushProgress writes these on every debounce while the paper is open.
  // Locking any of them breaks save-as-you-go and, through it, resume.
  for (const col of ["selected_answer", "is_marked_for_review", "time_spent_seconds", "status"]) {
    assert(
      !new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(FN),
      `${col} is written by the in-exam saver — locking it breaks progress saving`
    );
  }
});

test("an inserted answer is ungraded, whatever the client claimed", () => {
  assert(
    /NEW\.is_correct\s*:=\s*NULL/.test(FN),
    "an answer saved mid-exam must carry no verdict — the grader decides at submit"
  );
});

test("a handed-in paper is sealed, which is what closes the re-grade path", () => {
  assert(
    MIGRATION.includes("RESPONSES_ATTEMPT_SUBMITTED"),
    "without the seal, a post-submission INSERT is re-graded by the COALESCE and counted correct"
  );
  assert(
    /submitted_at\s+INTO\s+v_submitted_at/.test(FN) && /v_submitted_at IS NOT NULL/.test(FN),
    "the seal must read the attempt's submitted_at and refuse once it is set"
  );
});

test("the gate is the role, so server functions pass without rewrites", () => {
  assert(
    MIGRATION.includes("current_user NOT IN ('authenticated', 'anon')"),
    "submit_exam_attempt is SECURITY DEFINER and must pass — it writes the verdicts"
  );
});

test("INSERT and UPDATE only — creator deletes stay untouched", () => {
  assert(
    MIGRATION.includes("BEFORE INSERT OR UPDATE ON public.responses"),
    "the trigger must fire on INSERT (the re-grade path) as well as UPDATE"
  );
  assert(
    !/BEFORE DELETE|OR DELETE/.test(MIGRATION),
    "the creator's section-delete cascade must keep working"
  );
});

test("the migration guards its dependency and proves itself", () => {
  assert(
    MIGRATION.includes("apply 20260831000000_submit_exam_attempt.sql first"),
    "without the server grader the browser still writes is_correct — the lock must refuse to land"
  );
  assert(
    MIGRATION.includes("a student could mark their own answers correct"),
    "the self-check must prove is_correct is covered"
  );
  assert(
    MIGRATION.includes("answers could be added after the paper was handed in"),
    "the self-check must prove the submitted seal survives"
  );
  assert(
    MIGRATION.includes("submit_exam_attempt would be blocked"),
    "the self-check must prove the server passthrough survives"
  );
});

// ─── [2] The client write paths the lock was shaped around ──────────────────

test("the in-exam saver never sends a verdict", () => {
  const row = PROGRESS.slice(
    PROGRESS.indexOf("attempt_id: attemptId"),
    PROGRESS.indexOf("export async function flushProgress")
  );
  assert(row.length > 0, "could not find the progress row builder");
  assert(
    !/is_correct/.test(row),
    "flushProgress must not send is_correct — the trigger nulls it on insert and refuses it on update"
  );
});

test("the client only writes responses when the server did not grade", () => {
  // With the grader present, examService skips the responses write entirely and
  // lets the server's verdicts stand. Any database carrying this trigger has
  // the grader, because migrations are applied in filename order.
  assert(
    EXAM_SVC.includes("const { error: matchError } = serverGraded"),
    "the responses upsert must stay behind the serverGraded guard"
  );
  assert(
    EXAM_SVC.includes("apply migration") && EXAM_SVC.includes("20260831000000"),
    "an ungradable submission must fail loudly rather than write a silent zero"
  );
});

test("a rejected late flush is not fatal to the student", () => {
  // A debounced flush can land after submit. The trigger refuses it; the queue
  // must treat that as a warning, not an error the student sees.
  assert(
    /console\.warn\("exam progress flush failed"/.test(PROGRESS),
    "flushProgress must swallow a refused write"
  );
  assert(
    /return false;/.test(PROGRESS),
    "flushProgress signals failure by return value, not by throwing"
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
