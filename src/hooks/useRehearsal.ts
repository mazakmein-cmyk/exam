/**
 * useRehearsal.ts — the driver that runs a rehearsal session in memory.
 *
 * Presents the same shape as the real session spine (status, index, unlockedAt,
 * counts) so the control room renders from one set of derived values whether it is
 * driving a real class or a simulated one. A rehearsal-specific rendering path
 * would defeat the purpose: what a creator practises has to be the thing they will
 * later use.
 *
 * ISOLATION. This file imports no Supabase client, and neither does
 * lib/live/rehearsal.js. There is no code path from a rehearsal to the database —
 * not one guarded by a flag, not one at all. A rehearsal that leaked rows into a
 * real leaderboard would be worse than having no rehearsal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  difficultyFor,
  eventsToAnalytics,
  makeCohort,
  makeRng,
  simulateQuestion,
} from "@/lib/live/rehearsal.js";

/** Default simulated class size — big enough for percentages to mean something. */
export const REHEARSAL_COHORT = 24;

export type RehearsalSpeed = 1 | 5 | 10;

export type RehearsalQuestion = {
  id: string;
  time_seconds: number;
  options: unknown;
  correct_answer: unknown;
};

export type RehearsalState = {
  active: boolean;
  index: number;
  unlockedAt: string | null;
  /** Simulated presence. */
  onlineCount: number;
  answeredCount: number;
  confusionCount: number;
  optionTally: Record<string, number>;
  /** Keyed by question index, in the real analytics shape. */
  analytics: Map<number, ReturnType<typeof eventsToAnalytics>>;
  speed: RehearsalSpeed;
  finished: boolean;
};

const IDLE: RehearsalState = {
  active: false,
  index: -1,
  unlockedAt: null,
  onlineCount: 0,
  answeredCount: 0,
  confusionCount: 0,
  optionTally: {},
  analytics: new Map(),
  speed: 1,
  finished: false,
};

export type UseRehearsalResult = RehearsalState & {
  start: (speed?: RehearsalSpeed) => void;
  stop: () => void;
  unlockNext: () => void;
  /**
   * A3b in the rehearsal: take the seconds still on the clock away.
   *
   * The control room's "time's up" button must do something here rather than
   * nothing, and it must not reach the network to do it — a rehearsal that wrote
   * to a real exam row would be worse than having no rehearsal at all. So this is
   * the simulation's own copy of the flush, and it ends the question the same way
   * an expiry does: by moving the deadline onto now, not by inventing a second
   * way for a question to be over.
   */
  endNow: () => void;
  setSpeed: (speed: RehearsalSpeed) => void;
  /** Total seconds for the open question, already scaled by speed. */
  scaledSeconds: number;
};

function correctIndexOf(correctAnswer: unknown): number {
  if (Array.isArray(correctAnswer)) return Number(correctAnswer[0]) || 0;
  const n = Number(correctAnswer);
  return Number.isFinite(n) ? n : 0;
}

