/**
 * PUBLISH — NO ANSWER KEY, NO PUBLISH
 *
 * Run with: node src/__tests__/publish-answer-key-gate.test.mjs
 *
 * The publish validator used to demand a correct answer only when the section
 * belonged to the exam's primary language:
 *
 *     if (isPrimary) { ...require correct_answer... }
 *
 * The reasoning looked sound — translations inherit their marks config from the
 * primary twin, so why would they need their own key? But inheritance stops at
 * the CONFIG. Grading does not resolve to the twin: examService selects
 * `correct_answer` by the attempt's own question ids, which are the rows of the
 * language the candidate actually sat. A Hindi row with an empty key therefore
 * marks every Hindi candidate wrong on that question while the English twin
 * scores perfectly, and no banner, badge or log says a word about it. The exam
 * publishes clean and the damage only shows up in the results.
 *
 * Nothing about that is visible from the dialog either: a language with a
 * missing key showed zero issues and its publish toggle stayed enabled.
 *
 * So these assertions pin the gate itself — that the answer-key check is its
 * own error type, that it runs for every supported language rather than the
 * primary one, that blank-ish keys count as missing, and that subjective
 * questions stay exempt because they are graded by hand.
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

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

const DIALOG = readSrc("components/PublishExamDialog.tsx");
const EXAM_SERVICE = readSrc("services/examService.ts");

console.log("\n══ Publish: answer-key gate ══");

// ─── [1] The premise ────────────────────────────────────────────────────────
console.log("\n[1] Grading really does read the candidate's own row");

test("examService selects correct_answer by the attempt's question ids", () => {
  assert(
    /\.select\("id, correct_answer, answer_type"\)\s*\.in\("id", questionIds\)/.test(EXAM_SERVICE),
    "if grading ever resolves to the primary twin instead, the per-language requirement below becomes unnecessary and should be revisited rather than left in place"
  );
});

// ─── [2] The gate ───────────────────────────────────────────────────────────
console.log("\n[2] A missing key blocks publish, in any language");

test("missing_answer is its own error type", () => {
  assert(
    /\|\s*"missing_answer"/.test(DIALOG),
    "folding it into invalid_question again would leave the creator reading 'missing correct answer or options' and guessing which"
  );
  assert(
    /type: "missing_answer"/.test(DIALOG),
    "the type must actually be pushed into langErrors, not just declared"
  );
});

test("the check no longer hangs off the primary language", () => {
  assert(
    !/const isPrimary = lang === primaryLang/.test(DIALOG),
    "isPrimary is what scoped the answer-key requirement to one language"
  );
  assert(
    !/if \(isPrimary\)/.test(DIALOG),
    "a surviving isPrimary branch means secondary languages can still publish keyless"
  );
});

test("the errors it produces reach the same channel that disables the toggle", () => {
  assert(
    /langErrors\.push\(\{\s*type: "missing_answer"/.test(DIALOG),
    "the toggle is disabled by publishLangErrors[lang].length, so the error has to land in langErrors to block anything"
  );
});

test("it lists the question numbers, and offers the jump to fix them", () => {
  assert(
    /qNos: missingAnswerQs\.map\(\(q: any\) => q\.q_no\)/.test(DIALOG),
    "'some question is missing an answer' with no number is a hunt through the whole paper"
  );
  assert(
    /err\.type === "missing_answer"[\s\S]{0,60}onNavigateToQuestion/.test(DIALOG),
    "the Go fix → button is gated on an explicit list of error types; a new type is invisible to it until added"
  );
});

// ─── [3] What counts as missing ─────────────────────────────────────────────
console.log("\n[3] Blank-ish keys are missing keys");

test("hasAnswerKey rejects whitespace and all-empty arrays", () => {
  assert(
    /function hasAnswerKey\(ca: unknown\): boolean/.test(DIALOG),
    "the predicate is shared by the filter and by this test's intent — keep it named"
  );
  assert(
    /String\(v\)\.trim\(\) !== ""/.test(DIALOG) && /ca\.some\(/.test(DIALOG),
    "['', ''] is what a half-filled multi-select row leaves behind and it grades exactly like null"
  );
  assert(
    /String\(ca\)\.trim\(\) !== ""/.test(DIALOG),
    "'   ' passes a !== \"\" check and fails every comparison in scoreSCQ"
  );
});

test("option index 0 survives as a real answer", () => {
  assert(
    !/if \(!ca\) return false/.test(DIALOG),
    "a falsiness check would treat option A (index 0) as no answer and block a correct paper"
  );
});

test("subjective questions stay exempt", () => {
  assert(
    /if \(!at \|\| at === "subjective"\) return false;/.test(DIALOG),
    "hand-graded questions have no key to enter; requiring one would make subjective papers unpublishable"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  process.exit(1);
}
console.log("");
