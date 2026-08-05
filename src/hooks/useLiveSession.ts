/**
 * useLiveSession.ts — the single source of truth for live session state.
 *
 * Both live pages used to run their own copy of this: their own exam row state,
 * their own timer restoration, their own idea of "now", their own reconnect
 * handling. The copies had already drifted, and the deadline in particular was
 * spelled out by hand in both — which is survivable until a creator can grant
 * extra time mid-question, at which point one stale copy means a question that
 * looks open but rejects answers.
 *
 * Two transport lanes
 * -------------------
 * PUSH  Supabase Realtime. Sub-second. Used whenever the channel subscribes.
 * PULL  live_session_sync() on a server-chosen interval.
 *
 * The pull lane is not a fallback bolted on for tidiness — it is load-bearing.
 * The hosting plan caps concurrent realtime connections well below a large
 * class, so past that cap students simply cannot get a push channel. Before
 * this, such a student sat on a "waiting for your teacher" screen forever while
 * the rest of the room answered. Now they poll, and the room degrades from
 * instant to a few seconds instead of breaking for the unlucky majority.
 *
 * Even on the push lane the pull loop keeps running, slowly. It is doing three
 * other jobs: the presence heartbeat (so "who is in the room" is a real number
 * rather than "who ever joined"), the server clock samples, and the online
 * count. A push-lane client polls every 15s, which is nothing.
 *
 * Deliberately NOT in here: anything that needs to know what a question is.
 * The spine deals in the session row. Turning that into a countdown is
 * `useLiveTimerTarget`, and the arithmetic itself lives in lib/live/deadline.js
 * so it has exactly one home shared with the SQL helper of the same name.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  syncLiveSession,
  type LeaderboardVisibility,
  type LiveExam,
  type LiveExamStatus,
  type LiveQuestionAnalytics,
  type LiveSessionSync,
} from "@/services/liveExamService";
import { useLiveExamRealtime } from "./useLiveExamRealtime";
import { isStageTheme, type StageTheme } from "@/lib/live/stageTheme";
import { createClockOffset } from "@/lib/live/clock.js";
import { BEAT_INTERVAL_MS, clientPollDelayMs, shouldBeat, STOP } from "@/lib/live/cadence.js";
import { liveTimerStore } from "@/lib/live/timerStore";

/** Push-lane clients still sync this often, for heartbeat + clock + head count. */
const PUSH_IDLE_SYNC_MS = 15_000;

/** The creator's single tab can afford a tighter cadence; A8 needs fresh counts. */
const CREATOR_PUSH_IDLE_SYNC_MS = 5_000;

/** Backoff after a failed sync, so a flaky network doesn't become a hot loop. */
const SYNC_ERROR_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 15_000];

export type LiveTransport = "connecting" | "push" | "poll";

export type LiveSessionState = {
  status: LiveExamStatus | null;
  currentQuestionIndex: number;
  unlockedAt: string | null;
  extraSeconds: number;
  scheduledStartAt: string | null;
  autoStart: boolean;
  privacyMode: boolean;
  leaderboardVisibility: LeaderboardVisibility;
  presentShowLeaderboard: boolean;
  presentShowRiver: boolean;
  /** Q15. Whether the wall draws the answer choices at all. */
  presentShowOptions: boolean;
  /** Q15b. Whether the wall marks the correct choice once answers lock. */
  presentRevealAnswer: boolean;
  /** Q16. The projector's frame — a broadcast decision, not a viewer preference. */
  presentTheme: StageTheme;
  celebrateSeq: number;
  totalQuestions: number;
  /** Present within the last 45s. */
  onlineCount: number;
  /** Ever joined. Kept separate because the two answer different questions. */
  joinedCount: number;
  myRank: number | null;
  myTotalCorrect: number | null;
  /** Creator only; null for students by design. */
  confusionCount: number | null;
  /** Creator only. */
  openResponseCount: number | null;
  transport: LiveTransport;
  /** True until the first successful sync, so pages can avoid showing zeroes. */
  loading: boolean;
};

