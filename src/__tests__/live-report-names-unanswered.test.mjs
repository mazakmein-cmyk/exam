/**
 * LIVE EXAMS — THE REPORT CAN NAME A QUESTION NOBODY ANSWERED
 *
 * Run with: node src/__tests__/live-report-names-unanswered.test.mjs
 *
 * WHAT WAS BROKEN (doc #29)
 * build_live_exam_report worked out each question's number by looking at
 * somebody's ANSWER to it — the play position is stored on live_responses, not
 * on the question. A question with zero responses therefore had no position, the
 * report sent null, and the page rendered `Q{(q.ordinal ?? 0) + 1}`, turning
 * "we don't know which question this is" into "Q1". Several unanswered
 * questions all came out as "Q1" at once, beside the genuine question 1.
 *
 * WHY IT IS WORSE THAN A COSMETIC BUG
 * The report answers "what do I reteach". A question nobody attempted is the
 * strongest signal it carries — and it was the exact kind the report could not
 * name. The teacher re-covers question 1, which was fine, while the questions
 * that actually defeated the room stay anonymous.
 *
 * THE SHAPE OF THE FIX
 * A position belongs to the QUESTION, so it is read from the question list.
 * live_primary_questions is the single definition of play order in this
 * database and answers whether or not anybody responded — the same repair, for
 * the same reason, as the skip count in 20260847000000.
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

const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
const MIG = read("supabase/migrations/20260848000000_live_report_names_unanswered_questions.sql");
const CODE = MIG.replace(/--[^\n]*/g, "");
const PAGE = read("src/pages/LiveExamReport.tsx");
/** Comments quote the old expression to explain it; only code counts. */
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
/** Exactly what Postgres will store as prosrc — comments included. */
const BODY = MIG.slice(
  MIG.indexOf("CREATE OR REPLACE FUNCTION public.build_live_exam_report"),
  MIG.indexOf("\nGRANT EXECUTE ON FUNCTION public.build_live_exam_report")
);

console.log("\n══ Live exams: the report names every question ══");

// ─── [1] The server ─────────────────────────────────────────────────────────
console.log("\n[1] A position comes from the question, not from an answer");

test("the ordinal is joined from the primary question list", () => {
  assert(
    /LEFT JOIN public\.live_primary_questions\(p_live_exam_id\) lr\s*ON lr\.id = a\.live_question_id/.test(CODE),
    "this is the one definition of play order in the database, and it answers whether or not anybody responded"
  );
  assert(
    /lr\.ordinal AS ordinal/.test(CODE),
    "the select list has to read the new column too, or the join is decoration"
  );
});

test("the response-derived join is gone, not merely joined alongside", () => {
  assert(
    !/SELECT DISTINCT r\.question_ordinal/.test(BODY),
    "leaving the old lateral in place would keep null-ing the questions with no responses"
  );
});

test("it is a LEFT join", () => {
  assert(
    /LEFT JOIN public\.live_primary_questions/.test(CODE),
    "an analytics row whose question is not in the primary list should still appear with no number, rather than vanish from the report entirely"
  );
});

test("the undo case stops being arbitrary", () => {
  // The old LIMIT 1 picked any one response; after an undo-and-re-ask the
  // responses to a single question can carry different ordinals.
  assert(
    !/LIMIT 1\s*\)\s*lr/.test(BODY),
    "the arbitrary pick must go with the join that needed it"
  );
});

// ─── [2] Nothing else about the report moved ────────────────────────────────
console.log("\n[2] The rest of the report survives the rewrite");

test("every other panel's field is still built", () => {
  for (const field of [
    "skipped_count", "option_distribution", "confusion_count",
    "anon_ordinal", "median_time_ms", "impulsive_wrong",
  ]) {
    assert(BODY.includes(field), `the report lost ${field}, which blanks a panel rather than erroring`);
  }
});

test("the self-check guards those fields too", () => {
  assert(
    /the report lost a field it used to carry/.test(MIG),
    "this migration retypes a large function; a dropped field is silent"
  );
});

test("the self-check's own grep cannot be tripped by a comment", () => {
  // prosrc includes comments, so quoting the old SQL in an explanatory comment
  // would make the migration fail against itself. It has done exactly that once
  // before in this project.
  assert(
    !/SELECT DISTINCT r\.question_ordinal/.test(BODY),
    "the old join must not appear even inside a comment in the function body"
  );
  assert(
    /prosrc includes comments/.test(BODY),
    "and the reason should be written down where the next person will edit it"
  );
});

test("creators keep the grant", () => {
  assert(
    /GRANT EXECUTE ON FUNCTION public\.build_live_exam_report\(UUID\) TO authenticated/i.test(CODE),
    "losing it means no session can produce a report"
  );
});

// ─── [3] Reports already stored ─────────────────────────────────────────────
console.log("\n[3] Existing reports are rebuilt");

test("stored payloads are regenerated", () => {
  assert(
    /UPDATE public\.live_exam_reports\s*SET payload = public\.build_live_exam_report\(v_id\)/.test(CODE),
    "the payload is a snapshot taken at end_live_session and nothing refreshes it, so without this the fix reaches only future sessions"
  );
});

test("one bad report does not abort the migration", () => {
  assert(
    /EXCEPTION WHEN OTHERS THEN[\s\S]{0,200}could not rebuild report for/.test(MIG),
    "a single unbuildable payload must not take the other ninety-nine with it"
  );
});

// ─── [4] The page ───────────────────────────────────────────────────────────
console.log("\n[4] The page never invents a question number");

test("no call site defaults a missing position to zero", () => {
  assert(
    !/ordinal \?\? 0/.test(PAGE_CODE),
    "`(ordinal ?? 0) + 1` is the bug: it renders an unknown position as question 1"
  );
  // The helper's own doc comment quotes that expression to explain it, which is
  // why this asserts on code with comments stripped. The SQL self-check in the
  // migration had to learn the same lesson about prosrc.
  assert(
    /ordinal \?\? 0/.test(PAGE),
    "the explanation of what was wrong should stay next to the fix"
  );
});

test("there is one labelling rule, used everywhere", () => {
  assert(/function questionLabel\(/.test(PAGE), "three copies of the same expression is how they drifted");
  assert(
    (PAGE.match(/questionLabel\(q\.ordinal\)/g) || []).length === 3,
    "all three call sites must use it"
  );
});

test("an unknown position renders as a dash, not a number", () => {
  assert(
    /ordinal === null \|\| ordinal === undefined \? "Q—"/.test(PAGE),
    "the server no longer sends null, but this page renders payloads STORED before that migration, so the null case is still reachable and must not resolve to a real question"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  The questions that defeated the room are no longer anonymous.\n");
