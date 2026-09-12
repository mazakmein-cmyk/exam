import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAiImportAccess } from "@/lib/aiImportSettings";

/**
 * May this creator use "Import from PDF"?
 *
 * Starts `false` and stays `false` for everyone until an admin grants it, so
 * the menu item is never briefly visible to an account that does not have it —
 * the first paint is already the un-granted layout. Same contract as
 * usePaperTypeAccess, for the same reasons.
 *
 * Re-checks on auth changes: a sign-out/sign-in in another tab can put a
 * different creator behind the same mounted page.
 */
export function useAiImportAccess() {
  const [canUseAiImport, setCanUseAiImport] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const allowed = await fetchAiImportAccess();
      if (!active) return;
      setCanUseAiImport(allowed);
      setLoading(false);
    };

    check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { canUseAiImport, loading };
}
