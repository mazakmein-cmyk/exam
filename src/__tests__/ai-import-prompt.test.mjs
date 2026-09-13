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
 *  4. THE ANSWER-KEY CONTRACT. Creators kept getting questions with no correct
 *     answer marked, so the prompt now carries a whole chapter on keys. The
 *     things that chapter depends on are easy to undo by accident:
 *       - it must be read EARLY (before the rules), not buried after images;
 *       - the model must write the key into _extraction_summary.answer_key,
 *         which is emitted before sections, so the key is transcribed before
 *         the first question;
 *       - the off-by-one warning must survive (a key that prints "(3)" is
 *         index "2" — no parser can detect that mistake);
 *       - nothing may tell the model to STOP and ask, because the in-app flow
 *         has no human and a reply without the JSON block is a failed job;
 *       - a blank correct_answer must never reach the parser as index 0.
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

console.log("\n5. The answer-key contract");
const P = EXTRACTION_PROMPT;
const at = (needle) => {
  const i = P.indexOf(needle);
  assert(i >= 0, `prompt no longer contains ${JSON.stringify(needle)}`);
  return i;
};

test("the answer-key chapter is read BEFORE the rules, not buried at the end", () => {
  const key = at("ANSWER KEY — find it, transcribe it, join it, convert it");
  const rules = at("RULES — non-negotiable");
  const images = at("IMAGES — when to flag, when to transcribe, when to auto-snip");
  assert(key < rules, "the ANSWER KEY chapter must come before the RULES");
  assert(key < images, "the ANSWER KEY chapter must come before the IMAGES chapter");
});

test("the working procedure is front-loaded, before the schema", () => {
  assert(at("HOW TO WORK — four passes, in this order") < at("SCHEMA (v1.0)"), "procedure block moved below the schema");
  assert(P.includes("READ THE WHOLE PDF, LAST PAGES FIRST"), "the read-the-last-pages-first pass is gone");
  assert(P.includes("WRITE THE KEY DOWN"), "the transcribe-the-key pass is gone");
});

test("the key is transcribed into the summary, which is emitted first", () => {
  assert(P.includes('"answer_key": {'), "answer_key is not in the schema block");
  assert(P.includes('"transcript"'), "answer_key.transcript is gone");
  assert(
    /_extraction_summary is emitted BEFORE the sections/.test(P),
    "the prompt no longer explains why the summary comes first"
  );
  assert(
    /Emit the top-level keys in the order shown above — schema_version,\s+language, _extraction_summary, marks_config, sections/.test(P),
    "the required top-level key order is gone — the transcript could be written after the questions"
  );
  assert(
    /"answer_key" inside _extraction_summary IS part of this\nschema/.test(P),
    'answer_key must be exempted from "NO OTHER FIELDS ARE RECOGNIZED" or a literal model omits it'
  );
});

test("the off-by-one trap is spelled out with a WRONG/RIGHT pair", () => {
  assert(P.includes("A PRINTED DIGIT IS A LABEL, NEVER AN INDEX"), "the label-vs-index warning is gone");
  assert(P.includes('WRONG:   key "(3)"  →  "correct_answer": "3"'), "the wrong example is gone");
  assert(P.includes('RIGHT:   key "(3)"  →  "correct_answer": "2"'), "the right example is gone");
});

test("nothing tells an unattended model to stop, ask or refuse", () => {
  assert(!/STOP and ask me/.test(P), "a 'STOP and ask me' instruction is back — it fails the in-app job");
  assert(!/STOP and tell me to switch/.test(P), "the model-tier refusal is back — Flash would refuse every job");
  assert(P.includes("NEVER stop to ask"), "the never-stop instruction for section mapping is gone");
  assert(P.includes("FULL EFFORT, ALWAYS THE JSON"), "the replacement for the model-tier rule is gone");
});

test("an unmatched answer never deletes a readable question", () => {
  assert(
    !/SKIP the\nquestion and log "reason": "answer \/ option mismatch"/.test(P),
    "the old skip-on-mismatch instruction is back — it drops readable questions"
  );
  assert(P.includes('"answer key — no entry for printed Q17"'), "the sanctioned review reasons are gone");
  assert(
    P.includes("A readable stem NEVER goes into _extraction_summary.skipped"),
    "the rule keeping answer problems out of skipped is gone"
  );
});

