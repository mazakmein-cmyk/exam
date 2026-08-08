/**
 * EXAM INSTRUCTION — "GENERATE FROM EXAM"
 *
 * Run with: node src/__tests__/exam-instruction-engine.test.mjs
 *
 * The engine turns stored exam facts into candidate-facing text, in English
 * and Hindi. Unlike the template button, the words are computed — so this
 * test IMPORTS the engine and asserts on real output, because the failure
 * modes are all quiet lies in prose:
 *
 *  • A wrong number. Candidates plan their time by these lines; "60 minutes"
 *    over a 90-minute paper is worse than no line at all. Hence the rule the
 *    whole engine follows — unknown facts drop their sentence, never become
 *    defaults — and half of these tests are "given less, say less".
 *  • The wrong sign. marks_wrong is stored as a positive magnitude (CHECK >= 0
 *    in the marks migration) and negated at award time; text that echoes the
 *    stored value as "+0.5 for a wrong answer" would invert the scheme.
 *  • The wrong mode. Locked and free exams contradict each other in almost
 *    every timing sentence (reopen vs never reopen, one clock vs many); a
 *    mode mix-up produces fluent, plausible, false instructions.
 *  • The wrong language. A Hindi field with English prose in it, or Hindi
 *    lines that quietly say less than the English ones.
 *
 * The static half pins the wiring: the button collects facts the same way the
 * runner builds the paper (is_excluded), treats uniformity as a value
 * comparison (because "Apply to All" materialises override rows equal to the
 * default), and shares the template button's undo mechanism.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateExamInstruction, canGenerateFor } from "../lib/examInstructionEngine.js";

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

/** A fully-known three-section locked paper — the richest honest case. */
function fullFacts() {
  return {
    sections: [
      { name: "General Awareness", minutes: 15, questionCount: 15 },
      { name: "Reasoning", minutes: 20, questionCount: 20 },
      { name: "Mathematics", minutes: 25, questionCount: 15 },
    ],
    allowSectionSwitching: false,
    totalMinutes: 60,
    marking: {
      correct: 2,
      wrong: 0.5,
      skipped: 0,
      mcqMode: "partial",
      mcqWrongPenalty: "flat",
      uniform: true,
    },
    answerTypes: { single: 44, multi: 6 },
    languageNames: ["English", "Hindi"],
  };
}

console.log("\n══ Exam instruction — generate from exam ══");

// ─── [1] The full story, when every fact is known ───────────────────────────
console.log("\n[1] Full facts, locked paper");

const full = generateExamInstruction(fullFacts(), "en");

test("sections, counts and the total are all stated", () => {
  assert(full !== null, "full facts must generate");
  assert(
    full.includes("This paper has 3 sections — General Awareness (15), Reasoning (20), Mathematics (15) — 50 questions in all."),
    `shape line wrong:\n${full}`
  );
});

test("locked timing lists every clock and the sum, and says sections never reopen", () => {
  assert(
    full.includes("Each section is timed separately: General Awareness — 15 min; Reasoning — 20 min; Mathematics — 25 min (60 minutes in all)."),
    `timing numbers wrong:\n${full}`
  );
  assert(
    full.includes("Sections are sat in order, and a submitted section cannot be reopened."),
    "the no-reopening rule is the single most surprising fact of locked mode — it cannot be omitted"
  );
});

test("expiry describes the section auto-submit and the 5-minute warning", () => {
  assert(
    full.includes("When a section's time is up it is submitted automatically") && full.includes("5 minutes remain"),
    "auto-submit at zero is runner behavior — the instruction must warn about it"
  );
});

test("marking states the earn, the deduction, and the skip rule", () => {
  assert(
    full.includes("Marking: each correct answer earns +2 marks; each wrong answer deducts 0.5 marks; unanswered questions score 0."),
    `marking line wrong:\n${full}`
  );
  assert(!/\+0\.5|-0\.5|−0\.5/.test(full), "marks_wrong is a magnitude; echoing it signed would invert the scheme");
});

test("multi-answer questions get their scoring rule (partial + flat here)", () => {
  // The scorer's partial mode pays shares ONLY on a clean selection — one
  // wrong pick forfeits every share and leaves just the penalty. The sentence
  // must not let "share" and "deduction" read as coexisting.
  assert(
    full.includes("Multiple-answer questions earn a share of the marks for each correct option picked, as long as no wrong option is chosen; picking any wrong option forfeits the shares and costs one flat deduction of 0.5 marks."),
    `mcq line wrong:\n${full}`
  );
});

