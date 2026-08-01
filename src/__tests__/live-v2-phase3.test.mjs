/**
 * LIVE EXAM v2 — PHASE 3: B4, B6, B9, B12, A8
 *
 * Run with: node src/__tests__/live-v2-phase3.test.mjs
 *
 * Phase 3 is almost entirely interpretation of numbers the server already
 * computed, which makes it the most testable phase in the project and the one
 * where a wrong threshold is least visible. A classifier that quietly never
 * returns "systematic" looks exactly like a class that never shares a
 * misconception.
 *
 * The classifier and the coach ladder are therefore driven by fixture tables, not
 * by spot checks.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  keyToOptionIndices,
  tallyOptions,
  isCorrectIndex,
  toPercentages,
} from "../lib/live/optionTally.js";
import { classifyDistribution, topWrongValues } from "../lib/live/classifyDistribution.js";
import { deriveCoachLine } from "../lib/live/coachLine.js";

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Mismatch"} — expected ${expected}, got ${actual}`);
  }
}

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─── [1] Key shapes ─────────────────────────────────────────────────────────
console.log("\n[1] Distribution keys — the three shapes real data contains");

test("every key shape SQL actually emits resolves to the same option index", () => {
  // selected_answer is JSONB and the key is selected_answer::text, so the text
  // depends on what the client sent. These three occur; a fourth "double-encoded"
  // shape I originally asserted here does not exist and the test was wrong.
  assertEqual(keyToOptionIndices("0")[0], 0, "jsonb number -> 0");
  assertEqual(keyToOptionIndices('"0"')[0], 0, "jsonb string -> quotes are part of the key");
  assert(
    JSON.stringify(keyToOptionIndices('["0","2"]')) === "[0,2]",
    "jsonb array -> both indices"
  );
});

test("an unreadable key is counted as unparsed, not silently dropped", () => {
  const { counts, unparsed } = tallyOptions({ '"banana"': 5, '"1"': 3 }, 4);
  assertEqual(counts[1], 3, "the readable key still counts");
  assertEqual(unparsed, 5, "so a caller can tell 'nobody picked B' from 'we couldn't read it'");
});

test("multi-select counts per option, so totals can exceed responders", () => {
  const { counts, totalSelections } = tallyOptions({ '["0","2"]': 4 }, 4);
  assertEqual(counts[0], 4);
  assertEqual(counts[2], 4);
  assertEqual(totalSelections, 8, "one student choosing two options is two selections");
});

test("an index beyond the option list does not corrupt the array", () => {
  const { counts, unparsed } = tallyOptions({ '"9"': 2 }, 4);
  assertEqual(counts.length, 4);
  assertEqual(unparsed, 2);
});

test("percentages are of RESPONDERS, which is the sentence a creator says", () => {
  assert(
    JSON.stringify(toPercentages([5, 5, 0, 0], 10)) === "[50,50,0,0]",
    "50/50 of ten responders"
  );
  assert(
    JSON.stringify(toPercentages([1, 1], 0)) === "[0,0]",
    "no divide-by-zero before anyone answers"
  );
});

test("correct-answer shapes are all recognised", () => {
  assert(isCorrectIndex(2, 2), "numeric");
  assert(isCorrectIndex("2", 2), "string");
  assert(isCorrectIndex(["0", "2"], 2), "array member");
  assert(!isCorrectIndex(["0", "2"], 1), "non-member");
  assert(!isCorrectIndex(null, 0), "null answer is never correct");
});

// ─── [2] B4 classifier ──────────────────────────────────────────────────────
console.log("\n[2] B4 — the shape of how a class answered");

const classify = (dist, correct, total, options = 4, extra = {}) =>
  classifyDistribution({
    optionDistribution: dist,
    correctAnswer: correct,
    totalResponses: total,
    optionCount: options,
    ...extra,
  });

test("systematic: a wrong option beat the answer", () => {
  // The money case. 48% on C, 31% on the answer.
  const c = classify({ '"0"': 31, '"2"': 48, '"1"': 12, '"3"': 9 }, 0, 100);
  assertEqual(c.kind, "systematic");
  assertEqual(c.dominantIndex, 2, "and it must name WHICH option");
});

test("a big wrong cluster is named even when the answer still won", () => {
  // 60/40 is not a class that has understood. Reporting "inconclusive" would
  // throw away the most actionable fact on the screen, so the soft form of
  // systematic catches it.
  const c = classify({ '"0"': 60, '"1"': 40 }, 0, 100);
  assertEqual(c.kind, "systematic", "40% on one wrong option is a shared belief");
  assertEqual(c.dominantIndex, 1);
});

test("...but a clear majority with no cluster is simply solid", () => {
  const c = classify({ '"0"': 80, '"1"': 20 }, 0, 100);
  assertEqual(c.kind, "solid", "20% is below the cluster threshold");
});

test("when a wrong option beats the answer, that is the strong form", () => {
  assertEqual(classify({ '"0"': 45, '"1"': 55 }, 0, 100).kind, "systematic");
});

test("solid: most of the class got it", () => {
  assertEqual(classify({ '"0"': 80, '"1"': 20 }, 0, 100).kind, "solid");
});

test("split: two close options, one of them the answer", () => {
  const c = classify({ '"0"': 40, '"1"': 38, '"2"': 12, '"3"': 10 }, 0, 100);
  assertEqual(c.kind, "split");
  assertEqual(c.dominantIndex, 1, "names the rival, not the answer");
});

test("scattered: nothing stands out from an even split", () => {
  assertEqual(classify({ '"0"': 26, '"1"': 25, '"2"': 25, '"3"': 24 }, 0, 100).kind, "scattered");
});

test("insufficient: a proportion of six is an anecdote", () => {
  assertEqual(classify({ '"0"': 2, '"1"': 4 }, 0, 6).kind, "insufficient");
  assertEqual(classify({ '"0"': 4, '"1"': 6 }, 0, 10).kind, "systematic", "ten is enough");
});

test("insufficient also yields to a good share of a small room", () => {
  // Eight of ten present is plenty even though eight is under the absolute floor.
  const c = classify({ '"0"': 3, '"1"': 5 }, 0, 8, 4, { onlineCount: 10 });
  assert(c.kind !== "insufficient", `a small but well-answered room should classify, got ${c.kind}`);
});

test("multi-select is labelled, never classified", () => {
  // The keys are combinations, so "48% picked C" is not a claim these rules can
  // honestly make.
  const c = classify({ '["0","2"]': 30, '"1"': 20 }, ["0", "2"], 50, 4, { answerType: "multi" });
  assertEqual(c.kind, "combinations");
});

test("a question with no stored answer is inconclusive, not wrong", () => {
  assertEqual(classify({ '"0"': 50, '"1"': 50 }, null, 100).kind, "inconclusive");
});

test("numeric questions surface the most common wrong VALUES", () => {
  // A shared wrong number — a sign error, an off-by-one — is one of the strongest
  // signals available, and the option-index path cannot see it.
  const top = topWrongValues({ '"12"': 20, '"-12"': 15, '"7"': 3 }, "12");
  assertEqual(top.length, 2, "the correct value is excluded");
  assertEqual(top[0].value, "-12", "ordered by frequency");
  assertEqual(top[0].count, 15);
});

// ─── [3] A8 coach ladder ────────────────────────────────────────────────────
console.log("\n[3] A8 — priority, and the discipline of saying nothing");

const baseCtx = {
  phase: "open",
  remainingSeconds: 30,
  totalSeconds: 60,
  answered: 20,
  onlineCount: 30,
  onlineDelta30s: 0,
  confusionCount: 0,
  classification: null,
  timeProfile: null,
  questionIndex: 1,
  totalQuestions: 10,
  elapsedMinutes: 2,
  plannedMinutes: 10,
};

test("silence is a valid and common output", () => {
  assertEqual(deriveCoachLine(baseCtx), null, "a normal mid-question moment says nothing");
});

test("an offline drop outranks everything — every other reading is a lie", () => {
  const line = deriveCoachLine({
    ...baseCtx,
    onlineDelta30s: -9,
    confusionCount: 20,
    answered: 1,
    remainingSeconds: 5,
  });
  assertEqual(line.ruleId, "offline-drop", "confusion and stall must not win over infrastructure");
});

test("confusion outranks a stall", () => {
  const line = deriveCoachLine({
    ...baseCtx,
    confusionCount: 6,
    answered: 2,
    remainingSeconds: 5,
  });
  assertEqual(line.ruleId, "confused");
});

test("stalled needs BOTH a low answer count and little time left", () => {
  assertEqual(
    deriveCoachLine({ ...baseCtx, answered: 2, remainingSeconds: 50 }),
    null,
    "two answers five seconds in is normal, not a stall"
  );
  assertEqual(
    deriveCoachLine({ ...baseCtx, answered: 2, remainingSeconds: 5 }).ruleId,
    "stalled",
    "two answers with five seconds left is a stall"
  );
});

test("systematic beats impulsive when both hold", () => {
  const line = deriveCoachLine({
    ...baseCtx,
    phase: "revealed",
    classification: classify({ '"0"': 31, '"2"': 48, '"1"': 12, '"3"': 9 }, 0, 100),
    timeProfile: { impulsiveWrong: 40, medianMs: 2000 },
  });
  assertEqual(line.ruleId, "systematic", "naming the misconception is more actionable");
});

test("the systematic line names the option and its share", () => {
  const line = deriveCoachLine({
    ...baseCtx,
    phase: "revealed",
    classification: classify({ '"0"': 31, '"2"': 48, '"1"': 12, '"3"': 9 }, 0, 100),
  });
  assert(/48%/.test(line.text), `share missing: ${line.text}`);
  assert(/\bC\b/.test(line.text), `option letter missing: ${line.text}`);
});

test("cruising is offered only when the class was both right and quick", () => {
  const solid = classify({ '"0"': 85, '"1"': 15 }, 0, 100);
  const slow = deriveCoachLine({ ...baseCtx, phase: "revealed", classification: solid, timeProfile: { impulsiveWrong: 0, medianMs: 50000 } });
  assertEqual(slow.ruleId, "solid", "right but slow is not permission to speed up");
  const quick = deriveCoachLine({ ...baseCtx, phase: "revealed", classification: solid, timeProfile: { impulsiveWrong: 0, medianMs: 8000 } });
  assertEqual(quick.ruleId, "cruising");
});

test("pace is last and never fires early in a session", () => {
  const early = deriveCoachLine({ ...baseCtx, questionIndex: 0, elapsedMinutes: 30 });
  assertEqual(early, null, "one question in, a projection is meaningless");
  const late = deriveCoachLine({
    ...baseCtx,
    questionIndex: 4,
    elapsedMinutes: 20,
    totalQuestions: 10,
    plannedMinutes: 10,
  });
  assertEqual(late.ruleId, "pace");
});

test("no line ever criticises the creator", () => {
  // Every string describes the ROOM. A creator who feels judged turns it off.
  const scolding = /you'?re (going )?too|you should|you must|you failed|slow down/i;
  const contexts = [
    { ...baseCtx, onlineDelta30s: -9 },
    { ...baseCtx, confusionCount: 6 },
    { ...baseCtx, answered: 2, remainingSeconds: 5 },
    { ...baseCtx, phase: "revealed", classification: classify({ '"0"': 31, '"2"': 48 }, 0, 100) },
    { ...baseCtx, phase: "revealed", classification: classify({ '"0"': 26, '"1"': 25, '"2"': 25, '"3"': 24 }, 0, 100) },
    { ...baseCtx, questionIndex: 4, elapsedMinutes: 20, plannedMinutes: 10 },
  ];
  contexts.forEach((ctx) => {
    const line = deriveCoachLine(ctx);
    if (line) assert(!scolding.test(line.text), `scolding tone: "${line.text}"`);
  });
});

test("a rule id is stable while its numbers move", () => {
  // The caller re-renders on ruleId, so "9 of 34" becoming "11 of 34" must not
  // repaint the line.
  const a = deriveCoachLine({ ...baseCtx, answered: 2, remainingSeconds: 5 });
  const b = deriveCoachLine({ ...baseCtx, answered: 4, remainingSeconds: 4 });
  assertEqual(a.ruleId, b.ruleId, "same situation, same id");
  assert(a.text !== b.text, "even though the text differs");
});

// ─── [4] B9 / B12 / B6 structure ────────────────────────────────────────────
console.log("\n[4] Projector safety and P0");

test("the river cannot mark an answer, because it has no way to know one", () => {
  const river = readSrc("components/live/AnswerRiver.tsx");
  const code = stripComments(river);
  assert(!/correct/i.test(code), "no correctness concept may exist in this component at all");
  assert(
    !/emerald|rose|green|red/i.test(code),
    "correctness colours would leak the answer to a room watching the wall"
  );
});

test("the river animates on transform, never width", () => {
  const code = stripComments(readSrc("components/live/AnswerRiver.tsx"));
  assert(/transform: `scaleX/.test(code), "must animate transform");
  assert(
    !/transition-\[width\]|style=\{\{ width/.test(code),
    "animating width re-runs layout every frame for every bar"
  );
});

test("the coach line consumes the tick in a leaf, not in the page", () => {
  const insight = readSrc("components/live/LiveInsight.tsx");
  assert(/useLiveCountdown/.test(insight), "the leaf subscribes");
  const control = stripComments(readSrc("pages/LiveExamControl.tsx"));
  assert(
    !/useLiveCountdown/.test(control),
    "the page must never read the ticking value — that is the Phase 0 regression"
  );
  assert(/LiveCoachLine/.test(control), "the page renders the connected wrapper");
});

test("the coach line is memoised on rule id, not on text", () => {
  const insight = readSrc("components/live/LiveInsight.tsx");
  assert(
    /a\.line\?\.ruleId === b\.line\?\.ruleId/.test(insight),
    "memoising on text would repaint every second as the numbers move"
  );
});

test("B12 shows an exact count from one, and nothing at zero", () => {
  const insight = readSrc("components/live/LiveInsight.tsx");
  assert(
    /if \(!count \|\| count < 1\) return null;/.test(insight),
    "an empty row is a permanent reminder of a thing that is not happening"
  );
  assert(!/a few/i.test(insight), "the decision was an exact number from one");
});

test("B12's count is creator-only", () => {
  const present = stripComments(readSrc("pages/LiveExamPresent.tsx"));
  assert(
    !/ConfusionCount|confusion_count/.test(present),
    "a count on the wall turns an anonymous signal into a public one and nobody taps it again"
  );
});

test("the student's flag reports nothing back, not even a failure", () => {
  const student = stripComments(readSrc("pages/LiveExamStudent.tsx"));
  const idx = student.indexOf("const handleFlagConfusion");
  const end = student.indexOf("}, [exam]);", idx);
  assert(idx > 0 && end > idx, "could not locate the handler body");
  const body = student.slice(idx, end);
  assert(
    !/toast\(/.test(body),
    "a toast would announce to anyone glancing at the screen that this student pressed it"
  );
  const button = stripComments(readSrc("components/live/ConfusionButton.tsx"));
  assert(!/count/i.test(button), "the button must never show how many others flagged");
});

test("Phase 3 adds no new request for students", () => {
  // Every insight is derived from the analytics row students already receive and
  // the tally the creator already polls.
  const student = stripComments(readSrc("pages/LiveExamStudent.tsx"));
  assert(
    !/useOpenQuestionTally/.test(student),
    "the tally is a creator-only fast lane; a student poller would be one request per student"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exitCode = 1;
}
console.log(`${"─".repeat(60)}\n`);
