/**
 * JSON UPLOAD — PASTED TEXT IS A FIRST-CLASS SOURCE, NOT A SECOND PARSER
 *
 * Run with: node src/__tests__/json-upload-paste-text.test.mjs
 *
 * The upload dialog takes JSON two ways: a chosen .json file, or text pasted
 * straight from the AI's reply. The paste route exists because the file route
 * forces a save-as through a text editor — the step where the UTF-8 dropdown
 * gets missed and "LozÃ¨re" is born — and because a parse error is far easier
 * to fix with the text still in front of you than after a second picker trip.
 *
 * What must stay true:
 *
 *  1. ONE parser, ONE ParseContext builder, ONE hand-off into the preview.
 *     If the paste view grew its own parse call or its own context, the two
 *     routes would drift — different language checks, different section
 *     matching — and the create-sections re-parse (which stashes raw text)
 *     would silently work for one route and not the other.
 *  2. The live check is debounced and gates Continue. Parsing a megabyte
 *     paste on every keystroke would freeze the textarea; letting Continue
 *     fire before the check lands would hand the preview a stale report.
 *  3. The 10 MB limit and the docs anchors are shared with the file route.
 *  4. Paste state resets when the dialog opens and after a successful import,
 *     so yesterday's paste never reappears pre-filled in another exam.
 *  5. A failed FILE keeps its text so "Edit & retry here" can seed the box.
 *  6. The guide documents both routes and every error anchor the dialog
 *     links to still exists on the page.
 *  7. (bundled) The parser really does accept the "whole reply" the paste UI
 *     and the guide tell people to paste — delimiters, fences and prose.
 */

import { readFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

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

// Files are CRLF on this checkout; normalise so `\s*` / `\n` regexes behave.
function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8").replace(/\r\n/g, "\n");
}

const DIALOG = readSrc("components/JsonUploadDialog.tsx");
const GUIDE = readSrc("pages/JsonUploadGuide.tsx");
const PARSER = readSrc("services/jsonImportParser.ts");

const slice = (src, startMarker, endMarker) => {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  assert(start !== -1, `marker not found: ${startMarker}`);
  assert(end !== -1, `end marker not found: ${endMarker}`);
  return src.slice(start, end);
};

console.log("\n══ JSON upload: pasted text as a source ══");

// ─── [1] Two routes in, one preview out ──────────────────────────────────────
console.log("\n[1] Both routes converge");

test("every language row offers Paste JSON and Upload file", () => {
  const picker = slice(DIALOG, "function LanguagePickerView(", "// ─── Paste JSON View");
  assert(/onClick=\{\(\) => onPasteClick\(lang\)\}/.test(picker), "row needs a paste button");
  assert(/onClick=\{\(\) => onUploadClick\(lang\)\}/.test(picker), "row keeps its file button");
  assert(/Paste JSON\s*<\/Button>/.test(picker), "paste button must be labelled 'Paste JSON'");
  assert(/Upload file\s*<\/Button>/.test(picker), "file button must be labelled 'Upload file'");
  // Neither route is gated on sections existing — an exam with none yet gets
  // them created from the JSON on the preview, so the buttons stay live.
  assert(!/canUpload/.test(picker), "the old no-sections gate must be gone from the row");
  assert(
    /No sections yet — importing creates them from your JSON\./.test(picker),
    "the empty row must say what will happen, not send the user away"
  );
});

