/**
 * LiveTimeControls.tsx — the recovery controls: A3, A3b and A10.
 *
 * These are the most human controls in the product. A live class never runs to
 * the schedule a creator wrote the night before, and a space bar is easy to
 * fat-finger in front of thirty people. Without them the creator is a servant of
 * their own past estimate and their own last keystroke.
 *
 * A3 and A3b are the same control pointing in opposite directions, which is why
 * they share a row: +30s/+60s when the room is still working, "Time's up" when it
 * plainly is not and the only thing still happening is a ring emptying itself in
 * front of thirty bored people. Both edit the one term every deadline expression
 * in this system shares — extra_seconds — so neither introduces a second
 * definition of "closed". See 20260811000000_live_v2_flush_remaining_time.sql.
 *
 * P0 note — the undo bar is CSS, not JavaScript
 * ---------------------------------------------
 * A depleting five-second bar is exactly the kind of thing that invites a second
 * `setInterval` into the page, which is the cost Phase 0 spent its whole effort
 * removing: the countdown used to re-render the leaderboard, the rail and the
 * question preview four times a second. One linear CSS keyframe animates the bar
 * with zero JS ticks and zero re-renders. The pill's disappearance is driven by
 * data the control room is already polling, not by a new timer.
 */

import { Plus, TimerOff, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Matches undo_last_live_unlock's server-side window. */
export const UNDO_WINDOW_MS = 5000;

export type LiveTimeControlsProps = {
  /** False whenever the visual countdown is not running — A3 is refused past zero. */
  canAddTime: boolean;
  /** Seconds already granted on this question. */
  extraSeconds: number;
  /** Server cap; the buttons disable rather than letting the RPC refuse. */
  maxExtraSeconds?: number;
  onAddTime: (seconds: 30 | 60) => void;
  /**
   * A3b — remove the seconds still on the clock, and nothing else.
   *
   * The handler is expected to call end_live_question_time and then stop. It must
   * not close, grade, advance or end anything: the deadline moves onto now(), the
   * countdown reaches zero the way it always does, and every downstream flow —
   * the 2s grace, the analytics pass, the reveal, the unlock button arming itself
   * — runs by exactly the route a natural expiry takes. A second orchestration
   * here would be a second definition of "the question is over", and the first
   * time the two drift they do so in front of a class.
   */
  onEndTime: () => void;
  pending?: boolean;
};

export function AddTimeControls({
  canAddTime,
  extraSeconds,
  maxExtraSeconds = 300,
  onAddTime,
  onEndTime,
  pending = false,
}: LiveTimeControlsProps) {
  // A3b hangs off A3's gate on purpose. `canAddTime` is really "the visual
  // countdown is running", and past zero there are no seconds left to remove —
  // the RPC answers ENDTIME_ALREADY_OVER, because moving a deadline the room has
  // already passed would retract a reveal students may be looking at. A button
  // that lingers and is always refused teaches the creator, mid-class, that the
  // control is unreliable; one that leaves with the extensions says the clock is
  // finished, which is the truth.
  if (!canAddTime) return null;

  const remaining = Math.max(0, maxExtraSeconds - extraSeconds);

  return (
    <div className="flex items-center gap-1.5">
      {([30, 60] as const).map((s) => (
        <Button
          key={s}
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs font-semibold tabular-nums"
          disabled={pending || remaining < s}
          onClick={() => onAddTime(s)}
          title={
            remaining < s
              ? `Only ${remaining}s of extension left on this question`
              : `Give the class ${s} more seconds`
          }
        >
          <Plus className="mr-0.5 h-3.5 w-3.5" />
          {s}s
        </Button>
      ))}
      {extraSeconds > 0 && (
        <span
          className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-600"
          title="Extra time granted on this question"
        >
          +{extraSeconds}s
        </span>
      )}

      {/* A rule, not just a gap. Everything to the left of it hands time out and
          reports how much has been handed out; the one control to its right takes
          the rest away and cannot be taken back. Laid out flush against the
          others, "+30s +60s Time's up" scans at a glance as a third grant, and the
          glance is all a creator gets while a room is watching them. */}
      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* A3b. Deliberately NOT the deck's primary action and NOT destructive-red:
          it neither advances the session nor throws anything away — it is the
          creator saying out loud what the room already knows. The consequence
          copy lives in the tooltip rather than in a confirm dialog, because a
          modal in front of a class costs more than the mistake does: the next
          unlock is one keystroke away either way. */}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2.5 text-xs font-semibold"
        disabled={pending}
        onClick={onEndTime}
        title="End the clock now. It removes the seconds still on it and nothing else — an answer already on its way still lands, and the question closes exactly the way it does when the time simply runs out."
      >
        <TimerOff className="mr-1 h-3.5 w-3.5" />
        Time's up
      </Button>
    </div>
  );
}

export type UndoPillProps = {
  /** Epoch ms the window closes. Drives only the CSS animation duration. */
  closesAtMs: number;
  onUndo: () => void;
  pending?: boolean;
};

/**
 * The "wait, no" control.
 *
 * Click-only, deliberately: `space` unlocks, and putting a keyboard undo next to
 * it invites a second accident on top of the first.
 */
export function UndoPill({ closesAtMs, onUndo, pending = false }: UndoPillProps) {
  // Read once at mount. The bar's job is to look like time passing, not to be a
  // clock — and the authoritative window is enforced server-side anyway, so a
  // few milliseconds of drift here costs nothing.
  const remainingMs = Math.max(0, closesAtMs - Date.now());
  if (remainingMs <= 0) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/[0.08]">
      {/* Pure CSS depletion. No interval, no state, no re-render. */}
      <div
        className="absolute inset-y-0 left-0 bg-amber-500/20 live-undo-drain"
        style={{ animationDuration: `${remainingMs}ms` }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onUndo}
        disabled={pending}
        className="relative z-10 flex w-full items-center justify-center gap-2 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors hover:text-amber-900 disabled:opacity-60 dark:text-amber-300 dark:hover:text-amber-100"
      >
        <Undo2 className="h-4 w-4" />
        Undo unlock
      </button>
    </div>
  );
}