test("partial credit with no penalty still warns that a wrong pick forfeits the shares", () => {
  const facts = fullFacts();
  facts.marking.wrong = 0;
  const out = generateExamInstruction(facts, "en");
  assert(
    out.includes("picking any wrong option forfeits the question's marks"),
    "with marks_wrong=0 nothing deducts, but the scorer still zeroes the shares — silence here misprices the risk of guessing"
  );
});

test("question types and languages are listed", () => {
  assert(full.includes("multiple choice, one answer (44)") && full.includes("multiple choice, several answers (6)"), `types line wrong:\n${full}`);
  assert(full.includes("The paper is available in English and Hindi — choose your language before you begin."), `languages line wrong:\n${full}`);
});

test("lines are numbered 1..n with no gaps", () => {
  const numbers = full.split("\n").map((line) => Number(line.match(/^(\d+)\. /)?.[1]));
  assert(numbers.every((n) => Number.isFinite(n)), `an unnumbered line slipped in:\n${full}`);
  assert(
    numbers.every((n, i) => n === i + 1),
    `numbering has gaps (${numbers.join(",")}) — a dropped line must renumber the ones after it`
  );
});

// ─── [2] Free mode contradicts locked mode, and must say so ─────────────────
console.log("\n[2] Free mode");

const free = generateExamInstruction({ ...fullFacts(), allowSectionSwitching: true, totalMinutes: 90 }, "en");

test("free mode states one clock and free movement", () => {
  assert(
    free.includes("You have 90 minutes for the whole paper. All sections share one clock — move between them in any order and change any answer until you submit."),
    `free timing wrong:\n${free}`
  );
});

test("free mode never claims sections close or are sat in order", () => {
  assert(
    !free.includes("cannot be reopened") && !free.includes("sat in order") && !free.includes("timed separately"),
    "locked-mode sentences in a free paper tell candidates to ration time they are free to spend"
  );
  assert(free.includes("The paper is submitted automatically when time runs out"), "free expiry is about the paper, not a section");
});

test("free mode with no usable clock still explains movement, without a number", () => {
  const noClock = generateExamInstruction({ ...fullFacts(), allowSectionSwitching: true, totalMinutes: null }, "en");
  assert(noClock.includes("All sections share one clock"), "movement is still true without a stated total");
  assert(!/\d+ minutes for the whole paper/.test(noClock), "no total may be invented");
});

test("an unchosen mode (create time) says nothing timing- or order-shaped", () => {
  // The DB will default to locked, but a default is a setting, not a promise:
  // "sat in order, cannot be reopened" written at create time outlives the
  // creator flipping the switch, and then contradicts the live intro panel
  // rendered directly below it.
  const out = generateExamInstruction({ ...fullFacts(), allowSectionSwitching: null }, "en");
  assert(out !== null && out.includes("This paper has 3 sections"), "the shape is still known and still stated");
  for (const claim of ["sat in order", "cannot be reopened", "share one clock", "timed separately", "submitted automatically"]) {
    assert(!out.includes(claim), `mode-dependent claim written before the mode was chosen: "${claim}"`);
  }
});

test("an unchosen mode with one section still states the clock — one section is mode-proof", () => {
  const out = generateExamInstruction(
    { ...fullFacts(), allowSectionSwitching: null, sections: [{ name: "General Awareness", minutes: 45, questionCount: null }] },
    "en"
  );
  assert(out.includes("You have 45 minutes for the paper."), "locked or free, a one-section paper has exactly this clock");
  assert(out.includes("submitted automatically"), "auto-submit at zero is true in either mode for one section");
});

// ─── [3] Given less, say less ───────────────────────────────────────────────
console.log("\n[3] Unknown facts drop their sentence");

test("unknown question counts drop counts and total, keeping names", () => {
  const facts = fullFacts();
  facts.sections.forEach((s) => (s.questionCount = null));
  const out = generateExamInstruction(facts, "en");
  assert(out.includes("This paper has 3 sections: General Awareness, Reasoning and Mathematics."), `shape line wrong:\n${out}`);
  assert(!/questions in all/.test(out), "a total cannot survive unknown per-section counts");
});

test("one unset section clock drops every clock from the locked line", () => {
  const facts = fullFacts();
  facts.sections[1].minutes = null;
  const out = generateExamInstruction(facts, "en");
  assert(
    !out.includes("15 min") && !out.includes("(60 minutes in all)"),
    "listing two clocks and omitting the third reads as 'the third is untimed' — a claim, not an omission"
  );
  assert(out.includes("Each section has its own time limit"), "the mode itself is still known and still stated");
});