/**
 * Which lane an observation arrived on.
 *
 * Push events are delivered in order on a single channel and are current by
 * definition, so they are always applied. Poll replies are not: `refresh()`
 * deliberately bypasses the in-flight guard, so several syncs are routinely
 * outstanding and can land out of order.
 */
type ObservationLane = "push" | "poll";

const INITIAL_STATE: LiveSessionState = {
  status: null,
  currentQuestionIndex: -1,
  unlockedAt: null,
  extraSeconds: 0,
  scheduledStartAt: null,
  autoStart: false,
  privacyMode: false,
  leaderboardVisibility: "full",
  presentShowLeaderboard: true,
  presentShowRiver: true,
  presentShowOptions: true,
  // An answer key on a projector is never a default, so this one starts off
  // while the other two start on. That asymmetry is the whole reason the
  // readers below cannot guess at a missing key.
  presentRevealAnswer: false,
  presentTheme: "dark",
  celebrateSeq: 0,
  totalQuestions: 0,
  onlineCount: 0,
  joinedCount: 0,
  myRank: null,
  myTotalCorrect: null,
  confusionCount: null,
  openResponseCount: null,
  transport: "connecting",
  loading: true,
};

/**
 * Read one projector setting off whichever payload delivered it.
 *
 * Why a function, and why `key in row` rather than a comparison at the call site.
 *
 * Both lanes used to spell this inline, against a literal. That is the bug that
 * shipped: the creator flips a projector switch, updateLiveExam writes it, the
 * row in the database is correct and STAYS correct — and then Supabase Realtime
 * echoes the UPDATE back, built from a column list it caches, which had not yet
 * caught up with the freshly added column. So the echo of the creator's own
 * write arrives with the key simply ABSENT. Compared against a literal, that
 * absence collapsed into a concrete answer; the push lane always applies; and
 * the switch turned itself back off a beat after being turned on. Nothing threw,
 * no request failed, and the database was right the entire time — which is why
 * it read as "the toggle doesn't work" rather than as an error.
 *
 * The same hole had been open for the two older settings the whole time and
 * nobody reported it, because comparing against `false` happens to guess RIGHT
 * for a column that defaults true: a stale payload forced those settings on
 * instead of off, which looks like nothing happening.
 *
 * The rule: undefined means "this payload says nothing about that setting", and
 * never "that setting is off". Turning undefined back into a value is the
 * merge's job in applyObservation, which keeps whatever it already had.
 */
function payloadBool(row: Record<string, unknown> | null | undefined, key: string): boolean | undefined {
  if (!row || !(key in row)) return undefined;
  const value = (row as Record<string, unknown>)[key];
  // Present-but-null counts as silence too — a column added by a migration that
  // has not finished backfilling reads null, which is not the creator saying no.
  return value === null || value === undefined ? undefined : value !== false;
}

/**
 * The same rule for the one projector setting that is not a boolean.
 *
 * Absence matters more here than anywhere else: a theme that drops to its
 * default for a beat because a payload was assembled before the column existed
 * is the wall flashing black in front of the room, on camera.
 */
function payloadTheme(row: Record<string, unknown> | null | undefined, key: string): StageTheme | undefined {
  if (!row || !(key in row)) return undefined;
  const value = (row as Record<string, unknown>)[key];
  // Present-but-rubbish is a different failure from absent and is worth
  // correcting rather than passing on. The column has a CHECK constraint, so
  // getting here at all means something wrote around it — and a wall is not the
  // place to render a theme called "Dark".
  return isStageTheme(value) ? value : "dark";
}

