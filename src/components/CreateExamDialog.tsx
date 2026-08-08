import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TransliterateInput } from "@/components/TransliterateInput";
import { TransliterateTextarea } from "@/components/TransliterateTextarea";
import { Plus, X, Upload, Globe, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import InstructionTemplateAction from "@/components/exam/InstructionTemplateAction";
import GenerateExamInstruction from "@/components/exam/GenerateExamInstruction";
import { rowsForText } from "@/lib/instructionTemplates";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी" },
];

type Section = {
  id: string;
  name: string;
  time_minutes: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExamCreated: () => void;
};

const CreateExamDialog = ({ open, onOpenChange, onExamCreated }: Props) => {
  const [examName, setExamName] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [generalInstruction, setGeneralInstruction] = useState("");
  const [examSpecificInstruction, setExamSpecificInstruction] = useState("");
  const [examCategory, setExamCategory] = useState<string>("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["en"]);
  const [primaryLanguage, setPrimaryLanguage] = useState<string>("en");
  const [sections, setSections] = useState<Section[]>([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionTime, setNewSectionTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const { toast } = useToast();

  // Which language the text fields here are being written in. This dialog has no
  // per-language tabs — it writes one translation — so it is English unless the
  // exam is Hindi-only. Named because the template button has to agree with the
  // textarea about it, or it fills the wrong language.
  const instructionLang =
    selectedLanguages.includes("hi") && !selectedLanguages.includes("en") ? "hi" : "en";

  const toggleLanguage = (langCode: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(langCode)) {
        // Don't allow deselecting the last language
        if (prev.length === 1) {
          toast({
            title: "At least one language required",
            description: "You must select at least one language for the exam.",
            variant: "destructive",
          });
          return prev;
        }
        const updated = prev.filter((l) => l !== langCode);
        // If the removed language was primary, reassign primary to first remaining
        if (primaryLanguage === langCode) {
          setPrimaryLanguage(updated[0]);
        }
        return updated;
      }
      return [...prev, langCode];
    });
  };

  const addSection = () => {
    if (!newSectionName || !newSectionTime) {
      toast({
        title: "Invalid section",
        description: "Please enter both section name and time",
        variant: "destructive",
      });
      return;
    }

    const section: Section = {
      id: crypto.randomUUID(),
      name: newSectionName,
      time_minutes: parseInt(newSectionTime),
    };

    setSections([...sections, section]);
    setNewSectionName("");
    setNewSectionTime("");
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
      return;
    }

    if (!examName) {
      toast({
        title: "Exam name required",
        description: "Please enter an exam name before uploading PDF",
        variant: "destructive",
      });
      return;
    }

    if (sections.length === 0) {
      toast({
        title: "Add sections first",
        description: "Please add at least one section before uploading PDF",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingPdf(true);

      toast({
        title: "Uploading PDF",
        description: "Please wait while we upload and parse your exam...",
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Create exam first
      const { data: exam, error: examError } = await supabase
        .from("exams")
        .insert({
          user_id: user.id,
          name: examName,
          description: examDescription || null,
          instruction: generalInstruction || null,
          exam_instruction: examSpecificInstruction || null,
          // Keyed by the language the text was actually written in. Hardcoding
          // "en" here buried a Hindi-only exam's text under a key its editor
          // never reads — the hi tab rendered empty while the DB held the text.
          description_translations: examDescription ? { [instructionLang]: examDescription } : {},
          instruction_translations: generalInstruction ? { [instructionLang]: generalInstruction } : {},
          exam_instruction_translations: examSpecificInstruction ? { [instructionLang]: examSpecificInstruction } : {},
          exam_category: examCategory || null,
          supported_languages: selectedLanguages,
          primary_language: primaryLanguage,
        })
        .select()
        .single();

      if (examError) throw examError;

      // Upload PDF to storage
      const fileName = `${exam.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("exam-pdfs")
        .getPublicUrl(fileName);

      // Create sections for each language
      for (const lang of selectedLanguages) {
        const sectionsData = sections.map((section, index) => {
          const groupId = `${section.id}`; // Use the client-generated ID as group identifier
          return {
            exam_id: exam.id,
            name: section.name,
            time_minutes: section.time_minutes,
            sort_order: index,
            language: lang,
            section_group_id: groupId,
            // Only assign PDF to the first language (English by default)
            pdf_url: lang === selectedLanguages[0] ? publicUrl : null,
            pdf_name: lang === selectedLanguages[0] ? file.name : null,
            parsing_status: lang === selectedLanguages[0] ? "pending" : null,
          };
        });

        const { data: createdSections, error: sectionsError } = await supabase
          .from("sections")
          .insert(sectionsData)
          .select();

        if (sectionsError) throw sectionsError;

        // Only trigger PDF parsing for the first language
        if (lang === selectedLanguages[0] && createdSections) {
          let parsedCount = 0;
          for (const section of createdSections) {
            const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-pdf", {
              body: {
                sectionId: section.id,
                pdfUrl: publicUrl,
              },
            });

            if (parseError) {
              console.error("Parse-pdf error:", parseError);
              toast({
                title: "Parsing Error",
                description: `Failed to parse PDF for ${section.name}: ${parseError.message}`,
                variant: "destructive",
              });
            } else {
              parsedCount++;
            }
          }

          toast({
            title: "Success!",
            description: `Exam created! ${parsedCount}/${createdSections.length} sections parsed successfully.${selectedLanguages.length > 1 ? ` Remember to add content for other languages.` : ""}`,
          });
        }
      }

      setExamName("");
      setExamCategory("");
      setExamDescription("");
      setGeneralInstruction("");
      setExamSpecificInstruction("");
      setSelectedLanguages(["en"]);
      setPrimaryLanguage("en");
      setSections([]);
      setUploadingPdf(false);
      onOpenChange(false);
      onExamCreated();
    } catch (error: any) {
      console.error("Error uploading PDF:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload PDF",
        variant: "destructive",
      });
      setUploadingPdf(false);
    }
  };

  const handleCreateExam = async () => {
    if (!examName) {
      toast({
        title: "Invalid exam",
        description: "Please enter an exam name",
        variant: "destructive",
      });
      return;
    }

    if (!examCategory) {
      toast({
        title: "Invalid exam",
        description: "Please select an exam category",
        variant: "destructive",
      });
      return;
    }

    if (!examDescription) {
      toast({
        title: "Invalid exam",
        description: "Please enter an exam description",
        variant: "destructive",
      });
      return;
    }

    if (!generalInstruction) {
      toast({
        title: "Invalid exam",
        description: "Please enter general instructions",
        variant: "destructive",
      });
      return;
    }
    if (selectedLanguages.length === 0) {
      toast({
        title: "No language selected",
        description: "Please select at least one language for the exam",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to create an exam",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .insert({
        user_id: user.id,
        name: examName,
        description: examDescription || null,
        instruction: generalInstruction || null,
        exam_instruction: examSpecificInstruction || null,
        // Keyed by instructionLang — see the PDF path above for why.
        description_translations: examDescription ? { [instructionLang]: examDescription } : {},
        instruction_translations: generalInstruction ? { [instructionLang]: generalInstruction } : {},
        exam_instruction_translations: examSpecificInstruction ? { [instructionLang]: examSpecificInstruction } : {},
        exam_category: examCategory || null,
        supported_languages: selectedLanguages,
        primary_language: primaryLanguage,
      })
      .select()
      .single();

    if (examError) {
      toast({
        title: "Error creating exam",
        description: examError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Create sections for each language with linked section_group_id
    if (sections.length > 0) {
      const allSectionsData: any[] = [];

      for (const lang of selectedLanguages) {
        sections.forEach((section, index) => {
          allSectionsData.push({
            exam_id: exam.id,
            name: section.name,
            time_minutes: section.time_minutes,
            sort_order: index,
            language: lang,
            section_group_id: section.id, // Use the client-generated UUID as group ID
          });
        });
      }

      const { error: sectionsError } = await supabase
        .from("sections")
        .insert(allSectionsData);

      if (sectionsError) {
        toast({
          title: "Error creating sections",
          description: sectionsError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
    }

    toast({
      title: "Success!",
      description: `Exam created successfully${selectedLanguages.length > 1 ? ` in ${selectedLanguages.length} languages` : ""}`,
    });

    setExamName("");
    setExamCategory("");
    setExamDescription("");
    setGeneralInstruction("");
    setExamSpecificInstruction("");
    setSelectedLanguages(["en"]);
    setPrimaryLanguage("en");
    setSections([]);
    setLoading(false);
    onOpenChange(false);
    onExamCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-background">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-bold">
            Create New Exam
          </DialogTitle>
          <DialogDescription className="text-base">
            Configure your exam details and sections below.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* Exam Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <div className="h-6 w-1 bg-primary rounded-full" />
              1. Exam Overview
            </h3>
            <div className="grid gap-4 pl-3">
              <div className="space-y-2">
                <Label htmlFor="exam-name" className="text-sm font-medium">Exam Name <span className="text-destructive">*</span></Label>
                <Input
                  id="exam-name"
                  placeholder="e.g., Mathematics Final Exam 2024"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="h-11 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-category" className="text-sm font-medium">Exam Category <span className="text-destructive">*</span></Label>
                <CategoryCombobox value={examCategory} onChange={setExamCategory} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-description" className="text-sm font-medium">Description <span className="text-destructive">*</span></Label>
                <TransliterateTextarea
                  id="exam-description"
                  lang={instructionLang}
                  placeholder="Brief description of the exam..."
                  value={examDescription}
                  onValueChange={(text) => setExamDescription(text)}
                  rows={2}
                  className="resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="general-instruction" className="text-sm font-medium">General Instruction <span className="text-destructive">*</span></Label>
                  <InstructionTemplateAction
                    lang={instructionLang}
                    value={generalInstruction}
                    onFill={(text) => setGeneralInstruction(text)}
                  />
                </div>
                <TransliterateTextarea
                  id="general-instruction"
                  lang={instructionLang}
                  placeholder="General instructions for all candidates..."
                  value={generalInstruction}
                  onValueChange={(text) => setGeneralInstruction(text)}
                  // Grows for filled-in template text: a seven-line template in a
                  // two-row box shows two lines, and resize-none leaves no way out.
                  // ~90 chars per visual row at this dialog's width.
                  rows={rowsForText(generalInstruction, 2, 14, 90)}
                  className="resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="exam-instruction" className="text-sm font-medium">Exam Instruction</Label>
                  <GenerateExamInstruction
                    lang={instructionLang}
                    value={examSpecificInstruction}
                    onFill={(text) => setExamSpecificInstruction(text)}
                    // At create time the exam is only a form: no questions, no
                    // marking scheme, and no navigation mode CHOSEN — the DB
                    // will default to locked, but a default is a setting, not
                    // a promise, and text claiming "sat in order" outlives a
                    // later flip of the switch. So the mode is null and the
                    // engine writes only what is decided: the sections and
                    // the languages. The editor's button regenerates the
                    // fuller text later.
                    collectFacts={() => ({
                      sections: sections.map((s) => ({
                        name: s.name,
                        minutes: Number.isFinite(s.time_minutes) && s.time_minutes > 0 ? s.time_minutes : null,
                        questionCount: null,
                      })),
                      allowSectionSwitching: null,
                      totalMinutes: null,
                      marking: null,
                      answerTypes: null,
                      languageNames:
                        selectedLanguages.length > 1
                          ? selectedLanguages.map((code) => {
                              const l = AVAILABLE_LANGUAGES.find((x) => x.code === code);
                              return l ? (instructionLang === "hi" ? l.nativeLabel : l.label) : code;
                            })
                          : null,
                    })}
                    onError={(message) => toast({ title: "Nothing generated", description: message })}
                    // The default tooltip promises timing and marking — facts
                    // this dialog cannot deliver yet. Promise only what the
                    // create-time generation actually writes.
                    titles={{
                      fill: "Write a starting instruction from the sections you've added. The exam editor can regenerate the full version — timing, marking, question counts — once they exist.",
                      replace:
                        "Replace this text with a starting instruction written from the sections you've added. You can undo.",
                    }}
                  />
                </div>
                <TransliterateTextarea
                  id="exam-instruction"
                  lang={instructionLang}
                  placeholder="Specific instructions for the exam..."
                  value={examSpecificInstruction}
                  onValueChange={(text) => setExamSpecificInstruction(text)}
                  // Grows for generated text — see rowsForText.
                  // ~90 chars per visual row at this dialog's width.
                  rows={rowsForText(examSpecificInstruction, 2, 14, 90)}
                  className="resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Language Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Exam Languages <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Select languages for this exam. Students can choose their preferred language when taking the exam.
                </p>
                <div className="flex flex-wrap gap-3">
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <label
                      key={lang.code}
                      className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedLanguages.includes(lang.code)
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedLanguages.includes(lang.code)}
                        onCheckedChange={() => toggleLanguage(lang.code)}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{lang.label}</span>
                        {lang.nativeLabel !== lang.label && (
                          <span className="text-xs text-muted-foreground">{lang.nativeLabel}</span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                {selectedLanguages.length > 1 && (
                  <>
                    {/* Primary Language Selector */}
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Select Primary Language</span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        The primary language controls question structure, correct answers, and scoring. Other languages only need translated content.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedLanguages.map((langCode) => {
                          const langInfo = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                          const isSelected = primaryLanguage === langCode;
                          return (
                            <button
                              key={langCode}
                              type="button"
                              onClick={() => setPrimaryLanguage(langCode)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                isSelected
                                  ? "bg-amber-600 text-white shadow-sm"
                                  : "bg-white dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                              }`}
                            >
                              {isSelected && <Crown className="h-3 w-3" />}
                              {langInfo?.label || langCode}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <Globe className="h-4 w-4 text-blue-600 shrink-0" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Multi-language exam — you'll be able to create content in each language from the Edit Exam page using the language switcher.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Sections Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <div className="h-6 w-1 bg-primary rounded-full" />
              2. Add Exam Sections
            </h3>

            <div className="pl-3 space-y-4">
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="section-name" className="text-xs font-medium text-muted-foreground">Section Name</Label>
                    <TransliterateInput
                      id="section-name"
                      lang={selectedLanguages.includes("hi") && !selectedLanguages.includes("en") ? "hi" : "en"}
                      placeholder="e.g., Multiple Choice"
                      value={newSectionName}
                      onValueChange={(text) => setNewSectionName(text)}
                      className="bg-background placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label htmlFor="section-time" className="text-xs font-medium text-muted-foreground">Duration (min)</Label>
                    <Input
                      id="section-time"
                      type="number"
                      min="1"
                      placeholder="e.g., 60"
                      value={newSectionTime}
                      onChange={(e) => setNewSectionTime(e.target.value)}
                      className="bg-background placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <div className="flex justify-center pt-2">
                  <Button onClick={addSection} className="gap-2 rounded-full px-6">
                    <Plus className="h-5 w-5" />
                    Add Section
                  </Button>
                </div>

                <div className="space-y-2 mt-2">
                  <Label className="text-xs font-medium text-muted-foreground">Added Sections ({sections.length})</Label>
                  {sections.length > 0 ? (
                    <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1">
                      {sections.map((section, idx) => (
                        <div
                          key={section.id}
                          className="flex items-center justify-between p-3 bg-background border rounded-lg shadow-sm group hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{section.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {section.time_minutes} minutes
                                {selectedLanguages.length > 1 && (
                                  <span className="ml-2 text-blue-600">
                                    · {selectedLanguages.length} languages
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSection(section.id)}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground bg-background/50 rounded-lg border border-dashed">
                      No sections added yet. Sections are optional now — you can add them later, but at least one section is required before you can publish the exam.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
        <DialogFooter className="p-6 pt-0">
          <Button
            className="w-full"
            onClick={handleCreateExam}
            disabled={loading || uploadingPdf || !examName}
          >
            {loading ? "Creating..." : "Create Exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExamDialog;
