import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Download, TrendingUp, Clock, Target } from "lucide-react";
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
  section: {
    name: string;
    exam: {
      name: string;
    };
  };
}

export default function Analytics() {
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttempts();
  }, []);

  const fetchAttempts = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("attempts")
        .select(`
          *,
          section:sections(
            name,
            exam:exams(name)
          )
        `)
        .eq("user_id", user.id)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      setAttempts(data as any);
    } catch (error: any) {
      console.error("Error fetching attempts:", error);
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
    link.setAttribute("download", `exam-analytics-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Success",
      description: "Analytics exported to CSV",
    });
  };

  // Prepare chart data
  const accuracyTrendData = attempts
    .slice()
    .reverse()
    .map((attempt, index) => ({
      attempt: `Attempt ${index + 1}`,
      accuracy: attempt.accuracy_percentage,
      date: new Date(attempt.submitted_at).toLocaleDateString(),
    }));

  const timeTrendData = attempts
    .slice()
    .reverse()
    .map((attempt, index) => ({
      attempt: `Attempt ${index + 1}`,
      avgTime: parseFloat(attempt.avg_time_per_question.toFixed(2)),
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
  const overallStats = {
    totalAttempts: attempts.length,
    avgAccuracy:
      attempts.reduce((sum, a) => sum + a.accuracy_percentage, 0) /
      (attempts.length || 1),
    avgTimePerQuestion:
      attempts.reduce((sum, a) => sum + a.avg_time_per_question, 0) /
      (attempts.length || 1),
    bestScore: Math.max(...attempts.map((a) => a.accuracy_percentage), 0),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">Performance Analytics</h1>
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
            <p className="text-3xl font-bold">{overallStats.totalAttempts}</p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold">Avg Accuracy</h3>
            </div>
            <p className="text-3xl font-bold">
              {overallStats.avgAccuracy.toFixed(1)}%
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold">Avg Time/Q</h3>
            </div>
            <p className="text-3xl font-bold">
              {overallStats.avgTimePerQuestion.toFixed(1)}s
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">Best Score</h3>
            </div>
            <p className="text-3xl font-bold">{overallStats.bestScore.toFixed(1)}%</p>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Accuracy Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={accuracyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="attempt" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Time Improvement</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="attempt" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgTime"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Section-wise Performance */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Section-wise Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgAccuracy" fill="hsl(var(--primary))" name="Avg Accuracy %" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Attempts History */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Attempts History</h3>
          <div className="space-y-3">
            {attempts.map((attempt) => (
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
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
