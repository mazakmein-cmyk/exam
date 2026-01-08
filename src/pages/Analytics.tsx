import { useEffect, useState, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingUp, Clock, Target, Users, BookOpen, Eye, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Attempt {
  id: string;
  created_at: string;
  submitted_at: string;
  score: number;
  total_questions: number;
  accuracy_percentage: number;
  avg_time_per_question: number;
  time_spent_seconds: number;
  total_time_spent?: number; // Added for internal calculation
  updated_at: string;
  user_id: string; // Needed for creator view
  section: {
    name: string;
    time_minutes?: number;
    exam: {
      name: string;
    };
  };
}

interface QuestionStats {
  id: string;
  q_no: number;
  text: string;
  sectionName: string;
  sectionSortOrder: number;
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracy: number;
  avgTime: number;
  correctAnswer: any;
  answerType: string;
  options: any;
  imageUrl: string | null;
  reviewedCount: number;
  commonWrongAnswers: Record<string, number>;
  mostCommonWrong?: string | null;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [examName, setExamName] = useState<string>("");
  const [questionStats, setQuestionStats] = useState<QuestionStats[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionStats | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionName: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionName)) {
      newCollapsed.delete(sectionName);
    } else {
      newCollapsed.add(sectionName);
    }
    setCollapsedSections(newCollapsed);
  };

  useEffect(() => {
    fetchData();
  }, [examId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const from = searchParams.get("from");
        navigate(from === "marketplace" ? "/student-auth?from=marketplace" : "/student-auth");
        return;
      }

      let query = supabase
        .from("attempts")
        .select(`
          *,
          section:sections(
            name,
            exam_id,
            exam:exams(name)
          )
        `)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });

      if (examId) {
        // Creator View: Get all attempts for this exam (by joining sections)
        // Note: Supabase filtering on joined tables usually needs !inner for correct filtering, 
        // but since we are navigating from dashboard where we own the exam, we trust the ID. 
        // However, standard foreign key filtering in PostgREST:
        // attempts -> section -> exam_id.
        // We can do this by filtering on the joined column, but JS client requires specific syntax or embedded resource filtering.
        // Easier approach: Get sections for this exam first, then get attempts for those sections.

        // 1. Get Exam Name
        const { data: examData, error: examError } = await supabase
          .from("exams")
          .select("name")
          .eq("id", examId)
          .single();

        if (examError) throw examError;
        setExamName(examData.name);

        // 2. Get attempts through sections
        const { data: sectionAttempts, error: attemptsError } = await supabase
          .from("attempts")
          .select(`
            *,
            section:sections!inner(
              name,
              time_minutes,
              sort_order,
              created_at,
              exam_id,
              exam:exams(name)
            )
          `)
          .eq("section.exam_id", examId) // This uses the inner join filter
          .order("submitted_at", { ascending: false });

        if (attemptsError) throw attemptsError;
        // NOTE: We do NOT setAttempts here yet. We need to correct them first.

        // 3. Get all questions for this exam to build stats
        const { data: questionsData, error: questionsError } = await supabase
          .from("parsed_questions")
          .select(`
            id, text, q_no, correct_answer, answer_type, options, image_url,
            section:sections!inner(id, name, exam_id, sort_order)
          `)
          .eq("section.exam_id", examId);

        if (questionsError) throw questionsError;

        // 4. Get all responses for these attempts
        const attemptIds = (sectionAttempts || []).map(a => a.id);
        let responsesData: any[] = [];

        if (attemptIds.length > 0) {
          const { data: respData, error: responsesError } = await supabase
            .from("responses")
            .select("question_id, is_correct, time_spent_seconds, selected_answer, attempt_id, is_marked_for_review")
            .in("attempt_id", attemptIds);

          if (responsesError) throw responsesError;
          responsesData = respData || [];
        }

        // Helper for normalization
        const normalize = (val: any) => String(val).trim().toLowerCase();

        // 5. Correct Attempts Data (Re-grade on fly)
        const correctedAttempts = (sectionAttempts || []).map((attempt: any) => {
          const attemptResponses = responsesData.filter(r => r.attempt_id === attempt.id);
          let correctCount = 0;
          let totalTime = 0;

          attemptResponses.forEach(r => {
            totalTime += (r.time_spent_seconds || 0);

            // Find question to get correct answer
            const question = questionsData?.find(q => q.id === r.question_id);
            if (question && question.correct_answer) {
              const selected = r.selected_answer;
              const correct = question.correct_answer;
              let isCorrect = false;

              if (selected !== null && selected !== undefined) {
                if (Array.isArray(correct)) {
                  const selectedArray = Array.isArray(selected) ? selected : [selected];
                  if (selectedArray.length === correct.length) {
                    const sortedSelected = [...selectedArray].map(normalize).sort();
                    const sortedCorrect = [...correct].map(normalize).sort();
                    isCorrect = sortedSelected.every((val, index) => val === sortedCorrect[index]);
                  }
                } else if (typeof correct === 'object' && correct !== null) {
                  const val = (correct as any).answer || (correct as any).value;
                  isCorrect = normalize(val) === normalize(selected);
                } else {
                  isCorrect = normalize(selected) === normalize(correct);
                }
              }

              if (isCorrect) correctCount++;
            } else {
              // Fallback if no correct_answer found, trust DB (though DB might be wrong if 0)
              if (r.is_correct) correctCount++;
            }
          });

          const totalQuestions = questionsData?.filter(q => q.section.id === attempt.section_id).length || attempt.total_questions || 1;
          const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

          return {
            ...attempt,
            score: correctCount,
            total_questions: totalQuestions,
            accuracy_percentage: accuracy,
            avg_time_per_question: totalQuestions > 0 ? totalTime / totalQuestions : 0,
            total_time_spent: totalTime
          };
        });

        setAttempts(correctedAttempts);

        if (attemptIds.length > 0) {
          // ... Question stats calculation ...

          // 5. Calculate per-question stats
          const statsMap = new Map<string, QuestionStats>();

          // Initialize stats for all questions
          questionsData?.forEach((q: any) => {
            statsMap.set(q.id, {
              id: q.id,
              q_no: q.q_no,
              text: q.text,
              sectionName: q.section.name,
              sectionSortOrder: q.section.sort_order,
              totalAttempts: 0,
              correctCount: 0,
              wrongCount: 0,
              unansweredCount: 0,
              accuracy: 0,
              avgTime: 0,
              correctAnswer: q.correct_answer,
              answerType: q.answer_type,
              options: q.options,
              imageUrl: q.image_url,
              reviewedCount: 0,
              commonWrongAnswers: {}
            });
          });

          const normalize = (val: any) => String(val).trim().toLowerCase();

          // Aggregate responses
          responsesData?.forEach((r: any) => {
            const stat = statsMap.get(r.question_id);
            if (stat) {
              // Only count stats for submitted attempts generally? 
              const attempt = correctedAttempts.find(a => a.id === r.attempt_id);
              if (!attempt || !attempt.submitted_at) return; // Skip incomplete attempts for question stats to maintain accuracy relevance

              stat.totalAttempts++;
              stat.avgTime += r.time_spent_seconds || 0;
              if (r.is_marked_for_review) stat.reviewedCount++;

              // Check correctness dynamically if DB says false/null, or just trust dynamic?
              // Let's perform robust check if DB flag is not explicitly true (or always to be safe)
              // But relying on DB is faster. Let's do hybrid: if DB true, take it. If not, check robustly.

              let isCorrect = r.is_correct === true;

              if (!isCorrect && stat.correctAnswer) {
                const selected = r.selected_answer;
                const correct = stat.correctAnswer;

                if (selected !== null && selected !== undefined) {
                  if (Array.isArray(correct)) {
                    const selectedArray = Array.isArray(selected) ? selected : [selected];
                    if (selectedArray.length === correct.length) {
                      const sortedSelected = [...selectedArray].map(normalize).sort();
                      const sortedCorrect = [...correct].map(normalize).sort();
                      isCorrect = sortedSelected.every((val, index) => val === sortedCorrect[index]);
                    }
                  } else if (typeof correct === 'object' && correct !== null) {
                    const val = (correct as any).answer || (correct as any).value;
                    isCorrect = normalize(val) === normalize(selected);
                  } else {
                    isCorrect = normalize(selected) === normalize(correct);
                  }
                }
              }

              if (isCorrect) {
                stat.correctCount++;
              } else if (r.selected_answer === null) {
                stat.unansweredCount++;
              } else {
                stat.wrongCount++;
                const ansKey = Array.isArray(r.selected_answer) ? r.selected_answer.join(",") : String(r.selected_answer);
                stat.commonWrongAnswers[ansKey] = (stat.commonWrongAnswers[ansKey] || 0) + 1;
              }
            }
          });

          // Finalize averages
          const finalStats: QuestionStats[] = Array.from(statsMap.values()).map(stat => ({
            ...stat,
            accuracy: stat.totalAttempts > 0 ? (stat.correctCount / stat.totalAttempts) * 100 : 0,
            avgTime: stat.totalAttempts > 0 ? stat.avgTime / stat.totalAttempts : 0,
            mostCommonWrong: Object.entries(stat.commonWrongAnswers).sort((a, b) => b[1] - a[1])[0]?.[0] || null
          }));

          setQuestionStats(finalStats);
        } else {
          setQuestionStats([]);
        }

      } else {
        // Student View: Get only MY attempts
        const { data, error } = await query.eq("user_id", user.id);
        if (error) throw error;
        setAttempts(data as any);
      }

    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };



  // --- Calculations ---

  // Completed attempts for performance stats
  const completedAttempts = attempts.filter(a => a.submitted_at);
  const validAttempts = examId ? completedAttempts : attempts;

  // Overview Metrics
  // Calculate total attempts using Session Clustering (Time Gap + Duplicate Sections)
  // This correctly counts retakes on the same day as separate attempts
  const sortedAttempts = [...attempts].sort((a: any, b: any) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const sessionStats: { correct: number; total: number; isSubmitted: boolean }[] = [];
  const userActiveSession: Record<string, { lastTime: number; sectionIds: Set<string>; correct: number; total: number; isSubmitted: boolean; examId: string }> = {};
  const SESSION_GAP_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours

  sortedAttempts.forEach((attempt: any) => {
    const userId = attempt.user_id;
    const attemptTime = new Date(attempt.created_at).getTime();
    const sectionId = attempt.section_id;
    const isSubmitted = !!attempt.submitted_at;
    const score = attempt.score || 0;
    const total = attempt.total_questions || 1;
    const examId = attempt.section?.exam_id;

    if (!userActiveSession[userId]) {
      userActiveSession[userId] = {
        lastTime: attemptTime,
        sectionIds: new Set([sectionId]),
        correct: score,
        total: total,
        isSubmitted: isSubmitted,
        examId: examId
      };
    } else {
      const session = userActiveSession[userId];
      const timeDiff = attemptTime - session.lastTime;
      const isDuplicateSection = session.sectionIds.has(sectionId);
      const isDifferentExam = session.examId !== examId;

      // New Session Trigger: Duplicate Section OR Time Gap OR Different Exam
      if (isDuplicateSection || timeDiff > SESSION_GAP_THRESHOLD || isDifferentExam) {
        // Finalize previous session
        sessionStats.push({
          correct: session.correct,
          total: session.total,
          isSubmitted: session.isSubmitted
        });

        // Start new session
        userActiveSession[userId] = {
          lastTime: attemptTime,
          sectionIds: new Set([sectionId]),
          correct: score,
          total: total,
          isSubmitted: isSubmitted,
          examId: examId
        };
      } else {
        // Same session - Accumulate
        session.lastTime = attemptTime;
        session.sectionIds.add(sectionId);
        session.correct += score;
        session.total += total;
        if (isSubmitted) session.isSubmitted = true;
      }
    }
  });

  // Finalize the last session for each user
  Object.values(userActiveSession).forEach((session) => {
    sessionStats.push({
      correct: session.correct,
      total: session.total,
      isSubmitted: session.isSubmitted
    });
  });

  const totalAttempts = sessionStats.length;
  const submittedCount = sessionStats.filter(s => s.isSubmitted).length;
  const completionRate = totalAttempts > 0 ? (submittedCount / totalAttempts) * 100 : 0;

  // Repeat Attempts (Creator Only)
  const studentAttempts = attempts.reduce((acc: any, attempt) => {
    acc[attempt.user_id] = (acc[attempt.user_id] || 0) + 1;
    return acc;
  }, {});
  const repeatersCount = Object.values(studentAttempts).filter((count: any) => count > 1).length;

  const uniqueStudents = new Set(attempts.map(a => a.user_id)).size;

  const avgAccuracy = validAttempts.reduce((sum, a) => sum + a.accuracy_percentage, 0) / (validAttempts.length || 1);
  const avgTimePerQuestion = validAttempts.reduce((sum, a) => sum + a.avg_time_per_question, 0) / (validAttempts.length || 1);
  const bestScore = Math.max(...validAttempts.map((a) => a.accuracy_percentage), 0);

  // For Student View: Trend of accuracy over attempts
  // For Creator View: Trend of average accuracy over time (grouped by day)
  const accuracyTrendData = examId
    ? (() => {
      // Group by date
      const grouped = validAttempts.reduce((acc: any, attempt) => {
        const date = new Date(attempt.submitted_at).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = { date, totalAccuracy: 0, count: 0 };
        }
        acc[date].totalAccuracy += attempt.accuracy_percentage;
        acc[date].count++;
        return acc;
      }, {});

      return Object.values(grouped).map((g: any) => ({
        date: g.date,
        accuracy: parseFloat((g.totalAccuracy / g.count).toFixed(2)),
        attempts: g.count
      })).reverse(); // Reverse to show chronological if fetched desc
    })()
    : validAttempts
      .slice()
      .reverse()
      .map((attempt, index) => ({
        attempt: `Attempt ${index + 1}`,
        accuracy: attempt.accuracy_percentage,
        date: new Date(attempt.submitted_at).toLocaleDateString(),
      }));

  // Section-wise performance
  // Section-wise performance
  const sectionPerformance = validAttempts.reduce((acc: any, attempt) => {
    const sectionName = attempt.section.name;
    if (!acc[sectionName]) {
      acc[sectionName] = {
        name: sectionName,
        totalAttempts: 0,
        avgAccuracy: 0,
        totalAccuracy: 0,
        totalTime: 0,
        avgTime: 0,
        totalTimeSpent: 0,
        timeLimit: attempt.section.time_minutes || 0,
        sortOrder: attempt.section.sort_order,
        createdAt: attempt.section.created_at
      };
    }
    acc[sectionName].totalAttempts++;
    acc[sectionName].totalAccuracy += attempt.accuracy_percentage;
    acc[sectionName].totalTime += attempt.avg_time_per_question; // Keep for existing charts if needed
    acc[sectionName].totalTimeSpent += (attempt.total_time_spent || 0);

    acc[sectionName].avgAccuracy =
      parseFloat((acc[sectionName].totalAccuracy / acc[sectionName].totalAttempts).toFixed(2));
    acc[sectionName].avgTime =
      acc[sectionName].totalTime / acc[sectionName].totalAttempts;

    return acc;
  }, {});

  const sectionData = Object.values(sectionPerformance).sort((a: any, b: any) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Score Distribution
  const scoreDistribution = [
    { range: '0-20%', count: 0 },
    { range: '21-40%', count: 0 },
    { range: '41-60%', count: 0 },
    { range: '61-80%', count: 0 },
    { range: '81-100%', count: 0 },
  ];

  sessionStats.filter(s => s.isSubmitted).forEach(session => {
    const acc = session.total > 0 ? (session.correct / session.total) * 100 : 0;
    if (acc <= 20) scoreDistribution[0].count++;
    else if (acc <= 40) scoreDistribution[1].count++;
    else if (acc <= 60) scoreDistribution[2].count++;
    else if (acc <= 80) scoreDistribution[3].count++;
    else scoreDistribution[4].count++;
  });

  // Insights Data
  const mostSkipped = [...questionStats].sort((a, b) => b.unansweredCount - a.unansweredCount).slice(0, 5).filter(a => a.unansweredCount > 0);
  const mostReviewed = [...questionStats].sort((a, b) => ((b as any).reviewedCount || 0) - ((a as any).reviewedCount || 0)).slice(0, 5).filter(a => (a as any).reviewedCount > 0);
  const confusingQuestions = [...questionStats]
    .filter(q => (q as any).mostCommonWrong)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 5);


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const getBackPath = () => {
    const from = searchParams.get("from");
    if (from === "dashboard") return "/dashboard";
    if (from === "edit" && examId) return `/exam/${examId}`;
    if (from === "marketplace") return "/marketplace";
    return "/dashboard"; // Default fallback
  };



  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate(getBackPath())}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{examId ? "Exam Analytics" : "My Performance"}</h1>
              {examId && <p className="text-muted-foreground">{examName}</p>}
            </div>
          </div>


        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Total Attempts</h3>
            </div>
            <p className="text-3xl font-bold">{totalAttempts}</p>
          </Card>

          {examId && (
            <>
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  <h3 className="font-semibold">Total Unique Students</h3>
                </div>
                <p className="text-3xl font-bold">{uniqueStudents}</p>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-semibold">Completion</h3>
                </div>
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">{Math.round(completionRate)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{submittedCount} / {totalAttempts} started</p>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-pink-500" />
                  <h3 className="font-semibold">Repeaters</h3>
                </div>
                <div className="flex flex-col">
                  <p className="text-3xl font-bold">{repeatersCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">students retook</p>
                </div>
              </Card>
            </>
          )}

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold">Avg Accuracy</h3>
            </div>
            <p className="text-3xl font-bold">
              {avgAccuracy.toFixed(2)}%
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold">Avg Time/Q</h3>
            </div>
            <p className="text-3xl font-bold">
              {avgTimePerQuestion.toFixed(2)}s
            </p>
          </Card>

          {!examId && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Best Score</h3>
              </div>
              <p className="text-3xl font-bold">{bestScore.toFixed(2)}%</p>
            </Card>
          )}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{examId ? "Accuracy Trend (Daily Avg)" : "Accuracy Trend"}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={accuracyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={examId ? "date" : "attempt"} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="hsl(var(--primary))"
                  name="Accuracy %"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Section-wise Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sectionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgAccuracy" fill="#8884d8" name="Avg Accuracy %" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>


        {/* Advanced Analytics Charts (Creator Only) */}
        {examId && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <div>
                  <h3 className="text-lg font-semibold">Performance Over Time</h3>
                  <p className="text-sm text-muted-foreground mb-4">Daily attempts and average scores</p>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={accuracyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="attempts"
                        stroke="#8884d8"
                        name="Attempts"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="accuracy"
                        stroke="#82ca9d"
                        name="Avg Score %"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#fff", strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <div>
                  <h3 className="text-lg font-semibold">Score Distribution</h3>
                  <p className="text-sm text-muted-foreground mb-4">How students are performing</p>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="range"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip cursor={{ fill: 'transparent' }} />
                      <Bar
                        dataKey="count"
                        fill="#8884d8"
                        radius={[4, 4, 0, 0]}
                        barSize={60}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Most Skipped</h3>
                {mostSkipped.length === 0 ? <p className="text-sm text-muted-foreground">No data available.</p> : (
                  <div className="space-y-4">
                    {mostSkipped.map(q => (
                      <div key={q.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex gap-2">
                          <span className="font-medium">Q{q.q_no}</span>
                          <span className="text-muted-foreground truncate max-w-[150px]" dangerouslySetInnerHTML={{ __html: q.text.substring(0, 30) + '...' }} />
                        </div>
                        <Badge variant="secondary">{q.unansweredCount} skipped</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Most Reviewed</h3>
                {mostReviewed.length === 0 ? <p className="text-sm text-muted-foreground">No questions marked for review.</p> : (
                  <div className="space-y-4">
                    {mostReviewed.map(q => (
                      <div key={q.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex gap-2">
                          <span className="font-medium">Q{q.q_no}</span>
                          <span className="text-muted-foreground truncate max-w-[150px]" dangerouslySetInnerHTML={{ __html: q.text.substring(0, 30) + '...' }} />
                        </div>
                        <Badge variant="outline">{q.reviewedCount} times</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h3 className="text-md font-semibold mb-4">Common Misconceptions</h3>
                {confusingQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No data available.</p> : (
                  <div className="space-y-4">
                    {confusingQuestions.map(q => (
                      <div key={q.id} className="flex flex-col gap-1 text-sm border-b pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between">
                          <span className="font-medium">Q{q.q_no}</span>
                          <Badge variant="destructive" className="ml-auto text-xs">{q.wrongCount} wrongs</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Most chose wrong option: <span className="font-medium text-red-500">{q.mostCommonWrong}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {/* Section Analytics (Creator Only) */}
        {examId && sectionData.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Section Analytics</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-2 py-3 text-left w-[20%] rounded-tl-lg">Section Name</th>
                    <th className="px-2 py-3 text-center w-[15%]">Section Snippet</th>

                    <th className="px-2 py-3 text-center w-[20%]">Avg Accuracy</th>
                    <th className="px-2 py-3 text-center w-[10%]">Avg Time/Q</th>
                    <th className="px-2 py-3 text-center w-[20%] rounded-tr-lg">Time (Avg / Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sectionData.map((section: any) => (
                    <tr key={section.name} className="hover:bg-muted/30">
                      <td className="px-2 py-3 font-medium">{section.name}</td>
                      <td className="px-2 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSectionName(section.name)}>
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </td>

                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${section.avgAccuracy >= 70 ? 'bg-green-500' : section.avgAccuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${section.avgAccuracy}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-9 text-right">{section.avgAccuracy.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {section.avgTime.toFixed(1)}s
                      </td>
                      <td className="px-2 py-3 text-center text-muted-foreground">
                        {(() => {
                          const avgSeconds = section.totalTimeSpent / section.totalAttempts;
                          const mins = Math.floor(avgSeconds / 60);
                          const secs = Math.round(avgSeconds % 60);
                          return `${mins} mins ${secs} sec / ${section.timeLimit} mins`;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Question-Level Analytics (Creator Only) */}
        {examId && questionStats.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Question Analysis</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-2 py-3 text-center w-[80px] rounded-tl-lg">Q. No</th>
                    <th className="px-2 py-3 text-center w-[150px]">Question Snippet</th>

                    <th className="px-2 py-3 text-center w-[30%]">Accuracy</th>
                    <th className="px-2 py-3 text-center w-[15%] rounded-tr-lg">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(
                    questionStats.reduce((groups: any, q) => {
                      const group = groups[q.sectionName] || [];
                      group.push(q);
                      groups[q.sectionName] = group;
                      return groups;
                    }, {})
                  ).sort((a: any, b: any) => {
                    const orderA = a[1][0]?.sectionSortOrder || 0;
                    const orderB = b[1][0]?.sectionSortOrder || 0;
                    return orderA - orderB;
                  }).map(([sectionName, questions]: [string, any]) => (
                    <Fragment key={sectionName}>
                      <tr
                        className="bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleSection(sectionName)}
                      >
                        <td colSpan={4} className="px-4 py-2 font-semibold text-primary">
                          <div className="flex items-center gap-2">
                            {collapsedSections.has(sectionName) ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            {sectionName}
                            <Badge variant="outline" className="ml-2 text-xs font-normal">
                              {questions.length} questions
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {!collapsedSections.has(sectionName) && questions.sort((a: any, b: any) => a.q_no - b.q_no).map((q: QuestionStats, idx: number) => (
                        <tr key={q.id} className="hover:bg-muted/30">
                          <td className="px-2 py-3 font-medium text-center">{q.q_no}</td>
                          <td className="px-2 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                              <Eye className="w-4 h-4 text-primary" />
                            </Button>
                          </td>

                          <td className="px-2 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${q.accuracy >= 70 ? 'bg-green-500' : q.accuracy >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${q.accuracy}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-9 text-right">{q.accuracy.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center text-muted-foreground">
                            {q.avgTime.toFixed(1)}s
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Dialog open={!!selectedSectionName} onOpenChange={(open) => !open && setSelectedSectionName(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Section Snippet: {selectedSectionName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-8">
              {questionStats
                .filter(q => q.sectionName === selectedSectionName)
                .map((question, qIdx) => (
                  <div key={question.id} className="border rounded-lg p-6 bg-card">
                    <h4 className="font-semibold mb-4 text-primary">Question {qIdx + 1}</h4>
                    {question.imageUrl && (
                      <div className="mb-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                        <img
                          src={question.imageUrl}
                          alt={`Question ${question.q_no}`}
                          className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                        />
                      </div>
                    )}
                    <div
                      className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert mb-4"
                      dangerouslySetInnerHTML={{ __html: question.text }}
                    />

                    {question.options && (
                      <div className="space-y-2">
                        <p className="font-semibold text-sm text-muted-foreground">Options:</p>
                        {((Array.isArray(question.options) ? question.options : []) as string[]).map((option, oIdx) => {
                          const correctVal = question.correctAnswer;
                          const normalize = (val: any) => String(val).trim().toLowerCase();
                          let isCorrect = false;

                          if (Array.isArray(correctVal)) {
                            isCorrect = correctVal.some((c: any) => normalize(c) === normalize(option));
                          } else if (typeof correctVal === 'object' && correctVal !== null) {
                            const val = (correctVal as any).answer || (correctVal as any).value;
                            isCorrect = normalize(val) === normalize(option);
                          } else {
                            isCorrect = normalize(correctVal) === normalize(option);
                          }

                          return (
                            <div
                              key={oIdx}
                              className={`flex items-center gap-3 p-3 rounded-md border ${isCorrect ? "bg-green-50 border-green-500 dark:bg-green-950" : "bg-background border-border"}`}
                            >
                              <span className="font-medium text-sm">{String.fromCharCode(65 + oIdx)})</span>
                              <span className="flex-1">{option}</span>
                              {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="bg-muted p-3 rounded-md mt-4">
                      <span className="font-semibold">Correct Answer: </span>
                      <span className="text-green-600 font-medium">
                        {Array.isArray(question.correctAnswer)
                          ? question.correctAnswer.join(", ")
                          : (typeof question.correctAnswer === 'object'
                            ? (question.correctAnswer.answer || JSON.stringify(question.correctAnswer))
                            : String(question.correctAnswer))}
                      </span>
                    </div>
                  </div>
                ))}
              {questionStats.filter(q => q.sectionName === selectedSectionName).length === 0 && (
                <p className="text-muted-foreground text-center">No questions found for this section.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedQuestion} onOpenChange={(open) => !open && setSelectedQuestion(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Question Details</DialogTitle>
            </DialogHeader>
            {selectedQuestion && (
              <div className="space-y-4">
                {selectedQuestion.imageUrl && (
                  <div className="mb-4 border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 flex justify-center">
                    <img
                      src={selectedQuestion.imageUrl}
                      alt="Question"
                      className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                    />
                  </div>
                )}
                <div
                  className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selectedQuestion.text }}
                />

                {selectedQuestion.options && (
                  <div className="space-y-2 mt-4">
                    <p className="font-semibold text-sm text-muted-foreground">Options:</p>
                    {((Array.isArray(selectedQuestion.options) ? selectedQuestion.options : []) as string[]).map((option, idx) => {
                      const correctVal = selectedQuestion.correctAnswer;
                      const normalize = (val: any) => String(val).trim().toLowerCase();
                      let isCorrect = false;

                      if (Array.isArray(correctVal)) {
                        isCorrect = correctVal.some((c: any) => normalize(c) === normalize(option));
                      } else if (typeof correctVal === 'object' && correctVal !== null) {
                        const val = (correctVal as any).answer || (correctVal as any).value;
                        isCorrect = normalize(val) === normalize(option);
                      } else {
                        isCorrect = normalize(correctVal) === normalize(option);
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 p-3 rounded-md border ${isCorrect ? "bg-green-50 border-green-500 dark:bg-green-950" : "bg-background border-border"}`}
                        >
                          <span className="font-medium text-sm">{String.fromCharCode(65 + idx)})</span>
                          <span className="flex-1">{option}</span>
                          {isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="bg-muted p-3 rounded-md">
                  <span className="font-semibold">Correct Answer: </span>
                  <span className="text-green-600 font-medium">
                    {Array.isArray(selectedQuestion.correctAnswer)
                      ? selectedQuestion.correctAnswer.join(", ")
                      : (typeof selectedQuestion.correctAnswer === 'object'
                        ? (selectedQuestion.correctAnswer.answer || JSON.stringify(selectedQuestion.correctAnswer))
                        : String(selectedQuestion.correctAnswer))}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Recent Attempts List (Student Only) */}
        {!examId && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">History</h3>
            <div className="space-y-3">
              {attempts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No attempts recorded yet.</p>
              ) : (() => {
                // Group attempts by exam (based on exam name and date for simplicity)
                const examGroups = attempts.reduce((groups: any, attempt) => {
                  const examId = attempt.section.exam.name;
                  const date = new Date(attempt.submitted_at).toLocaleDateString();
                  const key = `${examId}_${date}`;

                  if (!groups[key]) {
                    groups[key] = {
                      examName: attempt.section.exam.name,
                      date: date,
                      sections: [],
                      totalScore: 0,
                      totalQuestions: 0,
                      totalTime: 0,
                      firstAttemptId: attempt.id
                    };
                  }
                  groups[key].sections.push(attempt.section.name);
                  groups[key].totalScore += attempt.score;
                  groups[key].totalQuestions += attempt.total_questions;
                  groups[key].totalTime += (attempt.time_spent_seconds || 0);

                  return groups;
                }, {});

                return Object.values(examGroups).map((group: any) => (
                  <div
                    key={group.firstAttemptId}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => navigate(`/exam/review/${group.firstAttemptId}`)}
                  >
                    <div>
                      <p className="font-semibold">{group.examName}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.sections.length} section{group.sections.length > 1 ? 's' : ''} • {group.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">
                          {group.totalScore}/{group.totalQuestions}
                        </p>
                        <Badge variant="secondary">
                          {group.totalQuestions > 0
                            ? ((group.totalScore / group.totalQuestions) * 100).toFixed(1)
                            : 0}%
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {Math.floor(group.totalTime / 60)}m
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
