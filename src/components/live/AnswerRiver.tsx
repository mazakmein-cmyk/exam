/**
 * AnswerRiver.tsx — B9. Answers landing, live, before the reveal.
 *
 * Three reasons this exists, in order of how much they matter:
 *
 *  1. Waiting stops being dead time. Thirty seconds of a static question is when
 *     a room gets restless; thirty seconds of a bar filling is when it watches.
 *  2. The creator gets an early read. If one bar runs away before the timer ends,
 *     they can start composing what to say instead of discovering it at the
 *     reveal.
 *  3. It is the most shareable four seconds the product has.
 *
 * Safe to project — by construction, not by convention
 * ---------------------------------------------------
 * There is no `correct` prop. This component cannot mark an answer even if a
 * caller wanted it to: options render in fixed order, in one neutral colour, with
 * no glyph. A sharp student in the back row watching the wall learns how the room
 * is split and nothing about who is right.
 *
 * Performance
 * -----------
 * Animated with `transform: scaleX`, never `width`. Width animation re-runs
 * layout on every frame for every bar; transform is composited. Combined with a
 * transition matched to the 750ms poll, discrete updates read as continuous
 * motion, which is why the poll can stay at 750ms instead of chasing 60fps.
 */

import { memo } from "react";
import { optionLabel, toPercentages } from "@/lib/live/optionTally.js";

export type AnswerRiverProps = {
  /** Per-option counts, index-aligned. */
  counts: number[];
  /** Distinct students who have answered — the percentage denominator. */
  responders: number;
  /** Denominator for the fill width; the room size, so bars grow toward "everyone". */
  roomSize: number;
  /** Multi-select counts selections, not students, and must say so. */
  isMulti?: boolean;
  /** Projector sizing. */
  display?: boolean;
  className?: string;
};

function AnswerRiver({
  counts,
  responders,
  roomSize,
  isMulti = false,
  display = false,
  className = "",
}: AnswerRiverProps) {
  if (!counts.length) return null;

  const percentages = toPercentages(counts, responders);
  // Scaled against the room rather than against the leader, so a bar's length
  // means "this many of us" and does not rescale every time someone answers.
  const denominator = Math.max(roomSize, responders, 1);

  return (
    <div className={`space-y-1.5 ${className}`} aria-hidden="true">
      {counts.map((count, i) => {
        const fill = Math.min(1, count / denominator);
        return (
          <div
            key={i}
            className={`flex items-center gap-2 ${display ? "text-[0.6em]" : "text-xs"}`}
          >
            <span
              className={`shrink-0 font-mono font-bold tabular-nums ${
                display ? "w-[1.2em] text-white/50" : "w-4 text-muted-foreground"
              }`}
            >
              {optionLabel(i)}
            </span>

            <div
              className={`relative min-w-0 flex-1 overflow-hidden rounded-full ${
                display ? "h-[0.7em] bg-white/10" : "h-2 bg-muted"
              }`}
            >
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-700 ease-out ${
                  display ? "bg-white/45" : "bg-primary/45"
                }`}
                style={{ transform: `scaleX(${fill})`, willChange: "transform" }}
              />
            </div>

            <span
              className={`shrink-0 tabular-nums ${
                display ? "w-[2.6em] text-right text-white/50" : "w-9 text-right text-muted-foreground"
              }`}
            >
              {count > 0 ? `${percentages[i]}%` : "—"}
            </span>
          </div>
        );
      })}

      {isMulti && (
        <p
          className={`pt-0.5 ${
            display ? "text-[0.45em] text-white/35" : "text-[10px] text-muted-foreground"
          }`}
        >
          Multiple answers allowed — these count selections, not students.
        </p>
      )}
    </div>
  );
}

/**
 * Memoised because the control room re-renders on every 750ms tally poll, and
 * this sits inside the deck. Counts are a fresh array each poll, so the memo only
 * helps when nothing changed — which is most of the time, once everyone has
 * answered.
 */
export default memo(AnswerRiver, (a, b) => {
  if (
    a.responders !== b.responders ||
    a.roomSize !== b.roomSize ||
    a.isMulti !== b.isMulti ||
    a.display !== b.display ||
    a.className !== b.className ||
    a.counts.length !== b.counts.length
  ) {
    return false;
  }
  return a.counts.every((c, i) => c === b.counts[i]);
});
