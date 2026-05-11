/**
 * MarksAwardedBadge.tsx — Shows actual marks awarded after submission.
 *
 * Green for positive, red for negative, grey for zero.
 * Used in ExamReview per-question rows.
 */

import { formatMarks } from "@/services/scoringEngine";

interface MarksAwardedBadgeProps {
  marksAwarded: number;
  marksMax?: number;
  showMax?: boolean;
}

export function MarksAwardedBadge({
  marksAwarded,
  marksMax,
  showMax = false,
}: MarksAwardedBadgeProps) {
  const isPositive = marksAwarded > 0;
  const isNegative = marksAwarded < 0;

  let bgClass = "bg-muted text-muted-foreground";
  let prefix = "";

  if (isPositive) {
    bgClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    prefix = "+";
  } else if (isNegative) {
    bgClass = "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    prefix = ""; // negative sign is part of the number
  }

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${bgClass}`}
      title={
        showMax && marksMax !== undefined
          ? `${formatMarks(marksAwarded)} / ${formatMarks(marksMax)} marks`
          : `${formatMarks(marksAwarded)} marks`
      }
    >
      {prefix}
      {formatMarks(marksAwarded)}
      {showMax && marksMax !== undefined && (
        <span className="opacity-60">/{formatMarks(marksMax)}</span>
      )}
    </span>
  );
}

export default MarksAwardedBadge;
