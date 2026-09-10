/**
 * ONE QUESTION IS ONE ROW, WHATEVER LANGUAGE IT WAS READ IN
 *
 * Run with: node src/__tests__/question-stats-pooled-across-languages.test.mjs
 *
 * A bilingual paper stores one parsed_questions row per language — that is how
 * a Hindi student sees Hindi text — linked to its primary twin by
 * question_group_id, a pairing PublishExamDialog refuses to ship without.
 *
 * Question Analysis fetched every language (no filter) and grouped by section
 * NAME, which every variant shares. So a 25-question paper listed 50 rows: each
 * question twice, each copy carrying only the students who sat in that
 * language. Neither number was wrong; the one a creator actually wants —
 * 80 correct out of 200 across the whole class — was nowhere on the screen.
 * It also crowded the top-5 insight panels, where both copies of a question
 * competed for slots.
 *
 * Stats are now pooled per question_group_id and the content is taken from the
 * primary language.
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
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \u274c ${name}`);
    console.log(`     -> ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const PAGE = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");
const PUBLISH = readFileSync(resolve(ROOT, "src/components/PublishExamDialog.tsx"), "utf-8");

console.log("\nONE QUESTION IS ONE ROW, WHATEVER LANGUAGE IT WAS READ IN\n");

test("questions are grouped by question_group_id", () => {
  assert(
    /const key = q\.question_group_id \|\| q\.id;/.test(PAGE),
    "the group id is what links a translation to its primary twin"
  );
  assert(
    /questionGroups\.get\(key\)!\.push\(q\)/.test(PAGE),
    "every language row for a question must land in one bucket"
  );
});

test("a single-language exam is completely unaffected", () => {
  // No group id means the question is its own group, so the map has one row per
  // question and every pooled sum is a sum of one.
  assert(
    /q\.question_group_id \|\| q\.id/.test(PAGE),
    "the fallback to the question's own id is what makes this a no-op for single-language exams"
  );
});

test("the counts are summed across every language", () => {
  assert(
    /const pool = \(field: string\) => aggs\.reduce\(\(n, a\) => n \+ \(a\[field\] \?\? 0\), 0\)/.test(PAGE),
    "pooling must add the per-language aggregates, not pick one"
  );
  for (const field of [
    "total_attempts",
    "correct_count",
    "wrong_count",
    "unanswered_count",
    "reviewed_count",
    "total_time_seconds",
  ]) {
    assert(
      PAGE.includes(`pool("${field}")`),
      `${field} must be pooled, or the row still shows one language's slice`
    );
  }
});

test("accuracy and average time are computed from the pooled totals", () => {
  assert(
    /accuracy: totalAttempts > 0 \? \(correctCount \/ totalAttempts\) \* 100 : 0/.test(PAGE),
    "accuracy must divide the pooled correct count by the pooled cohort"
  );
  assert(
    /avgTime: totalAttempts > 0 \? totalTime \/ totalAttempts : 0/.test(PAGE),
    "average time must use the pooled cohort too"
  );
});

test("the row shows the primary language's paper", () => {
  assert(
    /rows\.find\(\(r: any\) => \(r\.section\?\.language \|\| null\) === primaryLang\) \|\| rows\[0\]/.test(PAGE),
    "content must come from the primary row, falling back when a pairing is broken"
  );
  // Field presence, not an exact column list: this embed has already grown once
  // (it now also carries section_group_id, for section identity) and pinning the
  // whole list just breaks the test every time a field is added.
  const questionsEmbed =
    /parsed_questions[\s\S]{0,400}?section:sections!inner\(([^)]*)\)/.exec(PAGE)?.[1] ?? "";
  assert(
    questionsEmbed.includes("language"),
    "the questions fetch must carry language, or the primary row cannot be identified"
  );
  for (const field of ["text", "options", "correct_answer", "q_no"]) {
    assert(
      PAGE.includes(`primary.${field}`),
      `${field} must come from the primary row, not an arbitrary translation`
    );
  }
});

test("the wrong-answer label is pooled by option index, not by string", () => {
  // The label is the option TEXT that was chosen, so the same choice reads
  // differently in each language. Pooling the strings would split one
  // misconception in two and highlight nothing on the primary paper.
  assert(
    /const indexWeight = new Map<number, number>\(\)/.test(PAGE),
    "the winning wrong answer must be resolved to an option index before pooling"
  );
  assert(
    /opts\.findIndex\(\(o: any\) => labelNorm\(o\) === labelNorm\(label\)\)/.test(PAGE),
    "each translation's label must be located within its OWN options"
  );
  assert(
    /mostCommonWrong = primaryOptions\[winningIndex\] \?\? fallbackLabel/.test(PAGE),
    "the winning index must be rendered in the primary paper's wording"
  );
});

test("the pairing this relies on is enforced at publish", () => {
  assert(
    /question_group_id !== p\.question_group_id/.test(PUBLISH),
    "publishing must keep refusing papers whose translations are not linked"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}\n    ${f.error}`);
  console.log("-".repeat(60));
  process.exit(1);
}
console.log("-".repeat(60) + "\n");
