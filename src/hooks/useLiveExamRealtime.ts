/**
 * useLiveExamRealtime.ts
 * ----------------------
 * Supabase Realtime subscription for the Live Exam module — the push lane.
 *
 * What it carries, and why it carries so little
 * ---------------------------------------------
 * Only two tables remain in the realtime publication:
 *
 *   live_exams               one row change per unlock / status change / A3
 *                            grant. This is the one push students genuinely
 *                            need, and it is O(questions).
 *   live_question_analytics  one row per question, when the reveal lands.
 *
 * Everything else was removed in the Phase 0 migration:
 *
 *   live_participants  compute_live_rankings UPDATEs every participant row
 *                      after every question, and every student was subscribed,
 *                      so a session cost (participants x questions x students)
 *                      messages — 20,000,000 for 1000 students over 20
 *                      questions, against a 2,000,000/month allowance. It also
 *                      bought nothing: ranks only change when that RPC runs,
 *                      and both pages already refetch the leaderboard at
 *                      exactly that moment.
 *   live_responses     one message per student per question, all of it to a
 *                      single creator tab. Replaced by
 *                      live_open_question_tally(), polled at 750ms from that
 *                      one tab, which also carries the confusion count and the
 *                      A10 undo guard in the same round trip.
 *
 * If a future feature seems to want a per-row push to students, cost it as
 * (rows x students) before adding it here.
 *
 * Channels self-heal: on CHANNEL_ERROR / TIMED_OUT / CLOSED (or the browser
 * coming back online / a tab returning from a long background) the channel is
 * rebuilt with capped exponential backoff, and `onReconnect` fires so pages can
 * refetch anything missed while disconnected. `onSubscribeFailure` reports a
 * channel that has never managed to subscribe at all, which is how a client
 * past the plan's concurrent-connection cap discovers it must fall back to
 * polling instead of waiting forever for a push that will never arrive.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { LiveExam, LiveQuestionAnalytics } from "@/services/liveExamService";

// ─── Types ───────────────────────────────────────────────────

type RealtimeCallbacks = {
  /** live_exams row updated: question unlocked, time granted, status changed. */
  onExamUpdate?: (exam: LiveExam) => void;
  /** Analytics computed (or recomputed) for a question. */
  onAnalyticsComputed?: (analytics: LiveQuestionAnalytics) => void;
  /**
   * Fires once per recovery, after the channel successfully resubscribes
   * following a drop. Pages should refetch state they may have missed.
   */
  onReconnect?: () => void;
  /**
   * Fires when the channel has failed to subscribe and has never once
   * succeeded. The push lane is unavailable for this client — the caller
   * should switch to polling rather than sit and wait.
   */
  onSubscribeFailure?: () => void;
  /**
   * Fires every time the channel reaches SUBSCRIBED, including the first time.
   *
   * It must fire on the first success and not only after a prior failure: the
   * caller uses this to learn that the push lane works, and therefore that it
   * can drop to a slow keep-alive poll. Reporting only recoveries would leave a
   * perfectly healthy client polling at the full rate for the whole session —
   * the exact load this design exists to avoid.
   */
  onSubscribeSuccess?: () => void;
};

const MAX_BACKOFF_MS = 15_000;
const LONG_HIDDEN_MS = 30_000;
/** Consecutive failures before we declare the push lane unavailable. */
const FAILURES_BEFORE_FALLBACK = 2;

// ─── Main Hook ───────────────────────────────────────────────

/**
 * Subscribe to Realtime events for a live exam. One channel per hook instance;
 * cleans up on unmount or when examId changes.
 *
 * Call this ONCE per page. It used to be called a second time indirectly by a
 * participant-count helper, which opened a second channel with its own full set
 * of bindings for the same exam.
 */
