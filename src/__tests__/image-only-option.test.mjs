/**
 * AN OPTION IS FILLED BY TEXT *OR* BY AN IMAGE — NEVER BY TEXT ALONE
 *
 * Run with: node src/__tests__/image-only-option.test.mjs
 *
 * A figure paper's answer choices are pictures. The creator snips four crops
 * out of the PDF, attaches one to each option, types nothing — and the editor
 * called every one of them blank. The question wore a permanent red "issues"
 * badge reading "Only 0 options filled", the correct-answer picker greyed the
 * rows out so no key could be set, and the multi-select panel said "Add options
 * above" underneath four options that were plainly there.
 *
 * The save path and the publish gate had already been taught the OR rule. The
 * three surfaces that TELL the creator what is wrong had not, so the paper was
 * saveable and publishable while every screen insisted it was broken. That is
 * the worst shape for this bug: nothing is lost, but nothing looks right.
 *
 * The rule is one line — text OR image, either alone is enough, both together
 * is the ordinary labelled-diagram case — so it lives in exactly one place now
 * (`isOptionFilled` / `countFilledOptions` in lib/richText). These assertions
 * cover the helper's behaviour directly and then check that each gate calls it
 * with the image array actually in hand. A gate that forgets the second
 * argument silently reverts to text-only counting, which is the original bug
 * wearing the new helper's name.
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

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

const RICHTEXT = readSrc("lib/richText.ts");
const MOCK = readSrc("pages/ExamDetail.tsx");
const LIVE = readSrc("pages/LiveExamDetail.tsx");
const FORM = readSrc("components/QuestionForm.tsx");
const PUBLISH = readSrc("components/PublishExamDialog.tsx");

const IMG = "https://example.test/option-a.png";

console.log("\n══ Image-only options are not blank options ══");

// ─── [1] The helper itself ──────────────────────────────────────────────────
console.log("\n[1] isOptionFilled / countFilledOptions behave");

// Load the two helpers out of the real source rather than restating them here:
// a copy of the rule in the test is a copy that can agree with itself while
// disagreeing with the app. isRichTextEmpty is stubbed to its own contract.
function loadHelpers() {
  // One function at a time: slicing to end-of-file would drag in the rest of
  // the module, which is TypeScript that `new Function` cannot parse.
  const extract = (name) => {
    const start = RICHTEXT.indexOf(`export function ${name}`);
    assert(start !== -1, `${name} is missing from lib/richText.ts`);
    const end = RICHTEXT.indexOf("\n}", start);
    assert(end !== -1, `${name} has no closing brace at column 0`);
    return RICHTEXT.slice(start, end + 2);
  };

  const src = [extract("isOptionFilled"), extract("countFilledOptions")]
    .join("\n")
    .replace(/\bexport /g, "")
    .replace(/\?:\s*unknown/g, "")
    .replace(/:\s*unknown/g, "")
    .replace(/\)\s*:\s*(boolean|number|string)\s*\{/g, ") {");

  const stubIsRichTextEmpty = (v) => {
    if (v === null || v === undefined) return true;
    const s = String(v);
    if (s.trim() === "") return true;
    if (/<(img|hr|table|iframe|video|svg)\b/i.test(s)) return false;
    return s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
  };

  // eslint-disable-next-line no-new-func
  const factory = new Function(
    "isRichTextEmpty",
    `${src}\nreturn { isOptionFilled, countFilledOptions };`
  );
  return factory(stubIsRichTextEmpty);
}

const { isOptionFilled, countFilledOptions } = loadHelpers();

test("an image with no text is a filled option", () => {
  assertEq(isOptionFilled("", IMG), true, "the snipped-crop case this whole fix exists for");
  assertEq(
    isOptionFilled("<p><br></p>", IMG),
    true,
    "a rich-text box the creator clicked into and left keeps <br> scaffolding — still no text, still an image"
  );
  assertEq(
    isOptionFilled("&nbsp;", IMG),
    true,
    "&nbsp; is not text a candidate reads, but the image beside it is content"
  );
});

test("text with no image is a filled option", () => {
  assertEq(isOptionFilled("<p>Rome</p>", null), true, "the ordinary text option must not regress");
  assertEq(isOptionFilled("<p>Rome</p>", undefined), true, "an absent image array yields undefined, not null");
});

test("text and image together is a filled option", () => {
  assertEq(isOptionFilled("<p>Fig. 2</p>", IMG), true, "the labelled-diagram case — OR, not XOR");
});

test("neither text nor image is the only blank option", () => {
  assertEq(isOptionFilled("", null), false, "a truly empty row still has to be catchable");
  assertEq(isOptionFilled("<p><br></p>", null), false, "cleared scaffolding is empty");
  assertEq(isOptionFilled(null, undefined), false, "a null slot from a translated row is empty");
});

test("countFilledOptions pairs each option with the image at its own index", () => {
  assertEq(
    countFilledOptions(["", "", "", ""], [IMG, IMG, null, null]),
    2,
    "four blank strings, two images — two real choices"
  );
  assertEq(
    countFilledOptions(["", "<p>B</p>", "", ""], [IMG, null, null, null]),
    2,
    "A is an image, B is text; mixing the two kinds in one question is normal"
  );
  assertEq(
    countFilledOptions(["", "", "<p>C</p>"], [null, IMG]),
    2,
    "a short image array must not shift the pairing — index 2 has no image entry and still counts on its text"
  );
});

test("counting survives a database that has not run the option-image migration", () => {
  assertEq(
    countFilledOptions(["<p>A</p>", "<p>B</p>"], undefined),
    2,
    "option_image_urls is applied by hand; an unmigrated row supplies no array at all"
  );
  assertEq(countFilledOptions(["", ""], undefined), 0, "and text-only counting still applies there");
  assertEq(countFilledOptions(null, null), 0, "a question with no options array is not a crash");
});

test("a full four-image figure question clears the two-option publish minimum", () => {
  const q = { options: ["", "", "", ""], option_image_urls: [IMG, IMG, IMG, IMG] };
  assert(
    countFilledOptions(q.options, q.option_image_urls) >= 2,
    "this is the exact shape that used to be flagged 'Only 0 options filled'"
  );
});

// ─── [2] The error badge on each question row ───────────────────────────────
console.log("\n[2] getQuestionErrors asks the helper, with the images");

const EDITORS = [
  { name: "ExamDetail", src: MOCK },
  { name: "LiveExamDetail", src: LIVE },
];

for (const { name, src } of EDITORS) {
  test(`${name} counts option content, not option text`, () => {
    const start = src.indexOf("const getQuestionErrors");
    assert(start !== -1, "getQuestionErrors moved — this slice found nothing");
    const body = src.slice(start, src.indexOf("\n  };", start));

    assert(
      /countFilledOptions\(\s*q\.options\s*,\s*q\.option_image_urls\s*\)/.test(body),
      "passing only q.options re-creates the bug under a new name — the image array is the second argument"
    );
    assert(
      !/isRichTextEmpty\(o\)/.test(body) && !/isRichTextEmpty\(opt\)/.test(body),
      "any surviving bare text check would keep flagging figure questions"
    );
  });

  test(`${name} imports the shared counter`, () => {
    assert(
      /import \{[^}]*countFilledOptions[^}]*\} from "@\/lib\/richText"/.test(src),
      "a local re-definition is how the two editors drifted apart the first time"
    );
  });
}

// ─── [3] The correct-answer pickers ─────────────────────────────────────────
console.log("\n[3] An image-only option can be marked correct");

test("QuestionForm's single-choice dropdown lists image-only options", () => {
  assert(
    /isOptionFilled\(opt, optionImages\?\.\[idx\]\)\s*&&/.test(FORM),
    "an option missing from the dropdown cannot be chosen as the key at all"
  );
  assert(
    /\(image option\)/.test(FORM),
    "a listed row with no text and no label reads as a rendering fault"
  );
});

test("QuestionForm's multi-choice checkboxes stay enabled for image-only options", () => {
  assert(
    /const isEmpty = !isOptionFilled\(opt, hasImage\)/.test(FORM),
    "isEmpty drives both `disabled` and the 40% opacity — computing it from text alone locks the creator out of their own answer key"
  );
});

test("QuestionForm's empty-state counts content, not text", () => {
  assert(
    /countFilledOptions\(options, optionImages\) === 0 &&/.test(FORM),
    '"Add options above to select correct answers" printed underneath four image options is the editor calling the creator wrong'
  );
  assert(
    !/options\.every\(opt => isRichTextEmpty\(opt\)\)/.test(FORM),
    "the old text-only empty-state must be gone, not merely bypassed"
  );
});

test("ExamDetail's inline answer editor agrees with the form", () => {
  assert(
    /return isOptionFilled\(opt, hasImage\) \? \(/.test(MOCK),
    "the inline Select is a second, separate answer picker — it needs the same rule"
  );
  assert(
    /const isEmpty = !isOptionFilled\(opt, hasImage\)/.test(MOCK),
    "the inline multi-checkbox list disables on isEmpty exactly like QuestionForm does"
  );
  assert(
    /countFilledOptions\(q\.options, q\.option_image_urls\) === 0 &&/.test(MOCK),
    '"No options available." next to four visible images is the same lie in a different font'
  );
  assert(
    !/\.every\(\(opt: string\) => isRichTextEmpty\(opt\)\)/.test(MOCK),
    "the old text-only check must be gone"
  );
});

// ─── [4] Publish stays image-aware too ──────────────────────────────────────
console.log("\n[4] The publish gate has not drifted back");

test("PublishExamDialog still counts an image as content", () => {
  assert(
    /return text !== "" \|\| !!imgs\[i\]/.test(PUBLISH),
    "publish is the last gate; text-only counting here makes every figure paper unpublishable"
  );
});

test("no gate anywhere judges an option by text alone", () => {
  // The shape that caused this bug, in every file that owns an option gate:
  // running the options array through isRichTextEmpty with no image lookup.
  //
  // Judged per STATEMENT, not per line. `options.some(hasText) ||
  // optionImages.some(Boolean)` puts the two halves of the rule on separate
  // lines and is entirely correct; the bug was a statement that never mentions
  // images at all.
  const RE =
    /\b(?:opts|options|q\.options|newQuestionOptions)\b[^\n]*\.(?:filter|every|some)\([^\n]*isRichTextEmpty/g;

  for (const [name, src] of [
    ["ExamDetail", MOCK],
    ["LiveExamDetail", LIVE],
    ["QuestionForm", FORM],
  ]) {
    const bare = [];
    for (const m of src.matchAll(RE)) {
      const semi = src.indexOf(";", m.index);
      const statement = src.slice(m.index, semi === -1 ? m.index + 200 : semi);
      if (!/[Ii]mage|imgs\[/.test(statement)) bare.push(m[0].trim());
    }
    assert(
      bare.length === 0,
      `${name} still judges options on text alone: ${bare.join(" | ")}`
    );
  }
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\n🎉 A picture is an answer choice.\n");
