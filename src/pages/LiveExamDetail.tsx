import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Play, Save, Trash2, Edit, Plus, Clock, MoreVertical, Share2, Globe, Radio, X, Check, ChevronDown, ChevronUp, Eye, FileText, Sparkles, Copy, Layers, Lock, FileJson } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TransliterateInput } from "@/components/TransliterateInput";
import { TransliterateTextarea } from "@/components/TransliterateTextarea";
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
import { QuestionForm } from "@/components/QuestionForm";
import JsonUploadDialog from "@/components/JsonUploadDialog";
import { liveExamJsonSource } from "@/components/jsonUploadSources";
import type { ParseReport } from "@/services/jsonImportParser";
import { RichTextEditor } from "@/components/RichTextEditor";
const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import SEO from "@/components/SEO";
import {
  fetchLiveExam,
  fetchLiveSections,
  fetchLiveQuestions,
  fetchAllLiveQuestions,
  updateLiveExam,
  duplicateLiveExam,
  updateLiveQuestion,
  createLiveQuestion,
  deleteLiveQuestion,
  createLiveSection,
  deleteLiveSection,
  updateLiveSection,
  fetchLiveQuestionGroupIds,
  deleteLiveQuestionsInSections,
  deleteLiveQuestionsByGroupIds,
  countLiveQuestions,
  type LiveExam,
  type LiveSection,
  type LiveQuestion,
} from "@/services/liveExamService";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳" },
];

const langLabel = (code: string) =>
  AVAILABLE_LANGUAGES.find(l => l.code === code)?.label || code;

