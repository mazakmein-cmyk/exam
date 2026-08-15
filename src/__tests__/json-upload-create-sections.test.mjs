/**
 * JSON UPLOAD — CREATE THE MISSING SECTIONS INSTEAD OF RETYPING THEM
 *
 * Run with: node src/__tests__/json-upload-create-sections.test.mjs
 *
 * When a JSON's section names don't match the exam, the only fixes were manual:
 * rename the exam's sections one by one, or round-trip the JSON through an AI
 * prompt. The mismatch panel now offers a third fix — create the missing
 * sections right there — and these assertions pin the parts of it that fail
 * silently rather than loudly:
 *
 *  - The parser NEVER validates questions inside unmatched sections, so the
 *    old report can't just be patched with new section ids; the dialog must
 *    keep the raw file text and re-parse. Skip that and every freshly created
 *    section imports zero questions while the toast says "created".
 *  - Language twins pair by section_group_id. If each language got its own
 *    group id, the existing sibling propagation in both commit paths would go
 *    blind and the second language would stay empty forever.
 *  - Mock sections carry a mandatory time_minutes; live_sections has no time
 *    column at all. Sending time to the live table would 400 on PostgREST —
 *    for every live import, not just multi-language ones.
 *  - Cancel/X must write nothing: sections may only be created by the modal's
 *    Create button.
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

const SOURCES = readSrc("components/jsonUploadSources.ts");
const DIALOG = readSrc("components/JsonUploadDialog.tsx");
const MOCK_PAGE = readSrc("pages/ExamDetail.tsx");
const LIVE_PAGE = readSrc("pages/LiveExamDetail.tsx");

console.log("\n══ JSON upload: create missing sections ══");

// ─── [1] The plan builder — twins share one group id ────────────────────────
console.log("\n[1] buildSectionCreationPlan");

test("plan builder is exported for the dialog to use", () => {
  assert(
    /export function buildSectionCreationPlan\(/.test(SOURCES),
    "buildSectionCreationPlan must be exported from jsonUploadSources.ts"
  );
});

test("one group id per SECTION, generated before the language loop", () => {
  // genGroupId() must be called once per spec, outside `for (const lang ...)`.
  // Per-language ids would orphan the twins: sibling propagation in both
  // commit paths finds them via section_group_id.
  const body = SOURCES.slice(
    SOURCES.indexOf("export function buildSectionCreationPlan"),
    SOURCES.indexOf("export type JsonUploadDataSource")
  );
  const groupIdx = body.indexOf("const groupId = genGroupId()");
  const langLoopIdx = body.indexOf("for (const lang of supportedLanguages)");
  assert(groupIdx !== -1, "expected `const groupId = genGroupId()` in the plan builder");
  assert(langLoopIdx !== -1, "expected a per-language loop in the plan builder");
  assert(
    groupIdx < langLoopIdx,
    "groupId must be created BEFORE the language loop so every language variant of a section shares it"
  );
});

test("sort_order continues after the max across ALL languages (gap-safe)", () => {
  assert(
    /const maxSort = Math\.max\(\s*-1,/.test(SOURCES),
    "maxSort must start from -1 so the first section of an empty exam lands at sort_order 0"
  );
  assert(
    /supportedLanguages\.flatMap\(\(l\) => \(sectionsByLang\[l\] \?\? \[\]\)\.map\(\(s\) => s\.sort_order\)\)/.test(
      SOURCES
    ),
    "max must scan every language's sections — twins share sort_order, and count-based ordering collides after deletes"
  );
  assert(
    /sort_order: maxSort \+ 1 \+ i,/.test(SOURCES),
    "new sections must be appended in JSON order after the current max"
  );
});

// ─── [2] The adapters — right table, right columns ───────────────────────────
console.log("\n[2] Data-source adapters");

test("mock adapter inserts into `sections` and always sends time_minutes", () => {
  const mock = SOURCES.slice(
    SOURCES.indexOf("export const mockExamJsonSource"),
    SOURCES.indexOf("export const liveExamJsonSource")
  );
  assert(
    /createSections: async \(examId, rows\)/.test(mock),
    "mock adapter must implement createSections"
  );
  assert(
    /from\("sections"\)\.insert\(/.test(mock.replace(/\s+/g, "")) ||
      /from\("sections"\)\s*\.insert\(/.test(mock),
    "mock createSections must write the `sections` table"
  );
  assert(/exam_id: examId,/.test(mock), "mock rows key on exam_id");
  assert(
    /time_minutes: r\.time_minutes \?\? 60,/.test(mock),
    "mock rows must carry time_minutes (mandatory in the modal; 60 is only the type-level net)"
  );
  assert(
    /requiresSectionTime: true,/.test(mock),
    "mock adapter must demand a time so the modal renders the mandatory minutes inputs"
  );
});

test("live adapter inserts into `live_sections` and NEVER sends time", () => {
  const live = SOURCES.slice(SOURCES.indexOf("export const liveExamJsonSource"));
  assert(
    /createSections: async \(examId, rows\)/.test(live),
    "live adapter must implement createSections"
  );
  assert(
    /from\("live_sections"\)\s*\.insert\(/.test(live) ||
      /from\("live_sections"\)\.insert\(/.test(live.replace(/\s+/g, " ")),
    "live createSections must write the `live_sections` table"
  );
  assert(/live_exam_id: examId,/.test(live), "live rows key on live_exam_id");
  const insertBlock = live.slice(
    live.indexOf("createSections"),
    live.indexOf("requiresSectionTime")
  );
  assert(
    !/time_minutes/.test(insertBlock),
    "live_sections has no time column — sending time_minutes 400s every live import"
  );
  assert(
    /requiresSectionTime: false,/.test(live),
    "live adapter must not demand a time — live timing is per-question time_seconds from the JSON"
  );
});

// ─── [3] The dialog — re-parse or import nothing ─────────────────────────────
console.log("\n[3] Dialog flow");

test("raw file text is kept when the preview opens", () => {
  assert(
    /setReport\(result\);\s*setRawJsonText\(text\);/.test(DIALOG),
    "handleFileChosen must stash the raw text — the parser skips question validation in unmatched sections, so matching them later REQUIRES a re-parse"
  );
});

test("create → reload sections → re-parse, in that order", () => {
  const handler = DIALOG.slice(
    DIALOG.indexOf("const handleCreateSections"),
    DIALOG.indexOf("// ─── Derived values for preview view")
  );
  const createIdx = handler.indexOf("await dataSource.createSections(examId, rows)");
  const reloadIdx = handler.indexOf("await loadStatus()");
  const reparseIdx = handler.indexOf("parseExamJson(rawJsonText,");
  assert(createIdx !== -1, "handler must call dataSource.createSections");
  assert(reloadIdx !== -1, "handler must reload sections after creating");
  assert(reparseIdx !== -1, "handler must re-parse the stashed raw text");
  assert(
    createIdx < reloadIdx && reloadIdx < reparseIdx,
    "order must be create → reload → re-parse; re-parsing against the stale section list re-reports the same mismatch"
  );
  assert(
    /examSectionsForLanguage: byLang\[lang\] \?\? \[\]/.test(handler),
    "re-parse must use the FRESH section list returned by loadStatus, not the stale state closure"
  );
});

test("old snips are dropped after a re-match so auto-snip covers new sections", () => {
  const handler = DIALOG.slice(
    DIALOG.indexOf("const handleCreateSections"),
    DIALOG.indexOf("// ─── Derived values for preview view")
  );
  assert(
    /setSnipResults\(\(prev\) => \{[\s\S]*?revokeObjectURL[\s\S]*?return new Map\(\);/.test(handler),
    "snip results must be cleared (and object URLs revoked) — the snip effect early-returns when snipResults.size > 0, so newly matched sections' images would never be cut"
  );
});

test("Create is blocked until every mock section has a whole 1–999 minute time", () => {
  assert(
    /const isValidMinutes = \(v: string \| undefined\): boolean =>/.test(DIALOG) ||
      /const isValidMinutes = \(v: string \| undefined\)/.test(DIALOG),
    "expected the isValidMinutes guard"
  );
  assert(
    /Number\.isInteger\(n\) && n >= 1 && n <= 999/.test(DIALOG),
    "minutes must be a whole number between 1 and 999"
  );
  assert(
    /!dataSource\.requiresSectionTime \|\|\s*unmatchedForCreate\.every\(\(u\) => isValidMinutes\(sectionTimeDrafts\[u\.name\]\)\)/.test(
      DIALOG
    ),
    "allSectionTimesValid must gate on EVERY unmatched section (and pass automatically for live)"
  );
  assert(
    /disabled=\{creatingSections \|\| !allSectionTimesValid \|\| unmatchedForCreate\.length === 0\}/.test(
      DIALOG
    ),
    "the modal's Create button must be disabled until all times are valid"
  );
});

test("the fast-fix button exists and only for PRIMARY uploads", () => {
  const panel = DIALOG.slice(
    DIALOG.indexOf("{/* Section-name mismatch panel */}"),
    DIALOG.indexOf("{/* Exam-only sections info */}")
  );
  assert(
    /\{report\.isPrimary && \(/.test(panel),
    "the create button must be gated on report.isPrimary — sections born from a secondary upload have no primary questions to pair with"
  );
  assert(
    /onCreateSectionsClick/.test(panel),
    "the mismatch panel must expose the create-sections button"
  );
});

