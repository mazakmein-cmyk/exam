import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paperYearOptionsFor } from "@/lib/paperType.js";
import { usePaperYearMax } from "@/hooks/use-paper-year-max";

type Props = {
  /** The chosen year as a string, or "" for nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Trigger classes — the create dialog and the editor sidebar size fields differently. */
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Which year a previous-year paper is from.
 *
 * Just the control, like PaperTypeSelect — each call site supplies its own
 * <Label> and its own "required" marking.
 *
 * Rendering it at all is the CALLER's decision, and it is a decision with two
 * halves: the creator must hold the paper-type grant AND have chosen "Previous
 * Year Paper". A mock has no year, so there is deliberately no empty option to
 * fall back to — clearing the year is done by changing the paper type, which
 * is the only thing that actually makes a paper yearless.
 *
 * The list runs newest-first from the admin's ceiling down to 1990. That is
 * ~37 rows, so it scrolls (SelectContent is capped at max-h-96 and grows its
 * own scroll buttons) — but the handful of years anyone actually picks are the
 * first ones under the cursor, and typing a digit jumps the list the way a
 * native select does.
 *
 * The ceiling is normally this year. An admin can push it forward (Admin ›
 * Config › Paper Years) because Indian exam cycles are named for the year
 * ahead — "JEE Main 2027" is written all through 2026.
 */
export default function PaperYearSelect({ value, onChange, className, disabled, id }: Props) {
  const maxYear = usePaperYearMax();
  // Recomputed only when the ceiling or the chosen value moves, not on every
  // keystroke elsewhere in the form — this builds ~37 entries.
  // `value` is passed in so a year outside the current ceiling (an admin
  // lowered it after this paper was dated) stays in the list instead of
  // vanishing and leaving the trigger blank.
  const years = useMemo(() => paperYearOptionsFor(maxYear, value), [maxYear, value]);

  // `value` is passed straight through, "" included: Radix shows the
  // placeholder for an empty string exactly as it does for undefined, and
  // passing undefined instead would make the control uncontrolled until the
  // first pick and then switch it mid-life.
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select year..." />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
