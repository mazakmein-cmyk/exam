/**
 * SectionNavigationControl.tsx — the creator's switch between the two ways a
 * paper can be timed. Lives at the top of the Sections card in the exam editor,
 * because it changes what every row below it means.
 *
 *   OFF (default)  Per-section clocks. The student sits section 1, submits it,
 *                  and it closes for good. Each row keeps its own minutes box.
 *   ON             One clock for the whole paper. The per-section boxes below
 *                  go quiet (the value is kept, not deleted — flipping back
 *                  restores the paper exactly), and the creator gives a single
 *                  total here instead.
 *
 * The total defaults to the sum of the section clocks, because that is the
 * number a creator who has already filled in four sections means by "the whole
 * paper", and it is what the student gets if this box is left empty.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, Hourglass, Info, Lock, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  allowSwitching: boolean;
  /** null = creator has not chosen; the section sum stands in. */
  totalMinutes: number | null;
  /** Sum of the per-section clocks — the default and the fallback. */
  sectionMinutesSum: number;
  sectionCount: number;
  onToggle: (next: boolean) => void;
  onTotalMinutesChange: (minutes: number | null) => void;
  /** True while a save is in flight, so the switch can't be double-flipped. */
  busy?: boolean;
};

export default function SectionNavigationControl({
  allowSwitching,
  totalMinutes,
  sectionMinutesSum,
  sectionCount,
  onToggle,
  onTotalMinutesChange,
  busy = false,
}: Props) {
  // Local draft so typing "1", "12", "120" doesn't fire three saves. Committed
  // on blur / Enter, exactly like the per-section minutes boxes below.
  const [draft, setDraft] = useState<string>(totalMinutes != null ? String(totalMinutes) : "");

  useEffect(() => {
    setDraft(totalMinutes != null ? String(totalMinutes) : "");
  }, [totalMinutes]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (totalMinutes !== null) onTotalMinutesChange(null);
      return;
    }
    const parsed = parseInt(trimmed, 10);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next !== totalMinutes) onTotalMinutesChange(next);
    setDraft(next != null ? String(next) : "");
  };

  const usingFallback = allowSwitching && totalMinutes == null && sectionMinutesSum > 0;
  const effectiveMinutes = totalMinutes ?? sectionMinutesSum;

  return (
    <div
      className={`rounded-xl border transition-colors ${
        allowSwitching
          ? "border-primary/35 bg-primary/[0.045]"
          : "border-border/70 bg-muted/25"
      }`}
    >
      {/* Toggle row */}
      <label
        className="flex items-start gap-3 p-3 cursor-pointer"
        htmlFor="allow-section-switching"
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
            allowSwitching ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {allowSwitching ? (
            <ArrowLeftRight className="h-4 w-4" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground">Section switching</span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="text-muted-foreground/70 hover:text-muted-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                  On: students get a tab per section and one clock for the whole paper —
                  they can leave a section and come back to it. Off: one section at a
                  time, each with its own clock, and a submitted section stays closed.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">
            {allowSwitching ? (
              <>
                Students move between sections freely.{" "}
                <span className="text-foreground/70">One clock for the paper.</span>
              </>
            ) : (
              <>
                One section at a time.{" "}
                <span className="text-foreground/70">Submitted sections stay closed.</span>
              </>
            )}
          </p>
        </div>

        <Switch
          id="allow-section-switching"
          checked={allowSwitching}
          disabled={busy}
          onCheckedChange={(next) => onToggle(next)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Let students switch between sections"
        />
      </label>

      {/* Whole-paper clock — only meaningful once switching is on */}
      {allowSwitching && (
        <div className="border-t border-primary/20 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="total-exam-minutes"
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <Hourglass className="h-3 w-3" />
              Total exam time
            </Label>
            <div className="flex items-center gap-1.5 shrink-0">
              <Input
                id="total-exam-minutes"
                type="number"
                min={1}
                inputMode="numeric"
                className="h-7 w-16 rounded-md text-xs text-center tabular-nums"
                value={draft}
                placeholder={sectionMinutesSum > 0 ? String(sectionMinutesSum) : "60"}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              <span className="text-xs font-medium text-muted-foreground">min</span>
            </div>
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">
            {usingFallback ? (
              <>
                Empty — students get{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {sectionMinutesSum} min
                </span>
                , the total of the section times below.
              </>
            ) : effectiveMinutes > 0 ? (
              <>
                <span className="font-semibold text-foreground tabular-nums">
                  {effectiveMinutes} min
                </span>{" "}
                across {sectionCount === 1 ? "the section" : `all ${sectionCount} sections`}.
              </>
            ) : (
              <>Set a total, or fill in the section times below and leave this empty.</>
            )}
          </p>

          {/* One tap back to the section sum, for a creator who edited the rows
              below after setting a total and now wants them to agree again. */}
          {sectionMinutesSum > 0 && totalMinutes !== null && totalMinutes !== sectionMinutesSum && (
            <button
              type="button"
              onClick={() => onTotalMinutesChange(sectionMinutesSum)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Use section total ({sectionMinutesSum} min)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