test("the values the parser would reject are named as fatal", () => {
  assert(/index ≥ options.length/.test(P), "the out-of-range warning is gone");
  assert(/the parser DELETES the whole question/.test(P), "the consequence of a bad value is not stated");
  // The parser now treats a blank as "not marked", so the prompt must no
  // longer claim it ticks option A — but it must still forbid emitting one.
  assert(!/empty string is read as index 0/.test(P), "the prompt still describes the fixed empty-string bug");
  assert(/a blank means "not marked"/.test(P), "the prompt no longer forbids a blank correct_answer");
});

test("a six-option question has a legal encoding", () => {
  assert(
    /a digit string from "0" to\s+options\.length-1/.test(P),
    'correct_answer is still capped at "0"…"4" — a 5- or 6-option question has no sanctioned answer'
  );
});

test("a solutions booklet is not mistaken for a second paper", () => {
  assert(
    /is NOT a second paper/.test(P),
    "nothing stops the model skipping the appended solutions booklet — the very pages the key is on"
  );
});

test("a paper-level key failure logs one entry, not one per question", () => {
  assert(/THE ONE EXCEPTION/.test(P), "the paper-level exception to per-question reasons is gone");
  assert(
    /"ONE entry" means ONE object in/.test(P),
    "nothing distinguishes a needs_manual_review entry from answer_key.note"
  );
});

test("a paper with no key has a template to copy", () => {
  assert(/"found": false, "applied": false, "format": "none"/.test(P), "the no-key answer_key template is gone");
  assert(/never\s+a transcript of "1:\? 2:\? …"/.test(P), "nothing stops a 200-token placeholder transcript");
});

test("the numbering shift has a direction, and it matches the worked example", () => {
  assert(/key entry = printed q_no \+ EARLIER/.test(P), "the add case of the numbering shift is gone");
  assert(
    /key entry = printed q_no − EARLIER/.test(P),
    "the subtract case is gone — a paper numbered 1-90 with a per-subject key would shift the wrong way"
  );
});

test("the size limit named is the model's reply, not the 10 MB file limit", () => {
  assert(/65,000 output tokens/.test(P), "the real output ceiling is not stated");
  assert(!/the user will be told to split sections across files/.test(P), "the misleading 10 MB guidance is back");
});

test("the counters cannot pressure the model into inventing an answer", () => {
  assert(/THE QUESTIONS ARE RIGHT/.test(P), "nothing tells the model to trust the questions over its own counters");
});

test("questions must be emitted in printed order", () => {
  assert(
    /EMIT THE QUESTIONS IN PRINTED ORDER/.test(P),
    "the parser numbers by position, so nothing stops a two-column paper importing scrambled"
  );
});

test("placeholder sentinels are still verbatim, and carry the key's value in the reason", () => {
  // jsonImportParser.ts matches these two strings exactly.
  assert(P.includes("[Manual entry needed — unsupported type in v1]"), "placeholder sentinel changed");
  assert(P.includes("[See PDF Q<q_no> for the actual answer]"), "placeholder hint sentinel changed");
  assert(
    P.includes('"placeholder — numeric/TITA unsupported in v1 (key: 7.00)"'),
    "the numeric key value no longer rides in the review reason"
  );
});

test("no worked example demonstrates a null answer on an ordinary MCQ", () => {
  const examples = P.slice(at("WORKED EXAMPLES — copy these patterns"));
  const nulls = examples.match(/"correct_answer": null/g) ?? [];
  const placeholders = examples.match(/\[Manual entry needed — unsupported type in v1\]/g) ?? [];
  assert(
    nulls.length <= placeholders.length,
    `${nulls.length} null answers in the examples but only ${placeholders.length} placeholders — an ordinary MCQ is demonstrating null`
  );
});

test("the key is language-neutral on both passes", () => {
  assert(
    P.includes("THE LANGUAGE FILTER APPLIES TO QUESTION, OPTION AND PASSAGE"),
    "the carve-out that lets a hi pass use an English key is gone"
  );
});

