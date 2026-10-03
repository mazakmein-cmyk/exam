/**
 * PAPER YEAR — "which year's paper is this?"
 *
 * Run with: node src/__tests__/exam-paper-year.test.mjs
 *
 * The year is not an independent field. It is the second half of paper_type:
 * only a previous-year paper has one, it is REQUIRED once a paper claims to be
 * one, and the student library filters by it. Five properties carry it:
 *
 *  1. A MOCK HAS NO YEAR. Not at write time, not at read time. One function
 *     (effectivePaperYear) decides this, and both directions go through it, so
 *     a stray value in the column cannot reach a student's filter.
 *  2. ABSENT MEANS NO YEAR — never a guess. A paper tagged before this field
 *     existed keeps an empty year; the numeral in its title is NOT promoted
 *     into the column, because a guess behind a filter is worse than a blank.
 *  3. REQUIRED ONLY WHERE VISIBLE. The field is demanded exactly when it is
 *     shown: granted creator + column present + the paper is a PYQ. A rule the
 *     creator cannot see is a save they cannot complete.
 *  4. THE FILTER CANNOT GO INVISIBLE. The year dropdown exists only alongside
 *     the "Previous Year Paper" tick. Dropping that tick drops the years, in
 *     the state AND in the URL.
 *  5. THE MIGRATION IS HAND-PASTED, AND LATER THAN THE TYPE'S. Every write
 *     gates on its own column probe, and the library's column fallback must be
 *     able to drop the year WITHOUT dropping paper_type with it.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  PAPER_YEAR_COLUMN,
  PAPER_YEAR_MAX,
  PAPER_YEAR_MIN,
  currentPaperYear,
  effectivePaperYear,
  matchesPaperYearFilter,
  normalizePaperYear,
  normalizePaperYearMax,
  paperYearOptions,
  paperYearOptionsFor,
  paperYearPickerValue,
  paperYearSelectOptions,
  parsePaperYearParam,
  readPaperYear,
  requiresPaperYear,
  storedPaperYearValue,
} from "../lib/paperType.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
/** CRLF on a Windows checkout — normalise so multi-line needles below match. */
const CRLF = new RegExp(String.fromCharCode(13) + String.fromCharCode(10), "g");
const NL = String.fromCharCode(10);
const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf8").replace(/\r\n/g, "\n");

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || "Mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) throw new Error(message || `Expected to contain: "${substring}"`);
}

const CREATE_DIALOG = readSrc("components/CreateExamDialog.tsx");
const EDITOR = readSrc("pages/ExamDetail.tsx");
const LIBRARY = readSrc("pages/Marketplace.tsx");
const SETTINGS = readSrc("lib/paperTypeSettings.ts");
const ACCESS_HOOK = readSrc("hooks/use-paper-type-access.ts");
const PICKER = readSrc("components/exam/PaperYearSelect.tsx");
const ADMIN = readSrc("pages/AdminDashboard.tsx");
const APP_SETTINGS = readSrc("lib/appSettings.ts");
const CEILING_MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260918000000_app_settings_paper_year_max.sql"),
  "utf8"
).replace(CRLF, NL);
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260917000000_add_exam_paper_year.sql"),
  "utf8"
).replace(/\r\n/g, "\n");

// ─── 1. A mock has no year ──────────────────────────────────────────────────
console.log("\n1. a mock has no year, in both directions");

test("only a previous-year paper requires one", () => {
  assertEqual(requiresPaperYear("pyq"), true);
  assertEqual(requiresPaperYear("mock"), false);
  // Everything unknown reads as a mock (normalizePaperType), so nothing
  // unknown can demand a year either.
  assertEqual(requiresPaperYear(null), false);
  assertEqual(requiresPaperYear("something-from-the-future"), false);
});

test("the value a mock would STORE is null, whatever the picker holds", () => {
  assertEqual(effectivePaperYear("mock", 2024), null);
  assertEqual(effectivePaperYear("mock", "2024"), null);
  assertEqual(effectivePaperYear("pyq", 2024), 2024);
  assertEqual(effectivePaperYear("pyq", "2024"), 2024);
});

