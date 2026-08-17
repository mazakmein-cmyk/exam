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
  normalizePaperType,
  readPaperType,
} from "@/lib/paperType.js";

export { PAPER_TYPE_COLUMN };
export const PAPER_TYPE_ACCESS_COLUMN = "can_set_paper_type";
export const PAPER_TYPE_MIGRATION = "20260825000000_add_exam_paper_type.sql";

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
 * Persist just the paper type. Not used by the exam editor (which folds the
 * field into its one exam UPDATE via paperTypeUpdatePatch) — this is for any
 * caller that needs to change only this.
 */
export async function savePaperType(
  examId: string,
  value: PaperType | string
): Promise<PaperTypeSaveResult> {
  if (!(await hasPaperTypeColumn())) return { ok: false, reason: "missing-migration" };

  const { error } = await supabase
    .from("exams")
    .update({ [PAPER_TYPE_COLUMN]: normalizePaperType(value) } as never)
    .eq("id", examId);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

export { DEFAULT_PAPER_TYPE };
