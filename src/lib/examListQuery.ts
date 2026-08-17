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
 * paperTypeSettings.ts gate their writes against). `paper_type` arrives by
 * hand-pasted migration, so on a database that has not had it applied a fixed
 * `...,paper_type` select would turn the entire library into an error state —
 * strictly worse than the over-fetching it replaces. So the optional columns are
 * requested optimistically and dropped, once per session, if the schema says it
 * has never heard of them. A row that comes back without `paper_type` reads as a
 * mock, which is exactly what `readPaperType` already does with it and exactly
 * how a pre-migration library behaved before this feature existed.
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
 */
export const EXAM_LIST_OPTIONAL_COLUMNS = ["paper_type"];

export const EXAM_LIST_COLUMNS_WITH_OPTIONAL = `${EXAM_LIST_BASE_COLUMNS},${EXAM_LIST_OPTIONAL_COLUMNS.join(
  ","
)}`;

/**
 * Session-scoped memo of whether the optional columns exist:
 *   null  — not yet known, ask for them
 *   true  — the schema has them
 *   false — it does not; stop asking for the rest of this page's life
 *
 * A reload after applying the migration re-probes, matching dbFeatures.ts.
 */
let optionalColumnsPresent: boolean | null = null;

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
  const askForOptional = optionalColumnsPresent !== false;
  const result = await build(
    askForOptional ? EXAM_LIST_COLUMNS_WITH_OPTIONAL : EXAM_LIST_BASE_COLUMNS
  );

  if (!result.error) {
    if (askForOptional) optionalColumnsPresent = true;
    return result;
  }

  if (askForOptional && isColumnMissingError(result.error)) {
    optionalColumnsPresent = false;
    return build(EXAM_LIST_BASE_COLUMNS);
  }

  // Any other failure (network, RLS, 5xx) is the caller's to report. Note we do
  // NOT latch `optionalColumnsPresent` here: a transient error must not disable
  // the paper-type column for the rest of the session.
  return result;
}

/** Test seam — resets the session memo so specs can exercise both branches. */
export function __resetOptionalColumnProbe() {
  optionalColumnsPresent = null;
}
