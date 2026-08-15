/**
 * THE MARKS PANEL MAY LOOK DIFFERENT — IT MAY NOT SCORE DIFFERENTLY
 *
 * Run with: node src/__tests__/marks-config-panel.test.mjs
 *
 * The panel was rebuilt for cognitive load: presets before numbers, signs
 * rendered where the number lives, a rule restated in a sentence, provenance on
 * every question, and a destructive action that names its blast radius before
 * it fires. Every one of those is presentation. None of them is allowed to
 * touch how a mark is computed or how a row is written.
 *
 * So this file has two halves.
 *
 * The first half tests the new presentation rules as ordinary functions, and
 * the case it cares most about is the one the old panel got wrong: "Apply to
 * all" writes a scoring row for every question in the paper, and the old badge
 * asked only whether a row EXISTED. One click therefore branded all 85
 * questions "custom" while all 85 held identical numbers — the badge that is
 * supposed to mean "look here, this one is different" pointing at everything.
 * Customised has to mean the numbers READ differently from what would have been
 * inherited, so `questionRuleSource` compares values and keeps "pinned to its
 * own copy" ("own") apart from "genuinely different" ("custom").
 *
 * The second half reads MarksConfigPanel.tsx and asserts the writes are exactly
 * the writes that were there before: same hook calls, same order, same payload
 * shape, same clamps, and still not one Supabase mutation of its own. A redesign
 * that quietly changed what "Apply to all" persists would be a data bug wearing
 * a nicer font.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  PRESETS,
  isCustomisedQuestion,
  isDefaultMultiAnswer,
  matchPresetIndex,
  projectTotalMarks,
  questionRuleSource,
  round2,
  scoringEqual,
  toScoring,
} from "../lib/marksDisplay.js";

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

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

const PANEL = readFileSync(resolve(ROOT, "src/components/marks/MarksConfigPanel.tsx"), "utf8");
const ENGINE = readFileSync(resolve(ROOT, "src/services/scoringEngine.ts"), "utf8");

/** A plain +1/0/0 rule. */
const rule = (over = {}) => ({
  marks_correct: 1,
  marks_wrong: 0,
  marks_skipped: 0,
  mcq_mode: "partial",
  mcq_wrong_penalty: "flat",
  rounding_strategy: "floor",
  ...over,
});

console.log("\n📐 MARKS PANEL — PRESENTATION RULES\n");
console.log("─".repeat(60));

console.log("\n▸ Two rules are the same rule when they read the same\n");

test("identical rules compare equal", () => {
  assertEq(scoringEqual(rule(), rule()), true, "same numbers should be equal");
});

test("a different number makes them different", () => {
  assertEq(scoringEqual(rule(), rule({ marks_wrong: 0.25 })), false, "0 vs 0.25 penalty is a real difference");
});

test("a different multi-answer knob makes them different", () => {
  assertEq(
    scoringEqual(rule(), rule({ mcq_mode: "all_or_nothing" })),
    false,
    "part marks vs all-or-nothing changes a student's score"
  );
});

test("show_marks_in_simulator is not part of the rule", () => {
  const a = { ...rule(), show_marks_in_simulator: true };
  const b = { ...rule(), show_marks_in_simulator: false };
  assertEq(scoringEqual(a, b), true, "a display flag must not read as a scoring difference");
});

test("an unconfigured exam equals nothing, not even another unconfigured exam", () => {
  assertEq(scoringEqual(null, rule()), false, "null is unknown, not equal");
  assertEq(scoringEqual(null, null), false, "two unknowns are still unknown");
});

console.log("\n▸ A draft handed to the DB carries no display flags\n");

test("toScoring keeps the six scoring fields", () => {
  const out = toScoring({ ...rule({ marks_correct: 4, marks_wrong: 1 }), show_marks_in_simulator: false });
  assertEq(Object.keys(out).length, 6, "exactly six scoring fields");
  assertEq(out.marks_correct, 4, "marks_correct survives");
  assertEq(out.marks_wrong, 1, "marks_wrong survives");
});