export type LiveSessionCallbacks = {
  /** A later question became the open one. Fires for every forward step. */
  onUnlock?: (index: number, prevIndex: number) => void;
  /** The open question moved backwards — an A10 undo. */
  onRewind?: (index: number, prevIndex: number) => void;
  /** status went live → ended. */
  onEnded?: () => void;
  /** Analytics landed for a question (the reveal). Push lane only. */
  onAnalytics?: (analytics: LiveQuestionAnalytics) => void;
  /** A dropped push channel came back; refetch anything missed. */
  onReconnect?: () => void;
  /** celebrate_seq advanced (B14). Never fires on the first observation. */
  onCelebrate?: (seq: number) => void;
  /**
   * privacy_mode or leaderboard_visibility changed (E1 / E3). Never fires on the
   * first observation.
   *
   * Both settings change what an already-fetched NAME or POSITION is allowed to
   * say, and nothing in the exam row tells those fetches to run again. Standings,
   * moment banners and the student's own leaderboard all keep the values they
   * loaded before the flip, so without this the toggle appears to do nothing
   * until the next reveal — on exactly the surfaces it exists to protect.
   */
  onSettings?: () => void;
};

export type UseLiveSessionOptions = LiveSessionCallbacks & {
  /** Creators poll a little faster and receive the creator-only counters. */
  role: "creator" | "student";
  /** Hold off until the page knows which exam it is looking at. */
  enabled?: boolean;
};

export type UseLiveSessionResult = LiveSessionState & {
  /** Local clock corrected to the server's. Never use raw Date.now(). */
  serverNow: () => number;
  /** Force an immediate sync — after an action whose result must be reflected now. */
  refresh: () => void;
};