test("no marking scheme, no marking prose", () => {
  const out = generateExamInstruction({ ...fullFacts(), marking: null }, "en");
  assert(!/Marking:|marks|negative/.test(out), `an unscored paper must not discuss marks:\n${out}`);
});

test("unknown answer types drop the types line and the MCQ rule", () => {
  const out = generateExamInstruction({ ...fullFacts(), answerTypes: null }, "en");
  assert(!/Question types|multiple choice/.test(out), "types cannot be guessed at");
  assert(!/Multiple-answer questions/.test(out), "the MCQ rule needs to know multi questions exist");
});

test("a single language earns no language line", () => {
  const out = generateExamInstruction({ ...fullFacts(), languageNames: ["English"] }, "en");
  assert(!/available in/.test(out), "there is no choice to describe");
});

test("no sections at all → null, not a hollow instruction", () => {
  assert(generateExamInstruction({ ...fullFacts(), sections: [] }, "en") === null, "an empty paper has nothing true to say");
});

// ─── [4] Marking variants ───────────────────────────────────────────────────
console.log("\n[4] Marking tells the truth in every configuration");

test("no negative marking is said outright", () => {
  const facts = fullFacts();
  facts.marking.wrong = 0;
  const out = generateExamInstruction(facts, "en");
  assert(out.includes("there is no negative marking"), "candidates skip questions to dodge a penalty that doesn't exist");
  assert(!/deducts/.test(out), "nothing deducts in this scheme");
});

test("a skip penalty is stated when it exists", () => {
  const facts = fullFacts();
  facts.marking.skipped = 0.25;
  const out = generateExamInstruction(facts, "en");
  assert(out.includes("leaving a question unanswered deducts 0.25 marks"), "a silent skip penalty is the cruelest omission on this page");
  assert(!out.includes("unanswered questions score 0"), "both skip sentences at once contradict each other");
});

test("non-uniform marking is flagged as a default, not a promise", () => {
  const facts = fullFacts();
  facts.marking.uniform = false;
  const out = generateExamInstruction(facts, "en");
  assert(
    out.includes("Some sections or questions are marked differently — these are the paper's default marks."),
    "stating +2/−0.5 as universal when a section overrides it is a lie with numbers in it"
  );
});

test("overrides with no exam default get one honest sentence, no numbers", () => {
  const out = generateExamInstruction(
    { ...fullFacts(), marking: null, scoredWithoutDefault: true },
    "en"
  );
  assert(out.includes("Marks are set individually per section or question for this paper."), `overrides-only wrong:\n${out}`);
  assert(!/\+\d/.test(out), "there is no default to quote numbers from");
});

test("per-option and all-or-nothing MCQ rules each get their own words", () => {
  const perOption = fullFacts();
  perOption.marking.mcqWrongPenalty = "per_option";
  assert(
    generateExamInstruction(perOption, "en").includes("picking wrong options forfeits the shares and deducts 0.5 marks per wrong option, capped at the question's full marks"),
    "per-option is the scheme candidates most need warned about"
  );
  const allOrNothing = fullFacts();
  allOrNothing.marking.mcqMode = "all_or_nothing";
  assert(
    generateExamInstruction(allOrNothing, "en").includes("Multiple-answer questions earn their marks only when every correct option — and no wrong one — is selected."),
    "all-or-nothing must not read as partial credit"
  );
});

test("aliases fold the way THIS runner folds them; live-only and junk types are dropped", () => {
  const out = generateExamInstruction(
    {
      ...fullFacts(),
      answerTypes: { single: 10, multiple: 3, short_answer: 2, "multi-select": 4, integer: 1, garbage_type: 5 },
    },
    "en"
  );
  const typesRow = out.split("\n").find((l) => l.includes("Question types:")) || "";
  assert(typesRow.includes("multiple choice, several answers (3)"), "'multiple' is the scorer's alias for multi");
  assert(typesRow.includes("typed answer (2)"), "short_answer/essay render as typed answers in ExamSimulator");
  // 'multi-select' and 'integer' are live-session names; ExamSimulator scores
  // them as single-choice, so folding them would describe a different paper.
  assert(
    !typesRow.includes("(7)") && !typesRow.includes("numeric answer"),
    "live-only aliases must not inflate this runner's buckets"
  );
  assert(!/garbage|\(5\)/.test(typesRow), "an unrecognised type must not become a made-up category");
});

