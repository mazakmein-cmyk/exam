/**
 * A CORRECTED ANSWER KEY MUST REACH EVERY LANGUAGE
 *
 * Run with: node src/__tests__/answer-key-follows-translations.test.mjs
 *
 * WHAT WAS BROKEN
 * Both exam types store the correct answer per LANGUAGE ROW, and both graders
 * mark a student against the row they actually answered:
 *
 *   * live  — submit_live_response looks the question up by the id submitted and
 *             grades `v_question.correct_answer`; it never resolves back to the
 *             primary language.
 *   * mock  — compute_attempt_marks reads `correct_answer` off the answered row;
 *             it resolves question_group_id only to find the MARKS CONFIG.
 *
 * So fixing a wrong key in English left every Hindi student graded against the
 * old one — right answer, marked wrong, on the leaderboard and in the report,
 * with nothing on any screen hinting that the two languages disagreed. And it
 * could not be fixed from the translated view, because the editor locks the
 * answer fields there (correctly — the primary language owns the key). Only
 * re-importing the whole question set pushed it through.
 *
 * Live had NO path that propagated. Mock had three edit paths and only one
 * propagated, which is worse in a way: whether a fix reached the translations
 * depended on which control the creator happened to click.
 *
 * WHY THE DIRECTION MATTERS
 * The copy only runs when the PRIMARY language is being edited. Both edit forms
 * load whichever row they opened, so saving a translation would push that row's
 * key — quite possibly the stale one — back over the primary, which is the same
 * bug pointing the other way.
 *
 * WHY CHOICE QUESTIONS ONLY
 * A choice key is option INDICES, identical in every language. A text or numeric
 * answer can legitimately differ per language, so copying one across would
 * overwrite a real translation with a value nobody wrote.
 *
 * Source-text assertions: these are React handlers with no seam to call.
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

const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
/** Comments explain the fix; only executable text proves it shipped. */
const stripComments = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const LIVE = read("src/pages/LiveExamDetail.tsx");
const LIVE_CODE = stripComments(LIVE);
const MOCK = read("src/pages/ExamDetail.tsx");
const MOCK_CODE = stripComments(MOCK);
const SERVICE = read("src/services/liveExamService.ts");
const SERVICE_CODE = stripComments(SERVICE);

/** The full-question editor block, isolated from the quick inline control. */
const MOCK_EDITOR = MOCK_CODE.slice(
  MOCK_CODE.indexOf("const siblingUpdate"),
  MOCK_CODE.indexOf("const siblingUpdate") + 1400
);

console.log("\n══ A corrected answer key reaches every language ══");

// ─── [1] Live ───────────────────────────────────────────────────────────────
console.log("\n[1] Live exams: the editor now fans out like delete already did");

test("there is a single, named way to copy the key across languages", () => {
  assert(
    /export async function syncLiveAnswerToTranslations/.test(SERVICE_CODE),
    "the live editor had no propagation at all; delete fanned out across the question group and update did not"
  );
});

test("it writes correct_answer and nothing else", () => {
  const fn = SERVICE_CODE.slice(
    SERVICE_CODE.indexOf("export async function syncLiveAnswerToTranslations"),
    SERVICE_CODE.indexOf("export async function deleteLiveQuestion")
  );
  assert(
    /\.update\(\{ correct_answer: correctAnswer \}\)/.test(fn),
    "widening this to other fields would push the primary language's TEXT over every translation"
  );
  assert(
    /\.eq\("question_group_id", questionGroupId\)/.test(fn),
    "the question group is what links a question to its translations"
  );
  assert(
    /\.neq\("id", excludeQuestionId\)/.test(fn),
    "the edited row is already saved; rewriting it is a wasted round trip"
  );
});

test("it is scoped to the sibling sections, not to the group id alone", () => {
  const fn = SERVICE_CODE.slice(
    SERVICE_CODE.indexOf("export async function syncLiveAnswerToTranslations"),
    SERVICE_CODE.indexOf("export async function deleteLiveQuestion")
  );
  assert(
    /\.in\("live_section_id", siblingSectionIds\)/.test(fn),
    "a stray write to another exam's answer key is not a failure worth risking to save a clause"
  );
  assert(
    /siblingSectionIds\.length === 0\) return/.test(fn),
    "a single-language exam has no siblings and must not issue a bare group-wide update"
  );
});

