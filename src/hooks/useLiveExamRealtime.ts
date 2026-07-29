/**
 * useLiveExamRealtime.ts
 * ----------------------
 * Supabase Realtime subscription hooks for the Live Exam module.
 * Provides reactive updates for:
 *   - Exam state changes (question unlocked, status changed)
 *   - Participant count / leaderboard changes
 *   - New responses (for creator's live submission counter)
 *   - Analytics computed (for students to see after timer ends)
 *
 * Channels self-heal: on CHANNEL_ERROR / TIMED_OUT / CLOSED (or the browser
 * coming back online / a tab returning from a long background) the channel is
 * rebuilt with capped exponential backoff, and `onReconnect` fires so pages
 * can refetch any events missed while disconnected.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type {
  LiveExam,
  LiveParticipant,
  LiveResponse,
  LiveQuestionAnalytics,
} from "@/services/liveExamService";

// ─── Types ───────────────────────────────────────────────────

type RealtimeCallbacks = {
  /** Called when live_exams row is updated (question unlock, status change, etc.) */
  onExamUpdate?: (exam: LiveExam) => void;
  /** Called when a new participant joins */
  onParticipantJoined?: (participant: LiveParticipant) => void;
  /** Called when participant data changes (rank updated, etc.) */
  onParticipantUpdated?: (participant: LiveParticipant) => void;
  /** Called when a new response is submitted (creator sees live count) */
  onNewResponse?: (response: LiveResponse) => void;
  /** Called when analytics are computed for a question */
  onAnalyticsComputed?: (analytics: LiveQuestionAnalytics) => void;
  /**
   * Called once per recovery, after the channel successfully resubscribes
   * following a connection drop. Pages should refetch state they may have
   * missed while disconnected (exam row, responses, analytics, ...).
   */
  onReconnect?: () => void;
};

const MAX_BACKOFF_MS = 15_000;
const LONG_HIDDEN_MS = 30_000;

// ─── Main Hook ───────────────────────────────────────────────

/**
 * Subscribe to all Realtime events for a specific live exam.
 * Automatically cleans up on unmount or when examId changes.
 *
 * Usage:
 * ```tsx
 * useLiveExamRealtime(examId, {
 *   onExamUpdate: (exam) => setExam(exam),
 *   onParticipantJoined: (p) => setParticipants(prev => [...prev, p]),
 *   onAnalyticsComputed: (a) => setAnalytics(prev => [...prev, a]),
 *   onReconnect: () => refetchEverything(),
 * });
 * ```
 */
export function useLiveExamRealtime(
  examId: string | undefined,
  callbacks: RealtimeCallbacks
) {
  // Store callbacks in a ref to avoid re-subscribing when callbacks change
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Unique per hook instance: supabase-js dedupes channels by topic, so two
  // hook instances sharing `live-exam-${examId}` would silently merge — the
  // second subscribe() becomes a no-op and the extra bindings break the join
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

    const buildChannel = () => {
      const ch: RealtimeChannel = supabase
        .channel(`live-exam-${examId}-${instanceIdRef.current}`)

        // ─ live_exams changes (question unlock, status) ─
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

        // ─ New participants ─
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_participants",
            filter: `live_exam_id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onParticipantJoined) {
              callbacksRef.current.onParticipantJoined(payload.new as unknown as LiveParticipant);
            }
          }
        )

        // ─ Participant updates (rank changes) ─
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "live_participants",
            filter: `live_exam_id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onParticipantUpdated) {
              callbacksRef.current.onParticipantUpdated(payload.new as unknown as LiveParticipant);
            }
          }
        )

        // ─ New responses (for creator's live counter) ─
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_responses",
            filter: `live_exam_id=eq.${examId}`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, any>>) => {
            if (payload.new && callbacksRef.current.onNewResponse) {
              callbacksRef.current.onNewResponse(payload.new as unknown as LiveResponse);
            }
          }
        )

        // ─ Analytics computed (shown to everyone after timer ends) ─
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

// ─── Convenience: Participant Count Hook ─────────────────────

/**
 * Simple hook that tracks the live participant count for an exam.
 * Returns the current count which updates in real-time.
 */
export function useLiveParticipantCount(examId: string | undefined): number {
  const [count, setCount] = useState(0);

  const refetchCount = useCallback(async () => {
    if (!examId) return;

    const { count: freshCount } = await supabase
      .from("live_participants")
      .select("*", { count: "exact", head: true })
      .eq("live_exam_id", examId);

    setCount(freshCount || 0);
  }, [examId]);

  // Fetch initial count
  useEffect(() => {
    refetchCount();
  }, [refetchCount]);

  // Subscribe to participant changes; refetch after a connection drop
  useLiveExamRealtime(examId, {
    onParticipantJoined: () => setCount((prev) => prev + 1),
    onReconnect: refetchCount,
  });

  return count;
}

// ─── Convenience: Response Count per Question Hook ───────────

/**
 * Tracks how many students have submitted a response for a specific question.
 * Useful for the creator's live dashboard showing "X/Y submitted".
 */
export function useLiveResponseCount(
  examId: string | undefined,
  questionId: string | undefined
): number {
  const [count, setCount] = useState(0);

  const refetchCount = useCallback(async () => {
    if (!examId || !questionId) return;

    const { count: freshCount } = await supabase
      .from("live_responses")
      .select("*", { count: "exact", head: true })
      .eq("live_exam_id", examId)
      .eq("live_question_id", questionId);

    setCount(freshCount || 0);
  }, [examId, questionId]);

  useEffect(() => {
    refetchCount();
  }, [refetchCount]);

  useLiveExamRealtime(examId, {
    onNewResponse: (response) => {
      if (response.live_question_id === questionId) {
        setCount((prev) => prev + 1);
      }
    },
    onReconnect: refetchCount,
  });

  return count;
}

// ─── Convenience: Auto-syncing Leaderboard Hook ──────────────

/**
 * Returns a live-updating leaderboard array for an exam.
 * Automatically merges new participants and rank updates.
 */
export function useLiveLeaderboard(
  examId: string | undefined,
  limit: number = 20
): LiveParticipant[] {
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);

  const refetchLeaderboard = useCallback(async () => {
    if (!examId) return;

    const { data } = await supabase
      .from("live_participants")
      .select("*")
      .eq("live_exam_id", examId)
      .order("rank", { ascending: true, nullsFirst: false })
      .limit(limit);

    setParticipants((data || []) as unknown as LiveParticipant[]);
  }, [examId, limit]);

  useEffect(() => {
    refetchLeaderboard();
  }, [refetchLeaderboard]);

  useLiveExamRealtime(examId, {
    onParticipantJoined: (p) => {
      setParticipants((prev) => {
        if (prev.find((e) => e.user_id === p.user_id)) return prev;
        const next = [...prev, p];
        return next
          .sort((a, b) => {
            if (a.rank === null && b.rank === null) return 0;
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
          })
          .slice(0, limit);
      });
    },
    onParticipantUpdated: (p) => {
      setParticipants((prev) => {
        const next = prev.map((e) => (e.user_id === p.user_id ? p : e));
        // If not in list yet, add
        if (!prev.find((e) => e.user_id === p.user_id)) {
          next.push(p);
        }
        return next
          .sort((a, b) => {
            if (a.rank === null && b.rank === null) return 0;
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
          })
          .slice(0, limit);
      });
    },
    onReconnect: refetchLeaderboard,
  });

  return participants;
}