export function useRehearsal(questions: RehearsalQuestion[]): UseRehearsalResult {
  const [state, setState] = useState<RehearsalState>(IDLE);

  const rngRef = useRef(makeRng(1));
  const cohortRef = useRef(makeCohort(REHEARSAL_COHORT, makeRng(1)));
  /** Pending answer-release timers for the open question. */
  const timersRef = useRef<number[]>([]);
  /**
   * The simulated answers for the open question, kept so a flush can re-fold them.
   *
   * unlockNext closes over its own `events` and schedules one timer per answer;
   * that is enough while a question runs to completion. A flush has to decide what
   * the analytics say at an instant nobody planned for, which means reading the
   * event list back out — so it lives in a ref rather than only in a closure.
   */
  const simRef = useRef<{
    index: number;
    events: ReturnType<typeof simulateQuestion>;
    windowMs: number;
    totalSeconds: number;
  } | null>(null);
  const questionsRef = useRef(questions);
  questionsRef.current = questions;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const start = useCallback(
    (speed: RehearsalSpeed = 1) => {
      clearTimers();
      // Fixed seed: the same rehearsal every time, so a creator can practise the
      // same lesson twice and a test can assert on it.
      rngRef.current = makeRng(20260806);
      cohortRef.current = makeCohort(REHEARSAL_COHORT, makeRng(20260806));
      setState({
        ...IDLE,
        active: true,
        speed,
        onlineCount: cohortRef.current.filter((s) => !s.flaky).length,
      });
    },
    [clearTimers]
  );

  const stop = useCallback(() => {
    clearTimers();
    setState(IDLE);
  }, [clearTimers]);

  const setSpeed = useCallback((speed: RehearsalSpeed) => {
    setState((s) => (s.active ? { ...s, speed } : s));
  }, []);

  const unlockNext = useCallback(() => {
    setState((prev) => {
      if (!prev.active) return prev;
      const nextIndex = prev.index + 1;
      const q = questionsRef.current[nextIndex];
      if (!q) return { ...prev, finished: true };

      clearTimers();

      const optionCount = Array.isArray(q.options) ? q.options.length : 4;
      const windowMs = q.time_seconds * 1000;
      const events = simulateQuestion(
        cohortRef.current,
        {
          optionCount,
          correctIndex: correctIndexOf(q.correct_answer),
          difficulty: difficultyFor(nextIndex, questionsRef.current.length, rngRef.current),
          windowMs,
        },
        rngRef.current
      );

      simRef.current = { index: nextIndex, events, windowMs, totalSeconds: q.time_seconds };

      // Release each answer at its simulated moment, compressed by the speed
      // multiplier. This is what makes a rehearsal feel like a session rather than
      // a report: the counter climbs, the river fills, the coach line changes.
      events.forEach((e) => {
        const at = e.atMs / prev.speed;
        const id = window.setTimeout(() => {
          setState((s) => {
            if (!s.active || s.index !== nextIndex) return s;
            const key = `"${e.optionIndex}"`;
            return {
              ...s,
              answeredCount: s.answeredCount + 1,
              confusionCount: s.confusionCount + (e.confused ? 1 : 0),
              optionTally: { ...s.optionTally, [key]: (s.optionTally[key] || 0) + 1 },
            };
          });
        }, at);
        timersRef.current.push(id);
      });

      // At the visual end, fold the events into the real analytics shape so every
      // insight surface renders from the fields it would in a live session.
      const closeId = window.setTimeout(() => {
        setState((s) => {
          if (!s.active || s.index !== nextIndex) return s;
          const next = new Map(s.analytics);
          next.set(nextIndex, eventsToAnalytics(events, cohortRef.current.length, windowMs));
          return { ...s, analytics: next };
        });
      }, windowMs / prev.speed + 200);
      timersRef.current.push(closeId);

      return {
        ...prev,
        index: nextIndex,
        unlockedAt: new Date().toISOString(),
        answeredCount: 0,
        confusionCount: 0,
        optionTally: {},
        finished: false,
      };
    });
  }, [clearTimers]);

  /**
   * The rehearsal's flush.
   *
   * Two things have to be true for this to be a rehearsal of the real control
   * rather than a different control that happens to share a button.
   *
   * The clock has to stop the same way. Live, the RPC writes a negative
   * extra_seconds so the visual end lands on now, and every countdown then
   * expires through its ordinary path. There is no extra_seconds here, but the
   * countdown is derived from unlockedAt plus the question's scaled seconds — so
   * winding unlockedAt back until that sum reaches now produces exactly the same
   * thing: an earlier deadline on the same question, and the same single expiry.
   *
   * And the numbers have to stop moving. A student who had not answered by the
   * instant the creator called time does not get to answer, so every pending
   * release is cancelled and the analytics are folded from the answers that had
   * actually landed by the cutoff — not from the full simulation, which would
   * report a participation rate the room never reached.
   */
  const endNow = useCallback(() => {
    setState((prev) => {
      if (!prev.active || prev.index < 0 || !prev.unlockedAt) return prev;
      const sim = simRef.current;
      if (!sim || sim.index !== prev.index) return prev;

      clearTimers();

      // Wall-clock elapsed, put back onto the simulation's own timeline — the
      // releases were compressed by the speed multiplier on the way out, so they
      // have to be expanded by it on the way back in.
      const elapsedMs = Math.max(0, Date.now() - new Date(prev.unlockedAt).getTime());
      const cutoffMs = Math.min(sim.windowMs, elapsedMs * prev.speed);
      const landed = sim.events.filter((e) => e.atMs <= cutoffMs);

      const analytics = new Map(prev.analytics);
      analytics.set(
        prev.index,
        // GREATEST-style floor on the window: eventsToAnalytics divides by it, and
        // a creator who flushes the instant they unlock would otherwise divide by
        // zero and put NaN across every insight surface at once.
        eventsToAnalytics(landed, cohortRef.current.length, Math.max(1, cutoffMs))
      );

      const optionTally: Record<string, number> = {};
      landed.forEach((e) => {
        const key = `"${e.optionIndex}"`;
        optionTally[key] = (optionTally[key] || 0) + 1;
      });

      const scaled = Math.max(1, Math.round(sim.totalSeconds / prev.speed));

      return {
        ...prev,
        unlockedAt: new Date(Date.now() - scaled * 1000).toISOString(),
        answeredCount: landed.length,
        confusionCount: landed.filter((e) => e.confused).length,
        optionTally,
        analytics,
      };
    });
  }, [clearTimers]);

  const scaledSeconds = useMemo(() => {
    const q = state.index >= 0 ? questions[state.index] : null;
    return q ? Math.max(1, Math.round(q.time_seconds / state.speed)) : 0;
  }, [questions, state.index, state.speed]);

  return { ...state, start, stop, unlockNext, endNow, setSpeed, scaledSeconds };
}
