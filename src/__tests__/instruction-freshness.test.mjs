/**
 * INSTRUCTION FRESHNESS — noticing that the written instructions went stale
 *
 * Run with: node src/__tests__/instruction-freshness.test.mjs
 *
 * The timing audit could only ever contradict a sentence about the clock, so a
 * creator who added twenty questions was told nothing at all — the counts line
 * kept promising 90 questions over a 110-question paper, and the one warning
 * they had ever seen was about minutes. Two things close that gap:
 *
 *  • auditInstructionShape reads the paper-shape line the generator writes and
 *    compares its numbers to the paper. Same proof-of-authorship rule as the
 *    reconciler: only a line this engine can prove it wrote is ever judged, so
 *    a creator's own sentence is never called stale.
 *  • the review flag records what no sentence can reveal — a save that changed
 *    the exam and left the instructions alone. It says "worth a check", never
 *    "wrong", because it has not read anything.
 *
 * The failure mode both are guarding against is the same one the audits were
 * built to avoid: a banner that cries wolf gets dismissed, and then the real
 * drift ships. So most of this file is about staying SILENT.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  auditInstructionShape,
  generateExamInstruction,
} from "../lib/examInstructionEngine.js";
import { describeInstructionNotice, hasMeaningfulText } from "../lib/instructionFreshness.js";

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
    throw new Error(`${message || "Mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) throw new Error(message || `Expected to contain: "${substring}"`);
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

/** A three-section locked paper with every count known. */
function paper(counts = [20, 25, 45]) {
  return {
    sections: [
      { name: "Reasoning", minutes: 30, questionCount: counts[0], groupId: null },
      { name: "General Awareness", minutes: 30, questionCount: counts[1], groupId: null },
      { name: "English", minutes: 30, questionCount: counts[2], groupId: null },
    ],
    allowSectionSwitching: false,
    totalMinutes: 90,
    groups: null,
    marking: null,
    answerTypes: null,
    languageNames: null,
  };
}

// ─── [1] The counts audit ───────────────────────────────────────────────────
console.log("\n[1] auditInstructionShape — the counts line, checked");

test("text generated from this paper does not disagree with it", () => {
  const facts = paper();
  const text = generateExamInstruction(facts, "en");
  assertEqual(auditInstructionShape(text, facts, "en"), null, "freshly generated text is never stale");
});

test("adding questions makes the stored counts line stale", () => {
  const before = generateExamInstruction(paper([20, 25, 45]), "en");
  const after = paper([20, 25, 60]);
  const found = auditInstructionShape(before, after, "en");
  assert(found !== null, "90 questions promised over a 105-question paper must be caught");
  assertContains(found.stated, "90 questions in all");
  assertContains(found.expected, "105 questions in all");
});

test("renaming a section makes it stale too", () => {
  const before = generateExamInstruction(paper(), "en");
  const after = paper();
  after.sections[0].name = "Logical Reasoning";
  const found = auditInstructionShape(before, after, "en");
  assert(found !== null, "the shape line names the sections; a rename is a disagreement");
  assertContains(found.expected, "Logical Reasoning");
});

test("the Hindi pack is audited in Hindi", () => {
  const before = generateExamInstruction(paper([20, 25, 45]), "hi");
  const found = auditInstructionShape(before, paper([20, 25, 60]), "hi");
  assert(found !== null, "a Hindi paper-shape line goes stale exactly like an English one");
  // And the English matchers must not fire on Hindi text, or every Hindi exam
  // would read as stale forever.
  assertEqual(auditInstructionShape(before, paper([20, 25, 45]), "hi"), null);
});

console.log("\n[2] auditInstructionShape — staying quiet");

test("a creator's own sentence about the sections is never called stale", () => {
  const mine = "1. This paper covers three subjects and is not especially long.";
  assertEqual(auditInstructionShape(mine, paper(), "en"), null, "we cannot read it, so we cannot contradict it");
});

test("a counts-unknown line is not contradicted by counts becoming known", () => {
  // "This paper has 3 sections: A, B and C." is still true; it just says less
  // than the sentence we would write today. Flagging it would fire on every
  // exam that ever generated before its questions were imported.
  const unknown = generateExamInstruction(
    { ...paper(), sections: paper().sections.map((s) => ({ ...s, questionCount: null })) },
    "en"
  );
  assertEqual(auditInstructionShape(unknown, paper(), "en"), null);
});

