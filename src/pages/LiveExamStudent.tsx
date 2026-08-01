/**
 * LiveExamStudent.tsx — the student's live exam screen.
 *
 * Design intent
 * -------------
 * A live exam is a timed, single-shot moment. The screen is built around three
 * questions the student asks, in this order:
 *   1. "How long do I have?"  → timer is pinned: a colour-escalating hairline
 *      under the header plus an mm:ss chip in a sticky question bar.
 *   2. "What do I answer?"    → the open question owns the page. Past questions
 *      and standings move into tabs on phones so nothing competes with it.
 *   3. "How did I do?"        → after the reveal, a verdict strip states the
 *      result in words, with the class distribution drawn into the options.
 *
 * Colour is strictly semantic: violet = your choice, emerald = correct,
 * rose = wrong, amber = time pressure. (The previous version used emerald for
 * both "selected" and "correct", so a pick looked pre-graded.)
 */

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Clock,
  Users,
  Check,
  Trophy,
  Globe,
  Radio,
  Zap,
  ChevronDown,
  Volume2,
  VolumeX,
  Flame,
  Target,
  ListChecks,
  CheckCircle2,
  XCircle,
  CircleSlash,
  Hourglass,
  ArrowUp,
  ArrowDown,
  Lock,
  Sparkles,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import SEO from "@/components/SEO";
import LiveQuestionBody, { questionPreviewText } from "@/components/live/LiveQuestionBody";
import LiveOption, { optionLetter, type OptionVisual } from "@/components/live/LiveOption";
import LiveLeaderboard from "@/components/live/LiveLeaderboard";
import ConfusionButton from "@/components/live/ConfusionButton";
import ScheduledCountdown from "@/components/live/ScheduledCountdown";
import { fireCelebration, shouldCelebrate } from "@/lib/live/celebrate";
import QuestionRail, { RailLegend, type ChipStatus, type RailItem } from "@/components/live/QuestionRail";
import { LiveTimerBar, LiveTimerChip } from "@/components/live/LiveTimer";
import {
  fetchLiveExamByShareCode,
  fetchAllLiveQuestionsStudent,
  fetchRevealedAnswers,
  fetchLiveSections,
  fetchAllAnalytics,
  joinLiveExam,
  fetchPublicLeaderboard,
  flagLiveConfusion,
  submitLiveResponse,
  fetchMyResponses,
  type LiveExam,
  type LiveQuestion,
  type LiveSection,
  type LiveParticipant,
  type LiveResponse,
  type LiveQuestionAnalytics,
} from "@/services/liveExamService";
import { useLiveSession } from "@/hooks/useLiveSession";
import {
  useLiveCountdown,
  useLiveTimerExpiry,
  useLiveTimerPhase,
  useLiveTimerTarget,
} from "@/lib/live/timerStore";
import { toExamViewer, resolveExamAccess, type ExamAccessMode } from "@/lib/examAccess";
import CreatorExamBlocked from "@/components/CreatorExamBlocked";
import {
  playUnlockDing,
  playTick,
  playCorrectChime,
  setMuted as setSoundsMuted,
  isMuted as soundsAreMuted,
} from "@/lib/liveSounds";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳" },
];

/**
 * Window across which the class's leaderboard refetches are scattered after a
 * reveal. Every student is triggered by the same event at the same millisecond,
 * so without this the whole room requests the standings at once.
 */
const LEADERBOARD_SPREAD_MS = 2500;

// ─── Countdown side effects ──────────────────────────────────

/**
 * Plays the final-seconds tick.
 *
 * A leaf component rather than an effect in the page, because reading the
 * ticking countdown is what forces a re-render every second — and this page
 * renders the question, the options, the review list and the leaderboard. An
 * invisible component that re-renders alone is the cheapest place to hear the
 * clock from.
 */
