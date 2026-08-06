/**
 * AllQuestionsDialog — the whole section on one scroll.
 *
 * The simulator shows one question at a time, which is right for sitting an
 * exam but useless for "wait, what else is in here?". This modal lays out every
 * question in the section with its options, whatever answer is currently
 * recorded, and its palette status; clicking one jumps the simulator to it.
 *
 * Read-only by design — answering still happens in the simulator, so the
 * per-question timer and attempt state have exactly one writer. The same
 * component serves the creator preview and a student's attempt: both run
 * through ExamSimulator, and nothing here depends on which mode is active.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ChevronRight, Check, LayoutList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { getQuestionTypeInfo, renderQuestionHtml, splitPassageContent } from "@/lib/questionContent";
import { cn } from "@/lib/utils";

export type AllQuestionsQuestion = {
  id: string;
  text: string;
  answer_type: string;
  options: any;
  section_label?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
  option_image_urls?: (string | null)[] | null;
};

export type AllQuestionsState = {
  selectedAnswer: any;
  isMarkedForReview: boolean;
  status: "untouched" | "attempted" | "viewed";
};

type AllQuestionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: AllQuestionsQuestion[];
  /** Per-question state keyed by question id; a missing entry reads as untouched. */
  states: Record<string, AllQuestionsState | undefined>;
  currentIndex: number;
  sectionName?: string | null;
  /** Jump the simulator to this question (the dialog closes itself first). */
  onJumpToQuestion: (index: number) => void;
  /** Optional marks pill, so scoring config stays owned by the caller. */
  renderMarksBadge?: (question: AllQuestionsQuestion) => ReactNode;
};

/** Palette status, resolved with the same precedence as the palette itself. */
type StatusKey = "marked" | "attempted" | "viewed" | "untouched";

// Labels mirror the palette legend on purpose — one vocabulary, not two.
const STATUS_META: Record<StatusKey, { label: string; chip: string; dot: string }> = {
  marked: { label: "Marked for Review", chip: "bg-red-500 text-white border-red-500", dot: "bg-red-500" },
  attempted: { label: "Attempted", chip: "bg-green-500 text-white border-green-500", dot: "bg-green-500" },
  viewed: { label: "Viewed", chip: "bg-purple-500 text-white border-purple-500", dot: "bg-purple-500" },
  untouched: { label: "Untouched", chip: "bg-background text-foreground border-border", dot: "bg-background border border-border" },
};

const SUMMARY_ORDER: StatusKey[] = ["attempted", "marked", "viewed", "untouched"];

function statusOf(state: AllQuestionsState | undefined): StatusKey {
  if (!state) return "untouched";
  if (state.isMarkedForReview) return "marked";
  if (state.status === "attempted") return "attempted";
  if (state.status === "viewed") return "viewed";
  return "untouched";
}

function hasOptionsFor(question: AllQuestionsQuestion): boolean {
  return Array.isArray(question.options) && question.options.length > 0;
}

/** Options store the selected index as a string; multi-correct stores an array. */
function isOptionSelected(state: AllQuestionsState | undefined, idx: number): boolean {
  const answer = state?.selectedAnswer;
  if (answer == null || answer === "") return false;
  if (Array.isArray(answer)) return answer.includes(String(idx));
  return String(answer) === String(idx);
}

/** Typed answers (numeric / short answer / essay) shown as-is. */
function typedAnswerOf(state: AllQuestionsState | undefined): string {
  const answer = state?.selectedAnswer;
  if (answer == null) return "";
  return Array.isArray(answer) ? answer.join(", ") : String(answer);
}

/**
 * Whether anything is actually recorded. Kept separate from the status chip:
 * "Marked for Review" wins the colour, so it alone can't tell you whether the
 * question was also answered.
 */
function hasAnswer(state: AllQuestionsState | undefined): boolean {
  const answer = state?.selectedAnswer;
  if (answer == null) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  return String(answer).trim() !== "";
}

