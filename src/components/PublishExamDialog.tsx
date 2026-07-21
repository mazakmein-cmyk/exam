import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LangError {
  type:
    | "no_sections"
    | "no_questions"
    | "blank_questions"
    | "invalid_question"
    | "section_missing_in_lang"
    | "question_count_mismatch"
    | "empty_text_parity"
    | "option_count_mismatch"
    | "answer_type_mismatch"
    | "not_linked_to_primary";
  sectionName: string;
  sectionId: string;
  qNos: number[];
  detail?: string;
}

interface PublishExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  examName: string;
  isPublishing: boolean;
  onSuccess: (isPublishing: boolean, publishedLanguages: string[]) => void;
  onNavigateToQuestion?: (sectionId: string, qNo: number) => void;
}

export default function PublishExamDialog({
  open,
  onOpenChange,
  examId,
  examName,
  isPublishing,
  onSuccess,
  onNavigateToQuestion,
}: PublishExamDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [publishLangErrors, setPublishLangErrors] = useState<Record<string, LangError[]>>({});
  const [supportedLangsToPublish, setSupportedLangsToPublish] = useState<string[]>([]);
  const [selectedLangsForPublish, setSelectedLangsForPublish] = useState<string[]>([]);
  const [validating, setValidating] = useState(true);
  // marksWarning carries severity so the dialog can render an error-level
  // banner (red) when the exam has NO marking scheme configured at any layer,
  // distinct from the amber warning shown for partial coverage.
  const [marksWarning, setMarksWarning] = useState<{ severity: "warning" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      if (isPublishing) {
        validateExam();
      } else {
        setValidating(false);
      }
    }
  }, [open, isPublishing, examId]);

  const validateExam = async () => {
    setValidating(true);
    setPublishLangErrors({});
    setSupportedLangsToPublish([]);
    setSelectedLangsForPublish([]);

    try {
      const { data: examData } = await supabase
        .from("exams")
        .select("supported_languages, published_languages, primary_language")
        .eq("id", examId)
        .single();

      const supportedLangs = (examData as any)?.supported_languages || ["en"];
      setSupportedLangsToPublish(supportedLangs);

      const { data: sections, error: sectionsError } = await supabase
        .from("sections")
        .select("id, name, language, section_group_id, sort_order")
        .eq("exam_id", examId);

      if (sectionsError) throw sectionsError;

      if (!sections || sections.length === 0) {
        toast({
          title: "Cannot Publish Exam",
          description: "This exam has no sections. Please add at least one section with questions.",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      const errorsMap: Record<string, LangError[]> = {};

      for (const lang of supportedLangs) {
        const langErrors: LangError[] = [];
        const langSections = sections.filter((s: any) => s.language === lang);

        if (langSections.length === 0) {
          langErrors.push({ type: "no_sections", sectionName: "", sectionId: "", qNos: [] });
        } else {
          for (const sec of langSections) {
            const { count, error: countError } = await supabase
              .from("parsed_questions")
              .select("id", { count: "exact", head: true })
              .eq("section_id", sec.id);

            if (countError) throw countError;
            if (count === 0) {
              langErrors.push({ type: "no_questions", sectionName: sec.name, sectionId: sec.id, qNos: [] });
            }

            const { data: secQs } = await supabase
              .from("parsed_questions")
              .select("q_no, text, image_url, image_urls, options, answer_type, correct_answer")
              .eq("section_id", sec.id)
              .order("q_no", { ascending: true });

            // A question is only truly blank if it has no image either
            const trulyBlankQs = (secQs || []).filter(
              (q: any) => {
                const stripped = (q.text || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
                return stripped === "" && !q.image_url && (!Array.isArray(q.image_urls) || q.image_urls.length === 0);
              }
            );

            if (trulyBlankQs.length > 0) {
              langErrors.push({
                type: "blank_questions",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: trulyBlankQs.map((q: any) => q.q_no),
              });
            }

            const primaryLang = (examData as any)?.primary_language || "en";
            const isPrimary = lang === primaryLang;

            const invalidQs = (secQs || []).filter((q: any) => {
              const at = q.answer_type;
              if (!at) return true;
              if (at === "subjective") return false;

              if (at === "single" || at === "multi") {
                const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
                if (!hasOptions) return true;
              }

              if (isPrimary) {
                const ca = q.correct_answer;
                const hasCorrectAnswer = ca !== null && ca !== undefined && ca !== "" && (!Array.isArray(ca) || ca.length > 0);
                if (!hasCorrectAnswer) return true;
              }

              return false;
            });

            if (invalidQs.length > 0) {
              langErrors.push({
                type: "invalid_question",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: invalidQs.map((q: any) => q.q_no),
              });
            }
          }
        }

        errorsMap[lang] = langErrors;
      }

      // ── Per-language parity gate (non-primary must mirror primary) ──
      // For each non-primary language, verify section + question parity
      // with primary: same sections (linked by section_group_id), same
      // question counts, non-empty text, matching options/answer_type, and
      // proper question_group_id linkage. Failures join the same channel
      // as existing errors so the UI surfaces them without restructuring.
      const primaryLangForParity = (examData as any)?.primary_language || "en";
      if (supportedLangs.length > 1) {
        const allSecIds = (sections as any[]).map((s) => s.id);
        const { data: allQs } = await supabase
          .from("parsed_questions")
          .select(
            "id, section_id, q_no, text, options, answer_type, question_group_id, image_url, image_urls"
          )
          .in("section_id", allSecIds)
          .order("q_no", { ascending: true });

        const qsBySection = new Map<string, any[]>();
        for (const q of (allQs || []) as any[]) {
          const arr = qsBySection.get(q.section_id) || [];
          arr.push(q);
          qsBySection.set(q.section_id, arr);
        }

        const primarySections = (sections as any[]).filter(
          (s) => s.language === primaryLangForParity
        );

        for (const lang of supportedLangs) {
          if (lang === primaryLangForParity) continue;
          const langName = getLangName(lang);
          const langErrors = errorsMap[lang] || [];

          for (const primSec of primarySections) {
            const groupId = primSec.section_group_id;
            const secSec = groupId
              ? (sections as any[]).find(
                  (s) => s.language === lang && s.section_group_id === groupId
                )
              : undefined;

            if (!secSec) {
              langErrors.push({
                type: "section_missing_in_lang",
                sectionName: primSec.name,
                sectionId: primSec.id,
                qNos: [],
              });
              continue;
            }

            const primQs = qsBySection.get(primSec.id) || [];
            const secQs = qsBySection.get(secSec.id) || [];

            if (primQs.length !== secQs.length) {
              langErrors.push({
                type: "question_count_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: [],
                detail: `has ${secQs.length} question${secQs.length === 1 ? "" : "s"} in ${langName}; primary has ${primQs.length}`,
              });
            }

            const overlap = Math.min(primQs.length, secQs.length);
            const emptyTextQNos: number[] = [];
            const optionMismatchQNos: number[] = [];
            const answerTypeMismatchQNos: number[] = [];
            const notLinkedQNos: number[] = [];

            for (let i = 0; i < overlap; i++) {
              const p = primQs[i];
              const s = secQs[i];

              if (!s.question_group_id || s.question_group_id !== p.question_group_id) {
                notLinkedQNos.push(s.q_no);
              }
              const sText = typeof s.text === "string" ? s.text : "";
              const stripped = sText.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
              const sHasImage =
                !!s.image_url ||
                (Array.isArray(s.image_urls) && s.image_urls.length > 0);
              if (stripped === "" && !sHasImage) {
                emptyTextQNos.push(s.q_no);
              }
              const pOptsLen = Array.isArray(p.options) ? p.options.length : 0;
              const sOptsLen = Array.isArray(s.options) ? s.options.length : 0;
              if (pOptsLen !== sOptsLen) {
                optionMismatchQNos.push(s.q_no);
              }
              if (p.answer_type !== s.answer_type) {
                answerTypeMismatchQNos.push(s.q_no);
              }
            }

            if (emptyTextQNos.length > 0) {
              langErrors.push({
                type: "empty_text_parity",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: emptyTextQNos,
              });
            }
            if (optionMismatchQNos.length > 0) {
              langErrors.push({
                type: "option_count_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: optionMismatchQNos,
                detail: `Q${optionMismatchQNos.join(", Q")} ${optionMismatchQNos.length > 1 ? "have" : "has"} a different option count vs primary`,
              });
            }
            if (answerTypeMismatchQNos.length > 0) {
              langErrors.push({
                type: "answer_type_mismatch",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: answerTypeMismatchQNos,
                detail: `Q${answerTypeMismatchQNos.join(", Q")} ${answerTypeMismatchQNos.length > 1 ? "have" : "has"} a different answer type vs primary`,
              });
            }
            if (notLinkedQNos.length > 0) {
              langErrors.push({
                type: "not_linked_to_primary",
                sectionName: primSec.name,
                sectionId: secSec.id,
                qNos: notLinkedQNos,
                detail: `Q${notLinkedQNos.join(", Q")} not linked to primary (question_group_id mismatch)`,
              });
            }
          }

          errorsMap[lang] = langErrors;
        }
      }

      setPublishLangErrors(errorsMap);

      const currentlyPublished = (examData as any)?.published_languages || [];
      setSelectedLangsForPublish(currentlyPublished.length > 0 ? currentlyPublished : []);

      try {
        const primaryLang = (examData as any)?.primary_language || "en";
        const isMultiLang = supportedLangs.length > 1;
        const primarySections = isMultiLang
          ? (sections || []).filter((s: any) => s.language === primaryLang)
          : (sections || []);
        const allSectionIds = primarySections.map((s: any) => s.id);
        const { data: allQsData } = await supabase
          .from("parsed_questions")
          .select("id, section_id")
          .in("section_id", allSectionIds);
        if (allQsData && allQsData.length > 0) {
          // A question is "scored" if any of these exist:
          //   - exam-level default      (exam_scoring_defaults row)
          //   - section-level override  (section_scoring_defaults row for its section)
          //   - question-level override (question_scoring_config row for itself)
          // Previously this code only checked question-level overrides, so an exam
          // with a perfectly fine exam-level default looked "0% scored" and silently
          // showed no warning — and an exam with no marks anywhere also showed
          // nothing, letting creators publish completely unscored exams.
          const [examDefaultRes, sectionDefaultsRes, questionConfigsRes] = await Promise.all([
            supabase
              .from("exam_scoring_defaults" as any)
              .select("id")
              .eq("exam_id", examId)
              .maybeSingle(),
            allSectionIds.length > 0
              ? supabase
                  .from("section_scoring_defaults" as any)
                  .select("section_id")
                  .in("section_id", allSectionIds)
              : Promise.resolve({ data: [] as any[] } as any),
            supabase
              .from("question_scoring_config" as any)
              .select("question_id")
              .in("question_id", allQsData.map((q: any) => q.id)),
          ]);

          const hasExamDefault = !!(examDefaultRes as any).data;
          const sectionIdsWithConfig = new Set<string>(
            (((sectionDefaultsRes as any).data) || []).map((r: any) => r.section_id)
          );
          const questionIdsWithConfig = new Set<string>(
            (((questionConfigsRes as any).data) || []).map((r: any) => r.question_id)
          );

          let unscored = 0;
          for (const q of allQsData as any[]) {
            const hasQ = questionIdsWithConfig.has(q.id);
            const hasS = sectionIdsWithConfig.has(q.section_id);
            if (!hasQ && !hasS && !hasExamDefault) unscored++;
          }

          if (unscored === allQsData.length) {
            setMarksWarning({
              severity: "error",
              text:
                "No marking scheme is configured for this exam. Students will submit and see their results without any marks.",
            });
          } else if (unscored > 0) {
            setMarksWarning({
              severity: "warning",
              text: `${unscored} of ${allQsData.length} questions are unscored and will count as 0 marks.`,
            });
          } else {
            setMarksWarning(null);
          }
        }
      } catch {
        // Non-fatal
      }
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.message || "Failed to validate exam",
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    if (isPublishing && selectedLangsForPublish.length === 0) {
      toast({
        title: "No Languages Selected",
        description: "Please select at least one language to publish.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const payloadLangs = isPublishing ? selectedLangsForPublish : [];

      const { error } = await supabase
        .from("exams")
        .update({ is_published: isPublishing, published_languages: payloadLangs })
        .eq("id", examId);

      if (error) throw error;

      toast({
        title: isPublishing ? "Published" : "Unpublished",
        description: isPublishing
          ? `Exam is now visible in Marketplace${payloadLangs.length > 1 ? ` in ${payloadLangs.length} languages` : ""}`
          : "Exam removed from Marketplace",
      });

      onSuccess(isPublishing, payloadLangs);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update publish status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getLangName = (code: string) => {
    if (code === "en") return "English";
    if (code === "hi") return "Hindi";
    return code.toUpperCase();
  };

  const getErrorMessage = (err: LangError, langName: string): string => {
    if (err.type === "no_sections") return `No sections set up for ${langName} yet`;
    if (err.type === "no_questions") return `"${err.sectionName}" has no questions yet`;
    if (err.type === "blank_questions") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "are" : "is"} missing ${langName} text`;
    }
    if (err.type === "invalid_question") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "are" : "is"} missing correct answer or options`;
    }
    if (err.type === "section_missing_in_lang") {
      return `Section "${err.sectionName}" missing in ${langName}`;
    }
    if (err.type === "question_count_mismatch") {
      return `"${err.sectionName}" ${err.detail ?? "— question count differs from primary"}`;
    }
    if (err.type === "empty_text_parity") {
      const qList = err.qNos.map((n) => `Q${n}`).join(", ");
      return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "have" : "has"} empty text in ${langName}`;
    }
    if (err.type === "option_count_mismatch" || err.type === "answer_type_mismatch" || err.type === "not_linked_to_primary") {
      return `"${err.sectionName}" — ${err.detail ?? "parity issue vs primary"}`;
    }
    return "Validation issue";
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isPublishing ? "Publish Exam" : "Unpublish Exam"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="mt-2 outline-none">
              {validating ? (
                <div className="flex justify-center items-center py-6 text-muted-foreground">
                  Evaluating exam content...
                </div>
              ) : isPublishing ? (
                <div className="space-y-4 text-sm text-muted-foreground outline-none">
                  <p>Select the languages you want to publish for "{examName}".</p>
                  {marksWarning && (
                    <div
                      className={
                        marksWarning.severity === "error"
                          ? "flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-400"
                          : "flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400"
                      }
                    >
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <span>{marksWarning.text}</span>
                    </div>
                  )}
                  <div className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <span className="font-semibold text-foreground">Select All Valid</span>
                      <Switch
                        checked={
                          selectedLangsForPublish.length > 0 &&
                          selectedLangsForPublish.length ===
                            supportedLangsToPublish.filter((l) => publishLangErrors[l]?.length === 0).length
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLangsForPublish(
                              supportedLangsToPublish.filter((l) => publishLangErrors[l]?.length === 0)
                            );
                          } else {
                            setSelectedLangsForPublish([]);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-4">
                      {supportedLangsToPublish.map((lang) => {
                        const hasErrors = publishLangErrors[lang] && publishLangErrors[lang].length > 0;
                        const langName = getLangName(lang);

                        return (
                          <div key={lang} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={hasErrors ? "text-destructive font-medium" : "text-foreground"}>
                                  {langName}
                                </span>
                                {hasErrors && (
                                  <span className="text-xs bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded-full">
                                    {publishLangErrors[lang].length} issue
                                    {publishLangErrors[lang].length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                              <Switch
                                checked={selectedLangsForPublish.includes(lang)}
                                disabled={hasErrors}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedLangsForPublish((prev) => [...prev, lang]);
                                  } else {
                                    setSelectedLangsForPublish((prev) => prev.filter((l) => l !== lang));
                                  }
                                }}
                              />
                            </div>
                            {hasErrors && (
                              <div className="space-y-2 rounded-md bg-red-50 border border-red-200 p-3">
                                {publishLangErrors[lang].map((err, i) => (
                                  <div key={i} className="flex items-start justify-between gap-3">
                                    <span className="text-xs text-red-700 leading-relaxed">
                                      {getErrorMessage(err, langName)}
                                    </span>
                                    {(err.type === "blank_questions" || err.type === "invalid_question") && onNavigateToQuestion && (
                                      <button
                                        type="button"
                                        className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800 underline whitespace-nowrap"
                                        onClick={() => {
                                          onOpenChange(false);
                                          onNavigateToQuestion(err.sectionId, err.qNos[0]);
                                        }}
                                      >
                                        Go fix →
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="block mt-2">
                  Are you sure you want to unpublish "{examName}"? This will remove the exam from the Marketplace.
                </span>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleExecute}
            disabled={validating || loading}
            className={isPublishing ? "bg-primary" : "bg-orange-500 hover:bg-orange-600"}
          >
            {loading ? "Saving..." : isPublishing ? "Publish" : "Unpublish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
