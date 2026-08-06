/**
 * SectionTabs.tsx — the student's way around a paper that allows section
 * switching. Only ever rendered when the exam has `allow_section_switching`
 * on; a locked paper has exactly one reachable section and no tabs to draw.
 *
 * Each tab carries the one number that decides whether a candidate wants to go
 * back to a section: how many of its questions they have answered. A section
 * with everything answered gets a tick, a section holding a marked-for-review
 * question gets a flag dot — both so the last two minutes of the paper can be
 * spent on the right section without opening each one to look.
 */
import { Check, Flag } from "lucide-react";
import { sectionProgress } from "@/lib/examNavigation.js";

type SectionLike = { id: string; name: string };

type Props = {
  sections: SectionLike[];
  activeSectionId: string | null;
  questionsBySection: Record<string, { id: string }[]>;
  questionStates: Record<string, { selectedAnswer?: any; isMarkedForReview?: boolean }>;
  onSelect: (sectionId: string) => void;
  /** "strip" = the sticky bar under the header; "stacked" = inside the mobile sheet. */
  variant?: "strip" | "stacked";
};

export default function SectionTabs({
  sections,
  activeSectionId,
  questionsBySection,
  questionStates,
  onSelect,
  variant = "strip",
}: Props) {
  if (sections.length < 2) return null;

  const stacked = variant === "stacked";

  return (
    <div
      role="tablist"
      aria-label="Exam sections"
      className={
        stacked
          ? "flex flex-col gap-1.5"
          : "flex items-stretch gap-1 overflow-x-auto px-2 sm:px-4"
      }
    >
      {sections.map((s, index) => {
        const questions = questionsBySection[s.id] || [];
        const { answered, marked, total } = sectionProgress(questions, questionStates);
        const isActive = s.id === activeSectionId;
        const isComplete = total > 0 && answered === total;

        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={isActive}
            aria-label={`${s.name}, ${answered} of ${total} answered`}
            onClick={() => onSelect(s.id)}
            className={
              stacked
                ? `flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? "border-primary/50 bg-primary/[0.06]"
                      : "border-border/70 bg-card hover:bg-muted/50"
                  }`
                : `group relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 transition-colors ${
                    isActive
                      ? "border-primary bg-primary/[0.05]"
                      : "border-transparent hover:bg-muted/60"
                  }`
            }
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isComplete
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isComplete && !isActive ? <Check className="h-3 w-3" /> : index + 1}
            </span>

            <span
              className={`truncate text-xs font-semibold ${
                isActive ? "text-foreground" : "text-muted-foreground"
              } ${stacked ? "flex-1" : "max-w-[9rem] sm:max-w-[12rem]"}`}
            >
              {s.name}
            </span>

            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                isComplete
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted/80 text-muted-foreground"
              }`}
            >
              {answered}/{total}
            </span>

            {marked > 0 && (
              <span
                className="shrink-0 text-red-500"
                aria-label={`${marked} marked for review`}
                title={`${marked} marked for review`}
              >
                <Flag className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
