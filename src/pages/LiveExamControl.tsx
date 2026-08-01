/**
 * LiveExamControl.tsx — Creator Live Dashboard (The Control Room)
 *
 * Design intent
 * -------------
 * A creator running a live exam is presenting: they cannot hunt for a control
 * while 120 students wait. So this screen is a cockpit, not a document — on a
 * laptop it fills the viewport exactly and never scrolls as a page. Only two
 * inner panes scroll (question preview, leaderboard); everything a creator acts
 * on stays pinned:
 *
 *   ┌ header ─ status · students online · share · end ────────────────┐
 *   ├ control deck ─ timer ring · answered meter · UNLOCK ───┬ ranks ─┤
 *   │ question preview (scrolls)                             │(scroll)│
 *   ├ question rail ─ whole exam at a glance, click to review ─────────┤
 *
 * The rail doubles as navigation: clicking a past question swaps the preview
 * pane to it, which is why the old stacked "Previous Questions" accordion is
 * gone — it pushed the live controls off screen.
 *
 * Where the live state comes from
 * -------------------------------
 * `exam` is the document: name, share code, languages. Loaded once.
 * `session` is the live state: which question is open, since when, who is in
 * the room. It arrives through `useLiveSession`, which owns the transport
 * (realtime with a polling fallback), the server clock, and the deadline.
 *
 * This page therefore holds no timer state of its own. It used to: a 250ms
 * interval driving `useState` at the top of the component, which re-rendered
 * the leaderboard, the rail and the whole question preview four times a second
 * for the length of every question. The countdown now lives in a store that
 * only the timer components subscribe to, and this page reads a boolean that
 * flips once per question.
 *
 * The answered count, the option tally and the confusion count all arrive from
 * one 750ms poll (`useOpenQuestionTally`) instead of a realtime subscription
 * that sent this single browser one message per student per question.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Play,
  SkipForward,
  Square,
  Users,
  Clock,
  Trophy,
  Check,
  Zap,
  Radio,
  Copy,
  QrCode as QrCodeIcon,
  Eye,
  EyeOff,
  Target,
  Hourglass,
  CornerUpLeft,
  CheckCircle2,
  ListChecks,
  MonitorPlay,
  FlaskConical,
} from "lucide-react";
import QRCode from "react-qr-code";
import SEO from "@/components/SEO";
import LiveQuestionBody, { questionPreviewText } from "@/components/live/LiveQuestionBody";
import LiveOption, { type OptionVisual } from "@/components/live/LiveOption";
import LiveLeaderboard from "@/components/live/LiveLeaderboard";
import QuestionRail, { RailLegend, type ChipStatus, type RailItem } from "@/components/live/QuestionRail";
import { LiveTimerBar, LiveTimerRing } from "@/components/live/LiveTimer";
import { OutcomeBar, MeterRow } from "@/components/live/LiveStats";
import PresenterHud from "@/components/live/PresenterHud";
import SessionSettingsMenu from "@/components/live/SessionSettingsMenu";
import {
  AddTimeControls,
  UndoPill,
  UNDO_WINDOW_MS,
} from "@/components/live/LiveTimeControls";
import { parseLiveError } from "@/lib/live/liveErrors";
import AnswerRiver from "@/components/live/AnswerRiver";
import {
  ConfusionCount,
  InsightHeading,
  LiveCoachLine,
  MisconceptionCallout,
  TimeProfile,
} from "@/components/live/LiveInsight";
import { classifyDistribution } from "@/lib/live/classifyDistribution.js";
import { tallyOptions } from "@/lib/live/optionTally.js";
import { MomentChip } from "@/components/live/MomentCard";
import { selectMoment, withRealNames } from "@/lib/live/moments.js";
import {
  fetchLiveExam,
  fetchAllLiveQuestions,
  fetchLiveSections,
  startLiveSession,
  unlockNextQuestion,
  endLiveSession,
  computeQuestionAnalytics,
  computeRankings,
  fetchLeaderboard,
  fetchAllAnalytics,
  fetchParticipantNames,
  updateLiveExam,
  addLiveQuestionTime,
  undoLastLiveUnlock,
  fetchLiveMoments,
  celebrateLiveExam,
  type LiveMoment,
  type LeaderboardVisibility,
  type LiveExam,
  type LiveQuestion,
  type LiveSection,
  type LiveParticipant,
  type LiveQuestionAnalytics,
} from "@/services/liveExamService";
import { useLiveSession } from "@/hooks/useLiveSession";
import {
  useOpenQuestionTally,
  TALLY_IDLE_POLL_MS,
  TALLY_POLL_MS,
} from "@/hooks/useOpenQuestionTally";
import { useLiveTimerExpiry, useLiveTimerPhase, useLiveTimerTarget } from "@/lib/live/timerStore";
import { usePeerWindow } from "@/hooks/usePeerWindow";
import { useRehearsal, REHEARSAL_COHORT, type RehearsalSpeed } from "@/hooks/useRehearsal";
import ScheduledCountdown from "@/components/live/ScheduledCountdown";
import ScheduleControl from "@/components/live/ScheduleControl";
import { presentWindowName } from "@/lib/live/presentChannel";

/** Is this option (index) part of the stored correct answer? */
function isCorrectOption(correctAnswer: any, i: number): boolean {
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((c) => String(c) === String(i));
  }
  return String(correctAnswer) === String(i);
}