test("toScoring drops show_marks_in_simulator", () => {
  const out = toScoring({ ...rule(), show_marks_in_simulator: true });
  assertEq("show_marks_in_simulator" in out, false, "the display flag must not reach a question row");
});

console.log("\n▸ Where a question's marks came from\n");

const examRule = rule({ marks_correct: 4, marks_wrong: 1 });

test("no row anywhere → the question follows the exam", () => {
  assertEq(questionRuleSource("q1", "s1", new Map(), new Map(), examRule), "exam", "should read as inherited from exam");
});

test("no row, but its section has one → the question follows the section", () => {
  const sections = new Map([["s1", rule({ marks_correct: 2 })]]);
  assertEq(questionRuleSource("q1", "s1", new Map(), sections, examRule), "section", "section rule wins over exam");
});

test("nothing configured at all → the question is not scored", () => {
  assertEq(questionRuleSource("q1", "s1", new Map(), new Map(), null), "none", "no config anywhere means unscored");
});

test("its own row with different numbers → custom", () => {
  const questions = new Map([["q1", rule({ marks_correct: 8 })]]);
  assertEq(questionRuleSource("q1", "s1", questions, new Map(), examRule), "custom", "8 marks against a 4-mark default");
  assertEq(isCustomisedQuestion("q1", "s1", questions, new Map(), examRule), true, "and it is customised");
});

test("its own row holding the SAME numbers → pinned, not custom", () => {
  const questions = new Map([["q1", { ...examRule }]]);
  assertEq(
    questionRuleSource("q1", "s1", questions, new Map(), examRule),
    "own",
    "a row that matches the default is pinned, not customised"
  );
  assertEq(isCustomisedQuestion("q1", "s1", questions, new Map(), examRule), false, "and must not wear the custom badge");
});

test("a question row is compared against its SECTION when the section has a rule", () => {
  const sections = new Map([["s1", rule({ marks_correct: 2 })]]);
  const matchesSection = new Map([["q1", rule({ marks_correct: 2 })]]);
  const matchesExam = new Map([["q1", rule({ marks_correct: 4, marks_wrong: 1 })]]);
  assertEq(questionRuleSource("q1", "s1", matchesSection, sections, examRule), "own", "matching its section is not custom");
  assertEq(
    questionRuleSource("q1", "s1", matchesExam, sections, examRule),
    "custom",
    "matching the EXAM while its section says otherwise is a real difference"
  );
});

test("THE REGRESSION: Apply to all stamps 85 rows and brands nothing custom", () => {
  const questions = new Map();
  const list = [];
  for (let i = 1; i <= 85; i++) {
    questions.set(`q${i}`, { ...examRule });
    list.push({ id: `q${i}`, section_id: "s1" });
  }
  const customs = list.filter((q) => isCustomisedQuestion(q.id, q.section_id, questions, new Map(), examRule));
  assertEq(customs.length, 0, "the old panel called all 85 custom; none of them is");
});

test("after Apply to all, editing one question is the only custom one", () => {
  const questions = new Map();
  const list = [];
  for (let i = 1; i <= 85; i++) {
    questions.set(`q${i}`, { ...examRule });
    list.push({ id: `q${i}`, section_id: "s1" });
  }
  questions.set("q42", rule({ marks_correct: 8, marks_wrong: 2 }));
  const customs = list.filter((q) => isCustomisedQuestion(q.id, q.section_id, questions, new Map(), examRule));
  assertEq(customs.length, 1, "exactly one question differs");
  assertEq(customs[0].id, "q42", "and it is the one that was edited");
});

console.log("\n▸ What the paper will be worth once you hit save\n");

const threeQuestions = [
  { id: "q1", section_id: "s1" },
  { id: "q2", section_id: "s1" },
  { id: "q3", section_id: "s2" },
];

test("with nothing overridden, every question takes the exam draft", () => {
  assertEq(projectTotalMarks(threeQuestions, new Map(), new Map(), 4, null), 12, "3 × 4");
});