const AllQuestionsDialog = ({
  open,
  onOpenChange,
  questions,
  states,
  currentIndex,
  sectionName,
  onJumpToQuestion,
  renderMarksBadge,
}: AllQuestionsDialogProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { counts, answeredCount } = useMemo(() => {
    const tally: Record<StatusKey, number> = { marked: 0, attempted: 0, viewed: 0, untouched: 0 };
    let answered = 0;
    for (const q of questions) {
      const state = states[q.id];
      tally[statusOf(state)] += 1;
      if (hasAnswer(state)) answered += 1;
    }
    return { counts: tally, answeredCount: answered };
  }, [questions, states]);

  // Open on the question the user is actually on — in a 25-question section,
  // landing at Q1 every time means scrolling back to where you were.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      const target = container?.querySelector<HTMLElement>('[data-current="true"]');
      if (container && target) {
        container.scrollTop = Math.max(0, target.offsetTop - container.offsetTop - 8);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, currentIndex]);

  const jump = (index: number) => {
    onOpenChange(false);
    onJumpToQuestion(index);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutList className="h-4 w-4 text-primary" />
            All Questions
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {questions.length}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {sectionName ? `${sectionName} — ` : ""}
            every question in this section. Answering still happens on the question screen; click a question to jump there.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted/40 px-5 py-2 text-xs text-muted-foreground">
          {SUMMARY_ORDER.map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_META[key].dot)} />
              {STATUS_META[key].label}
              <span className="font-semibold text-foreground tabular-nums">{counts[key]}</span>
            </span>
          ))}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {questions.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">This section has no questions yet.</p>
          )}

          {questions.map((question, idx) => {
            const state = states[question.id];
            const statusKey = statusOf(state);
            const status = STATUS_META[statusKey];
            const withOptions = hasOptionsFor(question);
            const typeInfo = getQuestionTypeInfo(question.answer_type, withOptions);
            const { hasPassage, passageHtml, passageImageUrl, questionHtml } = splitPassageContent(question.text);
            const images =
              question.image_urls && question.image_urls.length > 0
                ? question.image_urls
                : question.image_url
                  ? [question.image_url]
                  : [];
            const isCurrent = idx === currentIndex;
            const typedAnswer = withOptions ? "" : typedAnswerOf(state);

            return (
              <div
                key={question.id}
                data-current={isCurrent || undefined}
                className={cn(
                  "overflow-hidden rounded-lg border bg-card transition-colors",
                  isCurrent ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40",
                )}
              >
                {/* Whole strip is a jump target for the mouse; the Open button
                    is the keyboard path (the card body stays selectable text). */}
                <div
                  className="flex cursor-pointer flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2"
                  onClick={() => jump(idx)}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs font-bold tabular-nums",
                      status.chip,
                    )}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {status.label}
                      {statusKey === "marked" && hasAnswer(state) && " · answered"}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">•</span>
                    <span className="text-[11px] text-muted-foreground">{typeInfo.label}</span>
                    {question.section_label && (
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {question.section_label}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        You are here
                      </span>
                    )}
                  </div>
                  {renderMarksBadge && (
                    <span onClick={(e) => e.stopPropagation()}>{renderMarksBadge(question)}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      jump(idx);
                    }}
                  >
                    Open
                    <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-3 p-3">
                  {hasPassage && (passageHtml || passageImageUrl) && (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Passage
                      </p>
                      {passageImageUrl && (
                        <img
                          src={passageImageUrl}
                          alt={`Passage for question ${idx + 1}`}
                          loading="lazy"
                          className="mb-2 max-h-40 w-auto max-w-full rounded border border-border object-contain"
                        />
                      )}
                      {passageHtml && (
                        <div
                          className="prose prose-sm max-h-40 max-w-none overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: renderMathInHtml(passageHtml) }}
                        />
                      )}
                    </div>
                  )}

                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((url, imgIdx) => (
                        <img
                          key={imgIdx}
                          src={url}
                          alt={`Question ${idx + 1} image ${imgIdx + 1}`}
                          loading="lazy"
                          className="max-h-40 w-auto max-w-full rounded border border-border object-contain"
                        />
                      ))}
                    </div>
                  )}

                  {questionHtml ? (
                    <div
                      className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-foreground dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: renderQuestionHtml(questionHtml) }}
                    />
                  ) : (
                    !hasPassage && <p className="text-sm italic text-muted-foreground">No question text.</p>
                  )}

                  {withOptions && (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {(question.options as any[]).map((option, optIdx) => {
                        const selected = isOptionSelected(state, optIdx);
                        const optionImage = question.option_image_urls?.[optIdx];
                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                              selected ? "border-primary bg-primary/5" : "border-border/70",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <div className="min-w-0 flex-1 break-words [&_p]:my-0">
                              {String(option ?? "").trim() !== "" && (
                                <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                              )}
                              {optionImage && (
                                <img
                                  src={optionImage}
                                  alt={`Option ${String.fromCharCode(65 + optIdx)}`}
                                  loading="lazy"
                                  className="mt-1 max-h-24 max-w-full rounded border border-border/60 object-contain"
                                />
                              )}
                            </div>
                            {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!withOptions && (
                    <p className="text-xs text-muted-foreground">
                      {typedAnswer.trim() !== "" ? (
                        <>
                          Your answer:{" "}
                          <span className="font-medium text-foreground break-words">{typedAnswer}</span>
                        </>
                      ) : (
                        "Not answered yet — type your answer on the question screen."
                      )}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{answeredCount}</span> of {questions.length}{" "}
            answered
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AllQuestionsDialog;
