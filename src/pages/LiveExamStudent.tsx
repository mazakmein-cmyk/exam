import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ChevronUp,
  Lock,
  X,
  Minus,
  Eye,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SEO from "@/components/SEO";
import {
  fetchLiveExamByShareCode,
  fetchAllLiveQuestionsStudent,
  fetchRevealedAnswers,
  fetchLiveSections,
  fetchAllAnalytics,
  joinLiveExam,
  fetchLeaderboard,
  submitLiveResponse,
  fetchMyResponses,
  type LiveExam,
  type LiveQuestion,
  type LiveSection,
  type LiveParticipant,
  type LiveResponse,
  type LiveQuestionAnalytics,
} from "@/services/liveExamService";
import {
  useLiveExamRealtime,
  useLiveParticipantCount,
} from "@/hooks/useLiveExamRealtime";
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

// ─── Timer Hook ──────────────────────────────────────────────

function useCountdown(targetEndTime: number | null, onExpire: () => void) {
  const [remaining, setRemaining] = useState<number>(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    if (!targetEndTime) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const left = Math.max(0, Math.ceil((targetEndTime - now) / 1000));
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [targetEndTime]);

  return remaining;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

type ChipState = "current" | "locked" | "pending" | "correct" | "wrong" | "skipped" | "missed";

// ─── Main Component ──────────────────────────────────────────

export default function LiveExamStudent() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Exam Data
  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [participant, setParticipant] = useState<LiveParticipant | null>(null);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);

  // Realtime Data — both maps are keyed by question ORDINAL (array index /
  // question_ordinal), NOT question id, so they survive language switches.
  const [analytics, setAnalytics] = useState<Map<number, LiveQuestionAnalytics>>(new Map());
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

  // Timer State
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [timerExpiredForIndex, setTimerExpiredForIndex] = useState<number>(-1);

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

  const participantCount = useLiveParticipantCount(exam?.id);

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

  const applyTimer = (examData: LiveExam, qs: LiveQuestion[]) => {
    if (examData.status === "live" && examData.current_question_index >= 0 && examData.current_question_unlocked_at) {
      const currentQ = qs[examData.current_question_index];
      if (!currentQ) return;
      const unlockedAt = new Date(examData.current_question_unlocked_at).getTime();
      const endTime = unlockedAt + currentQ.time_seconds * 1000;
      if (Date.now() < endTime) {
        setTimerEndTime(endTime);
        setTimerExpiredForIndex(-1);
      } else {
        setTimerEndTime(null);
        setTimerExpiredForIndex(examData.current_question_index);
      }
    } else {
      setTimerEndTime(null);
    }
  };

  const handleExamEnded = (endedExam: LiveExam) => {
    setTimerEndTime(null);
    fetchLeaderboard(endedExam.id, 20).then(setLeaderboard).catch(() => {});
    refreshReveal();
    fetchAllAnalytics(endedExam.id)
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
        const lb = await fetchLeaderboard(examData.id, 20);
        setLeaderboard(lb);
      }

      // 6. Setup Timer if active question
      applyTimer(examData, qs);
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

  // ─── Exam state transitions (realtime + reconnect) ─────────

  const handleExamUpdate = (updatedExam: LiveExam) => {
    const prev = examRef.current;
    examRef.current = updatedExam;
    setExam(updatedExam);

    if (prev && updatedExam.current_question_index > prev.current_question_index) {
      // New question unlocked!
      applyTimer(updatedExam, questionsRef.current);
      setSelectedAnswer(null);
      playUnlockDing();
      toast({ title: "New Question Unlocked!" });
      // Previous question's timer is definitively over — pull its reveal/grades.
      refreshReveal();
      window.setTimeout(refreshReveal, 2500);
    }

    if (prev && prev.status === "live" && updatedExam.status === "ended") {
      toast({ title: "Exam Ended" });
      handleExamEnded(updatedExam);
    }
  };

  /** Full state refetch after a dropped realtime connection resubscribes. */
  const handleReconnect = async () => {
    const ex = examRef.current;
    if (!ex || !shareCode) return;
    try {
      const [freshExam, lb, myResponses, revealed, analyticsRows] = await Promise.all([
        fetchLiveExamByShareCode(shareCode),
        fetchLeaderboard(ex.id, 20),
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

      const prev = examRef.current;
      examRef.current = freshExam;
      setExam(freshExam);
      if (prev && freshExam.current_question_index > prev.current_question_index) {
        setSelectedAnswer(null);
        playUnlockDing();
        toast({ title: "New Question Unlocked!" });
      }
      applyTimer(freshExam, questionsRef.current);
      if (prev && prev.status === "live" && freshExam.status === "ended") {
        toast({ title: "Exam Ended" });
      }
    } catch {
      /* the channel will retry; next reconnect refetches again */
    }
  };

  // ─── Realtime Subscriptions ────────────────────────────────

  useLiveExamRealtime(exam?.id, {
    onExamUpdate: handleExamUpdate,
    onParticipantUpdated: (p) => {
      if (p.user_id === user?.id) setParticipant(p);
      setLeaderboard((prev) => {
        const next = prev.map((e) => (e.user_id === p.user_id ? p : e));
        if (!prev.find((e) => e.user_id === p.user_id)) next.push(p);
        return next
          .sort((a, b) => {
            if (a.rank === null && b.rank === null) return 0;
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
          })
          .slice(0, 20);
      });
    },
    onAnalyticsComputed: (a) => {
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
    },
    onReconnect: handleReconnect,
  });

  // ─── Timer Expired ─────────────────────────────────────────

  const handleTimerExpired = () => {
    const ex = examRef.current;
    if (!ex) return;
    const idx = ex.current_question_index;
    if (idx >= 0 && timerExpiredForIndex < idx) {
      setTimerExpiredForIndex(idx);
      setTimerEndTime(null);
      // Server reveals at +2s grace, so retry shortly after the first attempt.
      refreshReveal();
      window.setTimeout(refreshReveal, 2500);
    }
  };

  const remaining = useCountdown(timerEndTime, handleTimerExpired);

  // Tick sound for the last 5 seconds
  useEffect(() => {
    if (timerEndTime !== null && remaining > 0 && remaining <= 5) playTick();
  }, [remaining, timerEndTime]);

  // ─── Submit Response ───────────────────────────────────────

  /** Multi-select: clicking an option toggles it; the array stays index-sorted. */
  const toggleOption = (i: number) => {
    setSelectedAnswer((prev: any) => {
      const cur = (Array.isArray(prev) ? prev : []).map(Number);
      const next = cur.includes(i) ? cur.filter((v) => v !== i) : [...cur, i];
      return next.sort((a, b) => a - b);
    });
  };

  const handleSubmit = async () => {
    if (!exam || !participant || submitting) return;
    const idx = exam.current_question_index;
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

  const isLobby = exam?.status === "published" || (exam?.status === "live" && exam.current_question_index === -1);
  const isLive = exam?.status === "live" && exam.current_question_index >= 0;
  const isEnded = exam?.status === "ended";

  const currentQuestionIndex = exam?.current_question_index ?? -1;
  const currentQuestion = isLive ? questions[currentQuestionIndex] : null;
  const isTimerActive = timerEndTime !== null && remaining > 0;
  const isTimerExpiredLocally = currentQuestionIndex >= 0 && timerExpiredForIndex >= currentQuestionIndex;

  // A question is officially "locked" when the timer expires or analytics arrive
  const currentAnalytics = currentQuestionIndex >= 0 ? analytics.get(currentQuestionIndex) : undefined;
  const isLocked = isTimerExpiredLocally || !!currentAnalytics;

  const myCurrentResponse = currentQuestionIndex >= 0 ? responses.get(currentQuestionIndex) : undefined;
  const hasSubmitted = !!myCurrentResponse;
  const isCurrentRevealed = currentQuestion ? revealedAnswers.has(currentQuestion.id) : false;
  const isCurrentMulti = isMultiAnswer(currentQuestion?.answer_type);

  /** Server-graded correctness first; fall back to comparing with the revealed answer. */
  const getCorrectness = (res: LiveResponse | undefined, q: LiveQuestion | undefined): boolean | null => {
    if (!res || !q) return null;
    if (res.is_correct !== null && res.is_correct !== undefined) return res.is_correct;
    if (revealedAnswers.has(q.id)) return isResponseCorrect(res.selected_answer, revealedAnswers.get(q.id), q.answer_type);
    return null;
  };

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
      const label = q.section_label || "General";
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
  }, [isEnded, questions, responses, revealedAnswers]);

  const overallAccuracy = useMemo(() => {
    let correct = 0;
    let total = 0;
    analytics.forEach((a) => {
      correct += a.correct_count || 0;
      total += a.total_responses || 0;
    });
    return total > 0 ? correct / total : null;
  }, [analytics]);

  const myAccuracy = participant && participant.total_answered > 0
    ? participant.total_correct / participant.total_answered
    : null;

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
    const r = participant?.rank ?? null;
    if (r === null) return;
    const prev = prevRankRef.current;
    prevRankRef.current = r;
    if (prev === null || prev === r) return;
    setRankDelta(prev - r); // positive = climbed
    const t = window.setTimeout(() => setRankDelta(null), 4000);
    return () => window.clearTimeout(t);
  }, [participant?.rank]);

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

  const handleChipClick = (idx: number) => {
    const st = chipState(idx);
    if (st === "locked") {
      toast({ title: "The creator hasn't unlocked this question yet" });
      return;
    }
    if (st === "current") {
      document.getElementById("live-current-question")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const q = questions[idx];
    if (!q) return;
    setExpandedPrevQuestion(q.id);
    window.setTimeout(() => {
      document.getElementById(`live-prev-q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  // ─── Render: Loading & Errors ──────────────────────────────

  if (loading && !exam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Live exam not found or link is invalid.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const isMultiLang = (exam.supported_languages || []).length > 1;

  // ─── Render: LOBBY ─────────────────────────────────────────

  if (isLobby) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEO
          title={`${exam.name} | Waiting Room`}
          description={`Waiting room for the live exam ${exam.name}.`}
          path={`/live/${exam.share_code}`}
          noindex
        />
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8 text-center max-w-2xl mx-auto">
          <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center relative">
            <Radio className="h-12 w-12 text-emerald-500 animate-pulse" />
          </div>

          <div className="space-y-3">
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 mb-2">Live Exam Waiting Room</Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{exam.name}</h1>
            {exam.description && (
              <p className="text-lg text-muted-foreground mt-2">{exam.description}</p>
            )}
          </div>

          {exam.instruction && (
            <Card className="w-full border-border/60 text-left">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{exam.instruction}</p>
              </CardContent>
            </Card>
          )}

          {sections.length > 0 && (
            <Card className="w-full border-border/60 text-left">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Sections</CardTitle>
                <Badge variant="outline" className="text-xs font-medium">
                  {questions.length} questions total
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {sections.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {questionCountBySection.get(s.id) || 0} questions
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {isMultiLang && (
            <div className="w-full max-w-xs space-y-2 text-left">
              <label className="text-sm font-medium">Choose your language</label>
              <Select value={activeLanguage} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-full h-11">
                  <Globe className="h-4 w-4 mr-2 text-emerald-500" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(exam.supported_languages || ["en"]).map(langCode => {
                    const lang = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
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
            </div>
          )}

          <div className="p-6 bg-muted/30 rounded-2xl border border-border/50 w-full mt-4">
            <div className="flex items-center justify-center gap-4 text-sm font-medium">
              <div className="flex items-center gap-2 text-emerald-600">
                <Users className="h-5 w-5" />
                <span>{participantCount} Students waiting</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Waiting for the creator to start the exam...
            </p>
            <div className="flex justify-center gap-1.5 mt-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: LIVE PLAY & ENDED ─────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={isLive ? `${exam.name} | Live` : `${exam.name} | Results`}
        description={`Live exam session for ${exam.name}.`}
        path={`/live/${exam.share_code}`}
        noindex
      />

      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Badge className={isLive ? "bg-red-500 text-white animate-pulse text-[10px] px-2" : "bg-gray-500/15 text-gray-600"}>
                {isLive ? "🔴 LIVE" : "ENDED"}
              </Badge>
              <span className="text-sm font-semibold truncate max-w-[200px]">{exam.name}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {isMultiLang && isLive && (
                <Select value={activeLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <Globe className="h-3 w-3 mr-1 text-emerald-500" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(exam.supported_languages || ["en"]).map(langCode => {
                      const lang = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                      return <SelectItem key={langCode} value={langCode}>{lang?.flag} {lang?.label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={toggleMute}
                aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              >
                {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-emerald-600" />}
              </Button>
              {streak >= 2 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-orange-500/15 text-orange-600 whitespace-nowrap animate-in fade-in">
                  🔥 {streak} in a row
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs font-medium bg-muted/50 px-3 py-1.5 rounded-full whitespace-nowrap">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Score: {participant?.total_correct || 0}
                {rankDelta !== null && rankDelta !== 0 && (
                  <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-in fade-in slide-in-from-bottom-1 ${
                    rankDelta > 0 ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-600"
                  }`}>
                    {rankDelta > 0 ? `+${rankDelta} ↑` : `${rankDelta} ↓`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto max-w-5xl px-6 py-6 space-y-6">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Active/Ended View */}
          <div className="lg:col-span-2 space-y-6">

            {/* Question navigation strip */}
            {(isLive || isEnded) && questions.length > 0 && (
              <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-2 w-max px-1 py-1">
                  {questions.map((q, idx) => {
                    const st = chipState(idx);
                    const cls =
                      st === "current" ? "bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-400/60 animate-pulse" :
                      st === "locked" ? "bg-muted/40 text-muted-foreground border-border/60" :
                      st === "pending" ? "bg-emerald-500/10 text-emerald-600 border-2 border-emerald-500" :
                      st === "correct" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/40" :
                      st === "wrong" ? "bg-red-500/15 text-red-600 border-red-500/40" :
                      "bg-muted/40 text-muted-foreground border-border/60";
                    return (
                      <button
                        key={q.id}
                        onClick={() => handleChipClick(idx)}
                        aria-label={`Question ${idx + 1} (${st})`}
                        className={`h-8 min-w-8 px-2 rounded-full flex items-center justify-center gap-1 text-xs font-bold border transition-all shrink-0 ${cls}`}
                      >
                        <span>{idx + 1}</span>
                        {st === "locked" && <Lock className="h-3 w-3" />}
                        {st === "correct" && <Check className="h-3 w-3" />}
                        {st === "wrong" && <X className="h-3 w-3" />}
                        {st === "skipped" && <Minus className="h-3 w-3" />}
                        {st === "missed" && <Eye className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ended State Banner */}
            {isEnded && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="pt-6 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <Trophy className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Exam Ended!</h2>
                    <p className="text-muted-foreground mt-1">Here is how you performed</p>
                  </div>
                  <div className="flex justify-center gap-6 pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-emerald-600">
                        {participant?.total_correct || 0}
                        <span className="text-lg font-semibold text-muted-foreground"> / {exam.total_questions}</span>
                      </p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Correct</p>
                    </div>
                    <div className="w-px bg-border/60" />
                    <div className="text-center">
                      <p className="text-3xl font-bold">{participant?.rank || "-"}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Rank</p>
                    </div>
                  </div>
                  {myAccuracy !== null && overallAccuracy !== null && (
                    <p className="text-sm text-muted-foreground pt-1">
                      Your accuracy: <span className="font-semibold text-emerald-600">{Math.round(myAccuracy * 100)}%</span>
                      {" · "}
                      Everyone: <span className="font-semibold">{Math.round(overallAccuracy * 100)}%</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Per-section breakdown (ended) */}
            {isEnded && sectionBreakdown.length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Section Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sectionBreakdown.map(([label, s]) => (
                    <div key={label} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                      <span className="text-sm font-medium truncate">{label}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        <span className="text-emerald-600 font-semibold">{s.correct} correct</span>
                        {" · "}{s.answered} answered{" · "}{s.total} total
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Active Question */}
            {isLive && currentQuestion && (
              <Card id="live-current-question" className="border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/5 overflow-hidden">
                {/* Header & Timer */}
                <div className="bg-muted/30 px-6 py-4 flex items-center justify-between border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs font-bold border-emerald-500/30 text-emerald-700 bg-emerald-500/10">
                      Q{currentQuestionIndex + 1} of {exam.total_questions}
                    </Badge>
                  </div>
                  {isTimerActive && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-base font-bold ${
                      remaining <= 10 ? "bg-red-500/10 text-red-500 animate-pulse" : "bg-emerald-500/10 text-emerald-600"
                    }`}>
                      <Clock className="h-4 w-4" />
                      {formatTime(remaining)}
                    </div>
                  )}
                  {isLocked && !isTimerActive && (
                    <Badge variant="secondary" className="bg-gray-500/10 text-gray-500">Timer Ended</Badge>
                  )}
                </div>

                <CardContent className="p-6 space-y-6">
                  <div className="text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMathInHtml(currentQuestion.text) }} />

                  {currentQuestion.options && Array.isArray(currentQuestion.options) && (
                    <div className="space-y-3">
                      {isCurrentMulti && !hasSubmitted && !isLocked && (
                        <p className="text-xs font-medium text-emerald-600">Select all that apply</p>
                      )}
                      {currentQuestion.options.map((opt: string, i: number) => {
                        const isOptionSelected = hasSubmitted
                          ? isOptionPicked(myCurrentResponse?.selected_answer, i)
                          : isCurrentMulti
                            ? isOptionPicked(selectedAnswer, i)
                            : selectedAnswer === i;
                        // Correctness comes ONLY from the reveal RPC — never from question data
                        const isCorrect = isCurrentRevealed
                          ? isAnswerCorrect(i, revealedAnswers.get(currentQuestion.id))
                          : false;

                        const optionStyle = () => {
                          if (!isLocked || !isCurrentRevealed) {
                            // Active play, or locked but the answer isn't revealed yet
                            if (hasSubmitted || isLocked) {
                              return isOptionSelected ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500" : "border-border/60 opacity-50";
                            }
                            return isOptionSelected
                              ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500"
                              : "border-border/60 hover:border-emerald-500/50 hover:bg-muted/30 cursor-pointer";
                          } else {
                            // Locked + revealed (Results)
                            if (isCorrect && isOptionSelected) return "border-emerald-500 bg-emerald-500/10 text-emerald-700 ring-2 ring-emerald-500/30";
                            if (isCorrect && !isOptionSelected) return "border-emerald-500 bg-emerald-500/10 text-emerald-700 border-dashed";
                            if (!isCorrect && isOptionSelected) return "border-red-500 bg-red-500/10 text-red-700 ring-2 ring-red-500/30";
                            return "border-border/60 opacity-50";
                          }
                        };

                        return (
                          <button
                            key={i}
                            disabled={hasSubmitted || isLocked}
                            onClick={() => (isCurrentMulti ? toggleOption(i) : setSelectedAnswer(i))}
                            className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all ${optionStyle()}`}
                          >
                            <span className={`w-8 h-8 flex items-center justify-center font-mono text-sm font-bold shrink-0 ${
                              isCurrentMulti ? "rounded-md" : "rounded-full"
                            } ${
                              isOptionSelected ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                            }`}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span className="flex-1 text-sm" dangerouslySetInnerHTML={{ __html: renderMathInText(opt) }} />

                            {/* Analytics distribution */}
                            {isLocked && currentAnalytics?.option_distribution && (
                              <span className="text-xs font-mono font-medium opacity-70">
                                {(() => {
                                  // Multi keys are whole selections like ["0","2"], so tally every
                                  // key containing this option ("chose this option") instead of
                                  // reading a per-index key that only exists for single-select.
                                  const count = isCurrentMulti
                                    ? optionPickCount(currentAnalytics.option_distribution, i)
                                    : currentAnalytics.option_distribution[String(i)] || 0;
                                  const total = currentAnalytics.total_responses || 1;
                                  return `${Math.round((Number(count) / total) * 100)}%`;
                                })()}
                              </span>
                            )}

                            {/* Status Icon */}
                            {isLocked && isCurrentRevealed && isCorrect && <Check className="h-5 w-5 text-emerald-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Numeric / text answer input (no options to click) */}
                  {!currentQuestion.options &&
                    (currentQuestion.answer_type === "numeric" || currentQuestion.answer_type === "text") && (
                    <div className="space-y-3">
                      {hasSubmitted || isLocked ? (
                        <div className="p-4 rounded-xl border border-border/60 bg-muted/30 text-sm">
                          <span className="text-muted-foreground">Your answer: </span>
                          <span className="font-semibold">
                            {myCurrentResponse?.selected_answer !== undefined && myCurrentResponse?.selected_answer !== null
                              ? String(myCurrentResponse.selected_answer)
                              : "—"}
                          </span>
                        </div>
                      ) : (
                        <Input
                          type={currentQuestion.answer_type === "numeric" ? "number" : "text"}
                          inputMode={currentQuestion.answer_type === "numeric" ? "decimal" : "text"}
                          placeholder={currentQuestion.answer_type === "numeric" ? "Type your numeric answer..." : "Type your answer..."}
                          value={typeof selectedAnswer === "string" ? selectedAnswer : ""}
                          onChange={(e) => setSelectedAnswer(e.target.value)}
                          className="h-12 text-base"
                        />
                      )}
                      {isCurrentRevealed && (
                        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-sm text-emerald-700">
                          <span className="opacity-80">Correct answer: </span>
                          <span className="font-semibold">{String(revealedAnswers.get(currentQuestion.id) ?? "—")}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions area */}
                  <div className="pt-4 border-t border-border/40">
                    {!isLocked ? (
                      !hasSubmitted ? (
                        <Button
                          className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700"
                          onClick={handleSubmit}
                          disabled={
                            selectedAnswer === null ||
                            selectedAnswer === "" ||
                            (Array.isArray(selectedAnswer) && selectedAnswer.length === 0) ||
                            submitting
                          }
                        >
                          {submitting ? "Submitting..." : "Submit Answer"}
                        </Button>
                      ) : (
                        <div className="text-center py-3 text-sm text-muted-foreground bg-muted/50 rounded-xl">
                          Answer submitted! Waiting for timer to end...
                        </div>
                      )
                    ) : (
                      <div className="text-center py-3 text-sm font-medium text-emerald-700 bg-emerald-500/10 rounded-xl">
                        Waiting for next question to start...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Previous Questions List */}
            {previousQuestions.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold px-1">Past Questions</h3>
                <div className="space-y-3">
                  {previousQuestions.map((q, idx) => {
                    const qAnalytics = analytics.get(idx);
                    const myRes = responses.get(idx);
                    const isExpanded = expandedPrevQuestion === q.id;
                    const revealed = revealedAnswers.has(q.id);
                    const correctness = getCorrectness(myRes, q);
                    const mp = qAnalytics ? mostPickedOption(qAnalytics) : null;

                    return (
                      <div key={q.id} id={`live-prev-q-${q.id}`} className="border border-border/60 bg-card rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedPrevQuestion(isExpanded ? null : q.id)}
                          className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              myRes
                                ? correctness === true
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : correctness === false
                                    ? "bg-red-500/10 text-red-600"
                                    : "bg-emerald-500/10 text-emerald-600"
                                : "bg-gray-500/10 text-gray-500"
                            }`}>
                              Q{idx + 1}
                            </div>
                            <span className="text-sm truncate max-w-[300px]">{q.text.replace(/<[^>]*>/g, '').substring(0, 50)}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {!myRes ? (
                              <Badge variant="outline" className="text-[10px]">
                                {idx < joinIndexRef.current ? "Missed" : "Skipped"}
                              </Badge>
                            ) : correctness === true ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] border-none hover:bg-emerald-500/15">+1</Badge>
                            ) : correctness === false ? (
                              <Badge className="bg-red-500/15 text-red-700 text-[10px] border-none hover:bg-red-500/15">0</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 border-t border-border/40">
                            <div className="text-sm mb-4" dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.text) }} />

                            {q.options && Array.isArray(q.options) && (
                              <div className="space-y-2 mb-4">
                                {q.options.map((opt: string, i: number) => {
                                  // No correctness styling until the answer is revealed
                                  const optCorrect = revealed && isAnswerCorrect(i, revealedAnswers.get(q.id));
                                  const wasSelected = myRes ? isOptionPicked(myRes.selected_answer, i) : false;

                                  return (
                                    <div key={i} className={`flex items-center gap-3 p-2 rounded-lg text-sm border ${
                                      !revealed
                                        ? wasSelected
                                          ? "border-emerald-500 bg-emerald-500/5"
                                          : "border-transparent bg-muted/30 opacity-60"
                                        : optCorrect && wasSelected ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" :
                                          optCorrect && !wasSelected ? "border-emerald-500 border-dashed bg-emerald-500/5 text-emerald-700" :
                                          !optCorrect && wasSelected ? "border-red-500 bg-red-500/10 text-red-700" :
                                          "border-transparent bg-muted/30 opacity-60"
                                    }`}>
                                      <span className="font-mono font-bold text-xs opacity-70 w-4">{String.fromCharCode(65 + i)}</span>
                                      <span className="flex-1" dangerouslySetInnerHTML={{ __html: renderMathInText(opt) }} />
                                      {optCorrect && <Check className="h-4 w-4" />}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Numeric / text answers (no options to render) */}
                            {!q.options && (q.answer_type === "numeric" || q.answer_type === "text") && (
                              <div className="space-y-2 mb-4 text-sm">
                                {myRes && (
                                  <div className="p-2 rounded-lg border border-border/60 bg-muted/30">
                                    <span className="text-muted-foreground">Your answer: </span>
                                    <span className="font-semibold">{String(myRes.selected_answer ?? "—")}</span>
                                  </div>
                                )}
                                {revealed && (
                                  <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                                    <span className="opacity-80">Correct answer: </span>
                                    <span className="font-semibold">{String(revealedAnswers.get(q.id) ?? "—")}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Analytics Mini-View */}
                            {(qAnalytics || myRes) && (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-lg">
                                {qAnalytics && (
                                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {qAnalytics.total_responses} responses</span>
                                )}
                                {qAnalytics && (
                                  <span className="flex items-center gap-1 text-emerald-600"><Check className="h-3 w-3" /> {Math.round((qAnalytics.correct_count / (qAnalytics.total_responses || 1)) * 100)}% correct</span>
                                )}
                                {myRes && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    You: {(myRes.time_taken_ms / 1000).toFixed(1)}s
                                    {qAnalytics?.avg_time_correct_ms != null && (
                                      <> · Avg correct: {(qAnalytics.avg_time_correct_ms / 1000).toFixed(1)}s</>
                                    )}
                                  </span>
                                )}
                                {mp && <span>Most picked: {mp.label} ({mp.pct}%)</span>}
                                {qAnalytics?.fastest_user_name && (
                                  <span className="flex items-center gap-1 text-amber-600"><Zap className="h-3 w-3" /> Fastest: {qAnalytics.fastest_user_name}</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Leaderboard */}
          <div className="space-y-6">
            <Card className="border-border/60 sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Live Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Waiting for results...</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {leaderboard.map((p, idx) => {
                        const isMe = p.user_id === user?.id;
                        return (
                          <div
                            key={p.user_id}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                              isMe ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" :
                              idx === 0 ? "bg-amber-500/10" :
                              idx === 1 ? "bg-gray-400/10" :
                              idx === 2 ? "bg-amber-700/10" :
                              ""
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0 ? "bg-amber-500 text-white" :
                              idx === 1 ? "bg-gray-400 text-white" :
                              idx === 2 ? "bg-amber-700 text-white" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {p.rank || idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${isMe ? "font-bold text-emerald-700" : "font-medium"}`}>
                                {p.display_name} {isMe && "(You)"}
                              </p>
                            </div>
                            <div className="text-sm font-bold text-emerald-600">
                              {p.total_correct}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pinned own row when outside the top 20 */}
                    {participant &&
                      participant.rank !== null &&
                      participant.rank > 20 &&
                      !leaderboard.some((p) => p.user_id === user?.id) && (
                        <>
                          <div className="border-t border-dashed border-border/60 my-2" />
                          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-muted text-muted-foreground">
                              {participant.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate font-bold text-emerald-700">{participant.display_name} (You)</p>
                            </div>
                            <div className="text-sm font-bold text-emerald-600">{participant.total_correct}</div>
                          </div>
                        </>
                      )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

      </main>
    </div>
  );
}
