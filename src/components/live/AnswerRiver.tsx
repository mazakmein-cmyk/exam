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
 * Two colour systems, and the one rule that separates them
 * -------------------------------------------------------
 * In the control room these bars sit inside the app, are read by one person on
 * one device, and follow that person's own light/dark preference through the
 * app's semantic tokens. In `display` mode they are on a wall whose theme is a
 * broadcast decision the creator made from the control room, so they read only
 * from the stage's own variables (see lib/live/stageTheme.ts). Nothing here may
 * hold a token from the other side of that line in either direction — an app
 * token on the wall is the bug LiveOption's header describes, and a stage
 * variable in the control room resolves to nothing at all.
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

/**
 * The projected palette, and why not one value in it is a Tailwind class.
 *
 * Every colour below used to be a hard-coded white — the letter and the
 * percentage at 50%, the empty track at 10%, the fill at 45%, the footnote at
 * 35%. That was correct for exactly as long as the frame behind it was always
 * dark, which is precisely why the light theme could not simply be switched on:
 * on the near-white stage a white track under a white fill is not a faint block
 * of bars, it is nothing — present in the DOM, absent from the wall, and the room
 * is left watching a heading that promises an answer distribution over blank
 * space. Asking the frame what colour it is costs one variable lookup and cannot
 * go stale when a new theme is added.
 *
 * Hoisted to module scope rather than written inline because this component
 * re-renders on every 750ms tally poll with one row per option: an object
 * literal per bar per poll would hand React a new style identity each time for
 * values that never change, which is the opposite of what the memo below is for.
 */

/**
 * The option letter. `faint` is AA for large text only, and that is the right
 * tier here for the reason stageTheme.ts gives: this letter is a locator for the
 * row, not the fact the row carries — the same letter is on the option card
 * directly above it at full contrast, so a viewer who misses it loses nothing.
 */
const STAGE_LABEL: React.CSSProperties = { color: "var(--stage-faint)" };

/**
 * The percentage, which IS the fact — it is the only number on the wall that says
 * how the room split. `muted` clears 4.5:1 against both frames, because a share
 * that half the room reads as 31 and half reads as 81 is worse than no bar at all.
 */
const STAGE_VALUE: React.CSSProperties = { color: "var(--stage-muted)" };

/**
 * The empty track. `surface-2` is the raised-chip tier — the same tone the option
 * letter badge sits on — so a bar nobody has picked yet reads as part of the
 * frame's furniture rather than as a hole punched in it, which matters most in
 * the first seconds when every track is empty.
 */
const STAGE_TRACK: React.CSSProperties = { background: "var(--stage-surface-2)" };

/**
 * The fill. In the app this bar is `bg-primary/45`; the stage's accent is what
 * that brand violet becomes once the frame is allowed to pick its own theme, and
 * the light theme deliberately takes the darker 600 end of the ramp so the bar
 * still reads on near-white instead of dissolving into it.
 *
 * At full strength, not at 45%. The softness is right in the control room, where
 * the bars are one instrument among a dozen on a dense screen; on a wall this is
 * the object the room is actually watching, and a translucent bar at five metres
 * through a weak projector is a rumour of a bar.
 *
 * One colour for every bar, always — that is half of the neutrality guarantee in
 * the header, and the accent can carry no per-person meaning here the way violet
 * does on a phone, because a wall has no "your choice" to mean.
 */
const STAGE_FILL: React.CSSProperties = { background: "var(--stage-accent)" };

/** The multi-select footnote: a unit, never the carrier of a fact — `faint`. */
const STAGE_NOTE: React.CSSProperties = { color: "var(--stage-faint)" };

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
            {/*
              The className ternaries below carry geometry only, and the colour
              moved out into `style`. Keeping both in the class string is what let
              a projected surface quietly inherit an app token in the first place:
              the two concerns look identical in a template literal, so the palette
              rule cannot be read off the code and nothing enforces it.
            */}
            <span
              className={`shrink-0 font-mono font-bold tabular-nums ${
                display ? "w-[1.2em]" : "w-4 text-muted-foreground"
              }`}
              style={display ? STAGE_LABEL : undefined}
            >
              {optionLabel(i)}
            </span>

            <div
              className={`relative min-w-0 flex-1 overflow-hidden rounded-full ${
                display ? "h-[0.7em]" : "h-2 bg-muted"
              }`}
              style={display ? STAGE_TRACK : undefined}
            >
              <div
                className={`h-full w-full origin-left rounded-full transition-transform duration-700 ease-out ${
                  display ? "" : "bg-primary/45"
                }`}
                /*
                  The transform has to be inline — it is per-bar state — so the
                  stage fill is spread in beside it rather than given its own
                  attribute. Spreading `null` in app mode leaves the object with
                  exactly the two keys it has always had, and the class above
                  keeps the app's own bar colour.
                */
                style={{
                  transform: `scaleX(${fill})`,
                  willChange: "transform",
                  ...(display ? STAGE_FILL : null),
                }}
              />
            </div>

            <span
              className={`shrink-0 tabular-nums ${
                display ? "w-[2.6em] text-right" : "w-9 text-right text-muted-foreground"
              }`}
              style={display ? STAGE_VALUE : undefined}
            >
              {count > 0 ? `${percentages[i]}%` : "—"}
            </span>
          </div>
        );
      })}

      {isMulti && (
        <p
          className={`pt-0.5 ${
            display ? "text-[0.45em]" : "text-[10px] text-muted-foreground"
          }`}
          style={display ? STAGE_NOTE : undefined}
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