test("a year sitting on a row tagged as a mock is ignored on READ", () => {
  // Belt and braces for the one thing a DB constraint cannot express without
  // breaking unrelated updates (see the migration's header).
  assertEqual(readPaperYear({ paper_type: "mock", paper_year: 2024 }), null);
  assertEqual(readPaperYear({ paper_type: "pyq", paper_year: 2024 }), 2024);
});

// ─── 2. Absent means no year, never a guess ─────────────────────────────────
console.log("\n2. absent means no year — never a guess");

test("a row from a database without the column reads as no year", () => {
  assertEqual(readPaperYear({ paper_type: "pyq" }), null);
  assertEqual(readPaperYear({}), null);
  assertEqual(readPaperYear(null), null);
  assertEqual(readPaperYear(undefined), null);
});

test("junk normalises to null rather than to a number", () => {
  for (const junk of [null, undefined, "", "   ", "abc", "20x4", NaN, 2024.5, {}, []]) {
    assertEqual(normalizePaperYear(junk), null, `${JSON.stringify(junk)} is not a year`);
  }
});

test("the stored range is the constraint's range, not the picker's", () => {
  assertEqual(normalizePaperYear(PAPER_YEAR_MIN), PAPER_YEAR_MIN);
  assertEqual(normalizePaperYear(PAPER_YEAR_MAX), PAPER_YEAR_MAX);
  assertEqual(normalizePaperYear(PAPER_YEAR_MIN - 1), null);
  assertEqual(normalizePaperYear(PAPER_YEAR_MAX + 1), null);
  // Reading is deliberately MORE generous than choosing: a reader whose clock
  // disagrees with the creator's must still see the year that was picked.
  assert(
    PAPER_YEAR_MAX > currentPaperYear(),
    "a stored year must survive a reader whose clock is ahead of the picker"
  );
});

test("the migration does NOT backfill a year from anywhere", () => {
  assert(
    !/UPDATE public\.exams SET paper_year/i.test(MIGRATION),
    "a year invented from a title would be fabricated data behind a student's filter"
  );
  assert(
    !/ALTER COLUMN paper_year SET NOT NULL/i.test(MIGRATION),
    "every paper that already exists must be allowed to have no year"
  );
  assert(
    !/paper_year integer\s+NOT NULL|SET DEFAULT/i.test(MIGRATION),
    "a default would quietly give every future mock a year too"
  );
});

// ─── 3. The picker ──────────────────────────────────────────────────────────
console.log("\n3. the picker runs from this year back to 1990");

test("newest first, 1990 last, no gaps", () => {
  const years = paperYearOptions(2026);
  assertEqual(years[0], 2026, "this year is the first thing under the cursor");
  assertEqual(years[years.length - 1], PAPER_YEAR_MIN, "1990 is the oldest offered");
  assertEqual(years.length, 2026 - PAPER_YEAR_MIN + 1, "every year in between is offered");
  for (let i = 1; i < years.length; i++) {
    assertEqual(years[i], years[i - 1] - 1, "descending, one year at a time");
  }
});

test("the range follows the clock, so next January needs no code change", () => {
  assertEqual(paperYearOptions(2031)[0], 2031);
  assert(paperYearOptions().includes(currentPaperYear()), "this year must be choosable today");
});

test("dropdown options are {label, value} strings", () => {
  const options = paperYearSelectOptions(2026);
  assertEqual(options[0].label, "2026");
  assertEqual(options[0].value, "2026");
});

test("there is no empty option — a year is cleared by changing the TYPE", () => {
  assert(
    !/SelectItem[^>]*value=""/.test(PICKER),
    'an empty SelectItem is a runtime error in Radix, and "no year" is not a choice on a PYQ'
  );
  // Radix shows the placeholder for "" just as it does for undefined
  // (shouldShowPlaceholder), so the control can stay controlled for its whole
  // life instead of switching over on the first pick.
  assertContains(PICKER, "<Select value={value} onValueChange={onChange}");
});

