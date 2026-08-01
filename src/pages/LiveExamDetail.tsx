import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { isRichTextEmpty } from "@/lib/richText";
import { uploadQuestionImage } from "@/lib/questionImageUpload";
import { tableHasColumn } from "@/lib/dbFeatures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import SortableQuestionRow from "@/components/live/SortableQuestionRow";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, Play, Save, Trash2, Edit, Plus, Clock, MoreVertical, Share2, Globe, Radio, Check, ChevronDown, ChevronUp, Eye, FileText, Sparkles, Copy, Layers, Lock, FileJson, ListChecks, HelpCircle, AlertCircle, Image as ImageIcon, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { RichTextEditor } from "@/components/RichTextEditor";
import JsonUploadDialog from "@/components/JsonUploadDialog";
import { liveExamJsonSource } from "@/components/jsonUploadSources";
import type { ParseReport } from "@/services/jsonImportParser";
const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableSectionItem } from "@/components/SortableSectionItem";
import { SectionNameEditor } from "@/components/SectionNameEditor";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  syncLiveQuestionSectionLabels,
  renumberLiveGlobalIndexes,
  renumberLiveGlobalIndexesRpc,
  reorderLiveSectionQuestions,
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
  const [passageText, setPassageText] = useState("");
  const [passageImage, setPassageImage] = useState<string | null>(null);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("single");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>(["", "", "", ""]);
  // Per-option images aligned with newQuestionOptions (null = none) — same
  // contract as the mock editor in ExamDetail.
  const [newQuestionOptionImages, setNewQuestionOptionImages] = useState<(string | null)[]>([null, null, null, null]);
  const [optionImageBusy, setOptionImageBusy] = useState(false);
  const [newQuestionImages, setNewQuestionImages] = useState<string[]>([]);
  const [newQuestionCorrect, setNewQuestionCorrect] = useState<string | string[]>("");
  const [newQuestionTime, setNewQuestionTime] = useState(60);

  // Section drag-to-reorder
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    // Drop any half-finished edit: the question being edited belongs to the
    // language we're leaving, so keeping the draft would write it to the wrong row.
    setEditingQuestionId(null);
    setExpandedQuestionId(null);
    resetQuestionForm();
    // Re-sort: an in-session drag reorder updates sort_order values without
    // reordering the allSections array itself.
    const filteredSections = allSections
      .filter(s => s.language === langCode)
      .sort((a, b) => a.sort_order - b.sort_order);
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
    if (!liveExamId) return;
    try {
      // Max-based, not count-based: deleting a middle section leaves gaps and
      // a count-derived order would collide with a survivor.
      const sortOrder = sections.reduce((m, s) => Math.max(m, s.sort_order + 1), 0);
      const sectionGroupId = crypto.randomUUID();

      // Create section for each supported language
      const languages = exam?.supported_languages || ["en"];
      for (const lang of languages) {
        await createLiveSection(liveExamId, "New Section", sortOrder, lang, sectionGroupId);
      }

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
      // Same reason as the language switch: an in-progress edit belongs to the
      // section we're leaving.
      if (editingQuestionId) resetQuestionForm();
      setEditingQuestionId(null);
      setExpandedQuestionId(null);
      await loadQuestions(sec.id);
    }
  };

  const handleLocalUpdateSection = (sectionId: string, updates: Partial<LiveSection>) => {
    setSections(prev => prev.map(s => s.id === sectionId ? { ...s, ...updates } : s));
    setAllSections(prev => prev.map(s => s.id === sectionId ? { ...s, ...updates } : s));
    setActiveSection(prev => prev?.id === sectionId ? { ...prev, ...updates } : prev);
  };

  const handleRenameSection = async (sectionId: string, rawName: string) => {
    if (!liveExamId) return;
    const name = rawName.trim();
    if (!name) {
      // Blank name — reload from DB to revert the local edit
      const allSecs = await fetchLiveSections(liveExamId);
      setAllSections(allSecs);
      setSections(allSecs.filter(s => s.language === activeLanguage));
      setActiveSection(prev => prev ? allSecs.find(s => s.id === prev.id) ?? prev : prev);
      return;
    }
    try {
      await updateLiveSection(sectionId, { name });
      // Students group questions by their denormalized section_label — keep
      // existing questions in step with the rename.
      await syncLiveQuestionSectionLabels(sectionId, name);
      handleLocalUpdateSection(sectionId, { name });
    } catch (error: any) {
      toast({ title: "Error renaming section", description: error.message, variant: "destructive" });
    }
  };

  /**
   * C7. Reorder questions inside one section.
   *
   * Optimistic, then atomic. The old client-side renumber issued one UPDATE per
   * question — up to 400 sequential round trips on a large bilingual exam — and a
   * failure halfway left an order matching neither the old nor the new. Play order
   * IS the exam, so a half-applied reorder is corruption. The RPC does the q_no
   * rewrite, the language-sibling propagation and the global renumber in one
   * transaction.
   */
  const canReorder = exam?.status !== "live" && exam?.status !== "ended";

  const handleQuestionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeSection) return;
    if (!canReorder) {
      toast({
        title: "Cannot reorder",
        description: "Questions can't be reordered once the exam has gone live.",
        variant: "destructive",
      });
      return;
    }

    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = questions;
    const next = arrayMove(questions, oldIndex, newIndex);
    // Renumber locally so the list does not visibly snap back before the save.
    setQuestions(next.map((q, i) => ({ ...q, q_no: i + 1 })));

    try {
      await reorderLiveSectionQuestions(activeSection.id, next.map((q) => q.id));
    } catch (error: any) {
      // Rollback: a wrong order shown as if saved is worse than a visible failure.
      setQuestions(previous);
      toast({
        title: "Couldn't save the new order",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSectionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (exam?.status === "live" || exam?.status === "ended") {
      toast({
        title: "Cannot reorder",
        description: "Sections can't be reordered once the exam has gone live.",
        variant: "destructive",
      });
      return;
    }

    const oldIndex = sections.findIndex(s => s.id === active.id);
    const newIndex = sections.findIndex(s => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sections, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i }));
    setSections(reordered);

    // Mirror the new order onto every language via section_group_id
    const orderByGroup = new Map(
      reordered.filter(s => s.section_group_id).map(s => [s.section_group_id, s.sort_order])
    );
    const orderById = new Map(reordered.map(s => [s.id, s.sort_order]));
    const previousOrderById = new Map(allSections.map(s => [s.id, s.sort_order]));
    const newAll = allSections.map(s => {
      const order = orderById.get(s.id) ?? (s.section_group_id ? orderByGroup.get(s.section_group_id) : undefined);
      return order !== undefined ? { ...s, sort_order: order } : s;
    });
    setAllSections(newAll);
    setActiveSection(prev => prev ? newAll.find(s => s.id === prev.id) ?? prev : prev);

    try {
      const changed = newAll.filter(s => previousOrderById.get(s.id) !== s.sort_order);
      for (const s of changed) {
        await updateLiveSection(s.id, { sort_order: s.sort_order });
      }
      // Play order follows section order — renumber global_index accordingly.
      if (liveExamId) await renumberLiveGlobalIndexes(liveExamId);
      toast({ title: "Sections reordered" });
    } catch (error: any) {
      toast({ title: "Error saving order", description: error.message, variant: "destructive" });
    }
  };

  // ─── Question management ───────────────────────────────────

  // Validation surfaced on each question row, mirroring the mock editor's
  // error badge so the same problems are visible in both editors.
  const getQuestionErrors = (q: LiveQuestion): string[] => {
    const errors: string[] = [];

    const hasContent =
      (q.text && q.text.replace(/<[^>]+>/g, "").trim() !== "") ||
      !!q.image_url ||
      (Array.isArray(q.image_urls) && q.image_urls.length > 0);
    if (!hasContent) errors.push("Question is empty — add text or attach an image.");

    if (q.answer_type === "single" || q.answer_type === "multi") {
      const opts = Array.isArray(q.options) ? q.options : [];
      const filled = opts.filter((o: string) => typeof o === "string" && !isRichTextEmpty(o));
      if (filled.length < 2) {
        errors.push(`Only ${filled.length} option${filled.length === 1 ? "" : "s"} filled — add at least 2 answer choices.`);
      }
    }

    const hasCorrectAnswer = Array.isArray(q.correct_answer)
      ? q.correct_answer.length > 0
      : q.correct_answer !== null && q.correct_answer !== undefined && String(q.correct_answer).trim() !== "";
    if (!hasCorrectAnswer) errors.push("No correct answer marked — students can't be scored on this question.");

    return errors;
  };

  const resetQuestionForm = () => {
    setNewQuestionText("");
    setNewQuestionType("single");
    setNewQuestionOptions(["", "", "", ""]);
    setNewQuestionOptionImages([null, null, null, null]);
    setNewQuestionImages([]);
    setNewQuestionCorrect("");
    setNewQuestionTime(60);
    setPassageText("");
    setPassageImage(null);
  };

  const handleAddQuestion = async () => {
    if (!activeSection || !liveExamId) {
      toast({ title: "Select a section first", variant: "destructive" });
      return;
    }
    // Validate passage content for passage-based questions
    if (questionFormat === "passage") {
      const strippedPassageText = passageText ? passageText.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
      const hasPassageText = strippedPassageText !== '';
      const hasPassageImage = passageImage !== null && passageImage !== '';

      if (!hasPassageText && !hasPassageImage) {
        toast({
          title: "Missing Passage Content",
          description: "For passage-based questions, please provide either passage text or a passage image.",
          variant: "destructive",
        });
        return;
      }
    }
    // Snipping is the primary flow here, so an image-only question is valid —
    // same rule as the mock editor.
    if (!newQuestionText.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() && newQuestionImages.length === 0) {
      toast({
        title: "Missing Question Content",
        description: "Please provide either question text or an image before saving.",
        variant: "destructive",
      });
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

      // Same rules as the mock editor: an option is "filled" when it has text
      // OR an attached image; dropping blank rows shifts indices, so the
      // index-based correct answer must be remapped onto the kept order.
      const isChoice = newQuestionType === "single" || newQuestionType === "multi";
      const keptIdx = isChoice
        ? newQuestionOptions
            .map((_, i) => i)
            .filter((i) => !isRichTextEmpty(newQuestionOptions[i]) || !!newQuestionOptionImages[i])
        : [];
      const idxMap = new Map(keptIdx.map((oldI, newI) => [String(oldI), String(newI)]));
      const remap = (v: any) => (idxMap.has(String(v)) ? idxMap.get(String(v)) : v);
      const remappedCorrect = isChoice
        ? (Array.isArray(newQuestionCorrect)
            ? newQuestionCorrect.map(remap)
            : remap(newQuestionCorrect))
        : newQuestionCorrect;
      const questionOptions = isChoice ? keptIdx.map((i) => newQuestionOptions[i]) : null;
      const keptImages = keptIdx.map((i) => newQuestionOptionImages[i] ?? null);

      let optionImagesField: { option_image_urls?: (string | null)[] } = {};
      if (isChoice && keptImages.some(Boolean)) {
        if (!(await tableHasColumn("live_questions", "option_image_urls"))) {
          toast({
            title: "Database update needed for option images",
            description:
              "Run migration 20260731100000_live_option_image_urls.sql in the Supabase SQL editor, reload, and save again.",
            variant: "destructive",
          });
          return;
        }
        optionImagesField = { option_image_urls: keptImages };
      }

      const questionText = (questionFormat === "passage" && (passageText || passageImage))
        ? `<div class="passage-section">${passageImage ? `<img src="${passageImage}" class="passage-image mb-4 w-full h-auto rounded-lg" />` : ""}${passageText}</div><div class="question-section">${newQuestionText || ""}</div>`
        : newQuestionText;

      await createLiveQuestion({
        live_section_id: activeSection.id,
        q_no: qNo,
        text: questionText,
        options: questionOptions,
        answer_type: newQuestionType,
        correct_answer: remappedCorrect || null,
        time_seconds: newQuestionTime,
        image_urls: newQuestionImages.length > 0 ? newQuestionImages : [],
        ...optionImagesField,
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
            text: questionText,
            options: questionOptions,
            answer_type: newQuestionType,
            // Remapped, same as the primary — the sibling shares the filtered
            // option order, so the raw index would point at the wrong option.
            correct_answer: remappedCorrect || null,
            time_seconds: newQuestionTime,
            image_urls: newQuestionImages.length > 0 ? newQuestionImages : [],
            ...optionImagesField,
            global_index: nextGlobalIndex,
            section_label: sib.name,
            question_group_id: questionGroupId,
          });
        }
      }

      // Update total_questions count on the exam (counted once across languages)
      await updateLiveExam(liveExamId, { total_questions: allQuestionsCount + 1 });
      setExam(prev => prev ? { ...prev, total_questions: allQuestionsCount + 1 } : prev);

      resetQuestionForm();

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

      // The bottom form may have been holding the row we just removed.
      if (editingQuestionId === deleteQuestionId) {
        setEditingQuestionId(null);
        resetQuestionForm();
      }

      setShowDeleteQuestionDialog(false);
      setDeleteQuestionId(null);
      toast({ title: "Question deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // ─── Editing an existing question ──────────────────────────
  // Like the mock editor, Edit loads the question into the single "Add
  // Question" card at the bottom instead of opening a second form inline —
  // one question form on the page, one set of controls to learn.

  const handleEditQuestion = (question: LiveQuestion) => {
    setEditingQuestionId(question.id);
    setExpandedQuestionId(null);

    // Parse passage content from question text (same logic as ExamDetail)
    const text = question.text || "";
    const passageMatch = text.match(/<div class="passage-section">([\s\S]*?)<\/div><div class="question-section">([\s\S]*?)<\/div>/);

    if (passageMatch) {
      setQuestionFormat("passage");
      const fullPassageContent = passageMatch[1];
      const imgMatch = fullPassageContent.match(/<img src="([^"]+)" class="passage-image[^>]*" \/>/);

      if (imgMatch) {
        setPassageImage(imgMatch[1]);
        // Remove the image tag from the text displayed in the editor
        setPassageText(fullPassageContent.replace(imgMatch[0], ""));
      } else {
        setPassageImage(null);
        setPassageText(fullPassageContent);
      }
      setNewQuestionText(passageMatch[2]);
    } else {
      setQuestionFormat("standard");
      setPassageText("");
      setPassageImage(null);
      setNewQuestionText(text);
    }

    setNewQuestionType(question.answer_type);
    setNewQuestionImages(
      question.image_urls && question.image_urls.length > 0
        ? question.image_urls
        : question.image_url
          ? [question.image_url]
          : []
    );
    setNewQuestionCorrect(
      question.correct_answer === null || question.correct_answer === undefined
        ? ""
        : Array.isArray(question.correct_answer)
          ? question.correct_answer.map(String)
          : String(question.correct_answer)
    );
    setNewQuestionTime(question.time_seconds);
    if (question.answer_type === "single" || question.answer_type === "multi") {
      const opts = Array.isArray(question.options) ? question.options : ["", "", "", ""];
      setNewQuestionOptions(opts);
      const imgs = Array.isArray(question.option_image_urls) ? question.option_image_urls : [];
      setNewQuestionOptionImages(opts.map((_: string, i: number) => imgs[i] ?? null));
    } else {
      // Clear leftovers, or switching the type back to single/multi would
      // inherit the previously edited question's options.
      setNewQuestionOptions(["", "", "", ""]);
      setNewQuestionOptionImages([null, null, null, null]);
    }

    setTimeout(() => {
      questionFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCancelEdit = () => {
    setEditingQuestionId(null);
    resetQuestionForm();
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestionId || !activeSection) return;
    // Validate passage content for passage-based questions
    if (questionFormat === "passage") {
      const strippedPassageText = passageText ? passageText.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
      const hasPassageText = strippedPassageText !== '';
      const hasPassageImage = passageImage !== null && passageImage !== '';

      if (!hasPassageText && !hasPassageImage) {
        toast({
          title: "Missing Passage Content",
          description: "For passage-based questions, please provide either passage text or a passage image.",
          variant: "destructive",
        });
        return;
      }
    }
    if (!newQuestionText.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() && newQuestionImages.length === 0) {
      toast({
        title: "Missing Question Content",
        description: "Please provide either question text or an image before saving.",
        variant: "destructive",
      });
      return;
    }
    try {
      // Mirror handleAddQuestion: joint text-or-image filtering + index remap.
      const isChoice = newQuestionType === "single" || newQuestionType === "multi";
      const keptIdx = isChoice
        ? newQuestionOptions
            .map((_, i) => i)
            .filter((i) => !isRichTextEmpty(newQuestionOptions[i]) || !!newQuestionOptionImages[i])
        : [];
      const idxMap = new Map(keptIdx.map((oldI, newI) => [String(oldI), String(newI)]));
      const remap = (v: any) => (idxMap.has(String(v)) ? idxMap.get(String(v)) : v);
      const remappedCorrect = isChoice
        ? (Array.isArray(newQuestionCorrect)
            ? newQuestionCorrect.map(remap)
            : remap(newQuestionCorrect))
        : newQuestionCorrect;
      const keptImages = keptIdx.map((i) => newQuestionOptionImages[i] ?? null);

      const questionText = (questionFormat === "passage" && (passageText || passageImage))
        ? `<div class="passage-section">${passageImage ? `<img src="${passageImage}" class="passage-image mb-4 w-full h-auto rounded-lg" />` : ""}${passageText}</div><div class="question-section">${newQuestionText || ""}</div>`
        : newQuestionText;

      const updates: any = {
        text: questionText,
        answer_type: newQuestionType,
        options: isChoice ? keptIdx.map((i) => newQuestionOptions[i]) : null,
        correct_answer: remappedCorrect || null,
        time_seconds: newQuestionTime,
        image_urls: newQuestionImages,
      };
      if (isChoice) {
        const supportsOptImgs = await tableHasColumn("live_questions", "option_image_urls");
        if (keptImages.some(Boolean) && !supportsOptImgs) {
          toast({
            title: "Database update needed for option images",
            description:
              "Run migration 20260731100000_live_option_image_urls.sql in the Supabase SQL editor, reload, and save again.",
            variant: "destructive",
          });
          return;
        }
        if (supportsOptImgs) {
          // Written even when all-null so removing a picture actually clears it.
          updates.option_image_urls = keptImages.some(Boolean) ? keptImages : null;
        }
      }

      await updateLiveQuestion(editingQuestionId, updates);
      await loadQuestions(activeSection.id);
      setEditingQuestionId(null);
      resetQuestionForm();
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

    // One form serves both add and edit, so uploads always land in the form's
    // own image list and are persisted when the question is saved.
    setNewQuestionImages(prev => [...prev, publicUrl]);
  };

  // ─── Per-option images (figure answer choices) ───
  // Same contract as the mock editor: busy flag stops an in-flight upload
  // landing on the wrong row after a concurrent row removal.
  const handleOptionImageUpload = async (idx: number, file: File) => {
    if (!liveExamId || !activeSection || optionImageBusy) return;
    setOptionImageBusy(true);
    try {
      toast({ title: "Uploading option image..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const filePath = `${user.id}/${liveExamId}/${activeSection.id}/option-${Date.now()}-${idx}.png`;
      const publicUrl = await uploadQuestionImage(filePath, file, file.type || "image/png");
      setNewQuestionOptionImages((prev) => {
        const next = [...prev];
        while (next.length <= idx) next.push(null);
        next[idx] = publicUrl;
        return next;
      });
      toast({ title: "Option image attached" });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setOptionImageBusy(false);
    }
  };

  const handleOptionImageRemove = (idx: number) => {
    if (optionImageBusy) return;
    setNewQuestionOptionImages((prev) => prev.map((u, i) => (i === idx ? null : u)));
  };

  // Row removal must drop BOTH arrays at the same index to keep them aligned.
  const handleRemoveOptionRow = (idx: number) => {
    if (optionImageBusy) return;
    setNewQuestionOptions((prev) => prev.filter((_, i) => i !== idx));
    setNewQuestionOptionImages((prev) => prev.filter((_, i) => i !== idx));
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
      toast({ title: "Snip added", description: "Image attached to the question form below." });
    } catch (error: any) {
      toast({ title: "Snip failed", description: error.message, variant: "destructive" });
    }
  };

  // ─── Passage image handling ────────────────────────────────

  const handleSnipPassage = async (blob: Blob) => {
    if (!activeSection || !liveExamId) return;
    try {
      toast({ title: "Uploading passage snip..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filePath = `${user.id}/${liveExamId}/${activeSection.id}/passage-snip-${Date.now()}.png`;
      const file = new File([blob], "passage-snip.png", { type: "image/png" });
      const publicUrl = await uploadQuestionImage(filePath, file);

      setPassageImage(publicUrl);
      toast({ title: "Passage Snip Attached", description: "Image added to passage." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handlePassageImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !activeSection) return;
    const file = e.target.files[0];

    try {
      toast({ title: "Uploading passage image..." });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const filePath = `${user.id}/${liveExamId}/${activeSection.id}/passage-${Date.now()}.png`;
      const publicUrl = await uploadQuestionImage(filePath, file, file.type || "image/png");

      setPassageImage(publicUrl);
      toast({ title: "Passage Image Uploaded" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handlePassageImageRemove = () => {
    setPassageImage(null);
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
        <Button onClick={() => navigate("/dashboard?tab=live")}>Back to Dashboard</Button>
      </div>
    );
  }

  const isMultiLang = (exam.supported_languages || []).length > 1;
  const primaryLanguage = exam.primary_language || "en";
  const isPrimaryLanguage = activeLanguage === primaryLanguage;
  const activeLangLabel = langLabel(activeLanguage);
  const primaryLangLabel = langLabel(primaryLanguage);
  const sessionRunning = exam.status === "live" || exam.status === "ended";

  // Status pill, same shape as the mock editor's Live/Draft pill. Emerald is
  // the live module's accent (dashboard cards, control room), red is reserved
  // for a session that is actually running.
  const statusPillClass =
    exam.status === "live" ? "bg-red-500/10 text-red-600 ring-red-500/30" :
    exam.status === "published" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25" :
    "bg-muted text-muted-foreground ring-border";

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <SEO title={`${exam.name} | Live Exam Editor`} description="Edit your live exam" path={`/live-exam/${creatorId}/${liveExamId}`} noindex />

        {/* ─── Header — same shell as the mock exam editor ─── */}
        <header className="sticky top-0 z-10 h-16 border-b border-border/70 bg-card/85 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl shrink-0 text-muted-foreground hover:text-foreground" onClick={() => navigate("/dashboard?tab=live")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="hidden sm:block h-8 w-px bg-border shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-[15px] sm:text-base font-bold leading-tight truncate max-w-[130px] sm:max-w-md">
                  {examTitle || "Untitled Live Exam"}
                </h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset shrink-0 ${statusPillClass}`}>
                  {exam.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                  {exam.status}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-muted-foreground truncate">
                Live exam · {sections.length} section{sections.length === 1 ? "" : "s"} · {questions.length} question{questions.length === 1 ? "" : "s"} · Code {exam.share_code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Preview as student */}
            <Button variant="ghost" size="sm" className="hidden sm:flex h-9 rounded-lg text-muted-foreground hover:text-foreground" onClick={handleOpenPreview}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9 rounded-lg text-muted-foreground" onClick={handleOpenPreview}>
              <Eye className="h-4 w-4" />
            </Button>

            {/* Publish / Unpublish */}
            {(exam.status === "draft" || exam.status === "published") && (
              <Button onClick={handlePublish} variant="outline" size="sm" className="h-9 rounded-lg">
                <Globe className="mr-2 h-4 w-4 hidden sm:inline-block" />
                {exam.status === "draft" ? "Publish" : "Unpublish"}
              </Button>
            )}

            {/* Go Live / back to the control room */}
            {(exam.status === "published" || exam.status === "live") && (
              <Button
                onClick={() => navigate(`/live-exam/${creatorId}/${liveExamId}/control`)}
                size="sm"
                className="h-9 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
              >
                {exam.status === "live" ? <Radio className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
                {exam.status === "live" ? "Control Room" : "Go Live"}
              </Button>
            )}

            {/* Save exam details */}
            <Button onClick={handleSaveExam} disabled={saving} size="sm" className="hidden sm:flex h-9 rounded-lg px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button onClick={handleSaveExam} disabled={saving} size="icon" className="sm:hidden h-9 w-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
              <Save className="h-4 w-4" />
            </Button>

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
                  disabled={sessionRunning}
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
        </header>

        {/* ─── Language Switcher Bar — same segmented control as the mock editor ─── */}
        {isMultiLang && (
          <div className="sticky top-16 z-[9] border-b border-border/70 bg-card/85 backdrop-blur-xl px-4 sm:px-6 py-2">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:inline">Editing in</span>
              <div className="flex gap-1 bg-muted rounded-xl p-1">
                {(exam.supported_languages || ["en"]).map((langCode) => {
                  const langInfo = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                  return (
                    <button
                      key={langCode}
                      onClick={() => handleLanguageChange(langCode)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 ${
                        activeLanguage === langCode
                          ? "bg-card text-emerald-700 shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                      }`}
                    >
                      {langInfo?.label || langCode}
                      {langCode === primaryLanguage && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full ml-1">Primary</span>
                      )}
                      {langInfo?.nativeLabel && langInfo.nativeLabel !== langInfo.label && langCode !== primaryLanguage && (
                        <span className="ml-1 text-xs opacity-60">({langInfo.nativeLabel})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ─── Secondary Language Info Banner ─── */}
        {isMultiLang && !isPrimaryLanguage && (
          <div className="border-b border-warning/25 bg-warning/[0.07] px-4 sm:px-6 py-3">
            <div className="container mx-auto max-w-[1600px] flex items-center gap-3">
              <div className="h-7 w-7 rounded-lg bg-warning/15 flex items-center justify-center shrink-0">
                <Lock className="h-3.5 w-3.5 text-warning" />
              </div>
              <p className="text-sm text-foreground/80">
                <span className="font-semibold text-foreground">Secondary language view.</span> You can edit question text and option text here. To add questions or change question structure, correct answers, or timers,{" "}
                <button
                  className="underline font-semibold text-emerald-700 hover:text-emerald-600"
                  onClick={() => handleLanguageChange(primaryLanguage)}
                >
                  switch to {primaryLangLabel} (Primary)
                </button>.
              </p>
            </div>
          </div>
        )}

        {/* ─── Main Content ─── */}
        <main className="container mx-auto max-w-[1600px] p-4 sm:p-6">
          {sessionRunning && (
            <div className="rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-3.5 flex items-center gap-3.5 mb-6 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                <Radio className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">
                  {exam.status === "live" ? "This session is running" : "This session has ended"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {exam.status === "live"
                    ? "Students are answering right now — edits here can change what they see mid-question."
                    : "Results are final. Duplicate this exam to run the same quiz with a new batch."}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-6">
            {/* Left Sidebar: Exam Details & Sections */}
            <div className="col-span-12 lg:col-span-3 space-y-5">
          {/* Exam Details Card */}
          <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">Exam Details</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">What students see first</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg text-muted-foreground"
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
              <CardContent className="space-y-4 px-5 pb-5 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title <span className="text-destructive">*</span></Label>
                  <Input
                    className="rounded-lg"
                    value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    placeholder="Exam name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</Label>
                  <TransliterateTextarea
                    lang={activeLanguage}
                    value={examDescription}
                    onValueChange={setExamDescription}
                    placeholder="Brief description of the exam..."
                    rows={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instruction</Label>
                  <TransliterateTextarea
                    lang={activeLanguage}
                    value={examInstruction}
                    onValueChange={setExamInstruction}
                    placeholder="Instructions for students..."
                    rows={4}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Sections Card */}
          <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Layers className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-bold">Sections</CardTitle>
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 tabular-nums">
                      {sections.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Drag to reorder</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-lg text-muted-foreground"
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
              <CardContent className="space-y-2.5 px-4 pb-4 pt-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                >
                  <SortableContext
                    items={sections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sections.map((sec, index) => (
                      <SortableSectionItem key={sec.id} id={sec.id}>
                        <div
                          className={`relative p-3 pl-4 rounded-xl border cursor-pointer transition-all overflow-hidden ${activeSection?.id === sec.id
                            ? "border-emerald-500/40 bg-emerald-500/[0.06] shadow-sm ring-1 ring-emerald-500/20"
                            : "border-border/70 bg-card hover:border-emerald-500/25 hover:bg-muted/40"
                            }`}
                          onClick={() => handleSwitchSection(sec.id)}
                        >
                          {activeSection?.id === sec.id && (
                            <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-500" />
                          )}
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${activeSection?.id === sec.id ? "text-emerald-700" : "text-muted-foreground"}`}>Section {index + 1}</span>
                            <div className="flex justify-between items-start gap-2 w-full">
                              <SectionNameEditor
                                lang={activeLanguage}
                                value={sec.name}
                                onValueChange={(text) => handleLocalUpdateSection(sec.id, { name: text })}
                                onCommit={(name) => handleRenameSection(sec.id, name)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDeleteSectionId(sec.id);
                                  setShowDeleteSectionDialog(true);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </SortableSectionItem>
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="pt-1">
                  <Button
                    variant="outline"
                    className="w-full gap-2 rounded-xl border-dashed text-muted-foreground hover:text-emerald-700 hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
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
            <div className="col-span-12 lg:col-span-9 space-y-5">
          {/* Questions List */}
          <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0 px-5 py-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <ListChecks className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-sm font-bold shrink-0">Questions</CardTitle>
                  <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 tabular-nums shrink-0">
                    {questions.length}
                  </span>
                </div>
                <Select
                  value={activeSection?.id}
                  onValueChange={(value) => handleSwitchSection(value)}
                  disabled={sections.length === 0}
                >
                  <SelectTrigger className="h-9 flex-1 sm:w-[220px] rounded-lg bg-card ml-1">
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
                className="self-end sm:self-auto h-8 w-8 p-0 rounded-lg text-muted-foreground"
              >
                {isQuestionsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {!isQuestionsCollapsed && (
              <CardContent className="space-y-3 max-h-[520px] overflow-y-auto p-4 sm:p-5">
                {questions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                      <HelpCircle className="h-6 w-6 text-muted-foreground/60" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{activeSection ? "No questions added yet" : "No sections created yet"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{activeSection ? "Snip from a PDF or add one manually below." : "Please create a section first to start adding questions."}</p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleQuestionDragEnd}
                  >
                    <SortableContext
                      items={questions.map((q) => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="group/qlist space-y-3">
                        {questions.map((q) => {
                    const isExpanded = expandedQuestionId === q.id;
                    const isBeingEdited = editingQuestionId === q.id;
                    const questionErrors = getQuestionErrors(q);
                    const hasError = questionErrors.length > 0;
                    const questionImages = q.image_urls && q.image_urls.length > 0
                      ? q.image_urls
                      : q.image_url ? [q.image_url] : [];
                    const hasImage = questionImages.length > 0 || /<img\b/i.test(q.text || "");
                    const plainText = (q.text || "").replace(/<img[^>]*>/g, "").replace(/<[^>]+>/g, " ").trim();
                    return (
                      <SortableQuestionRow
                        key={q.id}
                        id={q.id}
                        disabled={!canReorder}
                        className={`border rounded-xl bg-card transition-all hover:shadow-sm ${
                          hasError
                            ? "border-destructive/40 bg-destructive/[0.02]"
                            : isBeingEdited
                              ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
                              : "border-border/70 hover:border-emerald-500/25"
                        }`}
                      >
                        <div className="flex items-start gap-3.5 p-4 group">
                          <div className={`relative flex items-center justify-center h-9 w-9 rounded-xl font-bold text-sm shrink-0 tabular-nums ${hasError ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700"}`}>
                            {q.q_no}
                            {hasError && (
                              <span
                                className="absolute -top-1.5 -right-1.5 flex items-center justify-center"
                                title="This question has issues: missing text, options, or correct answer"
                              >
                                <AlertCircle className="h-4 w-4 text-destructive fill-card" />
                              </span>
                            )}
                          </div>
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <p className="text-sm font-medium leading-snug truncate">{plainText || "Question with image"}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{q.answer_type}</span>
                              {hasImage && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/[0.09] px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/15"
                                  title="This question has an image"
                                >
                                  <ImageIcon className="h-3 w-3" />
                                  Image
                                </span>
                              )}
                            </div>
                            {hasError && (
                              <p className="text-xs text-destructive font-medium">{questionErrors[0]}</p>
                            )}
                          </div>
                          {/* Timer badge — the live counterpart of the mock editor's marks badge */}
                          <span
                            className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground shrink-0 tabular-nums"
                            title="Time students get once this question is unlocked"
                          >
                            <Clock className="h-3 w-3" />
                            {q.time_seconds}s
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
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
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-emerald-700 hover:bg-emerald-500/10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                              onClick={() => handleEditQuestion(q)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {(!isMultiLang || isPrimaryLanguage) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  setDeleteQuestionId(q.id);
                                  setShowDeleteQuestionDialog(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-4 border-t border-dashed border-border/70 space-y-4">
                            {questionImages.length > 0 && (
                              <div className="border border-border/70 rounded-xl p-4 bg-muted/40 space-y-2">
                                <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question Image</Label>
                                {questionImages.map((url, i) => (
                                  <img
                                    key={i}
                                    src={url}
                                    alt={`Question ${q.q_no} image ${i + 1}`}
                                    className="max-w-full h-auto rounded-lg"
                                  />
                                ))}
                              </div>
                            )}

                            {q.text && (
                              <div>
                                <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question Text</Label>
                                <div className="text-sm leading-relaxed p-3.5 bg-muted/40 border border-border/60 rounded-xl" dangerouslySetInnerHTML={{ __html: renderMathInHtml(q.text) }} />
                              </div>
                            )}

                            <div>
                              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question Type</Label>
                              <span className="inline-flex items-center rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-foreground/80">
                                {q.answer_type === "single" ? "Multiple Choice (Single)" :
                                  q.answer_type === "multi" ? "Multiple Choice (Multiple)" :
                                    q.answer_type === "numeric" ? "Numeric" : "Text"}
                              </span>
                            </div>

                            {(q.answer_type === "single" || q.answer_type === "multi") && Array.isArray(q.options) && (
                              <div>
                                <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Options</Label>
                                <div className="space-y-1.5">
                                  {q.options.map((opt: string, optIdx: number) => (
                                    <div key={optIdx} className="flex items-start gap-2.5 p-2 pl-2.5 bg-muted/40 border border-border/50 rounded-lg">
                                      <span className="flex items-center justify-center h-6 w-6 rounded-md bg-card border border-border/70 font-bold text-[11px] text-muted-foreground shrink-0">{String.fromCharCode(65 + optIdx)}</span>
                                      <div className="min-w-0">
                                        {!isRichTextEmpty(opt) && <span className="text-sm" dangerouslySetInnerHTML={{ __html: renderMathInRichText(opt) }} />}
                                        {Array.isArray(q.option_image_urls) && q.option_image_urls[optIdx] && (
                                          <img
                                            src={q.option_image_urls[optIdx]!}
                                            alt={`Option ${String.fromCharCode(65 + optIdx)}`}
                                            className="max-h-24 rounded-md border border-border/60 mt-1"
                                          />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correct Answer{q.answer_type === "multi" ? "s" : ""}</Label>
                              <div className="flex items-start gap-2.5 p-3 bg-success/[0.06] border border-success/25 rounded-xl">
                                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-success/15 shrink-0 mt-0.5">
                                  <Check className="h-3 w-3 text-success" />
                                </span>
                                {Array.isArray(q.correct_answer) ? (
                                  <div className="space-y-1">
                                    {q.correct_answer.map((ans: string, ansIdx: number) => {
                                      const idx = Number(ans);
                                      const resolved = !isNaN(idx) && Array.isArray(q.options) && idx >= 0 && idx < q.options.length
                                        ? `${String.fromCharCode(65 + idx)}. ${renderMathInRichText(q.options[idx] || "")}`
                                        : renderMathInRichText(String(ans));
                                      return (
                                        <div key={ansIdx} className="text-sm font-semibold text-success" dangerouslySetInnerHTML={{ __html: resolved }} />
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p
                                    className="text-sm font-semibold text-success"
                                    dangerouslySetInnerHTML={{
                                      __html: q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== ""
                                        ? (() => {
                                          const idx = Number(q.correct_answer);
                                          return !isNaN(idx) && Array.isArray(q.options) && idx >= 0 && idx < q.options.length
                                            ? `${String.fromCharCode(65 + idx)}. ${renderMathInRichText(q.options[idx] || "")}`
                                            : renderMathInRichText(String(q.correct_answer));
                                        })()
                                        : "Not specified"
                                    }}
                                  />
                                )}
                              </div>
                            </div>

                            <div>
                              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timer</Label>
                              <div className="p-3 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-xl flex items-center gap-2">
                                <Clock className="h-4 w-4 text-emerald-600" />
                                <span className="text-sm font-semibold text-emerald-700 tabular-nums">{q.time_seconds} seconds</span>
                                <span className="text-xs text-muted-foreground">to answer once unlocked</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </SortableQuestionRow>
                    );
                  })}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            )}
          </Card>

          {/* Add/Edit Question Form */}
          {!activeSection ? (
            /* No section yet: lock the Add Question card */
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="py-14">
                <div className="text-center space-y-3">
                  <div className="w-14 h-14 bg-warning/15 text-warning rounded-2xl flex items-center justify-center mx-auto">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold">Create a Section First</h3>
                  <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                    Questions live inside sections. Please create a section first to start adding questions.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 rounded-lg gap-2"
                    onClick={handleAddSection}
                  >
                    <Plus className="h-4 w-4" />
                    Add Section
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : isMultiLang && !isPrimaryLanguage && !editingQuestionId ? (
            /* Secondary Language: Lock the Add Question card. Play order,
               timers and answers are owned by the primary language. */
            <Card className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="py-14">
                <div className="text-center space-y-3">
                  <div className="w-14 h-14 bg-warning/15 text-warning rounded-2xl flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold">Questions Can Only Be Added in the Primary Language</h3>
                  <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                    New questions must be created in {primaryLangLabel}. They will automatically appear here for translation.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-2 rounded-lg"
                    onClick={() => handleLanguageChange(primaryLanguage)}
                  >
                    Switch to {primaryLangLabel} (Primary)
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
          <Card ref={questionFormRef} className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0 px-5 py-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  {editingQuestionId ? <Edit className="h-4 w-4 text-emerald-600" /> : <Plus className="h-4 w-4 text-emerald-600" />}
                </div>
                <div>
                  <CardTitle className="text-sm font-bold">{editingQuestionId ? "Edit Question" : "Add Question"}</CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{editingQuestionId ? "Update the selected question" : "Snip from PDF or write it manually"}</p>
                </div>
              </div>
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
            </CardHeader>
            <CardContent className="p-5">
              <Tabs defaultValue="pdf" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-11 rounded-xl p-1">
                  <TabsTrigger value="pdf" className="rounded-lg text-xs sm:text-sm font-semibold">PDF Snipping/Direct Upload</TabsTrigger>
                  <TabsTrigger value="ai" className="gap-2 rounded-lg text-xs sm:text-sm font-semibold">
                    AI Parse
                    <Badge variant="secondary" className="h-5 text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/20">
                      Coming Soon
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pdf" className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload PDF Document</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="w-full h-14 rounded-xl border-dashed text-muted-foreground hover:text-emerald-700 hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
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
                  </div>

                  {activeSection?.pdf_url ? (
                    <div className="border border-border/70 rounded-xl overflow-hidden h-[600px] shadow-sm">
                      <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading PDF viewer…</div>}>
                        <PdfSnipper
                          pdfUrl={activeSection.pdf_url}
                          onSnip={handleSnip}
                          onSnipPassage={questionFormat === "passage" ? handleSnipPassage : undefined}
                        />
                      </Suspense>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-14 border border-dashed border-border rounded-xl bg-muted/30">
                      <div className="h-12 w-12 rounded-2xl bg-card border border-border/70 flex items-center justify-center mb-3 shadow-xs">
                        <FileText className="h-6 w-6 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No PDF uploaded</p>
                      <p className="text-xs text-muted-foreground mt-1">Upload a PDF to start snipping questions.</p>
                    </div>
                  )}

                  {questionFormat === "passage" && (
                    <div className="pt-5 border-t border-dashed border-border/70">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-4">Passage Details</h3>
                      <div className="space-y-4 mb-6">
                        <div className="space-y-2 mb-4">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passage Image</Label>
                          <div className="flex items-center gap-4">
                            <Button variant="outline" className="h-10 rounded-lg border-dashed text-muted-foreground hover:text-emerald-700 hover:border-emerald-500/40" onClick={() => document.getElementById('live-passage-image-upload')?.click()}>
                              <Upload className="mr-2 h-4 w-4" />
                              Upload Image
                              <input
                                id="live-passage-image-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handlePassageImageUpload}
                              />
                            </Button>
                            {passageImage && (
                              <span className="text-sm font-medium text-emerald-600 flex items-center">
                                <Check className="mr-1 h-4 w-4" /> 1 Image attached
                              </span>
                            )}
                          </div>
                          {passageImage && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <div className="border border-border/70 rounded-xl p-2 bg-muted/40 w-fit relative group">
                                <img src={passageImage} alt="Passage" className="h-32 object-contain rounded-lg" />
                                <button
                                  onClick={handlePassageImageRemove}
                                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:bg-destructive/90 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Remove image"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passage Text</Label>
                          <RichTextEditor
                            value={passageText}
                            onChange={setPassageText}
                            placeholder="Enter the passage text here..."
                            className="min-h-[150px]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-5 border-t border-dashed border-border/70">
                    <div className="flex justify-between items-start mb-0">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700">Question Details</h3>
                      {editingQuestionId && (
                        <div className="flex flex-col gap-2">
                          <Button onClick={handleUpdateQuestion} size="sm" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25">
                            <Save className="mr-2 h-4 w-4" />
                            Update
                          </Button>
                          <Button variant="outline" onClick={handleCancelEdit} size="sm" className="rounded-lg">
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>

                    {isMultiLang && !editingQuestionId && (
                      <div className="bg-emerald-500/[0.05] border border-emerald-500/15 text-foreground/80 text-sm p-3.5 rounded-xl flex items-start gap-3 mt-3 mb-4">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Globe className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground mb-0.5">Multi-Language Exam</p>
                          <p>Adding a new question here will automatically create linked placeholder questions in all other language variants. This keeps your exam structure perfectly synced.</p>
                        </div>
                      </div>
                    )}

                    {/* Per-question timer — the live editor's equivalent of marks */}
                    <div className="mt-3 mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Clock className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time for this question</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">How long students get once you unlock it.</p>
                      </div>
                      <Input
                        type="number"
                        min={5}
                        max={600}
                        value={newQuestionTime}
                        onChange={e => setNewQuestionTime(Math.max(5, parseInt(e.target.value) || 60))}
                        disabled={isMultiLang && !isPrimaryLanguage}
                        className="w-20 rounded-lg text-center tabular-nums"
                      />
                      <span className="text-sm text-muted-foreground shrink-0">sec</span>
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
                      onAdd={editingQuestionId ? handleUpdateQuestion : handleAddQuestion}
                      showImageUpload
                      isEditing={!!editingQuestionId}
                      lang={activeLanguage}
                      lockStructure={isMultiLang && !isPrimaryLanguage && !!editingQuestionId}
                      optionImages={newQuestionOptionImages}
                      onOptionImageUpload={handleOptionImageUpload}
                      onOptionImageRemove={handleOptionImageRemove}
                      onRemoveOption={handleRemoveOptionRow}
                      optionImageBusy={optionImageBusy}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="ai" className="space-y-6">
                  <div className="text-center py-16 border border-emerald-500/15 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] to-teal-500/[0.03]">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-600/25">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">AI Parse Coming Soon</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      We are working on an advanced AI feature that will automatically extract questions, options, and answers from your PDF files. Stay tuned!
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
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
                <Eye className="h-5 w-5 text-emerald-600" />
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
                            <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-700 font-bold text-xs shrink-0">
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
                                <div key={optIdx} className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm bg-muted/30">
                                  <span className="w-6 text-center font-mono text-xs">{String.fromCharCode(65 + optIdx)}</span>
                                  <div className="min-w-0">
                                    <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(opt) }} />
                                    {Array.isArray(q.option_image_urls) && q.option_image_urls[optIdx] && (
                                      <img
                                        src={q.option_image_urls[optIdx]!}
                                        alt={`Option ${String.fromCharCode(65 + optIdx)}`}
                                        className="max-h-24 rounded-md border border-border/60 mt-1"
                                      />
                                    )}
                                  </div>
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