test("the total moves with the draft before anything is saved", () => {
  const before = projectTotalMarks(threeQuestions, new Map(), new Map(), 1, null);
  const after = projectTotalMarks(threeQuestions, new Map(), new Map(), 4, null);
  assertEq(before, 3, "3 × 1 today");
  assertEq(after, 12, "3 × 4 the moment the field changes");
});

test("a section rule outranks the exam draft", () => {
  const sections = new Map([["s2", rule({ marks_correct: 10 })]]);
  assertEq(projectTotalMarks(threeQuestions, new Map(), sections, 4, null), 18, "4 + 4 + 10");
});

test("a question rule outranks its section", () => {
  const sections = new Map([["s1", rule({ marks_correct: 10 })]]);
  const questions = new Map([["q1", rule({ marks_correct: 1 })]]);
  assertEq(projectTotalMarks(threeQuestions, questions, sections, 4, null), 15, "1 + 10 + 4");
});

test("the section being edited is projected, other sections are not", () => {
  const sections = new Map([["s2", rule({ marks_correct: 10 })]]);
  const total = projectTotalMarks(threeQuestions, new Map(), sections, 4, {
    sectionId: "s1",
    config: rule({ marks_correct: 7 }),
  });
  assertEq(total, 24, "7 + 7 (draft) + 10 (saved s2)");
});

test("a pinned question ignores the section draft, exactly as scoring will", () => {
  const questions = new Map([["q1", rule({ marks_correct: 1 })]]);
  const total = projectTotalMarks(threeQuestions, questions, new Map(), 4, {
    sectionId: "s1",
    config: rule({ marks_correct: 7 }),
  });
  assertEq(total, 12, "1 (pinned) + 7 (draft) + 4 (exam)");
});

test("quarter marks do not drift", () => {
  const many = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, section_id: "s1" }));
  assertEq(projectTotalMarks(many, new Map(), new Map(), 0.1, null), 0.3, "0.1 × 3 must be 0.3, not 0.30000000000000004");
  assertEq(round2(0.1 + 0.2), 0.3, "round2 clears binary float noise");
});

console.log("\n▸ Presets and progressive disclosure\n");

test("every preset is a scheme a real paper uses", () => {
  assertEq(PRESETS.length, 4, "four chips");
  for (const p of PRESETS) {
    assert(p.correct > 0, "a preset must be worth something");
    assert(p.wrong <= p.correct, "a penalty may never exceed what the question is worth");
    assertEq(p.skipped, 0, "no preset penalises skipping — that is an expert choice, not a default");
  }
});

test("the matching chip lights up, a hand-typed scheme lights none", () => {
  assertEq(matchPresetIndex(rule({ marks_correct: 4, marks_wrong: 1 })), 3, "+4/−1 is the fourth chip");
  assertEq(matchPresetIndex(rule()), 0, "+1/0 is the first chip");
  assertEq(matchPresetIndex(rule({ marks_correct: 3, marks_wrong: 0.5 })), -1, "+3/−0.5 is custom");
});

test("tuning the multi-answer knobs does not un-match a preset", () => {
  assertEq(
    matchPresetIndex(rule({ marks_correct: 4, marks_wrong: 1, mcq_mode: "all_or_nothing" })),
    3,
    "the chips describe the three numbers, nothing else"
  );
});

test("the changed-dot only appears once a multi-answer knob is moved", () => {
  assertEq(isDefaultMultiAnswer(rule()), true, "untouched");
  assertEq(isDefaultMultiAnswer(rule({ marks_correct: 99 })), true, "the three numbers are not multi-answer settings");
  assertEq(isDefaultMultiAnswer(rule({ mcq_mode: "all_or_nothing" })), false, "moved");
  assertEq(isDefaultMultiAnswer(rule({ rounding_strategy: "ceil" })), false, "moved");
});

console.log("\n" + "─".repeat(60));
console.log("\n🔒 THE WRITES ARE THE WRITES THAT WERE THERE BEFORE\n");
console.log("─".repeat(60) + "\n");

