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

  const scaledSeconds = useMemo(() => {
    const q = state.index >= 0 ? questions[state.index] : null;
    return q ? Math.max(1, Math.round(q.time_seconds / state.speed)) : 0;
  }, [questions, state.index, state.speed]);

  return { ...state, start, stop, unlockNext, setSpeed, scaledSeconds };
}
