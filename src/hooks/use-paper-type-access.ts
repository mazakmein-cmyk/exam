import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaperTypeAccess } from "@/lib/paperTypeSettings";

/**
 * Is this creator allowed to choose an exam's paper type (Mock / Previous Year)?
 *
 * Starts `false` and stays `false` for everyone until an admin grants it, so the
 * field is never briefly visible to an account that does not have it — the
 * first paint is already the un-granted layout.
 *
 * `loading` is for call sites that would rather render nothing than render the
 * un-granted layout and then swap. The create dialog and the exam editor both
 * just use `canSetPaperType`: the field appearing a moment after the form is a
 * far smaller surprise than a field that appears and then disappears.
 *
 * Re-checks on auth changes, because a sign-out/sign-in in another tab can put
 * a different creator behind the same mounted page.
 */
export function usePaperTypeAccess() {
  const [canSetPaperType, setCanSetPaperType] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const check = async () => {
      const allowed = await fetchPaperTypeAccess();
      if (!active) return;
      setCanSetPaperType(allowed);
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

  return { canSetPaperType, loading };
}
