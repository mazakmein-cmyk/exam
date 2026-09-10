/**
 * BLANK ANSWERS ARE UNANSWERED, NOT WRONG
 *
 * Run with: node src/__tests__/blank-answer-skip.test.mjs
 *
 * A student who types into a text/numeric box and backspaces it empty stores
 * "" with status "attempted". The scorer's skip test was null-only, so the
 * blank fell through to scoreSCQ's wrong-answer branch and took the full
 * negative-marking penalty — while the palette, the submit confirmation and
 * the review screen all called the same question unanswered (hasAnswer treats
 * "" and [] as no answer). The Clear Response button is disabled once the box
 * is empty, so the student could not even undo it.
 *
 * The creator dashboard had the same disagreement one layer down:
 * get_exam_analytics split wrong-vs-unanswered on `selected_answer IS NULL`
 * only, so the cleared box read as WRONG to the creator and UNANSWERED to the
 * student, and the "" entry could win the most_common_wrong tally as a blank
 * "Most chose wrong option:" label.
 *
 * The rule now lives in three deliberate copies (the engine must stay
 * import-free, and SQL cannot import): examNavigation.hasAnswer,
 * scoringEngine.hasAnswerValue, and mock_answer_present in 20260833000000.
 * These assertions pin all three to the same body so a change to one without
 * the others fails loudly here.
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

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

const ENGINE = read("src/services/scoringEngine.ts");
const NAV = read("src/lib/examNavigation.js");
const SIMULATOR = read("src/pages/ExamSimulator.tsx");
const ANALYTICS = read("src/pages/Analytics.tsx");
const MIGRATION = read(
  "supabase/migrations/20260833000000_blank_answers_are_unanswered.sql"
);

console.log("\nBLANK ANSWERS ARE UNANSWERED, NOT WRONG\n");

// ─── [1] The engine skips blanks ─────────────────────────────────────────────

test("calculateMarks treats a blank answer as skipped, not as an attempt", () => {
  assert(
    ENGINE.includes("!hasAnswerValue(state.selectedAnswer)"),
    "the isSkipped test must use the shared no-answer rule"
  );
  assert(
    !ENGINE.includes("state.selectedAnswer === null ||"),
    "the null-only skip test is back — '' and [] fall through to the wrong-answer branch again"
  );
});

test("scoreSCQ guards blanks itself, for callers that pass isSkipped=false", () => {
  assert(
    ENGINE.includes("if (isSkipped || !hasAnswerValue(selectedAnswer))"),
    "scoreSCQ must not compare a blank against the key — that lands on -marks_wrong"
  );
});

test("the engine stays import-free (its copy is local, not imported)", () => {
  assert(
    !/^import /m.test(ENGINE),
    "scoringEngine must stay import-free and deterministic"
  );
});

// ─── [2] The three copies of the rule are the same rule ─────────────────────

test("hasAnswerValue is a line-for-line copy of examNavigation's hasAnswer", () => {
  const body = [
    "if (value == null) return false;",
    "if (Array.isArray(value)) return value.length > 0;",
    'if (typeof value === "string") return value.trim() !== "";',
    "return true;",
  ];
  for (const line of body) {
    assert(ENGINE.includes(line), `engine copy lost: ${line}`);
    assert(NAV.includes(line), `examNavigation lost: ${line}`);
  }
});

test("the SQL copy handles every shape the browser rule does", () => {
  assert(
    MIGRATION.includes("CREATE OR REPLACE FUNCTION public.mock_answer_present"),
    "mock_answer_present is gone"
  );
  assert(
    MIGRATION.includes("WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN false"),
    "SQL/JSON null must be no answer"
  );
  assert(
    MIGRATION.includes("WHEN jsonb_typeof(v) = 'string' THEN btrim(v #>> '{}') <> ''"),
    "blank and whitespace-only strings must be no answer"
  );
  assert(
    MIGRATION.includes("WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) > 0"),
    "an empty array must be no answer"
  );
});

// ─── [3] The runner stops calling a cleared box an attempt ──────────────────

test("typing then backspacing to empty demotes the status, so palette, scorer and review agree", () => {
  assert(
    SIMULATOR.includes('status: hasAnswer(value) ? "attempted" : "viewed"'),
    "handleAnswerChange must not stamp status 'attempted' on a blank value"
  );
});

// ─── [4] Creator analytics splits wrong-vs-unanswered on the same rule ──────

test("get_exam_analytics counts a blank as unanswered, not wrong", () => {
  assert(
    MIGRATION.includes(
      "NOT r.correct AND NOT public.mock_answer_present(r.selected_answer)"
    ),
    "unanswered_count must use the shared rule, not a null-only test"
  );
  assert(
    MIGRATION.includes(
      "NOT r.correct AND public.mock_answer_present(r.selected_answer)"
    ),
    "wrong_count must be the complement of the same rule"
  );
});

test("a blank cannot win the most_common_wrong tally", () => {
  const tally = MIGRATION.slice(
    MIGRATION.indexOf("wrong_tally AS ("),
    MIGRATION.indexOf("wrong_top AS (")
  );
  assert(
    tally.includes("AND public.mock_answer_present(r.selected_answer)"),
    "wrong_tally must exclude blanks or an invisible label wins the panel"
  );
});

test("the migration proves the summary was actually rebuilt", () => {
  assert(
    MIGRATION.includes("pg_get_functiondef('public.get_exam_analytics(uuid)'::regprocedure)"),
    "the self-check must inspect the deployed function, not trust the paste"
  );
  assert(
    MIGRATION.includes("apply 20260828000000_exam_analytics_summary.sql first"),
    "must refuse to run before the summary migration it rebuilds"
  );
});

// ─── [5] The dashboard tolerates rows counted before the migration ──────────

test("Analytics drops a blank most_common_wrong label instead of rendering it", () => {
  // Since question stats are pooled across languages, this is enforced twice:
  // a blank label from any one translation is skipped before it can win the
  // pooled vote or become the fallback, and the pooled result is nulled if it
  // still comes out blank. The variable is no longer `agg.most_common_wrong`,
  // but the guarantee is the same one — and stricter.
  assert(
    ANALYTICS.includes('if (typeof label !== "string" || label.trim() === "") return;'),
    "a blank label must not be eligible to win the pooled vote"
  );
  assert(
    ANALYTICS.includes('typeof mostCommonWrong === "string" && mostCommonWrong.trim() !== ""'),
    "legacy blank labels (counted before 20260833000000) must read as null"
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
