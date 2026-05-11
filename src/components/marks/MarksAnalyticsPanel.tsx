/**
 * MarksAnalyticsPanel.tsx — Marks section for the Analytics page.
 *
 * Only renders if the exam has marks data. Shows:
 * - Overall marks card (avg, best, total possible)
 * - Marks trend chart
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatMarks } from "@/services/scoringEngine";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Attempt {
  id: string;
  marks_score?: number | null;
  marks_max?: number | null;
  submitted_at: string;
  section?: {
    name: string;
  };
}

interface MarksAnalyticsPanelProps {
  attempts: Attempt[];
  examId?: string;
}

export default function MarksAnalyticsPanel({
  attempts,
}: MarksAnalyticsPanelProps) {
  const marksAttempts = useMemo(
    () => attempts.filter((a) => a.marks_score !== null && a.marks_score !== undefined),
    [attempts]
  );

  if (marksAttempts.length === 0) return null;

  const scores = marksAttempts.map((a) => Number(a.marks_score ?? 0));
  const maxMarks = marksAttempts.map((a) => Number(a.marks_max ?? 0));

  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const bestScore = Math.max(...scores);
  const worstScore = Math.min(...scores);
  const maxPossible = maxMarks.length > 0 ? Math.max(...maxMarks) : 0;

  // Trend data
  const trendData = marksAttempts
    .sort(
      (a, b) =>
        new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    )
    .map((a, i) => ({
      attempt: i + 1,
      marks: Number(a.marks_score ?? 0),
      max: Number(a.marks_max ?? 0),
      label: `#${i + 1}`,
    }));

  return (
    <div className="space-y-4 mt-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-1 bg-[#6C3EF4] rounded-full" />
        <h3 className="text-lg font-bold text-foreground">Marks Analysis</h3>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Avg Marks
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {formatMarks(avgScore)}
          </p>
          {maxPossible > 0 && (
            <p className="text-xs text-muted-foreground">
              of {formatMarks(maxPossible)}
            </p>
          )}
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Best Score
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {formatMarks(bestScore)}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Lowest Score
          </p>
          <p className={`text-2xl font-bold mt-1 ${worstScore < 0 ? "text-red-500" : "text-foreground"}`}>
            {formatMarks(worstScore)}
          </p>
        </Card>

        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Total Attempts
          </p>
          <p className="text-2xl font-bold text-foreground mt-1">
            {marksAttempts.length}
          </p>
        </Card>
      </div>

      {/* Marks Trend Chart */}
      {trendData.length > 1 && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Marks Trend
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  fontSize: 12,
                }}
                formatter={(value: number) => [formatMarks(value), "Marks"]}
              />
              <Bar
                dataKey="marks"
                fill="#6C3EF4"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
