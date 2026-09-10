/**
 * ONE CLOSED TAB MUST NOT DECIDE HOW A COHORT IS RANKED
 *
 * Run with: node src/__tests__/marks-gate-submitted-only.test.mjs
 *
 * Top Students picks its ranking basis with
 *   rankByMarks = sessions.every(s => s.sessionHasMarks)
 * and marks are written by the grader, which only runs on submission. So an
 * abandoned sitting carries marks_score NULL by construction — not because the
 * creator misconfigured anything — and a single one vetoed marks-ranking for
 * the whole exam.
 *
 * The board then ranked by RAW CORRECT COUNT, which inverts the result on any
 * paper with negative marking: a student who guessed 130 questions (50 right,
 * −1 each) outranks one who answered only what she knew (45 right, 5 wrong),
 * because the penalty she avoided stops being counted. The board recommends
 * exactly the behaviour the marking scheme exists to punish, and nothing on
 * screen says the basis changed.
 *
 * get_my_exam_ranks never had this problem: it filters `submitted_at IS NOT
 * NULL` BEFORE its bool_and(has_marks). Same gate, different population — so
 * the creator's board and every student's rank badge disagreed.
 *
 * The fix is scoped to the GATE. What the board shows and ranks by is
 * deliberately untouched.
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

const PAGE = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");
const RANK_SQL = readFileSync(
  resolve(ROOT, "supabase/migrations/20260828010000_student_exam_ranks_jsonb.sql"),
  "utf-8"
);

console.log("\nONE CLOSED TAB MUST NOT DECIDE HOW A COHORT IS RANKED\n");

// ─── [1] The gate ───────────────────────────────────────────────────────────

test("only handed-in sections decide whether a sitting has marks", () => {
  assert(
    /const marksCounted = counted\.filter\(a => a\.submitted_at\)/.test(PAGE),
    "an abandoned section has no marks by construction and must not be asked"
  );
  assert(
    /sessionHasMarks:\s*\n?\s*marksCounted\.length > 0 && marksCounted\.every\(a => marksOf\(a\)\.hasMarks\)/.test(PAGE),
    "sessionHasMarks must be judged over the submitted subset"
  );
});

test("a sitting that was never handed in gets no vote at all", () => {
  // Judging it as "has no marks" would be just as poisonous as before.
  assert(
    /const gateSessions = board\.filter\(s => s\.hasSubmitted\)/.test(PAGE),
    "sittings with nothing submitted must be excluded from the gate, not failed by it"
  );
  assert(
    /rankByMarks =\s*\n?\s*gateSessions\.length > 0 && gateSessions\.every\(s => s\.sessionHasMarks\)/.test(PAGE),
    "the gate must run over the submitted sittings only"
  );
});

test("the gate now matches the server's, which never had this bug", () => {
  assert(
    /a\.submitted_at IS NOT NULL/.test(RANK_SQL) &&
      /bool_and\(g\.has_marks\) OVER \(PARTITION BY g\.exam_id\)/.test(RANK_SQL),
    "the server filters to submitted before its bool_and — if that changes, re-check this page"
  );
});

// ─── [2] The ghost sitting ──────────────────────────────────────────────────

test("a sitting nobody answered does not appear on Top Students", () => {
  assert(
    /const board = sessions\.filter\(s => s\.hasEngaged\)/.test(PAGE),
    "every tile on the page ignores these; the board must too"
  );
  assert(
    /hasEngaged: atts\.some\(a => a\.engaged !== false\)/.test(PAGE),
    "engagement is judged over the whole sitting, so a superseded attempt still counts as proof"
  );
});

test("the board, the sort and the ranks all read the same filtered list", () => {
  assert(/board\.sort\(\(a, b\) => \{/.test(PAGE), "sorting must use the filtered list");
  assert(/for \(let i = 0; i < board\.length; i\+\+\)/.test(PAGE), "ranking must walk the filtered list");
  assert(
    /rankValueOf\(board\[i - 1\]\)/.test(PAGE),
    "the tie check must compare against the filtered list, or ranks skip numbers"
  );
});

// ─── [3] What must NOT have changed ─────────────────────────────────────────

test("abandoned rows keep their protective role in the per-section tie-break", () => {
  // They are kept deliberately: letting a later abandoned row supersede a
  // finished one would delete a section the student actually completed.
  assert(
    /const aDone = !!a\.submitted_at;[\s\S]{0,160}if \(aDone !== bDone\) return aDone;/.test(PAGE),
    "submitted must still beat abandoned when choosing which attempt counts"
  );
});

test("the numbers the board shows are untouched", () => {
  for (const [label, re] of [
    ["totalScore", /totalScore: counted\.reduce\(\(s, a\) => s \+ \(a\.score \|\| 0\), 0\)/],
    ["totalQuestions", /totalQuestions: counted\.reduce\(\(s, a\) => s \+ \(a\.total_questions \|\| 0\), 0\)/],
    ["totalMarks", /totalMarks: counted\.reduce\(\(s, a\) => s \+ marksOf\(a\)\.value, 0\)/],
  ]) {
    assert(re.test(PAGE), `${label} must still be summed over every counted section — this fix is the gate only`);
  }
});

test("an un-migrated database sees no change at all", () => {
  // engaged defaults to true without 20260845000000, so `board` === `sessions`.
  assert(
    /engaged: engagedMigrated \? engagedIds\.has\(attempt\.id\) : true/.test(PAGE),
    "the engaged flag must default true, or the board would empty on an un-migrated database"
  );
});

console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("─".repeat(60) + "\n");
