/**
 * appSettings.ts — the global, admin-owned settings in `public.app_settings`.
 *
 * One row per setting, keyed by a stable string, value as jsonb. The table
 * arrives by hand-pasted migration (20260918000000_app_settings_paper_year_max.sql),
 * so every read here is absent-tolerant in the same way dbFeatures.ts is: a
 * missing table, a missing key, an RLS surprise or a network drop all resolve
 * to `null`, and the caller supplies the default that makes the feature behave
 * exactly as it did before the setting existed.
 *
 * Reads are memoised for the session, because the call sites are React
 * components that mount and unmount as a form changes shape — without the memo
 * a creator flipping a picker back and forth would re-query on every flip.
 * A write invalidates the memo, so the admin who just changed a value sees it
 * immediately; everyone else picks it up on their next page load, which is the
 * same freshness the admin-managed category list has always had.
 */
import { supabase } from "@/integrations/supabase/client";

export const APP_SETTINGS_TABLE = "app_settings";
export const APP_SETTINGS_MIGRATION = "20260918000000_app_settings_paper_year_max.sql";

/** The keys this app stores. Spelled out so a typo is a compile error. */
export const PAPER_YEAR_MAX_KEY = "paper_year_max";

const cache = new Map<string, Promise<unknown>>();

/**
 * Read one setting, or null if it is not set — including the "not set" that a
 * database without the migration necessarily reports.
 *
 * A failed read is cached as `null` only for the life of THIS promise: the
 * entry is evicted on failure so a blip does not pin the default for the whole
 * session, matching tableHasColumn's behaviour.
 */
export function readAppSetting<T = unknown>(key: string): Promise<T | null> {
  let hit = cache.get(key) as Promise<T | null> | undefined;
  if (!hit) {
    hit = (async () => {
      try {
        // maybeSingle: "no row" is the normal state of a setting nobody has
        // changed, and is not an error.
        const { data, error } = await (supabase as any)
          .from(APP_SETTINGS_TABLE)
          .select("value")
          .eq("key", key)
          .maybeSingle();
        if (error) {
          cache.delete(key);
          return null;
        }
        if (!data) return null;
        return (data.value ?? null) as T | null;
      } catch {
        cache.delete(key);
        return null;
      }
    })();
    cache.set(key, hit as Promise<unknown>);
  }
  return hit;
}

/** Drop a memoised setting so the next read goes back to the database. */
export function invalidateAppSetting(key: string) {
  cache.delete(key);
}

/** Test seam — forget every memoised setting. */
export function __resetAppSettingsCache() {
  cache.clear();
}
