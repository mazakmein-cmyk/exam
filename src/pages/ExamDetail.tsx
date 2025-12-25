import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
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
import { ArrowLeft, Save, Trash2, Upload, Image as ImageIcon, FileText, ChevronDown, ChevronUp, Edit, Plus, Clock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PdfSnipper from "@/components/PdfSnipper";
import { QuestionForm } from "@/components/QuestionForm";
import { CategoryCombobox } from "@/components/CategoryCombobox";

type Exam = {
  id: string;
  name: string;
  description: string | null;
  instruction: string | null;
  exam_category: string | null;
  user_id: string;
};

type Section = {
  id: string;
  exam_id: string;
  name: string;
  time_minutes: number;
  pdf_url: string | null;
};

type Question = {
  id: string;
  section_id: string;
  q_no: number;
  text: string;
  options: any;
  answer_type: string;
  image_url?: string | null;
  correct_answer: any;
};

export default function ExamDetail() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [exam, setExam] = useState<Exam | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [section, setSection] = useState<Section | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [examTitle, setExamTitle] = useState("");
  const [examCategory, setExamCategory] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examInstruction, setExamInstruction] = useState("");
  const [isPublished, setIsPublished] = useState(false); // Placeholder for now

  // Add Question State
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("single");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", "", "", ""]);
  const [newQuestionImage, setNewQuestionImage] = useState<string | null>(null);
  const [newQuestionCorrect, setNewQuestionCorrect] = useState<string | string[]>("");

  // View Question State
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Edit Question State
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  // AI Parse State
  const [aiParsedQuestions, setAiParsedQuestions] = useState<any[]>([]);
  const [aiParsingStatus, setAiParsingStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [aiPdfUrl, setAiPdfUrl] = useState<string | null>(null);

  // Delete Section Confirmation State
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const questionFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (examId) {
      fetchExamData();
    }
  }, [examId]);

  const fetchExamData = async () => {
    try {
      setLoading(true);
      // Fetch Exam
      const { data: examData, error: examError } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (examError) throw examError;
      setExam(examData as unknown as Exam);
      setExamTitle(examData.name);
      setExamCategory((examData as any).exam_category || "");
      setExamDescription(examData.description || "");
      setExamInstruction((examData as any).instruction || "");

      // Fetch Sections
      const { data: sectionsData, error: sectionsError } = await supabase
        .from("sections")
        .select("*")
        .eq("exam_id", examId)
        .order("created_at", { ascending: true });

      if (sectionsError) throw sectionsError;

      let currentSections = sectionsData || [];
      let currentSection = currentSections[0];

      // If no section exists, create one
      if (currentSections.length === 0) {
        const { data: newSection, error: createError } = await supabase
          .from("sections")
          .insert({
            exam_id: examId,
            name: "General Section",
            time_minutes: 60,
          })
          .select()
          .single();

        if (createError) throw createError;
        currentSections = [newSection];
        currentSection = newSection;
      }

      setSections(currentSections);
      setSection(currentSection);

      // Fetch Questions for the current section
      if (currentSection) {
        fetchQuestions(currentSection.id);
      }

    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load exam details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async (sectionId: string) => {
    const { data: questionsData, error: questionsError } = await supabase
      .from("parsed_questions")
      .select("*")
      .eq("section_id", sectionId)
      .order("created_at", { ascending: true });

    if (questionsError) {
      console.error("Error fetching questions:", questionsError);
      return;
    }
    setQuestions(questionsData || []);
  };

  const handleSaveExam = async () => {
    if (!exam) return;
    setSaving(true);
    try {
      // Update Exam
      const { error: examError } = await supabase
        .from("exams")
        .update({
          name: examTitle,
          exam_category: examCategory,
          description: examDescription,
          instruction: examInstruction,
        })
        .eq("id", exam.id);

      if (examError) throw examError;

      toast({
        title: "Saved",
        description: "Exam details updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save exam details",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSectionChange = (newSectionId: string) => {
    const newSection = sections.find(s => s.id === newSectionId);
    if (newSection) {
      setSection(newSection);
      fetchQuestions(newSection.id);
    }
  };

  const handleAddSection = async () => {
    if (!exam) return;
    try {
      const { data: newSection, error } = await supabase
        .from("sections")
        .insert({
          exam_id: exam.id,
          name: "New Section",
          time_minutes: 60,
        })
        .select()
        .single();

      if (error) throw error;

      const updatedSections = [...sections, newSection];
      setSections(updatedSections);
      setSection(newSection);
      fetchQuestions(newSection.id);

      toast({
        title: "Section Added",
        description: "New section created successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add section",
        variant: "destructive",
      });
    }
  };

  const handleUpdateSection = async (sectionId: string, updates: Partial<Section>) => {
    try {
      const { data: updatedSection, error } = await supabase
        .from("sections")
        .update(updates)
        .eq("id", sectionId)
        .select()
        .single();

      if (error) throw error;

      const updatedSections = sections.map(s => s.id === sectionId ? updatedSection : s);
      setSections(updatedSections);

      if (section?.id === sectionId) {
        setSection(updatedSection);
      }

      toast({
        title: "Section Updated",
        description: "Section details saved",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update section",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSectionClick = (sectionId: string) => {
    if (sections.length <= 1) {
      toast({
        title: "Cannot Delete",
        description: "Exam must have at least one section",
        variant: "destructive",
      });
      return;
    }
    setDeleteSectionId(sectionId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDeleteSection = async () => {
    if (!deleteSectionId) return;

    try {
      const { error } = await supabase
        .from("sections")
        .delete()
        .eq("id", deleteSectionId);

      if (error) throw error;

      const updatedSections = sections.filter(s => s.id !== deleteSectionId);
      setSections(updatedSections);

      if (section?.id === deleteSectionId) {
        const nextSection = updatedSections[0];
        setSection(nextSection);
        fetchQuestions(nextSection.id);
      }

      toast({
        title: "Deleted",
        description: "Section removed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete section",
        variant: "destructive",
      });
    } finally {
      setShowDeleteDialog(false);
      setDeleteSectionId(null);
    }
  };

  const handleAddQuestion = async () => {
    if (!section) return;

    try {
      // Prepare question data with proper defaults
      const newQuestion: any = {
        section_id: section.id,
        q_no: questions.length + 1,
        text: newQuestionText || "", // Ensure text is never null
        answer_type: newQuestionType,
        image_url: newQuestionImage,
        correct_answer: newQuestionCorrect,
        requires_review: false,
        is_excluded: false,
        is_finalized: true
      };

      // Only include options for choice-type questions
      if (newQuestionType.includes("choice")) {
        newQuestion.options = newQuestionOptions.filter(opt => opt.trim() !== "");
      }

      const { data, error } = await supabase
        .from("parsed_questions")
        .insert(newQuestion)
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      setQuestions([...questions, data]);

      // Reset form
      setNewQuestionText("");
      setNewQuestionImage(null);
      setNewQuestionCorrect("");
      setNewQuestionOptions(["", "", "", ""]);

      toast({
        title: "Success",
        description: "Question added successfully",
      });
    } catch (error: any) {
      console.error("Error adding question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add question",
        variant: "destructive",
      });
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      const { error } = await supabase
        .from("parsed_questions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setQuestions(questions.filter(q => q.id !== id));
      toast({
        title: "Deleted",
        description: "Question removed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
    }
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestionId(question.id);
    setNewQuestionText(question.text || "");
    setNewQuestionType(question.answer_type);
    setNewQuestionImage(question.image_url);
    setNewQuestionCorrect(question.correct_answer);

    if (question.answer_type === "single" || question.answer_type === "multi") {
      setNewQuestionOptions(Array.isArray(question.options) ? question.options : ["", "", "", ""]);
    }

    // Scroll to form
    setTimeout(() => {
      questionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestionId || !section) return;

    try {
      const updateData: any = {
        text: newQuestionText || "",
        answer_type: newQuestionType,
        image_url: newQuestionImage,
        correct_answer: newQuestionCorrect,
      };

      if (newQuestionType === "single" || newQuestionType === "multi") {
        updateData.options = newQuestionOptions.filter(opt => opt.trim() !== "");
      }

      const { data, error } = await supabase
        .from("parsed_questions")
        .update(updateData)
        .eq("id", editingQuestionId)
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      setQuestions(questions.map(q => q.id === editingQuestionId ? data : q));

      // Reset form
      setEditingQuestionId(null);
      setNewQuestionText("");
      setNewQuestionType("single");
      setNewQuestionOptions(["", "", "", ""]);
      setNewQuestionImage(null);
      setNewQuestionCorrect("");

      toast({
        title: "Success",
        description: "Question updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update question",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingQuestionId(null);
    setNewQuestionText("");
    setNewQuestionType("single");
    setNewQuestionOptions(["", "", "", ""]);
    setNewQuestionImage(null);
    setNewQuestionCorrect("");
  };


  const handleAiPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !section) return;

    try {
      const fileName = `${examId}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('exam-pdfs')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('exam-pdfs')
        .getPublicUrl(fileName);

      setAiPdfUrl(publicUrl);
      toast({
        title: "Success",
        description: "PDF uploaded. Click 'Parse with AI' to extract questions.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upload PDF",
        variant: "destructive",
      });
    }
  };

  const handleAiParse = async () => {
    if (!aiPdfUrl || !section) return;

    setAiParsingStatus('parsing');
    setAiParsedQuestions([]);

    try {
      const { data, error } = await supabase.functions.invoke('parse-pdf', {
        body: { pdfUrl: aiPdfUrl, sectionId: section.id }
      });

      if (error) throw error;

      if (data.questions && data.questions.length > 0) {
        setAiParsedQuestions(data.questions);
        setAiParsingStatus('success');
        toast({
          title: "Success",
          description: `Extracted ${data.questions.length} questions from PDF`,
        });
      } else {
        setAiParsingStatus('error');
        toast({
          title: "No questions found",
          description: "The AI couldn't extract any questions from this PDF",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      setAiParsingStatus('error');
      toast({
        title: "Error",
        description: error.message || "Failed to parse PDF",
        variant: "destructive",
      });
    }
  };

  const handleAddAiQuestion = async (question: any) => {
    if (!section) return;

    try {
      const newQuestion: any = {
        section_id: section.id,
        q_no: questions.length + 1,
        text: question.text || "",
        answer_type: question.answer_type,
        image_url: question.image_url,
        correct_answer: question.correct_answer,
        requires_review: false,
        is_excluded: false,
        is_finalized: true
      };

      if (question.answer_type === "single" || question.answer_type === "multi") {
        newQuestion.options = question.options || [];
      }

      const { data, error } = await supabase
        .from("parsed_questions")
        .insert(newQuestion)
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

      setQuestions([...questions, data]);

      // Remove from AI parsed questions
      setAiParsedQuestions(aiParsedQuestions.filter(q => q !== question));

      toast({
        title: "Success",
        description: "Question added successfully",
      });
    } catch (error: any) {
      console.error("Error adding question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add question",
        variant: "destructive",
      });
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !section) return;
    const file = e.target.files[0];

    try {
      toast({ title: "Uploading PDF..." });
      const fileName = `${examId}/${section.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("exam-pdfs")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("sections")
        .update({ pdf_url: publicUrl })
        .eq("id", section.id);

      if (updateError) throw updateError;

      setSection({ ...section, pdf_url: publicUrl });
      toast({ title: "PDF Uploaded", description: "You can now snip questions from this PDF." });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSnip = async (blob: Blob) => {
    if (!section) return;
    try {
      toast({ title: "Uploading snip..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `${user.id}/${examId}/${section.id}/snip-${Date.now()}.png`;
      const file = new File([blob], "snip.png", { type: "image/png" });

      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("exam-pdfs")
        .getPublicUrl(fileName);

      setNewQuestionImage(publicUrl);
      toast({ title: "Snip Attached", description: "Image added to new question." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !section) return;
    const file = e.target.files[0];

    try {
      toast({ title: "Uploading image..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `${user.id}/${examId}/${section.id}/upload-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("exam-pdfs")
        .getPublicUrl(fileName);

      setNewQuestionImage(publicUrl);
      toast({ title: "Image Uploaded" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Edit Exam</h1>
        </div>
        <Button onClick={handleSaveExam} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
      </header>

      <main className="container mx-auto max-w-[1600px] p-6 grid grid-cols-12 gap-6">
        {/* Left Sidebar: Exam Details & Sections */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Exam Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <CategoryCombobox value={examCategory} onChange={setExamCategory} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={examDescription}
                  onChange={(e) => setExamDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Instruction</Label>
                <Textarea
                  value={examInstruction}
                  onChange={(e) => setExamInstruction(e.target.value)}
                  rows={4}
                />
              </div>

            </CardContent>
          </Card>

          {/* Sections Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold">Sections</CardTitle>
              <Button size="sm" variant="outline" onClick={handleAddSection}>
                <Plus className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {sections.map((s) => (
                <div
                  key={s.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${section?.id === s.id
                    ? "bg-primary/5 border-primary shadow-sm"
                    : "hover:bg-muted border-transparent bg-slate-50"
                    }`}
                  onClick={() => handleSectionChange(s.id)}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <Input
                      className="h-7 text-sm font-medium border-transparent hover:border-input focus:border-input px-1 -ml-1"
                      value={s.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleUpdateSection(s.id, { name: e.target.value })}
                    />
                    {sections.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteSectionClick(s.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <Input
                      className="h-6 w-16 text-xs"
                      type="number"
                      value={s.time_minutes}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        handleUpdateSection(s.id, { time_minutes: parseInt(e.target.value) || 0 })
                      }
                    />
                    <span>min</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Content: Questions */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {/* Questions List */}
          <Card>
            <CardHeader>
              <CardTitle>Questions ({questions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No questions added yet.</p>
              ) : (
                questions.map((q, idx) => {
                  const isExpanded = expandedQuestionId === q.id;
                  return (
                    <div key={q.id} className="border rounded-lg bg-white">
                      <div className="flex items-start gap-4 p-4 group">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          {q.image_url && (
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                              <ImageIcon className="h-4 w-4" />
                              Has image
                            </div>
                          )}
                          <p className="font-medium">{q.text || "Question with image"}</p>
                          <p className="text-xs text-muted-foreground capitalize">{q.answer_type}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="mr-2 h-4 w-4" />
                                Hide Question
                              </>
                            ) : (
                              <>
                                <ChevronDown className="mr-2 h-4 w-4" />
                                View Question
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleEditQuestion(q)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteQuestion(q.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 border-t space-y-4">
                          {q.image_url && (
                            <div className="border rounded-lg p-4 bg-slate-50">
                              <Label className="mb-2 block font-semibold">Question Image</Label>
                              <img
                                src={q.image_url}
                                alt="Question"
                                className="max-w-full h-auto rounded-md"
                              />
                            </div>
                          )}

                          {q.text && (
                            <div>
                              <Label className="mb-2 block font-semibold">Question Text</Label>
                              <p className="text-sm p-3 bg-slate-50 rounded-md">{q.text}</p>
                            </div>
                          )}

                          <div>
                            <Label className="mb-2 block font-semibold">Question Type</Label>
                            <p className="text-sm p-3 bg-slate-50 rounded-md capitalize">
                              {q.answer_type === "single" ? "Multiple Choice (Single)" :
                                q.answer_type === "multi" ? "Multiple Choice (Multiple)" :
                                  q.answer_type === "numeric" ? "Numeric" : "Text"}
                            </p>
                          </div>

                          {(q.answer_type === "single" || q.answer_type === "multi") && q.options && (
                            <div>
                              <Label className="mb-2 block font-semibold">Options</Label>
                              <div className="space-y-2">
                                {(Array.isArray(q.options) ? q.options : []).map((opt: string, optIdx: number) => (
                                  <div key={optIdx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-md">
                                    <span className="font-semibold text-sm">{String.fromCharCode(65 + optIdx)}.</span>
                                    <span className="text-sm">{opt}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <Label className="mb-2 block font-semibold">Correct Answer{q.answer_type === "multi" ? "s" : ""}</Label>
                            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                              {Array.isArray(q.correct_answer) ? (
                                <div className="space-y-1">
                                  {q.correct_answer.map((ans: string, ansIdx: number) => (
                                    <div key={ansIdx} className="text-sm font-medium text-green-700">\u2022 {ans}</div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm font-medium text-green-700">{q.correct_answer || "Not specified"}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Add Question Form */}
          <Card ref={questionFormRef}>
            <CardHeader>
              <CardTitle>{editingQuestionId ? "Edit Question" : "Add Question"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="direct" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                  <TabsTrigger value="direct">Direct Upload</TabsTrigger>
                  <TabsTrigger value="pdf">PDF Snipping</TabsTrigger>
                  <TabsTrigger value="ai" className="gap-2">
                    AI Parse
                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
                      Coming Soon
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="direct" className="space-y-0">
                  <div className="flex justify-between items-start mb-0">
                    <h3 className="font-semibold">Question Details</h3>
                    {editingQuestionId && (
                      <div className="flex flex-col gap-2">
                        <Button onClick={handleUpdateQuestion} size="sm">
                          <Save className="mr-2 h-4 w-4" />
                          Update
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit} size="sm">
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  <QuestionForm
                    text={newQuestionText}
                    setText={setNewQuestionText}
                    type={newQuestionType}
                    setType={setNewQuestionType}
                    options={newQuestionOptions}
                    setOptions={setNewQuestionOptions}
                    correct={newQuestionCorrect}
                    setCorrect={setNewQuestionCorrect}
                    image={newQuestionImage}
                    onImageUpload={handleImageUpload}
                    onAdd={editingQuestionId ? handleUpdateQuestion : handleAddQuestion}
                    showImageUpload={true}
                    isEditing={!!editingQuestionId}
                  />
                </TabsContent>

                <TabsContent value="pdf" className="space-y-6">
                  <div className="space-y-2">
                    <Label>Upload PDF Document</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" className="w-full h-12 border-dashed" onClick={() => document.getElementById('pdf-upload')?.click()}>
                        <FileText className="mr-2 h-4 w-4" />
                        {section?.pdf_url ? "Change PDF File" : "Select PDF File"}
                        <input
                          id="pdf-upload"
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handlePdfUpload}
                        />
                      </Button>
                    </div>
                  </div>

                  {section?.pdf_url ? (
                    <div className="border rounded-lg overflow-hidden h-[600px]">
                      <PdfSnipper pdfUrl={section.pdf_url} onSnip={handleSnip} />
                    </div>
                  ) : (
                    <div className="text-center py-12 border rounded-lg bg-slate-50 text-muted-foreground">
                      Please upload a PDF to start snipping questions.
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-start mb-0">
                      <h3 className="font-semibold">Question Details</h3>
                      {editingQuestionId && (
                        <div className="flex flex-col gap-2">
                          <Button onClick={handleUpdateQuestion} size="sm">
                            <Save className="mr-2 h-4 w-4" />
                            Update
                          </Button>
                          <Button variant="outline" onClick={handleCancelEdit} size="sm">
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                    <QuestionForm
                      text={newQuestionText}
                      setText={setNewQuestionText}
                      type={newQuestionType}
                      setType={setNewQuestionType}
                      options={newQuestionOptions}
                      setOptions={setNewQuestionOptions}
                      correct={newQuestionCorrect}
                      setCorrect={setNewQuestionCorrect}
                      image={newQuestionImage}
                      onImageUpload={handleImageUpload}
                      onAdd={editingQuestionId ? handleUpdateQuestion : handleAddQuestion}
                      showImageUpload={false}
                      isEditing={!!editingQuestionId}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="ai" className="space-y-6">
                  {/* Coming Soon Overlay */}
                  <div className="text-center py-16 border rounded-lg bg-slate-50">
                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">AI Parse Coming Soon</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      We are working on an advanced AI feature that will automatically extract questions, options, and answers from your PDF files. Stay tuned!
                    </p>
                  </div>

                  {/* Hidden Functionality */}
                  <div className="hidden">
                    <div className="space-y-2">
                      <Label>Upload PDF Document</Label>
                      <div className="flex gap-2">
                        <Button variant="outline" className="w-full h-12 border-dashed" onClick={() => document.getElementById('ai-pdf-upload')?.click()}>
                          <FileText className="mr-2 h-4 w-4" />
                          {aiPdfUrl ? "Change PDF File" : "Select PDF File"}
                          <input
                            id="ai-pdf-upload"
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={handleAiPdfUpload}
                          />
                        </Button>
                      </div>
                    </div>

                    {aiPdfUrl && (
                      <Button
                        className="w-full"
                        onClick={handleAiParse}
                        disabled={aiParsingStatus === 'parsing'}
                      >
                        {aiParsingStatus === 'parsing' ? (
                          <>
                            <span className="mr-2">Parsing...</span>
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                          </>
                        ) : (
                          'Parse with AI'
                        )}
                      </Button>
                    )}

                    {aiParsingStatus === 'parsing' && (
                      <div className="text-center py-12 border rounded-lg bg-slate-50">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-muted-foreground">AI is analyzing your PDF...</p>
                      </div>
                    )}

                    {aiParsingStatus === 'success' && aiParsedQuestions.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold text-lg">Extracted Questions ({aiParsedQuestions.length})</h3>
                        {aiParsedQuestions.map((q, idx) => (
                          <Card key={idx} className="p-4">
                            <div className="space-y-4">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <p className="font-medium">{q.text || "Question with image"}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{q.answer_type}</p>
                                  </div>
                                </div>
                              </div>

                              {q.image_url && (
                                <div className="border rounded-lg p-2 bg-slate-50">
                                  <img src={q.image_url} alt="Question" className="max-w-full h-auto rounded-md" />
                                </div>
                              )}

                              {q.text && (
                                <div>
                                  <Label className="text-xs">Question Text</Label>
                                  <Textarea
                                    value={q.text}
                                    onChange={(e) => {
                                      const updated = [...aiParsedQuestions];
                                      updated[idx].text = e.target.value;
                                      setAiParsedQuestions(updated);
                                    }}
                                    className="mt-1"
                                  />
                                </div>
                              )}

                              {(q.answer_type === "single" || q.answer_type === "multi") && q.options && (
                                <div>
                                  <Label className="text-xs">Options</Label>
                                  <div className="space-y-2 mt-1">
                                    {q.options.map((opt: string, optIdx: number) => (
                                      <div key={optIdx} className="flex items-center gap-2">
                                        <span className="font-semibold text-sm w-6">{String.fromCharCode(65 + optIdx)}.</span>
                                        <Input
                                          value={opt}
                                          onChange={(e) => {
                                            const updated = [...aiParsedQuestions];
                                            updated[idx].options[optIdx] = e.target.value;
                                            setAiParsedQuestions(updated);
                                          }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <Label className="text-xs">Correct Answer{q.answer_type === "multi" ? "s" : ""}</Label>
                                <div className="p-3 bg-green-50 border border-green-200 rounded-md mt-1">
                                  {Array.isArray(q.correct_answer) ? (
                                    <div className="space-y-1">
                                      {q.correct_answer.map((ans: string, ansIdx: number) => (
                                        <div key={ansIdx} className="text-sm font-medium text-green-700">\u2022 {ans}</div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm font-medium text-green-700">{q.correct_answer}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 pt-2">
                                <Button
                                  className="flex-1"
                                  onClick={() => handleAddAiQuestion(q)}
                                >
                                  Add to Exam
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setAiParsedQuestions(aiParsedQuestions.filter((_, i) => i !== idx))}
                                >
                                  Discard
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}

                    {aiParsingStatus === 'idle' && !aiPdfUrl && (
                      <div className="text-center py-12 border rounded-lg bg-slate-50 text-muted-foreground">
                        Upload a PDF to start AI parsing
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Delete Section Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will delete the section and all its questions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteSectionId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteSection} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