export function useLiveExamRealtime(
  examId: string | undefined,
  callbacks: RealtimeCallbacks
) {
  // Callbacks live in a ref so changing them never re-subscribes.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Unique per hook instance: supabase-js dedupes channels by topic, so two
  // instances sharing `live-exam-${examId}` would silently merge — the second
  // subscribe() becomes a no-op and the extra bindings break the join
  // ("mismatch between server and client bindings"). A unique suffix keeps
  // every instance on its own channel; postgres_changes delivery doesn't
  // depend on the topic name.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 10));

  useEffect(() => {
    if (!examId) return;

    // Per-subscription connection state (fresh for each examId).
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let hadSubscribed = false; // channel reached SUBSCRIBED at least once
    let dropPending = false; // a drop happened since the last SUBSCRIBED
    let isCleanedUp = false; // set before removeChannel on unmount so its CLOSED is ignored
    let hiddenAt: number | null = null;
    let consecutiveFailures = 0;
    let fallbackAnnounced = false;

    const buildChannel = () => {
      const ch: RealtimeChannel = supabase
        .channel(`live-exam-${examId}-${instanceIdRef.current}`)

        // ─ live_exams: unlock, A3 time grant, status ─
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "live_exams",
            filter: `id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onExamUpdate) {
              callbacksRef.current.onExamUpdate(payload.new as unknown as LiveExam);
            }
          }
        )

        // ─ Analytics computed (the reveal, for everyone) ─
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_question_analytics",
            filter: `live_exam_id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onAnalyticsComputed) {
              callbacksRef.current.onAnalyticsComputed(payload.new as unknown as LiveQuestionAnalytics);
            }
          }
        )

        // Also listen for analytics UPDATEs (upsert re-computation)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "live_question_analytics",
            filter: `live_exam_id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onAnalyticsComputed) {
              callbacksRef.current.onAnalyticsComputed(payload.new as unknown as LiveQuestionAnalytics);
            }
          }
        );

      channel = ch;

      ch.subscribe((status) => {
        // Ignore status events from unmounted or superseded channels
        // (removeChannel on an old channel emits CLOSED).
        if (isCleanedUp || channel !== ch) return;

        if (status === "SUBSCRIBED") {
          retryAttempt = 0;
          consecutiveFailures = 0;
          fallbackAnnounced = false;
          callbacksRef.current.onSubscribeSuccess?.();
          if (dropPending && hadSubscribed) {
            dropPending = false;
            callbacksRef.current.onReconnect?.();
          }
          dropPending = false;
          hadSubscribed = true;
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          dropPending = true;
          // A channel that has never once subscribed is not a blip — it is a
          // client that cannot have a push lane at all (connection cap, proxy
          // blocking websockets). Say so, so the caller can start polling.
          if (!hadSubscribed) {
            consecutiveFailures += 1;
            if (consecutiveFailures >= FAILURES_BEFORE_FALLBACK && !fallbackAnnounced) {
              fallbackAnnounced = true;
              callbacksRef.current.onSubscribeFailure?.();
            }
          }
          scheduleResubscribe();
        }
      });
    };

    const scheduleResubscribe = (immediate = false) => {
      if (isCleanedUp || retryTimer !== null) return;
      const delay = immediate
        ? 0
        : Math.min(1000 * 2 ** retryAttempt, MAX_BACKOFF_MS);
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (isCleanedUp) return;
        const old = channel;
        channel = null;
        if (old) supabase.removeChannel(old);
        buildChannel();
      }, delay);
    };

    // Backgrounded mobile tabs silently lose the socket without any status
    // event — force a rebuild when connectivity plausibly returned.
    const forceResubscribe = () => {
      if (isCleanedUp) return;
      dropPending = true;
      retryAttempt = 0;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      scheduleResubscribe(true);
    };

    const handleOnline = () => forceResubscribe();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > LONG_HIDDEN_MS) {
          forceResubscribe();
        }
        hiddenAt = null;
      }
    };

    buildChannel();
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isCleanedUp = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [examId]);
}
