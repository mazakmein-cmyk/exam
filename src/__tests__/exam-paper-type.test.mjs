/**
 * PAPER TYPE — "is this a mock, or a real previous-year paper?"
 *
 * Run with: node src/__tests__/exam-paper-type.test.mjs
 *
 * An optional two-value field on an exam, a per-creator grant that decides who
 * may even see it, and a filter on the student library. Four properties carry
 * the whole feature:
 *
 *  1. ABSENT MEANS MOCK. A row from a database without the migration, a null, a
 *     typo, a value from a future release — all read as 'mock'. There is no
 *     third bucket, so the student-side filter can never hide a paper that was
 *     published before this feature existed.
 *  2. OFF UNTIL GRANTED. Access starts false and every failure path (no
 *     session, no profile row, missing column, network drop) is also false. A
 *     creator without the grant sees no field in the create dialog and none in
 *     the editor.
 *  3. A HIDDEN FIELD IS NEVER WRITTEN. The editor's save includes paper_type
 *     only when the creator was granted it AND the column exists — because
 *     naming an unknown column fails the WHOLE update and would take the title,
 *     description and instructions down with it.
 *  4. THE MIGRATION IS HAND-PASTED. Every write gates on tableHasColumn, and
 *     the reads that feed the library must not name the column in a select.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  DEFAULT_PAPER_TYPE,
  PAPER_TYPES,
  PAPER_TYPE_MOCK,
  PAPER_TYPE_PYQ,
  PAPER_TYPE_VALUES,
  matchesPaperTypeFilter,
  normalizePaperType,
  paperTypeFilterOptions,
  paperTypeLabel,
  paperTypeShortLabel,
  parsePaperTypeParam,
  readPaperType,
} from "../lib/paperType.js";

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

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readSql(name) {
  return readFileSync(resolve(ROOT, "supabase/migrations", name), "utf-8");
}

const CREATE_DIALOG = readSrc("components/CreateExamDialog.tsx");
const EDITOR = readSrc("pages/ExamDetail.tsx");
const LIBRARY = readSrc("pages/Marketplace.tsx");
const SETTINGS = readSrc("lib/paperTypeSettings.ts");
const ADMIN = readSrc("pages/AdminDashboard.tsx");
const FIELD = readSrc("components/exam/PaperTypeSelect.tsx");
const MIGRATION = readSql("20260825000000_add_exam_paper_type.sql");

console.log("\n📋 PAPER TYPE\n");

// ─── 1. Absent means mock ───────────────────────────────────────────────────
console.log("1. absent means mock");

test("exactly two types, mock first and default", () => {
  assertEqual(PAPER_TYPE_VALUES.length, 2, "the field is a two-way choice");
  assertEqual(PAPER_TYPE_VALUES[0], PAPER_TYPE_MOCK, "mock is offered first");
  assertEqual(DEFAULT_PAPER_TYPE, PAPER_TYPE_MOCK, "an untagged paper is a mock");
});

test("every absent-ish value reads as mock", () => {
  for (const row of [undefined, null, {}, { paper_type: null }, { paper_type: "" }]) {
    assertEqual(readPaperType(row), PAPER_TYPE_MOCK, `${JSON.stringify(row)} should read as mock`);
  }
});

test("an unknown or future value reads as mock rather than throwing", () => {
  assertEqual(readPaperType({ paper_type: "sample_paper" }), PAPER_TYPE_MOCK);
  assertEqual(normalizePaperType(42), PAPER_TYPE_MOCK);
  assertEqual(paperTypeLabel("nonsense"), "Mock Exam", "the label falls back with the value");
});

test("a value that took a detour through a URL still lands", () => {
  assertEqual(normalizePaperType(" PYQ "), PAPER_TYPE_PYQ);
  assertEqual(normalizePaperType("Mock"), PAPER_TYPE_MOCK);
});

test("labels are separate from stored keys", () => {
  assertEqual(paperTypeLabel(PAPER_TYPE_PYQ), "Previous Year Paper");
  assertEqual(paperTypeShortLabel(PAPER_TYPE_PYQ), "PYQ");
  for (const t of PAPER_TYPES) {
    assert(t.value !== t.label, `${t.value} must not store its own label`);
    assert(t.description.length > 0, `${t.value} needs a hint under the picker`);
  }
});

// ─── 2. The library filter ──────────────────────────────────────────────────
console.log("\n2. the library filter");

test("no selection is no filter", () => {
  assert(matchesPaperTypeFilter({ paper_type: PAPER_TYPE_PYQ }, []), "empty selection shows all");
  assert(matchesPaperTypeFilter({}, undefined), "a missing selection is not a filter");
});

test("filtering for mocks keeps the pre-migration rows", () => {
  assert(matchesPaperTypeFilter({}, [PAPER_TYPE_MOCK]), "a row with no paper_type is a mock");
  assert(
    !matchesPaperTypeFilter({}, [PAPER_TYPE_PYQ]),
    "and it is NOT a previous-year paper"
  );
});

test("filtering for previous-year papers is exact", () => {
  assert(matchesPaperTypeFilter({ paper_type: "pyq" }, [PAPER_TYPE_PYQ]));
  assert(!matchesPaperTypeFilter({ paper_type: "mock" }, [PAPER_TYPE_PYQ]));
});

test("selecting both types shows everything, including untagged rows", () => {
  const both = [PAPER_TYPE_MOCK, PAPER_TYPE_PYQ];
  for (const row of [{}, { paper_type: "mock" }, { paper_type: "pyq" }, { paper_type: "junk" }]) {
    assert(matchesPaperTypeFilter(row, both), `${JSON.stringify(row)} should pass`);
  }
});

test("?type= accepts repeats and comma lists, and drops junk", () => {
  const repeated = new URLSearchParams("type=mock&type=pyq");
  assertEqual(parsePaperTypeParam(repeated).join(","), "mock,pyq");

  const comma = new URLSearchParams("type=PYQ,mock");
  assertEqual(parsePaperTypeParam(comma).join(","), "pyq,mock");

  const junk = new URLSearchParams("type=previous_year&type=");
  assertEqual(
    parsePaperTypeParam(junk).length,
    0,
    "an unrecognized key must degrade to no filter, never to an empty library"
  );

  assertEqual(parsePaperTypeParam(new URLSearchParams("type=pyq&type=pyq")).length, 1, "deduped");
});

test("both options are always offered, not derived from what is published", () => {
  const options = paperTypeFilterOptions();
  assertEqual(options.length, 2);
  assertEqual(options[1].value, PAPER_TYPE_PYQ);
  assertEqual(options[1].label, "Previous Year Paper");
});

// ─── 3. Off until granted ───────────────────────────────────────────────────
console.log("\n3. off until granted");

test("access starts false in the hook", () => {
  const HOOK = readSrc("hooks/use-paper-type-access.ts");
  assertContains(
    HOOK,
    "useState(false)",
    "the first paint must already be the un-granted layout"
  );
});

test("every access failure path returns false", () => {
  // no column, no session, no row, and a thrown error all end in `return false`
  const body = SETTINGS.slice(SETTINGS.indexOf("export async function fetchPaperTypeAccess"));
  const fn = body.slice(0, body.indexOf("\n}\n"));
  assertContains(fn, "if (!(await tableHasColumn(", "probe the column first");
  assertContains(fn, "if (!user) return false;", "no session is a no");
  assertContains(fn, "maybeSingle()", "an account mid-onboarding has no profile row");
  assertContains(fn, "if (error || !data) return false;", "no row is a no, not an error");
  assertContains(fn, "} catch {\n    return false;", "a thrown error is a no");
  assertEqual(
    (fn.match(/return true/g) || []).length,
    0,
    "nothing in here may shortcut to granted"
  );
});

test("the create dialog renders the field only when granted", () => {
  assertContains(CREATE_DIALOG, "const { canSetPaperType } = usePaperTypeAccess();");
  assertContains(
    CREATE_DIALOG,
    "{canSetPaperType && (",
    "a creator without the grant must not see the field at all"
  );
  assert(
    CREATE_DIALOG.indexOf("{canSetPaperType && (") < CREATE_DIALOG.indexOf("<PaperTypeSelect"),
    "the gate has to wrap the control, not sit after it"
  );
});

test("the editor renders the field only when granted", () => {
  assertContains(EDITOR, "const { canSetPaperType } = usePaperTypeAccess();");
  assert(
    EDITOR.indexOf("{canSetPaperType && (") < EDITOR.indexOf("<PaperTypeSelect"),
    "the exam editor must hide the field for an un-granted creator"
  );
});

test("the picker never decides its own visibility", () => {
  // Comments stripped: the file explains the rule in prose, and the rule is
  // about the CODE.
  const code = FIELD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert(
    !code.includes("usePaperTypeAccess") && !code.includes("canSetPaperType"),
    "the control must stay dumb — the caller decides whether to render it, so there is one place to get the gate wrong instead of two"
  );
});

test("the admin console sets the grant explicitly, never toggles it", () => {
  assertContains(ADMIN, "admin_set_paper_type_access", "one RPC, told the state we want");
  assertContains(ADMIN, "allow,", "the desired state travels with the call");
  assert(
    !ADMIN.includes("admin_toggle_paper_type_access"),
    "a toggle would let a double-click flip the grant back"
  );
  assertContains(
    ADMIN,
    "20260825000000_add_exam_paper_type.sql",
    "pre-migration the RPC is missing — say which file to paste"
  );
});

// ─── 4. A hidden field is never written ─────────────────────────────────────
console.log("\n4. a hidden field is never written");

test("the editor's save gates on the grant AND the column", () => {
  assertContains(
    EDITOR,
    "const paperTypePatch = canSetPaperType ? await paperTypeUpdatePatch(paperType) : {};",
    "an editor that cannot show the value must not rewrite it"
  );
  assertContains(EDITOR, "...paperTypePatch,", "the patch is spread, so {} writes nothing");
});

test("a dropped write keeps its old baseline so the field stays dirty", () => {
  assertContains(EDITOR, "paper_type: paperTypeDropped ? initialExamDataRef.current.paper_type : paperType,");
  assertContains(EDITOR, "Paper type not saved", "the creator is told, not silently ignored");
});

test("both create paths send a paper type through the gated patch", () => {
  assertEqual(
    (CREATE_DIALOG.match(/await paperTypeInsertPatch\(/g) || []).length,
    2,
    "the PDF path and the plain path both create exams"
  );
  assertEqual(
    (CREATE_DIALOG.match(/\.\.\.paperTypePatch,/g) || []).length,
    2,
    "each insert must spread its patch"
  );
  assertContains(
    CREATE_DIALOG,
    "canSetPaperType ? paperType : DEFAULT_PAPER_TYPE",
    "an un-granted creator always creates a mock"
  );
});

test("duplicating an exam copies the source row's type, not UI state", () => {
  for (const [file, src] of [
    ["pages/ExamDetail.tsx", EDITOR],
    ["pages/Dashboard.tsx", readSrc("pages/Dashboard.tsx")],
  ]) {
    assertContains(src, "paperTypeCopyPatch(exam)", `${file} must carry the type onto the copy`);
    assertContains(src, "...paperPatch,", `${file} must spread it into the insert`);
  }
});

test("every DB write in the settings module gates on the column", () => {
  const writers = SETTINGS.match(/export async function \w+/g) || [];
  assert(writers.length >= 4, "expected the patch/save helpers to be exported");
  // hasPaperTypeColumn() is the gate; paperTypeUpdatePatch delegates to the
  // insert patch, so it inherits it.
  assertEqual(
    (SETTINGS.match(/hasPaperTypeColumn\(\)/g) || []).length >= 4,
    true,
    "each write path needs its own probe"
  );
  assertContains(SETTINGS, 'return { ok: false, reason: "missing-migration" }');
});

test("the search box only matches the non-default type label", () => {
  assertContains(
    LIBRARY,
    "readPaperType(exam) === PAPER_TYPE_PYQ &&",
    "every untagged paper reads as \"Mock Exam\" — letting that label match would return the whole library for a query of \"m\""
  );
});

test("the library reads with select(*) and never names the column", () => {
  assert(
    /\.from\("exams"\)\s*\.select\("\*"\)/.test(LIBRARY),
    "the published-exams read must stay select(*) so paper_type rides along when it exists"
  );
  assert(
    !/select\([^)]*paper_type/.test(LIBRARY),
    "naming paper_type in a select would empty the library pre-migration"
  );
});

// ─── 5. The migration ───────────────────────────────────────────────────────
console.log("\n5. the migration");

test("exams.paper_type is NOT NULL, defaults to mock, and is constrained", () => {
  assertContains(MIGRATION, "ADD COLUMN IF NOT EXISTS paper_type text;");
  assertContains(MIGRATION, "UPDATE public.exams SET paper_type = 'mock' WHERE paper_type IS NULL;");
  assertContains(MIGRATION, "ALTER COLUMN paper_type SET DEFAULT 'mock'");
  assertContains(MIGRATION, "ALTER COLUMN paper_type SET NOT NULL");
  assertContains(MIGRATION, "CHECK (paper_type IN ('mock', 'pyq'))");
});

test("the grant column is off for everyone", () => {
  assertContains(MIGRATION, "ADD COLUMN IF NOT EXISTS can_set_paper_type boolean;");
  assertContains(MIGRATION, "ALTER COLUMN can_set_paper_type SET DEFAULT false");
  assertContains(MIGRATION, "SET can_set_paper_type = false WHERE can_set_paper_type IS NULL");
});

test("the setter is admin-only and never mints a profile row", () => {
  assertContains(MIGRATION, "RAISE EXCEPTION 'Access Denied: Admin privileges required.'");
  assertContains(MIGRATION, "UPDATE public.profiles");
  assert(
    !/INSERT INTO public\.profiles/i.test(MIGRATION),
    "a bare profile row minted here would skip the onboarding modal and leave the account with no username"
  );
});

test("the admin user list carries the grant", () => {
  assertContains(MIGRATION, "DROP FUNCTION IF EXISTS admin_get_all_users();");
  assertContains(MIGRATION, "coalesce(p.can_set_paper_type, false) AS can_set_paper_type");
  // The columns the console already renders must survive the rewrite.
  for (const col of ["is_verified", "last_sign_in_at", "exams_created", "exams_attempted", "phone"]) {
    assertContains(MIGRATION, col, `admin_get_all_users lost ${col}`);
  }
});

test("PostgREST is told to reload, and the paste verifies itself", () => {
  assertContains(MIGRATION, "NOTIFY pgrst, 'reload schema';");
  assertContains(MIGRATION, "RAISE EXCEPTION 'exams.paper_type missing after migration'");
  assertContains(MIGRATION, "RAISE EXCEPTION 'profiles.can_set_paper_type missing after migration'");
});

test("the public profile view is left alone", () => {
  assert(
    !/CREATE VIEW public\.public_profiles/i.test(MIGRATION),
    "who may tag a PYQ is not public information"
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
