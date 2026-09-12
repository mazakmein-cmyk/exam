/**
 * aiImportSettings.ts — who may use "Import from PDF", and how to find out.
 *
 * The grant column arrives by hand-pasted migration
 * (20260912000000_ai_pdf_import.sql), so every read is absent-tolerant in the
 * same way as paperTypeSettings.ts: a missing column, no session, no profile
 * row or a network drop all resolve to `false`, which is the state of every
 * account until an admin says otherwise. Hiding a menu item the creator was
 * granted is a cosmetic loss they can fix with a reload; showing one whose
 * backing function is not deployed would waste their time.
 *
 * The edge function re-checks the same column on every call, so this read is
 * about rendering, never about security.
 */
import { supabase } from "@/integrations/supabase/client";
import { tableHasColumn } from "@/lib/dbFeatures";

export const AI_IMPORT_ACCESS_COLUMN = "can_use_ai_import";
export const AI_IMPORT_MIGRATION = "20260912000000_ai_pdf_import.sql";
export const AI_IMPORT_FUNCTION = "ai-pdf-import";

/**
 * Is the signed-in creator allowed to import from PDF?
 * `false` on ANY failure — see the file comment.
 */
export async function fetchAiImportAccess(): Promise<boolean> {
  try {
    if (!(await tableHasColumn("profiles", AI_IMPORT_ACCESS_COLUMN))) return false;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // maybeSingle, not single: an account that has not finished onboarding has
    // no profile row, and "no row" is a no, not an error. The column is spelled
    // out because supabase-js parses the select string at the type level.
    const { data, error } = await supabase
      .from("profiles")
      .select("can_use_ai_import")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data) return false;

    return (data as any).can_use_ai_import === true;
  } catch {
    return false;
  }
}
