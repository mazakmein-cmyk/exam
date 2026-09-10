/**
 * STRUCTURE LIVES IN THE PRIMARY LANGUAGE
 *
 * Run with: node src/__tests__/structure-lives-in-primary.test.mjs
 *
 * The owner's rule: a question or section existing, its order, and whether a
 * question is excluded are decided in the PRIMARY language and mirrored to every
 * translation. A secondary language edits content only.
 *
 * What this pins, and the failure each guard closes:
 *   - ManualFixEditor's exclude wrote one language row, so the Hindi cohort kept
 *     answering a question the English cohort never saw (and the creator's
 *     per-question pool went lopsided, then mislabelled a heading in Hindi).
 *   - Two add paths (ManualFixEditor, the AI add) inserted a lone row with no
 *     group id and no twin, leaving the translated paper a question short.
 *   - Section add / delete / reorder were reachable from a secondary tab.
 *   - Live sections were all born "New Section" and the student breakdown
 *     grouped by that name, merging two sections into one row.
 *   - "View all" appeared when only collapsed rows were "hidden".
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
    console.log(`     -> ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const count = (src, needle) => src.split(needle).length - 1;

// Some sources are CRLF on this Windows checkout; the multi-line anchors below
// are written with \n, so normalise once here rather than per assertion.
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf-8").replace(/\r\n/g, "\n");

const DETAIL = read("src/pages/ExamDetail.tsx");
const MANUAL = read("src/pages/ManualFixEditor.tsx");
const TWINS = read("src/lib/questionTwins.ts");
const SORTABLE = read("src/components/SortableSectionItem.tsx");
const LIVE_STUDENT = read("src/pages/LiveExamStudent.tsx");
const LIVE_DETAIL = read("src/pages/LiveExamDetail.tsx");
const ANALYTICS = read("src/pages/Analytics.tsx");

console.log("\nSTRUCTURE LIVES IN THE PRIMARY LANGUAGE\n");

// ─── The shared helper ──────────────────────────────────────────────────────

test("one helper defines the twin placeholder and the mirror", () => {
  for (const fn of ["createTwinPlaceholders", "fetchSiblingSectionIds", "mirrorToTwins"]) {
    assert(TWINS.includes(`export async function ${fn}(`), `${fn} must be exported from lib/questionTwins`);
  }
  // The placeholder shape ExamDetail always created.
  assert(TWINS.includes('text: ""'), "a placeholder is empty text for the translator to fill");
  assert(TWINS.includes("requires_review: true"), "a placeholder needs review");
  assert(TWINS.includes("is_excluded: false"), "a placeholder is served until excluded on the primary");
  assert(TWINS.includes("question_group_id: primary.question_group_id"), "a placeholder is linked to its primary");
});

test("a mirror can never reach another exam's rows", () => {
  assert(
    TWINS.includes('.eq("question_group_id", questionGroupId)') && TWINS.includes('.in("section_id", siblingSectionIds)'),
    "mirrorToTwins must be scoped to the sibling sections, not the group id alone"
  );
  assert(
    TWINS.includes("if (!questionGroupId || siblingSectionIds.length === 0) return;"),
    "a legacy row with no group id has no twins and must be left alone"
  );
});

// ─── Every add path creates twins through it ────────────────────────────────

test("all three add paths create twins through the shared helper", () => {
  assert(DETAIL.includes('import { createTwinPlaceholders } from "@/lib/questionTwins";'), "ExamDetail must import the helper");
  assert(count(DETAIL, "await createTwinPlaceholders(data as any, siblingIds);") === 2, "handleAddQuestion AND handleAddAiQuestion must both create twins");
  assert(!DETAIL.includes("// Empty placeholder — translator fills content"), "the hand-rolled placeholder block must be gone");
  assert(MANUAL.includes("await createTwinPlaceholders(data as any, siblingSectionIds);"), "ManualFixEditor's add must create twins too");
});

test("the AI add now links its row to a group", () => {
  assert(
    DETAIL.includes("question_group_id: isMultiLang ? crypto.randomUUID() : null,"),
    "an AI-added question inserted a lone row with no group id — the translated paper came out a question short"
  );
});

// ─── Exclude mirrors ────────────────────────────────────────────────────────

test("excluding a question on the primary excludes its twins", () => {
  assert(
    MANUAL.includes('if ("is_excluded" in updates && isPrimarySection) {') &&
      MANUAL.includes("is_excluded: updates.is_excluded,"),
    "the exclude flag is structural and must reach every language"
  );
});

test("finalised order mirrors from the primary and is never written from a translation", () => {
  assert(MANUAL.includes("final_order: finalOrder,") && MANUAL.includes("is_finalized: true,\n          });"), "primary finalise must mirror final_order to twins");
  assert(MANUAL.includes('.update({ is_finalized: true })'), "a secondary finalise records completion only");
});

// ─── Secondary language is content-only ─────────────────────────────────────

test("ManualFixEditor knows whether its section is primary", () => {
  assert(
    MANUAL.includes('.select("name, pdf_url, language, section_group_id, exam:exams(user_id, primary_language)")'),
    "the section fetch must carry language, group id and the exam's primary language"
  );
  assert(MANUAL.includes("setIsPrimarySection(sectionLang === primaryLang);"), "primary is decided by comparing section language to exam primary");
});

test("ManualFixEditor disables structure on a secondary section", () => {
  assert(count(MANUAL, "disabled={!isPrimarySection}") >= 2, "add and exclude must be disabled on a translation");
  assert(MANUAL.includes("disabled={!isPrimarySection || index === 0}"), "move up must be disabled on a translation");
  assert(MANUAL.includes("disabled={!isPrimarySection || index === questions.length - 1}"), "move down must be disabled on a translation");
  assert(MANUAL.includes("if (!isPrimarySection) {") && MANUAL.includes("Questions are added in the primary language"), "the add handler itself must refuse, not just the button");
});

test("ExamDetail refuses structure changes from a secondary tab in the handlers, not just the UI", () => {
  assert(DETAIL.includes("const refuseStructureOnSecondary = (what: string): boolean =>"), "one guard for every structural handler");
  assert(count(DETAIL, 'if (refuseStructureOnSecondary("Sections")) return;') >= 2, "add section and section drag must be guarded");
  assert(DETAIL.includes('if (refuseStructureOnSecondary("Sections")) {\n      setDeleteSectionId(null);'), "delete section must be guarded and close its dialog");
  assert(count(DETAIL, 'if (refuseStructureOnSecondary("Questions")) return;') >= 2, "question drag and the AI add must be guarded");
  assert(DETAIL.includes('if (refuseStructureOnSecondary("Questions")) return false;'), "add question must be guarded");
  assert(DETAIL.includes('if (refuseStructureOnSecondary("Questions")) {\n      setDeleteQuestionId(null);'), "delete question must be guarded and close its dialog");
});

test("ExamDetail disables the section controls on a secondary tab", () => {
  assert(count(DETAIL, "disabled={addingSection || (isMultiLang && !isPrimaryLanguage)}") === 2, "both Add Section buttons");
  assert(DETAIL.includes("<SortableSectionItem key={s.id} id={s.id} disabled={isMultiLang && !isPrimaryLanguage}>"), "section drag handle");
  assert(DETAIL.includes("handleDeleteSectionClick(s.id);\n                              }}\n                              disabled={isMultiLang && !isPrimaryLanguage}"), "section delete button");
  assert(SORTABLE.includes("useSortable({ id, disabled })"), "SortableSectionItem must honour disabled, like SortableQuestionItem");
});

// ─── Live: identity, not name ───────────────────────────────────────────────

test("live sections are born with distinct names, numbered across every language", () => {
  assert(LIVE_DETAIL.includes("await createLiveSection(liveExamId, newSectionName, sortOrder, lang, sectionGroupId);"), "the numbered name must be what gets created");
  assert(LIVE_DETAIL.includes("const usedNumbers = new Set(\n        allSections"), "numbering must scan every language, not the active tab");
  assert(!LIVE_DETAIL.includes('createLiveSection(liveExamId, "New Section",'), "the bare default must be gone");
});

test("the live student breakdown groups by section identity", () => {
  assert(LIVE_STUDENT.includes('const key = q.live_section_id || "general";'), "rows must key on the section id");
  assert(LIVE_STUDENT.includes('sectionNameById.get(q.live_section_id) || q.section_label || "General"'), "the live row's current name beats the denormalised label");
  assert(LIVE_STUDENT.includes("<div key={s.key}>"), "React keys must be the identity, or two same-named sections collide");
  assert(!LIVE_STUDENT.includes("sectionBreakdown.map(([label, s])"), "the name-keyed shape must be gone");
});

// ─── View all only when something on screen is hidden ───────────────────────

test("collapsed sections do not count toward the header's View all", () => {
  assert(
    ANALYTICS.includes("collapsedSections.has(section.sectionKey)\n        ? n\n        : n + (section.questions.length - visibleRowCounts[i])"),
    "hiddenRowCount must skip collapsed sections — View all would paint nothing there"
  );
  // The STABLE budget is deliberately NOT refunded: collapse must never reflow another section.
  assert(
    ANALYTICS.includes("questionSections.map(s => expandedSections.has(s.sectionKey))"),
    "allocateRows must still receive expandedSections, not collapsedSections"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}\n    ${f.error}`);
  console.log("-".repeat(60));
  process.exit(1);
}
console.log("-".repeat(60) + "\n");
