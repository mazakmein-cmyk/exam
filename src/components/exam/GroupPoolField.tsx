/**
 * GroupPoolField.tsx — the shared-pool clock on a timing group's header row in
 * the editor's Sections list.
 *
 * Sibling of MinutesField (same pill, same local-until-blur draft), with one
 * semantic of its own: EMPTY MEANS AUTO. A group's pool is the sum of its
 * members' minutes unless the creator types an explicit total — the same
 * override-or-sum rule the whole-paper stepper follows — so clearing the box
 * commits null (back to auto), never 0. The placeholder always shows what auto
 * currently is, so the box is never blank-and-meaningless.
 */
import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseMinutes, sanitiseMinutes } from "@/lib/minutes";

const STEP = 5;

type Props = {
  /** Explicit pool, or null = auto (the member sum). */
  poolMinutes: number | null;
  /** What auto currently means — the sum of the members' minutes. */
  memberSum: number;
  /** Blur or Enter. null = back to auto. */
  onCommit: (minutes: number | null) => void;
  /** Structure edits are primary-language-only; secondary tabs read. */
  readOnly?: boolean;
};

export default function GroupPoolField({ poolMinutes, memberSum, onCommit, readOnly = false }: Props) {
  const [draft, setDraft] = useState<string>(poolMinutes != null ? String(poolMinutes) : "");

  useEffect(() => {
    setDraft(poolMinutes != null ? String(poolMinutes) : "");
  }, [poolMinutes]);

  const effective = poolMinutes ?? memberSum;

  if (readOnly) {
    return (
      <span
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-2 text-[11px] font-bold tabular-nums text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <Hourglass className="h-3 w-3" />
        {effective > 0 ? `${effective} min` : "—"}
      </span>
    );
  }

  const step = (delta: number) => {
    const from = parseMinutes(draft) ?? (memberSum > 0 ? memberSum : 0);
    if (delta < 0 && from <= STEP) return;
    setDraft(String(Math.round((from + delta) / STEP) * STEP));
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-background px-2 transition-colors hover:border-primary/50 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/40"
          >
            <Hourglass className="h-3 w-3 shrink-0 text-primary" />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Shared time for this group, in minutes — empty means the sum of its sections"
              className="w-8 min-w-0 bg-transparent text-center text-xs font-bold tabular-nums text-foreground outline-none placeholder:font-semibold placeholder:text-primary/50"
              value={draft}
              placeholder={memberSum > 0 ? String(memberSum) : "0"}
              onChange={(e) => setDraft(sanitiseMinutes(e.target.value))}
              onBlur={() => onCommit(parseMinutes(draft))}
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
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">min shared</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px] text-xs">
          One clock for every section in this group. Leave it empty to use the sum of the
          member sections' minutes{memberSum > 0 ? ` (currently ${memberSum} min)` : ""}.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
