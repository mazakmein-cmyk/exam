/**
 * SAVE KEEPS THE WORK — PUBLISH ENFORCES THE RULES
 *
 * Run with: node src/__tests__/save-incomplete-question-draft.test.mjs
 *
 * The question editor used to apply publish-grade rules at save time. Type a
 * question, forget the answer key, hit back, choose "Save & Leave" — and the
 * save refused. Worse, for a question that had never been added yet,
 * handleSaveExam did not so much as look at the editor: it only re-saved a row
 * that was already being EDITED. So the dialog reported nothing, navigation
 * proceeded, and the typed question was gone. The one action whose entire
 * purpose was "don't lose my work" was the action that lost it.
 *
 * The split these assertions pin:
 *
 *   save    — persist whatever is in the editor. A question earns a row the
 *             moment it has text, an image, a passage or a single option.
 *             No answer key required. No second option required.
 *   publish — where completeness is actually demanded, because that is the
 *             moment an incomplete paper starts costing candidates marks.
 *
 * A save that silently drops work is unrecoverable; a publish that is blocked
 * is a message on screen with a "Go fix →" button next to it. The rules belong
 * at the recoverable end.
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

const DETAIL = readSrc("pages/ExamDetail.tsx");
const DIALOG = readSrc("components/PublishExamDialog.tsx");

/** Body of a named `const fn = async (...) => { ... }`, up to the next top-level const fn. */
function fnBody(src, name) {
  const start = src.indexOf(`const ${name} = async (`);
  assert(start !== -1, `${name} not found — it was renamed or removed`);
  const rest = src.slice(start + 10);
  const nextDecl = rest.search(/\n  const \w+ = (async )?\(/);
  return rest.slice(0, nextDecl === -1 ? rest.length : nextDecl);
}

console.log("\n══ Save keeps incomplete questions; publish blocks them ══");

// ─── [1] The bug that lost the work ─────────────────────────────────────────
console.log("\n[1] Save & Leave commits the question that was never added");

test("handleSaveExam saves a brand-new draft, not only an edit-in-progress", () => {
  const body = fnBody(DETAIL, "handleSaveExam");
  assert(
    /await handleUpdateQuestion\(\{ draft: true \}\)/.test(body),
    "editing an existing question must save it as a draft"
  );
  assert(
    /await handleAddQuestion\(\{ draft: true \}\)/.test(body),
    "THIS is the data loss: with no editingQuestionId, the typed question was never inserted and vanished on navigate"
  );
  assert(
    /hasSavableQuestionDraft\(\)/.test(body),
    "the insert must be conditional on there being content — otherwise every Save creates an empty row"
  );
});

test("Save & Leave in the blocked-navigation dialog routes through handleSaveExam", () => {
  assert(
    /const success = await handleSaveExam\(\);\s*if \(success\) \{\s*blocker\.proceed/.test(DETAIL),
    "if Save & Leave stops calling handleSaveExam it stops saving the draft question with it"
  );
});

test("switching sections saves the draft too", () => {
  const body = fnBody(DETAIL, "handleSaveAndSwitchSection");
  assert(
    /handleUpdateQuestion\(\{ draft: true \}\)/.test(body) &&
      /handleAddQuestion\(\{ draft: true \}\)/.test(body),
    "the section-switch dialog offers the same 'Save & Leave' promise and must keep it"
  );
  assert(
    /success = true;/.test(body),
    "with nothing typed there is no question to save; treating that as failure would strand the user on the section"
  );
});

// ─── [2] What a draft save is allowed to be missing ─────────────────────────
console.log("\n[2] A draft may be missing the answer and the options");

for (const fn of ["handleAddQuestion", "handleUpdateQuestion"]) {
  test(`${fn} takes an explicit draft flag`, () => {
    assert(
      new RegExp(`const ${fn} = async \\(opts\\?: \\{ draft\\?: boolean \\}\\)`).test(DETAIL),
      "the leniency has to be opt-in per call site, not a global mode"
    );
  });

  test(`${fn} skips the answer-key requirement on a draft`, () => {
    const body = fnBody(DETAIL, fn);
    assert(
      /if \(!hasCorrectAnswer && !draft\)/.test(body),
      "the missing answer key is the exact reason people lost questions; publish reports it instead"
    );
  });

  test(`${fn} skips the two-option requirement on a draft`, () => {
    const body = fnBody(DETAIL, fn);
    assert(
      /if \(keptOptionIdx\.length < 2 && !draft\)/.test(body),
      "half-entered options are normal mid-edit and must not cost the author the whole question"
    );
  });

  test(`${fn} never stores an answer pointing at a dropped option`, () => {
    const body = fnBody(DETAIL, fn);
    assert(
      /isDangling/.test(body),
      "blank option rows are filtered out before insert, which shifts every later index"
    );
    assert(
      /\.filter\(\(v\) => !isDangling\(v\)\)\.map\(remapCorrect\)/.test(body) &&
        /isDangling\(newQuestionCorrect\) \? "" : remapCorrect\(newQuestionCorrect\)/.test(body),
      "a stale index grades every candidate wrong in silence; an empty key is what the publish gate can see and report"
    );
  });
}

test("a draft with only options typed is still worth a row", () => {
  const body = fnBody(DETAIL, "handleAddQuestion");
  assert(
    /const hasAnyOption = newQuestionOptions\.some\(/.test(body),
    "the user's rule: either the question or an option is enough to create the question"
  );
  assert(
    /!\(draft && hasDraftContent\)/.test(body),
    "without this the content gate still rejects an options-only draft and the work is lost again"
  );
  assert(
    /!isRichTextEmpty\(opt\) \|\| !!newQuestionOptionImages\[i\]/.test(body),
    "an option that is nothing but a snipped figure is filled — image-only options are the point of figure questions"
  );
});

test("hasSavableQuestionDraft counts every kind of content the editor holds", () => {
  const start = DETAIL.indexOf("const hasSavableQuestionDraft");
  assert(start !== -1, "helper not found");
  const body = DETAIL.slice(start, start + 900);
  for (const [needle, why] of [
    ["newQuestionImages", "an image-only question has no text to detect it by"],
    ["newQuestionOptionImages.some(Boolean)", "a snipped option image is unsaved work"],
    ["passageImage", "a passage-format draft can be entirely a picture"],
  ]) {
    assert(body.includes(needle), `${needle} missing — ${why}`);
  }
});

test("an option image alone marks the page dirty", () => {
  assert(
    /newQuestionOptionImages\.some\(Boolean\)/.test(fnBody(DETAIL, "handleSaveExam")) ||
      /isQuestionFormDirty[\s\S]{0,300}newQuestionOptionImages\.some\(Boolean\)/.test(DETAIL),
    "without it, an image-only option leaves isDirty false, no dialog appears at all, and the picture goes"
  );
  assert(
    /newQuestionOptions, newQuestionOptionImages, newQuestionImages/.test(DETAIL),
    "the dirty-check effect must depend on option images or it never re-runs when one is attached"
  );
});

// ─── [3] The explicit buttons stay strict ───────────────────────────────────
console.log("\n[3] Add / Update still tell the author what is missing");

test("the Add and Update buttons pass no draft flag", () => {
  assert(
    /onClick=\{\(\) => handleUpdateQuestion\(\)\}/.test(DETAIL),
    "clicking Update while looking at the question is the right moment to be told the answer is missing"
  );
  assert(
    /onAdd=\{\(\) => \(editingQuestionId \? handleUpdateQuestion\(\) : handleAddQuestion\(\)\)\}/.test(DETAIL),
    "passing the handler by reference would hand React's click event in as `opts` — harmless today, a silent draft-mode switch the day the shape changes"
  );
});

// ─── [4] Publish is where completeness is demanded ──────────────────────────
console.log("\n[4] Nothing saved leniently can publish leniently");

test("a missing answer key still blocks publish", () => {
  assert(
    /langErrors\.push\(\{\s*type: "missing_answer"/.test(DIALOG),
    "this is the whole trade: save is lenient BECAUSE publish is not"
  );
});

test("options are counted by content, not by slot", () => {
  assert(
    /function filledOptionCount\(q: any\): number/.test(DIALOG),
    "options.length counts blank slots, and blank slots render as unlabelled buttons no candidate can choose"
  );
  assert(
    /if \(filledOptionCount\(q\) < 2\) return true;/.test(DIALOG),
    "the invalid_question gate must use the content count, or a row of empty strings publishes as a valid question"
  );
  assert(
    !/Array\.isArray\(q\.options\) && q\.options\.length >= 2/.test(DIALOG),
    "the old slot-count check would let a translated row of empty options through"
  );
});

test("figure options are not miscounted as blank", () => {
  assert(
    /return text !== "" \|\| !!imgs\[i\]/.test(DIALOG),
    "an image-only option has no text; counting text alone would make every figure paper unpublishable"
  );
});

test("the option_image_urls column is probed before it is selected", () => {
  assert(
    /tableHasColumn\("parsed_questions", "option_image_urls"\)/.test(DIALOG),
    "that migration is applied by hand, so the column may not exist yet"
  );
  assert(
    /supportsOptionImages \? ", option_image_urls" : ""/.test(DIALOG),
    "naming an absent column fails the entire query — validation would throw and publishing would be blocked for everyone"
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
