import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Download, TrendingUp, Clock, Target, Users, BookOpen } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  text: string;
  sectionName: string;
  totalAttempts: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracy: number;
  avgTime: number;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [examName, setExamName] = useState<string>("");
  const [questionStats, setQuestionStats] = useState<QuestionStats[]>([]);

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
        setAttempts((sectionAttempts || []) as any);

        // 3. Get all questions for this exam to build stats
        const { data: questionsData, error: questionsError } = await supabase
          .from("parsed_questions")
          .select(`
            id, text, q_no, 
            section:sections!inner(id, name, exam_id)
          `)
          .eq("section.exam_id", examId);

        if (questionsError) throw questionsError;

        // 4. Get all responses for these attempts
        const attemptIds = (sectionAttempts || []).map(a => a.id);

        if (attemptIds.length > 0) {
          const { data: responsesData, error: responsesError } = await supabase
            .from("responses")
            .select("question_id, is_correct, time_spent_seconds, selected_answer")
            .in("attempt_id", attemptIds);

          if (responsesError) throw responsesError;

          // 5. Calculate per-question stats
          const statsMap = new Map<string, QuestionStats>();

          // Initialize stats for all questions
          questionsData?.forEach((q: any) => {
            statsMap.set(q.id, {
              id: q.id,
              text: q.text,
              sectionName: q.section.name,
              totalAttempts: 0,
              correctCount: 0,
              wrongCount: 0,
              unansweredCount: 0,
              accuracy: 0,
              avgTime: 0
            });
          });

          // Aggregate responses
          responsesData?.forEach((r: any) => {
            const stat = statsMap.get(r.question_id);
            if (stat) {
              stat.totalAttempts++;
              stat.avgTime += r.time_spent_seconds || 0;

              if (r.is_correct === true) stat.correctCount++;
              else if (r.is_correct === false) stat.wrongCount++;
              else stat.unansweredCount++;
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

  const exportToCSV = () => {
    const headers = [
      "Date",
      "Exam",
      "Section",
      "User ID",
      "Score",
      "Total Questions",
      "Accuracy %",
      "Avg Time/Question (s)",
      "Total Time (s)",
    ];

    const rows = attempts.map((attempt) => [
      new Date(attempt.submitted_at).toLocaleDateString(),
      attempt.section.exam.name,
      attempt.section.name,
      attempt.user_id,
      attempt.score,
      attempt.total_questions,
      attempt.accuracy_percentage,
      attempt.avg_time_per_question.toFixed(2),
      attempt.time_spent_seconds,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analytics-${examId ? 'exam-' + examId : 'personal'}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: "Analytics exported to CSV",
    });
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
        accuracy: parseFloat((g.totalAccuracy / g.count).toFixed(1)),
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
      };
    }
    acc[sectionName].totalAttempts++;
    acc[sectionName].totalAccuracy += attempt.accuracy_percentage;
    acc[sectionName].avgAccuracy =
      acc[sectionName].totalAccuracy / acc[sectionName].totalAttempts;
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

          <Button onClick={exportToCSV} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
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
              {avgAccuracy.toFixed(1)}%
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold">Avg Time/Q</h3>
            </div>
            <p className="text-3xl font-bold">
              {avgTimePerQuestion.toFixed(1)}s
            </p>
          </Card>

          {!examId && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                <h3 className="font-semibold">Best Score</h3>
              </div>
              <p className="text-3xl font-bold">{bestScore.toFixed(1)}%</p>
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


        {/* Question-Level Analytics (Creator Only) */}
        {examId && questionStats.length > 0 && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Question Analysis</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Q. No</th>
                    <th className="px-4 py-3">Question Snippet</th>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3 text-center">Attempts</th>
                    <th className="px-4 py-3 text-center">Accuracy</th>
                    <th className="px-4 py-3 text-center rounded-tr-lg">Avg Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {questionStats.map((q, idx) => (
                    <tr key={q.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{idx + 1}</td>
                      <td className="px-4 py-3 max-w-md truncate" title={q.text}>
                        {q.text.replace(/<[^>]*>?/gm, "")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{q.sectionName}</td>
                      <td className="px-4 py-3 text-center">{q.totalAttempts}</td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {q.avgTime.toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Recent Attempts List */}

      </div>
    </div>
  );
}
