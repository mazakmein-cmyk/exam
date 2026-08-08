/**
 * MinutesField.tsx — the per-section clock in the editor's Sections list.
 *
 * One row, one number, and it has to survive being inside a card that is itself
 * a click target (selecting the section) and a drag target (reordering it). So
 * the whole pill swallows its own clicks, and only the grip drags.
 *
 * It reads as a pill rather than a bare box on purpose: when section switching
 * is ON the same slot shows a static "Timed as one paper" pill, and the two
 * states should be the same object changing rather than two different controls.
 *
 * Typing is local until blur — the section rows above and the whole-paper total
 * below both watch this number, and committing per keystroke would fire a write
 * for "3" on the way to "30".
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { parseMinutes, sanitiseMinutes } from "@/lib/minutes";

/** Arrow keys move in fives, like the whole-paper stepper. */
const STEP = 5;

type Props = {
  minutes: number;
  /** Every keystroke — keeps the section sum shown elsewhere honest as you type. */
  onLocalChange: (minutes: number) => void;
  /** Blur or Enter — the write. */
  onCommit: (minutes: number) => void;
};

export default function MinutesField({ minutes, onLocalChange, onCommit }: Props) {
  // "" rather than "0" for an empty box, so clearing it doesn't leave a 0 that
  // the next keystroke turns into "05".
  const [draft, setDraft] = useState<string>(minutes > 0 ? String(minutes) : "");

  useEffect(() => {
    setDraft(minutes > 0 ? String(minutes) : "");
  }, [minutes]);

  const apply = (next: string) => {
    setDraft(next);
    onLocalChange(parseMinutes(next) ?? 0);
  };

  const step = (delta: number) => {
    const from = parseMinutes(draft) ?? 0;
    if (delta < 0 && from <= STEP) return;
    apply(String(Math.round((from + delta) / STEP) * STEP));
  };

  return (
    <div
      // The card behind this selects the section; the pill is not that.
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-background px-2 transition-colors hover:border-primary/40 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/40"
    >
      <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label="Time for this section, in minutes"
        className="w-8 min-w-0 bg-transparent text-center text-xs font-bold tabular-nums text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/50"
        value={draft}
        placeholder="0"
        onChange={(e) => apply(sanitiseMinutes(e.target.value))}
        onBlur={() => onCommit(parseMinutes(draft) ?? 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step(STEP);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-STEP);
          }
        }}
      />
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">min</span>
    </div>
  );
}
