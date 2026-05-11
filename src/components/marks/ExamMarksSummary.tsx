/**
 * ExamMarksSummary.tsx — Marks card for the ExamReview stats section.
 *
 * Shows "Marks: 76 / 100" when marks data is available.
 * Renders nothing if marks data is null (unscored exam).
 */

import { formatMarks } from "@/services/scoringEngine";

interface ExamMarksSummaryProps {
  marksScore: number | null | undefined;
  marksMax: number | null | undefined;
}

export function ExamMarksSummary({
  marksScore,
  marksMax,
}: ExamMarksSummaryProps) {
  if (marksScore === null || marksScore === undefined) return null;

  const percentage =
    marksMax && marksMax > 0
      ? Math.round((marksScore / marksMax) * 100)
      : null;

  const isNegative = marksScore < 0;

  return (
    <div>
      <p className="text-sm text-muted-foreground">Marks</p>
      <p className={`text-2xl font-bold ${isNegative ? "text-red-500" : ""}`}>
        {formatMarks(marksScore)}
        {marksMax !== null && marksMax !== undefined && (
          <span className="text-muted-foreground font-normal">
            /{formatMarks(marksMax)}
          </span>
        )}
      </p>
      {percentage !== null && (
        <p className="text-xs text-muted-foreground">{percentage}%</p>
      )}
    </div>
  );
}

export default ExamMarksSummary;
