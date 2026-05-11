/**
 * MarksQuestionBadge.tsx — Clean "+4 −1" pill with Radix tooltip
 */

import { type ScoringConfig, formatMarks } from "@/services/scoringEngine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MarksQuestionBadgeProps {
  config: ScoringConfig | null;
  size?: "sm" | "md";
}

export function MarksQuestionBadge({ config, size = "md" }: MarksQuestionBadgeProps) {
  if (!config) return null;

  const correct = formatMarks(config.marks_correct);
  const wrong = formatMarks(config.marks_wrong);
  const pillSize = size === "sm" ? "text-[10px] px-1.5 py-px" : "text-[11px] px-2 py-0.5";

  const tooltipText = [
    `Correct: +${correct}`,
    `Wrong: −${wrong}`,
    config.marks_skipped > 0 ? `Skipped: −${formatMarks(config.marks_skipped)}` : null,
    config.mcq_mode === "partial" ? `MCQ: Partial credit · ${config.rounding_strategy}` : null,
    config.mcq_mode === "all_or_nothing" ? `MCQ: All-or-nothing` : null,
  ].filter(Boolean).join(" · ");

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 ${size === "sm" ? "" : "gap-1.5"} cursor-default select-none`}>
            <span className={`font-bold text-white bg-emerald-600 rounded-full ${pillSize} tabular-nums leading-tight`}>
              +{correct}
            </span>
            {config.marks_wrong > 0 ? (
              <span className={`font-bold text-white bg-red-500 rounded-full ${pillSize} tabular-nums leading-tight`}>
                −{wrong}
              </span>
            ) : (
              <span className={`font-bold text-muted-foreground bg-muted rounded-full ${pillSize} tabular-nums leading-tight`}>
                0
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default MarksQuestionBadge;
