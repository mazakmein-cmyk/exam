/**
 * GENERAL INSTRUCTION — "USE TEMPLATE"
 *
 * Run with: node src/__tests__/instruction-template.test.mjs
 *
 * A one-click fill for a required field the creator then edits by hand. The
 * behaviour is small; the ways it turns into a data-loss bug are not, and none
 * of them throw:
 *
 *  • Replacing text without a way back. The field is required and creators do
 *    type into it. If the button overwrites what they wrote and the only
 *    recovery is retyping it, the safe move is never to press the button —
 *    which is the whole feature, gone. Hence Undo, and hence a snapshot taken
 *    *before* the fill.
 *  • Undo outliving its meaning. Once the creator edits the filled text, "Undo"
 *    would discard their new words to restore our old ones. Same label, opposite
 *    effect. The offer has to withdraw itself on the first edit.
 *  • Filling the wrong language. The editor writes one translation per tab. A
 *    template with no Hindi copy that fills English text into the Hindi field
 *    fails silently — the exam just ships with English instructions for Hindi
 *    candidates.
 *  • Filling into a box too small to see. Seven lines of template in a two-row
 *    resize-none textarea shows two of them, and nothing says the rest arrived.
 *
 * It also pins the shape of the templates module, because that file is meant to
 * be edited by hand and the components read it without validating.
 *
 * The undo mechanism itself lives in useUndoableFill — shared with the Exam
 * Instruction generator, precisely so the two buttons cannot drift apart — so
 * the sections below that pin it grep the hook, not the button.
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

const ACTION = readSrc("components/exam/InstructionTemplateAction.tsx");
const HOOK = readSrc("components/exam/useUndoableFill.ts");
const TEMPLATES = readSrc("lib/instructionTemplates.ts");
const DETAIL = readSrc("pages/ExamDetail.tsx");
const DIALOG = readSrc("components/CreateExamDialog.tsx");

console.log("\n══ General Instruction — use template ══");

// ─── [1] Not a toggle ───────────────────────────────────────────────────────
console.log("\n[1] A one-shot action, not a switch");

test("the control is a button, never a Switch", () => {
  assert(
    !/ui\/switch|<Switch/.test(ACTION),
    "a switch promises a lasting binding to the template; the text is editable straight after filling, so ON would be a lie one keystroke later — and OFF has no honest meaning on a required field"
  );
  assert(/<button\s/.test(ACTION), "the fill has to be a plain action");
});

test("every button is type=button", () => {
  const buttons = ACTION.match(/<button\b[^>]*>/gs) || [];
  assert(buttons.length > 0, "no buttons found — this file moved");
  for (const b of buttons) {
    assert(
      /type="button"/.test(b),
      `a button without type=button submits the form it sits in:\n${b}`
    );
  }
});

test("the applied state is not a disabled button", () => {
  // A disabled button reads as "this action exists but is unavailable now".
  // There is no action: the field already holds the template.
  const applied = ACTION.slice(ACTION.indexOf("matchesTemplate(available"));
  assert(
    /Template applied/.test(applied) && !/<button[^>]*disabled/.test(applied),
    "the already-applied state should be text, not a pressable-looking dead button"
  );
});

// ─── [2] Replace is reversible ──────────────────────────────────────────────
console.log("\n[2] Replacing existing text can be undone");

test("the snapshot is taken before the fill, at write time, from the live value", () => {
  const fill = HOOK.slice(HOOK.indexOf("const fill ="), HOOK.indexOf("const undo ="));
  assert(fill.length > 0, "fill() moved — this slice found nothing");
  assert(
    fill.indexOf("setPrevious(valueRef.current)") < fill.indexOf("onFill(text)"),
    "snapshotting after the write stores the new text as the restore point, so Undo does nothing"
  );
  // The ref, not the closure's prop: a generator awaits the network between
  // click and write, and text typed during that flight belongs in the
  // snapshot — a click-time snapshot would let Undo destroy it.
  assert(
    /const valueRef = useRef\(value\)/.test(HOOK) && /valueRef\.current = value/.test(HOOK),
    "fill must read the field's value as of the latest render, not as of the click"
  );
});

test("undo restores the previous text and clears the offer", () => {
  const undo = HOOK.slice(HOOK.indexOf("const undo ="), HOOK.indexOf("return {"));
  assert(/onFill\(previous \?\? ""\)/.test(undo), "undo must write back what was there");
  assert(/forget\(\)/.test(undo), "a second undo has nothing left to restore");
});

test("the template button runs on the shared hook, not a private copy", () => {
  assert(
    /useUndoableFill\(\{ lang, value, onFill \}\)/.test(ACTION),
    "two copies of a safety mechanism drift, and the drift is invisible until someone loses a paragraph"
  );
  assert(
    !/setPrevious|setFilled/.test(ACTION),
    "snapshot state inside the button means it stopped using the hook's"
  );
});

test("no confirm dialog stands in front of a reversible action", () => {
  assert(
    !/AlertDialog|window\.confirm/.test(ACTION) && !/AlertDialog|window\.confirm/.test(HOOK),
    "a modal for something one click undoes is friction charged to every creator"
  );
});

// ─── [3] The offer withdraws itself ─────────────────────────────────────────
console.log("\n[3] Undo stops being offered before it can destroy work");

test("an edit to the filled text cancels the undo offer", () => {
  assert(
    /if \(filled !== null && value !== filled\) forget\(\)/.test(HOOK),
    "after the creator edits, Undo would throw away their words to restore ours — the same label doing the opposite thing"
  );
});

test("the offer never expires on a timer", () => {
  // The edit-withdrawal rule already guarantees a held offer can only restore
  // into a field still containing exactly the filled text — an old Undo is
  // always correct. A timed fuse buys no safety; what it bought, when this
  // hook had one, was permanent loss: the replaced draft exists nowhere else,
  // and "you can undo" was a lie after twelve quiet seconds.
  assert(
    !/setTimeout|UNDO_MS/.test(HOOK),
    "a timer under the only way back silently destroys the replaced draft"
  );
});

test("switching language tab drops anything held from the old one", () => {
  assert(
    /useEffect\(forget, \[lang\]\)/.test(HOOK),
    "an undo snapshot belongs to one translation; restoring it into another field writes text that was never there"
  );
});

// ─── [4] Language honesty ───────────────────────────────────────────────────
console.log("\n[4] No silent cross-language fill");

test("a language with no copy gets no button", () => {
  assert(
    /if \(available\.length === 0\) return null/.test(ACTION),
    "hiding the button is better than filling English prose into the Hindi field and leaving the creator to spot it"
  );
  assert(
    !/text\[lang\][^\n]*\?\?[^\n]*text\.en|text\.en\s*\|\|/.test(TEMPLATES),
    "an English fallback is exactly the silent wrong-language fill this guards against"
  );
});

test("the fill and the textarea agree on the language", () => {
  // Two copies of the ternary drifting apart would fill one language into a box
  // transliterating another.
  assert(
    /const instructionLang =/.test(DIALOG),
    "the create dialog should derive the language once"
  );
  const field = DIALOG.slice(
    DIALOG.indexOf('htmlFor="general-instruction"'),
    DIALOG.indexOf('htmlFor="exam-instruction"')
  );
  assert(field.length > 0, "the general-instruction field moved — this slice found nothing");
  assert(
    (field.match(/lang=\{instructionLang\}/g) || []).length === 2,
    "both the template button and the textarea must read the same derived language"
  );
  assert(
    /lang=\{activeLanguage\}[\s\S]{0,400}?InstructionTemplateAction|InstructionTemplateAction[\s\S]{0,200}?lang=\{activeLanguage\}/.test(DETAIL),
    "in the editor the button must follow the active language tab"
  );
});

test("the editor fills only the active language's translation", () => {
  const block = DETAIL.slice(DETAIL.indexOf("General Instruction <span"));
  const fill = block.slice(block.indexOf("onFill="), block.indexOf("/>"));
  assert(
    /setGeneralInstructionTrans\(\(prev\) => \(\{ \.\.\.prev, \[activeLanguage\]: text \}\)\)/.test(fill),
    "filling must merge into the translations map, not replace it — writing a bare object drops every other language"
  );
});

// ─── [5] You can see what was filled in ─────────────────────────────────────
console.log("\n[5] The box grows to fit the template");

test("both instruction fields size themselves to their content", () => {
  assert(/export function rowsForText/.test(TEMPLATES), "one definition, shared");
  assert(
    /rows=\{rowsForText\(generalInstruction, 2, 14, 90\)\}/.test(DIALOG),
    "the create dialog's box is resize-none at 2 rows: a seven-line template would show two lines with no way to see the rest"
  );
  assert(
    /rows=\{rowsForText\(generalInstructionTrans\[activeLanguage\] \|\| "", 4, 16, 40\)\}/.test(DETAIL),
    "the editor's box should grow too, from its 4-row resting size"
  );
});

test("rows are counted as the eye counts them — wrapped, not newline-split", () => {
  // A generated marking sentence runs past 200 characters and wraps three or
  // four times; counting newlines sizes the box for a third of the text and
  // hides exactly the machine-written claims that need proofreading.
  assert(
    /Math\.ceil\(line\.length \/ cols\)/.test(TEMPLATES),
    "each logical line contributes its wrapped height, estimated from the caller's column width"
  );
});

test("growth is capped", () => {
  assert(
    /Math\.min\(max/.test(TEMPLATES),
    "an uncapped textarea grows out of proportion to the form around it"
  );
});

// ─── [6] The templates module is hand-edited ────────────────────────────────
console.log("\n[6] The copy lives in one place, safely shaped");

test("the shipped template has English copy and reads as instructions", () => {
  const en = TEMPLATES.slice(TEMPLATES.indexOf("GENERAL_INSTRUCTION_TEMPLATES"));
  assert(/en: \[/.test(en), "there must be English copy or the button never appears");
  assert(/id: "standard"/.test(en) && /label:/.test(en) && /description:/.test(en),
    "each template needs an id, and a label/description for when a second one is added");
});

test("the shipped template carries Hindi copy, written in Hindi", () => {
  const body = TEMPLATES.slice(TEMPLATES.indexOf("GENERAL_INSTRUCTION_TEMPLATES"));
  assert(/hi: \[/.test(body), "without a hi key the button hides on the Hindi tab");
  const hiBlock = body.slice(body.indexOf("hi: ["), body.indexOf("].join", body.indexOf("hi: [")));
  assert(/[ऀ-ॿ]/.test(hiBlock), "the hi copy must actually be Devanagari, not English under a hi key");
  assert(/।/.test(hiBlock), "Hindi sentences end with the danda, not the full stop");
});

test("the template is the full exam-hall sheet, and Hindi promises everything English does", () => {
  const body = TEMPLATES.slice(TEMPLATES.indexOf("GENERAL_INSTRUCTION_TEMPLATES"));
  const block = (lang) => {
    const start = body.indexOf(`${lang}: [`);
    return body.slice(start, body.indexOf("].join", start));
  };
  const numbered = (b) => (b.match(/^\s*"\d+\./gm) || []).length;
  const en = block("en");
  const hi = block("hi");
  assert(numbered(en) >= 10, "the standard sheet covers timer, palette, review, navigating, answering, submitting — a short list is a different feature");
  assert(
    numbered(en) === numbered(hi),
    `en makes ${numbered(en)} numbered promises, hi makes ${numbered(hi)} — a shorter list quietly tells Hindi candidates less`
  );
  // The palette legend must cover OUR runner's four states, written as tile
  // tokens — identical syntax in every language, rendered as colour swatches
  // by InstructionText on the intro page.
  for (const token of ["[green]", "[purple]", "[red]", "[plain]"]) {
    assert(en.includes(token), `the en legend must carry the ${token} tile line`);
    assert(hi.includes(token), `the hi legend must carry the ${token} tile line — tokens are syntax, not prose`);
  }
  assert(
    en.includes("never discards an answer") && en.includes("Clear Response"),
    "this runner saves on click and clears via Clear Response — copying NTA's 'Next to save' mechanics would teach candidates false fear"
  );
});

// ─── [7] The legend renders as tiles, not colour words ──────────────────────
console.log("\n[7] Palette legend tiles");

const TILES = readSrc("components/exam/InstructionText.tsx");
const INTRO = readSrc("pages/ExamIntro.tsx");
const SIM = readSrc("pages/ExamSimulator.tsx");

test("the tile colours are the runner's own legend, class for class", () => {
  // A legend that disagrees with the palette is worse than text. These are
  // the exact classes ExamSimulator's legend swatches use.
  for (const cls of ['"bg-green-500"', '"bg-purple-500"', '"bg-red-500"', '"bg-background border border-border"']) {
    assert(TILES.includes(`: ${cls}`) || TILES.includes(`:${cls}`), `InstructionText must map a token to ${cls}`);
    assert(SIM.includes(cls.replace(/"/g, '"').slice(1, -1)), `sanity: ${cls} should still be what the runner's legend uses`);
  }
});

test("only the four known tokens are special; everything else stays pre-wrap text", () => {
  assert(
    TILES.includes("(green|purple|red|plain)"),
    "the token set is closed — a creator's own [brackets] must not become mystery tiles"
  );
  assert(
    /whitespace-pre-wrap/.test(TILES),
    "non-tile lines must render exactly as the bare <p> used to render them"
  );
});

test("the intro renders both instruction blocks through the tile renderer", () => {
  assert(
    /InstructionText[\s\S]{0,120}text=\{displayGeneralInstruction\}/.test(INTRO),
    "the general instructions carry the legend — a bare <p> would print the tokens raw"
  );
  assert(
    /InstructionText[\s\S]{0,120}text=\{shownExamInstruction\}/.test(INTRO),
    "the exam instructions get the same renderer, so a creator pasting legend lines there is not punished"
  );
});

test("the tile speaks its colour to screen readers", () => {
  assert(
    /aria-hidden="true"/.test(TILES) && /sr-only/.test(TILES),
    "the colour IS information — 'red means marked' — and the swatch is the only place it lives once the colour word is gone"
  );
});

test("the sheet cannot fail for any exam: type- and mode-specific lines are conditional", () => {
  const body = TEMPLATES.slice(TEMPLATES.indexOf("GENERAL_INSTRUCTION_TEMPLATES"));
  // This text ships with EVERY exam. Question types vary per paper, so their
  // mechanics must be phrased as "if a question…" — idle on an all-MCQ paper,
  // never wrong. Same for the THREE timing modes (locked, free, grouped
  // timing parts): "you may … or … or …".
  assert(
    /If a question allows several answers/.test(body) &&
      /If a question asks for a typed or numerical answer/.test(body),
    "an unconditional multi/numeric line is false for every exam without those types"
  );
  assert(
    /you may sit one section at a time[\s\S]{0,200}or all sections may share one timer[\s\S]{0,200}or the paper may be split into timed parts/.test(
      body
    ),
    "the timing point must carry all three modes — stating fewer as fact fails for the exams in the missing one"
  );
  // And nothing tied to one exam's configuration may appear at all: no counts,
  // no minutes, no marks. (Digits are allowed only as list numbering and the
  // 5-minute warning, which is a runner constant.)
  const enBlock = body.slice(body.indexOf("en: ["), body.indexOf("].join", body.indexOf("en: [")));
  const lines = enBlock.match(/"[^"]+"/g) || [];
  for (const line of lines) {
    assert(
      !/\d+ (marks?|questions?|sections?)|\d+ minutes for/.test(line),
      `a per-exam number has no place in the generic sheet: ${line}`
    );
  }
});

test("blank copy counts as no copy", () => {
  assert(
    /text\[lang\]\?\.trim\(\) \? template\.text\[lang\] : null/.test(TEMPLATES),
    'a key set to "" would otherwise show a button that clears the field'
  );
});

test("the already-applied check ignores trailing whitespace", () => {
  assert(
    /const current = value\.trim\(\)/.test(TEMPLATES) && /\?\.trim\(\) === current/.test(TEMPLATES),
    "a stray newline the textarea collected should not make an untouched template look edited"
  );
});

test("the components do not carry their own copy of the text", () => {
  for (const [name, src] of [["InstructionTemplateAction", ACTION], ["ExamDetail", DETAIL], ["CreateExamDialog", DIALOG]]) {
    assert(
      !/Read all instructions carefully/.test(src),
      `${name} holds a second copy of the template text; editing instructionTemplates.ts would then change only some of the places it appears`
    );
  }
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