test("all-single papers get the plain sentence, not a one-row table", () => {
  const out = generateExamInstruction({ ...fullFacts(), answerTypes: { single: 50 } }, "en");
  assert(out.includes("Every question is multiple choice with a single correct answer."), `types line wrong:\n${out}`);
});

test("marks format like formatMarks: integers bare, decimals trimmed, 1 is singular", () => {
  const facts = fullFacts();
  facts.marking.correct = 1;
  facts.marking.wrong = 0.25;
  const out = generateExamInstruction(facts, "en");
  assert(out.includes("earns +1 mark;"), "'1 marks' reads as a typo in the very line about precision");
  assert(out.includes("deducts 0.25 marks"), "0.25 must not render as 0.30 or 0.2");
});

// ─── [5] Hindi is a first-class output, not a translation gap ───────────────
console.log("\n[5] हिंदी");

test("the engine writes Hindi, and says it can", () => {
  assert(canGenerateFor("hi") === true, "canGenerateFor gates the button; false hides Hindi forever");
  assert(canGenerateFor("ta") === false, "a language with no copy pack must be refused, not defaulted to English");
});

const hiFacts = () => ({
  ...fullFacts(),
  sections: [
    { name: "सामान्य ज्ञान", minutes: 15, questionCount: 15 },
    { name: "तर्कशक्ति", minutes: 20, questionCount: 20 },
    { name: "गणित", minutes: 25, questionCount: 15 },
  ],
  languageNames: ["English", "हिंदी"],
});

const hi = generateExamInstruction(hiFacts(), "hi");

test("the Hindi output is Hindi — Devanagari sentences ending in the danda", () => {
  assert(hi !== null, "hi must generate");
  const lines = hi.split("\n");
  assert(lines.every((l) => /[ऀ-ॿ]/.test(l)), `a line came out without Devanagari:\n${hi}`);
  assert(lines.every((l) => /।$|\)$/.test(l.trim())), `Hindi sentences end with ।:\n${hi}`);
});

test("the Hindi instruction says everything the English one says", () => {
  // Same facts, same number of lines — Hindi candidates are not told less.
  assert(
    hi.split("\n").length === full.split("\n").length,
    `en says ${full.split("\n").length} things, hi says ${hi.split("\n").length}:\n${hi}`
  );
  assert(hi.includes("इस प्रश्नपत्र में 3 खंड हैं — सामान्य ज्ञान (15), तर्कशक्ति (20), गणित (15) — कुल 50 प्रश्न।"), `hi shape wrong:\n${hi}`);
  assert(hi.includes("अंकन: प्रत्येक सही उत्तर पर +2 अंक; प्रत्येक गलत उत्तर पर 0.5 अंक की कटौती होगी; अनुत्तरित प्रश्नों पर 0 अंक।"), `hi marking wrong:\n${hi}`);
  assert(hi.includes("सबमिट किया गया खंड दोबारा नहीं खोला जा सकता।"), "the no-reopening rule matters in every language");
  assert(hi.includes("English और हिंदी"), "the language list uses the Hindi conjunction");
});

test("Hindi deductions use the कटौती construction — grammatical at 1, 0.5 and 2 alike", () => {
  // कटेंगे is plural; with the ubiquitous −1 scheme it reads as an error, and
  // the noun अंक being invariant hides that the VERB still inflects.
  const one = hiFacts();
  one.marking.wrong = 1;
  const out = generateExamInstruction(one, "hi");
  assert(out.includes("प्रत्येक गलत उत्तर पर 1 अंक की कटौती होगी"), `hi -1 wording wrong:\n${out}`);
  assert(!/कटेंगे|कटेगा/.test(out), "no inflected form of कटना should survive — that is the agreement trap itself");
});

test("Hindi free mode switches every timing sentence, and calls the clock टाइमर", () => {
  const out = generateExamInstruction({ ...hiFacts(), allowSectionSwitching: true, totalMinutes: 90 }, "hi");
  assert(out.includes("पूरे प्रश्नपत्र के लिए आपके पास 90 मिनट हैं।"), `hi free clock wrong:\n${out}`);
  assert(!out.includes("दोबारा नहीं खोला जा सकता"), "free mode must not carry the locked no-reopen warning");
  // The hi general-instruction template on the same intro screen says
  // काउंटडाउन टाइमर; घड़ी would name the same object a second way (and reads
  // as a wall clock besides).
  assert(out.includes("टाइमर") && !out.includes("घड़ी"), "one object, one name, across both Hindi texts");
});