function CountdownTickSound() {
  const { remaining, running } = useLiveCountdown();

  useEffect(() => {
    if (running && remaining > 0 && remaining <= 5) playTick();
  }, [remaining, running]);

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Multi-select question ("multi-select" accepted defensively). */
function isMultiAnswer(answerType: string | null | undefined): boolean {
  return answerType === "multi" || answerType === "multi-select";
}

/** Set equality over stringified answers (multi-select). */
function isSameAnswerSet(a: any, b: any): boolean {
  const toSet = (v: any) => (Array.isArray(v) ? v : [v]).map(String).sort();
  const x = toSet(a);
  const y = toSet(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * Compare a selected answer against a revealed correct answer (string-insensitive).
 * Called per option too (`isAnswerCorrect(i, correct)`), where an array correct
 * answer means "is this option part of the correct set".
 */
function isAnswerCorrect(selected: any, correct: any): boolean {
  if (selected === null || selected === undefined || correct === null || correct === undefined) return false;
  // An array of selections is a multi-select answer: the whole set must match.
  if (Array.isArray(selected)) return isSameAnswerSet(selected, correct);
  if (Array.isArray(correct)) return correct.some((c) => String(c) === String(selected));
  return String(correct) === String(selected);
}

/** Verdict for a whole response: multi-select needs set equality, not inclusion. */
function isResponseCorrect(selected: any, correct: any, answerType?: string | null): boolean {
  if (isMultiAnswer(answerType)) {
    if (selected === null || selected === undefined || correct === null || correct === undefined) return false;
    return isSameAnswerSet(selected, correct);
  }
  return isAnswerCorrect(selected, correct);
}

/** Read a selection back from either shape: scalar (single) or array (multi). */
function isOptionPicked(value: any, i: number): boolean {
  if (Array.isArray(value)) return value.some((v) => String(v) === String(i));
  if (value === null || value === undefined) return false;
  return String(value) === String(i);
}

/**
 * "Chose this option" tally for multi-select: option_distribution keys are the
 * JSON text of selected_answer (e.g. ["0","2"]), so sum every key containing the
 * option instead of hiding the number — per-key percentages would be unreadable.
 */
function optionPickCount(dist: Record<string, any> | null | undefined, i: number): number {
  if (!dist) return 0;
  let count = 0;
  for (const [k, v] of Object.entries(dist)) {
    let parsed: any = k;
    try {
      parsed = JSON.parse(k);
    } catch {
      /* key isn't JSON text — compare it raw */
    }
    const hit = Array.isArray(parsed)
      ? parsed.some((p) => String(p) === String(i))
      : String(parsed) === String(i);
    if (hit) count += Number(v) || 0;
  }
  return count;
}

/** option_distribution keys are the JSON text of selected_answer (e.g. "2"). */
function mostPickedOption(a: LiveQuestionAnalytics): { label: string; pct: number } | null {
  const dist = a.option_distribution || {};
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [k, v] of Object.entries(dist)) {
    const c = Number(v) || 0;
    if (c > bestCount) {
      bestCount = c;
      bestKey = k;
    }
  }
  if (bestKey === null || !a.total_responses) return null;
  let parsed: any = bestKey;
  try {
    parsed = JSON.parse(bestKey);
  } catch {
    /* key isn't JSON text — use it raw */
  }
  const toLetter = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n < 26 ? String.fromCharCode(65 + n) : String(v);
  };
  // Multi-select keys are arrays of indices — label them "A + C".
  const label = Array.isArray(parsed) ? parsed.map(toLetter).join(" + ") : toLetter(parsed);
  return { label, pct: Math.round((bestCount / a.total_responses) * 100) };
}

/** Share of the class that answered a question correctly, as a percentage. */
function classAccuracyPct(a: LiveQuestionAnalytics | undefined): number | null {
  if (!a || !a.total_responses) return null;
  return Math.round((a.correct_count / a.total_responses) * 100);
}

type ChipState = ChipStatus;
type MobilePane = "question" | "review" | "ranks";

// ─── Main Component ──────────────────────────────────────────

export default function LiveExamStudent() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  // "take" for students, "preview" for the exam's own creator (watch-only, no
  // participant row, no answers), "blocked" for a creator on someone else's.
  const [access, setAccess] = useState<ExamAccessMode>("take");
  const isPreview = access === "preview";

  // Exam Data
  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [participant, setParticipant] = useState<LiveParticipant | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);

  // Realtime Data — both maps are keyed by question ORDINAL (array index /
  // question_ordinal), NOT question id, so they survive language switches.
  const [analytics, setAnalytics] = useState<Map<number, LiveQuestionAnalytics>>(new Map());
  // Read by the timer-expiry fallback, which is memoised with an empty dep list
  // and so cannot see the state value.
  const analyticsRef = useRef<Map<number, LiveQuestionAnalytics>>(new Map());
  analyticsRef.current = analytics;
  const [responses, setResponses] = useState<Map<number, LiveResponse>>(new Map());
  // Revealed correct answers, keyed by live_question_id (all languages included).
  const [revealedAnswers, setRevealedAnswers] = useState<Map<string, any>>(new Map());

  // Interaction State
  const [activeLanguage, setActiveLanguage] = useState<string>("en");
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPrevQuestion, setExpandedPrevQuestion] = useState<string | null>(null);
  const [muted, setMutedState] = useState<boolean>(soundsAreMuted());
  const [rankDelta, setRankDelta] = useState<number | null>(null);
  // Which pane the phone layout shows; desktop shows all three at once.
  const [mobilePane, setMobilePane] = useState<MobilePane>("question");

  // Refs so async/realtime callbacks always see fresh values
  const examRef = useRef<LiveExam | null>(null);
  const questionsRef = useRef<LiveQuestion[]>([]);
  examRef.current = exam;
  questionsRef.current = questions;
  // Canonical primary-language question id → ordinal (analytics/responses arrive on canonical ids)
  const canonicalIdToOrdinalRef = useRef<Map<string, number>>(new Map());
  // current_question_index at the moment the student joined (for "missed" chips)
  const joinIndexRef = useRef<number>(-1);
  // Ordinals already celebrated with confetti (once per question)
  const celebratedRef = useRef<Set<number>>(new Set());
  const prevRankRef = useRef<number | null>(null);
  /** Last celebrate sequence this device acted on; null until the first sync. */
  const celebratedSeqRef = useRef<number | null>(null);

  // ─── Shared helpers ────────────────────────────────────────

  const toOrdinalAnalyticsMap = (rows: LiveQuestionAnalytics[]) => {
    const m = new Map<number, LiveQuestionAnalytics>();
    rows.forEach((a) => {
      const ord = canonicalIdToOrdinalRef.current.get(a.live_question_id);
      if (ord !== undefined) m.set(ord, a);
    });
    return m;
  };

  /** Re-pull revealed answers + my (now possibly server-graded) responses. */
  const refreshReveal = async () => {
    const ex = examRef.current;
    if (!ex) return;
    try {
      const [revealed, myResponses] = await Promise.all([
        fetchRevealedAnswers(ex.id),
        fetchMyResponses(ex.id),
      ]);
      setRevealedAnswers(revealed);
      setResponses((prev) => {
        const next = new Map(prev);
        myResponses.forEach((r) => next.set(r.question_ordinal, r));
        return next;
      });
    } catch {
      /* transient — a later trigger will retry */
    }
  };

  const handleExamEnded = (endedExamId: string) => {
    fetchPublicLeaderboard(endedExamId, 20).then(setLeaderboard).catch(() => {});
    refreshReveal();
    fetchAllAnalytics(endedExamId)
      .then((rows) => setAnalytics(toOrdinalAnalyticsMap(rows)))
      .catch(() => {});
  };

  // ─── Load Data ─────────────────────────────────────────────

  useEffect(() => {
    if (!shareCode) return;
    init();
  }, [shareCode]);

  const init = async () => {
    setLoading(true);
    try {
      // 1. Check Auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        // Redirect to auth and come back
        navigate(`/student-auth?returnTo=/live/${shareCode}`);
        return;
      }
      setUser(authUser);

      // 2. Fetch Exam
      const examData = await fetchLiveExamByShareCode(shareCode!);

      // Creator accounts never answer a live exam. Their own exam opens
      // watch-only (joinLiveExam already skips the participant row); anyone
      // else's share link is blocked before we join or load anything.
      const mode = resolveExamAccess(toExamViewer(authUser), examData.user_id);
      setAccess(mode);
      if (mode === "blocked") return;

      examRef.current = examData;
      setExam(examData);
      joinIndexRef.current = examData.current_question_index;

      const lang = examData.primary_language || "en";
      setActiveLanguage(lang);

      // 3. Join Exam
      const part = await joinLiveExam(examData.id);
      setParticipant(part);

      // 4. Load Questions, Sections, Responses, Reveals, Analytics
      const [qs, secs, myResponses, revealed, analyticsRows] = await Promise.all([
        fetchAllLiveQuestionsStudent(examData.id, lang),
        fetchLiveSections(examData.id, lang).catch(() => [] as LiveSection[]),
        fetchMyResponses(examData.id),
        fetchRevealedAnswers(examData.id),
        fetchAllAnalytics(examData.id).catch(() => [] as LiveQuestionAnalytics[]),
      ]);
      questionsRef.current = qs;
      setQuestions(qs);
      setSections(secs);

      // Init always loads the primary language, so these ids ARE the canonical ids.
      const canonical = new Map<string, number>();
      qs.forEach((q, idx) => canonical.set(q.id, idx));
      canonicalIdToOrdinalRef.current = canonical;

      const resMap = new Map<number, LiveResponse>();
      myResponses.forEach((r) => resMap.set(r.question_ordinal, r));
      setResponses(resMap);

      // Reveals that already happened shouldn't fire confetti on (re)join.
      qs.forEach((q, idx) => {
        if (revealed.has(q.id)) celebratedRef.current.add(idx);
      });
      setRevealedAnswers(revealed);
      setAnalytics(toOrdinalAnalyticsMap(analyticsRows));

      // 5. Load Leaderboard if live/ended
      if (examData.status === "live" || examData.status === "ended") {
        const lb = await fetchPublicLeaderboard(examData.id, 20);
        setLeaderboard(lb);
      }

      // The countdown is armed by useLiveTimerTarget from session state, not
      // from here — a load and an unlock must take the same path or the two
      // drift apart on rejoin.
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to join live exam.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ─── Language Change ───────────────────────────────────────

  const handleLanguageChange = async (lang: string) => {
    if (!exam) return;
    setActiveLanguage(lang);
    setLoading(true);
    try {
      const [qs, secs] = await Promise.all([
        fetchAllLiveQuestionsStudent(exam.id, lang),
        fetchLiveSections(exam.id, lang),
      ]);
      questionsRef.current = qs;
      setQuestions(qs);
      setSections(secs);
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to load translated questions.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refetch the standings, spread out across the room.
   *
   * Every student learns of a reveal at the same instant, so an immediate fetch
   * here means the whole class asks for the top 20 simultaneously — a thundering
   * herd that arrives as a spike rather than a stream, and the larger the class
   * the worse it gets. Spreading over a couple of seconds costs nothing a
   * student can perceive (the leaderboard is not what they are looking at the
   * moment an answer is revealed) and flattens the spike completely.
   *
   * Their own rank does NOT wait for this — it rides on the session sync, so the
   * number they actually care about is already correct.
   */
  const leaderboardTimerRef = useRef<number | null>(null);

  const scheduleLeaderboardRefresh = (examId: string) => {
    if (leaderboardTimerRef.current !== null) window.clearTimeout(leaderboardTimerRef.current);
    leaderboardTimerRef.current = window.setTimeout(() => {
      leaderboardTimerRef.current = null;
      void fetchPublicLeaderboard(examId, 20).then(setLeaderboard).catch(() => {});
    }, Math.random() * LEADERBOARD_SPREAD_MS);
  };

  useEffect(() => {
    return () => {
      if (leaderboardTimerRef.current !== null) window.clearTimeout(leaderboardTimerRef.current);
    };
  }, []);

  /** Everything the page can miss while its connection is away. */
  const refetchSessionData = async () => {
    const ex = examRef.current;
    if (!ex) return;
    try {
      const [lb, myResponses, revealed, analyticsRows] = await Promise.all([
        fetchPublicLeaderboard(ex.id, 20),
        fetchMyResponses(ex.id),
        fetchRevealedAnswers(ex.id),
        fetchAllAnalytics(ex.id).catch(() => [] as LiveQuestionAnalytics[]),
      ]);
      setLeaderboard(lb);
      setResponses((prev) => {
        const next = new Map(prev);
        myResponses.forEach((r) => next.set(r.question_ordinal, r));
        return next;
      });
      setRevealedAnswers(revealed);
      setAnalytics(toOrdinalAnalyticsMap(analyticsRows));
    } catch {
      /* transient; the next reveal or reconnect refetches again */
    }
  };

  // ─── Live session (transport, clock, deadline) ──────────────

  const session = useLiveSession(exam?.id, {
    role: "student",
    enabled: !!exam?.id && access !== "blocked",
    onUnlock: () => {
      setSelectedAnswer(null);
      setMobilePane("question");
      playUnlockDing();
      toast({ title: "New Question Unlocked!" });
      // The previous question's timer is definitively over — pull its reveal and
      // server grade. Twice, because the server holds the answer back through a
      // 2s grace window.
      //
      // The retry is jittered rather than a flat 2500ms: every student in the
      // room is triggered by the same unlock at the same instant, so a fixed
      // delay keeps the whole class synchronised and turns the second fetch into
      // the same spike as the first. refreshReveal is two requests, so an
      // unjittered class of 500 is 1000 simultaneous ones.
      refreshReveal();
      window.setTimeout(refreshReveal, 2500 + Math.random() * LEADERBOARD_SPREAD_MS);
    },
    onRewind: (index) => {
      // The creator took an unlock back. Anything this page had already
      // revealed for the reopened question must go: the server re-hides it,
      // but a copy is sitting in memory here.
      setSelectedAnswer(null);
      setRevealedAnswers((prev) => {
        const next = new Map(prev);
        questionsRef.current.forEach((q, idx) => {
          if (idx >= index) next.delete(q.id);
        });
        return next;
      });
      setAnalytics((prev) => {
        const next = new Map(prev);
        Array.from(next.keys()).forEach((ord) => {
          if (ord >= index) next.delete(ord);
        });
        return next;
      });
      celebratedRef.current = new Set(
        Array.from(celebratedRef.current).filter((ord) => ord < index)
      );
    },
    onEnded: () => {
      toast({ title: "Exam Ended" });
      const ex = examRef.current;
      if (ex) handleExamEnded(ex.id);
    },
    onAnalytics: (a) => {
      // Analytics rows are keyed by the canonical primary-language question id.
      const ord = canonicalIdToOrdinalRef.current.get(a.live_question_id);
      if (ord === undefined) return;
      setAnalytics((prev) => {
        const next = new Map(prev);
        next.set(ord, a);
        return next;
      });
      // Analytics landing means the timer (+grace) ended — the answer is revealed now.
      refreshReveal();
      // Ranks are recomputed alongside analytics, so the standings are stale
      // from this moment. Refetched rather than pushed: broadcasting every
      // participant row to every student cost (participants x students) messages
      // per question and told them nothing this one request does not.
      scheduleLeaderboardRefresh(a.live_exam_id);
    },
    onReconnect: () => {
      void refetchSessionData();
    },
    /**
     * B14 layer 2. The creator pressed Celebrate, so the whole room joins in.
     *
     * Gated on a monotonic sequence rather than an event, so a reconnect — which
     * re-reads the exam row — cannot replay a celebration from ten minutes ago.
     */
    onCelebrate: (seq) => {
      if (shouldCelebrate(celebratedSeqRef.current, seq)) {
        fireCelebration("phone");
      }
      celebratedSeqRef.current = seq;
    },
  });

  // The first observation only sets a baseline: a student joining a session that
  // has already celebrated must not be greeted with confetti for someone else's
  // moment.
  useEffect(() => {
    if (celebratedSeqRef.current === null && !session.loading) {
      celebratedSeqRef.current = session.celebrateSeq;
    }
  }, [session.loading, session.celebrateSeq]);

  const sessionStatus = session.status ?? exam?.status ?? null;
  const sessionIndex = session.currentQuestionIndex;

  // ─── Countdown ─────────────────────────────────────────────

  useLiveTimerTarget({
    index: sessionIndex,
    unlockedAt: session.unlockedAt,
    extraSeconds: session.extraSeconds,
    timeSeconds: sessionIndex >= 0 ? questions[sessionIndex]?.time_seconds ?? null : null,
    active: sessionStatus === "live",
  });

  // Stable across renders: refreshReveal reads the exam through a ref, so a
  // handler captured on the first render is still correct on the twentieth.
  const handleTimerExpired = useCallback((expiredIndex: number) => {
    // Server reveals at +2s grace, so retry shortly after. Jittered: the whole
    // room's timers expire on the same tick.
    refreshReveal();
    window.setTimeout(refreshReveal, 2500 + Math.random() * LEADERBOARD_SPREAD_MS);

    /**
     * Analytics fallback for the pull lane.
     *
     * `onAnalytics` fires from the realtime binding only. A student who could not
     * hold a websocket — the exact population the poll lane exists for, past the
     * plan's concurrent-connection cap — therefore never received a class
     * distribution and watched a frozen leaderboard for the whole session.
     *
     * Written as a late fallback rather than an unconditional fetch: a push-lane
     * student already has the row within ~2.5s, so this only fires for the
     * students who genuinely missed it. Jittered for the same reason the
     * leaderboard refresh is — every student's timer expires on the same tick.
     */
    window.setTimeout(() => {
      const ex = examRef.current;
      if (!ex) return;
      if (analyticsRef.current.has(expiredIndex)) return; // push lane already delivered it
      void fetchAllAnalytics(ex.id)
        .then((rows) => setAnalytics(toOrdinalAnalyticsMap(rows)))
        .catch(() => {});
      scheduleLeaderboardRefresh(ex.id);
    }, 4000 + Math.random() * LEADERBOARD_SPREAD_MS);
  }, []);

  useLiveTimerExpiry(handleTimerExpired);

  const timerPhase = useLiveTimerPhase();

  // ─── Submit Response ───────────────────────────────────────

  /** Multi-select: clicking an option toggles it; the array stays index-sorted. */
  const toggleOption = (i: number) => {
    setSelectedAnswer((prev: any) => {
      const cur = (Array.isArray(prev) ? prev : []).map(Number);
      const next = cur.includes(i) ? cur.filter((v) => v !== i) : [...cur, i];
      return next.sort((a, b) => a - b);
    });
  };

  /**
   * B12. Fire-and-forget by design: nothing is returned, nothing is shown beyond
   * the button's own tick, and a failure is swallowed rather than toasted — a
   * toast would announce to anyone glancing at the screen that this student
   * pressed it, which is the one thing that would stop them using it.
   */
  const handleFlagConfusion = useCallback(async () => {
    if (!exam) return;
    await flagLiveConfusion(exam.id);
  }, [exam]);

  const handleSubmit = async () => {
    if (!exam || !participant || submitting) return;
    // Watch-only preview: the creator isn't a participant, so there is no
    // answer to record (the server would reject it anyway).
    if (isPreview) {
      toast({ title: "Preview mode", description: "Answers aren't recorded for your own exam." });
      return;
    }
    // The session's index, not the exam row's: the exam row is loaded once and
    // does not track unlocks, so submitting against it would send an answer for
    // whichever question was open when this page loaded.
    const idx = session.currentQuestionIndex;
    const currentQ = questions[idx];
    if (!currentQ || selectedAnswer === null) return;
    const isMulti = isMultiAnswer(currentQ.answer_type);
    if (isMulti && (!Array.isArray(selectedAnswer) || selectedAnswer.length === 0)) return;
    // Multi answers travel as option-index strings, matching how correct_answer is stored.
    const payload = isMulti ? (selectedAnswer as number[]).map(String) : selectedAnswer;

    setSubmitting(true);
    // Optimistic: lock the options immediately; server grades + times the answer.
    const optimistic: LiveResponse = {
      id: `pending-${currentQ.id}`,
      live_exam_id: exam.id,
      live_question_id: currentQ.id,
      user_id: user?.id || "",
      selected_answer: payload,
      is_correct: null,
      time_taken_ms: 0,
      submitted_at: new Date().toISOString(),
      question_ordinal: idx,
    };
    setResponses((prev) => {
      const next = new Map(prev);
      next.set(idx, optimistic);
      return next;
    });

    try {
      const res = await submitLiveResponse({
        live_exam_id: exam.id,
        live_question_id: currentQ.id,
        selected_answer: payload,
      });
      setResponses((prev) => {
        const next = new Map(prev);
        next.set(res.question_ordinal ?? idx, res);
        return next;
      });
      toast({ title: "Answer submitted!" });
    } catch (error: any) {
      // Roll back the optimistic entry
      setResponses((prev) => {
        const next = new Map(prev);
        if (next.get(idx)?.id === optimistic.id) next.delete(idx);
        return next;
      });
      toast({ title: "Error submitting", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Derived State ─────────────────────────────────────────

  const isLobby = sessionStatus === "published" || (sessionStatus === "live" && sessionIndex === -1);
  const isLive = sessionStatus === "live" && sessionIndex >= 0;
  const isEnded = sessionStatus === "ended";

  const currentQuestionIndex = sessionIndex;
  const currentQuestion = isLive ? questions[currentQuestionIndex] : null;
  /**
   * Gate on the countdown store having caught up with the index. For the one
   * render between an unlock arriving and the target being set, the question is
   * neither running nor expired — showing "time's up" in that gap would flash a
   * lock over a question the student has a full minute for.
   */
  const timerReady = timerPhase.key === currentQuestionIndex;
  const isTimerActive = timerReady && timerPhase.running;
  const isTimerExpiredLocally = currentQuestionIndex >= 0 && timerReady && !timerPhase.running;

  const currentAnalytics = currentQuestionIndex >= 0 ? analytics.get(currentQuestionIndex) : undefined;
  /**
   * A question is locked when its countdown has run out.
   *
   * It used to ALSO lock on the mere existence of an analytics row, which was a
   * blocker once A3 exists. `live_question_analytics` is readable by every student
   * with no time condition at all, so if a row landed early — a second control tab,
   * the missed-expiry sweep, a compute inside the grace — and the creator then
   * granted time, the student was locked out of a question that was open again, and
   * the class split was already on their screen.
   *
   * The running clock is the authority. A row existing means somebody computed
   * something; it does not mean this student is out of time.
   */
  const isLocked = isTimerExpiredLocally || (!!currentAnalytics && !isTimerActive);

  const myCurrentResponse = currentQuestionIndex >= 0 ? responses.get(currentQuestionIndex) : undefined;
  const hasSubmitted = !!myCurrentResponse;
  const isCurrentRevealed = currentQuestion ? revealedAnswers.has(currentQuestion.id) : false;
  const isCurrentMulti = isMultiAnswer(currentQuestion?.answer_type);
  /** Presence, so "in the room" means here now rather than ever joined. */
  const inRoom = session.onlineCount;

  /** Server-graded correctness first; fall back to comparing with the revealed answer. */
  const getCorrectness = (res: LiveResponse | undefined, q: LiveQuestion | undefined): boolean | null => {
    if (!res || !q) return null;
    if (res.is_correct !== null && res.is_correct !== undefined) return res.is_correct;
    if (revealedAnswers.has(q.id)) return isResponseCorrect(res.selected_answer, revealedAnswers.get(q.id), q.answer_type);
    return null;
  };

  const currentCorrectness = getCorrectness(myCurrentResponse, currentQuestion || undefined);

  const previousQuestions = useMemo(() => {
    if (currentQuestionIndex <= 0 && !isEnded) return [];
    if (isEnded) return questions;
    return questions.slice(0, currentQuestionIndex);
  }, [questions, currentQuestionIndex, isEnded]);

  const questionCountBySection = useMemo(() => {
    const m = new Map<string, number>();
    questions.forEach((q) => m.set(q.live_section_id, (m.get(q.live_section_id) || 0) + 1));
    return m;
  }, [questions]);

  const sectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    sections.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sections]);

  const sectionNameFor = (q: LiveQuestion | null | undefined): string | undefined => {
    if (!q) return undefined;
    return sectionNameById.get(q.live_section_id) || q.section_label || undefined;
  };

  // Trailing consecutive correct answers (only counts revealed/graded questions)
  const streak = useMemo(() => {
    let n = 0;
    let started = false;
    for (let i = questions.length - 1; i >= 0; i--) {
      const q = questions[i];
      const res = responses.get(i);
      let c: boolean | null = null;
      if (res && res.is_correct !== null && res.is_correct !== undefined) c = res.is_correct;
      else if (revealedAnswers.has(q.id)) c = res ? isResponseCorrect(res.selected_answer, revealedAnswers.get(q.id), q.answer_type) : false;
      if (!started) {
        if (c === null) continue; // not yet revealed (e.g. the current question)
        if (c !== true) return 0; // latest revealed result wasn't correct
        started = true;
        n = 1;
      } else {
        if (c !== true) break;
        n++;
      }
    }
    return n;
  }, [questions, responses, revealedAnswers]);

  const sectionBreakdown = useMemo(() => {
    if (!isEnded) return [] as [string, { total: number; answered: number; correct: number }][];
    const m = new Map<string, { total: number; answered: number; correct: number }>();
    questions.forEach((q, idx) => {
      const label = q.section_label || sectionNameById.get(q.live_section_id) || "General";
      const entry = m.get(label) || { total: 0, answered: 0, correct: 0 };
      entry.total++;
      const res = responses.get(idx);
      if (res) {
        entry.answered++;
        let c: boolean | null = res.is_correct ?? null;
        if (c === null && revealedAnswers.has(q.id)) c = isResponseCorrect(res.selected_answer, revealedAnswers.get(q.id), q.answer_type);
        if (c === true) entry.correct++;
      }
      m.set(label, entry);
    });
    return Array.from(m.entries());
  }, [isEnded, questions, responses, revealedAnswers, sectionNameById]);

  const overallAccuracy = useMemo(() => {
    let correct = 0;
    let total = 0;
    analytics.forEach((a) => {
      correct += a.correct_count || 0;
      total += a.total_responses || 0;
    });
    return total > 0 ? correct / total : null;
  }, [analytics]);

  // ─── My live standing ──────────────────────────────────────
  //
  // `participant` is the row returned when this student joined, and it is never
  // refreshed after that. It used to be, by a broadcast of every participant row
  // to every student — which cost (participants x students) messages per
  // question and is exactly the fan-out Phase 0 removed.
  //
  // Rank and score now ride along on the session sync this client is already
  // making for its heartbeat, so keeping them live costs no extra request.

  /** Server-assigned rank, refreshed by every sync. */
  const myRank = session.myRank;
  /** Server-graded correct count — never derived from local answers. */
  const myTotalCorrect = session.myTotalCorrect ?? 0;
  /**
   * How many questions I have answered. Counted locally because this client is
   * the only party that needs it and it already holds every response it made —
   * asking the server would be a round trip for something we know.
   */
  const answeredCount = responses.size;
  const myAccuracy = answeredCount > 0 ? myTotalCorrect / answeredCount : null;
  /**
   * A LiveParticipant-shaped "you" for the leaderboard, carrying the live rank
   * rather than the frozen one from the join response.
   *
   * Memoised: LiveLeaderboard is memoised, and a fresh object here every render
   * would defeat that for all twenty of its rows.
   */
  const mySelf: LiveParticipant | null = useMemo(
    () =>
      participant
        ? {
            ...participant,
            // Under privacy mode everyone else on this list is a pseudonym, so
            // "You" is both consistent and unambiguous — showing their real name
            // beside a column of animals reads like a leak even though it is
            // their own screen.
            display_name: session.privacyMode ? "You" : participant.display_name,
            rank: myRank,
            total_correct: myTotalCorrect,
            total_answered: answeredCount,
          }
        : null,
    [participant, session.privacyMode, myRank, myTotalCorrect, answeredCount]
  );

  const totalQuestionCount = questions.length || exam?.total_questions || 0;

  // ─── Celebration: confetti + chime once per revealed-correct question ──

  useEffect(() => {
    questions.forEach((q, idx) => {
      if (celebratedRef.current.has(idx)) return;
      if (!revealedAnswers.has(q.id)) return;
      const res = responses.get(idx);
      let c: boolean | null = null;
      if (res) {
        c = res.is_correct !== null && res.is_correct !== undefined
          ? res.is_correct
          : isResponseCorrect(res.selected_answer, revealedAnswers.get(q.id), q.answer_type);
      }
      celebratedRef.current.add(idx);
      if (c === true) {
        try {
          confetti({ particleCount: 100, spread: 75, origin: { y: 0.7 } });
        } catch {
          /* ignore */
        }
        playCorrectChime();
      }
    });
  }, [questions, responses, revealedAnswers]);

  // ─── Rank movement badge ───────────────────────────────────

  useEffect(() => {
    if (myRank === null) return;
    const prev = prevRankRef.current;
    prevRankRef.current = myRank;
    if (prev === null || prev === myRank) return;
    setRankDelta(prev - myRank); // positive = climbed
    const t = window.setTimeout(() => setRankDelta(null), 4000);
    return () => window.clearTimeout(t);
  }, [myRank]);

  // ─── Keyboard answering ────────────────────────────────────

  /**
   * A live exam is a race, and reaching for a mouse costs seconds. A–J picks an
   * option, Enter submits. Suppressed while typing so numeric/text answers and
   * the language picker keep working.
   */
  // `!isPreview` keeps the creator's own-exam preview watch-only: no keyboard
  // shortcuts, no clickable options, no submit bar.
  const canAnswerNow = isLive && !!currentQuestion && !hasSubmitted && !isLocked && !isPreview;
  const optionCount = Array.isArray(currentQuestion?.options) ? currentQuestion.options.length : 0;

  // The listener is registered once per answerable question, so it must not
  // capture a submit handler bound to a question that has since been replaced.
  const submitRef = useRef(handleSubmit);
  submitRef.current = handleSubmit;

  useEffect(() => {
    if (!canAnswerNow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;

      if (e.key === "Enter") {
        const empty =
          selectedAnswer === null ||
          selectedAnswer === "" ||
          (Array.isArray(selectedAnswer) && selectedAnswer.length === 0);
        if (!empty && !submitting) {
          e.preventDefault();
          submitRef.current();
        }
        return;
      }

      if (optionCount === 0) return;
      const idx = e.key.toUpperCase().charCodeAt(0) - 65;
      if (e.key.length === 1 && idx >= 0 && idx < optionCount) {
        e.preventDefault();
        if (isCurrentMulti) toggleOption(idx);
        else setSelectedAnswer(idx);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canAnswerNow, optionCount, isCurrentMulti, selectedAnswer, submitting]);

  // ─── Sounds mute toggle ────────────────────────────────────

  const toggleMute = () => {
    const next = !muted;
    setSoundsMuted(next);
    setMutedState(next);
  };

  // ─── Question navigation strip ─────────────────────────────

  const chipState = (idx: number): ChipState => {
    if (isLive && idx === currentQuestionIndex) return "current";
    if (isLive && idx > currentQuestionIndex) return "locked";
    const res = responses.get(idx);
    if (res) {
      const c = getCorrectness(res, questions[idx]);
      if (c === true) return "correct";
      if (c === false) return "wrong";
      return "pending";
    }
    return idx < joinIndexRef.current ? "missed" : "skipped";
  };

  const railItems: RailItem[] = useMemo(
    () =>
      questions.map((q, idx) => ({
        id: q.id,
        index: idx,
        status: chipState(idx),
        group: sectionNameFor(q),
        title: questionPreviewText(q.text, 48),
      })),
    // chipState and sectionNameFor are re-created each render; listing them
    // would defeat the memo, so depend on the state they actually read.
    [questions, currentQuestionIndex, responses, revealedAnswers, isLive, sectionNameById]
  );

  /**
   * Stable, so QuestionRail's memo survives.
   *
   * The Phase 0 render pass stabilised the control room's rail callback and the
   * student's `self` object but missed this one, which is a plain function body
   * and therefore a new prop identity on every render — defeating the memo for
   * every chip in the exam.
   */
  const handleChipClick = useCallback((item: RailItem) => {
    const idx = item.index;
    const st = item.status;
    if (st === "locked") {
      toast({ title: "The creator hasn't unlocked this question yet" });
      return;
    }
    if (st === "current") {
      setMobilePane("question");
      document.getElementById("live-current-question")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const q = questions[idx];
    if (!q) return;
    setMobilePane("review");
    setExpandedPrevQuestion(q.id);
    window.setTimeout(() => {
      document.getElementById(`live-prev-q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [questions, toast]);

  // ─── Render: Loading & Errors ──────────────────────────────

  if (loading && !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Joining the live exam…</p>
        </div>
      </div>
    );
  }

  // Must precede the not-found branch: a blocked creator never gets an `exam`.
  if (access === "blocked") {
    return <CreatorExamBlocked backTo="/dashboard?tab=live" />;
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
          <Radio className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Live exam not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">This link may have expired or been typed incorrectly.</p>
        </div>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const isMultiLang = (exam.supported_languages || []).length > 1;

  const activeLang = AVAILABLE_LANGUAGES.find((l) => l.code === activeLanguage);

  const languagePicker = (compact: boolean) => (
    <Select value={activeLanguage} onValueChange={handleLanguageChange}>
      {/* The trigger renders its own label rather than <SelectValue> so the
          compact header variant can show a short code instead of the full
          item markup. */}
      <SelectTrigger className={compact ? "h-8 w-[86px] px-2 text-xs" : "h-11 w-full"}>
        <Globe className="mr-1.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">
          {compact
            ? `${activeLang?.flag ?? ""} ${activeLanguage.toUpperCase()}`.trim()
            : `${activeLang?.flag ?? ""} ${activeLang?.label || activeLanguage}`.trim()}
        </span>
      </SelectTrigger>
      <SelectContent>
        {(exam.supported_languages || ["en"]).map((langCode) => {
          const lang = AVAILABLE_LANGUAGES.find((l) => l.code === langCode);
          return (
            <SelectItem key={langCode} value={langCode}>
              <span className="flex items-center gap-2">
                <span>{lang?.flag}</span>
                <span>{lang?.label || langCode}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );

  // ─── Render: LOBBY ─────────────────────────────────────────

  if (isLobby) {
    const languageCount = (exam.supported_languages || ["en"]).length;

    return (
      <div className="relative min-h-screen bg-background">
        <SEO
          title={`${exam.name} | Waiting Room`}
          description={`Waiting room for the live exam ${exam.name}.`}
          path={`/live/${exam.share_code}`}
          noindex
        />

        {/* Ambient brand wash so the waiting room feels like an event, not a 404. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary/[0.07] to-transparent" />

        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-7 px-5 py-12 sm:py-16">
          <div className="relative">
            <span className="absolute inset-0 rounded-[26px] bg-primary/25 blur-2xl" aria-hidden="true" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-[26px] border border-primary/25 bg-gradient-to-br from-primary/20 to-primary/5">
              <Radio className="h-9 w-9 animate-pulse text-primary" />
            </div>
          </div>

          <div className="space-y-3 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Waiting room
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{exam.name}</h1>
            {exam.description && <p className="text-muted-foreground">{exam.description}</p>}
          </div>

          {/* At-a-glance shape of the exam */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold">
              <ListChecks className="h-3.5 w-3.5 text-primary" />
              {totalQuestionCount || exam.total_questions} questions
            </span>
            {sections.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold">
                <Target className="h-3.5 w-3.5 text-primary" />
                {sections.length} section{sections.length !== 1 ? "s" : ""}
              </span>
            )}
            {languageCount > 1 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold">
                <Globe className="h-3.5 w-3.5 text-primary" />
                {languageCount} languages
              </span>
            )}
          </div>

          {/* You're in + live count */}
          <div className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  You're in{participant?.display_name ? `, ${participant.display_name}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Keep this tab open — questions appear here automatically.</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-bold">
                <Users className="h-3.5 w-3.5 text-emerald-600" />
                <span className="tabular-nums">{inRoom}</span>
              </div>
            </div>
          </div>

          {/* How a live exam runs — most students have never seen one. */}
          <div className="w-full rounded-2xl border border-border/60 bg-card p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">How it works</p>
            <ol className="mt-3 space-y-3">
              {[
                { icon: Radio, text: "Your teacher unlocks one question at a time — it appears instantly." },
                { icon: Clock, text: "Answer before the timer runs out. You can't change an answer once submitted." },
                { icon: Trophy, text: "When time's up, the answer, the class split and the leaderboard are revealed." },
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-sm text-muted-foreground">{step.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {exam.instruction && (
            <div className="w-full rounded-2xl border border-border/60 bg-card p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Instructions</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{exam.instruction}</p>
            </div>
          )}

          {sections.length > 0 && (
            <div className="w-full rounded-2xl border border-border/60 bg-card p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sections</p>
              <div className="mt-3 space-y-1.5">
                {sections.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {questionCountBySection.get(s.id) || 0} questions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isMultiLang && (
            <div className="w-full max-w-xs space-y-2">
              <label className="text-sm font-medium">Choose your language</label>
              {languagePicker(false)}
            </div>
          )}

          {/*
            A9. Only when a start time was actually set — otherwise the honest
            answer really is "we don't know when". An open-ended wait is what makes
            students ask out loud, repeatedly; a number they can watch settles the
            room and turns waiting into anticipation.
          */}
          {session.scheduledStartAt && (
            <ScheduledCountdown
              scheduledStartAt={session.scheduledStartAt}
              serverNow={session.serverNow}
              className="w-full"
            />
          )}

          <div className="flex flex-col items-center gap-3 pt-2">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-sm text-muted-foreground">
              {session.scheduledStartAt
                ? "You're in — keep this tab open."
                : "Waiting for your teacher to start…"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: LIVE PLAY & ENDED ─────────────────────────────

  /** How each option should look right now. */
  const optionVisual = (i: number): OptionVisual => {
    const picked = hasSubmitted
      ? isOptionPicked(myCurrentResponse?.selected_answer, i)
      : isCurrentMulti
        ? isOptionPicked(selectedAnswer, i)
        : selectedAnswer === i;

    if (!isCurrentRevealed) return picked ? "selected" : isLocked || hasSubmitted ? "quiet" : "idle";

    const correct = isAnswerCorrect(i, revealedAnswers.get(currentQuestion!.id));
    if (correct && picked) return "correct-picked";
    if (correct) return "correct-missed";
    if (picked) return "wrong-picked";
    return "quiet";
  };

  const optionDistribution = (i: number): { pct: number; label: string } | null => {
    if (!isLocked || !currentAnalytics?.option_distribution) return null;
    const count = isCurrentMulti
      ? optionPickCount(currentAnalytics.option_distribution, i)
      : Number(currentAnalytics.option_distribution[String(i)] || 0);
    const total = currentAnalytics.total_responses || 1;
    const pct = Math.round((Number(count) / total) * 100);
    return { pct, label: `${pct}%` };
  };

  // ─── Verdict strip ─────────────────────────────────────────

  const renderVerdict = () => {
    if (!currentQuestion) return null;

    // Timer running, answer already in.
    if (!isLocked && hasSubmitted) {
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
            Locked in. <span className="font-normal text-muted-foreground">The answer is revealed when the timer ends.</span>
          </p>
          {/* B12 — still available after answering. Being unsure and having
              answered are not mutually exclusive, and this is often exactly when
              a student realises they did not follow it. */}
          {!isPreview && (
            <ConfusionButton
              questionKey={currentQuestionIndex}
              onFlag={handleFlagConfusion}
            />
          )}
        </div>
      );
    }

    if (!isLocked) return null;

    // Timer over, server hasn't revealed yet.
    if (!isCurrentRevealed) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
          <Hourglass className="h-4 w-4 shrink-0 animate-pulse text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Time's up — grading the class…</p>
        </div>
      );
    }

    const classPct = classAccuracyPct(currentAnalytics);
    const mySeconds = myCurrentResponse && myCurrentResponse.time_taken_ms > 0
      ? (myCurrentResponse.time_taken_ms / 1000).toFixed(1)
      : null;
    const avgSeconds = currentAnalytics?.avg_time_correct_ms != null
      ? (currentAnalytics.avg_time_correct_ms / 1000).toFixed(1)
      : null;

    const correctLetters = (() => {
      const correct = revealedAnswers.get(currentQuestion.id);
      if (!Array.isArray(currentQuestion.options)) return String(correct ?? "—");
      const list = Array.isArray(correct) ? correct : [correct];
      return list
        .map((c) => {
          const n = Number(c);
          return Number.isFinite(n) ? optionLetter(n) : String(c);
        })
        .join(" + ");
    })();

    const tone =
      currentCorrectness === true
        ? { shell: "border-emerald-500/35 bg-emerald-500/[0.08]", text: "text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 }
        : !hasSubmitted
          ? { shell: "border-border/70 bg-muted/40", text: "text-muted-foreground", Icon: CircleSlash }
          : { shell: "border-rose-500/35 bg-rose-500/[0.07]", text: "text-rose-700 dark:text-rose-400", Icon: XCircle };

    const headline =
      currentCorrectness === true
        ? "Correct · +1"
        : !hasSubmitted
          ? "No answer recorded"
          : `Not quite — the answer was ${correctLetters}`;

    return (
      <div className={`rounded-xl border px-4 py-3 ${tone.shell}`}>
        <div className="flex items-center gap-3">
          <tone.Icon className={`h-5 w-5 shrink-0 ${tone.text}`} />
          <p className={`text-sm font-bold ${tone.text}`}>{headline}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 text-xs text-muted-foreground">
          {classPct !== null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {classPct}% of the class got this
            </span>
          )}
          {mySeconds && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              You: {mySeconds}s{avgSeconds ? ` · avg ${avgSeconds}s` : ""}
            </span>
          )}
          {currentAnalytics?.fastest_user_name && (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Zap className="h-3 w-3" />
              Fastest: {currentAnalytics.fastest_user_name}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ─── Review list ───────────────────────────────────────────

  const reviewGroups = (sections.length > 0 ? sections : [{ id: "none", name: "Questions" } as any]).map((section) => ({
    section,
    items:
      sections.length > 0 ? previousQuestions.filter((q) => q.live_section_id === section.id) : previousQuestions,
  }));

  const renderReview = () => {
    if (previousQuestions.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center">
          <ListChecks className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">Answered questions land here as the exam moves on.</p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {reviewGroups.map(({ section, items }) => {
          if (items.length === 0) return null;
          return (
            <div key={section.id} className="space-y-2">
              {sections.length > 0 && (
                <h4 className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {section.name}
                </h4>
              )}
              {items.map((q) => {
                const idx = questions.findIndex((allQ) => allQ.id === q.id);
                const qAnalytics = analytics.get(idx);
                const myRes = responses.get(idx);
                const isExpanded = expandedPrevQuestion === q.id;
                const revealed = revealedAnswers.has(q.id);
                const correctness = getCorrectness(myRes, q);
                const mp = qAnalytics ? mostPickedOption(qAnalytics) : null;

                const badge = !myRes
                  ? { cls: "bg-muted text-muted-foreground", label: idx < joinIndexRef.current ? "Missed" : "Skipped" }
                  : correctness === true
                    ? { cls: "bg-emerald-500/15 text-emerald-600", label: "+1" }
                    : correctness === false
                      ? { cls: "bg-rose-500/15 text-rose-600", label: "0" }
                      : { cls: "bg-primary/10 text-primary", label: "Pending" };

                return (
                  <div
                    key={q.id}
                    id={`live-prev-q-${q.id}`}
                    className={`overflow-hidden rounded-xl border bg-card transition-colors ${
                      isExpanded ? "border-primary/35" : "border-border/60"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedPrevQuestion(isExpanded ? null : q.id)}
                      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
                      aria-expanded={isExpanded}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums ${
                          correctness === true
                            ? "bg-emerald-500/15 text-emerald-600"
                            : correctness === false
                              ? "bg-rose-500/15 text-rose-600"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {questionPreviewText(q.text, 70)}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="space-y-3 border-t border-border/50 px-3.5 pb-4 pt-3">
                        <LiveQuestionBody text={q.text} compact />

                        {Array.isArray(q.options) && (
                          <div className="space-y-1.5">
                            {q.options.map((opt: string, i: number) => {
                              const wasPicked = myRes ? isOptionPicked(myRes.selected_answer, i) : false;
                              const optCorrect = revealed && isAnswerCorrect(i, revealedAnswers.get(q.id));
                              const visual: OptionVisual = !revealed
                                ? wasPicked
                                  ? "selected"
                                  : "quiet"
                                : optCorrect && wasPicked
                                  ? "correct-picked"
                                  : optCorrect
                                    ? "correct-missed"
                                    : wasPicked
                                      ? "wrong-picked"
                                      : "quiet";

                              const dist = qAnalytics?.option_distribution;
                              const count = dist
                                ? isMultiAnswer(q.answer_type)
                                  ? optionPickCount(dist, i)
                                  : Number(dist[String(i)] || 0)
                                : null;
                              const pct =
                                count !== null && qAnalytics?.total_responses
                                  ? Math.round((count / qAnalytics.total_responses) * 100)
                                  : undefined;

                              return (
                                <LiveOption
                                  key={i}
                                  index={i}
                                  html={opt}
                                  imageUrl={Array.isArray(q.option_image_urls) ? q.option_image_urls[i] : null}
                                  visual={visual}
                                  multi={isMultiAnswer(q.answer_type)}
                                  compact
                                  distributionPct={pct}
                                  distributionLabel={pct !== undefined ? `${pct}%` : undefined}
                                />
                              );
                            })}
                          </div>
                        )}

                        {!q.options && (q.answer_type === "numeric" || q.answer_type === "text") && (
                          <div className="space-y-1.5 text-sm">
                            {myRes && (
                              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                                <span className="text-muted-foreground">Your answer: </span>
                                <span className="font-semibold">{String(myRes.selected_answer ?? "—")}</span>
                              </div>
                            )}
                            {revealed && (
                              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400">
                                <span className="opacity-80">Correct answer: </span>
                                <span className="font-semibold">{String(revealedAnswers.get(q.id) ?? "—")}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {(qAnalytics || myRes) && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                            {qAnalytics && (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {qAnalytics.total_responses} answered
                              </span>
                            )}
                            {qAnalytics && (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <Check className="h-3 w-3" />
                                {classAccuracyPct(qAnalytics) ?? 0}% correct
                              </span>
                            )}
                            {myRes && myRes.time_taken_ms > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                You: {(myRes.time_taken_ms / 1000).toFixed(1)}s
                                {qAnalytics?.avg_time_correct_ms != null && (
                                  <> · avg {(qAnalytics.avg_time_correct_ms / 1000).toFixed(1)}s</>
                                )}
                              </span>
                            )}
                            {mp && <span>Most picked: {mp.label} ({mp.pct}%)</span>}
                            {qAnalytics?.fastest_user_name && (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <Zap className="h-3 w-3" />
                                {qAnalytics.fastest_user_name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Shell ─────────────────────────────────────────────────

  const paneVisible = (pane: MobilePane) => (mobilePane === pane ? "block" : "hidden lg:block");

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={isLive ? `${exam.name} | Live` : `${exam.name} | Results`}
        description={`Live exam session for ${exam.name}.`}
        path={`/live/${exam.share_code}`}
        noindex
      />

      {/* ─── Header: identity + your standing ─── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {isLive ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-600">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Live
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Ended
                </span>
              )}
              <span className="truncate text-sm font-semibold">{exam.name}</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {streak >= 2 && (
                <span className="hidden items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-600 sm:inline-flex">
                  <Flame className="h-3 w-3" />
                  {streak}
                </span>
              )}

              {/* Score + rank travel together: the two numbers students track. */}
              <div className="flex items-center gap-2 rounded-full bg-muted/70 px-3 py-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  {myTotalCorrect}
                </span>
                {myRank !== null && (
                  <>
                    <span className="h-3 w-px bg-border" />
                    <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-muted-foreground">
                      #{myRank}
                      {rankDelta !== null && rankDelta !== 0 && (
                        <span
                          className={`inline-flex items-center rounded-full px-1 text-[10px] ${
                            rankDelta > 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
                          }`}
                        >
                          {rankDelta > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                          {Math.abs(rankDelta)}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>

              {isMultiLang && isLive && languagePicker(true)}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={toggleMute}
                aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              >
                {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-primary" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Time pressure stays in peripheral vision even on a long question. */}
        {/* Connected: a tick re-renders this hairline and the mm:ss chip below,
            never the question, the review list or the leaderboard. */}
        <LiveTimerBar />
        <CountdownTickSound />
      </header>

      {/* ─── Question bar: where am I, how long left ─── */}
      {/* 59px = header h-14 (56) + the 3px timer bar. */}
      {isLive && currentQuestion && (
        <div className="sticky top-[59px] z-40 border-b border-border/50 bg-background/90 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex h-12 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-bold tabular-nums">
                  Q{currentQuestionIndex + 1}
                  <span className="font-medium text-muted-foreground"> / {totalQuestionCount}</span>
                </span>
                {sectionNameFor(currentQuestion) && (
                  <>
                    <span className="h-3 w-px bg-border" />
                    <span className="truncate text-xs font-medium text-muted-foreground">
                      {sectionNameFor(currentQuestion)}
                    </span>
                  </>
                )}
              </div>
              {/* A3 — the room was just given more time. Shown beside the clock
                  because that is where the student's eyes already are when the
                  number they were watching suddenly grows. */}
              {session.extraSeconds > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-600">
                  +{session.extraSeconds}s
                </span>
              )}
              <LiveTimerChip idleLabel={isLocked ? "Time up" : "—"} />
            </div>
            {/* Whole-exam map. Desktop gets the same rail in the side panel, so
                this copy is phone-only to keep the sticky stack shallow. */}
            <div className="pb-2 lg:hidden">
              <QuestionRail items={railItems} onSelect={handleChipClick} size="sm" className="no-scrollbar" />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        {/* Phone pane switcher — desktop shows all three panes at once. */}
        <div className="mb-4 flex gap-1 rounded-xl bg-muted/70 p-1 lg:hidden">
          {([
            { key: "question", label: isEnded ? "Results" : "Question" },
            { key: "review", label: `Review${previousQuestions.length ? ` (${previousQuestions.length})` : ""}` },
            { key: "ranks", label: "Ranks" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setMobilePane(t.key)}
              aria-pressed={mobilePane === t.key}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mobilePane === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ─── Primary column ─── */}
          <div className="min-w-0 space-y-5">
            {/* Result hero (ended) */}
            {isEnded && (
              <div className={paneVisible("question")}>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                  <div className="bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent px-6 py-7 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
                      <Trophy className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-bold">That's a wrap!</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Here's how you finished</p>
                  </div>

                  <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
                    <div className="px-3 py-4 text-center">
                      <p className="text-2xl font-bold tabular-nums text-emerald-600">
                        {myTotalCorrect}
                        <span className="text-base font-semibold text-muted-foreground">/{totalQuestionCount}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Correct</p>
                    </div>
                    <div className="px-3 py-4 text-center">
                      <p className="text-2xl font-bold tabular-nums">#{myRank ?? "—"}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Rank</p>
                    </div>
                    <div className="px-3 py-4 text-center">
                      <p className="text-2xl font-bold tabular-nums text-primary">
                        {myAccuracy !== null ? `${Math.round(myAccuracy * 100)}%` : "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Accuracy</p>
                    </div>
                  </div>

                  {myAccuracy !== null && overallAccuracy !== null && (
                    <div className="border-t border-border/60 px-5 py-4">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-primary">You · {Math.round(myAccuracy * 100)}%</span>
                        <span className="text-muted-foreground">Class · {Math.round(overallAccuracy * 100)}%</span>
                      </div>
                      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${myAccuracy * 100}%` }} />
                        <span
                          className="absolute inset-y-0 w-0.5 bg-foreground/60"
                          style={{ left: `${overallAccuracy * 100}%` }}
                          aria-label="class average"
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {myAccuracy >= overallAccuracy
                          ? "You scored above the class average."
                          : "The class average was a little ahead — check the review below."}
                      </p>
                    </div>
                  )}
                </div>

                {sectionBreakdown.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-border/60 bg-card p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Section breakdown
                    </p>
                    <div className="mt-3 space-y-3">
                      {sectionBreakdown.map(([label, s]) => {
                        const pct = s.total > 0 ? (s.correct / s.total) * 100 : 0;
                        return (
                          <div key={label}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="truncate text-sm font-medium">{label}</span>
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                <span className="font-bold text-emerald-600">{s.correct}</span> / {s.total} correct ·{" "}
                                {s.answered} attempted
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active question */}
            {isLive && currentQuestion && (
              <div id="live-current-question" className={paneVisible("question")}>
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
                  <div className="space-y-5 p-4 sm:p-6">
                    <LiveQuestionBody text={currentQuestion.text} />

                    {Array.isArray(currentQuestion.options) && (
                      <div className="space-y-2.5">
                        {isCurrentMulti && !hasSubmitted && !isLocked && (
                          <p className="text-xs font-semibold text-primary">Select all that apply</p>
                        )}
                        {currentQuestion.options.map((opt: string, i: number) => {
                          const dist = optionDistribution(i);
                          return (
                            <LiveOption
                              key={i}
                              index={i}
                              html={opt}
                              imageUrl={
                                Array.isArray(currentQuestion.option_image_urls)
                                  ? currentQuestion.option_image_urls[i]
                                  : null
                              }
                              visual={optionVisual(i)}
                              multi={isCurrentMulti}
                              disabled={!canAnswerNow}
                              onClick={
                                !canAnswerNow
                                  ? undefined
                                  : () => (isCurrentMulti ? toggleOption(i) : setSelectedAnswer(i))
                              }
                              distributionPct={dist?.pct}
                              distributionLabel={dist?.label}
                              showShortcut={canAnswerNow}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Numeric / text answer input (no options to click) */}
                    {!currentQuestion.options &&
                      (currentQuestion.answer_type === "numeric" || currentQuestion.answer_type === "text") && (
                        <div className="space-y-2.5">
                          {hasSubmitted || isLocked ? (
                            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
                              <span className="text-muted-foreground">Your answer: </span>
                              <span className="font-semibold">
                                {myCurrentResponse?.selected_answer !== undefined &&
                                myCurrentResponse?.selected_answer !== null
                                  ? String(myCurrentResponse.selected_answer)
                                  : "—"}
                              </span>
                            </div>
                          ) : (
                            <Input
                              type={currentQuestion.answer_type === "numeric" ? "number" : "text"}
                              inputMode={currentQuestion.answer_type === "numeric" ? "decimal" : "text"}
                              placeholder={
                                currentQuestion.answer_type === "numeric"
                                  ? "Type your numeric answer…"
                                  : "Type your answer…"
                              }
                              value={typeof selectedAnswer === "string" ? selectedAnswer : ""}
                              onChange={(e) => setSelectedAnswer(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && selectedAnswer && !submitting) handleSubmit();
                              }}
                              disabled={isPreview}
                              className="h-12 text-base"
                            />
                          )}
                          {isCurrentRevealed && (
                            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                              <span className="opacity-80">Correct answer: </span>
                              <span className="font-semibold">
                                {String(revealedAnswers.get(currentQuestion.id) ?? "—")}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                    {renderVerdict()}
                  </div>

                  {/* Creator watching their own exam — nothing to submit */}
                  {isPreview && !isLocked && (
                    <div className="border-t border-border/60 bg-amber-500/10 px-4 py-3 text-center text-sm font-medium text-amber-700 dark:text-amber-400 sm:px-6">
                      <Lock className="mr-1.5 inline h-4 w-4" />
                      Preview — you're the creator, so answers aren't recorded
                    </div>
                  )}

                  {/* Action bar — sticks to the bottom of a phone viewport */}
                  {canAnswerNow && (
                    <div className="sticky bottom-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl sm:px-6">
                      <Button
                        className="h-12 w-full text-base font-semibold"
                        onClick={handleSubmit}
                        disabled={
                          selectedAnswer === null ||
                          selectedAnswer === "" ||
                          (Array.isArray(selectedAnswer) && selectedAnswer.length === 0) ||
                          submitting
                        }
                      >
                        {submitting ? "Submitting…" : "Submit answer"}
                      </Button>
                      {/* Only for option questions: the letter keys do nothing
                          when there are no options, and Enter is handled by the
                          input itself rather than the window listener. */}
                      {optionCount > 0 && (
                        <p className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
                          Press <kbd className="rounded border border-border bg-muted px-1 font-mono">A</kbd>–
                          <kbd className="rounded border border-border bg-muted px-1 font-mono">
                            {optionLetter(optionCount - 1)}
                          </kbd>{" "}
                          to choose, <kbd className="rounded border border-border bg-muted px-1 font-mono">Enter</kbd> to submit
                        </p>
                      )}
                    </div>
                  )}

                  {isLocked && (
                    <div className="border-t border-border/60 bg-muted/30 px-4 py-3 text-center text-sm font-medium text-muted-foreground sm:px-6">
                      <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />
                      Waiting for the next question…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Review */}
            <div className={`${paneVisible("review")} space-y-3`}>
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold">
                  {isEnded ? "Full review" : "Past questions"}
                  {previousQuestions.length > 0 && (
                    <span className="ml-1.5 font-medium text-muted-foreground">({previousQuestions.length})</span>
                  )}
                </h3>
                {isLive && questions.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{answeredCount} answered</span>
                )}
              </div>
              {renderReview()}
            </div>
          </div>

          {/* ─── Side rail: your standing + the room ─── */}
          <aside
            className={`${paneVisible("ranks")} space-y-4 lg:sticky lg:self-start ${
              isLive && currentQuestion ? "lg:top-[124px]" : "lg:top-[75px]"
            }`}
          >
            {/* Your card */}
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Your run</p>
                {streak >= 2 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                    <Flame className="h-3 w-3" />
                    {streak} in a row
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold tabular-nums text-emerald-600">{myTotalCorrect}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Correct</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums">{myRank !== null ? `#${myRank}` : "—"}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rank</p>
                </div>
                <div>
                  <p className="text-xl font-bold tabular-nums text-primary">
                    {myAccuracy !== null ? `${Math.round(myAccuracy * 100)}%` : "—"}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Accuracy</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {inRoom} in the room
                </span>
                <span className="tabular-nums">
                  {answeredCount}/{totalQuestionCount} answered
                </span>
              </div>
            </div>

            {/* Leaderboard */}
            <div className="rounded-2xl border border-border/60 bg-card">
              <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold">Leaderboard</h3>
                {isLive && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    live
                  </span>
                )}
              </div>
              <div className="max-h-[46vh] overflow-y-auto p-2">
                <LiveLeaderboard
                  entries={leaderboard}
                  currentUserId={user?.id}
                  self={mySelf && mySelf.rank !== null && mySelf.rank > 20 ? mySelf : null}
                  emptyLabel={
                    isLive ? "Standings appear once the first question closes." : "No standings for this session."
                  }
                />
              </div>
            </div>

            {/* Rail legend so chip colours are self-explanatory */}
            {questions.length > 0 && (
              <div className="hidden rounded-2xl border border-border/60 bg-card p-4 lg:block">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Your progress</p>
                <div className="mt-3">
                  <QuestionRail items={railItems} onSelect={handleChipClick} size="sm" layout="stacked" />
                </div>
                <RailLegend
                  statuses={isEnded ? ["correct", "wrong", "skipped"] : ["current", "correct", "wrong", "locked"]}
                  className="mt-3 border-t border-border/50 pt-3"
                />
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
