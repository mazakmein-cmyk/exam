/**
 * AI PDF IMPORT — the prompt is one file, and both flows fill it the same way.
 *
 * Run with: node src/__tests__/ai-import-prompt.test.mjs
 *
 *  1. ONE PROMPT. The guide page (manual flow) and the ai-pdf-import edge
 *     function (in-app flow) both import src/lib/extractionPrompt.js. Neither
 *     carries its own copy, so the two flows cannot drift apart.
 *  2. THE CONTEXT BLOCK IS FILLED, NEVER SENT BLANK. fillExtractionPromptContext
 *     replaces the language blank and the section-name blanks, throws on any
 *     other language, and throws if a blank survives.
 *  3. NO SECTIONS IS A VALID INPUT. An exam with no sections yet gets a line
 *     telling the model to use the paper's own section names.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  EXTRACTION_JSON_END,
  EXTRACTION_JSON_START,
  EXTRACTION_PROMPT,
  EXTRACTION_PROMPT_VERSION,
  fillExtractionPromptContext,
  hasDelimitedExtraction,
} from "../lib/extractionPrompt.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("\n1. One prompt");
test("the prompt asks for schema 1.0 and both delimiters", () => {
  assert(EXTRACTION_PROMPT_VERSION === "1.0", "version");
  assert(EXTRACTION_PROMPT.includes('"schema_version": "1.0"'), "schema_version line missing");
  assert(EXTRACTION_PROMPT.includes(EXTRACTION_JSON_START) && EXTRACTION_PROMPT.includes(EXTRACTION_JSON_END), "delimiters missing");
  assert(EXTRACTION_PROMPT.length > 30000, "prompt suspiciously short — did the move lose text?");
});
test("the guide page imports the shared prompt and has no local copy", () => {
  const guide = read("src/pages/JsonUploadGuide.tsx");
  assert(guide.includes('from "@/lib/extractionPrompt.js"'), "guide does not import the shared module");
  assert(!guide.includes("const EXTRACTION_PROMPT"), "guide still defines its own EXTRACTION_PROMPT");
  assert(guide.includes("<CopyBlock text={EXTRACTION_PROMPT}"), "guide no longer shows the prompt");
});
test("the edge function imports the shared prompt and has no local copy", () => {
  const fn = read("supabase/functions/ai-pdf-import/index.ts");
  assert(fn.includes('from "../../../src/lib/extractionPrompt.js"'), "edge function does not import the shared module");
  assert(fn.includes("fillExtractionPromptContext("), "edge function does not fill the context block");
  assert(!fn.includes("You are converting an exam paper"), "edge function carries its own prompt text");
});

console.log("\n2. The context block is filled");
test("language + sections land in the YOUR CONTEXT block", () => {
  const out = fillExtractionPromptContext({ language: "en", sectionNames: ["English Language", "Quantitative Aptitude", "Reasoning Ability"] });
  const ctx = out.slice(out.indexOf("YOUR CONTEXT"));
  assert(/Language code:\s+en\b/.test(ctx), "language not filled");
  assert(ctx.includes("1. English Language"), "section 1 missing");
  assert(ctx.includes("2. Quantitative Aptitude"), "section 2 missing");
  assert(ctx.includes("3. Reasoning Ability"), "section 3 missing");
  assert(!ctx.includes("______"), "a blank survived");
  assert(!ctx.includes("(add more lines if needed)"), "template hint survived");
});
test("the body of the prompt is untouched by the fill", () => {
  const out = fillExtractionPromptContext({ language: "hi", sectionNames: ["A"] });
  const cut = EXTRACTION_PROMPT.indexOf("YOUR CONTEXT");
  assert(out.slice(0, cut) === EXTRACTION_PROMPT.slice(0, cut), "text before the context block changed");
});
test("four sections produce four numbered lines", () => {
  const out = fillExtractionPromptContext({ language: "en", sectionNames: ["A", "B", "C", "D"] });
  const ctx = out.slice(out.indexOf("YOUR CONTEXT"));
  assert(ctx.includes("4. D"), "fourth section missing");
});
test("blank and whitespace-only names are dropped", () => {
  const out = fillExtractionPromptContext({ language: "en", sectionNames: [" A ", "", "   ", "B"] });
  const ctx = out.slice(out.indexOf("YOUR CONTEXT"));
  assert(ctx.includes("1. A") && ctx.includes("2. B"), "names not trimmed/renumbered");
  assert(!ctx.includes("3."), "empty name produced a line");
});
test("only en and hi are accepted", () => {
  let threw = false;
  try {
    fillExtractionPromptContext({ language: "fr", sectionNames: [] });
  } catch {
    threw = true;
  }
  assert(threw, "fr was accepted");
  assert(/Language code:\s+en\b/.test(fillExtractionPromptContext({ language: " EN ", sectionNames: [] })), "case/whitespace not normalised");
});
test("a prompt whose blanks moved is refused instead of sent half-filled", () => {
  let threw = false;
  try {
    fillExtractionPromptContext({ language: "en", sectionNames: ["A"] }, "YOUR CONTEXT\n  Language code:   ______\n    1. ______\n    2. ______\n    3. ______\n    (different hint)\n");
  } catch {
    threw = true;
  }
  assert(threw, "blank survived silently");
});

console.log("\n3. No sections is a valid input");
test("an exam with no sections tells the model to use the paper's names", () => {
  const out = fillExtractionPromptContext({ language: "en", sectionNames: [] });
  const ctx = out.slice(out.indexOf("YOUR CONTEXT"));
  assert(ctx.includes("use the section names printed in the paper"), "no-sections guidance missing");
  assert(!ctx.includes("1. ______"), "blank survived");
});

console.log("\n4. Delimiter check");
test("hasDelimitedExtraction needs both markers in order", () => {
  assert(hasDelimitedExtraction(`x ${EXTRACTION_JSON_START}{}${EXTRACTION_JSON_END} y`), "valid block rejected");
  assert(!hasDelimitedExtraction(`${EXTRACTION_JSON_START}{}`), "missing end accepted");
  assert(!hasDelimitedExtraction(`${EXTRACTION_JSON_END}{}${EXTRACTION_JSON_START}`), "reversed accepted");
  assert(!hasDelimitedExtraction(""), "empty accepted");
  assert(!hasDelimitedExtraction(null), "null accepted");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
