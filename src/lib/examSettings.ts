/**
 * examSettings.ts — reads and writes for the exam-level settings whose columns
 * arrive by hand-pasted migration.
 *
 * Every write here goes through `tableHasColumn` first. The reason is specific:
 * naming a column PostgREST has not seen fails the WHOLE update, so a creator
 * who flips section switching on an un-migrated database would otherwise lose
 * the rest of the save with an opaque error. Gating turns that into an honest
 * "apply the migration first" message and leaves the exam untouched.
 */
import { supabase } from "@/integrations/supabase/client";
import { tableHasColumn } from "@/lib/dbFeatures";

export const ALLOW_SWITCHING_COLUMN = "allow_section_switching";
export const TOTAL_TIME_COLUMN = "total_time_minutes";

export type NavigationSettings = {
  allow_section_switching: boolean;
  total_time_minutes: number | null;
};

/**
 * Deliberately a flat shape rather than a discriminated union: this project
 * compiles with `strictNullChecks` off, where narrowing on a boolean literal
 * discriminant does not hold and every caller would have to cast.
 *
 * `reason: "missing-column"` means the migration has not been applied (or
 * PostgREST is still serving the old column list).
 */
export type NavigationSaveResult = {
  ok: boolean;
  reason?: "missing-column" | "error";
  message?: string;
};

/** Does the live schema know about section navigation mode yet? */
export function hasNavigationColumns(): Promise<boolean> {
  return tableHasColumn("exams", ALLOW_SWITCHING_COLUMN);
}

/**
 * Read the mode off an already-fetched exam row.
 *
 * An absent key is "locked", never "free" — see the note in
 * src/lib/examNavigation.js. A `total_time_minutes` of 0 or a negative value
 * is treated as unset so the reader falls back to the section sum.
 */
export function readNavigationSettings(examRow: unknown): NavigationSettings {
  const row = (examRow ?? {}) as Record<string, unknown>;
  const total = Number(row[TOTAL_TIME_COLUMN]);
  return {
    allow_section_switching: row[ALLOW_SWITCHING_COLUMN] === true,
    total_time_minutes: Number.isFinite(total) && total > 0 ? Math.floor(total) : null,
  };
}

/**
 * Persist a change to the navigation mode. Partial: pass only what changed.
 */
export async function saveNavigationSettings(
  examId: string,
  patch: Partial<NavigationSettings>
): Promise<NavigationSaveResult> {
  if (!(await hasNavigationColumns())) return { ok: false, reason: "missing-column" };

  const update: Record<string, unknown> = {};
  if (patch.allow_section_switching !== undefined) {
    update[ALLOW_SWITCHING_COLUMN] = patch.allow_section_switching;
  }
  if (patch.total_time_minutes !== undefined) {
    // The CHECK constraint rejects 0 and negatives; null is the "unset" value.
    const minutes = Number(patch.total_time_minutes);
    update[TOTAL_TIME_COLUMN] =
      Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("exams").update(update as never).eq("id", examId);
  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true };
}

/**
 * The navigation fields to include when duplicating an exam.
 *
 * Returns {} when the columns are missing, so a duplicate on an un-migrated
 * database still succeeds — it just lands in the default locked mode, which is
 * what that database can express anyway.
 */
export async function navigationCopyPatch(
  source: unknown
): Promise<Record<string, unknown>> {
  if (!(await hasNavigationColumns())) return {};
  const settings = readNavigationSettings(source);
  return {
    [ALLOW_SWITCHING_COLUMN]: settings.allow_section_switching,
    [TOTAL_TIME_COLUMN]: settings.total_time_minutes,
  };
}
