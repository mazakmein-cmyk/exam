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
 *
 * Why the minutes box is a stepper, not <input type="number">
 * -----------------------------------------------------------
 * The native control was actively hostile in this 250px sidebar: its spinner
 * arrows sit *on top of* the text, so a three-digit value like 120 was clipped
 * to "12", and a stray scroll over a focused field silently rewrote the length
 * of the exam. This is a text field constrained to digits, with explicit −/+ 5
 * buttons — a real 36px hit target instead of a 9px arrow, and nothing the
 * mouse wheel can touch.
 *
 * Saving is quiet and self-healing: stepping schedules one write 400ms after
 * the last click (ten taps on + is one save, not ten), and if the parent is
 * mid-save the write simply waits for it rather than being dropped on the
 * floor — ExamDetail's handler refuses re-entrant calls.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatHours, parseMinutes, sanitiseMinutes } from "@/lib/minutes";

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

/** Minutes the ± buttons move by — exam lengths are set in fives, not ones. */
const STEP = 5;
const MIN_MINUTES = 5;
/** Matches the four-digit cap on the field, so typing and stepping agree. */
const MAX_MINUTES = 9999;
/** Long enough to swallow a burst of clicks, short enough to feel immediate. */
const COMMIT_DELAY_MS = 400;

export default function SectionNavigationControl({
  allowSwitching,
  totalMinutes,
  sectionMinutesSum,
  sectionCount,
  onToggle,
  onTotalMinutesChange,
  busy = false,
}: Props) {
  // Local draft so typing "1", "12", "120" doesn't fire three saves.
  const [draft, setDraft] = useState<string>(totalMinutes != null ? String(totalMinutes) : "");
  // Set by a step or a blur: "this draft wants to be saved when we're able to".
  const [pending, setPending] = useState(false);

  const changeRef = useRef(onTotalMinutesChange);
  useEffect(() => {
    changeRef.current = onTotalMinutesChange;
  });

  // The row changed underneath us — our own save landing, or a failed save
  // rolling back. Either way the field follows the truth.
  useEffect(() => {
    setDraft(totalMinutes != null ? String(totalMinutes) : "");
    setPending(false);
  }, [totalMinutes]);

  // One write per burst. If the parent is busy we hold the draft and try again
  // when it frees up, rather than firing into a handler that would ignore us.
  useEffect(() => {
    if (!pending || busy) return;
    const next = parseMinutes(draft);
    if (next === totalMinutes) {
      setPending(false);
      return;
    }
    const timer = setTimeout(() => changeRef.current(next), COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, busy, draft, totalMinutes]);

  // What ± acts on: the typed value, else whatever the student would get today.
  const current = parseMinutes(draft) ?? (sectionMinutesSum > 0 ? sectionMinutesSum : 60);
  const atMin = current <= MIN_MINUTES;
  const atMax = current >= MAX_MINUTES;

  const step = (delta: number) => {
    // At a bound, do nothing rather than clamp — clamping would move the value
    // the opposite way to the button that was pressed.
    if (delta < 0 ? atMin : atMax) return;
    // Round to the grid so 47 +5 lands on 50, not 52.
    const target = Math.round((current + delta) / STEP) * STEP;
    setDraft(String(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, target))));
    setPending(true);
  };

  const usingFallback = totalMinutes == null && sectionMinutesSum > 0;
  const effectiveMinutes = totalMinutes ?? sectionMinutesSum;
  const hours = formatHours(effectiveMinutes);
  const perSection =
    sectionCount > 1 && effectiveMinutes > 0 ? Math.round(effectiveMinutes / sectionCount) : null;

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        allowSwitching
          ? "border-primary/35 bg-primary/[0.045]"
          : "border-border/70 bg-muted/25"
      }`}
    >
      {/* Toggle row */}
      <label
        className="flex items-center gap-2.5 p-3 cursor-pointer"
        htmlFor="allow-section-switching"
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            allowSwitching
              ? "bg-primary/15 text-primary ring-1 ring-primary/20"
              : "bg-muted text-muted-foreground"
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
            <span className="text-[13px] font-bold leading-none tracking-tight text-foreground">
              Section switching
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="What section switching does"
                    className="rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={(e) => {
                      // Inside the <label>: without this, the tooltip would
                      // flip the switch.
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                  On: students get a tab per section and one clock for the whole paper —
                  they can leave a section and come back to it. Off: one section at a
                  time, each with its own clock, and a submitted section stays closed.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground mt-1">
            {allowSwitching ? (
              <>
                Students move between sections freely.{" "}
                <span className="font-medium text-foreground/75">One clock for the paper.</span>
              </>
            ) : (
              <>
                One section at a time.{" "}
                <span className="font-medium text-foreground/75">Submitted sections stay closed.</span>
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
        <div className="border-t border-primary/20 bg-background/55 px-3 py-2.5 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between gap-2">
            <Label
              htmlFor="total-exam-minutes"
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              <Hourglass className="h-3 w-3 shrink-0" />
              Total exam time
            </Label>
            {busy ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </span>
            ) : hours ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                {hours}
              </span>
            ) : null}
          </div>

          {/* Stepper: −5 · value · +5. Full width, so a 3-digit number can
              never be clipped the way the native spinner clipped it. */}
          <div className="flex h-9 items-center rounded-lg border border-input bg-background shadow-xs transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/40">
            <button
              type="button"
              aria-label={`Decrease total time by ${STEP} minutes`}
              onClick={() => step(-STEP)}
              disabled={atMin}
              className="grid h-full w-9 shrink-0 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <div className="flex flex-1 items-center justify-center gap-1 min-w-0 px-1">
              <input
                id="total-exam-minutes"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby="total-exam-minutes-hint"
                className="w-12 min-w-0 bg-transparent text-center text-sm font-bold tabular-nums text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/60"
                value={draft}
                placeholder={sectionMinutesSum > 0 ? String(sectionMinutesSum) : "60"}
                onChange={(e) => setDraft(sanitiseMinutes(e.target.value))}
                onBlur={() => setPending(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
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

            <button
              type="button"
              aria-label={`Increase total time by ${STEP} minutes`}
              onClick={() => step(STEP)}
              disabled={atMax}
              className="grid h-full w-9 shrink-0 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:scale-95 disabled:pointer-events-none disabled:opacity-35"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p
              id="total-exam-minutes-hint"
              aria-live="polite"
              className="text-[11px] leading-snug text-muted-foreground"
            >
              {usingFallback ? (
                <>
                  Empty — students get{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {sectionMinutesSum} min
                  </span>
                  , the total of the section times below.
                </>
              ) : effectiveMinutes > 0 ? (
                <>
                  One clock for{" "}
                  {sectionCount <= 1 ? "the whole paper" : `all ${sectionCount} sections`}
                  {perSection ? (
                    <>
                      {" · "}
                      <span className="tabular-nums">~{perSection} min</span> each
                    </>
                  ) : null}
                  .
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
                onClick={() => {
                  setDraft(String(sectionMinutesSum));
                  setPending(true);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Use section total ({sectionMinutesSum} min)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
