import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { Badge } from "@/components/ui/badge";

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
  const [examInstruction, setExamInstruction] = useState("");
  const [examCategory, setExamCategory] = useState<string>("");
  const [sections, setSections] = useState<Section[]>([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionTime, setNewSectionTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const { toast } = useToast();

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
          instruction: examInstruction || null,
          exam_category: examCategory || null,
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

      // Create sections with PDF info
      const sectionsData = sections.map((section, index) => ({
        exam_id: exam.id,
        name: section.name,
        time_minutes: section.time_minutes,
        sort_order: index,
        pdf_url: publicUrl,
        pdf_name: file.name,
        parsing_status: "pending",
      }));

      const { data: createdSections, error: sectionsError } = await supabase
        .from("sections")
        .insert(sectionsData)
        .select();

      if (sectionsError) throw sectionsError;

      // Trigger PDF parsing for each section
      console.log("Starting PDF parsing for sections:", createdSections.length);

      let parsedCount = 0;
      for (const section of createdSections) {
        console.log(`Invoking parse-pdf for section ${section.id}`);

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
          console.log("Parse-pdf response:", parseData);
          parsedCount++;
        }
      }

      toast({
        title: "Success!",
        description: `Exam created! ${parsedCount}/${createdSections.length} sections parsed successfully.`,
      });

      setExamName("");
      setExamCategory("");
      setExamDescription("");
      setExamDescription("");
      setExamInstruction("");
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
        instruction: examInstruction || null,
        exam_category: examCategory || null,
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

    if (sections.length > 0) {
      const sectionsData = sections.map((section, index) => ({
        exam_id: exam.id,
        name: section.name,
        time_minutes: section.time_minutes,
        sort_order: index,
      }));

      const { error: sectionsError } = await supabase
        .from("sections")
        .insert(sectionsData);

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
      description: "Exam created successfully",
    });

    setExamName("");
    setExamCategory("");
    setExamDescription("");
    setExamDescription("");
    setExamInstruction("");
    setSections([]);
    setLoading(false);
    onOpenChange(false);
    onExamCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-background">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Plus className="h-6 w-6 text-primary" />
            </div>
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
              1. Exam Details
            </h3>
            <div className="grid gap-4 pl-3">
              <div className="space-y-2">
                <Label htmlFor="exam-name" className="text-sm font-medium">Exam Name <span className="text-destructive">*</span></Label>
                <Input
                  id="exam-name"
                  placeholder="e.g., Mathematics Final Exam 2024"
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-category" className="text-sm font-medium">Exam Category</Label>
                <CategoryCombobox value={examCategory} onChange={setExamCategory} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="exam-description"
                  placeholder="Brief description of the exam..."
                  value={examDescription}
                  onChange={(e) => setExamDescription(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exam-instruction" className="text-sm font-medium">Instruction</Label>
                <Textarea
                  id="exam-instruction"
                  placeholder="Specific instructions for the exam..."
                  value={examInstruction}
                  onChange={(e) => setExamInstruction(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          {/* Sections Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <div className="h-6 w-1 bg-primary rounded-full" />
              2. Sections Configuration
            </h3>

            <div className="pl-3 space-y-4">
              <div className="bg-muted/30 p-4 rounded-xl border border-border/50 space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="section-name" className="text-xs font-medium text-muted-foreground">Section Name</Label>
                    <Input
                      id="section-name"
                      placeholder="e.g., Multiple Choice"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label htmlFor="section-time" className="text-xs font-medium text-muted-foreground">Duration (min)</Label>
                    <Input
                      id="section-time"
                      type="number"
                      min="1"
                      placeholder="60"
                      value={newSectionTime}
                      onChange={(e) => setNewSectionTime(e.target.value)}
                      className="bg-background"
                    />
                  </div>
                  <Button onClick={addSection} size="icon" className="h-10 w-10 shrink-0">
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>

                {sections.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    <Label className="text-xs font-medium text-muted-foreground">Added Sections ({sections.length})</Label>
                    <div className="grid gap-2 max-h-[200px] overflow-y-auto pr-1">
                      {sections.map((section) => (
                        <div
                          key={section.id}
                          className="flex items-center justify-between p-3 bg-background border rounded-lg shadow-sm group hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {section.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{section.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {section.time_minutes} minutes
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
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground bg-background/50 rounded-lg border border-dashed">
                    No sections added yet. Add at least one section to proceed.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Creation Actions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground/90">
              <div className="h-6 w-1 bg-primary rounded-full" />
              3. Create Exam
            </h3>

            <div className="grid md:grid-cols-2 gap-4 pl-3">
              {/* Option A: Upload PDF */}
              <div className="relative overflow-hidden rounded-xl border-2 border-muted bg-muted/20 opacity-80">
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 text-primary rounded-lg grayscale">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground">Upload PDF & Auto-Parse</h4>
                        <Badge variant="secondary" className="h-5 text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200">
                          Coming Soon
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Recommended for existing papers</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload your exam PDF. AI will automatically extract questions, options, and answers.
                  </p>

                  <Button
                    className="w-full"
                    disabled={true}
                    variant="secondary"
                  >
                    Coming Soon
                  </Button>
                </div>
              </div>

              {/* Option B: Manual */}
              <div className={`relative overflow-hidden rounded-xl border-2 transition-all ${!examName
                ? "border-muted bg-muted/20 opacity-60 cursor-not-allowed"
                : "border-muted hover:border-foreground/20 bg-card"
                }`}>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary text-secondary-foreground rounded-lg">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Create Empty Exam</h4>
                      <p className="text-xs text-muted-foreground">Build from scratch</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create a blank exam structure and add questions manually one by one.
                  </p>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCreateExam}
                    disabled={loading || uploadingPdf || !examName}
                  >
                    {loading ? "Creating..." : "Create Empty Exam"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExamDialog;