test("empty text, no sections and an unsupported language all stay silent", () => {
  assertEqual(auditInstructionShape("", paper(), "en"), null);
  assertEqual(auditInstructionShape("   ", paper(), "en"), null);
  assertEqual(auditInstructionShape(generateExamInstruction(paper(), "en"), { ...paper(), sections: [] }, "en"), null);
  assertEqual(auditInstructionShape(generateExamInstruction(paper(), "en"), paper(), "fr"), null);
  assertEqual(auditInstructionShape(null, paper(), "en"), null);
});

// ─── [3] The notice ─────────────────────────────────────────────────────────
console.log("\n[3] describeInstructionNotice — one sentence, ranked by proof");

test("silence when there is nothing to say", () => {
  assertEqual(
    describeInstructionNotice({ timingDrift: null, shapeDrift: null, needsReview: false, hasText: true }),
    null
  );
});

test("a contradiction outranks a suspicion, and cannot be dismissed", () => {
  const notice = describeInstructionNotice({
    timingDrift: { drift: "This text disagrees with the paper: it says 30 min, but students get 90 min.", autoCorrected: false },
    shapeDrift: null,
    needsReview: true,
    hasText: true,
  });
  assertEqual(notice.headline, "Out of date.");
  assertEqual(notice.proven, true);
  assertEqual(notice.dismissible, false, "a warning that can be waved away must not be one we proved");
  assertContains(notice.body, "students get 90 min");
  assert(!notice.body.includes("without touching"), "the specific finding replaces the vague one");
});

test("both audits firing produces one notice, not two", () => {
  const notice = describeInstructionNotice({
    timingDrift: { drift: "Timing is wrong.", autoCorrected: true },
    shapeDrift: { stated: "a", expected: "b" },
    needsReview: false,
    hasText: true,
  });
  assertContains(notice.body, "counts in this text no longer match the paper either");
});

test("counts drift alone still says Out of date and names both sides", () => {
  const notice = describeInstructionNotice({
    timingDrift: null,
    shapeDrift: { stated: "90 questions in all", expected: "105 questions in all" },
    needsReview: false,
    hasText: true,
  });
  assertEqual(notice.headline, "Out of date.");
  assertEqual(notice.dismissible, false);
  assertContains(notice.body, "90 questions in all");
  assertContains(notice.body, "105 questions in all");
});

test("the unproven nudge is softer, and CAN be dismissed", () => {
  const notice = describeInstructionNotice({
    timingDrift: null,
    shapeDrift: null,
    needsReview: true,
    hasText: true,
  });
  assertEqual(notice.headline, "Worth a check.");
  assertEqual(notice.proven, false);
  assertEqual(notice.dismissible, true, "a nag with no off switch is how the next real warning gets ignored");
  assert(
    !/out of date|wrong|disagrees/i.test(notice.body),
    "it has read nothing, so it must not claim the text is wrong"
  );
});

console.log("\n[3b] A field with nothing in it — the case the audits cannot see");

test("a dot is not an instruction", () => {
  // The exact shape this was reported as: required-field validation is
  // satisfied by a single character, the box looks filled, and every
  // emptiness test in the codebase agreed with it.
  assertEqual(hasMeaningfulText("."), false);
  assertEqual(hasMeaningfulText("-"), false);
  assertEqual(hasMeaningfulText("  •  "), false);
  assertEqual(hasMeaningfulText("..."), false);
  assertEqual(hasMeaningfulText(""), false);
  assertEqual(hasMeaningfulText(null), false);
  assertEqual(hasMeaningfulText("1. Read the paper."), true);
  assertEqual(hasMeaningfulText("इस प्रश्नपत्र में"), true);
});

test("a paper with sections and a blank Exam Instruction says so", () => {
  const notice = describeInstructionNotice({
    timingDrift: null,
    shapeDrift: null,
    blank: { examInstruction: true, generalInstruction: false },
    needsReview: false,
    hasText: false,
  });
  assertEqual(notice.headline, "Nothing written yet.");
  assertEqual(notice.dismissible, true);
  assertContains(notice.body, "no Exam Instruction has been written");
});

test("both fields blank is one notice naming both fixes", () => {
  const notice = describeInstructionNotice({
    timingDrift: null,
    shapeDrift: null,
    blank: { examInstruction: true, generalInstruction: true },
    needsReview: false,
    hasText: false,
  });
  assertContains(notice.body, "neither instruction has been written");
  assertContains(notice.body, "Use template");
});