test("the picker string round-trips, and null never becomes the text 'null'", () => {
  assertEqual(paperYearPickerValue(null), "");
  assertEqual(paperYearPickerValue(2024), "2024");
  assertEqual(paperYearPickerValue("2024"), "2024");
  // The dirty check compares these strings. "null" would read as an unsaved
  // change that no amount of saving could ever clear.
  assertEqual(storedPaperYearValue("mock", "2024"), "");
  assertEqual(storedPaperYearValue("pyq", "2024"), "2024");
});

// ─── 4. Required only where it is visible ───────────────────────────────────
console.log("\n4. required exactly where it is visible");

test("visibility is the grant AND the column AND the paper being a PYQ", () => {
  assertContains(
    ACCESS_HOOK,
    "setCanSetPaperYear(allowed && yearColumn);",
    "a required field whose column does not exist would block the creator's save"
  );
  for (const [file, src] of [
    ["components/CreateExamDialog.tsx", CREATE_DIALOG],
    ["pages/ExamDetail.tsx", EDITOR],
  ]) {
    assertContains(
      src,
      "const needsPaperYear = canSetPaperYear && requiresPaperYear(paperType);",
      `${file} must derive one condition and use it for both the field and the rule`
    );
    assertContains(src, "{needsPaperYear && (", `${file} must render the field on that condition`);
    assertContains(
      src,
      "if (needsPaperYear && normalizePaperYear(paperYear) === null) {",
      `${file} must block the save on the SAME condition that showed the field`
    );
  }
});

