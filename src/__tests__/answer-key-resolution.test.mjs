/**
 * ANSWER KEY — which option does a stored `correct_answer` actually mark?
 *
 * Run with: node src/__tests__/answer-key-resolution.test.mjs
 *
 * The creator's question preview puts a green tick on an option and says
 * "Answer key: B". Getting that wrong is worse than showing nothing: a creator
 * who trusts the tick publishes a paper that marks the wrong answer right, and
 * every candidate who picked correctly loses the mark.
 *
 * The column is not one shape. Indexes (2), numeric strings ("2"), letters
 * ("C"), the option's own text ("7/12") and arrays of any of those all live in
 * the database today, written by different import paths over time.
 */

import {
  describeAnswerKey,
  hasAnswerKey,
  resolveAnswerIndexes,
} from "../lib/answerKey.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ""}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
  }
}
function eqSet(actual, expected, msg) {
  const a = [...actual].sort().join(",");
  const e = [...expected].sort().join(",");
  if (a !== e) throw new Error(`${msg || ""}\n      expected: [${e}]\n      actual:   [${a}]`);
}
function ok(value, msg) {
  if (!value) throw new Error(msg || "expected truthy");
}

const OPTIONS = ["7/12", "5/12", "1/3", "2/3"];

console.log("\n--- every shape the column holds ---");

test("a numeric index", () => {
  eqSet(resolveAnswerIndexes(2, OPTIONS), [2]);
});

test("an index stored as a string", () => {
  eqSet(resolveAnswerIndexes("2", OPTIONS), [2]);
});

test("an option letter", () => {
  eqSet(resolveAnswerIndexes("C", OPTIONS), [2]);
  eqSet(resolveAnswerIndexes("a", OPTIONS), [0]);
});

test("the option's own text", () => {
  eqSet(resolveAnswerIndexes("1/3", OPTIONS), [2]);
});

test("an array marks several options", () => {
  eqSet(resolveAnswerIndexes([0, 2], OPTIONS), [0, 2]);
});

test("the same option named twice counts once", () => {
  eqSet(resolveAnswerIndexes([0, "A"], OPTIONS), [0]);
});

console.log("\n--- index beats text, and that ordering is the point ---");

test("a key of 2 means the third option, not the option reading '2'", () => {
  // The collision ExamReview documents: option B's TEXT is the digit 2, and a
  // key of 2 means index 2. Resolving text first would tick the wrong row.
  const numeric = ["zero", "2", "two", "three"];
  eqSet(resolveAnswerIndexes(2, numeric), [2]);
});

test("a letter beats an option whose text is that letter", () => {
  const lettered = ["B", "wrong", "right"];
  eqSet(resolveAnswerIndexes("C", lettered), [2]);
});

test("text matching still works when nothing else fits", () => {
  eqSet(resolveAnswerIndexes("two", ["zero", "one", "two"]), [2]);
});

console.log("\n--- markup must not break a text match ---");

test("an option the creator later bolded still matches its stored text", () => {
  eqSet(resolveAnswerIndexes("12", ["10", "<b>12</b>", "14"]), [1]);
});

test("entities in an option are decoded before comparing", () => {
  eqSet(resolveAnswerIndexes("a b", ["x", "a&nbsp;b"]), [1]);
});

test("case and surrounding space do not matter", () => {
  eqSet(resolveAnswerIndexes("  TRUE ", ["False", "True"]), [1]);
});

console.log("\n--- a key that points nowhere is not the same as no key ---");

test("an out-of-range index resolves to nothing", () => {
  eqSet(resolveAnswerIndexes(9, OPTIONS), []);
});

test("but it still counts as a key being SET", () => {
  // The preview says "the key matches none of the options" for this, and
  // "no correct answer marked" only for the case below. Collapsing the two
  // would send a creator looking for the wrong problem.
  ok(hasAnswerKey(9), "9 is a key, even a broken one");
  ok(hasAnswerKey("gone"), "stale text is a key, even a broken one");
});

test("null, undefined, empty and blank are no key at all", () => {
  for (const empty of [null, undefined, "", "   ", []]) {
    eq(hasAnswerKey(empty), false, `${JSON.stringify(empty)} should read as unset`);
  }
});

test("a numeric question's typed key has no option to point at", () => {
  eq(hasAnswerKey("42"), true);
  eqSet(resolveAnswerIndexes("42", []), []);
});

console.log("\n--- what the creator reads ---");

test("letters for a choice question", () => {
  eq(describeAnswerKey(2, OPTIONS), "C");
  eq(describeAnswerKey([0, 3], OPTIONS), "A, D");
});

test("the typed value for a numeric question", () => {
  eq(describeAnswerKey("42", []), "42");
});

test("an unresolved key is shown AS STORED, never hidden", () => {
  // The creator's only clue that the key points at an option that was edited
  // away — printing "—" would hide the bug being reported.
  eq(describeAnswerKey("7/13", OPTIONS), "7/13");
});

test("no key reads as a dash", () => {
  eq(describeAnswerKey(null, OPTIONS), "—");
  eq(describeAnswerKey("", OPTIONS), "—");
});

console.log("\n--- nothing throws on the shapes a draft row really holds ---");

test("options missing entirely", () => {
  eqSet(resolveAnswerIndexes("A", undefined), []);
  eq(describeAnswerKey("A", undefined), "A");
});

test("options that are not an array", () => {
  eqSet(resolveAnswerIndexes(0, "not an array"), []);
});

test("a key holding nulls", () => {
  eqSet(resolveAnswerIndexes([null, 1, undefined], OPTIONS), [1]);
  eq(hasAnswerKey([null, undefined]), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
