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
function isColumnMissingError(error: { code?: string; message?: string } | null): boolean {
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
