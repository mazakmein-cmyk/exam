import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useBlocker, Blocker } from "react-router-dom";
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
import { ArrowLeft, Save, Trash2, Upload, Image as ImageIcon, FileText, ChevronDown, ChevronUp, Edit, Plus, Clock, Sparkles, MoreVertical, Share2, Copy, BookOpen, BarChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import PdfSnipper from "@/components/PdfSnipper";
import { QuestionForm } from "@/components/QuestionForm";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Exam = {
  id: string;
  name: string;
  description: string | null;
  instruction: string | null;
  exam_category: string | null;
  user_id: string;
  is_published: boolean;
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
  const [showDeleteExamDialog, setShowDeleteExamDialog] = useState(false);

  // Delete Question Confirmation State
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [showDeleteQuestionDialog, setShowDeleteQuestionDialog] = useState(false);
  const [isExamDetailsCollapsed, setIsExamDetailsCollapsed] = useState(false);
  const [isSectionsCollapsed, setIsSectionsCollapsed] = useState(false);
  const [isQuestionsCollapsed, setIsQuestionsCollapsed] = useState(false);
  const questionFormRef = useRef<HTMLDivElement>(null);

  // Dirty State Logic
  const initialExamDataRef = useRef({
    name: "",
    category: "",
    description: "",
    instruction: ""
  });

  const [isDirty, setIsDirty] = useState(false);

  // Check if form is dirty
  useEffect(() => {
    if (!exam) return;

    // Check main exam fields
    const isExamChanged =
      examTitle !== initialExamDataRef.current.name ||
      examCategory !== initialExamDataRef.current.category ||
      examDescription !== initialExamDataRef.current.description ||
      examInstruction !== initialExamDataRef.current.instruction;

    // Check if new question is being typed but not empty (ignoring initial empty state)
    const isQuestionFormDirty =
      newQuestionText.trim() !== "" ||
      newQuestionOptions.some(opt => opt.trim() !== "") ||
      newQuestionImage !== null ||
      newQuestionCorrect !== ""; // Simplified check

    // Check if editing existing question
    const isEditing = editingQuestionId !== null;

    setIsDirty(isExamChanged || isEditing || (isQuestionFormDirty && !editingQuestionId));
  }, [examTitle, examCategory, examDescription, examInstruction, exam, editingQuestionId, newQuestionText, newQuestionOptions, newQuestionImage, newQuestionCorrect]);

  // Section Switch Confirmation State
  const [pendingSectionId, setPendingSectionId] = useState<string | null>(null);
  const [showUnsavedSectionDialog, setShowUnsavedSectionDialog] = useState(false);

  const isQuestionDirty = () => {
    return (
      editingQuestionId !== null ||
      newQuestionText.trim() !== "" ||
      newQuestionOptions.some((opt) => opt.trim() !== "") ||
      newQuestionImage !== null ||
      newQuestionCorrect !== ""
    );
  };

  // Handle browser close / refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Handle in-app navigation
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

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

      // Set initial data for dirty check
      initialExamDataRef.current = {
        name: examData.name,
        category: (examData as any).exam_category || "",
        description: examData.description || "",
        instruction: (examData as any).instruction || ""
      };

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

  const handleSaveExam = async (): Promise<boolean> => {
    if (!exam) return false;

    if (editingQuestionId) {
      const success = await handleUpdateQuestion();
      if (!success) return false;
    }

    // Validate mandatory fields
    if (!examCategory || !examCategory.trim()) {
      toast({
        title: "Validation Error",
        description: "Please select an Exam Category",
        variant: "destructive",
      });
      return false;
    }

    if (!examDescription || !examDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter an Exam Description",
        variant: "destructive",
      });
      return false;
    }

    if (!examInstruction || !examInstruction.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter Exam Instructions",
        variant: "destructive",
      });
      return false;
    }

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
      return false;
    } finally {
      setSaving(false);
    }

    // Update initial Ref after successful save to reset dirty state
    initialExamDataRef.current = {
      name: examTitle,
      category: examCategory,
      description: examDescription,
      instruction: examInstruction
    };
    setIsDirty(false); // Force reset roughly, though effect will run again
    return true;
  };

  const handleShare = () => {
    toast({
      title: "Share",
      description: "Sharing functionality coming soon!",
    });
  };

  const handleDuplicateExam = async () => {
    if (!exam) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to duplicate an exam",
          variant: "destructive",
        });
        return;
      }

      // Create a copy of the exam
      const { data: newExam, error: examError } = await supabase
        .from("exams")
        .insert({
          name: `${exam.name} (Copy)`,
          description: exam.description,
          instruction: exam.instruction,
          exam_category: exam.exam_category,
          user_id: user.id,
        })
        .select()
        .single();

      if (examError) throw examError;

      // Duplicate all sections and their questions
      for (const section of sections) {
        const { data: newSection, error: sectionError } = await supabase
          .from("sections")
          .insert({
            exam_id: newExam.id,
            name: section.name,
            time_minutes: section.time_minutes,
          })
          .select()
          .single();

        if (sectionError) throw sectionError;

        // Get questions for this section
        const { data: sectionQuestions, error: questionsError } = await supabase
          .from("parsed_questions")
          .select("*")
          .eq("section_id", section.id);

        if (questionsError) throw questionsError;

        // Duplicate questions to the new section
        if (sectionQuestions && sectionQuestions.length > 0) {
          const newQuestions = sectionQuestions.map((q: any) => ({
            section_id: newSection.id,
            q_no: q.q_no,
            text: q.text,
            options: q.options,
            answer_type: q.answer_type,
            image_url: q.image_url,
            correct_answer: q.correct_answer,
            requires_review: q.requires_review || false,
            is_excluded: q.is_excluded || false,
            is_finalized: q.is_finalized || true,
          }));

          const { error: insertError } = await supabase
            .from("parsed_questions")
            .insert(newQuestions);

          if (insertError) throw insertError;
        }
      }

      toast({
        title: "Duplicated",
        description: "Exam duplicated successfully! Redirecting to the new exam...",
      });

      // Navigate to the new exam
      navigate(`/exam/${newExam.id}`);
    } catch (error: any) {
      console.error("Duplicate error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate exam",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = () => {
    if (!exam) return;

    if (exam.is_published) {
      toast({
        title: "Cannot Delete Published Exam",
        description: "Please unpublish the exam first to delete it.",
        variant: "destructive",
      });
      return;
    }

    setShowDeleteExamDialog(true);
  };

  const executeDeleteExam = async () => {
    if (!exam) return;

    try {
      setLoading(true);

      // First, get exam_versions for this exam (if they exist)
      const { data: examVersions } = await supabase
        .from("exam_versions" as any)
        .select("id")
        .eq("exam_id", exam.id);

      if (examVersions && examVersions.length > 0) {
        const versionIds = examVersions.map((v: any) => v.id);

        // Delete all exam_attempts that reference these versions
        await supabase
          .from("exam_attempts" as any)
          .delete()
          .in("exam_version_id", versionIds);

        // Delete the exam_versions themselves
        await supabase
          .from("exam_versions" as any)
          .delete()
          .eq("exam_id", exam.id);
      }

      // Get all sections for this exam
      const { data: sections } = await supabase
        .from("sections")
        .select("id")
        .eq("exam_id", exam.id);

      if (sections && sections.length > 0) {
        const sectionIds = sections.map(s => s.id);

        // Delete all responses for attempts on these sections
        const { data: attempts } = await supabase
          .from("attempts")
          .select("id")
          .in("section_id", sectionIds);

        if (attempts && attempts.length > 0) {
          const attemptIds = attempts.map(a => a.id);
          await supabase
            .from("responses")
            .delete()
            .in("attempt_id", attemptIds);
        }

        // Delete all attempts for these sections
        await supabase
          .from("attempts")
          .delete()
          .in("section_id", sectionIds);

        // Delete all parsed_questions for these sections
        await supabase
          .from("parsed_questions")
          .delete()
          .in("section_id", sectionIds);

        // Delete all sections
        await supabase
          .from("sections")
          .delete()
          .eq("exam_id", exam.id);
      }

      // Now delete the exam itself
      const { error } = await supabase
        .from("exams")
        .delete()
        .eq("id", exam.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Exam deleted successfully",
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete exam",
        variant: "destructive",
      });
      setLoading(false);
      setShowDeleteExamDialog(false);
    }
  };

  const handleSectionChange = (newSectionId: string) => {
    // Check for unsaved question changes
    if (isQuestionDirty()) {
      setPendingSectionId(newSectionId);
      setShowUnsavedSectionDialog(true);
      return;
    }

    executeSectionChange(newSectionId);
  };

  const executeSectionChange = (newSectionId: string) => {
    const newSection = sections.find(s => s.id === newSectionId);
    if (newSection) {
      setSection(newSection);
      fetchQuestions(newSection.id);
    }
  };

  const handleDiscardAndSwitchSection = () => {
    // Reset form state
    setEditingQuestionId(null);
    setNewQuestionText("");
    setNewQuestionType("single");
    setNewQuestionOptions(["", "", "", ""]);
    setNewQuestionImage(null);
    setNewQuestionCorrect("");

    if (pendingSectionId) {
      executeSectionChange(pendingSectionId);
    }
    setPendingSectionId(null);
    setShowUnsavedSectionDialog(false);
  };

  const handleSaveAndSwitchSection = async () => {
    let success = false;
    if (editingQuestionId) {
      success = await handleUpdateQuestion();
    } else {
      success = await handleAddQuestion();
    }

    if (success && pendingSectionId) {
      executeSectionChange(pendingSectionId);
      setPendingSectionId(null);
      setShowUnsavedSectionDialog(false);
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

    // Validate that correct answer is provided
    const hasCorrectAnswer = Array.isArray(newQuestionCorrect)
      ? newQuestionCorrect.length > 0
      : newQuestionCorrect && newQuestionCorrect.toString().trim() !== "";

    if (!hasCorrectAnswer) {
      toast({
        title: "Missing Answer",
        description: "Please specify the correct answer before saving the question.",
        variant: "destructive",
      });
      return false;
    }

    // Validate options for single/multi choice questions
    if (newQuestionType === "single" || newQuestionType === "multi") {
      const filledOptions = newQuestionOptions.filter(opt => opt.trim() !== "");
      if (filledOptions.length < 2) {
        toast({
          title: "Missing Options",
          description: "Please add at least 2 options for a choice-type question.",
          variant: "destructive",
        });
        return false;
      }
      // Check if any option is empty (user added but left blank)
      const hasEmptyOption = newQuestionOptions.some((opt, idx) => idx < filledOptions.length && opt.trim() === "");
      if (hasEmptyOption) {
        toast({
          title: "Empty Options",
          description: "Please fill in all options or remove empty ones.",
          variant: "destructive",
        });
        return false;
      }
    }

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
      if (newQuestionType === "single" || newQuestionType === "multi") {
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
      return true;
    } catch (error: any) {
      console.error("Error adding question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add question",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleDeleteQuestionClick = (id: string) => {
    setDeleteQuestionId(id);
    setShowDeleteQuestionDialog(true);
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!deleteQuestionId) return;

    try {
      const { error } = await supabase
        .from("parsed_questions")
        .delete()
        .eq("id", deleteQuestionId);

      if (error) throw error;

      setQuestions(questions.filter(q => q.id !== deleteQuestionId));
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
    } finally {
      setShowDeleteQuestionDialog(false);
      setDeleteQuestionId(null);
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
    if (!editingQuestionId || !section) return false;

    // Validate that correct answer is provided
    const hasCorrectAnswer = Array.isArray(newQuestionCorrect)
      ? newQuestionCorrect.length > 0
      : newQuestionCorrect && newQuestionCorrect.toString().trim() !== "";

    if (!hasCorrectAnswer) {
      toast({
        title: "Missing Answer",
        description: "Please specify the correct answer before updating the question.",
        variant: "destructive",
      });
      return false;
    }

    // Validate options for single/multi choice questions
    if (newQuestionType === "single" || newQuestionType === "multi") {
      const filledOptions = newQuestionOptions.filter(opt => opt.trim() !== "");
      if (filledOptions.length < 2) {
        toast({
          title: "Missing Options",
          description: "Please add at least 2 options for a choice-type question.",
          variant: "destructive",
        });
        return false;
      }
    }

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
      return true;
    } catch (error: any) {
      console.error("Error updating question:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update question",
        variant: "destructive",
      });
      return false;
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
      <header className="bg-white border-b px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg sm:text-xl font-bold truncate max-w-[150px] sm:max-w-md">Edit Exam</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={() => navigate(`/exam/${examId}/intro`)}>
            <BookOpen className="mr-2 h-4 w-4" />
            View
          </Button>
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => navigate(`/exam/${examId}/intro`)}>
            <BookOpen className="h-4 w-4" />
          </Button>

          <Button onClick={handleSaveExam} disabled={saving} size="sm" className="hidden sm:flex">
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button onClick={handleSaveExam} disabled={saving} size="icon" className="sm:hidden">
            <Save className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/analytics?examId=${examId}&from=edit`)}>
                <BarChart className="mr-2 h-4 w-4" />
                Analytics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicateExam}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeleteExam} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Exam
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="container mx-auto max-w-[1600px] p-4 sm:p-6 grid grid-cols-12 gap-6">
        {/* Left Sidebar: Exam Details & Sections */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold">Edit Exam Details</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExamDetailsCollapsed(!isExamDetailsCollapsed)}
              >
                {isExamDetailsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {!isExamDetailsCollapsed && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <CategoryCombobox value={examCategory} onChange={setExamCategory} />
                </div>
                <div className="space-y-2">
                  <Label>Description <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={examDescription}
                    onChange={(e) => setExamDescription(e.target.value)}
                    rows={4}
                    placeholder="Brief description of the exam..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instruction <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={examInstruction}
                    onChange={(e) => setExamInstruction(e.target.value)}
                    rows={4}
                    placeholder="Specific instructions for the exam..."
                  />
                </div>

              </CardContent>
            )}
          </Card>

          {/* Sections Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-bold">Edit Sections</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSectionsCollapsed(!isSectionsCollapsed)}
              >
                {isSectionsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {!isSectionsCollapsed && (
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
                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-dashed text-muted-foreground hover:text-primary"
                    onClick={handleAddSection}
                  >
                    <Plus className="h-4 w-4" />
                    Add Section
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right Content: Questions */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          {/* Questions List */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0 pb-2">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <CardTitle className="text-lg font-bold">Questions ({questions.length})</CardTitle>
                <Select
                  value={section?.id}
                  onValueChange={(value) => handleSectionChange(value)}
                >
                  <SelectTrigger className="h-8 flex-1 sm:w-[200px] ml-2">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsQuestionsCollapsed(!isQuestionsCollapsed)}
                className="self-end sm:self-auto"
              >
                {isQuestionsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {!isQuestionsCollapsed && (
              <CardContent className="space-y-4 max-h-[380px] overflow-y-auto">
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
                          <div className="flex-1 space-y-2 min-w-0">
                            {q.image_url && (
                              <div className="flex items-center gap-2 text-sm text-blue-600">
                                <ImageIcon className="h-4 w-4" />
                                Has image
                              </div>
                            )}
                            {q.text ? (
                              <div className="font-medium truncate" dangerouslySetInnerHTML={{ __html: q.text }} />
                            ) : (
                              <p className="font-medium">Question with image</p>
                            )}
                            <p className="text-xs text-muted-foreground capitalize">{q.answer_type}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEditQuestion(q)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteQuestionClick(q.id)}
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
                                <div className="text-sm p-3 bg-slate-50 rounded-md" dangerouslySetInnerHTML={{ __html: q.text }} />
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
            )}
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

      {/* Delete Exam Confirmation Dialog */}
      <AlertDialog open={showDeleteExamDialog} onOpenChange={setShowDeleteExamDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{exam?.name}"? This will permanently delete the exam and all associated data (sections, questions, attempts). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteExamDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteExam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Question Confirmation Dialog */}
      <AlertDialog open={showDeleteQuestionDialog} onOpenChange={setShowDeleteQuestionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Question</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this question? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteQuestionDialog(false); setDeleteQuestionId(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteQuestion} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to save them before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => blocker.proceed?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </Button>
            <AlertDialogAction onClick={async (e) => {
              e.preventDefault(); // Keep dialog interaction controlled
              const success = await handleSaveExam();
              if (success) {
                blocker.proceed?.();
              }
            }}>Save & Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Question Changes Dialog (Section Switch) */}
      <AlertDialog open={showUnsavedSectionDialog} onOpenChange={setShowUnsavedSectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the current question. Switching sections will discard these changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowUnsavedSectionDialog(false);
                setPendingSectionId(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardAndSwitchSection}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleSaveAndSwitchSection}
            >
              Save & Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

