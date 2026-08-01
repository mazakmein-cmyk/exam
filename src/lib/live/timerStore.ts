/**
 * timerStore.ts — the live countdown, kept out of React state on purpose.
 *
 * The problem this solves
 * ----------------------
 * The countdown used to live in `useState` at the top of both live pages,
 * updated by a 250ms interval. React cannot re-render "just the timer" from
 * there: every tick re-rendered the entire page — leaderboard, question rail,
 * question preview, every stat tile — four times a second, for the whole
 * length of every question. At 30 students that is merely wasteful. On the
 * creator's control room with a few hundred participants it is the single
 * largest source of the interaction lag this refactor exists to remove.
 *
 * The shape of the fix
 * -------------------
 * The ticking value lives in an external store, and there are two ways to read
 * it, deliberately kept separate:
 *
 *   useLiveCountdown()      changes ~1x/second. ONLY mm:ss displays and rings
 *                           may use this. It re-renders its subscriber every
 *                           second, so its subscriber must be a leaf.
 *
 *   useLiveTimerPhase()     changes ONCE per question, when the clock hits
 *                           zero. Pages use this. Anything asking "is a
 *                           question still open?" wants this, not a
 *                           `remaining > 0` test on a value that churns.
 *
 * Getting that split right is the whole point: the page-level condition and the
 * displayed number look like the same fact, and treating them as the same fact
 * is what put a 4Hz re-render on the page in the first place.
 *
 * Ticks also stop entirely when no question is open, so an idle control room
 * and a finished exam cost nothing.
 */

import { useEffect, useSyncExternalStore } from "react";
import { isRunning, remainingSeconds, totalSeconds, visualEndMs } from "./deadline.js";

/** How often the wall clock is sampled. 250ms so the visible second never lags. */
const TICK_MS = 250;

export type TimerTarget = {
  /**
   * Identifies what is being timed — the question ordinal in practice. Carried
   * through to the expiry event so a listener can tell "question 6 just ended"
   * from a stale event for a question that has already been superseded.
   */
  key: number;
  /** Epoch ms the visible countdown reaches zero (grace excluded). */
  endMs: number | null;
  /** Allotted + granted seconds — the denominator for rings and bars. */
  totalSeconds: number;
};

export type CountdownSnapshot = {
  /** Whole seconds left, never negative. */
  remaining: number;
  /** Allotted + granted seconds. */
  total: number;
  /** 0..1 of the question still to run. */
  fraction: number;
  /** False once the clock has reached zero, or when nothing is open. */
  running: boolean;
};

export type PhaseSnapshot = {
  key: number;
  running: boolean;
};

export type ExpiryListener = (key: number) => void;

const IDLE_COUNTDOWN: CountdownSnapshot = {
  remaining: 0,
  total: 0,
  fraction: 0,
  running: false,
};

export type LiveTimerStore = {
  setTarget: (target: TimerTarget) => void;
  clear: () => void;
  /** Injected by the session spine so the countdown runs on server-corrected time. */
  setNowProvider: (fn: () => number) => void;
  onExpire: (listener: ExpiryListener) => () => void;
  subscribeCountdown: (listener: () => void) => () => void;
  getCountdown: () => CountdownSnapshot;
  subscribePhase: (listener: () => void) => () => void;
  getPhase: () => PhaseSnapshot;
};

