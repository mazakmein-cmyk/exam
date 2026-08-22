/**
 * dbFeatures.ts — runtime feature-detection for DB columns.
 *
 * The app ships code for columns whose migrations the user applies by hand
 * (SQL editor), so the live schema can lag the code. Writing an unknown
 * column makes the whole insert/update fail, so writes gate on a one-time
 * probe: `select <column> limit 1` — an error means "column missing, omit
 * the field", which is exactly the pre-migration behavior.
 *
 * Results are cached per session; a page reload after applying a migration
 * picks the new column up automatically.
 */
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, Promise<boolean>>();

/** Postgres "undefined_column" — the only DEFINITIVE "column missing" signal. */
export function isColumnMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .* does not exist|could not find .* column/i.test(error.message ?? "");
}

export function tableHasColumn(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      try {
        const { error } = await supabase
          .from(table as any)
          .select(column as any)
          .limit(1);
        if (!error) return true;
        if (isColumnMissingError(error)) return false;
        // Transient failure (network drop, expired JWT, 5xx): report false
        // for THIS call but evict the cache entry so the next save re-probes
        // instead of silently disabling the feature for the whole session.
        cache.delete(key);
        return false;
      } catch {
        cache.delete(key);
        return false;
      }
    })();
    cache.set(key, hit);
  }
  return hit;
}

/** PostgREST/Postgres "relation missing" — the schema lags the code. */
export function isRelationMissingError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 undefined_table; PGRST205 "Could not find the table ... in the schema cache".
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? "");
}

let questionsRelation: Promise<string> | null = null;

/**
 * Which relation to read questions from on a STUDENT surface.
 *
 * `parsed_questions_student` withholds correct_answer and answer_hint, and is
 * what a candidate must read — but it only exists once
 * 20260832000000_hide_practice_answer_key.sql has been pasted in. Before that,
 * fall back to the base table, which is what the app always read.
 *
 * This has to degrade rather than fail: the question fetch in ExamSimulator
 * discards its error, so a missing relation does not raise — it silently yields
 * an exam with zero questions. Probed once per session and cached, so a reload
 * after applying the migration picks the view up.
 */
export function studentQuestionsRelation(): Promise<string> {
  if (!questionsRelation) {
    questionsRelation = (async () => {
      try {
        const { error } = await supabase
          .from("parsed_questions_student" as any)
          .select("id")
          .limit(1);
        if (!error) return "parsed_questions_student";
        if (isRelationMissingError(error)) return "parsed_questions";
        // Transient (network, expired JWT, 5xx): use the base table for THIS
        // call but re-probe next time rather than pinning the whole session.
        questionsRelation = null;
        return "parsed_questions";
      } catch {
        questionsRelation = null;
        return "parsed_questions";
      }
    })();
  }
  return questionsRelation;
}