test("a real contradiction still outranks a blank field", () => {
  const notice = describeInstructionNotice({
    timingDrift: { drift: "It says 30 min, but students get 90 min.", autoCorrected: false },
    shapeDrift: null,
    blank: { examInstruction: true, generalInstruction: true },
    needsReview: true,
    hasText: false,
  });
  assertEqual(notice.headline, "Out of date.");
});

test("no blank flags and nothing proven stays silent", () => {
  assertEqual(
    describeInstructionNotice({
      timingDrift: null,
      shapeDrift: null,
      blank: { examInstruction: false, generalInstruction: false },
      needsReview: false,
      hasText: true,
    }),
    null,
    "an exam whose instructions are written and accurate must say nothing at all"
  );
});

// ─── [4] The wiring ─────────────────────────────────────────────────────────
console.log("\n[4] Wiring (static)");

const EDITOR = readSrc("pages/ExamDetail.tsx");
const DIALOG = readSrc("components/PublishExamDialog.tsx");

test("the editor's banner is above the collapse guard, not buried under the field", () => {
  const notice = EDITOR.indexOf("{instructionNotice && (");
  const collapse = EDITOR.indexOf("{!isExamDetailsCollapsed && (");
  assert(notice > 0 && collapse > 0);
  assert(notice < collapse, "a warning inside a collapsed card is a warning nobody reads");
});

test("saving without touching the instructions is what sets the flag", () => {
  assertContains(EDITOR, "const instructionsTouched =");
  assertContains(EDITOR, "if (instructionsTouched) markInstructionsReviewed(exam.id);");
  assertContains(EDITOR, "else markInstructionsUnreviewed(exam.id);");
});

test("the publish dialog warns but never gates", () => {
  assertContains(DIALOG, "instructionFindings.map((finding)");
  const action = DIALOG.slice(DIALOG.indexOf("<AlertDialogAction"));
  assert(
    !/instructionFindings/.test(action.slice(0, 400)),
    "the disclaimer is advisory — exactly like marksWarning, it must not disable Publish"
  );
});

test("the dialog can scroll, so a banner cannot push Publish off-screen", () => {
  assertContains(
    DIALOG,
    'className="max-h-[85vh] overflow-y-auto"',
    "AlertDialogContent is fixed and centred with no max height; taller content clips at both ends and the footer becomes unreachable"
  );
});

test("regenerating from the dialog keeps the editor's copy in step", () => {
  assertContains(DIALOG, "onInstructionsRegenerated?.(nextMap)");
  assertContains(EDITOR, "onInstructionsRegenerated={(translations) => {");
  assertContains(
    EDITOR,
    "exam_instruction_translations: translations,",
    "the dirty baseline moves too, or the next Save writes the old text back over the new one"
  );
});

test("an in-dialog rewrite can be put back", () => {
  assertContains(DIALOG, "const undoRegeneration = async (lang: string)");
  assertContains(DIALOG, "Undo — put back what was here before");
  assertContains(
    DIALOG,
    "disabled={loading || regeneratingLang !== null}",
    "closing mid-write would leave the row changed with the undo offer gone"
  );
});

test("generated text names the languages actually being published", () => {
  assertContains(DIALOG, "const candidateLanguages =");
  assertContains(DIALOG, "selectedLangsForPublish.length > 0");
  assertContains(
    DIALOG,
    "candidateLanguages,",
    "'choose your language' while publishing one language describes a chooser the candidate never sees"
  );
});

test("the editor treats a placeholder field as unwritten, not as text", () => {
  assertContains(EDITOR, "hasMeaningfulText(examSpecificInstructionTrans[activeLanguage]");
  assertContains(EDITOR, "const paperHasContent = sections.length > 0;");
});

test("the dialog asks 'no instruction anywhere', not per language", () => {
  assertContains(
    DIALOG,
    "const anyMeaningful = Object.values(trans).some((t) => hasMeaningfulText(t));",
    "the intro falls back to another language's text, so a missing variant is not a paper with no instructions"
  );
});

test("a language with no text or no sections of its own is not audited", () => {
  assertContains(
    DIALOG,
    "if (!hasMeaningfulText(text) || langSections.length === 0) continue;",
    "auditing an untranslated language runs the English text against the English sections and prints the same warning twice"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
}
console.log("─".repeat(60) + "\n");
process.exit(failed > 0 ? 1 : 0);