export default function LiveExamDetail() {
  const { creatorId, liveExamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Core state
  const [exam, setExam] = useState<LiveExam | null>(null);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [allSections, setAllSections] = useState<LiveSection[]>([]);
  const [activeSection, setActiveSection] = useState<LiveSection | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Language
  const [activeLanguage, setActiveLanguage] = useState("en");

  // Exam form
  const [examTitle, setExamTitle] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [examInstruction, setExamInstruction] = useState("");

  // New question form
  const [questionFormat, setQuestionFormat] = useState("standard");
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("single");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", "", "", ""]);
  const [newQuestionImages, setNewQuestionImages] = useState<string[]>([]);
  const [newQuestionCorrect, setNewQuestionCorrect] = useState<string | string[]>("");
  const [newQuestionTime, setNewQuestionTime] = useState(60);

  // New section form
  const [newSectionName, setNewSectionName] = useState("");

  // Edit states
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  // Delete states
  const [showDeleteQuestionDialog, setShowDeleteQuestionDialog] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [showDeleteSectionDialog, setShowDeleteSectionDialog] = useState(false);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);

  // Collapse states
  const [isExamDetailsCollapsed, setIsExamDetailsCollapsed] = useState(false);
  const [isSectionsCollapsed, setIsSectionsCollapsed] = useState(false);
  const [isQuestionsCollapsed, setIsQuestionsCollapsed] = useState(false);

  // JSON import
  const [showJsonUploadDialog, setShowJsonUploadDialog] = useState(false);

  // Student preview
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ section: LiveSection; questions: LiveQuestion[] }[]>([]);

  const questionFormRef = useRef<HTMLDivElement>(null);

  // Stable array identity: JsonUploadDialog keys an effect off this prop via a
  // useCallback, and that effect always sets state — a fresh literal each
  // render would loop it.
  const liveLanguages = useMemo(() => exam?.supported_languages ?? ["en"], [exam?.supported_languages]);

  // ─── Load exam data ────────────────────────────────────────

  useEffect(() => {
    if (!liveExamId) return;
    loadExam();
  }, [liveExamId]);

  const loadExam = async () => {
    if (!liveExamId) return;
    setLoading(true);
    try {
      const examData = await fetchLiveExam(liveExamId);
      setExam(examData);
      setExamTitle(examData.name);
      setExamDescription(examData.description || "");
      setExamInstruction(examData.instruction || "");
      setActiveLanguage(examData.primary_language || "en");

      const allSecs = await fetchLiveSections(liveExamId);
      setAllSections(allSecs);
      const filteredSections = allSecs.filter(s => s.language === (examData.primary_language || "en"));
      setSections(filteredSections);
      if (filteredSections.length > 0) {
        setActiveSection(filteredSections[0]);
        await loadQuestions(filteredSections[0].id);
      }
    } catch (error: any) {
      toast({ title: "Error loading exam", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (sectionId: string) => {
    try {
      const qs = await fetchLiveQuestions(sectionId);
      setQuestions(qs);
    } catch (error: any) {
      toast({ title: "Error loading questions", description: error.message, variant: "destructive" });
    }
  };

  // ─── Language switch ───────────────────────────────────────

  const handleLanguageChange = async (langCode: string) => {
    setActiveLanguage(langCode);
    const filteredSections = allSections.filter(s => s.language === langCode);
    setSections(filteredSections);
    if (filteredSections.length > 0) {
      setActiveSection(filteredSections[0]);
      await loadQuestions(filteredSections[0].id);
    } else {
      setActiveSection(null);
      setQuestions([]);
    }
  };

  // ─── Save exam details ────────────────────────────────────

  const handleSaveExam = async () => {
    if (!liveExamId || !exam) return;
    setSaving(true);
    try {
      const updated = await updateLiveExam(liveExamId, {
        name: examTitle,
        description: examDescription || null,
        instruction: examInstruction || null,
      });
      setExam(updated);
      toast({ title: "Saved", description: "Exam details saved successfully" });
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Section management ────────────────────────────────────

  const handleAddSection = async () => {
    if (!liveExamId || !newSectionName.trim()) {
      toast({ title: "Enter a section name", variant: "destructive" });
      return;
    }
    try {
      const sortOrder = sections.length;
      const sectionGroupId = crypto.randomUUID();

      // Create section for each supported language
      const languages = exam?.supported_languages || ["en"];
      for (const lang of languages) {
        await createLiveSection(liveExamId, newSectionName, sortOrder, lang, sectionGroupId);
      }

      setNewSectionName("");
      // Reload sections
      const allSecs = await fetchLiveSections(liveExamId);
      setAllSections(allSecs);
      const filtered = allSecs.filter(s => s.language === activeLanguage);
      setSections(filtered);
      if (!activeSection && filtered.length > 0) {
        setActiveSection(filtered[0]);
        await loadQuestions(filtered[0].id);
      }
      toast({ title: "Section added" });
    } catch (error: any) {
      toast({ title: "Error adding section", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteSection = async () => {
    if (!deleteSectionId || !liveExamId) return;
    try {
      // Find the section_group_id to delete across all languages
      const sectionToDelete = allSections.find(s => s.id === deleteSectionId);
      if (sectionToDelete?.section_group_id) {
        const groupSections = allSections.filter(s => s.section_group_id === sectionToDelete.section_group_id);
        for (const sec of groupSections) {
          await deleteLiveSection(sec.id);
        }
      } else {
        await deleteLiveSection(deleteSectionId);
      }

      const allSecs = await fetchLiveSections(liveExamId);
      setAllSections(allSecs);
      const filtered = allSecs.filter(s => s.language === activeLanguage);
      setSections(filtered);

      if (activeSection?.id === deleteSectionId) {
        if (filtered.length > 0) {
          setActiveSection(filtered[0]);
          await loadQuestions(filtered[0].id);
        } else {
          setActiveSection(null);
          setQuestions([]);
        }
      }
      setShowDeleteSectionDialog(false);
      setDeleteSectionId(null);
      toast({ title: "Section deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSwitchSection = async (sectionId: string) => {
    const sec = sections.find(s => s.id === sectionId);
    if (sec) {
      setActiveSection(sec);
      setEditingQuestionId(null);
      setExpandedQuestionId(null);
      await loadQuestions(sec.id);
    }
  };

  // ─── Question management ───────────────────────────────────

  const handleAddQuestion = async () => {
    if (!activeSection || !liveExamId) {
      toast({ title: "Select a section first", variant: "destructive" });
      return;
    }
    if (!newQuestionText.trim()) {
      toast({ title: "Enter question text", variant: "destructive" });
      return;
    }

    try {
      // Next play-order position: max existing global_index + 1, NOT the
      // question count — deleting a non-last question leaves gaps, and
      // reusing a count-derived index would collide with a survivor.
      const existingAll = await fetchAllLiveQuestions(liveExamId, activeLanguage);
      const nextGlobalIndex = existingAll.length > 0
        ? Math.max(...existingAll.map(q => q.global_index)) + 1
        : 0;
      const allQuestionsCount = exam?.total_questions || 0;
      const multiLang = (exam?.supported_languages || []).length > 1;
      // Shared group id links this question to its verbatim copies in other languages
      const questionGroupId = multiLang ? crypto.randomUUID() : undefined;
      // Max-based, like global_index above: a count-derived q_no collides with a
      // survivor after a delete, and the q_no-keyed maps in commitLiveJson would
      // then silently drop a row and mis-pair the languages.
      const qNo = questions.reduce((m, q) => Math.max(m, q.q_no), 0) + 1;
      const questionOptions = newQuestionType === "single" || newQuestionType === "multi"
        ? newQuestionOptions.filter(o => o.trim())
        : null;

      await createLiveQuestion({
        live_section_id: activeSection.id,
        q_no: qNo,
        text: newQuestionText,
        options: questionOptions,
        answer_type: newQuestionType,
        correct_answer: newQuestionCorrect || null,
        time_seconds: newQuestionTime,
        image_urls: newQuestionImages.length > 0 ? newQuestionImages : [],
        global_index: nextGlobalIndex,
        section_label: activeSection.name,
        question_group_id: questionGroupId,
      });

      // Multi-language: create verbatim sibling rows in the other-language
      // sections of the same group (creator translates them later). Same
      // question_group_id, global_index, and q_no so ordinals stay aligned.
      if (multiLang && activeSection.section_group_id && questionGroupId) {
        const siblingSections = allSections.filter(
          s => s.section_group_id === activeSection.section_group_id && s.id !== activeSection.id
        );
        for (const sib of siblingSections) {
          await createLiveQuestion({
            live_section_id: sib.id,
            q_no: qNo,
            text: newQuestionText,
            options: questionOptions,
            answer_type: newQuestionType,
            correct_answer: newQuestionCorrect || null,
            time_seconds: newQuestionTime,
            image_urls: newQuestionImages.length > 0 ? newQuestionImages : [],
            global_index: nextGlobalIndex,
            section_label: sib.name,
            question_group_id: questionGroupId,
          });
        }
      }

      // Update total_questions count on the exam (counted once across languages)
      await updateLiveExam(liveExamId, { total_questions: allQuestionsCount + 1 });
      setExam(prev => prev ? { ...prev, total_questions: allQuestionsCount + 1 } : prev);

      // Reset form
      setNewQuestionText("");
      setNewQuestionType("single");
      setNewQuestionOptions(["", "", "", ""]);
      setNewQuestionImages([]);
      setNewQuestionCorrect("");
      setNewQuestionTime(60);

      await loadQuestions(activeSection.id);
      toast({ title: "Question added" });
    } catch (error: any) {
      toast({ title: "Error adding question", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deleteQuestionId || !activeSection) return;
    try {
      const questionToDelete = questions.find(q => q.id === deleteQuestionId);
      await deleteLiveQuestion(deleteQuestionId);

      // Multi-language: delete sibling rows sharing the question_group_id
      // in the other-language sections of the same group.
      const groupId = questionToDelete?.question_group_id;
      if (groupId && activeSection.section_group_id) {
        const siblingSections = allSections.filter(
          s => s.section_group_id === activeSection.section_group_id && s.id !== activeSection.id
        );
        for (const sib of siblingSections) {
          const sibQuestions = await fetchLiveQuestions(sib.id);
          for (const sq of sibQuestions) {
            if (sq.question_group_id === groupId) {
              await deleteLiveQuestion(sq.id);
            }
          }
        }
      }

      await loadQuestions(activeSection.id);

      // Update total count
      if (liveExamId && exam) {
        const newTotal = Math.max(0, (exam.total_questions || 1) - 1);
        await updateLiveExam(liveExamId, { total_questions: newTotal });
        setExam(prev => prev ? { ...prev, total_questions: newTotal } : prev);
      }

      setShowDeleteQuestionDialog(false);
      setDeleteQuestionId(null);
      toast({ title: "Question deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateQuestion = async (questionId: string, updates: Partial<LiveQuestion>) => {
    try {
      await updateLiveQuestion(questionId, updates);
      if (activeSection) await loadQuestions(activeSection.id);
      setEditingQuestionId(null);
      toast({ title: "Question updated" });
    } catch (error: any) {
      toast({ title: "Error updating", description: error.message, variant: "destructive" });
    }
  };

  // ─── Publish / Share ───────────────────────────────────────

  const handlePublish = async () => {
    if (!liveExamId || !exam) return;

    // Validate: need at least 1 section with 1 question
    if (sections.length === 0) {
      toast({ title: "Cannot publish", description: "Add at least one section with questions.", variant: "destructive" });
      return;
    }

    try {
      const newStatus = exam.status === "draft" ? "published" : "draft";
      const updated = await updateLiveExam(liveExamId, { status: newStatus as any });
      setExam(updated);
      toast({
        title: newStatus === "published" ? "Published!" : "Unpublished",
        description: newStatus === "published"
          ? "Your live exam is now ready. Share the link to invite students."
          : "Exam is now a draft again.",
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleShare = () => {
    if (!exam || exam.status === "draft") {
      toast({ title: "Publish first", description: "Please publish the exam before sharing.", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/live/${exam.share_code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: url });
  };

  // ─── Duplicate ─────────────────────────────────────────────
  // Allowed in every status, including live and ended: re-running a finished
  // quiz with a new batch is the main reason to duplicate one.
  const handleDuplicate = async () => {
    if (!liveExamId || !exam || duplicating) return;

    try {
      setDuplicating(true);
      const newExam = await duplicateLiveExam(liveExamId);
      toast({
        title: "Duplicated",
        description: `"${newExam.name}" is a fresh draft with its own share code. Opening it...`,
      });
      navigate(`/live-exam/${creatorId}/${newExam.id}`);
    } catch (error: any) {
      console.error("Duplicate live exam error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate live exam",
        variant: "destructive",
      });
    } finally {
      setDuplicating(false);
    }
  };

  // ─── Image upload ──────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("question-images").upload(filePath, file);

    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(filePath);

    if (editingQuestionId) {
      const q = questions.find(q => q.id === editingQuestionId);
      if (q) {
        const updatedImages = [...(q.image_urls || []), publicUrl];
        await handleUpdateQuestion(editingQuestionId, { image_urls: updatedImages });
      }
    } else {
      setNewQuestionImages(prev => [...prev, publicUrl]);
    }
  };

  // ─── PDF upload + snipping ─────────────────────────────────

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeSection || !liveExamId) return;

    try {
      toast({ title: "Uploading PDF..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Path must start with user.id — the exam-pdfs bucket's RLS keys on it
      // (live exams aren't in the `exams` table, so the exam-id policy won't match).
      const filePath = `${user.id}/${liveExamId}/${activeSection.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("exam-pdfs")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("exam-pdfs").getPublicUrl(filePath);

      await updateLiveSection(activeSection.id, { pdf_url: publicUrl });
      setActiveSection(prev => prev ? { ...prev, pdf_url: publicUrl } : prev);
      setSections(prev => prev.map(s => s.id === activeSection.id ? { ...s, pdf_url: publicUrl } : s));
      setAllSections(prev => prev.map(s => s.id === activeSection.id ? { ...s, pdf_url: publicUrl } : s));
      toast({ title: "PDF Uploaded", description: "You can now snip questions from this PDF." });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSnip = async (blob: Blob) => {
    if (!activeSection || !liveExamId) return;
    try {
      toast({ title: "Uploading snip..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filePath = `${user.id}/${liveExamId}/${activeSection.id}/snip-${Date.now()}.png`;
      const file = new File([blob], "snip.png", { type: "image/png" });

      const { error } = await supabase.storage.from("question-images").upload(filePath, file, { upsert: true });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from("question-images").getPublicUrl(filePath);
      setNewQuestionImages(prev => [...prev, publicUrl]);
      toast({ title: "Snip added", description: "Image attached to the new question below." });
    } catch (error: any) {
      toast({ title: "Snip failed", description: error.message, variant: "destructive" });
    }
  };

  // ─── JSON import ───────────────────────────────────────────

  /**
   * Commit handler for JsonUploadDialog — the live-exam counterpart of
   * ExamDetail's commitJson. Same modes and cross-language pairing rules,
   * writing the live_* tables. Marks are ignored throughout: live grading is
   * correct/wrong only, so report.marksConfig / sectionMarksConfig /
   * marks_config never reach the DB and no "marks ignored" toast is shown.
   */
  const commitLiveJson = async (
    report: ParseReport,
    mode: "replace" | "append",
    language: string,
    extras?: {
      snipUrls?: Map<string, string>;
      uploadedPdfUrl?: string;
    }
  ): Promise<{ ok: boolean }> => {
    if (!exam || !liveExamId) return { ok: false };

    // This page has no realtime subscription, so `exam` is whatever loadExam()
    // read at mount — it can say "published" while the session is already live
    // in another tab. Re-read before anything destructive: a Replace against a
    // running session CASCADE-deletes its responses and analytics.
    let fresh: LiveExam;
    try {
      fresh = await fetchLiveExam(liveExamId);
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: `Could not verify exam status: ${error?.message ?? String(error)}`,
        variant: "destructive",
      });
      return { ok: false };
    }
    setExam(fresh);
    if (fresh.status === "live" || fresh.status === "ended") {
      toast({
        title: "Cannot import",
        description: "Cannot import — end the live session first.",
        variant: "destructive",
      });
      return { ok: false };
    }

    const primaryLang = fresh.primary_language || "en";
    const isPrimary = language === primaryLang;
    const multiLang = (fresh.supported_languages || []).length > 1;

    const matched = report.perSection.filter(
      s => s.matchedSectionId && s.accepted.length > 0
    );
    if (matched.length === 0) {
      toast({
        title: "Nothing to import",
        description: "No matched sections with questions were found.",
        variant: "destructive",
      });
      return { ok: false };
    }

    try {
      // Sections can be renamed from inside the dialog, so resolve ids/names
      // against a fresh read instead of the page's cached list.
      const dbSections = await fetchLiveSections(liveExamId);

      // Play order is assigned as we walk the sections, so walk them in the
      // exam's own order — JSON order would let a subset import (e.g. replacing
      // only section A) push A's questions behind B's.
      const sortOrderById = new Map<string, number>(dbSections.map(s => [s.id, s.sort_order]));
      const matchedOrdered = matched
        .map((s, jsonIdx) => ({ s, jsonIdx, order: sortOrderById.get(s.matchedSectionId!) }))
        .sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order || a.jsonIdx - b.jsonIdx;
          }
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.jsonIdx - b.jsonIdx;
        })
        .map(e => e.s);

      // [1] Replace — clear every matched section of THIS language (including
      // ones whose JSON block ended up empty), plus the language siblings
      // linked to the cleared questions when importing the primary language.
      const sectionIdsForLang = report.perSection
        .filter(s => s.matchedSectionId)
        .map(s => s.matchedSectionId!) as string[];

      if (mode === "replace") {
        // The dialog's snapshot was taken when it opened; re-count now, because
        // this delete cascades into live_responses and live_question_analytics.
        // Fail closed — an unverifiable count must not authorise the delete.
        const { count: responseCount, error: responseCountError } = await supabase
          .from("live_responses")
          .select("id", { count: "exact", head: true })
          .eq("live_exam_id", liveExamId);
        if (responseCountError) {
          toast({
            title: "Cannot replace",
            description: `Could not verify existing student responses: ${responseCountError.message}`,
            variant: "destructive",
          });
          return { ok: false };
        }
        if ((responseCount ?? 0) > 0) {
          toast({
            title: "Cannot replace",
            description: `${responseCount} student response${responseCount === 1 ? "" : "s"} already exist for this exam — Replace would delete them permanently. Use Append instead.`,
            variant: "destructive",
          });
          return { ok: false };
        }
      }

      if (mode === "replace" && sectionIdsForLang.length > 0) {
        const groupIds = await fetchLiveQuestionGroupIds(sectionIdsForLang);
        await deleteLiveQuestionsInSections(sectionIdsForLang);
        if (isPrimary && groupIds.length > 0) {
          const siblingSectionIds = dbSections
            .filter(s => s.language !== language)
            .map(s => s.id);
          await deleteLiveQuestionsByGroupIds(groupIds, siblingSectionIds);
        }
      }

      // Live play order is the array position of (global_index, q_no, id)
      // within a language and must match across languages. Continue from the
      // highest primary-language index that survived the delete above — never
      // from total_questions, because deletes leave gaps and a reused index
      // would break the ordinal↔question mapping the session runs on.
      const existingPrimary = await fetchAllLiveQuestions(liveExamId, primaryLang);
      let globalIdx = existingPrimary.length > 0
        ? Math.max(...existingPrimary.map(q => q.global_index)) + 1
        : 0;

      let totalCreated = 0;
      let totalSections = 0;
      let skippedNoCounterpart = 0;

      for (const sec of matchedOrdered) {
        const target = dbSections.find(s => s.id === sec.matchedSectionId);
        if (!target) continue;

        const existingInTarget = await fetchLiveQuestions(target.id);
        let maxQNo = existingInTarget.reduce((max, q) => Math.max(max, q.q_no), 0);
        // Replace already emptied the section, so numbering restarts at 1
        const startQNo = mode === "append" ? maxQNo + 1 : 1;

        if (isPrimary) {
          const siblingSections = multiLang && target.section_group_id
            ? dbSections.filter(
                s => s.section_group_id === target.section_group_id && s.id !== target.id
              )
            : [];
          // section id → q_no → row, so an already-present sibling is updated
          // rather than duplicated at the same q_no.
          const siblingRows = new Map<string, Map<number, LiveQuestion>>();
          for (const sib of siblingSections) {
            const rows = await fetchLiveQuestions(sib.id);
            siblingRows.set(sib.id, new Map(rows.map(r => [r.q_no, r])));
          }

          for (let i = 0; i < sec.accepted.length; i++) {
            const aq = sec.accepted[i];
            const qNo = startQNo + i;
            const groupId = multiLang ? crypto.randomUUID() : undefined;
            const timeSeconds = aq.timeSeconds ?? 60;
            const snipUrl = extras?.snipUrls?.get(`${sec.jsonName}::${i}`);

            await createLiveQuestion({
              live_section_id: target.id,
              q_no: qNo,
              text: aq.text,
              options: aq.options,
              answer_type: aq.answer_type,
              correct_answer: aq.correct_answer,
              time_seconds: timeSeconds,
              global_index: globalIdx,
              section_label: target.name,
              question_group_id: groupId,
              image_urls: snipUrl ? [snipUrl] : [],
            });

            // Verbatim copies in the other languages: same group id, q_no and
            // global_index so ordinals stay aligned. The creator translates the
            // text later by switching language — so an existing sibling keeps
            // its own text/options and only re-syncs the shared fields.
            for (const sib of siblingSections) {
              const existingSib = siblingRows.get(sib.id)?.get(qNo);
              if (existingSib && existingSib.question_group_id) {
                // Linked by an earlier primary import, so its text may already be
                // a translation of this question — keep it, re-sync primary's fields.
                await updateLiveQuestion(existingSib.id, {
                  question_group_id: groupId ?? null,
                  global_index: globalIdx,
                  answer_type: aq.answer_type,
                  correct_answer: aq.correct_answer,
                  time_seconds: timeSeconds,
                });
              } else if (existingSib) {
                // Unlinked row: its content is unrelated to this question, so
                // preserving the text would show A while grading against B's
                // answer. Overwrite it as a fresh verbatim copy.
                await updateLiveQuestion(existingSib.id, {
                  text: aq.text,
                  options: aq.options,
                  answer_type: aq.answer_type,
                  correct_answer: aq.correct_answer,
                  time_seconds: timeSeconds,
                  global_index: globalIdx,
                  question_group_id: groupId ?? null,
                  image_urls: snipUrl ? [snipUrl] : [],
                });
              } else {
                await createLiveQuestion({
                  live_section_id: sib.id,
                  q_no: qNo,
                  text: aq.text,
                  options: aq.options,
                  answer_type: aq.answer_type,
                  correct_answer: aq.correct_answer,
                  time_seconds: timeSeconds,
                  global_index: globalIdx,
                  section_label: sib.name,
                  question_group_id: groupId,
                  image_urls: snipUrl ? [snipUrl] : [],
                });
              }
            }

            maxQNo = Math.max(maxQNo, qNo);
            globalIdx += 1;
            totalCreated += 1;
          }
        } else {
          // Secondary language: pair to primary BY POSITION. Primary owns q_no,
          // global_index, group id, answer_type, correct_answer and the timer —
          // a secondary import only writes text/options (+ its own snips), so
          // it can never change primary's answers or shift the play order.
          const primSec = target.section_group_id
            ? dbSections.find(
                s => s.section_group_id === target.section_group_id && s.language === primaryLang
              )
            : undefined;
          const primaryQuestions = primSec
            ? (await fetchLiveQuestions(primSec.id)).sort(
                (a, b) => a.global_index - b.global_index || a.q_no - b.q_no
              )
            : [];

          const rowsByQNo = new Map(existingInTarget.map(r => [r.q_no, r]));

          for (let i = 0; i < sec.accepted.length; i++) {
            const aq = sec.accepted[i];
            const primaryQ = primaryQuestions[i];
            const snipUrl = extras?.snipUrls?.get(`${sec.jsonName}::${i}`);

            // No primary counterpart → this question can never play: the session
            // caps on the primary language's question count. Writing it would
            // duplicate global_index in this language on every re-import and
            // break the ordinal↔question mapping students are graded on.
            if (!primaryQ) {
              skippedNoCounterpart += 1;
              continue;
            }

            const qNo = primaryQ.q_no;
            const gIdx = primaryQ.global_index;
            const groupId = primaryQ.question_group_id;
            const answerType = primaryQ.answer_type;
            const correctAnswer = primaryQ.correct_answer ?? null;
            const timeSeconds = primaryQ.time_seconds;

            const existingRow = rowsByQNo.get(qNo);
            if (existingRow) {
              const updates: Partial<LiveQuestion> = {
                text: aq.text,
                options: aq.options,
                answer_type: answerType,
                correct_answer: correctAnswer,
                question_group_id: groupId,
                global_index: gIdx,
                time_seconds: timeSeconds,
              };
              // Only touch image_urls when this import actually produced a snip
              // — never blank out an image the creator attached by hand.
              if (snipUrl) updates.image_urls = [snipUrl];
              await updateLiveQuestion(existingRow.id, updates);
            } else {
              await createLiveQuestion({
                live_section_id: target.id,
                q_no: qNo,
                text: aq.text,
                options: aq.options,
                answer_type: answerType,
                correct_answer: correctAnswer,
                time_seconds: timeSeconds,
                global_index: gIdx,
                section_label: target.name,
                question_group_id: groupId ?? undefined,
                image_urls: snipUrl ? [snipUrl] : [],
              });
            }

            totalCreated += 1;
          }
        }

        totalSections += 1;
      }

      // [2] Renumber play order across the PRIMARY language by
      // (section sort_order, q_no) starting at 0, mirroring each value onto the
      // question's language siblings through question_group_id. Ordinals are
      // array positions, so this doesn't renumber the ordinals themselves — it
      // makes the order they're derived from match the editor's visible order
      // (a subset Replace otherwise appends above the surviving max, playing a
      // later section first). Values are 0..n-1 by construction, so the primary
      // language can't come out with a duplicate global_index.
      const primarySections = dbSections
        .filter(s => s.language === primaryLang)
        .sort((a, b) => a.sort_order - b.sort_order);
      const orderedPrimary: LiveQuestion[] = [];
      for (const ps of primarySections) {
        const rows = await fetchLiveQuestions(ps.id);
        rows.sort((a, b) => a.q_no - b.q_no || a.id.localeCompare(b.id));
        orderedPrimary.push(...rows);
      }
      if (orderedPrimary.some((q, idx) => q.global_index !== idx)) {
        const otherLangSections = dbSections.filter(s => s.language !== primaryLang);
        const siblingsByGroup = new Map<string, LiveQuestion[]>();
        for (const other of otherLangSections) {
          for (const row of await fetchLiveQuestions(other.id)) {
            if (!row.question_group_id) continue;
            const list = siblingsByGroup.get(row.question_group_id) ?? [];
            list.push(row);
            siblingsByGroup.set(row.question_group_id, list);
          }
        }
        for (let idx = 0; idx < orderedPrimary.length; idx++) {
          const q = orderedPrimary[idx];
          if (q.global_index !== idx) {
            await updateLiveQuestion(q.id, { global_index: idx });
          }
          if (!q.question_group_id) continue;
          for (const sib of siblingsByGroup.get(q.question_group_id) ?? []) {
            if (sib.global_index !== idx) {
              await updateLiveQuestion(sib.id, { global_index: idx });
            }
          }
        }
      }

      // [3] PDF goes on the matched sections of THIS language only — primary's
      // and each secondary's PDFs stay independent.
      if (extras?.uploadedPdfUrl) {
        for (const sec of matchedOrdered) {
          await updateLiveSection(sec.matchedSectionId!, { pdf_url: extras.uploadedPdfUrl });
        }
      }

      // [4] Recount rather than add — replaces, secondary updates and earlier
      // deletes all make an incremented total drift, so this self-heals.
      const newTotal = await countLiveQuestions(liveExamId, primaryLang);
      await updateLiveExam(liveExamId, { total_questions: newTotal });
      setExam(prev => prev ? { ...prev, total_questions: newTotal } : prev);

      // [5] Resync the page: names may have been edited inside the dialog and
      // the active section's questions have just changed.
      const refreshed = await fetchLiveSections(liveExamId);
      setAllSections(refreshed);
      const forActiveLang = refreshed.filter(s => s.language === activeLanguage);
      setSections(forActiveLang);
      const nextActive = forActiveLang.find(s => s.id === activeSection?.id) ?? forActiveLang[0] ?? null;
      setActiveSection(nextActive);
      if (nextActive) await loadQuestions(nextActive.id);
      else setQuestions([]);

      // One toast, because only the newest is rendered — a separate skip warning
      // would hide the counts (or be hidden by them).
      const createdLine = `Created ${totalCreated} question${totalCreated === 1 ? "" : "s"} across ${totalSections} section${totalSections === 1 ? "" : "s"} in ${language}`;
      if (skippedNoCounterpart > 0) {
        toast({
          title: "Import complete — questions skipped",
          description: `${createdLine}. ${skippedNoCounterpart} question${skippedNoCounterpart === 1 ? "" : "s"} in ${langLabel(language)} ${skippedNoCounterpart === 1 ? "has" : "have"} no counterpart in ${langLabel(primaryLang)} and ${skippedNoCounterpart === 1 ? "was" : "were"} skipped — add ${skippedNoCounterpart === 1 ? "it" : "them"} to ${langLabel(primaryLang)} first.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Import complete", description: createdLine });
      }
      return { ok: true };
    } catch (error: any) {
      console.error("commitLiveJson error:", error);
      toast({
        title: "Import failed",
        description: error?.message ?? String(error),
        variant: "destructive",
      });
      return { ok: false };
    }
  };

  // ─── Student preview ───────────────────────────────────────

  const handleOpenPreview = async () => {
    if (!liveExamId) return;
    setShowPreviewDialog(true);
    setPreviewLoading(true);
    try {
      const all = await fetchAllLiveQuestions(liveExamId, activeLanguage);
      setPreviewData(sections.map(sec => ({
        section: sec,
        questions: all.filter(q => q.live_section_id === sec.id),
      })));
    } catch (error: any) {
      toast({ title: "Error loading preview", description: error.message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Live exam not found</p>
        <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  const isMultiLang = (exam.supported_languages || []).length > 1;
  const activeLangLabel = langLabel(activeLanguage);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <SEO title={`${exam.name} | Live Exam Editor`} description="Edit your live exam" path={`/live-exam/${creatorId}/${liveExamId}`} noindex />

        {/* ─── Top Bar ─── */}
        <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="container mx-auto max-w-7xl px-6">
            <div className="flex h-14 items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="hover:bg-muted">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 text-[10px] font-semibold uppercase tracking-wider">
                    <Radio className="h-3 w-3 mr-1" />
                    Live Exam
                  </Badge>
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{exam.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Language Switcher */}
                {isMultiLang && (
                  <Select value={activeLanguage} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-[130px] h-9">
                      <Globe className="h-4 w-4 mr-1 text-blue-500" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(exam.supported_languages || ["en"]).map(langCode => {
                        const lang = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                        return (
                          <SelectItem key={langCode} value={langCode}>
                            {lang?.flag} {lang?.label || langCode}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {/* Status badge */}
                <Badge className={`text-xs font-medium ${
                  exam.status === "live" ? "bg-red-500 text-white animate-pulse" :
                  exam.status === "published" ? "bg-blue-500/15 text-blue-700 border-blue-500/30" :
                  exam.status === "ended" ? "bg-gray-500/15 text-gray-600" :
                  "bg-yellow-500/15 text-yellow-700 border-yellow-500/30"
                }`}>
                  {exam.status === "live" && "🔴 "}
                  {exam.status.charAt(0).toUpperCase() + exam.status.slice(1)}
                </Badge>

                {/* Publish / Unpublish */}
                {(exam.status === "draft" || exam.status === "published") && (
                  <Button
                    onClick={handlePublish}
                    variant={exam.status === "draft" ? "default" : "outline"}
                    size="sm"
                    className={exam.status === "draft" ? "bg-blue-600 hover:bg-blue-700" : ""}
                  >
                    {exam.status === "draft" ? "Publish" : "Unpublish"}
                  </Button>
                )}

                {/* Go Live (only when published) */}
                {exam.status === "published" && (
                  <Button
                    onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}/control`)}
                    className="bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
                    size="sm"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Go Live
                  </Button>
                )}

                {/* Preview as student */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleOpenPreview}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview as student</TooltipContent>
                </Tooltip>

                {/* Overflow menu — same shape as the mock exam editor's ⋮ */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleShare}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setShowJsonUploadDialog(true)}
                      disabled={exam.status === "live" || exam.status === "ended"}
                    >
                      <FileJson className="mr-2 h-4 w-4" />
                      Upload JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
                      <Copy className="mr-2 h-4 w-4" />
                      {duplicating ? "Duplicating..." : "Duplicate"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>

        {/* ─── Main Content ─── */}
        <main className="container mx-auto max-w-7xl px-6 py-8">
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar */}
            <div className="lg:col-span-3 lg:sticky lg:top-20 space-y-6">
          {/* Exam Details Card */}
          <Card className="border-border/60">
            <CardHeader className="cursor-pointer" onClick={() => setIsExamDetailsCollapsed(!isExamDetailsCollapsed)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Exam Details</CardTitle>
                {isExamDetailsCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </div>
            </CardHeader>
            {!isExamDetailsCollapsed && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Exam Name</Label>
                  <Input
                    value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    placeholder="Exam name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                  <TransliterateTextarea
                    lang={activeLanguage}
                    value={examDescription}
                    onValueChange={setExamDescription}
                    placeholder="Brief description..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instructions <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                  <TransliterateTextarea
                    lang={activeLanguage}
                    value={examInstruction}
                    onValueChange={setExamInstruction}
                    placeholder="Instructions for students..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <Button onClick={handleSaveExam} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Details"}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Sections Card */}
          <Card className="border-border/60">
            <CardHeader className="cursor-pointer" onClick={() => setIsSectionsCollapsed(!isSectionsCollapsed)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">
                  Sections ({sections.length})
                </CardTitle>
                {isSectionsCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </div>
            </CardHeader>
            {!isSectionsCollapsed && (
              <CardContent className="space-y-4">
                {/* Section tabs */}
                {sections.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sections.map((sec) => (
                      <button
                        key={sec.id}
                        onClick={() => handleSwitchSection(sec.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          activeSection?.id === sec.id
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {sec.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteSectionId(sec.id);
                            setShowDeleteSectionDialog(true);
                          }}
                          className="ml-1 opacity-60 hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
                {/* Add new section */}
                <div className="flex gap-3">
                  <TransliterateInput
                    lang={activeLanguage}
                    placeholder="New section name..."
                    value={newSectionName}
                    onValueChange={setNewSectionName}
                    className="flex-1"
                  />
                  <Button onClick={handleAddSection} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

                      </div>

            {/* Main Area */}
            <div className="lg:col-span-9 space-y-6">
          {/* Questions Card */}
          {activeSection && (
            <Card className="border-border/60">
              <CardHeader className="cursor-pointer" onClick={() => setIsQuestionsCollapsed(!isQuestionsCollapsed)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    Questions in "{activeSection.name}" ({questions.length})
                  </CardTitle>
                  {isQuestionsCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                </div>
              </CardHeader>
              {!isQuestionsCollapsed && (
                <CardContent className="space-y-6">
                  {/* Existing questions list */}
                  {questions.length > 0 && (
                    <div className="space-y-3">
                      {questions.map((q, idx) => (
                        <div
                          key={q.id}
                          className={`p-4 rounded-xl border transition-all ${
                            expandedQuestionId === q.id
                              ? "border-blue-500/50 bg-blue-500/[0.02] shadow-sm"
                              : "border-border/60 hover:border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              className="flex-1 text-left"
                              onClick={() => setExpandedQuestionId(expandedQuestionId === q.id ? null : q.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                                  {q.q_no}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{q.text.replace(/<[^>]*>/g, '').substring(0, 100)}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-[10px]">{q.answer_type}</Badge>
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {q.time_seconds}s
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setEditingQuestionId(q.id);
                                  setExpandedQuestionId(q.id);
                                }}>
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setDeleteQuestionId(q.id);
                                    setShowDeleteQuestionDialog(true);
                                  }}
                                  className="text-destructive"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Expanded view */}
                          {expandedQuestionId === q.id && !editingQuestionId && (
                            <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                              <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.text) }} />
                              {q.options && Array.isArray(q.options) && (
                                <div className="space-y-1.5">
                                  {q.options.map((opt: string, optIdx: number) => {
                                    const isCorrect = Array.isArray(q.correct_answer)
                                      ? q.correct_answer.includes(optIdx) || q.correct_answer.includes(String(optIdx))
                                      : String(q.correct_answer) === String(optIdx);
                                    return (
                                      <div key={optIdx} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isCorrect ? "bg-blue-500/10 text-blue-700 font-medium" : "bg-muted/30"}`}>
                                        <span className="w-6 text-center font-mono text-xs">{String.fromCharCode(65 + optIdx)}</span>
                                        <span dangerouslySetInnerHTML={{ __html: renderMathInText(opt) }} />
                                        {isCorrect && <Check className="h-4 w-4 ml-auto text-blue-600" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {(q.answer_type === "numeric" || q.answer_type === "text") && q.correct_answer !== null && (
                                <p className="text-sm">
                                  <span className="text-muted-foreground">Correct Answer: </span>
                                  <span className="font-medium text-blue-600">{JSON.stringify(q.correct_answer)}</span>
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {q.time_seconds} seconds</span>
                              </div>
                            </div>
                          )}

                          {/* Edit mode */}
                          {editingQuestionId === q.id && (
                            <div className="mt-4 pt-4 border-t border-border/40 space-y-4">
                              <EditQuestionInline
                                question={q}
                                lang={activeLanguage}
                                onSave={(updates) => handleUpdateQuestion(q.id, updates)}
                                onCancel={() => setEditingQuestionId(null)}
                                onImageUpload={handleImageUpload}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new question form */}
                  <div ref={questionFormRef} className="border-t border-border/40 pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                      <h4 className="text-base font-semibold flex items-center gap-2">
                        <Plus className="h-5 w-5 text-blue-500" />
                        Add New Question
                      </h4>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:inline-block">Format</span>
                        <Select value={questionFormat} onValueChange={setQuestionFormat}>
                          <SelectTrigger className="w-full sm:w-[280px] h-auto py-2 rounded-lg bg-card">
                            <SelectValue placeholder="Select format" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard" className="py-2 group">
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-foreground group-focus:text-white">Standard Question</span>
                                <span className="text-xs font-medium text-muted-foreground group-focus:text-white/80">Single question with options</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="passage" className="py-2 group">
                              <div className="flex flex-col text-left">
                                <span className="font-bold text-foreground group-focus:text-white">Passage-based Question</span>
                                <span className="text-xs font-medium text-muted-foreground group-focus:text-white/80">Question linked to a shared passage</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Tabs defaultValue="pdf" className="w-full mb-6">
                      <TabsList className="grid w-full grid-cols-2 mb-6 h-11 rounded-xl p-1">
                        <TabsTrigger value="pdf" className="rounded-lg text-xs sm:text-sm font-semibold">PDF Snipping/Direct Upload</TabsTrigger>
                        <TabsTrigger value="ai" className="gap-2 rounded-lg text-xs sm:text-sm font-semibold">
                          AI Parse
                          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20">
                            Coming Soon
                          </Badge>
                        </TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="pdf" className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload PDF Document</Label>
                          <Button
                            variant="outline"
                            className="w-full h-14 rounded-xl border-dashed text-muted-foreground hover:text-blue-600 hover:border-blue-500/40 hover:bg-blue-500/[0.03]"
                            onClick={() => document.getElementById('live-pdf-upload')?.click()}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            {activeSection?.pdf_url ? "Change PDF File" : "Select PDF File"}
                            <input
                              id="live-pdf-upload"
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={handlePdfUpload}
                            />
                          </Button>
                        </div>

                        {activeSection?.pdf_url ? (
                          <div className="border border-border/70 rounded-xl overflow-hidden h-[600px] shadow-sm">
                            <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading PDF viewer…</div>}>
                              <PdfSnipper
                                pdfUrl={activeSection.pdf_url}
                                onSnip={handleSnip}
                              />
                            </Suspense>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-14 border border-dashed border-border rounded-xl bg-muted/30">
                            <div className="h-12 w-12 rounded-2xl bg-card border border-border/70 flex items-center justify-center mb-3">
                              <FileText className="h-6 w-6 text-muted-foreground/60" />
                            </div>
                            <p className="text-sm font-semibold text-foreground">No PDF uploaded</p>
                            <p className="text-xs text-muted-foreground mt-1">Upload a PDF to start snipping questions.</p>
                          </div>
                        )}
                      </TabsContent>
                      <TabsContent value="ai">
                         <div className="p-4 bg-muted/30 rounded-xl border border-dashed text-center text-muted-foreground text-sm">
                          <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          AI Parser Coming Soon
                        </div>
                      </TabsContent>
                    </Tabs>

                    <div className="space-y-4">
                      {/* Time per question */}
                      <div className="flex items-center gap-3">
                        <Label className="text-sm whitespace-nowrap flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-blue-500" />
                          Time for this question
                        </Label>
                        <Input
                          type="number"
                          min={5}
                          max={600}
                          value={newQuestionTime}
                          onChange={e => setNewQuestionTime(Math.max(5, parseInt(e.target.value) || 60))}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">seconds</span>
                      </div>

                      <QuestionForm
                        text={newQuestionText}
                        setText={setNewQuestionText}
                        type={newQuestionType}
                        setType={setNewQuestionType}
                        options={newQuestionOptions}
                        setOptions={setNewQuestionOptions}
                        correct={newQuestionCorrect}
                        setCorrect={(v) => setNewQuestionCorrect(Array.isArray(v) ? v.map(String) : String(v))}
                        images={newQuestionImages}
                        onImageUpload={handleImageUpload}
                        onImageRemove={(idx) => setNewQuestionImages(prev => prev.filter((_, i) => i !== idx))}
                        onAdd={handleAddQuestion}
                        showImageUpload
                        lang={activeLanguage}
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* No sections message */}
          {!activeSection && !loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 py-16 px-6 text-center">
              <p className="text-muted-foreground mb-4">Add a section above to start adding questions</p>
            </div>
          )}
                    </div>
          </div>
        </main>

        {/* Delete Question Dialog */}
        <AlertDialog open={showDeleteQuestionDialog} onOpenChange={setShowDeleteQuestionDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Question</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure? This will permanently delete this question.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteQuestion} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Section Dialog */}
        <AlertDialog open={showDeleteSectionDialog} onOpenChange={setShowDeleteSectionDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Section</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the section and ALL its questions across all languages. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteSection} className="bg-destructive text-destructive-foreground">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* JSON Upload Dialog — same component the mock exam editor uses */}
        {exam && liveExamId && (
          <JsonUploadDialog
            open={showJsonUploadDialog}
            onOpenChange={setShowJsonUploadDialog}
            examId={liveExamId}
            supportedLanguages={liveLanguages}
            primaryLanguage={exam.primary_language || "en"}
            docsUrl="/json-upload-guide"
            dataSource={liveExamJsonSource}
            commitJson={commitLiveJson}
          />
        )}

        {/* Student Preview Dialog */}
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                Student Preview
              </DialogTitle>
              <DialogDescription>
                How questions will appear to students ({activeLangLabel}). Correct answers are not shown.
              </DialogDescription>
            </DialogHeader>

            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 rounded-full border-2 border-muted border-t-foreground animate-spin" />
              </div>
            ) : previewData.length === 0 || previewData.every(g => g.questions.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">No questions yet.</p>
            ) : (
              <div className="space-y-6">
                {previewData.map(({ section: sec, questions: qs }) => (
                  <div key={sec.id} className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {sec.name}
                    </h3>
                    {qs.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">No questions in this section.</p>
                    ) : (
                      qs.map((q) => (
                        <div key={q.id} className="p-4 rounded-xl border border-border/60 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                              {q.q_no}
                            </div>
                            <Badge variant="secondary" className="text-[11px] shrink-0">
                              <Clock className="h-3 w-3 mr-1" />
                              {q.time_seconds}s
                            </Badge>
                          </div>
                          <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.text) }} />
                          {(q.image_urls || []).map((url, i) => (
                            <img key={i} src={url} alt={`Question ${q.q_no} image ${i + 1}`} className="max-h-64 rounded-lg border border-border/60 object-contain" />
                          ))}
                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <div className="space-y-1.5">
                              {q.options.map((opt: string, optIdx: number) => (
                                <div key={optIdx} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-muted/30">
                                  <span className="w-6 text-center font-mono text-xs">{String.fromCharCode(65 + optIdx)}</span>
                                  <span dangerouslySetInnerHTML={{ __html: renderMathInText(opt) }} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ─── Inline Edit Component ───────────────────────────────────

function EditQuestionInline({
  question,
  lang,
  onSave,
  onCancel,
  onImageUpload,
}: {
  question: LiveQuestion;
  lang: string;
  onSave: (updates: Partial<LiveQuestion>) => void;
  onCancel: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [text, setText] = useState(question.text);
  const [type, setType] = useState(question.answer_type);
  const [options, setOptions] = useState<string[]>(
    Array.isArray(question.options) ? question.options : ["", "", "", ""]
  );
  const [correct, setCorrect] = useState<string | string[]>(
    question.correct_answer ?? ""
  );
  const [timeSeconds, setTimeSeconds] = useState(question.time_seconds);
  const [images, setImages] = useState<string[]>(question.image_urls || []);

  const handleSave = () => {
    onSave({
      text,
      answer_type: type,
      options: type === "single" || type === "multi" ? options.filter(o => o.trim()) : null,
      correct_answer: correct || null,
      time_seconds: timeSeconds,
      image_urls: images,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-blue-500" />
          Time
        </Label>
        <Input
          type="number"
          min={5}
          max={600}
          value={timeSeconds}
          onChange={e => setTimeSeconds(Math.max(5, parseInt(e.target.value) || 60))}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">seconds</span>
      </div>

      <QuestionForm
        text={text}
        setText={setText}
        type={type}
        setType={setType}
        options={options}
        setOptions={setOptions}
        correct={correct}
        setCorrect={(v) => setCorrect(Array.isArray(v) ? v.map(String) : String(v))}
        images={images}
        onImageUpload={onImageUpload}
        onImageRemove={(idx) => setImages(prev => prev.filter((_, i) => i !== idx))}
        onAdd={handleSave}
        isEditing
        showImageUpload
        lang={lang}
      />

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
