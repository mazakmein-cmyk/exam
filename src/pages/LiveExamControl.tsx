/**
 * LiveExamControl.tsx — Creator Live Dashboard (The Control Room)
 *
 * This page is the heart of the live exam experience for the creator.
 * From here, the creator can:
 *   - See the live student count
 *   - Unlock the next question (timer starts on unlock)
 *   - See real-time submission count per question
 *   - View per-question analytics after the timer ends
 *   - See the Top 20 leaderboard
 *   - End the exam
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { renderMathInHtml, renderMathInText } from "@/lib/renderMath";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  BarChart3,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Radio,
  Copy,
  QrCode as QrCodeIcon,
} from "lucide-react";
import QRCode from "react-qr-code";
import SEO from "@/components/SEO";
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
  getParticipantCount,
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

// ─── Format seconds to mm:ss ─────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
  const [expandedPrevQuestion, setExpandedPrevQuestion] = useState<string | null>(null);

  // Live participant count via realtime
  const participantCount = useLiveParticipantCount(liveExamId);

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

  // ─── Realtime subscriptions ────────────────────────────────

  useLiveExamRealtime(liveExamId, {
    onExamUpdate: (updatedExam) => {
      setExam(updatedExam);
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

  // Find which section the current question belongs to
  const currentSection = useMemo(() => {
    if (!currentQuestion) return null;
    return sections.find(s => s.id === currentQuestion.live_section_id);
  }, [currentQuestion, sections]);

  // Previous questions (all before current)
  const previousQuestions = useMemo(() => {
    if (currentQuestionIndex <= 0) return [];
    return questions.slice(0, currentQuestionIndex);
  }, [questions, currentQuestionIndex]);

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
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Live exam not found</p>
        <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
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
      <div className="min-h-screen bg-background">
        <SEO
          title={`${exam.name} | Control Room`}
          description="Creator control room for a live exam session."
          path={`/live-exam/${creatorId}/${liveExamId}/control`}
          noindex
        />
        <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/20 flex items-center justify-center">
            <Radio className="h-10 w-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-center">{exam.name}</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Your exam is published and ready to go live. Share the link with your students, then click "Go Live" when you're ready.
          </p>
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border">
            <code className="text-sm font-mono text-foreground">{window.location.origin}/live/{exam.share_code}</code>
            <Button variant="ghost" size="icon" onClick={handleCopyLink}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowShareDialog(true)}>
              <QrCodeIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{participantCount} student{participantCount !== 1 ? "s" : ""} waiting</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Editor
            </Button>
            <Button
              onClick={() => setShowStartDialog(true)}
              className="bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25 px-8"
              size="lg"
            >
              <Play className="h-5 w-5 mr-2" />
              Go Live
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{questions.length} questions ready</p>

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
                <AlertDialogAction onClick={handleStartLive} className="bg-red-500 hover:bg-red-600 text-white">
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

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${exam.name} | Control Room`}
        description="Creator control room for a live exam session."
        path={`/live-exam/${creatorId}/${liveExamId}/control`}
        noindex
      />

      {/* ─── Top Bar ─── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                {isLive && (
                  <Badge className="bg-red-500 text-white animate-pulse text-xs font-bold px-2">
                    🔴 LIVE
                  </Badge>
                )}
                {isEnded && (
                  <Badge className="bg-gray-500/15 text-gray-600 text-xs font-medium">
                    Ended
                  </Badge>
                )}
                <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">{exam.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="font-semibold text-foreground">{participantCount}</span>
                <span className="hidden sm:inline">students</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)}>
                <QrCodeIcon className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Share Link</span>
              </Button>
              {isLive && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowEndDialog(true)}
                >
                  <Square className="h-4 w-4 mr-1" />
                  End Exam
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ─── Main Grid ─── */}
      <main className="container mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── Left Column: Current Question + Controls ─── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Current Question Card */}
            <Card className="border-2 border-emerald-500/30 shadow-lg shadow-emerald-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg font-bold">
                      {!hasStarted
                        ? "Ready to Start"
                        : `Q${currentQuestionIndex + 1} / ${questions.length}`}
                    </CardTitle>
                    {currentSection && (
                      <Badge variant="secondary" className="text-xs">{currentSection.name}</Badge>
                    )}
                  </div>
                  {/* Timer */}
                  {isTimerActive && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-lg font-bold ${
                      remaining <= 10
                        ? "bg-red-500/10 text-red-500 animate-pulse"
                        : remaining <= 30
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-emerald-500/10 text-emerald-600"
                    }`}>
                      <Clock className="h-5 w-5" />
                      {formatTime(remaining)}
                    </div>
                  )}
                  {collectingFinal && (
                    <Badge className="bg-amber-500/15 text-amber-600 text-xs animate-pulse">
                      Collecting final answers…
                    </Badge>
                  )}
                  {isTimerExpired && !collectingFinal && currentQuestion && (
                    <Badge className="bg-gray-500/15 text-gray-500 text-xs">Timer Ended</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show current question */}
                {currentQuestion ? (
                  <div className="space-y-4">
                    <div
                      className="text-base leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMathInHtml(currentQuestion.text) }}
                    />
                    {/* Options display */}
                    {currentQuestion.options && Array.isArray(currentQuestion.options) && (
                      <div className="space-y-2">
                        {currentQuestion.options.map((opt: string, i: number) => {
                          const isCorrect = Array.isArray(currentQuestion.correct_answer)
                            ? currentQuestion.correct_answer.includes(i) || currentQuestion.correct_answer.includes(String(i))
                            : String(currentQuestion.correct_answer) === String(i);
                          const showCorrect = isTimerExpired;
                          // Distribution keys are the JSON text of selected_answer
                          const dist = currentAnalytics?.option_distribution;
                          const optCount = dist ? Number(dist[String(i)] ?? dist[`"${i}"`] ?? 0) : 0;
                          const optPct = currentAnalytics && currentAnalytics.total_responses > 0
                            ? Math.round((optCount / currentAnalytics.total_responses) * 100)
                            : 0;
                          return (
                            <div
                              key={i}
                              className={`px-4 py-3 rounded-xl text-sm border transition-all ${
                                showCorrect && isCorrect
                                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium"
                                  : "border-border/60 bg-muted/20"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center font-mono text-xs font-bold shrink-0">
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <span className="flex-1" dangerouslySetInnerHTML={{ __html: renderMathInText(opt) }} />
                                {showCorrect && isCorrect && <Check className="h-5 w-5 text-emerald-600 shrink-0" />}
                              </div>
                              {/* Response distribution bar */}
                              {showCorrect && currentAnalytics && (
                                <div className="flex items-center gap-3 mt-2 pl-10">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isCorrect ? "bg-emerald-500" : "bg-muted-foreground/40"
                                      }`}
                                      style={{ width: `${optPct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono text-muted-foreground shrink-0 w-20 text-right">
                                    {optCount} · {optPct}%
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Integer / Text answer */}
                    {(currentQuestion.answer_type === "numeric" || currentQuestion.answer_type === "integer" || currentQuestion.answer_type === "text") && isTimerExpired && (
                      <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                        <span className="text-sm text-muted-foreground">Correct Answer: </span>
                        <span className="font-semibold text-emerald-700">{JSON.stringify(currentQuestion.correct_answer)}</span>
                      </div>
                    )}

                    {/* Submission counter */}
                    <div className="flex items-center gap-4 pt-2 border-t border-border/40">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{currentResponseCount}</span>
                        <span className="text-muted-foreground">/ {participantCount} submitted</span>
                      </div>
                      {/* Progress bar */}
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                          style={{ width: `${participantCount > 0 ? (currentResponseCount / participantCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Analytics after timer */}
                    {isTimerExpired && currentAnalytics && (
                      <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-emerald-500" />
                          Question Analytics
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center p-2 bg-background rounded-lg">
                            <div className="text-lg font-bold text-emerald-600">{currentAnalytics.correct_count}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Correct</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded-lg">
                            <div className="text-lg font-bold text-red-500">{currentAnalytics.wrong_count}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wrong</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded-lg">
                            <div className="text-lg font-bold text-gray-500">{currentAnalytics.skipped_count}</div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Skipped</div>
                          </div>
                          <div className="text-center p-2 bg-background rounded-lg">
                            <div className="text-lg font-bold text-blue-500">
                              {currentAnalytics.avg_time_correct_ms ? `${(currentAnalytics.avg_time_correct_ms / 1000).toFixed(1)}s` : "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Time</div>
                          </div>
                        </div>
                        {currentAnalytics.fastest_user_name && (
                          <div className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-amber-500" />
                            <span className="text-muted-foreground">Fastest:</span>
                            <span className="font-semibold">{currentAnalytics.fastest_user_name}</span>
                            <span className="text-muted-foreground">
                              ({currentAnalytics.fastest_time_ms ? `${(currentAnalytics.fastest_time_ms / 1000).toFixed(1)}s` : "—"})
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {isLive
                      ? 'Click "Unlock First Question" to begin!'
                      : isEnded
                      ? "The exam has ended."
                      : "Exam is not live yet."}
                  </div>
                )}

                {/* Action buttons */}
                {isLive && (
                  <div className="flex gap-3 pt-4 border-t border-border/40">
                    {canUnlockNext && (
                      <Button
                        onClick={handleUnlockNext}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 h-12 text-base"
                      >
                        <SkipForward className="h-5 w-5 mr-2" />
                        {!hasStarted ? "Unlock First Question" : `Unlock Q${currentQuestionIndex + 2}`}
                      </Button>
                    )}
                    {isTimerActive && (
                      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground gap-2">
                        <Clock className="h-4 w-4 animate-spin" />
                        Waiting for timer to end...
                      </div>
                    )}
                    {collectingFinal && (
                      <div className="flex-1 flex items-center justify-center text-sm text-amber-600 gap-2">
                        <Clock className="h-4 w-4 animate-spin" />
                        Collecting final answers…
                      </div>
                    )}
                    {isTimerExpired && !collectingFinal && currentQuestionIndex >= questions.length - 1 && (
                      <div className="flex-1 text-center py-3 text-sm text-muted-foreground">
                        All questions completed! You can end the exam now.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Previous Questions (collapsible) */}
            {previousQuestions.length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Previous Questions ({previousQuestions.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {previousQuestions.map((q, idx) => {
                    const qAnalytics = analytics.get(q.id);
                    const isExpanded = expandedPrevQuestion === q.id;
                    return (
                      <div key={q.id} className="border border-border/50 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedPrevQuestion(isExpanded ? null : q.id)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-muted-foreground">Q{idx + 1}</span>
                            <span className="text-sm truncate max-w-[300px]">{q.text.replace(/<[^>]*>/g, '').substring(0, 60)}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {qAnalytics && (
                              <span className="text-xs text-muted-foreground">
                                ✅ {qAnalytics.correct_count}/{qAnalytics.total_responses + qAnalytics.skipped_count}
                                {qAnalytics.total_responses > 0 && (
                                  <span className="ml-1">
                                    ({Math.round((qAnalytics.correct_count / (qAnalytics.total_responses)) * 100)}%)
                                  </span>
                                )}
                              </span>
                            )}
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {isExpanded && qAnalytics && (
                          <div className="px-4 pb-3 pt-1 border-t border-border/40 space-y-2">
                            <div className="grid grid-cols-4 gap-2 text-center">
                              <div className="p-2 bg-emerald-500/5 rounded-lg">
                                <div className="text-sm font-bold text-emerald-600">{qAnalytics.correct_count}</div>
                                <div className="text-[9px] text-muted-foreground">Correct</div>
                              </div>
                              <div className="p-2 bg-red-500/5 rounded-lg">
                                <div className="text-sm font-bold text-red-500">{qAnalytics.wrong_count}</div>
                                <div className="text-[9px] text-muted-foreground">Wrong</div>
                              </div>
                              <div className="p-2 bg-gray-500/5 rounded-lg">
                                <div className="text-sm font-bold text-gray-500">{qAnalytics.skipped_count}</div>
                                <div className="text-[9px] text-muted-foreground">Skipped</div>
                              </div>
                              <div className="p-2 bg-blue-500/5 rounded-lg">
                                <div className="text-sm font-bold text-blue-500">
                                  {qAnalytics.avg_time_correct_ms ? `${(qAnalytics.avg_time_correct_ms / 1000).toFixed(1)}s` : "—"}
                                </div>
                                <div className="text-[9px] text-muted-foreground">Avg Time</div>
                              </div>
                            </div>
                            {qAnalytics.fastest_user_name && (
                              <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                                <Zap className="h-3 w-3 text-amber-500" />
                                Fastest: <span className="font-medium text-foreground">{qAnalytics.fastest_user_name}</span>
                                ({qAnalytics.fastest_time_ms ? `${(qAnalytics.fastest_time_ms / 1000).toFixed(1)}s` : "—"})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ─── Right Column: Leaderboard ─── */}
          <div className="space-y-6">
            <Card className="border-border/60 sticky top-20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Top 20 Leaderboard
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    {isLive ? "Rankings will appear after the first question timer ends." : "No participants yet."}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {leaderboard.map((p, idx) => (
                      <div
                        key={p.user_id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                          idx === 0 ? "bg-amber-500/10" :
                          idx === 1 ? "bg-gray-400/10" :
                          idx === 2 ? "bg-amber-700/10" :
                          "hover:bg-muted/30"
                        }`}
                      >
                        {/* Rank */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? "bg-amber-500 text-white" :
                          idx === 1 ? "bg-gray-400 text-white" :
                          idx === 2 ? "bg-amber-700 text-white" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {p.rank || idx + 1}
                        </div>
                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.display_name}</p>
                        </div>
                        {/* Score */}
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-emerald-600">{p.total_correct}</span>
                          <span className="text-xs text-muted-foreground">/{p.total_answered || currentQuestionIndex + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Question Navigator */}
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Question Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {questions.map((q, idx) => {
                    const qAnalytics = analytics.get(q.id);
                    const isCurrent = idx === currentQuestionIndex;
                    const isPast = idx < currentQuestionIndex;
                    const isFuture = idx > currentQuestionIndex;
                    return (
                      <div
                        key={q.id}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                          isCurrent && isTimerActive
                            ? "bg-emerald-500 text-white ring-2 ring-emerald-500/30 ring-offset-2 animate-pulse"
                            : isCurrent && isTimerExpired
                            ? "bg-emerald-500 text-white ring-2 ring-emerald-500/30 ring-offset-2"
                            : isPast && qAnalytics
                            ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                            : isFuture
                            ? "bg-muted/50 text-muted-foreground"
                            : isCurrent
                            ? "bg-emerald-500 text-white"
                            : "bg-muted/50 text-muted-foreground"
                        }`}
                        title={`Q${idx + 1}: ${q.text.replace(/<[^>]*>/g, '').substring(0, 50)}`}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

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