/** Compact metric for the strip under the control deck. */
function DeckStat({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "correct" | "brand" | "amber";
  icon?: typeof Users;
}) {
  const toneClass =
    tone === "correct"
      ? "text-emerald-600"
      : tone === "brand"
        ? "text-primary"
        : tone === "amber"
          ? "text-amber-600"
          : "text-foreground";

  return (
    <div className="min-w-0 px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-0.5 truncate text-[15px] font-bold leading-tight tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function LiveExamControl() {
  const { creatorId, liveExamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Core state. `exam` is the document; live session state comes from the spine.
  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);
  const [analytics, setAnalytics] = useState<Map<string, LiveQuestionAnalytics>>(new Map());
  /**
   * user_id → real display name. Privacy mode makes the denormalised
   * fastest_user_name a pseudonym (it has to be — that table is broadcast to
   * every student), so this is how the creator's own screen recovers the real
   * name from fastest_user_id.
   */
  const [participantNames, setParticipantNames] = useState<Map<string, string>>(new Map());
  /** B14. Fetched alongside analytics, never polled — a handful of rows per question. */
  const [moments, setMoments] = useState<LiveMoment[]>([]);

  // Dialog states
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  /** A1: the join panel, pinned on until the creator dismisses it. */
  const [hudPinned, setHudPinned] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  /** Past question being inspected in the preview pane; null = the live one. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  /**
   * Creators often screen-share this page, so the answer key stays hidden
   * while a question is open unless they deliberately reveal it.
   */
  const [showKey, setShowKey] = useState(false);

  // Async callbacks read the question list through a ref so a late-arriving
  // event can never act against a stale copy.
  const questionsRef = useRef<LiveQuestion[]>([]);
  questionsRef.current = questions;

  // Grace window: server accepts submissions until +2s after the visual
  // timer ends, so analytics wait ~2.5s before computing.
  const [collectingFinal, setCollectingFinal] = useState(false);
  const graceTimeoutRef = useRef<number | null>(null);
  /**
   * Questions whose analytics computation has been started by this tab.
   *
   * There are two paths into computing — the countdown expiring, and the
   * missed-expiry sweep for a tab that was away when a question ended — and the
   * window between them is not covered by the grace timeout alone: the timeout
   * clears its own ref before awaiting the RPC, so for the duration of that
   * request the sweep sees "no compute pending, no analytics yet" and fires a
   * second one. Idempotent server-side, but it doubles the work and races two
   * ranking recomputes against each other.
   */
  const computeStartedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (graceTimeoutRef.current) window.clearTimeout(graceTimeoutRef.current);
    };
  }, []);

  // ─── Load initial data ─────────────────────────────────────

  useEffect(() => {
    if (!liveExamId) return;
    loadData();
  }, [liveExamId]);

  const loadData = async (silent = false) => {
    if (!liveExamId) return;
    if (!silent) setLoading(true);
    try {
      const examData = await fetchLiveExam(liveExamId);
      setExam(examData);

      const secs = await fetchLiveSections(liveExamId, examData.primary_language || "en");
      setSections(secs);

      const qs = await fetchAllLiveQuestions(liveExamId, examData.primary_language || "en");
      setQuestions(qs);

      // Rehydrate analytics. Rows are keyed by the canonical primary-language
      // question id — the same ids `qs` uses, since the creator always loads
      // the primary language.
      const allAnalytics = await fetchAllAnalytics(liveExamId);
      const analyticsMap = new Map<string, LiveQuestionAnalytics>();
      allAnalytics.forEach(a => analyticsMap.set(a.live_question_id, a));
      setAnalytics(analyticsMap);

      // The BASE table, not the masked view: this is the one screen allowed to
      // show real names.
      if (examData.status === "live" || examData.status === "ended") {
        const lb = await fetchLeaderboard(liveExamId, 20);
        setLeaderboard(lb);
      }

      /**
       * The name map is loaded for EVERY status, not only live/ended.
       *
       * It used to sit inside the live/ended branch, and `loadData` runs once on
       * mount — but the normal route into this page is editor → control room
       * while the exam is still `published`. So on the path a creator actually
       * takes, the map was never populated, and privacy mode showed the creator
       * pseudonyms on their own private deck: the exact opposite of the design,
       * which is that the wall is anonymous and the cockpit is not.
       */
      const names = await fetchParticipantNames(liveExamId).catch(
        () => new Map<string, string>()
      );
      setParticipantNames(names);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  /** Pull the leaderboard and fold in an analytics row. */
  const absorbAnalytics = useCallback(
    (row: LiveQuestionAnalytics) => {
      setAnalytics((prev) => {
        const next = new Map(prev);
        next.set(row.live_question_id, row);
        return next;
      });
    },
    []
  );

  const refreshLeaderboard = useCallback(async () => {
    if (!liveExamId) return;
    try {
      setLeaderboard(await fetchLeaderboard(liveExamId, 20));
    } catch {
      /* transient — the next question's compute refreshes it again */
    }
  }, [liveExamId]);

  // ─── Live session (transport, clock, deadline) ──────────────

  const session = useLiveSession(liveExamId, {
    role: "creator",
    onUnlock: () => {
      // A late joiner answering fastest would otherwise show as a pseudonym on
      // the creator's own deck, because the map is only fetched on mount.
      if (liveExamId) {
        void fetchParticipantNames(liveExamId)
          .then(setParticipantNames)
          .catch(() => {});
      }
    },
    onEnded: () => {
      void refreshLeaderboard();
    },
    onAnalytics: (row) => {
      absorbAnalytics(row);
      // Ranks are recomputed alongside analytics, including by the server's
      // end-of-session backfill which this tab never triggered.
      void refreshLeaderboard();
      // B14 is derived in the same server call, so this is the moment it exists.
      if (liveExamId) {
        void fetchLiveMoments(liveExamId).then(setMoments).catch(() => {});
      }
    },
    onReconnect: () => {
      // Rehydrate analytics/leaderboard missed while disconnected.
      void loadDataRef.current(true);
    },
  });

  // ─── Rehearsal (C1) ───────────────────────────────────────

  /**
   * A dress rehearsal in an empty theatre.
   *
   * The driver presents the same shape as the live session, and every value the
   * deck below reads is taken from whichever source is active. That is deliberate:
   * a rehearsal-specific rendering path would defeat the point, because what a
   * creator practises has to be the thing they will later use.
   *
   * The driver reaches no network at all — see hooks/useRehearsal.ts.
   */
  const rehearsal = useRehearsal(
    useMemo(
      () =>
        questions.map((q) => ({
          id: q.id,
          time_seconds: q.time_seconds,
          options: q.options,
          correct_answer: q.correct_answer,
        })),
      [questions]
    )
  );

  // ─── Derived state ────────────────────────────────────────

  const status = rehearsal.active ? "live" : session.status ?? exam?.status ?? null;
  /**
   * Who is actually here, from the presence heartbeat.
   *
   * Not `joinedCount`: that counts everyone who ever opened the link, which is
   * the wrong denominator for a response rate and the wrong answer to "how many
   * are in the room". (The old `is_active` column looked like this number but
   * was never written by any client, so it always meant "ever joined".)
   */
  const inRoom = rehearsal.active ? rehearsal.onlineCount : session.onlineCount;
  const currentQuestionIndex = rehearsal.active
    ? rehearsal.index
    : session.currentQuestionIndex;
  /** The open question's unlock instant, from whichever source is driving. */
  const deckUnlockedAt = rehearsal.active ? rehearsal.unlockedAt : session.unlockedAt;
  const deckExtraSeconds = rehearsal.active ? 0 : session.extraSeconds;
  const currentQuestion = currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null;
  const isLive = status === "live";
  const isEnded = status === "ended";
  const hasStarted = currentQuestionIndex >= 0;
  const hasOpenQuestion = isLive && hasStarted && !!deckUnlockedAt;

  // Point the shared countdown at the open question. The arithmetic lives in
  // lib/live/deadline.js, shared with the SQL function of the same name, so
  // this page never spells out a deadline.
  useLiveTimerTarget({
    index: currentQuestionIndex,
    unlockedAt: deckUnlockedAt,
    extraSeconds: deckExtraSeconds,
    // A rehearsal at 10x compresses the clock, which is the whole point of a
    // speed control: a twenty-question run rehearses in three minutes.
    timeSeconds: rehearsal.active
      ? rehearsal.scaledSeconds
      : currentQuestion?.time_seconds ?? null,
    active: isLive,
  });

  const timerPhase = useLiveTimerPhase();
  /**
   * The countdown store is one commit behind a brand-new index, so gate on it
   * having caught up. During that single render the question counts as neither
   * running nor expired, which keeps a creator leaning on the space bar from
   * unlocking twice.
   */
  const timerReady = timerPhase.key === currentQuestionIndex;
  const isTimerActive = timerReady && timerPhase.running;
  const isTimerExpired = hasOpenQuestion && timerReady && !timerPhase.running;

  const canUnlockNext =
    isLive &&
    (!hasStarted || isTimerExpired) &&
    !collectingFinal &&
    currentQuestionIndex < questions.length - 1;

  const currentAnalytics = rehearsal.active
    ? (rehearsal.analytics.get(currentQuestionIndex) as any) ?? null
    : currentQuestion
      ? analytics.get(currentQuestion.id)
      : null;

  // One poll carries the answered count, the option tally and the confusion
  // count. It replaced a realtime subscription that sent this single browser one
  // message per student per question. Fast while answers can still arrive
  // (including through the grace window), slow once the numbers are settled and
  // the creator is discussing the reveal.
  const { tally: liveTallyRaw, refresh: refreshTally } = useOpenQuestionTally(
    liveExamId,
    // Not polled at all during a rehearsal: there is nothing on the server to ask
    // about, and asking would be the one place a rehearsal touched the network.
    hasOpenQuestion && !rehearsal.active,
    isTimerActive || collectingFinal ? TALLY_POLL_MS : TALLY_IDLE_POLL_MS
  );

  /** The open question's live numbers, from whichever source is driving. */
  const tally = useMemo(
    () =>
      rehearsal.active
        ? {
            live_question_id: currentQuestion?.id ?? null,
            response_count: rehearsal.answeredCount,
            confusion_count: rehearsal.confusionCount,
            option_tally: rehearsal.optionTally,
            first_response_at: null,
            server_now: "",
          }
        : liveTallyRaw,
    [rehearsal.active, rehearsal.answeredCount, rehearsal.confusionCount, rehearsal.optionTally, currentQuestion, liveTallyRaw]
  );

  /** Guarded on the id so a just-closed question's count never bleeds forward. */
  const currentResponseCount =
    currentQuestion && tally.live_question_id === currentQuestion.id ? tally.response_count : 0;

  // ─── Timer expiry → analytics ──────────────────────────────

  const handleTimerExpired = useCallback(
    (expiredIndex: number) => {
      if (!liveExamId) return;
      const currentQ = questionsRef.current[expiredIndex];
      if (!currentQ) return;

      // Server accepts submissions until +2s after the visual timer, so wait
      // out the grace window before computing analytics.
      setCollectingFinal(true);
      if (graceTimeoutRef.current) window.clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = window.setTimeout(async () => {
        graceTimeoutRef.current = null;
        setCollectingFinal(false);
        // Claimed before the await, so the missed-expiry sweep cannot slip in
        // while the RPC is in flight.
        computeStartedRef.current.add(currentQ.id);
        try {
          absorbAnalytics(await computeQuestionAnalytics(liveExamId, currentQ.id));
          await computeRankings(liveExamId);
          await refreshLeaderboard();
          toast({
            title: `Q${expiredIndex + 1} Timer Ended`,
            description: "Analytics computed & rankings updated.",
          });
        } catch (error: any) {
          console.error("Analytics computation failed:", error);
          // Released so the sweep can retry: without analytics this question has
          // no reveal for students and no contribution to the rankings.
          computeStartedRef.current.delete(currentQ.id);
          toast({
            title: "Error computing analytics",
            description: error.message,
            variant: "destructive",
          });
        }
      }, 2500);
    },
    [liveExamId, absorbAnalytics, refreshLeaderboard, toast]
  );

  // Fires once per question, and never for a question that was already over
  // when this tab arrived — that case is handled by the missed-expiry sweep.
  useLiveTimerExpiry(handleTimerExpired);

  /**
   * A3 cancels a pending reveal.
   *
   * The blocker an adversarial review caught: granting time re-arms the countdown
   * (the store's setTarget accepts a later deadline for the same key), but nothing
   * cancelled the grace timeout that expiry had already scheduled. It fired 2.5s
   * later and computed analytics — publishing the answer — for a question that was
   * open again for another half minute.
   *
   * `collectingFinal` has to be cleared in the same breath, because the only other
   * place that clears it is inside the very timeout being cancelled; otherwise the
   * deck sits on "Collecting final answers…" for the whole extension.
   */
  const extraSecondsRef = useRef(session.extraSeconds);
  useEffect(() => {
    const grew = session.extraSeconds > extraSecondsRef.current;
    extraSecondsRef.current = session.extraSeconds;
    if (!grew) return;

    if (graceTimeoutRef.current !== null) {
      window.clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    setCollectingFinal(false);
    // The question is answerable again, so a compute must be allowed to run once
    // it genuinely closes.
    if (currentQuestion) computeStartedRef.current.delete(currentQuestion.id);
  }, [session.extraSeconds, currentQuestion]);

  // ─── A3 / A10 handlers ─────────────────────────────────────

  const [controlPending, setControlPending] = useState(false);

  /** Both RPCs report through machine-parseable codes; never paste a raw one. */
  const reportControlError = useCallback(
    (err: unknown) => {
      const parsed = parseLiveError(err);
      toast({
        title: parsed.title,
        description: parsed.text,
        // An expected outcome — missing the undo window, hitting the cap — is not
        // a failure, and a destructive toast for one trains creators to ignore them.
        variant: parsed.expected ? "default" : "destructive",
      });
    },
    [toast]
  );

  const handleAddTime = useCallback(
    async (seconds: 30 | 60) => {
      if (!liveExamId || controlPending) return;
      setControlPending(true);
      try {
        setExam(await addLiveQuestionTime(liveExamId, seconds));
        session.refresh();
        toast({ title: `+${seconds}s added`, description: "Everyone's timer just grew." });
      } catch (err) {
        reportControlError(err);
      } finally {
        setControlPending(false);
      }
    },
    [liveExamId, controlPending, session, toast, reportControlError]
  );

  const handleUndoUnlock = useCallback(async () => {
    if (!liveExamId || controlPending) return;
    setControlPending(true);
    try {
      // Any pending reveal for the question being withdrawn must not fire.
      if (graceTimeoutRef.current !== null) {
        window.clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      setCollectingFinal(false);
      if (currentQuestion) computeStartedRef.current.delete(currentQuestion.id);

      setExam(await undoLastLiveUnlock(liveExamId));
      session.refresh();
      refreshTally();
      toast({ title: "Unlock taken back", description: "Students are back to waiting." });
    } catch (err) {
      reportControlError(err);
    } finally {
      setControlPending(false);
    }
  }, [liveExamId, controlPending, currentQuestion, session, refreshTally, toast, reportControlError]);

  /**
   * When the undo window closes, in server-corrected time.
   *
   * Undo also disappears the moment anyone answers — read from the tally the deck
   * is already polling rather than from a new subscription. At 750ms while a
   * question is running, the guard is well inside the 5s window.
   */
  const undoClosesAtMs = useMemo(() => {
    if (!session.unlockedAt || currentQuestionIndex < 0) return 0;
    return new Date(session.unlockedAt).getTime() + UNDO_WINDOW_MS;
  }, [session.unlockedAt, currentQuestionIndex]);

  /**
   * `serverNow()` is not reactive, and deliberately so: no new interval is added
   * for this. The tally poll already re-renders this page every 750ms while a
   * question is running, which is the only window undo is offered in — so the pill
   * disappears within 750ms of the window closing, and the server refuses anything
   * later regardless. The visible bar is CSS and finishes exactly on time.
   */
  const canUndo =
    isLive &&
    hasOpenQuestion &&
    currentResponseCount === 0 &&
    !currentAnalytics &&
    session.serverNow() < undoClosesAtMs;


  /**
   * Missed expiry: this tab was closed or asleep when a question ended, so
   * nobody computed its analytics. The countdown store deliberately does not
   * fire for an already-expired target (it would double-compute for the tab
   * that was present), so the recovery lives here instead.
   */
  useEffect(() => {
    if (!liveExamId || !isTimerExpired || !currentQuestion) return;
    if (analytics.has(currentQuestion.id)) return;
    if (graceTimeoutRef.current !== null || collectingFinal) return;
    // The expiry path may already have a compute in flight for this question.
    if (computeStartedRef.current.has(currentQuestion.id)) return;
    computeStartedRef.current.add(currentQuestion.id);

    let cancelled = false;
    (async () => {
      try {
        const row = await computeQuestionAnalytics(liveExamId, currentQuestion.id);
        if (cancelled) return;
        absorbAnalytics(row);
        await computeRankings(liveExamId);
        await refreshLeaderboard();
      } catch (err) {
        console.error("Missed-expiry analytics computation failed:", err);
        // Released so a later render can retry — a question left without
        // analytics has no reveal and no ranking.
        computeStartedRef.current.delete(currentQuestion.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    liveExamId,
    isTimerExpired,
    currentQuestion,
    analytics,
    collectingFinal,
    absorbAnalytics,
    refreshLeaderboard,
  ]);

  // A fresh unlock always pulls the preview back to the live question.
  useEffect(() => {
    setPreviewIndex(null);
    setShowKey(false);
  }, [currentQuestionIndex]);

  const isReviewing = previewIndex !== null && previewIndex !== currentQuestionIndex;
  const previewQuestion = isReviewing ? questions[previewIndex!] : currentQuestion;
  const previewAnalytics = previewQuestion ? analytics.get(previewQuestion.id) : null;
  const previewIdx = isReviewing ? previewIndex! : currentQuestionIndex;

  const sectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    sections.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sections]);

  const sectionNameFor = (q: LiveQuestion | null | undefined) =>
    q ? sectionNameById.get(q.live_section_id) || q.section_label || undefined : undefined;

  /** Answer key visible when the question is over, being reviewed, or unhidden. */
  const keyVisible = isReviewing || isTimerExpired || showKey || isEnded;

  // ─── Phase 3 insight, all derived from data already on this page ──────────

  const previewOptionCount = Array.isArray(previewQuestion?.options)
    ? previewQuestion!.options.length
    : 0;

  /**
   * B9. While a question is open the counts come from the 750ms tally; once it
   * closes they come from the analytics row. Same normaliser either way, because
   * both are built from `selected_answer::text` in SQL and carry the same four
   * key shapes.
   */
  const liveTally = useMemo(() => {
    const openMatches =
      currentQuestion && tally.live_question_id === currentQuestion.id && !isReviewing;
    const source = openMatches ? tally.option_tally : previewAnalytics?.option_distribution;
    return tallyOptions(source, previewOptionCount);
  }, [tally, currentQuestion, isReviewing, previewAnalytics, previewOptionCount]);

  /** B4. Only meaningful once the numbers are final. */
  const classification = useMemo(() => {
    if (!previewQuestion || !previewAnalytics) return null;
    return classifyDistribution({
      optionDistribution: previewAnalytics.option_distribution,
      correctAnswer: previewQuestion.correct_answer,
      totalResponses: previewAnalytics.total_responses,
      optionCount: previewOptionCount,
      answerType: previewQuestion.answer_type,
      onlineCount: inRoom,
    });
  }, [previewQuestion, previewAnalytics, previewOptionCount, inRoom]);

  /** B6. Computed server-side with the rest of the analytics; nothing to fetch. */
  const timeProfile = useMemo(() => {
    if (!previewAnalytics) return null;
    return {
      fastCorrect: previewAnalytics.fast_correct ?? 0,
      slowCorrect: previewAnalytics.slow_correct ?? 0,
      fastWrong: previewAnalytics.fast_wrong ?? 0,
      slowWrong: previewAnalytics.slow_wrong ?? 0,
      impulsiveWrong: previewAnalytics.impulsive_wrong ?? 0,
      medianMs: previewAnalytics.median_time_ms ?? null,
      histogram: Array.isArray(previewAnalytics.time_histogram)
        ? previewAnalytics.time_histogram
        : [],
    };
  }, [previewAnalytics]);

  /**
   * Presence a moment ago, for A8's "the wifi died, not the question" rule.
   *
   * Sampled from the session's own online count rather than a new request, and
   * held in a ref so sampling never causes a render.
   */
  const onlineHistoryRef = useRef<{ at: number; n: number }[]>([]);
  const onlineDelta30s = useMemo(() => {
    const now = Date.now();
    const hist = onlineHistoryRef.current;
    if (hist.length === 0 || hist[hist.length - 1].n !== inRoom) {
      hist.push({ at: now, n: inRoom });
    }
    while (hist.length > 1 && now - hist[0].at > 45_000) hist.shift();
    const oldest = hist[0];
    return oldest ? inRoom - oldest.n : 0;
  }, [inRoom]);

  /**
   * A8's inputs, minus the ticking one.
   *
   * `remainingSeconds` is supplied by LiveCoachLine, which subscribes to the
   * countdown itself. Reading it here would re-render the whole control room once
   * a second — exactly what Phase 0 removed.
   */
  const coachContext = useMemo(() => {
    if (!isLive || isReviewing) return null;
    const startedAt = exam?.started_at ? new Date(exam.started_at).getTime() : null;
    return {
      phase: (!hasStarted ? "lobby" : isTimerActive ? "open" : "revealed") as
        | "lobby"
        | "open"
        | "revealed"
        | "ended",
      totalSeconds: (currentQuestion?.time_seconds ?? 0) + session.extraSeconds,
      answered: currentResponseCount,
      onlineCount: inRoom,
      onlineDelta30s,
      confusionCount: tally.confusion_count ?? 0,
      classification: isTimerActive ? null : classification,
      timeProfile: isTimerActive ? null : timeProfile,
      questionIndex: currentQuestionIndex,
      totalQuestions: questions.length,
      elapsedMinutes: startedAt ? (Date.now() - startedAt) / 60000 : 0,
      plannedMinutes: questions.reduce((m, q) => m + q.time_seconds / 60, 0),
    };
  }, [
    isLive,
    isReviewing,
    hasStarted,
    isTimerActive,
    currentQuestion,
    session.extraSeconds,
    currentResponseCount,
    inRoom,
    onlineDelta30s,
    tally.confusion_count,
    classification,
    timeProfile,
    currentQuestionIndex,
    questions,
    exam?.started_at,
  ]);

  /**
   * Fastest correct answer to show on the deck. While a question is open it has
   * no analytics yet, so fall back to the most recent question that does —
   * an empty tile mid-session reads as "nobody has answered".
   */
  const fastest = useMemo(() => {
    for (let i = currentQuestionIndex; i >= 0; i--) {
      const a = questions[i] ? analytics.get(questions[i].id) : undefined;
      if (a?.fastest_user_name) {
        // Under privacy mode the stored name is a pseudonym, because that row is
        // broadcast to every student. The creator's own deck resolves the real
        // name from the id — this screen is never on the projector.
        const real = a.fastest_user_id ? participantNames.get(a.fastest_user_id) : undefined;
        return { index: i, name: real || a.fastest_user_name, ms: a.fastest_time_ms };
      }
    }
    return null;
  }, [analytics, questions, currentQuestionIndex, participantNames]);

  /** Running accuracy across every question whose analytics have landed. */
  const sessionAccuracy = useMemo(() => {
    let correct = 0;
    let total = 0;
    analytics.forEach((a) => {
      correct += a.correct_count || 0;
      total += a.total_responses || 0;
    });
    return total > 0 ? Math.round((correct / total) * 100) : null;
  }, [analytics]);

  const railItems: RailItem[] = useMemo(
    () =>
      questions.map((q, idx) => {
        let status: ChipStatus;
        if (isReviewing && idx === previewIndex) status = "reviewing";
        else if (idx === currentQuestionIndex) status = "current";
        else if (idx < currentQuestionIndex) status = "done";
        else status = "upcoming";
        return {
          id: q.id,
          index: idx,
          status,
          group: sectionNameFor(q),
          title: questionPreviewText(q.text, 48),
        };
      }),
    // sectionNameFor is re-created each render; depend on its input instead.
    [questions, currentQuestionIndex, previewIndex, isReviewing, sectionNameById]
  );

  // ─── A2 / Q2: the projector window ─────────────────────────

  const presentUrl = `/live-exam/${creatorId}/${liveExamId}/present`;
  const { peerOpen: presentOpen, openPeer: openPresent, post: postToPresent } = usePeerWindow(
    liveExamId,
    "control",
    presentUrl,
    presentWindowName(liveExamId || "")
  );

  /**
   * Persist a session setting, and echo it to the projector immediately.
   *
   * The database row is the source of truth — the present window will pick the
   * change up through its own session sync regardless. The broadcast just skips
   * the round trip so a creator flicking "hide names" while casting sees the wall
   * change at once rather than a second later, which is the difference between
   * feeling in control and wondering if the toggle worked.
   */
  const handleSettingsChange = useCallback(
    async (patch: Partial<{
      privacyMode: boolean;
      leaderboardVisibility: LeaderboardVisibility;
      presentShowLeaderboard: boolean;
      presentShowRiver: boolean;
    }>) => {
      if (!liveExamId) return;
      setSavingSettings(true);
      try {
        await updateLiveExam(liveExamId, {
          ...(patch.privacyMode !== undefined ? { privacy_mode: patch.privacyMode } : {}),
          ...(patch.leaderboardVisibility !== undefined
            ? { leaderboard_visibility: patch.leaderboardVisibility }
            : {}),
          ...(patch.presentShowLeaderboard !== undefined
            ? { present_show_leaderboard: patch.presentShowLeaderboard }
            : {}),
          ...(patch.presentShowRiver !== undefined
            ? { present_show_river: patch.presentShowRiver }
            : {}),
        });
        session.refresh();
        if (patch.presentShowLeaderboard !== undefined || patch.presentShowRiver !== undefined) {
          postToPresent({
            t: "config",
            showLeaderboard: patch.presentShowLeaderboard,
            showRiver: patch.presentShowRiver,
          });
        }
      } catch (error: any) {
        toast({ title: "Couldn't save that setting", description: error.message, variant: "destructive" });
      } finally {
        setSavingSettings(false);
      }
    },
    [liveExamId, session, postToPresent, toast]
  );

  // ─── B14 ───────────────────────────────────────────────────

  /**
   * The one moment worth mentioning for the question on screen.
   *
   * Real names are swapped in here and only here: get_live_moments returns the
   * masked name because that same row reaches the projector, and the control room
   * is the only screen never cast.
   */
  const featuredMoment = useMemo(() => {
    if (previewIdx < 0 || moments.length === 0) return null;
    return selectMoment(withRealNames(moments, participantNames), previewIdx);
  }, [moments, participantNames, previewIdx]);

  const handleCelebrate = useCallback(async () => {
    if (!liveExamId || controlPending) return;
    setControlPending(true);
    try {
      await celebrateLiveExam(liveExamId);
      // No local confetti: the control room is the one screen that must stay
      // responsive, and there is no audience in front of it.
      postToPresent({ t: "celebrate", seq: Date.now() });
    } catch (err) {
      reportControlError(err);
    } finally {
      setControlPending(false);
    }
  }, [liveExamId, controlPending, postToPresent, reportControlError]);

  /** C10. Same save path as the session settings, so both share one pending flag. */
  const handleScheduleChange = useCallback(
    async (patch: { scheduled_start_at?: string | null; auto_start?: boolean }) => {
      if (!liveExamId) return;
      setSavingSettings(true);
      try {
        await updateLiveExam(liveExamId, patch);
        session.refresh();
      } catch (error: any) {
        toast({
          title: "Couldn't save the start time",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setSavingSettings(false);
      }
    },
    [liveExamId, session, toast]
  );

  /**
   * C10 auto-start.
   *
   * Deliberately driven from the creator's own control room rather than a cron or
   * an edge function. That is partly a plan constraint, but it is also the honest
   * semantic: a session should not begin while the person running it is still
   * plugging in the projector. The guard chain matters — published, scheduled,
   * opted in, time reached, and not already starting.
   */
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (autoStartFiredRef.current) return;
    if (!session.autoStart || !session.scheduledStartAt) return;
    if (session.status !== "published") return;
    if (session.serverNow() < new Date(session.scheduledStartAt).getTime()) return;

    autoStartFiredRef.current = true;
    void handleStartLive();
    // handleStartLive is stable enough for this one-shot; the ref is the real guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.autoStart, session.scheduledStartAt, session.status, session.onlineCount]);

  /**
   * Stable so the memoised rail is not re-rendered by the answered-count poll.
   * An inline arrow here would give QuestionRail a new prop identity roughly
   * once a second, defeating its memo for every chip in the exam.
   */
  const handleRailSelect = useCallback(
    (item: RailItem) => {
      // Clicking the live question returns the pane to it; a past question
      // opens read-only review without pausing anything.
      if (item.index === currentQuestionIndex) setPreviewIndex(null);
      else if (item.index < currentQuestionIndex) setPreviewIndex(item.index);
      else toast({ title: `Q${item.index + 1} hasn't been unlocked yet` });
    },
    [currentQuestionIndex, toast]
  );

  // ─── Actions ───────────────────────────────────────────────

  const handleStartLive = async () => {
    if (!liveExamId) return;
    try {
      const updated = await startLiveSession(liveExamId);
      setExam(updated);
      session.refresh();
      setShowStartDialog(false);
      toast({ title: "🔴 You're Live!", description: "Students can now join. Unlock the first question when ready." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const unlockingRef = useRef(false);

  const handleUnlockNext = async () => {
    // In a rehearsal the same button drives the simulated cohort, so the creator
    // practises the control they will actually use rather than a mock of it.
    if (rehearsal.active) {
      rehearsal.unlockNext();
      return;
    }
    if (!liveExamId || !exam) return;
    // The space bar makes a double-fire cheap to trigger; the server would
    // happily advance twice and skip a question in front of the whole class.
    if (unlockingRef.current) return;
    unlockingRef.current = true;

    try {
      // Never carry a pending grace compute across an unlock
      if (graceTimeoutRef.current) {
        window.clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      setCollectingFinal(false);

      // Server increments the index and stamps the unlock with DB time. The
      // session spine picks the new row up through realtime (or its next poll)
      // and re-arms the countdown from the server's timestamp, so there is
      // nothing to set here — an unlock that this tab did and one it merely
      // observed now travel the identical path.
      const updated = await unlockNextQuestion(liveExamId);
      setExam(updated);
      session.refresh();
      refreshTally();

      const nextIndex = updated.current_question_index;
      const nextQ = questionsRef.current[nextIndex];
      toast({ title: `Q${nextIndex + 1} Unlocked!`, description: `Timer: ${nextQ?.time_seconds}s` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      unlockingRef.current = false;
    }
  };

  const handleEndExam = async () => {
    if (!liveExamId) return;
    try {
      if (graceTimeoutRef.current) {
        window.clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      setCollectingFinal(false);

      // Server back-fills any missing analytics and computes final rankings
      const updated = await endLiveSession(liveExamId);
      setExam(updated);
      session.refresh();
      setShowEndDialog(false);

      const [lb, allAnalytics] = await Promise.all([
        fetchLeaderboard(liveExamId, 20),
        fetchAllAnalytics(liveExamId),
      ]);
      setLeaderboard(lb);
      setAnalytics(new Map<string, LiveQuestionAnalytics>(allAnalytics.map(a => [a.live_question_id, a])));

      toast({ title: "Exam Ended", description: "Final rankings have been computed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Space / → advances the exam without leaving the keyboard. The handler is
  // read through a ref so the listener can never unlock against a stale
  // question list.
  const unlockRef = useRef(handleUnlockNext);
  unlockRef.current = handleUnlockNext;

  useEffect(() => {
    if (!canUnlockNext) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (showEndDialog || showStartDialog) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || el?.isContentEditable) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        unlockRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUnlockNext, showEndDialog, showStartDialog]);

  const shareUrl = exam ? `${window.location.origin}/live/${exam.share_code}` : "";

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied!", description: shareUrl });
  };

  // ─── Loading state ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Opening the control room…</p>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Live exam not found</p>
        <Button onClick={() => navigate("/dashboard?tab=live")}>Back to Dashboard</Button>
      </div>
    );
  }

  // The old Share dialog is gone. It was a modal that covered the timer, the
  // unlock button and the leaderboard, so creators opened it for each late
  // arrival and closed it immediately — which is exactly the interruption A1
  // exists to remove. Joining is now served by the pinnable HUD here, the
  // pre-flight card below, and the projector's own lobby.

  // ─── Pre-live state (published but not started) ────────────

  if (status === "published") {
    return (
      <div className="relative min-h-screen bg-background">
        <SEO
          title={`${exam.name} | Control Room`}
          description="Creator control room for a live exam session."
          path={`/live-exam/${creatorId}/${liveExamId}/control`}
          noindex
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/[0.07] to-transparent" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-5 py-12">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to editor
            </Button>
            {/*
              Available before going live on purpose: a creator plugs in HDMI and
              drags this window across while the room is still filling up, not
              once the first question is already on the wall.
            */}
            <Button variant="outline" size="sm" onClick={openPresent}>
              <MonitorPlay className="mr-1.5 h-4 w-4" />
              {presentOpen ? "Focus big screen" : "Open big screen"}
            </Button>
            <SessionSettingsMenu
              settings={{
                privacyMode: session.privacyMode,
                leaderboardVisibility: session.leaderboardVisibility,
                presentShowLeaderboard: session.presentShowLeaderboard,
                presentShowRiver: session.presentShowRiver,
              }}
              onChange={handleSettingsChange}
              saving={savingSettings}
            />
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-rose-500/25 bg-gradient-to-br from-rose-500/20 to-orange-500/10">
              <Radio className="h-7 w-7 text-rose-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Ready to go live</p>
              <h1 className="font-display text-3xl font-bold tracking-tight">{exam.name}</h1>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            {/* Pre-flight checklist — the questions creators ask before starting */}
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
              {[
                { icon: ListChecks, label: `${questions.length} questions ready`, done: questions.length > 0 },
                {
                  icon: Users,
                  // Presence, not "ever joined" — the number a creator glances
                  // at before starting has to mean "here now".
                  label: `${inRoom} student${inRoom !== 1 ? "s" : ""} waiting in the room`,
                  done: inRoom > 0,
                },
                { icon: Target, label: `${sections.length || 1} section${sections.length !== 1 ? "s" : ""}`, done: true },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      row.done ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {row.done ? <CheckCircle2 className="h-4 w-4" /> : <row.icon className="h-4 w-4" />}
                  </span>
                  <span className="text-sm font-medium">{row.label}</span>
                </div>
              ))}

              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-2">
                <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs">{shareUrl}</code>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-5">
              <div className="rounded-xl border bg-white p-3">
                <QRCode value={shareUrl} size={132} />
              </div>
              <p className="text-xs text-muted-foreground">Scan to join</p>
            </div>
          </div>

          {/* C10 — the decision belongs here, on the "am I about to run this?"
              screen, not buried in the question editor. */}
          <ScheduleControl
            scheduledStartAt={session.scheduledStartAt}
            autoStart={session.autoStart}
            onChange={handleScheduleChange}
            saving={savingSettings}
          />

          {/* A9 — only when a start time was actually set. */}
          {session.scheduledStartAt && (
            <ScheduledCountdown
              scheduledStartAt={session.scheduledStartAt}
              serverNow={session.serverNow}
            />
          )}

          <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-5">
            <p className="text-sm text-muted-foreground">
              Going live opens the waiting room. Nothing is shown to students until you unlock the first question — you
              control the pace throughout.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={() => setShowStartDialog(true)}
                size="lg"
                className="h-12 bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-600 sm:px-10"
              >
                <Play className="mr-2 h-5 w-5" />
                Go Live
              </Button>

              {/*
                C1. Beside Go Live, not buried in a menu — its entire purpose is to
                be the thing a nervous creator reaches for INSTEAD of going live for
                the first time in front of a class. It is also the best onboarding
                available: nobody reads a help page, everybody presses "Rehearse".
              */}
              <Button
                variant="outline"
                size="lg"
                className="h-12"
                disabled={questions.length === 0}
                onClick={() => rehearsal.start(5)}
                title="Run the whole exam against a simulated class. Nothing is recorded."
              >
                <FlaskConical className="mr-2 h-5 w-5" />
                Rehearse
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              A rehearsal runs the real control room against {REHEARSAL_COHORT} simulated
              students. No one is notified, and nothing is saved.
            </p>
          </div>

          <AlertDialog open={showStartDialog} onOpenChange={setShowStartDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Go Live?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will start the live session. Students who have joined will be able to see the exam. You'll control when each question is unlocked.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleStartLive} className="bg-rose-500 hover:bg-rose-600 text-white">
                  Go Live
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  // ─── Main Live / Ended View ────────────────────────────────

  /**
   * Answered as a share of the room.
   *
   * The denominator takes the max of presence and the answer count so the rate
   * can never read above 100%: if more people have answered than presence
   * believes are here, presence is the number that is wrong (a student on an
   * old tab, or one whose heartbeat is in flight), and the rate should not
   * announce that as 140%.
   */
  const responseDenominator = Math.max(inRoom, currentResponseCount, 1);
  const responseRatePct = Math.round((currentResponseCount / responseDenominator) * 100);

  /** The one thing the creator should do next, as a single primary control. */
  const primaryAction = () => {
    if (!isLive && !isEnded) return null;
    if (isEnded) {
      return (
        <Button variant="outline" className="h-11 w-full" onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to exam editor
        </Button>
      );
    }
    if (collectingFinal) {
      return (
        <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm font-semibold text-amber-600">
          <Hourglass className="h-4 w-4 animate-pulse" />
          Collecting final answers…
        </div>
      );
    }
    if (isTimerActive) {
      return (
        <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" />
          Question open — the next unlock arms when the timer ends
        </div>
      );
    }
    if (canUnlockNext) {
      return (
        <Button onClick={handleUnlockNext} className="h-11 w-full text-base font-semibold shadow-lg shadow-primary/20">
          <SkipForward className="mr-2 h-5 w-5" />
          {!hasStarted ? "Unlock first question" : `Unlock Q${currentQuestionIndex + 2}`}
          <kbd className="ml-2 hidden rounded border border-primary-foreground/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold sm:inline">
            space
          </kbd>
        </Button>
      );
    }
    if (questions.length === 0) {
      return (
        <div className="flex h-11 w-full items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-sm text-muted-foreground">
          This exam has no questions yet.
        </div>
      );
    }
    // Genuinely finished: the last question has been played out. This must be
    // an explicit check, not the fallback — offering a destructive "end exam"
    // as the default for every unmatched state once cost the whole class its
    // session when a second tab held a stale timer.
    if (hasStarted && isTimerExpired && currentQuestionIndex >= questions.length - 1) {
      return (
        <Button variant="destructive" className="h-11 w-full" onClick={() => setShowEndDialog(true)}>
          <Square className="mr-2 h-4 w-4" />
          All questions done — end exam
        </Button>
      );
    }

    // Anything else: this tab is out of step with the session (e.g. it never
    // armed a timer for the open question). Say so rather than guess — the
    // header still has a deliberate End control.
    return (
      <div className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 text-sm font-medium text-muted-foreground">
        <Hourglass className="h-4 w-4" />
        Syncing with the live session…
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:overflow-hidden">
      <SEO
        title={`${exam.name} | Control Room`}
        description="Creator control room for a live exam session."
        path={`/live-exam/${creatorId}/${liveExamId}/control`}
        noindex
      />

      {/* ─── Header ─── */}
      <header className="shrink-0 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}
              aria-label="Back to exam editor"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {rehearsal.active ? (
              /* Unmistakable, and permanent for the duration. A creator must never
                 be able to mistake a rehearsal for a live session — or, worse, a
                 live session for a rehearsal. */
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600">
                <FlaskConical className="h-3 w-3" />
                Rehearsal · nothing is saved
              </span>
            ) : isLive ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-600">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-500" />
                On air
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Ended
              </span>
            )}
            <span className="truncate text-sm font-semibold">{exam.name}</span>
            {hasStarted && (
              <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                <span className="h-3 w-px bg-border" />
                <span className="font-semibold tabular-nums text-foreground">Q{currentQuestionIndex + 1}</span>
                of {questions.length}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold tabular-nums">{inRoom}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">live</span>
            </div>
            {/* A1: pin the join panel rather than reopening a modal per late arrival. */}
            <Button
              variant={hudPinned ? "secondary" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setHudPinned((v) => !v)}
              title={hudPinned ? "Unpin the join panel" : "Keep the QR and code on screen"}
            >
              <QrCodeIcon className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{hudPinned ? "Pinned" : "Join"}</span>
            </Button>

            {/* A2: the wall. Named window, so this focuses rather than duplicates. */}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={openPresent}
              title="Open the projector view in a second window"
            >
              <MonitorPlay className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{presentOpen ? "Focus screen" : "Big screen"}</span>
            </Button>

            <SessionSettingsMenu
              settings={{
                privacyMode: session.privacyMode,
                leaderboardVisibility: session.leaderboardVisibility,
                presentShowLeaderboard: session.presentShowLeaderboard,
                presentShowRiver: session.presentShowRiver,
              }}
              onChange={handleSettingsChange}
              saving={savingSettings}
            />

            {rehearsal.active ? (
              <>
                {/* Speed is the difference between rehearsing a 20-question exam
                    and sitting through one. */}
                <div className="flex items-center overflow-hidden rounded-lg border border-border/70">
                  {([1, 5, 10] as RehearsalSpeed[]).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => rehearsal.setSpeed(sp)}
                      className={`px-2 py-1 text-[11px] font-bold tabular-nums transition-colors ${
                        rehearsal.speed === sp
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="h-8" onClick={rehearsal.stop}>
                  <Square className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Exit rehearsal</span>
                </Button>
              </>
            ) : (
              isLive && (
                <Button variant="destructive" size="sm" className="h-8" onClick={() => setShowEndDialog(true)}>
                  <Square className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">End</span>
                </Button>
              )
            )}
          </div>
        </div>
        {/* Connected: subscribes to the countdown itself, so a tick re-renders
            this hairline and nothing else on the page. */}
        <LiveTimerBar />
      </header>

      {/* ─── Body: two columns, each pane scrolls independently ─── */}
      <div className="mx-auto w-full min-h-0 max-w-[1600px] flex-1 px-4 py-4 sm:px-6">
        <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Left: control deck over question preview ── */}
          <div className="flex min-h-0 flex-col gap-4">
            {/* Control deck — never scrolls away */}
            <section className="shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center">
                <div className="flex justify-center sm:block">
                  <LiveTimerRing
                    size={116}
                    idleLabel={isEnded ? "—" : hasStarted ? "Time up" : "Ready"}
                    caption="remaining"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold">
                      {!hasStarted
                        ? "No question unlocked yet"
                        : `Q${currentQuestionIndex + 1} of ${questions.length}`}
                      {sectionNameFor(currentQuestion) && (
                        <span className="font-normal text-muted-foreground"> · {sectionNameFor(currentQuestion)}</span>
                      )}
                    </p>
                    {currentQuestion && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {currentQuestion.time_seconds}s allotted
                      </span>
                    )}
                  </div>

                  <MeterRow
                    label="Answered"
                    value={currentResponseCount}
                    max={responseDenominator}
                    tone={responseRatePct >= 80 ? "correct" : "brand"}
                  />

                  {/* A3 — beside the meter, because the decision to grant time is
                      made by looking at how many have answered. */}
                  <AddTimeControls
                    canAddTime={isTimerActive}
                    extraSeconds={session.extraSeconds}
                    onAddTime={handleAddTime}
                    pending={controlPending}
                  />

                  {/* A10 — above the primary action, so "wait, no" sits where the
                      creator's eye already is after pressing space. */}
                  {canUndo && (
                    <UndoPill
                      closesAtMs={undoClosesAtMs}
                      onUndo={handleUndoUnlock}
                      pending={controlPending}
                    />
                  )}

                  {/* B12 — creator side only. Hidden entirely at zero. */}
                  <ConfusionCount count={tally.confusion_count ?? 0} />

                  {/* B14 layer 1 — a suggestion for the creator to voice, plus the
                      button that makes it loud. Never auto-blasted. */}
                  <MomentChip
                    moment={featuredMoment}
                    onCelebrate={handleCelebrate}
                    pending={controlPending}
                  />

                  {/* A8 — the one sentence. Subscribes to the countdown itself so
                      the page does not. */}
                  <LiveCoachLine context={coachContext} />

                  {primaryAction()}
                </div>
              </div>

              {/* Pulse strip: the four numbers a creator narrates out loud */}
              <div className="grid grid-cols-2 divide-x divide-border/60 border-t border-border/60 sm:grid-cols-4">
                <DeckStat label="In the room" value={inRoom} icon={Users} tone="brand" />
                <DeckStat
                  label="Response rate"
                  value={`${responseRatePct}%`}
                  icon={Target}
                  tone={responseRatePct >= 80 ? "correct" : "default"}
                />
                <DeckStat
                  label="Class accuracy"
                  value={sessionAccuracy !== null ? `${sessionAccuracy}%` : "—"}
                  icon={Check}
                  tone="correct"
                />
                <DeckStat
                  label={fastest ? `Fastest · Q${fastest.index + 1}` : "Fastest"}
                  value={
                    fastest
                      ? `${fastest.name}${fastest.ms ? ` · ${(fastest.ms / 1000).toFixed(1)}s` : ""}`
                      : "—"
                  }
                  icon={Zap}
                  tone="amber"
                />
              </div>
            </section>

            {/* Question preview — the only pane that scrolls on the left.
                min-h keeps it usable when the page falls back to normal
                scrolling below `lg`, where flex-1 has no definite height. */}
            <section className="flex min-h-[340px] flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm lg:min-h-0">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  {isReviewing ? (
                    <>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600">
                        Reviewing
                      </span>
                      <span className="truncate text-sm font-semibold tabular-nums">Q{previewIdx + 1}</span>
                    </>
                  ) : (
                    <span className="truncate text-sm font-semibold">
                      {previewQuestion ? `Question preview · what students see` : "Question preview"}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isReviewing && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPreviewIndex(null)}>
                      <CornerUpLeft className="mr-1 h-3.5 w-3.5" />
                      Back to live
                    </Button>
                  )}
                  {!isReviewing && isTimerActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowKey((v) => !v)}
                      title="The key stays hidden by default in case you are screen sharing"
                    >
                      {showKey ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                      {showKey ? "Hide key" : "Show key"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {!previewQuestion ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                      <Radio className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="max-w-xs text-sm text-muted-foreground">
                      {isLive
                        ? "Students are in the waiting room. Unlock the first question when you're ready."
                        : isEnded
                          ? "This exam has ended. Pick any question from the rail below to review it."
                          : "Exam is not live yet."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <LiveQuestionBody text={previewQuestion.text} />

                    {Array.isArray(previewQuestion.options) && (
                      <div className="space-y-2">
                        {previewQuestion.options.map((opt: string, i: number) => {
                          const correct = isCorrectOption(previewQuestion.correct_answer, i);
                          const dist = previewAnalytics?.option_distribution;
                          const count = dist ? Number(dist[String(i)] ?? dist[`"${i}"`] ?? 0) : 0;
                          const pct =
                            previewAnalytics && previewAnalytics.total_responses > 0
                              ? Math.round((count / previewAnalytics.total_responses) * 100)
                              : undefined;

                          const visual: OptionVisual = keyVisible && correct ? "correct-missed" : "idle";

                          return (
                            <LiveOption
                              key={i}
                              index={i}
                              html={opt}
                              imageUrl={
                                Array.isArray(previewQuestion.option_image_urls)
                                  ? previewQuestion.option_image_urls[i]
                                  : null
                              }
                              visual={visual}
                              compact
                              distributionPct={pct}
                              distributionLabel={pct !== undefined ? `${count} · ${pct}%` : undefined}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Numeric / text keys */}
                    {(previewQuestion.answer_type === "numeric" ||
                      previewQuestion.answer_type === "integer" ||
                      previewQuestion.answer_type === "text") &&
                      keyVisible && (
                        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-4 py-3 text-sm">
                          <span className="text-muted-foreground">Correct answer: </span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {typeof previewQuestion.correct_answer === "string"
                              ? previewQuestion.correct_answer
                              : JSON.stringify(previewQuestion.correct_answer)}
                          </span>
                        </div>
                      )}

                    {/*
                      B9 — the river, while the question is still open.
                      Replaced by the full outcome panel the moment analytics land,
                      so the two never compete for the same space.
                    */}
                    {!isReviewing && isTimerActive && liveTally.counts.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-muted/25 p-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <InsightHeading>Answers landing</InsightHeading>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {currentResponseCount} of {inRoom}
                          </p>
                        </div>
                        <AnswerRiver
                          className="mt-3"
                          counts={liveTally.counts}
                          responders={currentResponseCount}
                          roomSize={inRoom}
                          isMulti={
                            previewQuestion?.answer_type === "multi" ||
                            previewQuestion?.answer_type === "multi-select"
                          }
                        />
                      </div>
                    )}

                    {/* B4 — the shape of the answer, named. */}
                    <MisconceptionCallout classification={classification} />

                    {/* Outcome for whichever question is on screen */}
                    {previewAnalytics && (
                      <div className="rounded-xl border border-border/60 bg-muted/25 p-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            How the class did
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            avg{" "}
                            {previewAnalytics.avg_time_correct_ms
                              ? `${(previewAnalytics.avg_time_correct_ms / 1000).toFixed(1)}s`
                              : "—"}{" "}
                            per correct answer
                          </p>
                        </div>
                        <OutcomeBar
                          className="mt-3"
                          correct={previewAnalytics.correct_count}
                          wrong={previewAnalytics.wrong_count}
                          skipped={previewAnalytics.skipped_count}
                        />
                        {previewAnalytics.fastest_user_name && (
                          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Zap className="h-3.5 w-3.5 text-amber-500" />
                            Fastest correct:{" "}
                            <span className="font-semibold text-foreground">
                              {/* Privacy mode stores a pseudonym here because this
                                  row is broadcast to every student; the creator's
                                  own deck resolves the real name from the id. */}
                              {(previewAnalytics.fastest_user_id &&
                                participantNames.get(previewAnalytics.fastest_user_id)) ||
                                previewAnalytics.fastest_user_name}
                            </span>
                            {previewAnalytics.fastest_time_ms
                              ? ` · ${(previewAnalytics.fastest_time_ms / 1000).toFixed(1)}s`
                              : ""}
                          </p>
                        )}

                        {/* B6 — right/wrong split by fast/slow. Two students who
                            both answered wrong are two different problems, and an
                            accuracy percentage renders them identical. */}
                        {timeProfile && (
                          <div className="mt-3">
                            <TimeProfile profile={timeProfile} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Right: standings ── */}
          <aside className="flex min-h-0 flex-col gap-4">
            <section className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm lg:min-h-0">
              <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-bold">Leaderboard</h2>
                <span className="ml-auto text-[11px] font-medium text-muted-foreground">Top 20</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <LiveLeaderboard
                  entries={leaderboard}
                  outOf={hasStarted ? currentQuestionIndex + 1 : undefined}
                  emptyLabel={
                    isLive
                      ? "Rankings appear once the first question's timer ends."
                      : "No participants took part in this session."
                  }
                />
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* ─── Question rail: whole exam, one glance, click to review ─── */}
      {questions.length > 0 && (
        <footer className="shrink-0 border-t border-border/50 bg-background/85 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-2.5 sm:px-6">
            <div className="flex items-center gap-4">
              <QuestionRail
                items={railItems}
                size="sm"
                className="no-scrollbar min-w-0 flex-1 py-0.5"
                onSelect={handleRailSelect}
              />
              <RailLegend
                statuses={["current", "done", "upcoming"]}
                className="hidden shrink-0 border-l border-border/60 pl-4 xl:flex"
              />
            </div>
          </div>
        </footer>
      )}

      {/*
        A1 — the pinned join panel.
        Fixed to a reserved corner so it can never cover the control deck or the
        unlock button; the whole point is that a late arrival stops being an
        interruption, and a panel that hides the primary control would just be a
        different interruption.
      */}
      {hudPinned && (
        <div className="pointer-events-auto fixed bottom-20 right-4 z-40">
          <PresenterHud
            shareUrl={shareUrl}
            shareCode={exam.share_code}
            inRoom={inRoom}
            variant="control"
            onClose={() => setHudPinned(false)}
          />
        </div>
      )}

      {/* End Exam Dialog */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Live Exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the live session for all students. Final rankings will be computed. This action cannot be undone.
              {currentQuestionIndex < questions.length - 1 && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ You still have {questions.length - currentQuestionIndex - 1} question(s) remaining.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndExam} className="bg-destructive text-destructive-foreground">
              End Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
