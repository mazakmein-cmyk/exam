/**
 * StageTimer.tsx — the clock, built for a wall and a camera.
 *
 * Why not the shared TimerRing
 * ---------------------------
 * `LiveTimer`'s ring is a control-room instrument: fixed pixel size, app tokens,
 * one idle string. On the focus screen the same three assumptions each break.
 *
 *  - **Size.** A ring measured in pixels is correct on the laptop that authored it
 *    and wrong on every projector after it. Here the whole clock is drawn inside a
 *    100×100 viewBox — ring, digits and caption together — so it scales with its
 *    column and the type never drifts out of proportion with the circle.
 *  - **Colour.** It has to answer to the stage theme, not to the app's, because
 *    amber-400 on the light stage is around 1.8:1 and the timer is the one element
 *    that has to be legible from the back row.
 *  - **Idle.** "No question yet", "time is up" and "session over" are three
 *    different silences, and on the old wall two of them rendered as a hollow grey
 *    ring with a word in it — the least informative pixels on screen occupying the
 *    largest object in the right-hand column. Each is now a designed state, and
 *    "time up" in particular says what it means for the room: answers are locked.
 *
 * The last ten seconds
 * -------------------
 * mm:ss is the right format for a two-minute question and the wrong one for the
 * final count. Under ten seconds the clock switches to a single large digit,
 * because that is the thing a room counts down out loud, and because "0:07"
 * scanned from thirty feet away is four glyphs where one would do.
 *
 * Performance
 * ----------
 * Both components subscribe to the countdown store themselves, per the rule in
 * LiveTimer.tsx: the ticking value must never pass through a page's state, or the
 * whole wall re-renders once a second for the length of every question.
 */

import { formatClock, timerTone, type TimerTone } from "@/components/live/LiveTimer";
import { useLiveCountdown } from "@/lib/live/timerStore";

/** What the clock should say when no question is counting down. */
export type StageIdleState =
  /** Before the first unlock. */
  | "ready"
  /** A question is open but out of time — the reveal window. */
  | "locked"
  /** The session has ended. */
  | "done";

const TONE_COLOR: Record<TimerTone, string> = {
  calm: "var(--stage-accent)",
  warn: "var(--stage-warn)",
  critical: "var(--stage-crit)",
  idle: "var(--stage-faint)",
};

const IDLE_COPY: Record<StageIdleState, { label: string; caption: string; captionColor: string }> = {
  ready: { label: "Ready", caption: "waiting to start", captionColor: "var(--stage-faint)" },
  locked: { label: "Time up", caption: "answers locked", captionColor: "var(--stage-crit)" },
  done: { label: "Finished", caption: "session over", captionColor: "var(--stage-faint)" },
};

/** Ring geometry, in viewBox units. */
const R = 42;
const STROKE = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * The big clock for the right-hand column.
 *
 * Fills the width it is given; pass a max-width on the wrapper rather than a size
 * in pixels.
 */
export function StageClock({
  idle,
  className = "",
}: {
  idle: StageIdleState;
  className?: string;
}) {
  const { remaining, total, running } = useLiveCountdown();

  const tone = running ? timerTone(remaining, total) : "idle";
  const progress = running && total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const finalCount = running && remaining <= 10;
  const copy = IDLE_COPY[idle];

  return (
    <div
      role="timer"
      aria-label={running ? `${remaining} seconds remaining` : copy.label}
      className={`relative w-full ${className}`}
    >
      <svg viewBox="0 0 100 100" className="w-full" aria-hidden="true">
        {/*
          The track is drawn in the strong hairline rather than the faint one: it
          is the shape that tells a room "there is a clock here" while the ring is
          nearly empty, and at five metres the faint line simply is not there.
        */}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth={STROKE}
          style={{ stroke: "var(--stage-line-strong)" }}
        />

        {running && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 50 50)"
            className="transition-[stroke-dashoffset] duration-500 ease-linear"
            style={{ stroke: TONE_COLOR[tone] }}
          />
        )}

        {running ? (
          <>
            <text
              x="50"
              y={finalCount ? 54 : 52}
              textAnchor="middle"
              dominantBaseline="middle"
              className={`font-mono font-bold ${finalCount ? "animate-pulse" : ""}`}
              style={{
                fill: TONE_COLOR[tone],
                fontSize: finalCount ? 38 : 21,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {finalCount ? remaining : formatClock(remaining)}
            </text>
            {!finalCount && (
              <text
                x="50"
                y="68"
                textAnchor="middle"
                className="font-semibold uppercase"
                style={{ fill: "var(--stage-faint)", fontSize: 5.6, letterSpacing: 1.4 }}
              >
                remaining
              </text>
            )}
          </>
        ) : (
          <>
            <text
              x="50"
              y="48"
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-display font-bold"
              style={{ fill: "var(--stage-fg)", fontSize: 13.5, letterSpacing: -0.2 }}
            >
              {copy.label}
            </text>
            <text
              x="50"
              y="64"
              textAnchor="middle"
              className="font-semibold uppercase"
              style={{ fill: copy.captionColor, fontSize: 5.6, letterSpacing: 1.4 }}
            >
              {copy.caption}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/**
 * The depletion hairline across the very top of the frame.
 *
 * Thicker than the app's 3px version on purpose. This is the one piece of timer
 * information a stream viewer on a phone can read without looking for it, and at
 * 360p a three-pixel line is a suggestion of a line.
 */
export function StageTimerBar() {
  const { remaining, total, running } = useLiveCountdown();
  const tone = running ? timerTone(remaining, total) : "idle";
  const pct = running && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <div
      className="h-[6px] w-full overflow-hidden"
      style={{ background: "var(--stage-line)" }}
      aria-hidden="true"
    >
      <div
        className="h-full transition-[width] duration-500 ease-linear"
        style={{ width: `${pct}%`, background: TONE_COLOR[tone] }}
      />
    </div>
  );
}
