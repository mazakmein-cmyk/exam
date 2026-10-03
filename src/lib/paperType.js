/**
 * paperType.js — what KIND of paper an exam is: a mock, or a real previous-year
 * paper.
 *
 * Pure logic only (no supabase, no React) so it can be exercised directly in
 * node — same split as timingGroups.js / timingGroupSettings.ts. The DB reads
 * and writes live in src/lib/paperTypeSettings.ts.
 *
 * Two rules carry the whole feature:
 *
 *  1. ABSENT MEANS MOCK. A row from a database without the migration, a row
 *     written by a creator who was never granted the field, a null, a typo, a
 *     value from a future release — all read as "mock". The student-side filter
 *     therefore never has a third bucket to hide papers in, and a library built
 *     before this feature existed keeps showing every paper it always showed.
 *
 *  2. THE KEY IS NOT THE LABEL. 'pyq' is what the column stores and what a
 *     shareable filter URL carries; "Previous Year Paper" is what a human
 *     reads. Keeping them apart means the wording can be rewritten without
 *     touching a single row.
 */

export const PAPER_TYPE_MOCK = "mock";
export const PAPER_TYPE_PYQ = "pyq";

/** What an exam is when nobody chose — see rule 1 above. */
export const DEFAULT_PAPER_TYPE = PAPER_TYPE_MOCK;

/** The column on `exams`. Exported here so the tests and the settings module agree. */
export const PAPER_TYPE_COLUMN = "paper_type";

/**
 * The choices, in the order they are offered. `description` is the one-line
 * hint under the picker; `shortLabel` is for chips and filter pills where the
 * full label does not fit.
 */
export const PAPER_TYPES = [
  {
    value: PAPER_TYPE_MOCK,
    label: "Mock Exam",
    shortLabel: "Mock",
    description: "A practice paper you wrote yourself.",
  },
  {
    value: PAPER_TYPE_PYQ,
    label: "Previous Year Paper",
    shortLabel: "PYQ",
    description: "A paper that was actually set in a past exam.",
  },
];

/** Just the keys — handy for validation and for iterating in tests. */
export const PAPER_TYPE_VALUES = PAPER_TYPES.map((t) => t.value);

/**
 * Coerce anything into a valid paper type. Trims and lower-cases so a value
 * that took a detour through a URL ("PYQ", " pyq ") still lands.
 */
export function normalizePaperType(value) {
  if (typeof value !== "string") return DEFAULT_PAPER_TYPE;
  const key = value.trim().toLowerCase();
  return PAPER_TYPE_VALUES.includes(key) ? key : DEFAULT_PAPER_TYPE;
}

/**
 * Read the type off an already-fetched exam row. An absent column (migration
 * not applied yet) reads as mock, which is what such a database can serve.
 */
export function readPaperType(examRow) {
  const row = examRow ?? {};
  return normalizePaperType(row[PAPER_TYPE_COLUMN]);
}

/** Human label for a key. Unknown keys fall back to the default's label. */
export function paperTypeLabel(value) {
  const key = normalizePaperType(value);
  return PAPER_TYPES.find((t) => t.value === key).label;
}

/** Short label for chips and pills. */
export function paperTypeShortLabel(value) {
  const key = normalizePaperType(value);
  return PAPER_TYPES.find((t) => t.value === key).shortLabel;
}

/** One-line hint shown under the picker. */
export function paperTypeDescription(value) {
  const key = normalizePaperType(value);
  return PAPER_TYPES.find((t) => t.value === key).description;
}

/** `{ label, value }[]` for the dropdown components. */
export function paperTypeFilterOptions() {
  return PAPER_TYPES.map((t) => ({ label: t.label, value: t.value }));
}

/**
 * Does this exam pass the library's type filter?
 *
 * An empty selection means "no filter" — every paper passes. Anything else is
 * an OR over the selected keys, read through readPaperType so pre-migration
 * rows behave as mocks rather than vanishing from the list.
 */
export function matchesPaperTypeFilter(examRow, selected) {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  const wanted = selected.map(normalizePaperType);
  return wanted.includes(readPaperType(examRow));
}

/**
 * Parse the library's `?type=` parameter. Accepts repeated params and comma
 * lists (`?type=mock&type=pyq`, `?type=mock,pyq`) — the same shape the category
 * filter accepts — and drops anything that is not a real key, so a hand-edited
 * URL degrades to "no filter" instead of an empty library.
 *
 * Takes a URLSearchParams (or anything with getAll) to stay free of react-router.
 */
export function parsePaperTypeParam(params) {
  if (!params || typeof params.getAll !== "function") return [];
  const values = params
    .getAll("type")
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim().toLowerCase())
    .filter((v) => PAPER_TYPE_VALUES.includes(v));
  return Array.from(new Set(values));
}

/* ════════════════════════════════════════════════════════════════════════
 * THE YEAR — which year's paper is this?
 *
 * Lives in this module rather than its own because it is not an independent
 * field: a year only means anything on a previous-year paper. Keeping the two
 * together makes that pairing enforceable in one function
 * (effectivePaperYear), which is what every write and every read goes through.
 *
 * Its column arrives by a SEPARATE hand-pasted migration
 * (20260917000000_add_exam_paper_year.sql), so "absent" has to behave: a row
 * with no paper_year reads as "no year", exactly like every paper that existed
 * before the field did. Those are never backfilled from the title — a numeral
 * in a title is a guess, and a guess behind a student's filter is worse than
 * a blank.
 * ════════════════════════════════════════════════════════════════════════ */

