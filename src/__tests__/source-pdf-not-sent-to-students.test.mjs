/**
 * THE SOURCE QUESTION PAPER IS NOT SENT TO STUDENTS
 *
 * Run with: node src/__tests__/source-pdf-not-sent-to-students.test.mjs
 *
 * WHAT WAS BROKEN (doc #27)
 * Every student-facing sections fetch used `select("*")` — give me every column
 * — and on both exam types some of those columns describe the source paper:
 *
 *   live_sections.pdf_url   `{creator user id}/{exam id}/{section id}/{ts}.pdf`,
 *                           so the URL carries the creator's account UUID.
 *   sections.pdf_url        the mock path keeps the ORIGINAL FILE NAME, so the
 *                           URL can read `.../SSC-MTS-2025-Set-A-FINAL.pdf`.
 *   sections.pdf_name       that file name on its own. Written once by
 *                           CreateExamDialog and read by nothing at all.
 *
 * No student component reads any of them. They were on the wire purely because
 * nobody narrowed the query.
 *
 * The file is not reachable — exam-pdfs is created with `public = false`, so the
 * link 403s for anyone who is not its owner. The reason to stop sending it
 * anyway is that this one bucket setting is the whole protection, and the
 * project also runs a PUBLIC bucket for question images: the safety of the
 * arrangement rests on nobody ever confusing the two.
 *
 * THE TRAP IN FIXING IT
 * `sections.timing_group_id` is applied BY HAND and is load-bearing on exactly
 * these pages — resolveTimingGroupIds reads it off these rows. Omitting it from
 * a named list does not error: it quietly resolves every section to no group,
 * and multi-section timed "parts" collapse into per-section timers. Naming it on
 * an un-migrated database fails the whole query instead. So the list has to be
 * decided at runtime, which is what tableHasColumn already exists for.
 */

import { readFileSync, readdirSync } from "fs";
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
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const COLS = read("src/lib/sectionColumns.ts");
const COLS_CODE = strip(COLS);
const SERVICE = read("src/services/liveExamService.ts");
const SERVICE_CODE = strip(SERVICE);

/**
 * Every page a STUDENT can reach that reads `sections`.
 *
 * Analytics was missed on the first pass of this fix, which is why the list is
 * spelled out here rather than left to whoever is editing at the time: it is a
 * creator-flavoured page name on a plain `/analytics` route that students use,
 * and it carried the same `select("*")` with the same timing_group_id comment as
 * the other three. The audit below re-derives the list from the routes so a
 * fifth page cannot be forgotten the same way.
 */
const STUDENT_PAGES = [
  ["exam runner", "src/pages/ExamSimulator.tsx"],
  ["exam intro", "src/pages/ExamIntro.tsx"],
  ["exam review", "src/pages/ExamReview.tsx"],
  ["analytics", "src/pages/Analytics.tsx"],
];

/** Pages only a creator can reach, which legitimately keep the wide select. */
const CREATOR_ONLY = [
  "src/pages/ExamDetail.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/ManualFixEditor.tsx",
  "src/components/PublishExamDialog.tsx",
];

console.log("\n══ The source paper stays with the creator ══");

// ─── [1] Mock exams ─────────────────────────────────────────────────────────
console.log("\n[1] Mock exams: no wide sections read on the student path");

test("neither paper column is in the student column list", () => {
  assert(/pdf_url/.test(COLS) , "the file should explain what it is withholding");
  assert(
    !/"[^"]*pdf_url[^"]*"/.test(COLS_CODE),
    "pdf_url must not appear in the selected columns"
  );
  assert(
    !/"[^"]*pdf_name[^"]*"/.test(COLS_CODE),
    "pdf_name is written once and read nowhere — pure leak"
  );
});

test("every column the pages actually use is still selected", () => {
  for (const col of [
    "id", "exam_id", "name", "language", "section_group_id",
    "sort_order", "time_minutes", "total_questions",
  ]) {
    assert(
      new RegExp(`\\b${col}\\b`).test(COLS_CODE),
      `${col} is read on the student path; dropping it breaks the runner rather than protecting anything`
    );
  }
});

test("every student page uses the narrow list", () => {
  for (const [name, path] of STUDENT_PAGES) {
    const src = strip(read(path));
    const wide = src.match(/from\("sections"\)\s*\n?\s*\.select\("\*"\)/g) || [];
    assert(wide.length === 0, `${name} still reads sections with select("*")`);
    assert(
      /studentSectionColumns\(\)/.test(src),
      `${name} must resolve its column list at runtime`
    );
  }
});