test("the Hindi non-uniform pointer says यहाँ, because the defaults sit in the same line", () => {
  const facts = hiFacts();
  facts.marking.uniform = false;
  const out = generateExamInstruction(facts, "hi");
  assert(out.includes("यहाँ दिए अंक"), "ऊपर would point up the numbered list, where there are no marks at all");
});

// ─── [6] The wiring: facts are collected the way the runner reads them ──────
console.log("\n[6] Wiring (static)");

const GEN = readSrc("components/exam/GenerateExamInstruction.tsx");
const DETAIL = readSrc("pages/ExamDetail.tsx");
const DIALOG = readSrc("components/CreateExamDialog.tsx");

test("the editor counts questions with the runner's own filter", () => {
  assert(
    /\.select\("id, section_id, answer_type"\)[\s\S]{0,80}\.eq\("is_excluded", false\)/.test(DETAIL),
    "ExamSimulator builds the paper with .eq(is_excluded,false); counting without it inflates every number a candidate reads"
  );
});

test("the count query pages past PostgREST's response cap", () => {
  const collect = DETAIL.slice(DETAIL.indexOf("const collectExamFacts"), DETAIL.indexOf("const getQuestionErrors"));
  assert(
    /\.range\(from, from \+ PAGE - 1\)/.test(collect) && /data\.length < PAGE/.test(collect),
    "a single unbounded select is silently truncated at max-rows (1000 by default) — an undercount, not an error"
  );
  assert(/\.order\("id"\)/.test(collect), "pagination without a stable order can skip or repeat rows between pages");
});

test("scoring overrides are looked up by primary-language ids", () => {
  const collect = DETAIL.slice(DETAIL.indexOf("const collectExamFacts"), DETAIL.indexOf("const getQuestionErrors"));
  assert(
    /primarySectionIds/.test(collect) && /getSectionScoringDefaults\(overrideSectionIds\)/.test(collect),
    "override rows live on primary-language sections/questions; querying by the Hindi tab's ids returns nothing and every paper reads as uniformly marked"
  );
  assert(
    /getQuestionScoringConfigs\(overrideQuestionIds\)/.test(collect),
    "question overrides need the primary ids too, not just sections"
  );
});

test("the languages line reads what candidates can sit, not what the editor supports", () => {
  const collect = DETAIL.slice(DETAIL.indexOf("const collectExamFacts"), DETAIL.indexOf("const getQuestionErrors"));
  assert(
    /is_published && \(exam\.published_languages\?\.length \?\? 0\) > 0/.test(collect),
    "publishing can select a subset; 'choose your language' naming an unpublished one describes a chooser that does not exist"
  );
});

test("flipping section switching warns about the stored instruction text", () => {
  assert(
    /use Generate from exam to rewrite it/.test(DETAIL),
    "the toggle is where generated timing sentences go stale; the toast is the one place that knows both facts"
  );
});

test("uniformity is a value comparison, not a row count", () => {
  const collect = DETAIL.slice(DETAIL.indexOf("const collectExamFacts"), DETAIL.indexOf("const getQuestionErrors"));
  assert(collect.length > 0, "collectExamFacts moved — this slice found nothing");
  assert(
    /rounding_strategy === examDefault\.rounding_strategy/.test(collect),
    "'Apply to All' writes override rows EQUAL to the default; counting rows would flag uniform papers as varied"
  );
  assert(
    /overrides\.every\(sameAsDefault\)/.test(collect),
    "every override must be compared, sections and questions both"
  );
});

test("the editor's whole-paper clock follows the runner's fallback rule", () => {
  assert(
    /totalMinutes: totalTimeMinutes \?\? \(sumSectionMinutes\(sections\) \|\| null\)/.test(DETAIL),
    "totalExamMinutes prefers the explicit total, falls back to the section sum, and treats 0 as unknown"
  );
});

test("the generator shares the template's undo mechanism and never self-fills", () => {
  assert(/useUndoableFill\(\{ lang, value, onFill \}\)/.test(GEN), "one undo contract for every fill button");
  assert(/if \(busy\) return/.test(GEN), "a double-click must not race two generations");
  assert(/epoch !== epochRef\.current/.test(GEN), "a fill resolving after a tab switch lands in a field it was never asked about");
  assert(!/matchesTemplate/.test(GEN), "generated text has no sync applied-state to verify — pretending otherwise shows stale checkmarks");
});

