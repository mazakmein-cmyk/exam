/**
 * LiveTimeControls.tsx — the two recovery controls, A3 and A10.
 *
 * These are the most human controls in the product. A live class never runs to
 * the schedule a creator wrote the night before, and a space bar is easy to
 * fat-finger in front of thirty people. Without them the creator is a servant of
 * their own past estimate and their own last keystroke.
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

import { Plus, Undo2 } from "lucide-react";
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
  pending?: boolean;
};

export function AddTimeControls({
  canAddTime,
  extraSeconds,
  maxExtraSeconds = 300,
  onAddTime,
  pending = false,
}: LiveTimeControlsProps) {
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
