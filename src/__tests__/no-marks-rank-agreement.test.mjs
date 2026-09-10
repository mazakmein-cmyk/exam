/**
 * NO MARKS → EVERY SURFACE RANKS BY CORRECT COUNT (issue 9)
 *
 * Run with: node src/__tests__/no-marks-rank-agreement.test.mjs
 *
 * With no marking scheme configured, the creator's Top Students ranked by
 * accuracy RATIO while the student rank badge (get_my_exam_ranks) ranked by
 * raw correct COUNT — so whenever sittings differed in size (a partial
 * sitting, a one-section retake), the two screens crowned different students
 * and both were "right" by their own rule.
 *
 * Owner's decision (2026-08-23): raw correct count is the source of truth
 * everywhere when there are no marks. The SQL already did that; these
 * assertions pin the creator board to the same rule so the two can never
 * drift apart again without a test going red.
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

const ANALYTICS = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");
const RANKS_SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260828010000_student_exam_ranks_jsonb.sql"),
  "utf-8"
);

console.log("\nNO MARKS → EVERY SURFACE RANKS BY CORRECT COUNT\n");

test("the creator board's no-marks value is the raw correct count", () => {
  assert(
    ANALYTICS.includes("rankByMarks ? s.totalMarks : s.totalScore"),
    "rankValueOf must be totalScore when marks are off — not a ratio"
  );
  assert(
    !ANALYTICS.includes("s.totalScore / s.totalQuestions : 0"),
    "the accuracy-ratio fallback is back — the two screens will disagree again"
  );
});

test("the student side still ranks by the same raw count", () => {
  assert(
    RANKS_SQL.includes("ELSE r.total_score"),
    "get_my_exam_ranks must keep total_score as its no-marks ranking key — it is the rule the creator board was aligned TO"
  );
});

test("ties share a rank, as the SQL's RANK() does", () => {
  // The loop walks `board` rather than `sessions` since the marks-gate fix —
  // the same list, filtered to sittings someone actually answered. The tie rule
  // itself is unchanged, and that is what this pins.
  assert(
    ANALYTICS.includes("rankValueOf(s) === rankValueOf(board[i - 1])"),
    "competition-style shared ranks must survive — equal counts are equal ranks"
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
