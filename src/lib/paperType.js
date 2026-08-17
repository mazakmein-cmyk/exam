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