export function useLiveSession(
  examId: string | undefined,
  options: UseLiveSessionOptions
): UseLiveSessionResult {
  const { role, enabled = true } = options;

  const [state, setState] = useState<LiveSessionState>(INITIAL_STATE);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // One clock per hook instance, wired into the timer store so every countdown
  // in the document runs on server-corrected time.
  const clockRef = useRef(createClockOffset());
  const serverNow = useCallback(() => clockRef.current.serverNow(), []);

  useEffect(() => {
    liveTimerStore.setNowProvider(serverNow);
  }, [serverNow]);

  // Mutable loop state. Refs rather than state: none of it should re-render.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const lastBeatAtRef = useRef<number | null>(null);
  const errorStreakRef = useRef(0);
  const transportRef = useRef<LiveTransport>("connecting");
  const serverNextPollRef = useRef<number>(1_500);
  const cleanedUpRef = useRef(false);
  /**
   * Previous observations, for transition detection on both lanes.
   *
   * `privacy` and `visibility` are nullable for the same reason `celebrate` is:
   * null is the "we have not seen this exam yet" baseline, and a transition out
   * of it is not a change anybody made.
   */
  const prevRef = useRef<{
    index: number;
    status: LiveExamStatus | null;
    celebrate: number | null;
    privacy: boolean | null;
    visibility: LeaderboardVisibility | null;
  }>({
    index: -1,
    status: null,
    celebrate: null,
    privacy: null,
    visibility: null,
  });
  // Declared up here with the rest of the loop state, and assigned once
  // `scheduleNext` exists below. The sync loop reaches its scheduler through
  // this ref so a memoised callback can never hold a stale one.
  const scheduleNextRef = useRef<() => void>(() => {});
  /**
   * Server timestamp of the newest observation applied so far.
   *
   * Several syncs are routinely outstanding at once, by design: `refresh()`
   * deliberately bypasses the in-flight guard (`!opts?.immediate`) so an action
   * whose result must be reflected now is never queued behind a keep-alive. The
   * cost is that replies can land out of order.
   *
   * Without a watermark, a late reply is applied as though it were the present.
   * The damaging case is a sync dispatched just before an unlock and replying
   * just after one has been applied: it carries the OLD index, so the spine reads
   * it as an index decrease and fires onRewind — whose student handler clears the
   * selected answer and purges the reveal it fetched moments earlier.
   *
   * The guard keys on TIME, not on direction. Suppressing decreases outright
   * would have been simpler and would have broken A10, where an index going
   * backwards is the entire feature.
   */
  const observedAtRef = useRef<number>(0);

  /**
   * Fold an observation into state and fire whatever transitions it implies.
   *
   * Both lanes land here, and both can deliver the same change (a push arrives
   * while a poll is in flight), so transition detection compares against the
   * last observation rather than against React state — which may not have
   * committed yet.
   */
  const applyObservation = useCallback(
    (next: {
      status: LiveExamStatus;
      currentQuestionIndex: number;
      unlockedAt: string | null;
      extraSeconds: number;
      scheduledStartAt: string | null;
      autoStart: boolean;
      privacyMode: boolean;
      leaderboardVisibility: LeaderboardVisibility;
      /**
       * The five projector settings are optional, and that is load-bearing
       * rather than lenient: payloadBool/payloadTheme return undefined for a
       * payload that never mentioned the key, and the merge below then keeps
       * whatever the previous observation established. Making these required
       * would force each lane to invent a value, which is the bug.
       */
      presentShowLeaderboard?: boolean;
      presentShowRiver?: boolean;
      presentShowOptions?: boolean;
      presentRevealAnswer?: boolean;
      presentTheme?: StageTheme;
      celebrateSeq: number;
      totalQuestions: number;
      onlineCount?: number;
      joinedCount?: number;
      myRank?: number | null;
      myTotalCorrect?: number | null;
      confusionCount?: number | null;
      openResponseCount?: number | null;
      /**
       * False when the server withheld rank/score because a question is still
       * open. The previous values are kept rather than nulled, so the student
       * sees a stale score instead of a dash appearing mid-question.
       */
      scoreVisible?: boolean;
    }, lane: ObservationLane, stampMs: number) => {
      if (cleanedUpRef.current) return;

      // Stale poll reply: a newer observation has already been applied.
      if (lane === "poll" && stampMs > 0 && stampMs < observedAtRef.current) return;
      if (stampMs > observedAtRef.current) observedAtRef.current = stampMs;

      const prev = prevRef.current;
      const cb = optionsRef.current;

      // The very first observation establishes a baseline and fires nothing. A
      // student joining mid-session lands on question 7 without that being an
      // "unlock" — announcing it would ding, toast, and clear their selection
      // for a question that was already open before they arrived.
      const isFirstObservation = prev.status === null && prev.index === -1;

      if (!isFirstObservation) {
        if (next.currentQuestionIndex > prev.index) {
          cb.onUnlock?.(next.currentQuestionIndex, prev.index);
        } else if (next.currentQuestionIndex < prev.index) {
          cb.onRewind?.(next.currentQuestionIndex, prev.index);
        }
      }

      if (prev.status === "live" && next.status === "ended") {
        cb.onEnded?.();
      }

      // A first observation establishes the baseline; only later increases are
      // a celebration. Otherwise every reload would fire confetti.
      if (prev.celebrate !== null && next.celebrateSeq > prev.celebrate) {
        cb.onCelebrate?.(next.celebrateSeq);
      }

      // E1 / E3. Same baseline discipline as the celebration above, and for a
      // sharper reason: firing on the first observation would make every page
      // load refetch its standings, its moments and its leaderboard on mount,
      // for a "change" that is just the session arriving.
      if (
        prev.privacy !== null &&
        (next.privacyMode !== prev.privacy ||
          next.leaderboardVisibility !== prev.visibility)
      ) {
        cb.onSettings?.();
      }

      prevRef.current = {
        index: next.currentQuestionIndex,
        status: next.status,
        celebrate: next.celebrateSeq,
        privacy: next.privacyMode,
        visibility: next.leaderboardVisibility,
      };

      // E3: 'off' means off, and it has to be decided BEFORE the score_visible
      // rule inside the merge. That rule deliberately keeps the previous rank so
      // a student's score never blanks out mid-question — correct for its own
      // purpose, and exactly wrong here. Checked in the other order, a creator
      // who switches the leaderboard off while a question is open leaves the
      // last known position pinned to every phone until that question closes.
      const rankHidden = next.leaderboardVisibility === "off";

      setState((cur) => {
        const merged: LiveSessionState = {
          ...cur,
          status: next.status,
          currentQuestionIndex: next.currentQuestionIndex,
          unlockedAt: next.unlockedAt,
          extraSeconds: next.extraSeconds,
          scheduledStartAt: next.scheduledStartAt,
          autoStart: next.autoStart,
          privacyMode: next.privacyMode,
          leaderboardVisibility: next.leaderboardVisibility,
          // `??`, not a plain assignment: undefined here means the payload was
          // silent about that setting, and keeping what we had is the only
          // answer that cannot flip a projector switch nobody touched.
          presentShowLeaderboard: next.presentShowLeaderboard ?? cur.presentShowLeaderboard,
          presentShowRiver: next.presentShowRiver ?? cur.presentShowRiver,
          presentShowOptions: next.presentShowOptions ?? cur.presentShowOptions,
          presentRevealAnswer: next.presentRevealAnswer ?? cur.presentRevealAnswer,
          presentTheme: next.presentTheme ?? cur.presentTheme,
          celebrateSeq: next.celebrateSeq,
          totalQuestions: next.totalQuestions,
          onlineCount: next.onlineCount ?? cur.onlineCount,
          joinedCount: next.joinedCount ?? cur.joinedCount,
          // Only overwritten when the server says the score is releasable. While
          // a question is open it withholds both, and keeping the last known
          // values is the honest render — a score that blanks out mid-question
          // reads as "you lost your points".
          myRank: rankHidden
            ? null
            : next.scoreVisible === false ? cur.myRank : next.myRank !== undefined ? next.myRank : cur.myRank,
          myTotalCorrect:
            next.scoreVisible === false
              ? cur.myTotalCorrect
              : next.myTotalCorrect !== undefined
                ? next.myTotalCorrect
                : cur.myTotalCorrect,
          confusionCount:
            next.confusionCount !== undefined ? next.confusionCount : cur.confusionCount,
          openResponseCount:
            next.openResponseCount !== undefined
              ? next.openResponseCount
              : cur.openResponseCount,
          transport: transportRef.current,
          loading: false,
        };
        // A 15s heartbeat that changed nothing must not re-render the page.
        return shallowEqualState(cur, merged) ? cur : merged;
      });
    },
    []
  );

  /** One sync round trip, then schedule the next. */
  const runSync = useCallback(
    async (opts?: { immediate?: boolean }) => {
      if (!examId || !enabled || cleanedUpRef.current) return;
      if (inFlightRef.current && !opts?.immediate) return;

      inFlightRef.current = true;
      const beat = shouldBeat(lastBeatAtRef.current, Date.now(), BEAT_INTERVAL_MS);
      const sentAt = Date.now();

      try {
        const sync: LiveSessionSync = await syncLiveSession(examId, beat);
        const receivedAt = Date.now();
        if (cleanedUpRef.current) return;

        clockRef.current.addSample(sync.server_now, sentAt, receivedAt);
        if (beat) lastBeatAtRef.current = receivedAt;
        errorStreakRef.current = 0;
        serverNextPollRef.current = sync.next_poll_ms;

        applyObservation({
          status: sync.status,
          currentQuestionIndex: sync.current_question_index,
          unlockedAt: sync.current_question_unlocked_at,
          extraSeconds: sync.current_question_extra_seconds ?? 0,
          scheduledStartAt: sync.scheduled_start_at,
          autoStart: !!sync.auto_start,
          privacyMode: !!sync.privacy_mode,
          leaderboardVisibility: sync.leaderboard_visibility ?? "full",
          // Through payloadBool even though this lane never showed the bug: a
          // live_session_sync deployed before one of these columns existed omits
          // the key just as surely as a stale Realtime payload does, and having
          // one lane read them differently from the other is how the next one of
          // these takes a week to find.
          presentShowLeaderboard: payloadBool(sync, "present_show_leaderboard"),
          presentShowRiver: payloadBool(sync, "present_show_river"),
          presentShowOptions: payloadBool(sync, "present_show_options"),
          presentRevealAnswer: payloadBool(sync, "present_reveal_answer"),
          presentTheme: payloadTheme(sync, "present_theme"),
          celebrateSeq: sync.celebrate_seq ?? 0,
          totalQuestions: sync.total_questions ?? 0,
          onlineCount: sync.online_count ?? 0,
          joinedCount: sync.joined_count ?? 0,
          myRank: sync.my_rank ?? null,
          myTotalCorrect: sync.my_total_correct ?? null,
          confusionCount: sync.confusion_count ?? null,
          openResponseCount: sync.open_response_count ?? null,
          scoreVisible: sync.score_visible !== false,
        }, "poll", new Date(sync.server_now).getTime() || 0);
      } catch {
        // Transient by assumption: the next attempt backs off. A hard failure
        // (deleted exam, revoked access) shows up to the user through the
        // page's own load path, not as a toast storm from a background loop.
        errorStreakRef.current = Math.min(
          errorStreakRef.current + 1,
          SYNC_ERROR_BACKOFF_MS.length
        );
      } finally {
        inFlightRef.current = false;
        // Through the ref, never the closed-over binding: this callback is
        // memoised, so a captured scheduleNext would freeze at whatever `role`
        // and `enabled` were on the render that created it.
        scheduleNextRef.current();
      }
    },
    [examId, enabled, applyObservation]
  );

  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  /**
   * Decide when to ask again.
   *
   * The server owns the base interval because it is the only party that knows
   * the size of the room. The client may only ever make it rarer: hidden tabs
   * back right off, and a working push lane drops to a slow keep-alive since
   * changes arrive by other means.
   */
  const scheduleNext = useCallback(() => {
    if (cleanedUpRef.current || !enabled) return;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (errorStreakRef.current > 0) {
      const step = Math.min(errorStreakRef.current, SYNC_ERROR_BACKOFF_MS.length) - 1;
      timerRef.current = setTimeout(() => {
        void runSyncRef.current();
      }, SYNC_ERROR_BACKOFF_MS[step]);
      return;
    }

    // A server interval of 0 means "nothing more will change" (ended or draft),
    // and that is true on either lane.
    if (serverNextPollRef.current === STOP) return;

    const pushIdle = role === "creator" ? CREATOR_PUSH_IDLE_SYNC_MS : PUSH_IDLE_SYNC_MS;
    const base =
      transportRef.current === "push" ? pushIdle : serverNextPollRef.current;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const delay = clientPollDelayMs(base, { hidden });
    if (delay === STOP) return;

    timerRef.current = setTimeout(() => {
      void runSyncRef.current();
    }, delay);
  }, [enabled, role]);

  scheduleNextRef.current = scheduleNext;

  const refresh = useCallback(() => {
    errorStreakRef.current = 0;
    void runSyncRef.current({ immediate: true });
  }, []);

  // ─── Push lane ─────────────────────────────────────────────

  useLiveExamRealtime(enabled ? examId : undefined, {
    onExamUpdate: (exam: LiveExam) => {
      // The row carries everything except the head counts, which only the sync
      // RPC computes. Keeping the previous counts is right: an unlock does not
      // change who is in the room.
      transportRef.current = "push";
      applyObservation({
        status: exam.status,
        currentQuestionIndex: exam.current_question_index,
        unlockedAt: exam.current_question_unlocked_at,
        extraSeconds: exam.current_question_extra_seconds ?? 0,
        scheduledStartAt: exam.scheduled_start_at ?? null,
        autoStart: !!exam.auto_start,
        privacyMode: !!exam.privacy_mode,
        leaderboardVisibility: (exam.leaderboard_visibility as LeaderboardVisibility) ?? "full",
        // This is the lane that broke — see payloadBool. Realtime's cached
        // column list is what makes a settings key go missing from the echo of
        // the creator's own write.
        presentShowLeaderboard: payloadBool(exam, "present_show_leaderboard"),
        presentShowRiver: payloadBool(exam, "present_show_river"),
        presentShowOptions: payloadBool(exam, "present_show_options"),
        presentRevealAnswer: payloadBool(exam, "present_reveal_answer"),
        presentTheme: payloadTheme(exam, "present_theme"),
        celebrateSeq: exam.celebrate_seq ?? 0,
        totalQuestions: exam.total_questions ?? 0,
      }, "push", clockRef.current.serverNow());
      // An unlock changes what the creator's counters mean; get fresh ones
      // without waiting out the idle interval.
      if (role === "creator") refresh();
    },
    onAnalyticsComputed: (analytics) => {
      transportRef.current = "push";
      optionsRef.current.onAnalytics?.(analytics);
    },
    onReconnect: () => {
      transportRef.current = "push";
      optionsRef.current.onReconnect?.();
      refresh();
    },
    onSubscribeFailure: () => {
      // No push lane for this client. The pull loop is already running; it now
      // uses the server's real cadence instead of the slow keep-alive.
      transportRef.current = "poll";
      setState((cur) => (cur.transport === "poll" ? cur : { ...cur, transport: "poll" }));
      refresh();
    },
    onSubscribeSuccess: () => {
      transportRef.current = "push";
      setState((cur) => (cur.transport === "push" ? cur : { ...cur, transport: "push" }));
      scheduleNextRef.current();
    },
  });

  // ─── Session reset ─────────────────────────────────────────

  // Declared BEFORE the pull loop on purpose. Effects run in declaration order,
  // so on a change of exam this wipes the baseline before the new exam's first
  // sync is dispatched. The other order lets a fast reply land and then be
  // clobbered by the reset — and worse, lets the previous exam's index survive
  // long enough to be compared against the new one's, which reads as an unlock.
  useEffect(() => {
    // Back to the null baseline, not to the new exam's values — which are not
    // known yet anyway. A privacy flag carried across exams gets compared
    // against a different session's, fires onSettings on arrival, and refetches
    // every name on the page for a change nobody made.
    prevRef.current = {
      index: -1,
      status: null,
      celebrate: null,
      privacy: null,
      visibility: null,
    };
    lastBeatAtRef.current = null;
    errorStreakRef.current = 0;
    serverNextPollRef.current = 1_500;
    transportRef.current = "connecting";
    clockRef.current.reset();
    liveTimerStore.clear();
    setState(INITIAL_STATE);
  }, [examId]);

  // ─── Pull loop lifecycle ───────────────────────────────────

  useEffect(() => {
    if (!examId || !enabled) return;

    cleanedUpRef.current = false;
    // Immediately, so the clock offset and session state land before the first
    // paint that depends on them.
    void runSyncRef.current({ immediate: true });

    // Coming back from a hidden tab, or from offline, re-syncs at once rather
    // than waiting out the 20s hidden interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
      else scheduleNextRef.current();
    };
    const onOnline = () => refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cleanedUpRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [examId, enabled, refresh]);

  return { ...state, serverNow, refresh };
}