/** The column on `exams`. Exported so the tests and the settings module agree. */
export const PAPER_YEAR_COLUMN = "paper_year";

/** The oldest year the picker offers. */
export const PAPER_YEAR_MIN = 1990;

/**
 * The newest year a STORED value may hold — the CHECK constraint's bound, not
 * the picker's. Reading is deliberately more generous than choosing: a reader
 * whose clock is wrong (or who loads the page on New Year's Eve) must still see
 * the year a creator legitimately picked.
 */
export const PAPER_YEAR_MAX = 2100;

/** This year, as the picker's upper bound. Split out so tests can pin it. */
export function currentPaperYear() {
  return new Date().getFullYear();
}

/**
 * The years a creator may choose, newest first — 2026, 2025, … 1990. Newest
 * first because that is where nearly every paper being added actually sits;
 * 1990 is reachable by scrolling, which is the right cost for a 35-year-old
 * paper.
 */
export function paperYearOptions(now = currentPaperYear()) {
  const newest = Math.max(now, PAPER_YEAR_MIN);
  const years = [];
  for (let year = newest; year >= PAPER_YEAR_MIN; year--) years.push(year);
  return years;
}

/** `{ label, value }[]` for the dropdown components. Values are strings. */
export function paperYearSelectOptions(now = currentPaperYear()) {
  return paperYearOptions(now).map((year) => ({ label: String(year), value: String(year) }));
}

/**
 * Coerce anything into a stored year, or null. Accepts the string form the
 * picker and the URL both carry ("2024"), and rejects everything that is not a
 * whole year inside the constraint's range — so a hand-edited ?year=, a float,
 * or a value from a future release degrades to "no year" rather than to an
 * error.
 */
export function normalizePaperYear(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const year = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(year)) return null;
  return year >= PAPER_YEAR_MIN && year <= PAPER_YEAR_MAX ? year : null;
}

/** Does a paper of this type need a year? Only a previous-year paper does. */
export function requiresPaperYear(paperType) {
  return normalizePaperType(paperType) === PAPER_TYPE_PYQ;
}

/**
 * The year to STORE for a (type, year) pair — null for a mock, whatever was
 * picked for a PYQ.
 *
 * This is the pairing rule, and it is the only copy of it. Every write goes
 * through it, so a mock can never carry a year; every read goes through it too
 * (see readPaperYear), so even a row written by some other client cannot put a
 * year on a mock in front of a student.
 */
export function effectivePaperYear(paperType, year) {
  return requiresPaperYear(paperType) ? normalizePaperYear(year) : null;
}

/**
 * Read the year off an already-fetched exam row, or null. An absent column
 * (migration not applied, or the library's optional-column fallback dropped it)
 * reads as no year — which is what such a database can serve.
 */
export function readPaperYear(examRow) {
  const row = examRow ?? {};
  return effectivePaperYear(row[PAPER_TYPE_COLUMN], row[PAPER_YEAR_COLUMN]);
}

/**
 * Does this exam pass the library's year filter?
 *
 * An empty (or entirely unparseable) selection means "no filter". Otherwise it
 * is an OR over the selected years, and a paper with no year — every mock, and
 * every PYQ tagged before this field existed — does NOT pass. That is the
 * honest answer: the reader asked for a specific year and the paper does not
 * claim one.
 */
export function matchesPaperYearFilter(examRow, selected) {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  const wanted = selected.map(normalizePaperYear).filter((year) => year !== null);
  if (wanted.length === 0) return true;
  const year = readPaperYear(examRow);
  return year !== null && wanted.includes(year);
}

/**
 * Parse the library's `?year=` parameter. Accepts repeated params and comma
 * lists (`?year=2024&year=2023`, `?year=2024,2023`) — the same shape the
 * category and type filters accept — and drops anything that is not a year the
 * column could hold, so a hand-edited URL degrades to "no filter" instead of an
 * empty library. Returns strings, because that is what the dropdown and the URL
 * both speak.
 */
export function parsePaperYearParam(params) {
  if (!params || typeof params.getAll !== "function") return [];
  const values = params
    .getAll("year")
    .flatMap((v) => String(v).split(","))
    .map((v) => normalizePaperYear(v))
    .filter((year) => year !== null)
    .map(String);
  return Array.from(new Set(values));
}

/**
 * The picker's string for a year value — "" when there is none.
 *
 * Shared because the create dialog, the editor and the editor's DIRTY CHECK
 * all have to agree on it: a stray `String(null)` in any one of them would
 * read as an unsaved change that no amount of saving could clear.
 */
export function paperYearPickerValue(year) {
  const normalized = normalizePaperYear(year);
  return normalized === null ? "" : String(normalized);
}

/**
 * What a (type, year) pair would be STORED as, in the picker's own spelling.
 * This is the value the dirty check compares, so that flipping the type to
 * Mock and back — which changes nothing a save would write — does not leave
 * the form looking unsaved.
 */
export function storedPaperYearValue(paperType, year) {
  return paperYearPickerValue(effectivePaperYear(paperType, year));
}
