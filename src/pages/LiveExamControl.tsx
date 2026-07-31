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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import QRCode from "react-qr-code";
import SEO from "@/components/SEO";
import LiveQuestionBody, { questionPreviewText } from "@/components/live/LiveQuestionBody";
import LiveOption, { type OptionVisual } from "@/components/live/LiveOption";
import LiveLeaderboard from "@/components/live/LiveLeaderboard";
import QuestionRail, { RailLegend, type ChipStatus, type RailItem } from "@/components/live/QuestionRail";
import { TimerBar, TimerRing } from "@/components/live/LiveTimer";
import { OutcomeBar, MeterRow } from "@/components/live/LiveStats";
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
  fetchResponseCount,
  type LiveExam,
  type LiveQuestion,
  type LiveSection,
  type LiveParticipant,
  type LiveQuestionAnalytics,
} from "@/services/liveExamService";
import {
  useLiveExamRealtime,
  useLiveParticipantCount,
} from "@/hooks/useLiveExamRealtime";

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

  // Core state
  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);
  const [analytics, setAnalytics] = useState<Map<string, LiveQuestionAnalytics>>(new Map());
  const [responseCountMap, setResponseCountMap] = useState<Map<string, number>>(new Map());

  // Dialog states
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  /** Past question being inspected in the preview pane; null = the live one. */
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  /**
   * Creators often screen-share this page, so the answer key stays hidden
   * while a question is open unless they deliberately reveal it.
   */
  const [showKey, setShowKey] = useState(false);

  // Live participant count via realtime
  const participantCount = useLiveParticipantCount(liveExamId);

  // Realtime callbacks are registered once, so they read state through refs.
  const examRef = useRef<LiveExam | null>(null);
  const questionsRef = useRef<LiveQuestion[]>([]);
  examRef.current = exam;
  questionsRef.current = questions;

  // Timer state
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [timerExpiredForIndex, setTimerExpiredForIndex] = useState<number>(-1);

  // Grace window: server accepts submissions until +2s after the visual
  // timer ends, so analytics wait ~2.5s before computing.
  const [collectingFinal, setCollectingFinal] = useState(false);
  const graceTimeoutRef = useRef<number | null>(null);

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

      // Load leaderboard if exam is live or ended
      if (examData.status === "live" || examData.status === "ended") {
        const lb = await fetchLeaderboard(liveExamId, 20);
        setLeaderboard(lb);
      }

      // Restore timer if exam is live and a question is unlocked
      if (examData.status === "live" && examData.current_question_index >= 0 && examData.current_question_unlocked_at) {
        const currentQ = qs[examData.current_question_index];
        if (currentQ) {
          // Seed the live submission counter for the open question
          const count = await fetchResponseCount(liveExamId, currentQ.id);
          setResponseCountMap(prev => {
            const next = new Map(prev);
            next.set(currentQ.id, count);
            return next;
          });

          const unlockedAt = new Date(examData.current_question_unlocked_at).getTime();
          const endTime = unlockedAt + currentQ.time_seconds * 1000;
          if (Date.now() < endTime) {
            setTimerEndTime(endTime);
          } else {
            // Timer already expired — mark it so we don't re-trigger
            setTimerExpiredForIndex(examData.current_question_index);
            setTimerEndTime(null);
            // Expiry was missed while this page was away: compute now.
            // Skip if a local grace timeout is about to do the same thing.
            if (!analyticsMap.has(currentQ.id) && graceTimeoutRef.current === null) {
              try {
                const analyticsResult = await computeQuestionAnalytics(liveExamId, currentQ.id);
                setAnalytics(prev => {
                  const next = new Map(prev);
                  next.set(currentQ.id, analyticsResult);
                  return next;
                });
                await computeRankings(liveExamId);
                const lb = await fetchLeaderboard(liveExamId, 20);
                setLeaderboard(lb);
              } catch (err) {
                console.error("Missed-expiry analytics computation failed:", err);
              }
            }
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  /**
   * Re-derive the countdown from the exam row itself.
   *
   * handleUnlockNext arms the timer only in the tab that clicked it. Any other
   * control-room tab — a second window, a projector, or this one when the
   * realtime UPDATE beats the RPC promise — learns about the new question purely
   * through onExamUpdate. Without this it would keep the previous question's
   * expired-timer state forever: no Unlock control, and `canUnlockNext` stuck
   * false. Derives from the server's unlocked_at, never from client time.
   */
  const applyTimerFromExam = (examData: LiveExam, qs: LiveQuestion[]) => {
    if (
      examData.status === "live" &&
      examData.current_question_index >= 0 &&
      examData.current_question_unlocked_at
    ) {
      const currentQ = qs[examData.current_question_index];
      if (!currentQ) return;
      const endTime =
        new Date(examData.current_question_unlocked_at).getTime() + currentQ.time_seconds * 1000;
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

  // ─── Realtime subscriptions ────────────────────────────────

  useLiveExamRealtime(liveExamId, {
    onExamUpdate: (updatedExam) => {
      const prev = examRef.current;
      setExam(updatedExam);
      const movedOn =
        !prev ||
        prev.current_question_index !== updatedExam.current_question_index ||
        prev.current_question_unlocked_at !== updatedExam.current_question_unlocked_at;
      if (movedOn) applyTimerFromExam(updatedExam, questionsRef.current);
    },
    onParticipantJoined: () => {
      // Count is handled by useLiveParticipantCount
    },
    onParticipantUpdated: (p) => {
      setLeaderboard(prev => {
        const next = prev.map(e => e.user_id === p.user_id ? p : e);
        if (!prev.find(e => e.user_id === p.user_id)) next.push(p);
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
    onNewResponse: (response) => {
      setResponseCountMap(prev => {
        const next = new Map(prev);
        const current = next.get(response.live_question_id) || 0;
        next.set(response.live_question_id, current + 1);
        return next;
      });
    },
    onAnalyticsComputed: (a) => {
      setAnalytics(prev => {
        const next = new Map(prev);
        next.set(a.live_question_id, a);
        return next;
      });
    },
    onReconnect: () => {
      // Rehydrate counts/analytics/leaderboard missed while disconnected
      loadData(true);
    },
  });

  // ─── Timer expired handler ─────────────────────────────────

  const handleTimerExpired = useCallback(() => {
    if (!exam || !liveExamId) return;
    const idx = exam.current_question_index;
    if (idx < 0 || idx >= questions.length) return;
    if (timerExpiredForIndex >= idx) return; // Already handled

    setTimerExpiredForIndex(idx);
    setTimerEndTime(null);

    const currentQ = questions[idx];
    if (!currentQ) return;

    // Server accepts submissions until +2s after the visual timer, so wait
    // out the grace window before computing analytics.
    setCollectingFinal(true);
    if (graceTimeoutRef.current) window.clearTimeout(graceTimeoutRef.current);
    graceTimeoutRef.current = window.setTimeout(async () => {
      graceTimeoutRef.current = null;
      setCollectingFinal(false);
      try {
        // Compute analytics + rankings via RPC
        const analyticsResult = await computeQuestionAnalytics(liveExamId, currentQ.id);
        setAnalytics(prev => {
          const next = new Map(prev);
          next.set(currentQ.id, analyticsResult);
          return next;
        });

        await computeRankings(liveExamId);

        // Refresh leaderboard
        const lb = await fetchLeaderboard(liveExamId, 20);
        setLeaderboard(lb);

        toast({ title: `Q${idx + 1} Timer Ended`, description: "Analytics computed & rankings updated." });
      } catch (error: any) {
        console.error("Analytics computation failed:", error);
        toast({ title: "Error computing analytics", description: error.message, variant: "destructive" });
      }
    }, 2500);
  }, [exam, liveExamId, questions, timerExpiredForIndex]);

  const remaining = useCountdown(timerEndTime, handleTimerExpired);

  // ─── Derived state ────────────────────────────────────────

  const currentQuestionIndex = exam?.current_question_index ?? -1;
  const currentQuestion = currentQuestionIndex >= 0 ? questions[currentQuestionIndex] : null;
  const isLive = exam?.status === "live";
  const isEnded = exam?.status === "ended";
  const hasStarted = currentQuestionIndex >= 0;
  const isTimerActive = timerEndTime !== null && remaining > 0;
  const isTimerExpired = currentQuestionIndex >= 0 && timerExpiredForIndex >= currentQuestionIndex;
  const canUnlockNext = isLive && (!hasStarted || isTimerExpired) && !collectingFinal && currentQuestionIndex < questions.length - 1;
  const currentAnalytics = currentQuestion ? analytics.get(currentQuestion.id) : null;
  const currentResponseCount = currentQuestion ? (responseCountMap.get(currentQuestion.id) || 0) : 0;

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

  /**
   * Fastest correct answer to show on the deck. While a question is open it has
   * no analytics yet, so fall back to the most recent question that does —
   * an empty tile mid-session reads as "nobody has answered".
   */
  const fastest = useMemo(() => {
    for (let i = currentQuestionIndex; i >= 0; i--) {
      const a = questions[i] ? analytics.get(questions[i].id) : undefined;
      if (a?.fastest_user_name) return { index: i, name: a.fastest_user_name, ms: a.fastest_time_ms };
    }
    return null;
  }, [analytics, questions, currentQuestionIndex]);

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

  // ─── Actions ───────────────────────────────────────────────

  const handleStartLive = async () => {
    if (!liveExamId) return;
    try {
      const updated = await startLiveSession(liveExamId);
      setExam(updated);
      setShowStartDialog(false);
      toast({ title: "🔴 You're Live!", description: "Students can now join. Unlock the first question when ready." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUnlockNext = async () => {
    if (!liveExamId || !exam) return;

    try {
      // Never carry a pending grace compute across an unlock
      if (graceTimeoutRef.current) {
        window.clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }
      setCollectingFinal(false);

      // Server increments the index and stamps the unlock with DB time
      const updated = await unlockNextQuestion(liveExamId);
      setExam(updated);

      const nextIndex = updated.current_question_index;
      const nextQ = questions[nextIndex];
      if (nextQ && updated.current_question_unlocked_at) {
        // Countdown derives from the server timestamp, not client Date.now()
        const endTime = new Date(updated.current_question_unlocked_at).getTime() + nextQ.time_seconds * 1000;
        setTimerEndTime(endTime);
        // Reset response count for new question
        setResponseCountMap(prev => {
          const next = new Map(prev);
          next.set(nextQ.id, 0);
          return next;
        });
      }

      toast({ title: `Q${nextIndex + 1} Unlocked!`, description: `Timer: ${nextQ?.time_seconds}s` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      setTimerEndTime(null);

      // Server back-fills any missing analytics and computes final rankings
      const updated = await endLiveSession(liveExamId);
      setExam(updated);
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
      if (showEndDialog || showStartDialog || showShareDialog) return;
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
  }, [canUnlockNext, showEndDialog, showStartDialog, showShareDialog]);

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

  // ─── Share dialog (link + QR) ──────────────────────────────

  const shareDialog = (
    <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Live Exam</DialogTitle>
          <DialogDescription>
            Students can scan the QR code or open the link to join.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="bg-white p-4 rounded-xl border">
            <QRCode value={shareUrl} size={180} />
          </div>
          <div className="flex items-center gap-2 w-full p-2 bg-muted/50 rounded-xl border">
            <code className="flex-1 text-xs font-mono text-foreground break-all px-2">{shareUrl}</code>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCopyLink}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ─── Pre-live state (published but not started) ────────────

  if (exam.status === "published") {
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
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to editor
            </Button>
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
                  label: `${participantCount} student${participantCount !== 1 ? "s" : ""} waiting in the room`,
                  done: participantCount > 0,
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

          <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-5">
            <p className="text-sm text-muted-foreground">
              Going live opens the waiting room. Nothing is shown to students until you unlock the first question — you
              control the pace throughout.
            </p>
            <Button
              onClick={() => setShowStartDialog(true)}
              size="lg"
              className="mt-4 h-12 w-full bg-rose-500 text-white shadow-lg shadow-rose-500/25 hover:bg-rose-600 sm:w-auto sm:px-10"
            >
              <Play className="mr-2 h-5 w-5" />
              Go Live
            </Button>
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
          {shareDialog}
        </div>
      </div>
    );
  }

  // ─── Main Live / Ended View ────────────────────────────────

  const responseRatePct = participantCount > 0 ? Math.round((currentResponseCount / participantCount) * 100) : 0;

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
            {isLive ? (
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
              <span className="text-xs font-bold tabular-nums">{participantCount}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">live</span>
            </div>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setShowShareDialog(true)}>
              <QrCodeIcon className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
            {isLive && (
              <Button variant="destructive" size="sm" className="h-8" onClick={() => setShowEndDialog(true)}>
                <Square className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">End</span>
              </Button>
            )}
          </div>
        </div>
        <TimerBar remaining={remaining} total={currentQuestion?.time_seconds || 0} active={isTimerActive} />
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
                  <TimerRing
                    remaining={remaining}
                    total={currentQuestion?.time_seconds || 0}
                    active={isTimerActive}
                    size={116}
                    idleLabel={isEnded ? "—" : hasStarted ? "Time up" : "Ready"}
                    caption={isTimerActive ? "remaining" : undefined}
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
                    max={participantCount || 1}
                    tone={responseRatePct >= 80 ? "correct" : "brand"}
                  />

                  {primaryAction()}
                </div>
              </div>

              {/* Pulse strip: the four numbers a creator narrates out loud */}
              <div className="grid grid-cols-2 divide-x divide-border/60 border-t border-border/60 sm:grid-cols-4">
                <DeckStat label="In the room" value={participantCount} icon={Users} tone="brand" />
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
                            <span className="font-semibold text-foreground">{previewAnalytics.fastest_user_name}</span>
                            {previewAnalytics.fastest_time_ms
                              ? ` · ${(previewAnalytics.fastest_time_ms / 1000).toFixed(1)}s`
                              : ""}
                          </p>
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
                onSelect={(item) => {
                  // Clicking the live question returns the pane to it; a past
                  // question opens read-only review without pausing anything.
                  if (item.index === currentQuestionIndex) setPreviewIndex(null);
                  else if (item.index < currentQuestionIndex) setPreviewIndex(item.index);
                  else toast({ title: `Q${item.index + 1} hasn't been unlocked yet` });
                }}
              />
              <RailLegend
                statuses={["current", "done", "upcoming"]}
                className="hidden shrink-0 border-l border-border/60 pl-4 xl:flex"
              />
            </div>
          </div>
        </footer>
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

      {shareDialog}
    </div>
  );
}
