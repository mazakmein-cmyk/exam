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

interface PublishExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  examName: string;
  isPublishing: boolean;
  onSuccess: (isPublishing: boolean, publishedLanguages: string[]) => void;
}

export default function PublishExamDialog({
  open,
  onOpenChange,
  examId,
  examName,
  isPublishing,
  onSuccess,
}: PublishExamDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [publishLangErrors, setPublishLangErrors] = useState<Record<string, string[]>>({});
  const [supportedLangsToPublish, setSupportedLangsToPublish] = useState<string[]>([]);
  const [selectedLangsForPublish, setSelectedLangsForPublish] = useState<string[]>([]);
  const [validating, setValidating] = useState(true);

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
        .select("supported_languages, published_languages")
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

      const errorsMap: Record<string, string[]> = {};
      
      for (const lang of supportedLangs) {
        const langErrors: string[] = [];
        const langSections = sections.filter((s: any) => (s as any).language === lang);
        
        if (langSections.length === 0) {
          langErrors.push(`No sections found.`);
        } else {
          for (const section of langSections) {
            const { count, error: countError } = await supabase
              .from("parsed_questions")
              .select("id", { count: "exact", head: true })
              .eq("section_id", section.id);

            if (countError) throw countError;
            if (count === 0) {
              langErrors.push(`Section "${section.name}" has no questions.`);
            }

            const { data: blankQs } = await supabase
              .from("parsed_questions")
              .select("q_no")
              .eq("section_id", section.id)
              .eq("text", "")
              .order("q_no", { ascending: true });

            if (blankQs && blankQs.length > 0) {
              const qNos = blankQs.map(q => q.q_no).join(", ");
              langErrors.push(`In Section "${section.name}", Question(s) [${qNos}] are blank/untranslated.`);
            }
          }
        }

        errorsMap[lang] = langErrors;
      }

      setPublishLangErrors(errorsMap);
      
      const currentlyPublished = (examData as any)?.published_languages || [];
      setSelectedLangsForPublish(currentlyPublished.length > 0 ? currentlyPublished : []);

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
        .update({
          is_published: isPublishing,
          published_languages: payloadLangs,
        })
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
    if (code === 'en') return 'English';
    if (code === 'hi') return 'Hindi';
    return code.toUpperCase();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPublishing ? "Publish Exam" : "Unpublish Exam"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="mt-2 outline-none">
              {validating ? (
                <div className="flex justify-center items-center py-6 text-muted-foreground">
                  Evaluating exam content...
                </div>
              ) : isPublishing ? (
                <div className="space-y-4 text-sm text-muted-foreground outline-none">
                  <p>Select the languages you want to publish for "{examName}".</p>
                  <div className="rounded-md border p-4 space-y-4">
                    <div className="flex items-center justify-between pb-4 border-b">
                      <span className="font-semibold text-foreground">Select All Valid</span>
                      <Switch 
                        checked={
                          selectedLangsForPublish.length > 0 && 
                          selectedLangsForPublish.length === supportedLangsToPublish.filter(l => publishLangErrors[l]?.length === 0).length
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const validLangs = supportedLangsToPublish.filter(l => publishLangErrors[l]?.length === 0);
                            setSelectedLangsForPublish(validLangs);
                            const skipped = supportedLangsToPublish.filter(l => publishLangErrors[l]?.length > 0);
                            if (skipped.length > 0) {
                              toast({
                                title: "Languages Skipped",
                                description: "Some languages have errors and were not selected.",
                              });
                            }
                          } else {
                            setSelectedLangsForPublish([]);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-3">
                      {supportedLangsToPublish.map((lang) => {
                        const hasErrors = publishLangErrors[lang] && publishLangErrors[lang].length > 0;
                        
                        return (
                          <div key={lang} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className={`${hasErrors ? 'text-destructive font-medium' : 'text-foreground'}`}>
                                {getLangName(lang)} {hasErrors ? "(Errors)" : ""}
                              </span>
                              <Switch 
                                checked={selectedLangsForPublish.includes(lang)}
                                onCheckedChange={(checked) => {
                                  if (checked && hasErrors) {
                                    toast({
                                      title: `Cannot Publish ${getLangName(lang)}`,
                                      description: (
                                        <div className="mt-1 space-y-1">
                                          {publishLangErrors[lang].map((err, i) => (
                                            <p key={i} className="text-xs font-medium">• {err}</p>
                                          ))}
                                        </div>
                                      ),
                                      variant: "destructive"
                                    });
                                    return;
                                  }
                                  if (checked) {
                                    setSelectedLangsForPublish(prev => [...prev, lang]);
                                  } else {
                                    setSelectedLangsForPublish(prev => prev.filter(l => l !== lang));
                                  }
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="block mt-2">Are you sure you want to unpublish "{examName}"? This will remove the exam from the Marketplace.</span>
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