test("the epoch bumps in a layout effect, before a network callback can see the new tab", () => {
  assert(
    /useLayoutEffect\(\(\) => \{\s*epochRef\.current \+= 1/.test(GEN),
    "a passive effect flushes a beat after the commit; a fetch resolving in that beat passes a stale guard and writes into the old tab's field"
  );
});

test("a programmatic fill resets the transliteration machinery", () => {
  const TRANS = readSrc("components/TransliterateTextarea.tsx");
  assert(
    /if \(value === lastInternalValue\.current\) return/.test(TRANS),
    "an external write (fill, undo) must clear the suggestion state — its offsets describe text no longer in the box"
  );
  assert(
    /epoch !== fetchEpochRef\.current/.test(TRANS),
    "an in-flight suggestion fetch must not reopen the dropdown over filled text"
  );
  // The stale dropdown was not cosmetic: accepting a suggestion spliced
  // Devanagari into the generated text at the OLD word's offsets, and the
  // corruption withdrew the Undo offer in the same render.
});

test("both pages hand the button the field it actually fills", () => {
  assert(
    /GenerateExamInstruction[\s\S]{0,200}lang=\{activeLanguage\}[\s\S]{0,200}value=\{examSpecificInstructionTrans\[activeLanguage\]/.test(DETAIL),
    "the editor's generator follows the active language tab"
  );
  assert(
    /GenerateExamInstruction[\s\S]{0,200}lang=\{instructionLang\}[\s\S]{0,200}value=\{examSpecificInstruction\}/.test(DIALOG),
    "the dialog's generator uses the same derived language as its textarea"
  );
});

test("the dialog invents no facts it does not have", () => {
  const block = DIALOG.slice(DIALOG.indexOf('htmlFor="exam-instruction"') - 4000, DIALOG.indexOf('htmlFor="exam-instruction"') + 200);
  const collect = DIALOG.slice(DIALOG.indexOf("collectFacts={() => ("), DIALOG.indexOf("onError=", DIALOG.indexOf("collectFacts={() => (")));
  assert(collect.length > 0, "the dialog's collectFacts moved — this slice found nothing");
  assert(/questionCount: null/.test(collect), "no questions exist at create time; a count of 0 would be a claim");
  assert(/marking: null/.test(collect) && /answerTypes: null/.test(collect), "no marks module, no types — at create time these are unknowable");
  assert(
    /allowSectionSwitching: null/.test(collect),
    "the mode is UNCHOSEN at create time, not false — the DB default is a setting, and stating its consequences outlives the creator flipping the switch"
  );
  assert(block.length > 0, "sanity: the exam-instruction field exists");
});

test("the dialog's tooltip promises only what create-time facts can deliver", () => {
  assert(
    /titles=\{\{[\s\S]{0,400}sections you've added/.test(DIALOG),
    "the default tooltip promises timing and marking; the dialog has neither, and small print should not lie"
  );
});

test("the dialog persists translations under the language they were written in", () => {
  const keyed = DIALOG.match(/instruction_translations: generalInstruction \? \{ \[instructionLang\]: generalInstruction \} : \{\}/g) || [];
  assert(
    keyed.length === 2,
    "both insert paths (plain and PDF) must key by instructionLang — hardcoded 'en' buried a Hindi-only exam's text under a key its editor never reads"
  );
  assert(
    !/\{ en: generalInstruction \}|\{ en: examSpecificInstruction \}|\{ en: examDescription \}/.test(DIALOG),
    "no hardcoded-'en' translation write may survive"
  );
});

test("both exam-instruction textareas grow for the generated text", () => {
  assert(/rows=\{rowsForText\(examSpecificInstructionTrans\[activeLanguage\] \|\| "", 4, 16, 40\)\}/.test(DETAIL), "the editor's box must fit what lands in it");
  assert(/rows=\{rowsForText\(examSpecificInstruction, 2, 14, 90\)\}/.test(DIALOG), "the dialog's 2-row resize-none box would hide five of seven lines");
});

test("the engine's number rendering stays in lockstep with formatMarks", () => {
  const ENGINE = readSrc("lib/examInstructionEngine.js");
  const SCORING = readSrc("services/scoringEngine.ts");
  const trim = 'toFixed(2).replace(/\\.?0+$/, "")';
  assert(
    ENGINE.includes(trim) && SCORING.includes(trim),
    "fmt() is a deliberate copy of formatMarks (this file must stay Node-importable); if one changes, change both"
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
