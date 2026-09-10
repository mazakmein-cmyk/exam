/**
 * LIVE EXAMS — FILING A PUSHED QUESTION AT THE RIGHT POSITION
 *
 * Run with: node src/__tests__/live-pushed-question-merge.test.mjs
 *
 * This imports and runs the REAL src/lib/live/pushedQuestions.js — not a copy of
 * it — which is the reason that helper is .js like the rest of lib/live.
 *
 * Why it deserves its own tests. Both live pages address their question list BY
 * POSITION: the host publishes a cursor, and the page reads `questions[cursor]`.
 * So a question filed one slot off does not throw and does not look wrong — it
 * puts a different question on screen than the host announced, on the host's
 * timer, while answers are filed against the position. That is the failure this
 * function exists to prevent, and it has no visible symptom until a score is
 * disputed after the session.
 *
 * The list is per-language and dense from 0, because ordinals are numbered
 * within a language (the same convention get_revealed_live_answers uses). A
 * language that is missing the open question therefore has a SHORTER list, not
 * a list with a hole in it — which is why "nothing in my language" and "I missed
 * an unlock" have to be told apart rather than both treated as a gap.
 */

import { mergePushedQuestion } from "../lib/live/pushedQuestions.js";

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || "not equal"}: got ${sa}, expected ${sb}`);
}

/** A question as it arrives on the exam row. */
const q = (id, language) => ({ id, language, text: `${id} (${language})` });

console.log("\n══ Live exams: filing the pushed question ══");

// ─── [1] The ordinary path ──────────────────────────────────────────────────
console.log("\n[1] Each unlock lands at its own position");

test("the first unlock fills position 0 of an empty list", () => {
  const out = mergePushedQuestion([], [q("a", "en")], 0, "en");
  assert(out.kind === "merged", `expected merged, got ${out.kind}`);
  assertEqual(out.questions.map((x) => x.id), ["a"]);
});

test("later unlocks append in order", () => {
  let held = [];
  for (let i = 0; i < 5; i++) {
    const out = mergePushedQuestion(held, [q(`q${i}`, "en")], i, "en");
    assert(out.kind === "merged", `unlock ${i}: expected merged, got ${out.kind}`);
    held = out.questions;
  }
  assertEqual(held.map((x) => x.id), ["q0", "q1", "q2", "q3", "q4"]);
  assert(
    held.every((x) => x !== undefined),
    "a sparse array means every position-based read past the hole addresses the wrong question"
  );
});

test("the held list is never mutated in place", () => {
  const held = [q("a", "en")];
  const out = mergePushedQuestion(held, [q("b", "en")], 1, "en");
  assert(out.kind === "merged");
  assertEqual(held.length, 1, "React state must not be mutated behind setState's back");
});

// ─── [2] The same observation, over and over ────────────────────────────────
console.log("\n[2] Repeats are free");

test("re-delivering the question already held is a no-op", () => {
  const held = [q("a", "en"), q("b", "en")];
  const out = mergePushedQuestion(held, [q("b", "en")], 1, "en");
  assertEqual(out.kind, "noop", "both transport lanes deliver the same unlock, and the poll repeats it every 15s until the next one");
});

test("a question already held is a no-op even at a different ordinal", () => {
  // A rewind moves the cursor back onto a question this page still holds.
  const held = [q("a", "en"), q("b", "en"), q("c", "en")];
  assertEqual(mergePushedQuestion(held, [q("a", "en")], 0, "en").kind, "noop");
});

test("an empty or absent payload does nothing", () => {
  assertEqual(mergePushedQuestion([], null, 0, "en").kind, "noop");
  assertEqual(mergePushedQuestion([], undefined, 0, "en").kind, "noop");
  assertEqual(mergePushedQuestion([], [], 0, "en").kind, "noop");
});

test("a cursor of -1 does nothing", () => {
  // A published exam that has not started sits at -1. This is the state the
  // whole fix exists for: the share link is handed out before the session.
  assertEqual(mergePushedQuestion([], [q("a", "en")], -1, "en").kind, "noop");
});

// ─── [3] Translations ───────────────────────────────────────────────────────
console.log("\n[3] Every language rides the same payload");

test("each language takes its own copy", () => {
  const payload = [q("en-1", "en"), q("hi-1", "hi"), q("ta-1", "ta")];
  const en = mergePushedQuestion([], payload, 0, "en");
  const hi = mergePushedQuestion([], payload, 0, "hi");
  assertEqual(en.questions[0].id, "en-1");
  assertEqual(hi.questions[0].id, "hi-1", "switching language mid-session must not become a request");
});

test("a language with no copy of this question is a no-op, NOT a gap", () => {
  // This student's list is legitimately shorter than the paper. Calling it a
  // gap would trigger a refetch on every single unlock for the rest of the
  // session — turning the one case this design was built to avoid into the
  // normal case for translated rooms.
  const out = mergePushedQuestion([q("hi-1", "hi")], [q("en-2", "en")], 1, "hi");
  assertEqual(out.kind, "noop");
});

// ─── [4] Missed unlocks ─────────────────────────────────────────────────────
console.log("\n[4] A hole is reported, never filled by guessing");

test("skipping ahead reports a gap instead of leaving the array sparse", () => {
  // Backgrounded tab, or a dropped Realtime message: the page holds 0..1 and
  // the next thing it hears about is question 4.
  const held = [q("q0", "en"), q("q1", "en")];
  const out = mergePushedQuestion(held, [q("q4", "en")], 4, "en");
  assertEqual(out.kind, "gap", "filing q4 at index 4 would leave indexes 2 and 3 empty");
});

test("the boundary is exact — ordinal === length appends, one past it is a gap", () => {
  const held = [q("q0", "en"), q("q1", "en")];
  assertEqual(
    mergePushedQuestion(held, [q("q2", "en")], 2, "en").kind,
    "merged",
    "an off-by-one here makes every ordinary unlock refetch the paper"
  );
  assertEqual(
    mergePushedQuestion(held, [q("q3", "en")], 3, "en").kind,
    "gap",
    "an off-by-one the other way silently leaves a hole"
  );
});

test("joining mid-session is not a gap", () => {
  // The gated view returns 0..cursor at join, so the payload for the cursor is
  // already in hand. If this reported a gap it would refetch immediately after
  // the fetch it just did — doubling the join cost for every student.
  const held = [q("q0", "en"), q("q1", "en"), q("q2", "en")];
  assertEqual(mergePushedQuestion(held, [q("q2", "en")], 2, "en").kind, "noop");
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  Every question lands where the host says it is.\n");
