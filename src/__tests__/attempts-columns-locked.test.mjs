/**
 * STUDENTS CANNOT EDIT THEIR OWN RESULTS (issue 14)
 *
 * Run with: node src/__tests__/attempts-columns-locked.test.mjs
 *
 * The attempts UPDATE policy is row-level only (auth.uid() = user_id) — RLS
 * cannot restrict columns — so a student with devtools could PATCH their own
 * marks_score, submitted_at, the time fields, and since 20260836000000 their
 * own clock_deadline_at (their exam deadline).
 *
 * Migration 20260837000000 adds a BEFORE UPDATE trigger: browser roles
 * (authenticated/anon) may change marks_score/marks_max — the marks engine
 * legitimately runs client-side — and NOTHING else. Server functions pass
 * because they run as their owning role, so submit_exam_attempt needed no
 * rewrite. These assertions pin the lock, the passthrough, and the two client
 * write paths the lock was shaped around.
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
  resolve(ROOT, "supabase/migrations/20260837000000_attempts_columns_locked.sql"),
  "utf-8"
);
const SCORING = readFileSync(resolve(ROOT, "src/services/scoringService.ts"), "utf-8");
const EXAM_SVC = readFileSync(resolve(ROOT, "src/services/examService.ts"), "utf-8");

console.log("\nSTUDENTS CANNOT EDIT THEIR OWN RESULTS\n");

// ─── [1] The lock itself ─────────────────────────────────────────────────────

test("every trusted column is inside the lock", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.attempts_lock_columns"),
    MIGRATION.indexOf("DROP TRIGGER IF EXISTS")
  );
  for (const col of [
    "id",
    "user_id",
    "section_id",
    "language",
    "score",
    "total_questions",
    "accuracy_percentage",
    "avg_time_per_question",
    "time_spent_seconds",
    "started_at",
    "created_at",
    "submitted_at",
    "clock_deadline_at",
  ]) {
    assert(
      new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(fn),
      `the lock lost ${col} — a student could rewrite it`
    );
  }
});

// 20260843000000 moved the marks engine into the database and closed
// 20260837000000's stated residual, replacing this function wholesale. The
// invariants are asserted against the LIVE definition — asserting the older
// file would pass while the function the database actually runs had drifted.
test("marks_score and marks_max are locked too, by the later migration", () => {
  const live = readFileSync(
    resolve(ROOT, "supabase/migrations/20260843000000_marks_scored_in_db.sql"),
    "utf-8"
  );
  const fn = live.slice(
    live.indexOf("CREATE OR REPLACE FUNCTION public.attempts_lock_columns"),
    live.indexOf("-- 5. The marks log is a server record too.")
  );
  assert(fn.length > 0, "could not find the live lock definition");
  for (const col of ["marks_score", "marks_max"]) {
    assert(
      new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(fn),
      `${col} decides rank whenever an exam has marks — leaving it writable lets a student pick their own placement`
    );
  }
  // Every column the earlier migration locked must survive the replacement.
  for (const col of ["score", "submitted_at", "clock_deadline_at"]) {
    assert(
      new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`).test(fn),
      `the replacement dropped ${col} from the lock`
    );
  }
});

test("the gate is the role, so server functions pass without rewrites", () => {
  assert(
    MIGRATION.includes("current_user NOT IN ('authenticated', 'anon')"),
    "SECURITY DEFINER functions (submit_exam_attempt) run as their owner and must pass"
  );
});

test("UPDATE only — inserts and creator deletes stay untouched", () => {
  assert(
    MIGRATION.includes("BEFORE UPDATE ON public.attempts"),
    "the trigger must fire on UPDATE"
  );
  assert(
    !/BEFORE (INSERT|DELETE)/.test(MIGRATION),
    "the legacy start insert and the creator's section-delete cascade must keep working"
  );
});

test("the migration guards its dependency and proves itself", () => {
  assert(
    MIGRATION.includes("apply 20260836000000_exam_clock_in_db.sql first"),
    "the trigger reads clock_deadline_at — it must refuse to land before that column exists"
  );
  assert(
    MIGRATION.includes("a student could extend their own exam"),
    "the self-check must prove the clock column is covered"
  );
  assert(
    MIGRATION.includes("submit_exam_attempt would be blocked"),
    "the self-check must prove the server passthrough survives"
  );
});

// ─── [2] The two client write paths the lock was shaped around ──────────────

test("the marks save touches exactly the two unlocked columns", () => {
  const fn = SCORING.slice(
    SCORING.indexOf("export async function updateAttemptMarks"),
    SCORING.indexOf("// ─── Marks Log Read")
  );
  assert(
    fn.includes("marks_score:") && fn.includes("marks_max:"),
    "updateAttemptMarks must write the marks columns"
  );
  assert(
    // \b keeps "marks_score:" from matching the bare "score:" probe —
    // underscore is a word character, so the boundary only lands on the
    // standalone column name.
    !/submitted_at|clock_deadline_at|\bscore:|total_questions|time_spent/.test(fn),
    "updateAttemptMarks must not touch a locked column"
  );
});

test("the legacy client stamp only runs where the lock cannot exist", () => {
  // examService stamps submitted_at/score client-side ONLY when
  // submit_exam_attempt is missing — and any database with this trigger has
  // that function, because migrations are applied in filename order.
  const at = EXAM_SVC.indexOf('.update({\n                submitted_at:');
  const guarded = EXAM_SVC.indexOf("if (!serverGraded) {");
  assert(
    guarded !== -1 && (at === -1 || guarded < at),
    "the client-side stamp must stay behind the !serverGraded guard"
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
