/**
 * examListQuery.ts — the column list the exam LIBRARY pages read, and the retry
 * that keeps a narrow list safe on a database whose migrations are pending.
 *
 * Why not `select("*")`, which is what both library pages used to do:
 * `exams` carries five long-text/JSONB columns that no card renders —
 * `instruction`, `exam_instruction`, and the three `*_translations` blobs. On a
 * multi-language paper those translations are the biggest thing in the row by an
 * order of magnitude, and `select("*")` shipped every one of them to the browser
 * for every exam in the library just to print a title, a category and a
 * description. Naming the columns cuts the response to what the grid draws.
 *
 * Why a retry rather than a plain column list: naming a column PostgREST has
 * not seen fails the WHOLE request (this is the same hazard examSettings.ts /
 * paperTypeSettings.ts gate their writes against). `paper_type` and
 * `paper_year` arrive by hand-pasted migrations, so on a database that has not
 * had them applied a fixed `...,paper_type` select would turn the entire
 * library into an error state — strictly worse than the over-fetching it
 * replaces. So the optional columns are requested optimistically and dropped,
 * one at a time and once per session, for whatever the schema says it has
 * never heard of. A row that comes back without `paper_type` reads as a mock
 * and one without `paper_year` reads as having no year, which is exactly what
 * `readPaperType` / `readPaperYear` already do with them and exactly how a
 * pre-migration library behaved before these fields existed.
 */
import { isColumnMissingError } from "@/lib/dbFeatures";

/**
 * Columns present since the table was created, so always safe to name.
 *
 * `is_published` and `created_at` are here because the pages filter and sort on
 * them server-side and the row type declares them — not because a card draws
 * them.
 */
export const EXAM_LIST_BASE_COLUMNS =
  "id,name,description,created_at,is_published,exam_category,user_id";

/**
 * Columns that only exist once a hand-pasted migration has been applied.
 * Keep this list to things the LIST needs; anything an editor needs should be
 * read on demand from the single row it is editing.
 *
 * ORDER MATTERS: oldest migration first. These columns do not arrive together
 * — paper_type ships in 20260825000000 and paper_year in 20260917000000 — so a
 * live database can perfectly well have the first and not the second. The
 * fallback below drops them one at a time from the END of this list, which
 * means the newest (and so likeliest-missing) column goes first and everything
 * already migrated keeps working. A database with a LATER column but not an
 * earlier one would lose both; that ordering cannot happen from this repo's
 * migrations, and the cost if it ever did is a degraded library, not a broken
 * one.
 */
export const EXAM_LIST_OPTIONAL_COLUMNS = ["paper_type", "paper_year"];

export const EXAM_LIST_COLUMNS_WITH_OPTIONAL = `${EXAM_LIST_BASE_COLUMNS},${EXAM_LIST_OPTIONAL_COLUMNS.join(
  ","
)}`;

/**
 * Session-scoped memo of HOW MANY of the optional columns the live schema can
 * actually serve:
 *   null — not yet known, ask for all of them
 *   n    — ask for the first n and no more, for the rest of this page's life
 *
 * A reload after applying a migration re-probes, matching dbFeatures.ts.
 */
let serveableOptionalColumns: number | null = null;

/** The select string for the base columns plus the first `count` optional ones. */
function columnsFor(count: number): string {
  if (count <= 0) return EXAM_LIST_BASE_COLUMNS;
  return `${EXAM_LIST_BASE_COLUMNS},${EXAM_LIST_OPTIONAL_COLUMNS.slice(0, count).join(",")}`;
}

/**
 * Deliberately loose: the column list is a runtime string, so supabase-js cannot
 * infer a row type from it. Callers assert the shape they asked for — the same
 * bargain every other gated-column read in this codebase makes.
 */
type ExamListResult = { data: any[] | null; error: { code?: string; message?: string } | null };

/**
 * Run an exam-list query, passing it the widest column list the live schema can
 * serve.
 *
 * `build` is called with the column string and must return the PostgREST
 * promise. It can be called twice — once optimistically, and once more without
 * the optional columns if the first attempt proves they are missing — so it must
 * construct a fresh query each time rather than reusing a builder (a PostgREST
 * builder is single-use).
 */
export async function queryExamList(
  build: (columns: string) => PromiseLike<ExamListResult>
): Promise<ExamListResult> {
  let count = serveableOptionalColumns ?? EXAM_LIST_OPTIONAL_COLUMNS.length;

  // At most one attempt per optional column, and only on a database that is
  // missing some — the successful count is memoised, so every later call in
  // this session goes straight to the widest list that works.
  for (;;) {
    const result = await build(columnsFor(count));

    if (!result.error) {
      serveableOptionalColumns = count;
      return result;
    }

    if (count > 0 && isColumnMissingError(result.error)) {
      count -= 1;
      continue;
    }

    // Any other failure (network, RLS, 5xx) is the caller's to report. Note we
    // do NOT latch `serveableOptionalColumns` here: a transient error must not
    // disable the gated columns for the rest of the session.
    return result;
  }
}

/** Test seam — resets the session memo so specs can exercise both branches. */
export function __resetOptionalColumnProbe() {
  serveableOptionalColumns = null;
}