/**
 * Field-by-field comparison so an unchanged sync is a no-op for React.
 * Spelled out rather than looped: a missed field here is a silent stale render,
 * and the compiler catches an omission when the state type grows.
 */
function shallowEqualState(a: LiveSessionState, b: LiveSessionState): boolean {
  return (
    a.status === b.status &&
    a.currentQuestionIndex === b.currentQuestionIndex &&
    a.unlockedAt === b.unlockedAt &&
    a.extraSeconds === b.extraSeconds &&
    a.scheduledStartAt === b.scheduledStartAt &&
    a.autoStart === b.autoStart &&
    a.privacyMode === b.privacyMode &&
    a.leaderboardVisibility === b.leaderboardVisibility &&
    a.presentShowLeaderboard === b.presentShowLeaderboard &&
    a.presentShowRiver === b.presentShowRiver &&
    a.presentShowOptions === b.presentShowOptions &&
    a.presentRevealAnswer === b.presentRevealAnswer &&
    a.presentTheme === b.presentTheme &&
    a.celebrateSeq === b.celebrateSeq &&
    a.totalQuestions === b.totalQuestions &&
    a.onlineCount === b.onlineCount &&
    a.joinedCount === b.joinedCount &&
    a.myRank === b.myRank &&
    a.myTotalCorrect === b.myTotalCorrect &&
    a.confusionCount === b.confusionCount &&
    a.openResponseCount === b.openResponseCount &&
    a.transport === b.transport &&
    a.loading === b.loading
  );
}
