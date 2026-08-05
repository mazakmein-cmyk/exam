/**
 * LiveOption.tsx — one answer choice, shared by the student screen, the creator
 * preview and the focus screen.
 *
 * Colour discipline matters most here. Violet always means "your choice",
 * emerald always means "correct", rose always means "wrong". The old screens
 * used emerald for both selection and correctness, which made a picked option
 * look already-right before the reveal.
 *
 * Display mode does not use those tokens at all
 * --------------------------------------------
 * `bg-card` is white in the app's light theme, and the focus screen renders on
 * its own dark frame with inherited white text. The two facts met here: every
 * projected option came out as a white rectangle with white text inside it —
 * present but unreadable, on the one screen a whole room is looking at. It is the
 * failure mode of borrowing a viewer-themed token for a surface whose theme is a
 * broadcast decision, so display mode answers to the stage's own variables
 * instead (see lib/live/stageTheme.ts) and cannot drift with the app's.
 */

import { memo } from "react";

import { Check, X } from "lucide-react";
import { renderMathInRichText } from "@/lib/renderMath";

export type OptionVisual =
  /** not chosen, still choosable */
  | "idle"
  /** the student's current pick, before the reveal */
  | "selected"
  /**
   * Q15b: the revealed correct answer on a screen with no viewer of its own.
   *
   * The three visuals below all encode a relationship between the key and one
   * person's pick, which is the right frame on a phone and the wrong one on a
   * wall — a room has no pick. This is the key stated plainly, and it is what the
   * focus screen sends.
   */
  | "correct"
  /** revealed correct answer, which the student also picked */
  | "correct-picked"
  /** revealed correct answer the student missed */
  | "correct-missed"
  /** the student's pick, revealed as wrong */
  | "wrong-picked"
  /** revealed, untouched by this student */
  | "quiet";

/** Every visual that says "this is the answer", however the viewer got there. */
function isCorrectVisual(visual: OptionVisual): boolean {
  return visual === "correct" || visual === "correct-picked" || visual === "correct-missed";
}

const SHELL: Record<OptionVisual, string> = {
  idle: "border-border/70 bg-card hover:border-primary/50 hover:bg-primary/[0.04]",
  selected: "border-primary bg-primary/[0.07] ring-1 ring-primary/40",
  correct: "border-emerald-500 bg-emerald-500/[0.09]",
  "correct-picked": "border-emerald-500 bg-emerald-500/[0.09] ring-1 ring-emerald-500/40",
  "correct-missed": "border-emerald-500/70 border-dashed bg-emerald-500/[0.06]",
  "wrong-picked": "border-rose-500 bg-rose-500/[0.08] ring-1 ring-rose-500/40",
  quiet: "border-border/60 bg-muted/20 opacity-70",
};

const BADGE: Record<OptionVisual, string> = {
  idle: "bg-muted text-muted-foreground",
  selected: "bg-primary text-primary-foreground",
  correct: "bg-emerald-500 text-white",
  "correct-picked": "bg-emerald-500 text-white",
  "correct-missed": "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40",
  "wrong-picked": "bg-rose-500 text-white",
  quiet: "bg-muted text-muted-foreground",
};