test("cancel writes nothing — createSections is reachable only from the handler", () => {
  // Exactly one call site in the dialog: inside handleCreateSections. The
  // modal's Cancel/X paths only flip showCreateSections.
  const calls = DIALOG.match(/dataSource\.createSections\(/g) || [];
  assert(
    calls.length === 1,
    `expected exactly 1 call to dataSource.createSections in the dialog, found ${calls.length}`
  );
  assert(
    /onClick=\{\(\) => setShowCreateSections\(false\)\}/.test(DIALOG),
    "Cancel must only close the modal"
  );
});

test("stale drafts can't leak: create-flow state resets when the dialog opens", () => {
  const openEffect = DIALOG.slice(
    DIALOG.indexOf('setView("languages");'),
    DIALOG.indexOf("loadStatus();")
  );
  assert(
    /setRawJsonText\(null\);/.test(openEffect),
    "raw text must reset on open"
  );
  assert(
    /setShowCreateSections\(false\);/.test(openEffect),
    "modal visibility must reset on open"
  );
  assert(
    /setSectionTimeDrafts\(\{\}\);/.test(openEffect),
    "minutes drafts must reset on open"
  );
});

test("unmatched list keeps JSON order and question counts", () => {
  assert(
    /report\?\.perSection\s*\.filter\(\(s\) => s\.matchedSectionId === null\)\s*\.map\(\(s\) => \(\{ name: s\.jsonName, questionCount: s\.questionCountInJson \}\)\)/.test(
      DIALOG
    ),
    "unmatchedForCreate must derive from perSection (JSON order) with per-section question counts for the modal rows"
  );
});

// ─── [4] Both exam types get the feature ─────────────────────────────────────
console.log("\n[4] Both exam types");

test("mock exam page feeds the dialog the mock adapter", () => {
  assert(
    /dataSource=\{mockExamJsonSource\}/.test(MOCK_PAGE),
    "ExamDetail must wire mockExamJsonSource"
  );
});

test("live exam page feeds the dialog the live adapter", () => {
  assert(
    /dataSource=\{liveExamJsonSource\}/.test(LIVE_PAGE),
    "LiveExamDetail must wire liveExamJsonSource"
  );
});

// ─── [5] The page behind the dialog must not need a browser refresh ─────────
console.log("\n[5] Page sync — no browser refresh needed");

test("dialog fires onSectionsChanged after creating and after renaming", () => {
  assert(
    /onSectionsChanged\?: \(\) => void \| Promise<void>;/.test(DIALOG),
    "the dialog must expose an onSectionsChanged prop"
  );
  const createHandler = DIALOG.slice(
    DIALOG.indexOf("const handleCreateSections"),
    DIALOG.indexOf("// ─── Derived values for preview view")
  );
  assert(
    /void onSectionsChanged\?\.\(\);/.test(createHandler),
    "creating sections must notify the page behind the modal"
  );
  const renameHandler = DIALOG.slice(
    DIALOG.indexOf("const handleRenameSection"),
    DIALOG.indexOf("useEffect(() => {")
  );
  assert(
    /void onSectionsChanged\?\.\(\);/.test(renameHandler),
    "inline renames must notify the page too — commitLiveJson only resyncs names when an import actually runs"
  );
});

test("both pages define refreshSectionsFromDb and hand it to the dialog", () => {
  for (const [name, page] of [["ExamDetail", MOCK_PAGE], ["LiveExamDetail", LIVE_PAGE]]) {
    assert(
      /const refreshSectionsFromDb = async \(\)/.test(page),
      `${name} must define refreshSectionsFromDb`
    );
    assert(
      /onSectionsChanged=\{refreshSectionsFromDb\}/.test(page),
      `${name} must pass refreshSectionsFromDb to the dialog`
    );
  }
});

test("refreshSectionsFromDb keeps the active section when it survives", () => {
  for (const [name, page] of [["ExamDetail", MOCK_PAGE], ["LiveExamDetail", LIVE_PAGE]]) {
    const helper = page.slice(
      page.indexOf("const refreshSectionsFromDb"),
      page.indexOf("const handleSaveExam") !== -1 &&
        page.indexOf("const handleSaveExam") > page.indexOf("const refreshSectionsFromDb")
        ? page.indexOf("const handleSaveExam")
        : page.indexOf("const handleAddSection")
    );
    assert(
      /const stillActive = /.test(helper) && /stillActive\b/.test(helper),
      `${name}: a resync must not yank the creator out of the section they're editing`
    );
  }
});

test("mock commitJson resolves siblings from a FRESH read, not page state", () => {
  const commit = MOCK_PAGE.slice(
    MOCK_PAGE.indexOf("const commitJson = async ("),
    MOCK_PAGE.indexOf("// ─── Auto-snip retry from the persisted image_region ───")
  );
  assert(
    /const \{ data: freshSecRows, error: freshSecErr \} = await supabase\s*\.from\("sections"\)/.test(
      commit
    ),
    "commitJson must re-read sections at start — dialog-created sections aren't in the page's cached list"
  );
  // Comment text may mention allSections; CODE must not read it.
  const codeOnly = commit
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  assert(
    !/\ballSections\b/.test(codeOnly),
    "no code path in commitJson may read the stale allSections — that silently skips second-language placeholder propagation for sections created in the dialog"
  );
  assert(
    /await refreshSectionsFromDb\(\);/.test(commit),
    "a successful import must resync the page's section list"
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n    ${f.error}`);
  process.exit(1);
}