test("the editor calls it, gated to the primary language", () => {
  assert(
    /syncLiveAnswerToTranslations\(/.test(LIVE_CODE),
    "the service function is dead code unless the editor calls it"
  );
  assert(
    /editingPrimary = !multiLang \|\| activeLanguage === \(exam\?\.primary_language/.test(LIVE_CODE),
    "the edit form loads whichever row it opened, so saving a translation would push that row's key back over the primary"
  );
  assert(
    /if \(isChoice && editingPrimary && answerGroupId/.test(LIVE_CODE),
    "choice questions only: a text or numeric answer can legitimately differ per language"
  );
});

test("a half-applied change is reported, not swallowed", () => {
  assert(
    /Answer saved, but not copied to the other languages/.test(LIVE),
    "the edited row is already saved by then, so silence here recreates exactly the split this code prevents"
  );
});

// ─── [2] Mock ───────────────────────────────────────────────────────────────
console.log("\n[2] Mock exams: the full editor catches up with the quick control");

test("the full editor mirrors the answer key, not just the option images", () => {
  assert(
    /siblingUpdate\.correct_answer = updateData\.correct_answer/.test(MOCK_EDITOR),
    "this editor already mirrored option_image_urls and stopped there, so a key fixed here never reached the translations"
  );
  assert(
    /siblingUpdate\.option_image_urls = updateData\.option_image_urls/.test(MOCK_EDITOR),
    "the existing image mirroring must survive"
  );
});

test("both fields ride one write", () => {
  const writes = MOCK_EDITOR.match(/\.from\("parsed_questions"\)/g) || [];
  assert(
    writes.length === 1,
    `the sibling update should be a single request, found ${writes.length}`
  );
});

test("an answer-only edit still propagates", () => {
  // The old guard required option_image_urls to be present, so changing only the
  // answer skipped the whole block.
  assert(
    !/hasOwnProperty\.call\(updateData, "option_image_urls"\)\s*\)\s*\{\s*await supabase/.test(MOCK_EDITOR),
    "option_image_urls must not gate the block any more, or an answer-only fix is still dropped"
  );
  assert(
    /Object\.keys\(siblingUpdate\)\.length > 0/.test(MOCK_EDITOR),
    "the write should happen when there is anything to write, whichever field it is"
  );
});

test("still primary-only, still choice-only", () => {
  const guard = MOCK_CODE.slice(
    MOCK_CODE.indexOf("(!isMultiLang || isPrimaryLanguage) &&", MOCK_CODE.indexOf("siblingUpdate") - 700),
    MOCK_CODE.indexOf("const siblingUpdate")
  );
  assert(
    /isPrimaryLanguage/.test(guard),
    "this is also the only branch that puts correct_answer into updateData, so the two must agree"
  );
  assert(
    /newQuestionType === "single" \|\| newQuestionType === "multi"/.test(guard),
    "index-based keys only"
  );
});

test("a half-applied change is reported here too", () => {
  assert(
    /Saved, but not copied to the other languages/.test(MOCK),
    "the edited row is already saved; a silent failure leaves the languages disagreeing"
  );
});

// ─── [3] The rule both sides now share ──────────────────────────────────────
console.log("\n[3] The invariant");

test("neither side copies a key while a translation is being edited", () => {
  for (const [name, code] of [["live", LIVE_CODE], ["mock", MOCK_CODE]]) {
    assert(
      /isPrimaryLanguage|editingPrimary/.test(code),
      `${name}: propagation must be one-directional, primary → translations`
    );
  }
});

test("the quick inline control on the mock page still works as before", () => {
  // It was the ONE path that already did the right thing; this change must not
  // have disturbed it.
  assert(
    /Multi-language sync: correct answer is index-based and shared across languages/.test(MOCK),
    "the pre-existing inline propagation must survive untouched"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  Fix the answer once, and every language has it.\n");
