import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, TrendingUp, Clock, Target, Users, BookOpen, Eye, CheckCircle2 } from "lucide-react";
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
  updated_at: string;
  user_id: string; // Needed for creator view
  section: {
    name: string;
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
              exam:exams(name)
            )
          `)
          .eq("section.exam_id", examId) // This uses the inner join filter
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false });

        if (attemptsError) throw attemptsError;
        // NOTE: We do NOT setAttempts here yet. We need to correct them first.

        // 3. Get all questions for this exam to build stats
        const { data: questionsData, error: questionsError } = await supabase
          .from("parsed_questions")
          .select(`
            id, text, q_no, correct_answer, answer_type, options, image_url,
            section:sections!inner(id, name, exam_id)
          `)
          .eq("section.exam_id", examId);

        if (questionsError) throw questionsError;

        // 4. Get all responses for these attempts
        const attemptIds = (sectionAttempts || []).map(a => a.id);
        let responsesData: any[] = [];

        if (attemptIds.length > 0) {
          const { data: respData, error: responsesError } = await supabase
            .from("responses")
            .select("question_id, is_correct, time_spent_seconds, selected_answer, attempt_id")
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
            avg_time_per_question: totalQuestions > 0 ? totalTime / totalQuestions : 0
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
              totalAttempts: 0,
              correctCount: 0,
              wrongCount: 0,
              unansweredCount: 0,
              accuracy: 0,
              avgTime: 0,
              correctAnswer: q.correct_answer,
              answerType: q.answer_type,
              options: q.options,
              imageUrl: q.image_url
            });
          });

          const normalize = (val: any) => String(val).trim().toLowerCase();

          // Aggregate responses
          responsesData?.forEach((r: any) => {
            const stat = statsMap.get(r.question_id);
            if (stat) {
              stat.totalAttempts++;
              stat.avgTime += r.time_spent_seconds || 0;

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

              if (isCorrect) stat.correctCount++;
              else if (r.selected_answer === null) stat.unansweredCount++;
              else stat.wrongCount++;
            }
          });

          // Finalize averages
          const finalStats: QuestionStats[] = Array.from(statsMap.values()).map(stat => ({
            ...stat,
            accuracy: stat.totalAttempts > 0 ? (stat.correctCount / stat.totalAttempts) * 100 : 0,
            avgTime: stat.totalAttempts > 0 ? stat.avgTime / stat.totalAttempts : 0
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

  // For Student View: Trend of accuracy over attempts
  // For Creator View: Trend of average accuracy over time (grouped by day)
  const accuracyTrendData = examId
    ? (() => {
      // Group by date
      const grouped = attempts.reduce((acc: any, attempt) => {
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
    : attempts
      .slice()
      .reverse()
      .map((attempt, index) => ({
        attempt: `Attempt ${index + 1}`,
        accuracy: attempt.accuracy_percentage,
        date: new Date(attempt.submitted_at).toLocaleDateString(),
      }));

  // Section-wise performance
  const sectionPerformance = attempts.reduce((acc: any, attempt) => {
    const sectionName = attempt.section.name;
    if (!acc[sectionName]) {
      acc[sectionName] = {
        name: sectionName,
        totalAttempts: 0,
        avgAccuracy: 0,
        totalAccuracy: 0,
        totalTime: 0,
        avgTime: 0,
      };
    }
    acc[sectionName].totalAttempts++;
    acc[sectionName].totalAccuracy += attempt.accuracy_percentage;
    acc[sectionName].totalTime += attempt.time_spent_seconds; // Use total time spent on section
    acc[sectionName].avgAccuracy =
      parseFloat((acc[sectionName].totalAccuracy / acc[sectionName].totalAttempts).toFixed(2));
    acc[sectionName].avgTime =
      acc[sectionName].totalTime / acc[sectionName].totalAttempts;
    return acc;
  }, {});

  const sectionData = Object.values(sectionPerformance);

  // Overall stats
  const totalAttempts = attempts.length;
  // Unique students count (only relevant for Creator View)
  const uniqueStudents = new Set(attempts.map(a => a.user_id)).size;

  const avgAccuracy =
    attempts.reduce((sum, a) => sum + a.accuracy_percentage, 0) /
    (attempts.length || 1);
  const avgTimePerQuestion =
    attempts.reduce((sum, a) => sum + a.avg_time_per_question, 0) /
    (attempts.length || 1);
  const bestScore = Math.max(...attempts.map((a) => a.accuracy_percentage), 0);

  // Score Distribution
  const scoreDistribution = [
    { range: '0-20%', count: 0 },
    { range: '21-40%', count: 0 },
    { range: '41-60%', count: 0 },
    { range: '61-80%', count: 0 },
    { range: '81-100%', count: 0 },
  ];

  attempts.forEach(attempt => {
    const acc = attempt.accuracy_percentage;
    if (acc <= 20) scoreDistribution[0].count++;
    else if (acc <= 40) scoreDistribution[1].count++;
    else if (acc <= 60) scoreDistribution[2].count++;
    else if (acc <= 80) scoreDistribution[3].count++;
    else scoreDistribution[4].count++;
  });


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
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-500" />
                <h3 className="font-semibold">Total Students</h3>
              </div>
              <p className="text-3xl font-bold">{uniqueStudents}</p>
            </Card>
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
                <Bar dataKey="avgAccuracy" fill="hsl(var(--chart-2))" name="Avg Accuracy %" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>


        {/* Advanced Analytics Charts (Creator Only) */}
        {examId && (
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
                    <th className="px-2 py-3 text-center w-[15%]">Total Attempts</th>
                    <th className="px-2 py-3 text-center w-[30%]">Avg Accuracy</th>
                    <th className="px-2 py-3 text-center w-[20%] rounded-tr-lg">Avg Time Taken</th>
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
                      <td className="px-2 py-3 text-center">{section.totalAttempts}</td>
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
                        {Math.floor(section.avgTime / 60)}m {Math.round(section.avgTime % 60)}s
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
                    <th className="px-2 py-3 text-left w-[15%]">Section</th>
                    <th className="px-2 py-3 text-center w-[15%]">Attempts</th>
                    <th className="px-2 py-3 text-center w-[30%]">Accuracy</th>
                    <th className="px-2 py-3 text-center w-[15%] rounded-tr-lg">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {questionStats.map((q, idx) => (
                    <tr key={q.id} className="hover:bg-muted/30">
                      <td className="px-2 py-3 font-medium text-center">{idx + 1}</td>
                      <td className="px-2 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedQuestion(q)}>
                          <Eye className="w-4 h-4 text-primary" />
                        </Button>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">{q.sectionName}</td>
                      <td className="px-2 py-3 text-center">{q.totalAttempts}</td>
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
              ) : (
                attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => navigate(`/exam/review/${attempt.id}`)}
                  >
                    <div>
                      <p className="font-semibold">{attempt.section.exam.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {attempt.section.name} • {new Date(attempt.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-semibold">
                          {attempt.score}/{attempt.total_questions}
                        </p>
                        <Badge variant="secondary">
                          {attempt.accuracy_percentage.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {Math.floor(attempt.time_spent_seconds / 60)}m
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