export function createLiveTimerStore(): LiveTimerStore {
  let target: TimerTarget = { key: -1, endMs: null, totalSeconds: 0 };
  let nowProvider: () => number = () => Date.now();

  const countdownListeners = new Set<() => void>();
  const phaseListeners = new Set<() => void>();
  const expiryListeners = new Set<ExpiryListener>();

  // useSyncExternalStore compares snapshots by identity, so these are rebuilt
  // only when a value actually changes. Returning a fresh object per call would
  // spin React forever.
  let countdown: CountdownSnapshot = IDLE_COUNTDOWN;
  let phase: PhaseSnapshot = { key: -1, running: false };

  let interval: ReturnType<typeof setInterval> | null = null;
  /** Keys already announced as expired, so the event fires exactly once. */
  let expiredKey: number | null = null;
  /** True once this target has been observed with time still on the clock. */
  let wasCountingDown = false;

  const emit = (listeners: Set<() => void>) => {
    listeners.forEach((l) => {
      l();
    });
  };

  const recompute = () => {
    const now = nowProvider();
    const running = isRunning(target.endMs, now);
    const remaining = remainingSeconds(target.endMs, now);

    // Snapshots change at most once a second, never at the 250ms tick rate.
    // The tick exists so the *visible second* is never late; the ring's own CSS
    // transition does the smoothing between seconds. Emitting sub-second
    // fractions here would put a 4Hz re-render back into the leaf for no
    // visible gain.
    if (
      remaining !== countdown.remaining ||
      running !== countdown.running ||
      target.totalSeconds !== countdown.total
    ) {
      countdown = {
        remaining,
        total: target.totalSeconds,
        fraction: target.totalSeconds > 0 ? remaining / target.totalSeconds : 0,
        running,
      };
      emit(countdownListeners);
    }

    if (running !== phase.running || target.key !== phase.key) {
      phase = { key: target.key, running };
      emit(phaseListeners);
    }

    // Expiry fires only for a target that was genuinely counting down. A target
    // set with an already-past deadline (rejoining a question whose time ran
    // out while the tab was away) must not replay the event — the pages have
    // their own recovery path for that, and firing here would double-compute
    // analytics.
    if (
      !running &&
      target.endMs !== null &&
      expiredKey !== target.key &&
      wasCountingDown
    ) {
      expiredKey = target.key;
      expiryListeners.forEach((l) => {
        l(target.key);
      });
    }

    if (!running) stopTicking();
  };

  const startTicking = () => {
    if (interval !== null) return;
    interval = setInterval(recompute, TICK_MS);
  };

  const stopTicking = () => {
    if (interval === null) return;
    clearInterval(interval);
    interval = null;
  };

  // A backgrounded tab throttles timers to roughly 1/second, so the displayed
  // value can be a second stale on return. Recompute immediately instead of
  // waiting for the next tick to land.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") recompute();
    });
  }

  return {
    setTarget(next: TimerTarget) {
      const changed =
        next.key !== target.key ||
        next.endMs !== target.endMs ||
        next.totalSeconds !== target.totalSeconds;
      if (!changed) return;

      // A new key is a new question; the same key with a later deadline is A3
      // granting time, which must re-arm the expiry that has not fired yet.
      if (next.key !== target.key) {
        expiredKey = null;
        wasCountingDown = false;
      } else if (
        next.endMs !== null &&
        target.endMs !== null &&
        next.endMs > target.endMs
      ) {
        expiredKey = null;
      }

      target = next;
      const stillRunning = isRunning(target.endMs, nowProvider());
      if (stillRunning) wasCountingDown = true;
      recompute();
      if (stillRunning) startTicking();
    },

    clear() {
      target = { key: -1, endMs: null, totalSeconds: 0 };
      expiredKey = null;
      wasCountingDown = false;
      stopTicking();
      if (countdown !== IDLE_COUNTDOWN) {
        countdown = IDLE_COUNTDOWN;
        emit(countdownListeners);
      }
      if (phase.running || phase.key !== -1) {
        phase = { key: -1, running: false };
        emit(phaseListeners);
      }
    },

    setNowProvider(fn: () => number) {
      nowProvider = fn;
      recompute();
    },

    onExpire(listener: ExpiryListener) {
      expiryListeners.add(listener);
      return () => {
        expiryListeners.delete(listener);
      };
    },

    subscribeCountdown(listener: () => void) {
      countdownListeners.add(listener);
      if (isRunning(target.endMs, nowProvider())) startTicking();
      return () => {
        countdownListeners.delete(listener);
      };
    },

    getCountdown() {
      return countdown;
    },

    subscribePhase(listener: () => void) {
      phaseListeners.add(listener);
      return () => {
        phaseListeners.delete(listener);
      };
    },

    getPhase() {
      return phase;
    },
  };
}

/**
 * One countdown per document. The present window (A2) is a separate document
 * and therefore gets its own instance for free, which is the behaviour we want
 * — it must keep ticking whether or not the control room is open.
 */
export const liveTimerStore = createLiveTimerStore();

/**
 * Subscribe to the ticking value. Re-renders roughly once a second.
 *
 * Use ONLY in leaf components that render the number itself. Calling this from
 * a page, or from anything that renders a list, reintroduces exactly the
 * whole-page re-render this store exists to remove.
 */
export function useLiveCountdown(): CountdownSnapshot {
  return useSyncExternalStore(
    liveTimerStore.subscribeCountdown,
    liveTimerStore.getCountdown,
    liveTimerStore.getCountdown
  );
}

/**
 * Subscribe to whether the clock is running. Changes once per question.
 *
 * This is what pages want. "Is a question still open" reads like the same
 * question as "how long is left", and it is not: one is a boolean that flips
 * once, the other churns every second.
 */
export function useLiveTimerPhase(): PhaseSnapshot {
  return useSyncExternalStore(
    liveTimerStore.subscribePhase,
    liveTimerStore.getPhase,
    liveTimerStore.getPhase
  );
}

/**
 * Point the countdown at the currently open question.
 *
 * The session spine deliberately knows nothing about questions, and the pages
 * deliberately do not do deadline arithmetic. This is the seam: session row in,
 * timer target out, with the arithmetic itself living in deadline.js next to the
 * SQL function of the same name.
 *
 * `timeSeconds` comes from the page because only the page has loaded the
 * questions, and it is legitimately null for a beat after an unlock arrives on
 * a slow connection — a null target means "no countdown", which is the honest
 * state rather than a timer counting down from zero.
 */
export function useLiveTimerTarget(params: {
  /** The open question's ordinal. Doubles as the expiry event's identity. */
  index: number;
  unlockedAt: string | null;
  extraSeconds: number;
  timeSeconds: number | null | undefined;
  /** False whenever no question should be counting down at all. */
  active: boolean;
}): void {
  const { index, unlockedAt, extraSeconds, timeSeconds, active } = params;

  useEffect(() => {
    if (!active || index < 0 || unlockedAt === null || timeSeconds === null || timeSeconds === undefined) {
      liveTimerStore.clear();
      return;
    }
    liveTimerStore.setTarget({
      key: index,
      endMs: visualEndMs(unlockedAt, timeSeconds, extraSeconds),
      totalSeconds: totalSeconds(timeSeconds, extraSeconds),
    });
  }, [active, index, unlockedAt, extraSeconds, timeSeconds]);
}

/**
 * Run a callback when the countdown reaches zero, once per question.
 *
 * Does not fire for a target that was already expired when it was set — a
 * student rejoining after a question ran out must not trigger the "time just
 * ended" path, and the creator must not recompute analytics a second time.
 */
export function useLiveTimerExpiry(listener: (key: number) => void): void {
  useEffect(() => liveTimerStore.onExpire(listener), [listener]);
}
