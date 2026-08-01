/**
 * LiveOption.tsx — one answer choice, shared by the student screen and the
 * creator preview.
 *
 * Colour discipline matters most here. Violet always means "your choice",
 * emerald always means "correct", rose always means "wrong". The old screens
 * used emerald for both selection and correctness, which made a picked option
 * look already-right before the reveal.
 */

import { memo } from "react";

import { Check, X } from "lucide-react";
import { renderMathInRichText } from "@/lib/renderMath";

export type OptionVisual =
  /** not chosen, still choosable */
  | "idle"
  /** the student's current pick, before the reveal */
  | "selected"
  /** revealed correct answer, which the student also picked */
  | "correct-picked"
  /** revealed correct answer the student missed */
  | "correct-missed"
  /** the student's pick, revealed as wrong */
  | "wrong-picked"
  /** revealed, untouched by this student */
  | "quiet";

const SHELL: Record<OptionVisual, string> = {
  idle: "border-border/70 bg-card hover:border-primary/50 hover:bg-primary/[0.04]",
  selected: "border-primary bg-primary/[0.07] ring-1 ring-primary/40",
  "correct-picked": "border-emerald-500 bg-emerald-500/[0.09] ring-1 ring-emerald-500/40",
  "correct-missed": "border-emerald-500/70 border-dashed bg-emerald-500/[0.06]",
  "wrong-picked": "border-rose-500 bg-rose-500/[0.08] ring-1 ring-rose-500/40",
  quiet: "border-border/60 bg-muted/20 opacity-70",
};

const BADGE: Record<OptionVisual, string> = {
  idle: "bg-muted text-muted-foreground",
  selected: "bg-primary text-primary-foreground",
  "correct-picked": "bg-emerald-500 text-white",
  "correct-missed": "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40",
  "wrong-picked": "bg-rose-500 text-white",
  quiet: "bg-muted text-muted-foreground",
};

const FILL: Record<OptionVisual, string> = {
  idle: "bg-foreground/[0.05]",
  selected: "bg-primary/10",
  "correct-picked": "bg-emerald-500/15",
  // Tailwind's default opacity scale is multiples of 5 — a bare /12 compiles to
  // nothing at all, so these tints must snap to real steps.
  "correct-missed": "bg-emerald-500/10",
  "wrong-picked": "bg-rose-500/15",
  quiet: "bg-foreground/[0.05]",
};

export function optionLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

function LiveOption({
  index,
  html,
  imageUrl,
  visual,
  multi = false,
  disabled = false,
  onClick,
  distributionPct,
  distributionLabel,
  showShortcut = false,
  compact = false,
  display = false,
}: {
  index: number;
  html: string;
  imageUrl?: string | null;
  visual: OptionVisual;
  multi?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 0–100; when set, the row shows how the class split. */
  distributionPct?: number;
  distributionLabel?: string;
  showShortcut?: boolean;
  compact?: boolean;
  /**
   * Projector mode: every size becomes em-based so the whole row scales with the
   * container's measured font size. A px or rem size here would ignore it, which
   * is how an option projected onto a wall stays at fourteen pixels while the
   * question above it grows.
   */
  display?: boolean;
}) {
  const interactive = !!onClick && !disabled;
  const Tag: any = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? false : undefined}
      aria-pressed={interactive ? visual === "selected" : undefined}
      className={`relative w-full overflow-hidden rounded-xl border text-left transition-all
        ${display ? "px-[0.55em] py-[0.45em]" : compact ? "px-3 py-2.5" : "px-3.5 py-3 sm:px-4 sm:py-3.5"}
        ${SHELL[visual]}
        ${interactive ? "cursor-pointer active:scale-[0.995]" : ""}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      {/* Class-response fill, drawn behind the content so it costs no height. */}
      {distributionPct !== undefined && (
        <div
          className={`absolute inset-y-0 left-0 ${FILL[visual]} transition-[width] duration-700 ease-out`}
          style={{ width: `${Math.max(0, Math.min(100, distributionPct))}%` }}
          aria-hidden="true"
        />
      )}

      <div className={`relative z-10 flex items-center ${display ? "gap-[0.5em]" : "gap-3"}`}>
        <span
          className={`flex shrink-0 items-center justify-center font-mono font-bold transition-colors
            ${
              display
                ? "h-[1.5em] w-[1.5em] text-[0.7em]"
                : compact
                  ? "h-6 w-6 text-xs"
                  : "h-7 w-7 text-xs sm:h-8 sm:w-8 sm:text-sm"
            }
            ${multi ? "rounded-md" : "rounded-full"} ${BADGE[visual]}`}
        >
          {optionLetter(index)}
        </span>

        <div className={`min-w-0 flex-1 ${display ? "" : compact ? "text-sm" : "text-sm sm:text-[15px]"}`}>
          <span className="live-prose" dangerouslySetInnerHTML={{ __html: renderMathInRichText(html) }} />
          {imageUrl && (
            <img
              src={imageUrl}
              alt={`Option ${optionLetter(index)}`}
              className={`mt-1.5 max-w-full rounded-lg border border-border/60 ${display ? "max-h-[4em]" : compact ? "max-h-24" : "max-h-32"}`}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {distributionLabel && (
            <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
              {distributionLabel}
            </span>
          )}
          {(visual === "correct-picked" || visual === "correct-missed") && (
            <Check className="h-4 w-4 text-emerald-600" />
          )}
          {visual === "wrong-picked" && <X className="h-4 w-4 text-rose-600" />}
          {showShortcut && visual !== "selected" && (
            <kbd className="hidden sm:inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/70 bg-muted/60 px-1 font-mono text-[10px] font-semibold text-muted-foreground">
              {optionLetter(index)}
            </kbd>
          )}
        </div>
      </div>
    </Tag>
  );
}

/**
 * Memoised because the creator's control room re-renders roughly once a second
 * while a question is open (the answered count polls at 750ms). Without this,
 * every one of those ticks re-ran a KaTeX pass over the option's rich text — and the props that
 * decide its output only change when the question does.
 */
export default memo(LiveOption);
