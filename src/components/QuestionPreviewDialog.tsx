/**
 * QuestionPreviewDialog — one question, whole, as a candidate would meet it.
 *
 * The editor shows a question in parts: text in one box, images in another,
 * options in a list, the key in a picker. That is right for EDITING and wrong
 * for the question a creator keeps asking — "is this one actually finished?"
 * Answering it meant expanding the row, reading four separate controls, and
 * holding the result in your head.
 *
 * So this is the assembled view: passage, images, question text with its
 * tables and math rendered, every option in order, and — the part the student
 * never sees — which option the answer key marks, stated in the same place.
 *
 * Read-only on purpose. It renders through the SAME helpers as the simulator
 * (renderQuestionHtml, splitPassageContent, renderMathInRichText), so what a
 * creator approves here is what a candidate sits; a second rendering path
 * would be free to drift from the real one, which is the whole failure this
 * dialog exists to prevent.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Eye, AlertCircle } from "lucide-react";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { getQuestionTypeInfo, renderQuestionHtml, splitPassageContent } from "@/lib/questionContent";
import { isOptionFilled } from "@/lib/richText";
import { describeAnswerKey, hasAnswerKey, resolveAnswerIndexes } from "@/lib/answerKey.js";
import { cn } from "@/lib/utils";

export type PreviewQuestion = {
  id: string;
  text: string | null;
  answer_type: string;
  options: any;
  correct_answer: any;
  image_url?: string | null;
  image_urls?: string[] | null;
  option_image_urls?: (string | null)[] | null;
};

export default function QuestionPreviewDialog({
  question,
  label,
  onClose,
}: {
  question: PreviewQuestion | null;
  /** How the row names itself — "Question 2". */
  label: string;
  onClose: () => void;
}) {
  const options: any[] = Array.isArray(question?.options) ? question!.options : [];
  const optionImages: (string | null)[] = Array.isArray(question?.option_image_urls)
    ? question!.option_image_urls!
    : [];
  const hasOptions = options.some((o, i) => isOptionFilled(o, optionImages[i]));
  const typeInfo = getQuestionTypeInfo(question?.answer_type ?? "single", hasOptions);

  const { hasPassage, passageHtml, passageImageUrl, questionHtml } = splitPassageContent(question?.text);

  // The image columns first, in the order the editor shows them.
  const images = [
    ...(question?.image_url ? [question.image_url] : []),
    ...(Array.isArray(question?.image_urls) ? question!.image_urls! : []),
  ].filter(Boolean) as string[];

  const correctIndexes = resolveAnswerIndexes(question?.correct_answer, options);
  const keySet = hasAnswerKey(question?.correct_answer);
  // A key that is set but points at no option is a different problem from no
  // key at all, and the creator has to be able to tell them apart.
  const keyIsDangling = keySet && hasOptions && correctIndexes.size === 0;

  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            {label}
          </DialogTitle>
          <DialogDescription>
            As a candidate sees it — plus the answer key, which they do not. {typeInfo.label}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasPassage && (passageHtml || passageImageUrl) && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Passage
              </p>
              {passageImageUrl && (
                <img
                  src={passageImageUrl}
                  alt={`Passage for ${label}`}
                  loading="lazy"
                  className="mb-2 max-h-64 w-auto max-w-full rounded-lg border border-border object-contain"
                />
              )}
              {passageHtml && (
                <div
                  className="live-prose text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: renderMathInHtml(passageHtml) }}
                />
              )}
            </div>
          )}

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <img
                  key={url + i}
                  src={url}
                  alt={`${label} image ${i + 1}`}
                  loading="lazy"
                  className="max-h-72 w-auto max-w-full rounded-lg border border-border object-contain"
                />
              ))}
            </div>
          )}

          {/* The question itself: tables, lists and math rendered, not stripped.
              `live-prose` is the same table and image styling the live exam
              gives author-supplied HTML, and it scrolls a wide table inside
              its own box rather than widening the dialog. */}
          {questionHtml ? (
            <div className="overflow-x-auto">
              <div
                className="live-prose text-sm text-foreground"
                dangerouslySetInnerHTML={{ __html: renderQuestionHtml(questionHtml) }}
              />
            </div>
          ) : (
            !hasPassage && (
              <p className="text-sm italic text-muted-foreground">
                No question text — this question is its image alone.
              </p>
            )
          )}

          {hasOptions ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option, i) => {
                const isCorrect = correctIndexes.has(i);
                const optionImage = optionImages[i];
                const filled = isOptionFilled(option, optionImage);
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                      isCorrect
                        ? "border-emerald-500/50 bg-emerald-500/[0.07]"
                        : "border-border/70",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
                        isCorrect
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div className="min-w-0 flex-1 break-words [&_p]:my-0">
                      {filled ? (
                        <>
                          {String(option ?? "").trim() !== "" && (
                            <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                          )}
                          {optionImage && (
                            <img
                              src={optionImage}
                              alt={`Option ${String.fromCharCode(65 + i)}`}
                              loading="lazy"
                              className="mt-1 max-h-32 max-w-full rounded border border-border/60 object-contain"
                            />
                          )}
                        </>
                      ) : (
                        <span className="italic text-muted-foreground">Empty option</span>
                      )}
                    </div>
                    {isCorrect && <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* The answer key, always stated in words — a green tint on an option
              is easy to miss, and a numeric question has no option to tint. */}
          <div
            className={cn(
              "rounded-xl border px-3.5 py-2.5 text-sm",
              keySet && !keyIsDangling
                ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                : "border-destructive/40 bg-destructive/[0.04]",
            )}
          >
            {!keySet ? (
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                No correct answer marked — select one before publishing.
              </p>
            ) : keyIsDangling ? (
              <p className="flex items-start gap-2 font-medium text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The answer key is{" "}
                  <span className="font-bold">{describeAnswerKey(question?.correct_answer, options)}</span>, which
                  matches none of the options above — the options were probably edited after the key was set.
                </span>
              </p>
            ) : (
              <p className="text-foreground">
                <span className="font-semibold">Answer key:</span>{" "}
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {describeAnswerKey(question?.correct_answer, options)}
                </span>
              </p>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
