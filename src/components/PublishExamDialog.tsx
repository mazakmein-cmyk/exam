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
  type: "no_sections" | "no_questions" | "blank_questions";
  sectionName: string;
  sectionId: string;
  qNos: number[];
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
  const [marksWarning, setMarksWarning] = useState<string | null>(null);

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
        .select("id, name, language")
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

            const { data: blankQs } = await supabase
              .from("parsed_questions")
              .select("q_no, image_url, image_urls")
              .eq("section_id", sec.id)
              .eq("text", "")
              .order("q_no", { ascending: true });

            // A question is only truly blank if it has no image either
            const trulyBlankQs = (blankQs || []).filter(
              (q: any) => !q.image_url && (!Array.isArray(q.image_urls) || q.image_urls.length === 0)
            );

            if (trulyBlankQs.length > 0) {
              langErrors.push({
                type: "blank_questions",
                sectionName: sec.name,
                sectionId: sec.id,
                qNos: trulyBlankQs.map((q: any) => q.q_no),
              });
            }
          }
        }

        errorsMap[lang] = langErrors;
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
          .select("id")
          .in("section_id", allSectionIds);
        if (allQsData && allQsData.length > 0) {
          const { data: configData } = await supabase
            .from("question_scoring_config" as any)
            .select("id")
            .in("question_id", allQsData.map((q: any) => q.id));
          const configuredCount = configData?.length ?? 0;
          if (configuredCount > 0 && configuredCount < allQsData.length) {
            setMarksWarning(
              `${allQsData.length - configuredCount} of ${allQsData.length} questions are unscored and will count as 0 marks.`
            );
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
    const qList = err.qNos.map((n) => `Q${n}`).join(", ");
    return `"${err.sectionName}" — ${qList} ${err.qNos.length > 1 ? "are" : "is"} missing ${langName} text`;
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
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400">
                      <span className="shrink-0 mt-0.5">⚠</span>
                      <span>{marksWarning}</span>
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
                                    {err.type === "blank_questions" && onNavigateToQuestion && (
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