test("no student-reachable file reads sections wide — swept, not listed", () => {
  // The listed pages above are the ones known to matter. THIS is the check that
  // would have caught Analytics on the first pass: walk every source file,
  // find the ones that read `sections` with select("*"), and require each to be
  // a page a student cannot open. A fifth page cannot be forgotten the way the
  // fourth was.
  const walk = (dir) =>
    readdirSync(resolve(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return walk(rel);
      return /\.tsx?$/.test(e.name) ? [rel] : [];
    });

  /**
   * Does this file read `sections` with a wide select?
   *
   * Matched per QUERY, not by a character window. The first version scanned 240
   * characters after `from("sections")` and flagged ExamSimulator, whose
   * sections queries are fine — the `select("*")` it found belonged to the
   * questions view a few lines below. A window that can jump a query boundary
   * reports the wrong file and, worse, would hide a real one behind the noise.
   */
  const readsSectionsWide = (src) => {
    const re = /from\("sections"\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const after = src.slice(m.index + m[0].length);
      const selIdx = after.search(/\.select\(/);
      if (selIdx === -1) continue;
      // A later `.from(` before any `.select(` means this call chains its
      // columns elsewhere; the select we found belongs to a different query.
      const nextFrom = after.search(/\.from\(/);
      if (nextFrom !== -1 && nextFrom < selIdx) continue;
      const arg = (after.slice(selIdx).match(/\.select\(\s*([^,)]*)/) || [])[1] || "";
      if (arg.trim() === '"*"') return true;
    }
    return false;
  };

  const offenders = walk("src").filter((rel) => {
    if (CREATOR_ONLY.includes(rel)) return false;
    return readsSectionsWide(strip(read(rel)));
  });

  assert(
    offenders.length === 0,
    `these read sections with select("*") and are not on the creator-only list, so they ship pdf_url/pdf_name to whoever opens them: ${offenders.join(", ")}`
  );
});

test("the same sweep for live_sections", () => {
  // fetchLiveSections keeps select("*") on purpose for the creator's editor, so
  // the rule here is about who CALLS it, not about the select itself.
  const page = strip(read("src/pages/LiveExamStudent.tsx"));
  assert(
    !/\bfetchLiveSections\(/.test(page),
    "the live student page must not call the wide sections fetch"
  );
});

// ─── [2] The timing-group trap ──────────────────────────────────────────────
console.log("\n[2] Timing groups still work, on both sides of the migration");

test("the hand-migrated column is named only when it exists", () => {
  assert(
    /tableHasColumn\("sections", "timing_group_id"\)/.test(COLS_CODE),
    "resolveTimingGroupIds reads timing_group_id off these rows, so omitting it silently collapses every timed part into per-section timers; naming it pre-migration fails the whole query"
  );
  assert(
    /timing_group_id/.test(COLS_CODE.split("BASE_COLUMNS")[2] || COLS_CODE),
    "the column has to be appended when the probe says yes"
  );
});

test("the probe is the cached one, not a new request per load", () => {
  assert(
    /from "@\/lib\/dbFeatures"/.test(COLS_CODE),
    "tableHasColumn caches per session and evicts on a transient failure; a hand-rolled probe would repeat on every exam open"
  );
});

test("it is resolved before the batch, not inside it", () => {
  for (const [name, path] of STUDENT_PAGES) {
    const src = strip(read(path));
    const decl = src.indexOf("const sectionCols = await studentSectionColumns()");
    const use = src.indexOf('select(sectionCols as "*")');
    assert(decl >= 0, `${name} never resolves the column list`);
    assert(decl < use, `${name} uses the list before resolving it`);
  }
});

test("the cast is documented, because it is a deliberate inaccuracy", () => {
  // supabase-js infers row shape from the LITERAL type of the select string, so
  // a runtime string types every row as GenericStringError and every
  // `section.id` becomes a compile error. `as "*"` restores the Row type and, in
  // exchange, claims two fields are present that will be undefined.
  assert(
    /as "\*"/.test(COLS) || /as "\*"/.test(strip(read("src/pages/ExamIntro.tsx"))),
    "the cast should exist at the call sites"
  );
  assert(
    /GenericStringError/.test(COLS),
    "why the cast is needed belongs next to the column list, not in a commit message"
  );
});

// ─── [3] Live exams ─────────────────────────────────────────────────────────
console.log("\n[3] Live exams: a separate narrow fetch");

test("there is a student-facing sections fetch", () => {
  assert(
    /export async function fetchLiveSectionsStudent/.test(SERVICE_CODE),
    "the wide fetchLiveSections is still needed by creators"
  );
  assert(
    !/pdf_url/.test(
      SERVICE_CODE.slice(
        SERVICE_CODE.indexOf("export async function fetchLiveSectionsStudent"),
        SERVICE_CODE.indexOf("export async function createLiveSection")
      )
    ),
    "the student fetch must not name pdf_url"
  );
});

test("the student page and the student question fetch both use it", () => {
  const page = strip(read("src/pages/LiveExamStudent.tsx"));
  assert(
    !/\bfetchLiveSections\(/.test(page),
    "the student page must not call the wide fetch at all"
  );
  assert(
    (page.match(/fetchLiveSectionsStudent\(/g) || []).length >= 2,
    "both the join and the language switch fetch sections"
  );
  const qfetch = SERVICE_CODE.slice(
    SERVICE_CODE.indexOf("export async function fetchAllLiveQuestionsStudent"),
    SERVICE_CODE.indexOf("export async function fetchAllLiveQuestionsStudent") + 400
  );
  assert(
    /fetchLiveSectionsStudent\(examId, language\)/.test(qfetch),
    "it only takes section ids, so the narrow fetch does everything the wide one did"
  );
});

test("the creator's own paths keep pdf_url", () => {
  // The editor reads it for PDF snipping and the download button, and
  // duplicateLiveExam copies it onto the new exam's sections. Narrowing the
  // shared fetch would have broken both.
  const editor = strip(read("src/pages/LiveExamDetail.tsx"));
  assert(
    /\bfetchLiveSections\(/.test(editor),
    "the creator's editor must still use the wide fetch"
  );
  assert(
    /pdf_url/.test(editor),
    "and must still be able to read pdf_url"
  );
  assert(
    /select\("\*"\)/.test(
      SERVICE_CODE.slice(
        SERVICE_CODE.indexOf("export async function fetchLiveSections("),
        SERVICE_CODE.indexOf("export async function fetchLiveSectionsStudent")
      )
    ),
    "fetchLiveSections itself is unchanged"
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
console.log("  Candidates no longer hold a link to the paper they are sitting.\n");
