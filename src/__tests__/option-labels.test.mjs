/**
 * OPTION LABELS — strip "(a) " only when every option carries the sequence.
 *
 * Run with: node src/__tests__/option-labels.test.mjs
 *
 * Gemini 3.5 Flash emitted bare options on one run and "(a) How" on the next
 * (same paper, temperature 0). The exam UI adds its own labels, so a leaked
 * one shows twice. The cleaner must fix that without ever touching an option
 * whose text merely begins with a letter and a bracket.
 */

import { normalizeOptionLabels, normalizeReportOptionLabels } from "../lib/optionLabels.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
const eq = (a, b, msg) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)}`);
};

console.log("\nStrips a full labelled sequence");
test("(a) … (e)", () => eq(normalizeOptionLabels(["(a) How", "(b) What", "(c) Whom", "(d) When", "(e) Where"]), ["How", "What", "Whom", "When", "Where"], "lowercase brackets"));
test("a) … e)", () => eq(normalizeOptionLabels(["a) 5:9", "b) 9:5", "c) 6:5", "d) 6:7", "e) 6:1"]), ["5:9", "9:5", "6:5", "6:7", "6:1"], "half brackets"));
test("(A) … (D)", () => eq(normalizeOptionLabels(["(A) A", "(B) B", "(C) C", "(D) D"]), ["A", "B", "C", "D"], "uppercase brackets — the error-spotting case"));
test("A. … D.", () => eq(normalizeOptionLabels(["A. 130", "B. 120", "C. 125", "D. 100"]), ["130", "120", "125", "100"], "dot labels"));
test("1) … 4)", () => eq(normalizeOptionLabels(["1) x", "2) y", "3) z", "4) w"]), ["x", "y", "z", "w"], "numeric labels"));
test("surrounding whitespace is trimmed", () => eq(normalizeOptionLabels(["  (a)  How ", "(b) What"]), ["How", "What"], "trim"));

console.log("\nLeaves content alone");
test("bare options are returned as the same array", () => {
  const opts = ["How", "What", "Whom"];
  if (normalizeOptionLabels(opts) !== opts) throw new Error("new array returned for unchanged input");
});
test("only some options labelled → untouched", () => {
  const opts = ["(a) How", "What", "(c) Whom"];
  if (normalizeOptionLabels(opts) !== opts) throw new Error("partial labelling was stripped");
});
test("labels out of sequence → untouched", () => {
  const opts = ["(b) How", "(a) What"];
  if (normalizeOptionLabels(opts) !== opts) throw new Error("out-of-order labels were stripped");
});
test("label with nothing after it → untouched", () => {
  const opts = ["(a)", "(b)"];
  if (normalizeOptionLabels(opts) !== opts) throw new Error("label-only options were emptied");
});
test("a lone option, non-arrays and non-strings pass through", () => {
  const one = ["(a) How"];
  if (normalizeOptionLabels(one) !== one) throw new Error("single option changed");
  if (normalizeOptionLabels(null) !== null) throw new Error("null changed");
  const mixed = ["(a) x", 5];
  if (normalizeOptionLabels(mixed) !== mixed) throw new Error("mixed types changed");
});
test("an option that IS the letter a (statement labels) survives", () => {
  // "(A)/ to submit the report (B)/ …" questions have options "A","B","C","D"
  const opts = ["A", "B", "C", "D", "No error"];
  if (normalizeOptionLabels(opts) !== opts) throw new Error("bare letters were mangled");
});

console.log("\nReport-level pass");
test("counts changed questions and edits in place", () => {
  const report = {
    perSection: [
      { accepted: [{ options: ["(a) x", "(b) y"], correct_answer: "1" }, { options: ["x", "y"], correct_answer: "0" }] },
      { accepted: [{ options: ["(1) p", "(2) q"], correct_answer: "0" }] },
    ],
  };
  const changed = normalizeReportOptionLabels(report);
  if (changed !== 2) throw new Error(`changed=${changed}`);
  eq(report.perSection[0].accepted[0].options, ["x", "y"], "first question");
  eq(report.perSection[0].accepted[0].correct_answer, "1", "answer index must not move");
  eq(report.perSection[1].accepted[0].options, ["p", "q"], "numeric labels");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
