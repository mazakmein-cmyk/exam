/**
 * paperTypeSettings.ts — reads and writes for the paper type field, whose
 * columns arrive by hand-pasted migration
 * (20260825000000_add_exam_paper_type.sql).
 *
 * Same contract as examSettings.ts / timingGroupSettings.ts, for the same
 * reason: naming a column PostgREST has not seen fails the WHOLE request, so a
 * creator saving an exam on an un-migrated database must not lose the rest of
 * the save. Every write goes through `tableHasColumn` and returns an empty
 * patch instead — which leaves the exam exactly as a pre-migration database can
 * express it: a mock.
 *
 * Reads are absent-tolerant in the other direction: a failed access probe
 * resolves to `false`, so the field simply stays hidden. Hiding a field the
 * creator was granted is a cosmetic loss they can fix with a reload; rendering
 * one whose column does not exist would break their save.
 */
import { supabase } from "@/integrations/supabase/client";
import { tableHasColumn } from "@/lib/dbFeatures";
import {
  DEFAULT_PAPER_TYPE,
  PAPER_TYPE_COLUMN,
  PAPER_YEAR_COLUMN,
  effectivePaperYear,
  normalizePaperType,
  readPaperType,
  readPaperYear,
  requiresPaperYear,
} from "@/lib/paperType.js";

export { PAPER_TYPE_COLUMN, PAPER_YEAR_COLUMN };
export const PAPER_TYPE_ACCESS_COLUMN = "can_set_paper_type";
export const PAPER_TYPE_MIGRATION = "20260825000000_add_exam_paper_type.sql";
/**
 * The year arrives by its OWN migration, later than the type's. The two are
 * probed separately for that reason: a database can perfectly well have
 * paper_type and not yet paper_year, and on such a database the type field
 * must keep working while the year field simply does not appear.
 */
export const PAPER_YEAR_MIGRATION = "20260917000000_add_exam_paper_year.sql";

export type PaperType = "mock" | "pyq";

/**
 * Flat shape rather than a discriminated union — this project compiles with
 * `strictNullChecks` off, where narrowing on a literal discriminant does not
 * hold. `reason: "missing-migration"` means the SQL has not been applied (or
 * PostgREST is still serving the old column list).
 */
export type PaperTypeSaveResult = {
  ok: boolean;
  reason?: "missing-migration" | "error";
  message?: string;
};

/** Does the live schema know about `exams.paper_type` yet? */
export function hasPaperTypeColumn(): Promise<boolean> {
  return tableHasColumn("exams", PAPER_TYPE_COLUMN);
}

/** Does the live schema know about `exams.paper_year` yet? */
export function hasPaperYearColumn(): Promise<boolean> {
  return tableHasColumn("exams", PAPER_YEAR_COLUMN);
}

/**
 * Is the signed-in creator allowed to choose the paper type?
 *
 * `false` on ANY failure — no session, no profile row yet, column missing,
 * network drop. Every one of those means "this account has not been granted the
 * field", which is the state of every account until an admin says otherwise.
 */
export async function fetchPaperTypeAccess(): Promise<boolean> {
  try {
    if (!(await tableHasColumn("profiles", PAPER_TYPE_ACCESS_COLUMN))) return false;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // maybeSingle, not single: an account that has not finished onboarding has
    // no profile row, and "no row" is not an error here — it is a no.
    // The column is spelled out rather than interpolated from the constant
    // because supabase-js parses the select string at the type level.
    const { data, error } = await supabase
      .from("profiles")
      .select("can_set_paper_type")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data) return false;

    return (data as any).can_set_paper_type === true;
  } catch {
    return false;
  }
}

/**
 * The paper-type field to include in an exam INSERT.
 *
 * `{}` on an un-migrated database, so exam creation there behaves exactly as it
 * did before this feature — and `{}` is also what a creator without the grant
 * gets, because the column's own default ('mock') is the answer for them.
 */
export async function paperTypeInsertPatch(
  value: PaperType | string | null | undefined
): Promise<Record<string, unknown>> {
  if (!(await hasPaperTypeColumn())) return {};
  return { [PAPER_TYPE_COLUMN]: normalizePaperType(value) };
}

/**
 * The paper-type field to include in an exam UPDATE. Identical to the insert
 * patch today; kept as its own name because the call sites read better and the
 * two could diverge (an update must never silently rewrite a value the editor
 * was not allowed to show).
 */
export async function paperTypeUpdatePatch(
  value: PaperType | string | null | undefined
): Promise<Record<string, unknown>> {
  return paperTypeInsertPatch(value);
}

/**
 * The paper-type field to carry onto a duplicate. Reads the SOURCE row rather
 * than any UI state: a copy is a copy, including for a creator whose grant was
 * revoked after the original was tagged.
 */
export async function paperTypeCopyPatch(
  source: unknown
): Promise<Record<string, unknown>> {
  if (!(await hasPaperTypeColumn())) return {};
  return { [PAPER_TYPE_COLUMN]: readPaperType(source) };
}

/**
 * The paper-YEAR field to include in an exam INSERT.
 *
 * Takes the TYPE as well as the year, because the stored value depends on both:
 * a mock stores null however the picker was left. Gated on its own column, so
 * on a database with paper_type but not yet paper_year the type still saves and
 * the year is simply absent — which is what such a database can express.
 */
export async function paperYearInsertPatch(
  paperType: PaperType | string | null | undefined,
  year: number | string | null | undefined
): Promise<Record<string, unknown>> {
  if (!(await hasPaperYearColumn())) return {};
  return { [PAPER_YEAR_COLUMN]: effectivePaperYear(paperType, year) };
}

/**
 * The paper-year field to include in an exam UPDATE. Identical to the insert
 * patch today; named separately for the same reason paperTypeUpdatePatch is.
 */
export async function paperYearUpdatePatch(
  paperType: PaperType | string | null | undefined,
  year: number | string | null | undefined
): Promise<Record<string, unknown>> {
  return paperYearInsertPatch(paperType, year);
}

/**
 * The paper-year field to carry onto a duplicate. Reads the SOURCE row, like
 * paperTypeCopyPatch — a copy of the 2024 paper is still the 2024 paper, and
 * readPaperYear already refuses to carry a year off a row tagged as a mock.
 */
export async function paperYearCopyPatch(
  source: unknown
): Promise<Record<string, unknown>> {
  if (!(await hasPaperYearColumn())) return {};
  return { [PAPER_YEAR_COLUMN]: readPaperYear(source) };
}

/**
 * Persist just the paper type. Not used by the exam editor (which folds the
 * field into its one exam UPDATE via paperTypeUpdatePatch) — this is for any
 * caller that needs to change only this.
 *
 * Turning a paper into a mock clears its year in the same statement. This is
 * the one write that moves the type without the year picker beside it, so it
 * has to carry the pairing rule itself — otherwise a demoted paper would keep a
 * year that readPaperYear hides but the column still holds.
 */
export async function savePaperType(
  examId: string,
  value: PaperType | string
): Promise<PaperTypeSaveResult> {
  if (!(await hasPaperTypeColumn())) return { ok: false, reason: "missing-migration" };

  const patch: Record<string, unknown> = { [PAPER_TYPE_COLUMN]: normalizePaperType(value) };
  if (!requiresPaperYear(value) && (await hasPaperYearColumn())) {
    patch[PAPER_YEAR_COLUMN] = null;
  }

  const { error } = await supabase
    .from("exams")
    .update(patch as never)
    .eq("id", examId);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

export { DEFAULT_PAPER_TYPE };
