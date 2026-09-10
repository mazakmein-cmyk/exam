/**
 * THE EXAM CLOCK SURVIVES A REFRESH
 *
 * Run with: node src/__tests__/exam-clock-survives-refresh.test.mjs
 *
 * The countdown lived only in the tab's memory: refresh mid-exam and the app
 * handed out a fresh full-length clock plus a second set of attempt rows.
 * Save-as-you-go removed the one deterrent (losing your answers), so F5 became
 * a one-key unlimited-time exploit.
 *
 * Migration 20260836000000 writes the deadline into the attempts row at start,
 * and starting goes through start_exam_clock, which returns the EXISTING
 * unexpired sitting instead of minting new rows — same attempt ids, same
 * deadline, clock still running. The page resumes: saved answers are pulled
 * back (submit rewrites every row from page state, so resuming over blank
 * state would erase them), and a beforeunload confirm adds friction against
 * accidental refreshes. These assertions pin all of it.
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
  resolve(ROOT, "supabase/migrations/20260836000000_exam_clock_in_db.sql"),
  "utf-8"
);
const SIM = readFileSync(resolve(ROOT, "src/pages/ExamSimulator.tsx"), "utf-8");

console.log("\nTHE EXAM CLOCK SURVIVES A REFRESH\n");

// ─── [1] The function's contract ─────────────────────────────────────────────

test("an unexpired sitting resumes instead of minting a fresh clock", () => {
  assert(
    MIGRATION.includes("SELECT MIN(a.clock_deadline_at) INTO v_deadline"),
    "the resume lookup is gone"
  );
  assert(
    MIGRATION.includes("AND a.clock_deadline_at > v_now"),
    "only an unexpired deadline may resume — an expired one is a legitimate new sitting"
  );
  assert(
    MIGRATION.includes("AND a.submitted_at IS NULL"),
    "a submitted sitting must never resume — retakes are normal"
  );
});

test("resuming can only shorten, never lengthen", () => {
  // MIN() across whatever live rows exist: if several deadlines coexist the
  // strictest one wins, so no arrangement of rows hands out more time.
  assert(
    MIGRATION.includes("MIN(a.clock_deadline_at)"),
    "the strictest deadline must win"
  );
  assert(
    MIGRATION.includes("LEAST(GREATEST(COALESCE(p_clock_seconds, 0), 10), 24 * 60 * 60)"),
    "the requested clock must be floored and capped"
  );
});

test("the function runs as the caller, through the existing RLS", () => {
  assert(
    MIGRATION.includes("SECURITY INVOKER"),
    "INVOKER is the design: the student-only insert policy from 20260801000000 must keep applying"
  );
  assert(
    MIGRATION.includes("must stay SECURITY INVOKER"),
    "the self-check must refuse a definer rewrite"
  );
});

test("created_at keeps the one-millisecond stagger the sitting-stitch depends on", () => {
  assert(
    MIGRATION.includes("v_now + (s.ord - 1) * interval '1 millisecond'"),
    "identical created_at stamps split one sitting in two on ExamReview's walk"
  );
});

test("the resume lookup has its partial index", () => {
  assert(
    MIGRATION.includes("idx_attempts_live_clock") &&
      MIGRATION.includes("WHERE submitted_at IS NULL AND clock_deadline_at IS NOT NULL"),
    "without the partial index every start scans the student's whole attempt history"
  );
});

// ─── [2] The page resumes rather than resets ─────────────────────────────────

test("the start handler calls the clock function and keeps the legacy insert as fallback", () => {
  assert(
    /supabase\.rpc\(\s*"start_exam_clock"/.test(SIM),
    "handleStartSection must go through start_exam_clock"
  );
  assert(
    SIM.includes('.from("attempts")') && SIM.includes(".insert("),
    "the plain insert must survive as the fallback until the migration is pasted"
  );
});

test("a resumed sitting gets the remainder, not the allowance", () => {
  assert(
    SIM.includes("resumedSecondsLeft ?? clockMinutes * 60"),
    "the worker must be armed with the remaining seconds on a resume"
  );
});

test("resuming pulls saved answers back before the states are set", () => {
  // Submit rewrites every response row from page state; a resumed clock over
  // blank state would ERASE the saved answers.
  const start = SIM.indexOf("if (resumedSecondsLeft !== null)");
  const setStates = SIM.indexOf("setQuestionStates(initialStates)");
  assert(start !== -1, "the resume branch is gone");
  assert(
    setStates !== -1 && start < setStates,
    "saved answers must be overlaid before setQuestionStates, or submit wipes them"
  );
  const branch = SIM.slice(start, setStates);
  assert(
    branch.includes('.select("*")'),
    "the responses read must be select(\"*\") so a missing column cannot fail it"
  );
});

// ─── [3] The friction ────────────────────────────────────────────────────────

test("leaving mid-exam asks the browser's are-you-sure", () => {
  const fx = SIM.indexOf('window.addEventListener("beforeunload", warnBeforeLeaving)');
  assert(fx !== -1, "the beforeunload warning is gone");
  const effect = SIM.slice(SIM.lastIndexOf("useEffect", fx), fx);
  assert(
    effect.includes("if (!hasStarted || isPreview) return;"),
    "armed only while a real sitting runs — not on previews, not after submit"
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