test("both create paths validate, not just the one with the form", () => {
  assertEqual(
    (CREATE_DIALOG.match(/if \(needsPaperYear && normalizePaperYear\(paperYear\) === null\) \{/g) || [])
      .length,
    2,
    "the PDF upload path creates an exam too"
  );
  assertEqual(
    (CREATE_DIALOG.match(/await paperYearInsertPatch\(/g) || []).length,
    2,
    "and both must send the year through the gated patch"
  );
  assertEqual(
    (CREATE_DIALOG.match(/\.\.\.paperYearPatch,/g) || []).length,
    2,
    "each insert must spread its patch"
  );
});

test("the editor enforces it on a paper tagged BEFORE the field existed", () => {
  // Those rows load with an empty year by design (property 2). The editor is
  // where they get one, so the rule has to live on save, not only on create.
  assertContains(
    EDITOR,
    "setPaperYear(paperYearPickerValue(readPaperYear(examData)));",
    "the editor must load the stored year, empty included"
  );
  const save = EDITOR.split("const handleSaveExam")[1] || "";
  assert(save, "handleSaveExam should exist");
  assertContains(
    save,
    "if (needsPaperYear && normalizePaperYear(paperYear) === null) {",
    "saving a PYQ with no year has to be refused"
  );
});

test("a flip to Mock and back is not an unsaved change", () => {
  // The picker keeps its value across a type change (so the creator does not
  // have to re-pick), which means the dirty check must compare what would be
  // WRITTEN, not what is held.
  assertContains(
    EDITOR,
    "storedPaperYearValue(paperType, paperYear) !== initialExamDataRef.current.paper_year",
    "comparing the raw picker value would leave the form permanently dirty"
  );
  assertEqual(storedPaperYearValue("mock", "2024"), storedPaperYearValue("mock", ""));
});

test("a dropped write keeps its old baseline, and says so", () => {
  assertContains(EDITOR, "paper_year: paperYearDropped");
  assertContains(EDITOR, "Year not saved", "the creator is told, not silently ignored");
  assertContains(EDITOR, "PAPER_YEAR_MIGRATION", "and told WHICH file to paste");
});

test("turning a PYQ back into a mock can still clear the year it leaves behind", () => {
  // Gated on canSetPaperType, NOT on needsPaperYear: the moment the type flips
  // to mock, needsPaperYear is false, and gating on it would skip the very
  // write that clears the orphaned year.
  assertContains(
    EDITOR,
    "const paperYearPatch = canSetPaperType\n        ? await paperYearUpdatePatch(paperType, paperYear)\n        : {};"
  );
  // savePaperType is the one write that moves the type with no picker beside
  // it, so it carries the same clearing itself.
  assertContains(SETTINGS, "if (!requiresPaperYear(value) && (await hasPaperYearColumn())) {");
  assertContains(SETTINGS, "patch[PAPER_YEAR_COLUMN] = null;");
});

test("duplicating an exam carries the year off the SOURCE row", () => {
  for (const [file, src] of [
    ["pages/ExamDetail.tsx", EDITOR],
    ["pages/Dashboard.tsx", readSrc("pages/Dashboard.tsx")],
  ]) {
    assertContains(src, "paperYearCopyPatch(exam)", `${file} must carry the year onto the copy`);
    assertContains(src, "...paperYearPatch,", `${file} must spread it into the insert`);
  }
});

// ─── 5. The student-side filter ─────────────────────────────────────────────
console.log("\n5. the library filter cannot go invisible");

test("an empty selection is no filter; a chosen year excludes the yearless", () => {
  const pyq2024 = { paper_type: "pyq", paper_year: 2024 };
  const pyqNoYear = { paper_type: "pyq" };
  const mock = { paper_type: "mock" };

  for (const exam of [pyq2024, pyqNoYear, mock]) {
    assertEqual(matchesPaperYearFilter(exam, []), true, "no selection filters nothing");
    assertEqual(matchesPaperYearFilter(exam, null), true, "neither does a missing selection");
  }

  assertEqual(matchesPaperYearFilter(pyq2024, ["2024"]), true);
  assertEqual(matchesPaperYearFilter(pyq2024, ["2023", "2024"]), true, "several years are an OR");
  assertEqual(matchesPaperYearFilter(pyq2024, ["2023"]), false);
  // A paper that claims no year does not match a reader who asked for one.
  assertEqual(matchesPaperYearFilter(pyqNoYear, ["2024"]), false);
  assertEqual(matchesPaperYearFilter(mock, ["2024"]), false);
});

test("a selection of nothing but junk is no filter, not an empty library", () => {
  assertEqual(matchesPaperYearFilter({ paper_type: "pyq", paper_year: 2024 }, ["banana"]), true);
});

test("?year= accepts repeats and comma lists, and drops what cannot be a year", () => {
  const parse = (qs) => parsePaperYearParam(new URLSearchParams(qs));
  assertEqual(JSON.stringify(parse("year=2024")), JSON.stringify(["2024"]));
  assertEqual(JSON.stringify(parse("year=2024&year=2023")), JSON.stringify(["2024", "2023"]));
  assertEqual(JSON.stringify(parse("year=2024,2023")), JSON.stringify(["2024", "2023"]));
  assertEqual(JSON.stringify(parse("year=2024&year=2024")), JSON.stringify(["2024"]), "de-duped");
  assertEqual(JSON.stringify(parse("year=banana&year=1200")), JSON.stringify([]));
  assertEqual(JSON.stringify(parse("")), JSON.stringify([]));
  assertEqual(JSON.stringify(parsePaperYearParam(null)), JSON.stringify([]));
});

test("a ?year= that arrives without ?type=pyq is dropped on the way in", () => {
  assertContains(
    LIBRARY,
    "parsePaperTypeParam(searchParams).includes(PAPER_TYPE_PYQ)\n            ? parsePaperYearParam(searchParams)\n            : []",
    "a year filter with no visible control is a library hiding papers for no visible reason"
  );
});

test("unticking Previous Year Paper clears the years, in state AND in the URL", () => {
  assertContains(LIBRARY, "const keepYears = next.includes(PAPER_TYPE_PYQ);");
  assertContains(LIBRARY, "if (!keepYears) setSelectedYears([]);");
  assertContains(LIBRARY, 'if (!keepYears) params.delete("year");', "a copied link must not resurrect it");
});

test("the dropdown is offered only beside its tick, and only with something in it", () => {
  assertContains(
    LIBRARY,
    "selectedPaperTypes.includes(PAPER_TYPE_PYQ) && yearOptions.length > 0;",
    "a pre-migration library has no years to offer and must not show an empty dropdown"
  );
  assertContains(LIBRARY, "{showYearFilter && (");
});

test("the options come from what is published, plus whatever is selected", () => {
  // Same reasoning as the category list: an option you cannot see is an option
  // you cannot switch back off. Offering 1990..today would be ~37 mostly-empty
  // rows, which is why this one is derived rather than fixed.
  assertContains(LIBRARY, "const years = new Set<string>(selectedYears);");
  assertContains(LIBRARY, ".sort((a, b) => Number(b) - Number(a))", "newest first");
});

test("the year filter is ANDed with the rest, and is in the memo's deps", () => {
  assertContains(LIBRARY, "const paperYearMatch = matchesPaperYearFilter(exam, selectedYears);");
  assertContains(LIBRARY, "return textMatch && filterMatch && paperTypeMatch && paperYearMatch;");
  assertContains(
    LIBRARY,
    "}, [exams, searchQuery, selectedCategories, selectedPaperTypes, selectedYears]);",
    "a filter missing from the deps is a filter that only applies after the next keystroke"
  );
});

test("the empty state names the years, and Show all clears them", () => {
  assertContains(LIBRARY, "...selectedYears,");
  assertContains(LIBRARY, "selectedYears.length > 0", "an active year filter counts as an active filter");
  assertContains(LIBRARY, "handleYearChange([]);");
});

test("the card says which year, when the paper claims one", () => {
  assertContains(LIBRARY, "const paperYear = readPaperYear(exam);");
  assertContains(LIBRARY, '`Previous Year Paper · ${paperYear}` : "Previous Year Paper"');
});

test("the stored year outranks the numeral guessed from a title", () => {
  const FETCH = readSrc("lib/publishedExams.ts");
  assertContains(FETCH, "const stored = readPaperYear(exam);");
  assertContains(FETCH, "if (stored !== null) return stored;");
  assert(
    FETCH.indexOf("const stored = readPaperYear(exam);") <
      FETCH.indexOf("const match = exam.name.match("),
    "the title is the FALLBACK — a fact must not lose to a guess"
  );
});

// ─── 6. The migration is hand-pasted, and later than the type's ─────────────
console.log("\n6. the migration is hand-pasted, and later than the type's");

test("every year write gates on its OWN column probe", () => {
  for (const fn of ["paperYearInsertPatch", "paperYearCopyPatch"]) {
    const body = SETTINGS.split(`export async function ${fn}`)[1] || "";
    assert(body, `${fn} should exist`);
    assertContains(
      body.split("\n}")[0],
      "if (!(await hasPaperYearColumn())) return {};",
      `${fn} must return an empty patch rather than fail the whole write`
    );
  }
  assertContains(
    SETTINGS,
    'export const PAPER_YEAR_MIGRATION = "20260917000000_add_exam_paper_year.sql";',
    "the editor quotes this filename at the creator when a write is dropped"
  );
});

test("the year's probe is separate from the type's — they are different migrations", () => {
  assertContains(SETTINGS, 'return tableHasColumn("exams", PAPER_YEAR_COLUMN);');
  assertContains(SETTINGS, 'return tableHasColumn("exams", PAPER_TYPE_COLUMN);');
  assertEqual(PAPER_YEAR_COLUMN, "paper_year");
});

test("the library can drop paper_year WITHOUT dropping paper_type with it", () => {
  // The user's own database is in exactly this state until the new SQL is
  // pasted: paper_type applied, paper_year not. An all-or-nothing fallback
  // would un-ship the working half of the feature.
  const HELPER = readSrc("lib/examListQuery.ts");
  assertContains(
    HELPER,
    'export const EXAM_LIST_OPTIONAL_COLUMNS = ["paper_type", "paper_year"];',
    "oldest migration first — the fallback drops from the END"
  );
  assertContains(HELPER, "count -= 1;", "one column at a time, not all of them at once");
  assert(
    !/select\(\s*"[^"]*paper_year/.test(LIBRARY) && !/select\(\s*"[^"]*paper_year/.test(readSrc("lib/publishedExams.ts")),
    "hardcoding the column into a select string would empty the library pre-migration"
  );
});

test("the column is nullable, range-checked, and announced to PostgREST", () => {
  assertContains(MIGRATION, "ADD COLUMN IF NOT EXISTS paper_year integer;");
  assertContains(MIGRATION, "CHECK (paper_year IS NULL OR (paper_year BETWEEN 1990 AND 2100))");
  assertContains(MIGRATION, "NOTIFY pgrst, 'reload schema';");
  assertContains(MIGRATION, "RAISE EXCEPTION 'exams.paper_year missing after migration'");
});

test("the constraint spans one column only", () => {
  // A cross-column CHECK ("a mock must have no year") would turn savePaperType
  // — which writes paper_type on its own — into a failure on any row the app
  // had not already cleaned up. The pairing lives in effectivePaperYear.
  assert(
    !/CHECK[^;]*paper_type[^;]*paper_year|CHECK[^;]*paper_year[^;]*paper_type/i.test(MIGRATION),
    "a constraint spanning both columns would break unrelated updates"
  );
});

test("the migration adds no index for a filter that runs in the browser", () => {
  assert(
    !/CREATE INDEX/i.test(MIGRATION),
    "the library filters client-side over the list it already fetched — an index here is paid for by every write and read by nothing"
  );
});

// ─── 7. The admin-set ceiling ───────────────────────────────────────────────
console.log("");
console.log("7. how far ahead a paper may be dated is an admin setting");

test("the ceiling defaults to this year, so an unset database behaves as before", () => {
  assertEqual(paperYearOptionsFor(null, null)[0], currentPaperYear());
  assertEqual(paperYearOptionsFor(undefined, null)[0], currentPaperYear());
  // Junk in the jsonb column must not shrink or explode the list either.
  assertEqual(paperYearOptionsFor("banana", null)[0], currentPaperYear());
  assertEqual(paperYearOptionsFor(1200, null)[0], currentPaperYear());
});

test("an admin ceiling opens up the years ahead", () => {
  const years = paperYearOptionsFor(2028, null);
  assertEqual(years[0], 2028, "the ceiling is the first row under the cursor");
  assertEqual(years[1], 2027);
  assertEqual(years[years.length - 1], PAPER_YEAR_MIN, "1990 is still the floor");
});

test("a value above the ceiling is STILL offered, so lowering it blanks nothing", () => {
  // An admin walks the ceiling back from 2030 to this year. Every paper
  // already dated 2029 must keep showing 2029 in its picker: Radix renders the
  // placeholder when the value matches no item, which would read as "no year
  // chosen" on a paper that plainly has one — and the save now REFUSES a PYQ
  // with no year, so an unrelated edit would be blocked by a blank it did not
  // cause.
  const years = paperYearOptionsFor(currentPaperYear(), 2029);
  assert(years.includes(2029), "the value on screen must always be in the list");
  assertEqual(years[0], 2029, "and it sorts into place, newest first");
  // Without a value out of range, nothing is added.
  assert(!paperYearOptionsFor(currentPaperYear(), null).includes(2029));
});

test("the picker passes its own value in, which is what makes that work", () => {
  assertContains(
    PICKER,
    "paperYearOptionsFor(maxYear, value)",
    "building the list from the ceiling alone would drop the value on screen"
  );
  assertContains(PICKER, "const maxYear = usePaperYearMax();");
});

test("a ceiling in the past is refused — this year must always be datable", () => {
  assertEqual(normalizePaperYearMax(2030, 2026), 2030);
  assertEqual(normalizePaperYearMax(2026, 2026), 2026, "equal to this year is fine");
  assertEqual(normalizePaperYearMax(2025, 2026), null);
  assertEqual(normalizePaperYearMax(2101, 2026), null, "the column stops at 2100");
  assertEqual(normalizePaperYearMax("banana", 2026), null);
});

test("the RPC enforces the same floor server-side, not just the console", () => {
  assertContains(CEILING_MIGRATION, "IF next_year < this_year THEN");
  assertContains(CEILING_MIGRATION, "IF next_year > 2100 THEN");
  assertContains(
    CEILING_MIGRATION,
    "RAISE EXCEPTION 'Access Denied: Admin privileges required.'",
    "a settings RPC anyone could call is not a setting"
  );
  // now() is legal in a function body but not in a CHECK constraint, which is
  // exactly why the column's own bound had to settle for a flat 2100.
  assertContains(CEILING_MIGRATION, "extract(year from now())::integer");
});

test("the settings table is readable by all and writable by none", () => {
  assertContains(CEILING_MIGRATION, "ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;");
  assertContains(CEILING_MIGRATION, "FOR SELECT");
  assertContains(
    CEILING_MIGRATION,
    "REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;",
    "every write has to go through the admin RPC"
  );
  assert(
    !/CREATE POLICY[^;]*FOR (INSERT|UPDATE|DELETE|ALL)/i.test(CEILING_MIGRATION),
    "a write policy would let a signed-in user move the ceiling"
  );
});

test("no seed row — absent means this year, so there is no half-configured state", () => {
  assert(
    !/INSERT INTO public\.app_settings[^;]*paper_year_max[^;]*;(?![^$]*ON CONFLICT)/i.test(
      CEILING_MIGRATION.split("CREATE OR REPLACE FUNCTION")[0]
    ),
    "seeding a ceiling would start drifting the moment the calendar moved"
  );
  assertContains(APP_SETTINGS, "return null;", "a missing row, table or network is just 'not set'");
  assertContains(
    readSrc("lib/paperTypeSettings.ts"),
    "return normalizePaperYear(stored) ?? currentPaperYear();",
    "and 'not set' resolves to this year at the one place that reads it"
  );
});

test("a failed read is not cached, so a blip does not pin the default all session", () => {
  // Same contract as dbFeatures.tableHasColumn: memoise the answer, evict the
  // failure.
  // Both failure branches of the READ (a PostgREST error, and a thrown
  // exception) must evict; invalidateAppSetting's own delete is not one of them.
  const readBody = APP_SETTINGS.split("export function readAppSetting")[1].split(
    "export function invalidateAppSetting"
  )[0];
  assertEqual((readBody.match(/cache\.delete\(key\);/g) || []).length, 2);
  assertContains(APP_SETTINGS, "cache.set(key, hit");
  assertContains(APP_SETTINGS, "export function invalidateAppSetting");
});

test("saving in the console invalidates the memo, so the admin sees it at once", () => {
  assertContains(readSrc("lib/paperTypeSettings.ts"), "invalidateAppSetting(PAPER_YEAR_MAX_KEY);");
});

test("the console offers the one-click next year AND an explicit set", () => {
  assertContains(ADMIN, "handleSavePaperYearMax(paperYearMax + 1)", "the common case is one click");
  assertContains(ADMIN, "handleSavePaperYearMax(Number(paperYearDraft))", "and any year can be typed");
  // An explicit set, like the grants: the console knows the value it wants, so
  // a double-click cannot walk the ceiling twice.
  assert(
    !/admin_increment_paper_year|increment_paper_year_max/i.test(ADMIN),
    "an increment RPC would double-fire on a double-click"
  );
});

test("the console says which migration it needs, rather than leaking Postgres", () => {
  assertContains(ADMIN, "PAPER_YEAR_MAX_MIGRATION");
  assertContains(
    readSrc("lib/paperTypeSettings.ts"),
    "`Apply ${PAPER_YEAR_MAX_MIGRATION} first`"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
}
console.log("─".repeat(60) + "\n");
process.exit(failed > 0 ? 1 : 0);
