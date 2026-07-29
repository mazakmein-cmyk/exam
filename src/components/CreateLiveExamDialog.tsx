import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransliterateInput } from "@/components/TransliterateInput";
import { TransliterateTextarea } from "@/components/TransliterateTextarea";
import { Plus, X, Globe, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { createLiveExam } from "@/services/liveExamService";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी" },
];

type Section = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExamCreated: () => void;
};

const CreateLiveExamDialog = ({ open, onOpenChange, onExamCreated }: Props) => {
  const [examName, setExamName] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examInstruction, setExamInstruction] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["en"]);
  const [primaryLanguage, setPrimaryLanguage] = useState<string>("en");
  const [sections, setSections] = useState<Section[]>([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const toggleLanguage = (langCode: string) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(langCode)) {
        if (prev.length === 1) {
          toast({
            title: "At least one language required",
            description: "You must select at least one language for the exam.",
            variant: "destructive",
          });
          return prev;
        }
        const updated = prev.filter((l) => l !== langCode);
        if (primaryLanguage === langCode) {
          setPrimaryLanguage(updated[0]);
        }
        return updated;
      }
      return [...prev, langCode];
    });
  };

  const addSection = () => {
    if (!newSectionName) {
      toast({
        title: "Invalid section",
        description: "Please enter a section name",
        variant: "destructive",
      });
      return;
    }

    const section: Section = {
      id: crypto.randomUUID(),
      name: newSectionName,
    };

    setSections([...sections, section]);
    setNewSectionName("");
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
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

    if (selectedLanguages.length === 0) {
      toast({
        title: "No language selected",
        description: "Please select at least one language for the exam",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      await createLiveExam({
        name: examName,
        description: examDescription || undefined,
        instruction: examInstruction || undefined,
        supported_languages: selectedLanguages,
        primary_language: primaryLanguage,
        sections: sections.map(s => ({ name: s.name, sectionGroupId: s.id })),
      });

      toast({
        title: "Success!",
        description: `Live exam created successfully${selectedLanguages.length > 1 ? ` in ${selectedLanguages.length} languages` : ""}`,
      });

      setExamName("");
      setExamDescription("");
      setExamInstruction("");
      setSelectedLanguages(["en"]);
      setPrimaryLanguage("en");
      setSections([]);
      setLoading(false);
      onOpenChange(false);
      onExamCreated();
    } catch (error: any) {
      console.error("Error creating live exam:", error);
      toast({
        title: "Error creating exam",
        description: error.message || "Failed to create live exam",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-background">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-bold">
            Create Live Exam
          </DialogTitle>
          <DialogDescription className="text-base">
            Set up a live, interactive exam that you control in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-8">
          {/* Exam Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <div className="h-6 w-1 bg-emerald-500 rounded-full" />
              1. Exam Overview
            </h3>
            <div className="grid gap-4 pl-3">
              <div className="space-y-2">
                <Label htmlFor="live-exam-name" className="text-sm font-medium">Exam Name <span className="text-destructive">*</span></Label>
                <Input
                  id="live-exam-name"
                  placeholder="e.g., Math Championship Live"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="h-11 placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="live-exam-description" className="text-sm font-medium">Description <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TransliterateTextarea
                  id="live-exam-description"
                  lang={selectedLanguages.includes("hi") && !selectedLanguages.includes("en") ? "hi" : "en"}
                  placeholder="Brief description of the exam..."
                  value={examDescription}
                  onValueChange={(text) => setExamDescription(text)}
                  rows={2}
                  className="resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="live-exam-instruction" className="text-sm font-medium">Instructions <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TransliterateTextarea
                  id="live-exam-instruction"
                  lang={selectedLanguages.includes("hi") && !selectedLanguages.includes("en") ? "hi" : "en"}
                  placeholder="Specific instructions for students..."
                  value={examInstruction}
                  onValueChange={(text) => setExamInstruction(text)}
                  rows={2}
                  className="resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Language Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-500" />
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
                          ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                          : "border-border hover:border-emerald-500/40 hover:bg-muted/50"
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
                        The primary language controls question structure and correct answers. Other languages only need translated content.
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
              <div className="h-6 w-1 bg-emerald-500 rounded-full" />
              2. Add Exam Sections
            </h3>

            <div className="pl-3 space-y-4">
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="live-section-name" className="text-xs font-medium text-muted-foreground">Section Name</Label>
                    <TransliterateInput
                      id="live-section-name"
                      lang={selectedLanguages.includes("hi") && !selectedLanguages.includes("en") ? "hi" : "en"}
                      placeholder="e.g., Algebra"
                      value={newSectionName}
                      onValueChange={(text) => setNewSectionName(text)}
                      className="bg-background placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                <div className="flex justify-center pt-2">
                  <Button onClick={addSection} className="gap-2 rounded-full px-6 bg-emerald-600 hover:bg-emerald-700">
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
                          className="flex items-center justify-between p-3 bg-background border rounded-lg shadow-sm group hover:border-emerald-500/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-bold text-xs">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{section.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Time is per question
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
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={handleCreateExam}
            disabled={loading || !examName}
          >
            {loading ? "Creating..." : "Create Live Exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateLiveExamDialog;
