/**
 * useOpenQuestionTally.ts — live state of the question currently on screen.
 *
 * Why polling beats realtime here
 * ------------------------------
 * This replaced a Realtime subscription to live_responses. That subscription
 * delivered one message per student per question, and every one of them went to
 * a single creator tab: 1000 students over 20 questions cost 20,000 messages to
 * tell one browser a number it could have asked for. Worse, it arrived as 1000
 * separate setState calls inside a 60-second window.
 *
 * One creator tab polling at 750ms is 1.3 requests a second, regardless of
 * whether the class is 30 or 3000. The same round trip carries everything the
 * control room needs about the open question — the answered count, the option
 * tally for the live river, the confusion count, and whether anybody has
 * answered yet (which is what closes the undo window) — so there is exactly one
 * request in flight rather than four subscriptions.
 *
 * 750ms is chosen to look continuous. With a CSS transition of the same length
 * on the bars, discrete polls read as smooth motion; going faster costs
 * requests and buys nothing the eye can see.
 *
 * Polling stops dead the moment no question is open, so an idle control room,
 * a lobby, and a finished exam all cost nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOpenQuestionTally, type LiveOpenQuestionTally } from "@/services/liveExamService";

/** Matched to the bars' CSS transition so polls read as continuous motion. */
export const TALLY_POLL_MS = 750;

/**
 * Once a question's timer has run out its numbers are settled, so the fast
 * cadence buys nothing — but the creator may sit on the reveal discussing it
 * for minutes, and polling four times a second through that is waste.
 */
export const TALLY_IDLE_POLL_MS = 3_000;

/** Backoff after failures, so a flaky network never becomes a hot loop. */
const ERROR_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];

const EMPTY: LiveOpenQuestionTally = {
  live_question_id: null,
  response_count: 0,
  confusion_count: 0,
  option_tally: {},
  first_response_at: null,
  server_now: "",
};

export type UseOpenQuestionTallyResult = {
  tally: LiveOpenQuestionTally;
  /** Pull once, now — after an unlock, so the meter resets without a poll wait. */
  refresh: () => void;
};

/**
 * @param examId exam to poll
 * @param active whether a question is the current one; false stops all requests
 * @param intervalMs poll cadence — pass TALLY_IDLE_POLL_MS once the timer is up
 */
export function useOpenQuestionTally(
  examId: string | undefined,
  active: boolean,
  intervalMs: number = TALLY_POLL_MS
): UseOpenQuestionTallyResult {
  const [tally, setTally] = useState<LiveOpenQuestionTally>(EMPTY);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const errorStreakRef = useRef(0);
  const cleanedUpRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Read through a ref so a cadence change is picked up by the next cycle
  // without tearing down and restarting the loop.
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;

  const runRef = useRef<() => void>(() => {});

  const schedule = useCallback((delayMs: number) => {
    if (cleanedUpRef.current || !activeRef.current) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      runRef.current();
    }, delayMs);
  }, []);

  const run = useCallback(async () => {
    if (!examId || cleanedUpRef.current || !activeRef.current) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const next = await fetchOpenQuestionTally(examId);
      if (cleanedUpRef.current) return;
      errorStreakRef.current = 0;
      // Identity comparison keeps an unchanged poll from re-rendering: between
      // questions, or once everyone has answered, this fires every 750ms and
      // must cost nothing.
      setTally((cur) => (sameTally(cur, next) ? cur : next));
    } catch {
      errorStreakRef.current = Math.min(errorStreakRef.current + 1, ERROR_BACKOFF_MS.length);
    } finally {
      inFlightRef.current = false;
      const streak = errorStreakRef.current;
      schedule(streak > 0 ? ERROR_BACKOFF_MS[streak - 1] : intervalRef.current);
    }
  }, [examId, schedule]);

  runRef.current = () => {
    void run();
  };

  const refresh = useCallback(() => {
    errorStreakRef.current = 0;
    void run();
  }, [run]);

  useEffect(() => {
    cleanedUpRef.current = false;

    if (!examId || !active) {
      // Stop polling but KEEP the last value. When a question closes, its final
      // count is the answer the creator wants to keep looking at — zeroing the
      // Answered meter the instant the timer runs out reads as "nobody
      // answered". Cross-question bleed is prevented at the call site instead,
      // by only trusting a tally whose question id matches the open question.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    errorStreakRef.current = 0;
    runRef.current();

    return () => {
      cleanedUpRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [examId, active]);

  return { tally, refresh };
}

/**
 * Field comparison including the option tally, which is the part that actually
 * changes mid-question. Compared by entries rather than JSON.stringify because
 * key order from jsonb_object_agg is not guaranteed stable.
 */
function sameTally(a: LiveOpenQuestionTally, b: LiveOpenQuestionTally): boolean {
  if (
    a.live_question_id !== b.live_question_id ||
    a.response_count !== b.response_count ||
    a.confusion_count !== b.confusion_count ||
    a.first_response_at !== b.first_response_at
  ) {
    return false;
  }
  const ak = Object.keys(a.option_tally || {});
  const bk = Object.keys(b.option_tally || {});
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a.option_tally[k] === b.option_tally[k]);
}
