/**
 * SNIP & ATTACH ANSWER — THE DIALOG MUST STAY PLUGGED IN
 *
 * Run with: node src/__tests__/snip-attach-answer.test.mjs
 *
 * SnipOptionDialog.tsx shipped complete — preview, per-option rows, "New option
 * with this image" — and then sat in the tree for a whole release importing
 * nothing and imported by nobody. Its own doc comment described a "Snip & Attach
 * Option" button that did not exist. Option images were reachable only through
 * the file picker; there was no path from a PDF crop to an answer choice.
 *
 * Nothing about that failure was visible: the file compiled, the page rendered,
 * and `newQuestionOptionImages` was initialised to four nulls and never written
 * by the snipper. A dead component and a live one look identical from inside the
 * editor. So these assertions check the wiring itself — the prop, the button,
 * the dialog mount, and the two handlers behind it — in both editors that host
 * a snipper.
 *
 * The upload-before-append ordering is asserted too. Appending the row first and
 * uploading second leaves a stray blank option behind whenever storage errors,
 * and a blank option is kept by the save filter only when it carries an image —
 * so the failure would surface later, as a question with a phantom choice.
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

const SNIPPER = readSrc("components/PdfSnipper.tsx");
const DIALOG = readSrc("components/SnipOptionDialog.tsx");
const MOCK = readSrc("pages/ExamDetail.tsx");
const LIVE = readSrc("pages/LiveExamDetail.tsx");

const EDITORS = [
  { name: "ExamDetail", src: MOCK },
  { name: "LiveExamDetail", src: LIVE },
];

console.log("\n══ Snip & Attach Answer ══");

// ─── [1] The button ─────────────────────────────────────────────────────────
console.log("\n[1] PdfSnipper offers the third destination");

test("onSnipOption is an optional prop, not a required one", () => {
  assert(
    /onSnipOption\?: \(blob: Blob\) => void/.test(SNIPPER),
    "the prop must stay optional — ManualFixEditor and JsonUploadDialog snip into a single image and have no options to pick from"
  );
  assert(
    /function PdfSnipper\(\{[^}]*onSnipOption[^}]*\}/s.test(SNIPPER),
    "declaring the prop without destructuring it is the same as not having it"
  );
});

test("the button is rendered only when a handler was supplied", () => {
  assert(
    /\{onSnipOption && \(\s*<Button/.test(SNIPPER),
    "an always-rendered button would fire undefined for numeric and text questions"
  );
  assert(
    /Snip & Attach Answer/.test(SNIPPER),
    "the label the creator looks for"
  );
});

test("it goes through processSnip like the other two", () => {
  assert(
    /const handleSnipOption = \(\) => onSnipOption && processSnip\(onSnipOption\)/.test(SNIPPER),
    "reusing processSnip is what gives the option crop the same canvas scaling and crop-clearing as the question crop"
  );
});

test("it is disabled until a region is actually selected", () => {
  const optionButton = SNIPPER.slice(SNIPPER.indexOf("{onSnipOption && ("));
  assert(
    /disabled=\{!completedCrop\?\.width \|\| !completedCrop\?\.height\}/.test(optionButton),
    "without the guard, clicking with no selection silently uploads nothing and reports success"
  );
});

test("three buttons wrap instead of overflowing the toolbar", () => {
  assert(
    /flex flex-wrap items-center justify-between/.test(SNIPPER),
    "passage + question + answer will not fit one row in the 600px snipper frame at narrow widths"
  );
});

// ─── [2] The dialog is mounted ──────────────────────────────────────────────
console.log("\n[2] Both editors mount SnipOptionDialog");

for (const { name, src } of EDITORS) {
  test(`${name} imports the dialog`, () => {
    assert(
      /import SnipOptionDialog from "@\/components\/SnipOptionDialog"/.test(src),
      "the import is the thing that was missing for an entire release"
    );
  });

  test(`${name} renders it with every prop it needs`, () => {
    const mount = src.match(/<SnipOptionDialog[\s\S]*?\/>/);
    assert(mount, "the import alone changes nothing — the element has to be in the tree");
    const el = mount[0];
    for (const prop of ["blob", "options", "optionImages", "onAttach", "onAttachToNew", "onCancel"]) {
      assert(new RegExp(`${prop}=`).test(el), `${prop} is required by SnipOptionDialogProps`);
    }
    assert(
      /busy=\{optionImageBusy\}/.test(el),
      "sharing the busy flag with the file-picker path is what stops two uploads racing onto the same row"
    );
  });

  test(`${name} passes the crop through to the snipper`, () => {
    assert(
      /onSnipOption=\{[\s\S]{0,240}setPendingOptionSnip/.test(src),
      "the button has to hand its blob to the state the dialog opens on"
    );
  });

  test(`${name} hides the button when there are no options to attach to`, () => {
    assert(
      /\(newQuestionType === "single" \|\| newQuestionType === "multi"\) &&/.test(src),
      "numeric and text questions have no option rows; the dialog would open on an empty list"
    );
    assert(
      /!\(isMultiLang && !isPrimaryLanguage && !!editingQuestionId\)/.test(src),
      "secondary-language edits lock question structure — the same gate QuestionForm uses for its own option controls"
    );
  });
}

// ─── [3] The handlers ───────────────────────────────────────────────────────
console.log("\n[3] Attaching keeps the two arrays aligned");

for (const { name, src } of EDITORS) {
  test(`${name} pads optionImages before writing the chosen index`, () => {
    const handler = src.match(/const handleAttachSnipToOption = async[\s\S]*?\n  \};/);
    assert(handler, "handleAttachSnipToOption must exist");
    assert(
      /while \(next\.length <= idx\) next\.push\(null\)/.test(handler[0]),
      "optionImages starts four long; attaching to a later row must extend it rather than write past the end"
    );
    assert(
      /setPendingOptionSnip\(null\)/.test(handler[0]),
      "the dialog is open while blob is non-null — not clearing it leaves the modal stuck open over a finished upload"
    );
  });

  test(`${name} uploads before it appends the new option row`, () => {
    const handler = src.match(/const handleAttachSnipToNewOption = async[\s\S]*?\n  \};/);
    assert(handler, "handleAttachSnipToNewOption must exist — it is the 'New option with this image' path");
    const body = handler[0];
    const upload = body.indexOf("await uploadOptionSnip");
    const append = body.indexOf("setNewQuestionOptions((prev) => [...prev, \"\"])");
    assert(upload > -1 && append > -1, "both steps must be present");
    assert(
      upload < append,
      "appending first strands a blank option row whenever the upload throws"
    );
    assert(
      /if \(!publicUrl\) return/.test(body),
      "a null URL means no user or no section — appending a row for it creates an empty choice"
    );
  });

  test(`${name} appends to both arrays at the same index`, () => {
    const handler = src.match(/const handleAttachSnipToNewOption = async[\s\S]*?\n  \};/)[0];
    assert(
      /const idx = newQuestionOptions\.length/.test(handler),
      "the new row's index has to come from the options array, which is the one the save filter iterates"
    );
    assert(
      /setNewQuestionOptions\(/.test(handler) && /setNewQuestionOptionImages\(/.test(handler),
      "writing only the image array leaves an image with no row to render it; writing only the row leaves an empty option the save filter drops"
    );
  });

  test(`${name} releases the busy flag on the failure path too`, () => {
    for (const fn of ["handleAttachSnipToOption", "handleAttachSnipToNewOption"]) {
      const handler = src.match(new RegExp(`const ${fn} = async[\\s\\S]*?\\n  \\};`))[0];
      assert(
        /\} finally \{\s*setOptionImageBusy\(false\);/.test(handler),
        `${fn} must clear the flag in finally — one failed upload would otherwise freeze every option control on the page`
      );
    }
  });
}

// ─── [4] The dialog's own contract ──────────────────────────────────────────
console.log("\n[4] The dialog still does what the wiring assumes");

test("an image-only option is labelled, not shown as empty", () => {
  assert(
    /\(image option\)/.test(DIALOG),
    "a row snipped from a PDF has no text; calling it 'Empty option' tells the creator the attach failed"
  );
});

test("attaching over an existing image warns first", () => {
  assert(
    /replaces/.test(DIALOG),
    "the attach is destructive for a row that already has an image and the dialog is the last chance to say so"
  );
});

test("the preview URL is revoked when the blob changes", () => {
  assert(
    /return \(\) => URL\.revokeObjectURL\(url\)/.test(DIALOG),
    "one leaked object URL per snip, in a flow built for snipping every question on a page"
  );
});

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\n🎉 A crop can reach an answer choice in both editors.");