const FILL: Record<OptionVisual, string> = {
  idle: "bg-foreground/[0.05]",
  selected: "bg-primary/10",
  correct: "bg-emerald-500/15",
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

/**
 * Stage styling, in ems and stage variables.
 *
 * Radius and border width scale with the measured font size for the same reason
 * padding does: a 12px corner and a 1px edge that look considered at 15px look
 * like a rendering error at 80px. `max(1px, …)` keeps the border from vanishing on
 * a small window while letting it thicken into something a projector can throw.
 */
const STAGE_SHELL: React.CSSProperties = {
  color: "var(--stage-fg)",
  background: "var(--stage-surface)",
  borderColor: "var(--stage-line)",
  borderWidth: "max(1px, 0.03em)",
  borderRadius: "0.42em",
};

const STAGE_BADGE: React.CSSProperties = {
  background: "var(--stage-surface-2)",
  color: "var(--stage-fg)",
};

/**
 * Q15b: the same card, once the wall is allowed to say which one was right.
 *
 * `--stage-good` and not emerald-500, for the reason the whole stage palette
 * exists: emerald-500 on the light frame is a mid-tone on near-white and vanishes
 * at five metres, and the light theme's green is deliberately the darker 700 end
 * of the ramp. The tint is layered with color-mix over the frame's own surface so
 * it reads as the same card lit up rather than a differently-built one.
 *
 * The edge is doubled with an INSET SHADOW rather than a thicker border, and that
 * is layout, not taste. This style replaces the neutral one at the instant a
 * question closes, inside a subtree whose font size was measured to fit the
 * frame. A wider border shrinks the content box, which can rewrap one option onto
 * an extra line, which overflows the measured box, which re-fits the whole
 * question — a visible zoom of the wall at the exact moment the room is looking
 * at it. A shadow takes part in no layout at all, so the card is the same size
 * before and after.
 */
const STAGE_SHELL_CORRECT: React.CSSProperties = {
  color: "var(--stage-fg)",
  background: "color-mix(in srgb, var(--stage-good) 16%, var(--stage-surface))",
  borderColor: "var(--stage-good)",
  borderWidth: "max(1px, 0.03em)",
  borderRadius: "0.42em",
  boxShadow: "inset 0 0 0 max(1px, 0.03em) var(--stage-good)",
};

const STAGE_BADGE_CORRECT: React.CSSProperties = {
  background: "var(--stage-good)",
  // Both themes' `good` is a saturated green chosen to sit on the frame, so the
  // letter on top of it takes the frame's own ink rather than a fixed white.
  color: "var(--stage-bg)",
};

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
  reserveMark = false,
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
  /**
   * Display mode only (Q15b): hold the space for the correct-answer tick from the
   * first paint, whether or not this option turns out to be the answer.
   *
   * Without it the tick appears at reveal and takes room out of the text column,
   * which can rewrap an option and re-fit the whole question in front of the
   * class. The focus screen sets it on every option whenever the reveal setting
   * is on, so the frame holds one shape from the first paint to the last.
   */
  reserveMark?: boolean;
}) {
  const interactive = !!onClick && !disabled;
  const Tag: any = interactive ? "button" : "div";
  const correct = isCorrectVisual(visual);

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={interactive ? onClick : undefined}
      disabled={interactive ? false : undefined}
      aria-pressed={interactive ? visual === "selected" : undefined}
      style={display ? (correct ? STAGE_SHELL_CORRECT : STAGE_SHELL) : undefined}
      /*
        transition-all is app-modes only, and that is load-bearing, not taste.
        In display mode every dimension of this card is in ems of an INHERITED
        font size, and `all` includes font-size — so when the projector's fit
        hook probed a new size, the card transitioned towards it instead of
        assuming it. Probes are synchronous; a transition at t=0 still reports
        its starting layout. Every probe therefore measured the options at the
        OLD size, the search concluded that huge text fits, and the options were
        clipped off the bottom of the wall 150ms later. The wall is never
        interactive, so the transition bought nothing there to begin with.
      */
      className={`relative w-full overflow-hidden border text-left
        ${display ? "px-[0.6em] py-[0.5em]" : `rounded-xl transition-all ${compact ? "px-3 py-2.5" : "px-3.5 py-3 sm:px-4 sm:py-3.5"}`}
        ${display ? "" : SHELL[visual]}
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

      <div className={`relative z-10 flex items-center ${display ? "gap-[0.55em]" : "gap-3"}`}>
        <span
          style={display ? (correct ? STAGE_BADGE_CORRECT : STAGE_BADGE) : undefined}
          className={`flex shrink-0 items-center justify-center font-mono font-bold transition-colors
            ${
              display
                ? "h-[1.5em] w-[1.5em] text-[0.7em]"
                : compact
                  ? "h-6 w-6 text-xs"
                  : "h-7 w-7 text-xs sm:h-8 sm:w-8 sm:text-sm"
            }
            ${multi ? "rounded-md" : "rounded-full"} ${display ? "" : BADGE[visual]}`}
        >
          {optionLetter(index)}
        </span>

        <div className={`min-w-0 flex-1 ${display ? "" : compact ? "text-sm" : "text-sm sm:text-[15px]"}`}>
          <span className="live-prose" dangerouslySetInnerHTML={{ __html: renderMathInRichText(html) }} />
          {imageUrl && (
            <img
              src={imageUrl}
              alt={`Option ${optionLetter(index)}`}
              style={display ? { borderColor: "var(--stage-line)" } : undefined}
              className={`max-w-full rounded-lg border ${display ? "mt-[0.35em] max-h-[4em]" : "mt-1.5 border-border/60"} ${display ? "" : compact ? "max-h-24" : "max-h-32"}`}
            />
          )}
        </div>

        <div className={`flex shrink-0 items-center ${display ? "gap-[0.4em]" : "gap-2"}`}>
          {distributionLabel && (
            <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
              {distributionLabel}
            </span>
          )}
          {/*
            Q15b on the wall. Em-sized like everything else in the measured
            subtree — an h-4 tick beside a 70px option is a speck — and rendered
            whether or not this is the answer, so its width is spent before the
            reveal rather than at it. `visibility` and not a conditional: hidden
            still occupies its box, which is the entire point.
          */}
          {display && (reserveMark || correct) && (
            <Check
              aria-hidden={!correct}
              strokeWidth={3}
              style={{
                width: "1.15em",
                height: "1.15em",
                color: "var(--stage-good)",
                visibility: correct ? "visible" : "hidden",
              }}
            />
          )}
          {display && correct && <span className="sr-only">Correct answer</span>}
          {!display && (visual === "correct" || visual === "correct-picked" || visual === "correct-missed") && (
            <Check className="h-4 w-4 text-emerald-600" />
          )}
          {!display && visual === "wrong-picked" && <X className="h-4 w-4 text-rose-600" />}
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