test("an exam with no sections is a first import, not a dead end", () => {
  // The preview offers to create every section from the JSON (primary only)…
  const preview = slice(DIALOG, "function PreviewView(", "{/* Section-name mismatch panel */}");
  assert(
    /const examHasNoSections = report\.examSectionNames\.length === 0;/.test(preview),
    "preview must detect the no-sections state"
  );
  assert(
    /\{hasMismatch && examHasNoSections && \([\s\S]*?This exam has no sections yet[\s\S]*?onClick=\{onCreateSectionsClick\}/.test(
      preview
    ),
    "the zero-section panel must lead with the create action"
  );
  assert(
    /Add the primary language first/.test(preview),
    "a secondary language with no sections must be told to import primary first"
  );
  assert(
    /\{hasMismatch && !examHasNoSections && \(/.test(DIALOG),
    "the amber mismatch panel must step aside when there is nothing to mismatch against"
  );
  // …the confirm button says so instead of 'fix and re-upload'…
  assert(
    /return report\.isPrimary \? "Create sections to continue" : "Add the primary language first";/.test(DIALOG),
    "confirm label must point at the create step"
  );
  // …the create modal is titled for a first import…
  assert(/"Create sections from your JSON"/.test(DIALOG), "modal title for the first import");
  // …and the paste view's live check frames it as expected, not as an error.
  const pasteView = slice(DIALOG, "function PasteJsonView(", "// ─── Preview View");
  assert(
    /the next screen creates \$\{unmatchedCount === 1 \? "it" : `all \$\{unmatchedCount\}`\} from your JSON\./.test(
      pasteView
    ),
    "paste status must explain that sections will be created"
  );
  // The guide documents it.
  assert(/If the exam has no sections yet<\/strong>/.test(GUIDE), "guide Step 5 must cover the no-sections import");
  assert(/Sections are optional/.test(GUIDE), "guide prerequisites must not demand sections");
});

test("file and paste both hand off through openPreview, which stashes raw text", () => {
  assert(
    /const openPreview = \(text: string, result: ParseReport, source: JsonSource\) => \{\s*setReport\(result\);\s*setRawJsonText\(text\);/.test(
      DIALOG
    ),
    "openPreview must set the report AND stash the raw text (the create-sections re-parse needs it)"
  );
  assert(/openPreview\(text, result, "file"\);/.test(DIALOG), "file route must call openPreview");
  assert(/openPreview\(text, result, "paste"\);/.test(DIALOG), "paste route must call openPreview");
  // No other place may open the preview — that would bypass the stash.
  const previewSets = DIALOG.match(/setView\("preview"\)/g) || [];
  assert(previewSets.length === 1, `expected exactly one setView("preview"), found ${previewSets.length}`);
});

test("one ParseContext builder feeds the file parse and the paste parse", () => {
  assert(
    /parseExamJson\(text, buildParseContext\(selectedLang\)\)/.test(DIALOG),
    "file route must parse through buildParseContext"
  );
  assert(
    /return \(text: string\) => parseExamJson\(text, buildParseContext\(lang\)\);/.test(DIALOG),
    "paste parser must be built from the same buildParseContext"
  );
  const pasteView = slice(DIALOG, "function PasteJsonView(", "// ─── Preview View");
  assert(
    !/parseExamJson\(/.test(pasteView),
    "the paste view must not call parseExamJson itself — it receives the bound parser as a prop"
  );
  assert(/parse\(checked\)/.test(pasteView), "the paste view parses via its `parse` prop");
});

test("the paste parser identity is memoised so the live check isn't re-run per keystroke", () => {
  assert(
    /const parsePaste = useMemo\(\(\) => \{[\s\S]*?\}, \[selectedLang, buildParseContext\]\);/.test(DIALOG),
    "parsePaste must be a useMemo keyed on language + context builder"
  );
  assert(
    /const buildParseContext = useCallback\(/.test(DIALOG),
    "buildParseContext must be a useCallback or parsePaste's memo is worthless"
  );
});

// ─── [2] The live check ──────────────────────────────────────────────────────
console.log("\n[2] Debounced check gates Continue");

test("the check runs on a debounced copy of the text", () => {
  const pasteView = slice(DIALOG, "function PasteJsonView(", "// ─── Preview View");
  assert(/const PASTE_CHECK_DEBOUNCE_MS = \d+;/.test(DIALOG), "debounce constant missing");
  assert(
    /window\.setTimeout\(\(\) => setChecked\(value\), PASTE_CHECK_DEBOUNCE_MS\)/.test(pasteView),
    "debounce must copy `value` into `checked` after the delay"
  );
  assert(
    /return \(\) => window\.clearTimeout\(id\);/.test(pasteView),
    "and clear the pending timer when the text changes again"
  );
});

test("Continue is disabled while checking, when empty, when too large, or when the report is not ok", () => {
  const pasteView = slice(DIALOG, "function PasteJsonView(", "// ─── Preview View");
  assert(
    /const canContinue = !checking && !isEmpty && !tooLarge && !!report\?\.ok;/.test(pasteView),
    "canContinue must require all four conditions"
  );
  assert(/disabled=\{!canContinue\}/.test(pasteView), "Continue button must be gated on canContinue");
  assert(
    /if \(canContinue && report\) onContinue\(value, report\);/.test(pasteView),
    "Continue must hand over the SAME text and report the check produced"
  );
  assert(
    /e\.key === "Enter"[\s\S]{0,80}handleContinue\(\);/.test(pasteView),
    "Ctrl/⌘+Enter must go through the same gated handler"
  );
});

test("the 10 MB limit is the file route's constant, and oversize text is never parsed", () => {
  const pasteView = slice(DIALOG, "function PasteJsonView(", "// ─── Preview View");
  assert(/sizeBytes > MAX_FILE_SIZE_BYTES/.test(pasteView), "paste must reuse MAX_FILE_SIZE_BYTES");
  assert(
    /checked\.trim\(\) && !tooLarge \? parse\(checked\) : null/.test(pasteView),
    "parse must be skipped for oversize text — jsonrepair over 10 MB would hang the tab"
  );
  assert(
    /\? "file_too_large"/.test(pasteView),
    "oversize paste must map to the file_too_large docs anchor"
  );
});

// ─── [3] State hygiene ───────────────────────────────────────────────────────
console.log("\n[3] Paste state hygiene");

test("paste state resets when the dialog opens", () => {
  const openEffect = DIALOG.slice(
    DIALOG.indexOf('setView("languages");'),
    DIALOG.indexOf("loadStatus();")
  );
  assert(/setPasteText\(""\);/.test(openEffect), "paste text must reset on open");
  assert(/setPasteLang\(null\);/.test(openEffect), "paste language must reset on open");
  assert(/setReportSource\(null\);/.test(openEffect), "report source must reset on open");
});

test("paste state resets after a successful import", () => {
  const success = slice(DIALOG, "if (res.ok) {", "await loadStatus();");
  assert(/setPasteText\(""\);/.test(success), "imported text must not be offered again");
  assert(/setPasteLang\(null\);/.test(success), "paste language must clear with it");
});

test("switching language rows clears a paste drafted for another language", () => {
  const handler = slice(DIALOG, "const handlePasteClick", "const parsePaste");
  assert(
    /if \(pasteLang !== lang\) \{\s*(\/\/[^\n]*\n\s*)*setPasteText\(""\);\s*setPasteLang\(lang\);/.test(handler),
    "a different row must start with an empty box"
  );
});

test("Esc does not discard a paste in progress", () => {
  assert(
    /onEscapeKeyDown=\{\(e\) => \{[\s\S]*?if \(view === "paste" && pasteText\.trim\(\)\) e\.preventDefault\(\);/.test(
      DIALOG
    ),
    "Radix closes on Esc by default — the paste view must veto that while text is present"
  );
});

test("Back from the preview returns to where the text came from", () => {
  assert(
    /setView\(reportSource === "paste" \? "paste" : "languages"\);/.test(DIALOG),
    "a pasted report must go back to the paste box, a file report to the language list"
  );
});

// ─── [4] Failed file → editable text ─────────────────────────────────────────
console.log("\n[4] Edit & retry here");

test("a file that fails to parse keeps its text and language on the error", () => {
  const handler = slice(DIALOG, "const handleFileChosen", "// ─── Paste-text flow");
  assert(
    /fail\(\{ code: result\.errorCode \?\? "invalid_json", message: msg, text, lang: selectedLang \}\);/.test(
      handler
    ),
    "parse failures must carry the raw text"
  );
  assert(
    /const fail = \(error: DialogError\) => \{\s*setLastError\(error\);\s*setView\("languages"\);/.test(handler),
    "every failure must return to the languages view, where the banner lives — the picker can be opened from the paste view"
  );
});

test("Edit & retry seeds the paste box and is offered only when there is text", () => {
  assert(
    /onEditFailedText=\{lastError\?\.text \? handleEditFailedText : undefined\}/.test(DIALOG),
    "the banner action must be absent for size/read errors that have no text"
  );
  const handler = slice(DIALOG, "const handleEditFailedText", "const unmatchedForCreate");
  assert(/setPasteText\(lastError\.text\);/.test(handler), "must seed the box with the failed text");
  assert(/setView\("paste"\);/.test(handler), "and open the paste view");
  const picker = slice(DIALOG, "function LanguagePickerView(", "// ─── Paste JSON View");
  assert(
    /\{onEditFailedText && \([\s\S]*?Edit &amp; retry here/.test(picker),
    "the banner must render the button only when the handler is present"
  );
});

// ─── [5] Docs ────────────────────────────────────────────────────────────────
console.log("\n[5] Guide page");

test("every error anchor the dialog links to exists on the guide page", () => {
  const map = slice(DIALOG, "const errorCodeToAnchor", "};");
  const anchors = [...map.matchAll(/:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert(anchors.length >= 6, `expected the full anchor map, found ${anchors.length}`);
  for (const a of anchors) {
    assert(GUIDE.includes(`id="${a}"`), `guide is missing a section with id="${a}"`);
  }
});

test("the guide documents both routes in Step 4", () => {
  const step4 = slice(GUIDE, 'id="step-4-upload"', 'id="step-5-review"');
  assert(/Paste or upload/.test(step4), "Step 4 title must name both routes");
  assert(/<strong>Paste JSON<\/strong>/.test(step4), "Step 4 must name the Paste JSON button");
  assert(/<strong>Upload file<\/strong>/.test(step4), "Step 4 must name the Upload file button");
  assert(/Continue to preview/.test(step4), "Step 4 must name the Continue button");
  assert(/Edit &amp; retry here/.test(step4), "Step 4 must mention Edit & retry here");
  assert(/Ctrl\+Enter/.test(step4), "Step 4 must mention the keyboard shortcut");
});

test("Step 3 no longer forces a file: copying is Option A, saving is Option B", () => {
  const step3 = slice(GUIDE, 'id="step-3-save"', 'id="step-4-upload"');
  assert(/Option A — Copy it \(recommended\)/.test(step3), "Option A must be copy");
  assert(/Option B — Save it as a file/.test(step3), "Option B must keep the file instructions");
  assert(/UTF-8/.test(step3), "the UTF-8 warning must survive for the file route");
});

test("table of contents matches the renamed steps", () => {
  assert(/label: "Step 3 — Copy the JSON"/.test(GUIDE), "TOC Step 3 label");
  assert(/label: "Step 4 — Paste or upload"/.test(GUIDE), "TOC Step 4 label");
  assert(/label: "→ JSON too large"/.test(GUIDE), "TOC size-limit label must not say 'File'");
});

test("the language-mismatch message no longer presumes a click on 'Upload'", () => {
  assert(
    /but you picked the "\$\{ctx\.selectedLanguage\}" language\./.test(PARSER),
    "parser message must be route-neutral"
  );
  assert(!/clicked Upload on/.test(PARSER), "old wording must be gone from the parser");
  assert(!/clicked Upload on/.test(GUIDE), "old wording must be gone from the guide");
  assert(
    /you picked the 'en' language/.test(GUIDE) && /you picked the Y language/.test(GUIDE),
    "the guide must quote the new wording in both the fix section and the troubleshooting table"
  );
});

// ─── [6] The parser accepts what the UI tells people to paste ────────────────
console.log("\n[6] Parser accepts a whole AI reply");

let bundledParse = null;
const OUT = resolve(ROOT, ".json-paste-test-bundle.mjs");
try {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [resolve(ROOT, "src/services/jsonImportParser.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: OUT,
    alias: { "@": resolve(ROOT, "src") },
    logLevel: "error",
  });
  ({ parseExamJson: bundledParse } = await import(pathToFileURL(OUT).href));
} catch (e) {
  console.log(`  ⏭  esbuild unavailable — skipping parser checks (${e?.message ?? e})`);
}

if (bundledParse) {
  const ctx = {
    language: "en",
    selectedLanguage: "en",
    isPrimary: true,
    supportedLanguages: ["en", "hi"],
    examSectionsForLanguage: [{ id: "s1", name: "Quant", sort_order: 0 }],
  };
  const doc = {
    schema_version: "1.0",
    language: "en",
    sections: [
      {
        name: "Quant",
        questions: [
          {
            q_no: 1,
            text: "2 + 2 = ?",
            answer_type: "single",
            options: ["3", "4", "5", "6"],
            correct_answer: "1",
          },
        ],
      },
    ],
  };

  test("a reply with prose, delimiters and a ```json fence parses clean", () => {
    const reply = [
      "Here is the extracted exam as requested.",
      "",
      "<<<EXAM_JSON_START>>>",
      "```json",
      JSON.stringify(doc, null, 2),
      "```",
      "<<<EXAM_JSON_END>>>",
      "",
      "Let me know if you need any changes!",
    ].join("\n");
    const r = bundledParse(reply, ctx);
    assert(r.ok, `expected ok, got: ${r.fatalReason}`);
    assert(r.perSection.length === 1 && r.perSection[0].accepted.length === 1, "one question accepted");
    assert(r.perSection[0].matchedSectionId === "s1", "section must match the exam's");
  });

  test("the bare JSON object, as the Copy button on a code block yields it, parses too", () => {
    const r = bundledParse(JSON.stringify(doc), ctx);
    assert(r.ok, `expected ok, got: ${r.fatalReason}`);
    assert(r.repairApplied === false, "a clean paste must not be reported as repaired");
  });

  test("the wrong language row produces the route-neutral message", () => {
    const r = bundledParse(JSON.stringify({ ...doc, language: "hi" }), ctx);
    assert(!r.ok && r.errorCode === "language_mismatch", "must be a language_mismatch");
    assert(
      r.fatalReason === 'JSON is for "hi" but you picked the "en" language.',
      `unexpected message: ${r.fatalReason}`
    );
  });

  test("an empty or whitespace paste is an invalid_json fatal, not a crash", () => {
    const r = bundledParse("   \n  ", ctx);
    assert(!r.ok && r.errorCode === "invalid_json", `expected invalid_json, got ${r.errorCode}`);
  });

  try {
    rmSync(OUT);
  } catch {}
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.error}`);
  process.exit(1);
}
