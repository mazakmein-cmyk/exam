/**
 * MarksQuestionBadge.tsx — Clean "+4 −1" pill with Radix tooltip
 */

import { type ScoringConfig, formatMarks } from "@/services/scoringEngine";
import { Info } from "lucide-react";
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
  const skipped = formatMarks(config.marks_skipped);
  const pillSize = size === "sm" ? "text-[10px] px-1.5 py-px" : "text-[11px] px-2 py-0.5";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 ${size === "sm" ? "" : "gap-1.5"} cursor-help select-none`}
            aria-label="Marking scheme for this question"
          >
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
            <Info className="h-3 w-3 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[260px] space-y-1">
          <p className="font-semibold">Marking scheme</p>
          <ul className="space-y-0.5">
            <li>
              <span className="text-emerald-600 font-semibold">Correct:</span> +{correct} mark{correct === "1" ? "" : "s"}
            </li>
            <li>
              <span className="text-red-500 font-semibold">Wrong:</span>{" "}
              {config.marks_wrong > 0 ? `−${wrong} (negative marking)` : "No penalty"}
            </li>
            <li>
              <span className="font-semibold">Skipped:</span>{" "}
              {config.marks_skipped > 0 ? `−${skipped}` : "0 (no penalty)"}
            </li>
            {config.mcq_mode === "partial" && (
              <li>
                <span className="font-semibold">Multi-correct:</span> Partial credit ({config.rounding_strategy} rounding)
              </li>
            )}
            {config.mcq_mode === "all_or_nothing" && (
              <li>
                <span className="font-semibold">Multi-correct:</span> All-or-nothing (every correct option needed)
              </li>
            )}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default MarksQuestionBadge;