console.log("\n6. A blank answer never means option A");
test("the parser treats a blank correct_answer as not marked", () => {
  const parser = read("src/services/jsonImportParser.ts");
  // Number("") is 0, so without this guard "" silently marks the first option.
  assert(
    /value !== null && value\.trim\(\) === ""/.test(parser),
    "the blank-answer guard on single-answer questions is gone"
  );
  assert(
    /correct_answer was blank — treated as not marked/.test(parser),
    "the blank-answer warning is gone"
  );
  assert(
    /correct_answer contained a blank entry — dropped/.test(parser),
    "the blank-entry guard on multi-answer questions is gone"
  );
  assert(
    /deduped\.length > 0 \? deduped : null/.test(parser),
    "an all-blank multi answer would be stored as an empty array"
  );
});

test("a review note can still be traced to the question it names", () => {
  // The prompt keys every note on the number PRINTED in the PDF, but the
  // parser renumbers each section's questions by position. On a paper
  // numbered straight through its sections (Physics 1-30, Chemistry 31-60)
  // the two diverge, and a note saying "Q35" would send the creator to a
  // question 30 slots away — or to one that does not exist.
  const parser = read("src/services/jsonImportParser.ts");
  assert(/sourceQNo\?: number/.test(parser), "the printed q_no is no longer preserved before renumbering");
  assert(/sourceQNo: Number\.isInteger\(rawQNo\)/.test(parser), "sourceQNo is not populated from the source");
  const dialog = read("src/components/AiPdfImportDialog.tsx");
  assert(/q\.sourceQNo === printed/.test(dialog), "the summary no longer maps a printed number to its imported position");
  assert(/\(PDF Q\{r\.q_no\}\)/.test(dialog), "the review row no longer shows which PDF question it came from");
});

test("the guide page tells creators how to recover a missed key", () => {
  const guide = read("src/pages/JsonUploadGuide.tsx");
  assert(guide.includes("FIX_MISSING_ANSWERS_PROMPT"), "the missing-answers fix prompt is gone");
  assert(guide.includes('id="fix-missing-answers"'), "the missing-answers section is not linkable");
  assert(guide.includes('{ id: "fix-missing-answers"'), "the missing-answers section is missing from the nav");
});

test("the LaTeX escaping chapter cannot drift back into ambiguity", () => {
  // Reported 2026-09-13: a calculus question imported with every command
  // doubled twice (`\\begin`, `\\le`, `\\int`), which KaTeX either refuses
  // outright or — worse — renders as a line break plus bare letters.
  //
  // The prompt caused it. It stated the doubling rule correctly, then printed
  // eleven QUOTED examples using single backslashes; a model reading those as
  // JSON literals and applying the rule to them lands on four. So the chapter
  // must keep the two layers labelled, and must say once, explicitly, that
  // the rule is applied exactly once.
  assert(
    EXTRACTION_PROMPT.includes("DOUBLE EXACTLY ONCE"),
    "the double-doubling warning is gone — this is the failure it exists to stop",
  );
  assert(
    /formula:\s+The probability is \$\\frac\{3\}\{7\}\$/.test(EXTRACTION_PROMPT) &&
      /JSON:\s+"The probability is \$\\\\frac\{3\}\{7\}\$\."/.test(EXTRACTION_PROMPT),
    "the formula/JSON columns must stay paired, or the examples read as JSON again",
  );
  assert(
    !/^\s+• "The probability is \$\\frac/m.test(EXTRACTION_PROMPT),
    "a quoted single-backslash example came back — that is what taught the model to double twice",
  );
  assert(
    EXTRACTION_PROMPT.includes("\\begin{cases}"),
    "piecewise questions need cases; the prompt used to describe no environment at all",
  );
  assert(
    /ROW SEPARATOR is \\\\ in the formula/.test(EXTRACTION_PROMPT),
    "the row separator is the one token that is legitimately four backslashes in JSON",
  );
  assert(
    /renders as a line break and the three letters/.test(EXTRACTION_PROMPT),
    "the model must be told the failure is SILENT, or it has no reason to re-read its own output",
  );
});

test("the parser still repairs over-escaped LaTeX, whatever the prompt says", () => {
  // A prompt is guidance; at temperature 0 a mis-escape is deterministic and
  // the dialog's retry reproduces it byte for byte. The deterministic repair
  // is the thing that actually protects the creator.
  const parser = read("src/services/jsonImportParser.ts");
  assert(
    /normaliseOverEscapedLatex\(json\)/.test(parser),
    "the import-time collapse is gone",
  );
  assert(
    /latex_over_escaped_fixed/.test(parser),
    "the repair must be reported, so a creator can see their paper was rewritten",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