test("the panel still owns no Supabase mutation of its own", () => {
  // Scoped to Supabase chains on purpose: `.delete(` is also how a Set forgets
  // an expanded question, and banning the word outright would ban the panel.
  const mutation = /supabase[\s\S]{0,300}?\.(upsert|insert|delete|update)\(/.exec(PANEL);
  assertEq(mutation, null, `the panel reached the DB directly: ${mutation && mutation[0].slice(-40)}`);
  assertEq(PANEL.includes(".upsert("), false, "no upsert anywhere — writes belong to useMarksModule");
});

test("the panel still reads exactly the three tables it always read", () => {
  for (const table of ['from("exams")', 'from("sections")', 'from("parsed_questions")']) {
    assert(PANEL.includes(table), `lost the read of ${table}`);
  }
});

test("multi-language exams still configure marks on the primary language only", () => {
  assert(PANEL.includes('eq("language", primaryLang)'), "the primary-language section filter is gone");
  assert(
    PANEL.includes("supported_languages") && PANEL.includes("primary_language"),
    "the language columns are still read"
  );
});

test("every write still goes through the same six hook actions", () => {
  for (const action of [
    "marks.updateExamConfig(",
    "marks.updateSectionConfig(",
    "marks.updateQuestionConfig(",
    "marks.removeQuestionConfig(",
    "marks.applyExamDefaultToAll(",
    "marks.applySectionDefaultToAll(",
  ]) {
    assert(PANEL.includes(action), `lost ${action}`);
  }
});

test("Apply-to-all still saves the default first, then stamps the questions", () => {
  const saveAt = PANEL.indexOf("await marks.updateExamConfig(examDraft)");
  const applyAt = PANEL.indexOf("await marks.applyExamDefaultToAll(");
  assert(saveAt !== -1, "the auto-save before apply is gone");
  assert(applyAt !== -1, "the bulk apply is gone");
  assert(saveAt < applyAt, "the default must be saved BEFORE it is stamped onto every question");
});

test("Apply-to-all still stamps a display-flag-free config", () => {
  assert(
    PANEL.includes("marks.applyExamDefaultToAll(toScoring(examDraft))"),
    "the bulk payload must be stripped of show_marks_in_simulator"
  );
});

test("the section apply still saves the section rule first", () => {
  const saveAt = PANEL.indexOf("await marks.updateSectionConfig(selectedSectionId, sectionDraft)");
  const applyAt = PANEL.indexOf("await marks.applySectionDefaultToAll(selectedSectionId, sectionDraft)");
  assert(saveAt !== -1 && applyAt !== -1, "the section save/apply pair is gone");
  assert(saveAt < applyAt, "save before apply");
});

test("a penalty still cannot exceed what the question is worth, and cannot go negative", () => {
  const wrongClamp = "Math.max(0, Math.min(n, config.marks_correct))";
  const occurrences = PANEL.split(wrongClamp).length - 1;
  assertEq(occurrences, 4, "both the wrong and blank fields, in the roomy and the compact form (2 × 2)");
  assert(PANEL.includes('update("marks_correct", Math.max(0, n))'), "marks_correct is still floored at 0");
});

test("the scoring engine itself was not touched by the redesign", () => {
  assert(ENGINE.includes("export function scoreSCQ("), "scoreSCQ is gone");
  assert(ENGINE.includes("export function scoreMCQ("), "scoreMCQ is gone");
  assert(ENGINE.includes("export function resolveConfig("), "resolveConfig is gone");
  assert(!/^import /m.test(ENGINE), "the engine must stay import-free and deterministic");
});

test("resolution order in the engine is still question → section → exam", () => {
  // Slice from the body, not the signature — the parameter list names
  // examConfig long before the fallback chain reaches it.
  const fn = ENGINE.slice(ENGINE.indexOf("export function resolveConfig("));
  const order = fn.slice(fn.indexOf("return ("));
  const q = order.indexOf("questionConfigs.get(questionId)");
  const s = order.indexOf("sectionConfigs.get(sectionId)");
  const e = order.indexOf("examConfig");
  assert(q !== -1 && s !== -1 && e !== -1, "the chain is unrecognisable");
  assert(q < s && s < e, "question must be consulted first, exam last");
});

console.log("\n" + "─".repeat(60));
console.log("\n🧾 NOTHING THE OLD PANEL COULD DO WAS DROPPED\n");
console.log("─".repeat(60) + "\n");

test("all six scoring fields are still editable", () => {
  for (const field of [
    "marks_correct",
    "marks_wrong",
    "marks_skipped",
    "mcq_mode",
    "mcq_wrong_penalty",
    "rounding_strategy",
  ]) {
    assert(PANEL.includes(`update("${field}"`), `${field} lost its control`);
  }
});

test("all four rounding strategies are still offered", () => {
  for (const strategy of ["floor", "round", "ceil", "none"]) {
    assert(PANEL.includes(`value: "${strategy}" as const`), `the ${strategy} rounding option is gone`);
  }
});

test("both scoring modes and both penalty styles are still offered", () => {
  for (const option of ["partial", "all_or_nothing", "flat", "per_option"]) {
    assert(PANEL.includes(`value: "${option}" as const`), `the ${option} option is gone`);
  }
});

test("the words a creator searches for still appear on screen", () => {
  // Plain language is the default, but the domain terms have to be findable —
  // someone looking for "floor" or "MCQ" must not conclude the feature was cut.
  for (const term of ["MCQ", "Multi-correct", "floor", "ceil", "round", "partial credit", "Rounding", "Penalty"]) {
    assert(PANEL.includes(term), `"${term}" appears nowhere — the feature reads as missing even though it works`);
  }
});

test("the multi-answer block never reads as unavailable", () => {
  assert(!PANEL.includes("safe to skip"), "'safe to skip' made a working feature look switched off");
  assert(PANEL.includes("no such question in this exam yet"), "state the count plainly instead");
});

test("every question still shows its answer type, not only the multi ones", () => {
  const row = PANEL.slice(PANEL.indexOf("Q{q.q_no}"));
  const chip = row.indexOf("{q.answer_type}");
  const badge = row.indexOf("<MarksQuestionBadge");
  assert(chip !== -1, "the answer-type chip is gone from the question row");
  assert(chip < badge, "and it belongs on the row itself, beside the number");
});

test("the question text is still available while editing that question's marks", () => {
  assert(PANEL.includes("renderMathInRichText(q.text)"), "the question preview is gone entirely");
});

test("question text is RENDERED, never dumped as source", () => {
  // parsed_questions.text holds LaTeX and editor HTML. Printed raw it reads
  // "$(Use~\\pi=\\frac{22}{7})$" — and worse, JSON import can leave a control
  // character where the \f of \frac was, which only renderMath's
  // repairEatenEscapes puts back. Every other surface in the app routes through
  // it; this panel was the one that did not.
  const rendered = PANEL.match(/dangerouslySetInnerHTML=\{\{ __html: renderMathInRichText\(q\.text\) \}\}/g) || [];
  assertEq(rendered.length, 2, "both the collapsed row and the expanded box must render");
  assert(!/>\s*\{q\.text\}\s*</.test(PANEL), "a raw {q.text} dump shows a creator the LaTeX source");
});

test("the inheritance chain is stated on every tab, not just one", () => {
  const legend = "A question uses its own rule first, then its section's, then the exam default.";
  const lines = PANEL.split("\n");
  const at = lines.findIndex((l) => l.includes(legend));
  assert(at !== -1, "the legend is gone");

  // Nesting shows up as depth: a legend inside a tab branch is indented past it.
  let open = at;
  while (open >= 0 && !lines[open].trimStart().startsWith("<p")) open--;
  const legendIndent = lines[open].search(/\S/);
  const branchIndents = lines
    .filter((l) => l.trimStart().startsWith('{tab === "exam" && ('))
    .map((l) => l.search(/\S/));
  assert(
    branchIndents.includes(legendIndent),
    "the legend must be a sibling of the tab branches, not nested inside one"
  );
});

test("multi-language exams are still told the bulk action crosses languages", () => {
  assert(PANEL.includes('isMultiLang ? " (every language)" : ""'), "the language cue on the bulk action is gone");
  assert(PANEL.includes("Set marks once, in the primary language"), "the multi-language explainer is gone");
});

test("the section and question counts the old panel showed are still shown", () => {
  assert(PANEL.includes("sectionQuestionCounts.get(s.id)"), "per-section question counts are gone");
  assert(PANEL.includes("questionIds.length"), "the exam-wide question count is gone");
});

console.log("\n" + "─".repeat(60));
console.log("\n🗣️  THE WORDING CARRIES THE CONSEQUENCE\n");
console.log("─".repeat(60) + "\n");

test("the destructive action names its blast radius instead of saying 'Apply to All'", () => {
  assert(!PANEL.includes("Apply to All"), "'Apply to All (85)' told nobody what it overwrites");
  assert(PANEL.includes("Overwrite all {questionIds.length} questions"), "the button must say what it overwrites");
});

test("the destructive action asks once before it fires", () => {
  assert(PANEL.includes('setConfirming("exam")'), "the exam apply must go through a confirm step");
  assert(PANEL.includes('setConfirming("section")'), "the section apply must go through a confirm step");
  assert(
    PANEL.includes("onConfirm={handleApplyExamToAll}"),
    "the bulk write must be reachable only from the confirm bar"
  );
  assert(
    !PANEL.includes("onClick={handleApplyExamToAll}"),
    "no one-click path to overwriting every question in the paper"
  );
});

test("the confirm counts the rules it is about to destroy", () => {
  assert(PANEL.includes("customQuestionCount > 0"), "the warning must know how many custom rules exist");
});

test("saving the default is reachable at all — it was dead code before", () => {
  assert(PANEL.includes("onClick={saveExamConfig}"), "the exam Save button never existed; edits were silently lost");
  assert(PANEL.includes("onClick={saveSectionConfig}"), "the section Save button never existed either");
});

test("the student-visibility toggle is reachable from every tab, not buried in one", () => {
  const toggle = PANEL.indexOf('id="show-marks-toggle"');
  const tabs = PANEL.indexOf('role="tablist"');
  assert(toggle !== -1 && tabs !== -1, "the toggle or the tab strip is gone");
  assert(
    toggle < tabs,
    "it is exam-wide and gets flipped often — it belongs above the tabs, where no tab can hide it"
  );
  assert(
    !/tab === "exam" &&[\s\S]*id="show-marks-toggle"/.test(PANEL),
    "the toggle must not be rendered inside a tab branch"
  );
});

test("no dev-speak left on screen", () => {
  assert(!PANEL.includes("Priority: Question → Section → Exam"), "arrow notation is a schema, not a sentence");
  assert(!PANEL.includes("Multi-Correct (MCQ) Settings"), "'MCQ' is jargon for the person writing the paper");
  assert(!PANEL.includes("⌊ Floor"), "floor/ceil glyphs are maths notation, not options");
  assert(!PANEL.includes("2.7 → 2"), "that example was also wrong — rounding acts on the 2nd decimal, not the unit");
});

test("the three numbers say what they do to a student", () => {
  assert(PANEL.includes("Right answer"), "'Correct' names the field; 'Right answer' names the event");
  assert(PANEL.includes("Wrong answer"), "same for the penalty");
  assert(PANEL.includes("Left blank"), "'Skipped' → 'Left blank'");
  assert(PANEL.includes("keep 0 for no negative marking"), "the 0 case must be spelled out, not inferred");
});

test("the rule is restated in a sentence, not just three boxes", () => {
  assert(PANEL.includes("function SchemeSentence("), "the plain-English restatement is gone");
  assert(PANEL.includes("Each right answer earns"), "the sentence must lead with what a student gains");
});

test("a penalty is never shown as a bare number", () => {
  assert(PANEL.includes('sign="−"'), "the minus sign must be rendered beside the field, not implied by its label");
  assert(PANEL.includes('sign="+"'), "and the plus beside the positive one");
});

console.log("\n" + "─".repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  process.exit(1);
} else {
  console.log("🎉 The panel reads differently and scores identically.\n");
}
