import { useEffect, useState } from "react";
import { currentPaperYear } from "@/lib/paperType.js";
import { fetchPaperYearMax } from "@/lib/paperTypeSettings";

/**
 * The newest year a creator may date a paper — an admin-set ceiling, defaulting
 * to the current year.
 *
 * Starts at the current year rather than at nothing, so the picker's first
 * paint is already a usable list. If an admin has pushed the ceiling forward,
 * the extra years appear a moment later; a list that grows by a row or two is
 * a far smaller surprise than a list that is briefly empty.
 *
 * The underlying read is memoised for the session (see appSettings.ts), so the
 * picker mounting and unmounting as a creator flips the paper type costs one
 * query, not one per flip.
 */
export function usePaperYearMax() {
  const [maxYear, setMaxYear] = useState<number>(() => currentPaperYear());

  useEffect(() => {
    let active = true;
    fetchPaperYearMax().then((year) => {
      if (active) setMaxYear(year);
    });
    return () => {
      active = false;
    };
  }, []);

  return maxYear;
}
