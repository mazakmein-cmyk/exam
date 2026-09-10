import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadQuestionImage } from "@/lib/questionImageUpload";
import { createTwinPlaceholders, fetchSiblingSectionIds, mirrorToTwins } from "@/lib/questionTwins";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Check, AlertCircle, Trash2, MoveUp, MoveDown, XCircle, FileText, X, Plus, Upload, Image as ImageIcon, LayoutTemplate } from "lucide-react";
const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));

interface ParsedQuestion {
  id: string;
  q_no: number;
  section_label: string | null;
  /** Links this row to its translations; null on legacy or single-language rows. */
  question_group_id: string | null;
  text: string;
  options: any;
  answer_type: string;
  answer_hint: string | null;
  confidence: number | null;
  requires_review: boolean | null;
  is_excluded: boolean;
  is_finalized: boolean;

  final_order: number | null;
  image_url: string | null;
  image_urls: string[] | null;
  correct_answer: any;
}

export default function ManualFixEditor() {
  const { examId, sectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [splitView, setSplitView] = useState(true);
  // Structure is decided in the primary language and mirrored to the twins in
  // these sibling sections. A secondary-language section edits content only:
  // add, reorder and exclude are disabled, and finalise records completion
  // without touching the order.
  const [isPrimarySection, setIsPrimarySection] = useState(true);
  const [siblingSectionIds, setSiblingSectionIds] = useState<string[]>([]);

  useEffect(() => {
    fetchQuestions();
  }, [sectionId]);

  const fetchQuestions = async () => {
    try {
      const { data: section } = await supabase
        .from("sections")
        // The exam's owner rides along on the request this page always made —
        // sections → exams is an embedded read, not a second call.
        // language / section_group_id / primary_language decide whether this
        // section may change structure and where its mirrors go — same embed,
        // still one request.
        .select("name, pdf_url, language, section_group_id, exam:exams(user_id, primary_language)")
        .eq("id", sectionId)
        .single();

      // Ownership gate — this page EDITS questions. RLS hides an unpublished
      // exam's section from a non-owner entirely (section is null); a
      // published one is world-readable, so the id comparison is what turns a
      // hollow editor into a redirect. getSession reads the locally cached
      // session: no network request.
      const { data: { session } } = await supabase.auth.getSession();
      const ownerId = (section as any)?.exam?.user_id ?? null;
      if (!section || !session?.user || ownerId !== session.user.id) {
        toast({
          title: "This exam isn't yours",
          description: "Only its creator can edit questions.",
        });
        navigate("/dashboard", { replace: true });
        return;
      }

      setSectionName(section.name);
      setPdfUrl(section.pdf_url);

      // Primary when the section's language is the exam's primary (both default
      // to 'en', so a single-language exam is always primary). Siblings are the
      // same section in every other language; empty means nothing to mirror.
      const sectionLang = (section as any).language || "en";
      const primaryLang = (section as any).exam?.primary_language || "en";
      const primary = sectionLang === primaryLang;
      try {
        setSiblingSectionIds(
          await fetchSiblingSectionIds(sectionId!, (section as any).section_group_id)
        );
        setIsPrimarySection(primary);
      } catch (siblingErr) {
        // If the siblings cannot be read, a structural change here could not be
        // mirrored to them. Lock structure for this load rather than silently
        // behaving like a single-language paper — that produced group-id-less
        // rows and unmirrored excludes with a success toast. Content editing
        // is unaffected.
        console.warn("Section siblings unavailable; structure locked for this load", siblingErr);
        setSiblingSectionIds([]);
        setIsPrimarySection(false);
        if (primary) {
          toast({
            title: "Section details couldn't be loaded",
            description:
              "Adding, reordering and excluding questions are disabled until you reload. Editing text still works.",
            variant: "destructive",
          });
        }
      }
      if (section.pdf_url) setShowPdf(true);

      const { data, error } = await supabase
        .from("parsed_questions")
        .select("*")
        .eq("section_id", sectionId)
        .order("q_no", { ascending: true });

      if (error) throw error;

      // Sort questions: use final_order if available, otherwise fallback to q_no
      const sortedQuestions = (data || []).sort((a, b) => {
        if (a.final_order !== null && b.final_order !== null) {
          return a.final_order - b.final_order;
        }
        return a.q_no - b.q_no;
      });

      setQuestions(sortedQuestions);
    } catch (error) {
      console.error("Error fetching questions:", error);
      toast({
        title: "Error",
        description: "Failed to load questions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = async (id: string, updates: Partial<ParsedQuestion>) => {
    try {
      const { error } = await supabase
        .from("parsed_questions")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      // Excluding a question is structural: it decides what every student is
      // served. Writing it to one language row left the twin in the paper, so
      // the Hindi cohort kept answering a question the English cohort never saw
      // — and the creator dashboard's per-question pool went lopsided.
      if ("is_excluded" in updates && isPrimarySection) {
        const row = questions.find(q => q.id === id);
        await mirrorToTwins(row?.question_group_id, siblingSectionIds, {
          is_excluded: updates.is_excluded,
        });
      }

      setQuestions(prev =>
        prev.map(q => (q.id === id ? { ...q, ...updates } : q))
      );

      toast({
        title: "Saved",
        description: "Question updated successfully",
      });
    } catch (error) {
      console.error("Error updating question:", error);
      toast({
        title: "Error",
        // The twin helpers throw messages that say which half landed
        // ("changed in the primary, but mirroring failed"); a fixed string
        // would hide that the papers now disagree.
        description: (error as any)?.message || "Failed to update question",
        variant: "destructive",
      });
    }
  };

  const handlePaste = async (e: React.ClipboardEvent, questionId: string) => {
    const items = e.clipboardData.items;
    let imageFile: File | null = null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        imageFile = items[i].getAsFile();
        break;
      }
    }

    if (!imageFile) return;

    // Prevent default paste behavior if it's an image
    e.preventDefault();

    try {
      toast({
        title: "Uploading image...",
        description: "Please wait while we upload your screenshot.",
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `${user.id}/${examId}/${sectionId}/${questionId}-${Date.now()}.png`;
      const publicUrl = await uploadQuestionImage(fileName, imageFile);

      // Get current images
      const question = questions.find(q => q.id === questionId);
      const currentImages = question?.image_urls || (question?.image_url ? [question.image_url] : []);
      const newImages = [...currentImages, publicUrl];

      await updateQuestion(questionId, { image_urls: newImages, image_url: publicUrl });

      toast({
        title: "Image uploaded",
        description: "Screenshot attached to question successfully.",
      });
    } catch (error: any) {
      console.error("Error uploading image:", error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newQuestions = [...questions];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newQuestions.length) return;

    [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
    setQuestions(newQuestions);
  };

  const handleImageUpload = async (questionId: string, file: File) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUploadingImage(questionId);

    try {
      const fileName = `${user.id}/${sectionId}/${questionId}/${file.name}`;
      const publicUrl = await uploadQuestionImage(fileName, file, file.type || "image/png");


      const question = questions.find(q => q.id === questionId);
      const currentImages = question?.image_urls || (question?.image_url ? [question.image_url] : []);
      const newImages = [...currentImages, publicUrl];

      await updateQuestion(questionId, { image_urls: newImages, image_url: publicUrl });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingImage(null);
    }
  };

  const addNewQuestion = async () => {
    if (!isPrimarySection) {
      toast({
        title: "Questions are added in the primary language",
        description: "A translation edits content only. Add the question on the primary paper and it appears here as a placeholder.",
        variant: "destructive",
      });
      return;
    }
    try {
      const maxQNo = Math.max(...questions.map(q => q.q_no), 0);
      // A group id only when there are twins to link — a single-language exam
      // keeps null, exactly as ExamDetail does.
      const questionGroupId = siblingSectionIds.length > 0 ? crypto.randomUUID() : null;
      const { data, error } = await supabase
        .from("parsed_questions")
        .insert({
          section_id: sectionId,
          q_no: maxQNo + 1,
          text: "New question",
          answer_type: "single",
          // Four blanks, the same shape "Initialize Options" produces. Without
          // an options array the twin placeholder mirrored null against a
          // primary that later got options, and the publish gate reported an
          // option_count_mismatch no editor could repair from the translation.
          options: ["", "", "", ""],
          requires_review: true,
          question_group_id: questionGroupId,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // The same placeholder ExamDetail's add creates, so a question born here
      // exists in every language too.
      await createTwinPlaceholders(data as any, siblingSectionIds);

      setQuestions([...questions, data]);
      setEditingId(data.id);

      toast({
        title: "Question added",
        description: "New question created successfully",
      });
    } catch (error) {
      console.error("Error adding question:", error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to add question",
        variant: "destructive",
      });
    }
  };

  const finalizeExam = async () => {
    setSaving(true);
    try {
      // Update final order for all questions.
      //
      // Order is structure. On the primary paper the order is written here and
      // mirrored to every twin by question_group_id, so a translated student
      // sits the same paper in the same sequence. On a secondary paper the
      // reorder controls are disabled, and finalising records completion only —
      // writing final_order from a translation would let it diverge from the
      // paper it translates.
      for (const [index, q] of questions.entries()) {
        if (isPrimarySection) {
          const finalOrder = index + 1;
          await supabase
            .from("parsed_questions")
            .update({ final_order: finalOrder, is_finalized: true })
            .eq("id", q.id);
          await mirrorToTwins(q.question_group_id, siblingSectionIds, {
            final_order: finalOrder,
            is_finalized: true,
          });
        } else {
          await supabase
            .from("parsed_questions")
            .update({ is_finalized: true })
            .eq("id", q.id);
        }
      }

      // Mark section as finalized
      await supabase
        .from("sections")
        .update({ is_finalized: true })
        .eq("id", sectionId);

      toast({
        title: "Success",
        description: "Exam finalized successfully",
      });

      navigate(`/exam/${examId}`);
    } catch (error) {
      console.error("Error finalizing exam:", error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to finalize exam",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSnip = async (blob: Blob) => {
    if (!activeQuestionId) {
      toast({
        title: "No question selected",
        description: "Please click on a question card to select it before snipping.",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Uploading snip...",
        description: "Please wait while we upload your selection.",
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileName = `${user.id}/${examId}/${sectionId}/${activeQuestionId}-${Date.now()}.png`;
      const file = new File([blob], "snip.png", { type: "image/png" });
      const publicUrl = await uploadQuestionImage(fileName, file);


      const question = questions.find(q => q.id === activeQuestionId);
      const currentImages = question?.image_urls || (question?.image_url ? [question.image_url] : []);
      const newImages = [...currentImages, publicUrl];

      await updateQuestion(activeQuestionId, { image_urls: newImages, image_url: publicUrl });

      toast({
        title: "Snip attached",
        description: "Image attached to question successfully.",
      });
    } catch (error: any) {
      console.error("Error uploading snip:", error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const visibleQuestions = questions.filter(q => !q.is_excluded);
  const requiresReviewCount = visibleQuestions.filter(q => q.requires_review).length;

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <p>Loading questions...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate(`/exam/${examId}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Exam
          </Button>
          <Button
            onClick={addNewQuestion}
            variant="outline"
            disabled={!isPrimarySection}
            title={isPrimarySection ? undefined : "Questions are added in the primary language"}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>

        {pdfUrl && (
          <Button
            variant="outline"
            onClick={() => setShowPdf(!showPdf)}
          >
            <FileText className="mr-2 h-4 w-4" />
            {showPdf ? "Hide" : "View"} Original PDF
          </Button>
        )}
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Review & Fix Questions</h1>
        <p className="text-muted-foreground mb-4">
          Section: {sectionName}
        </p>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
          <p className="text-sm">
            <strong>📝 Instructions:</strong> Review all extracted questions below. Questions with a red "Review" badge may have extraction issues.
            Edit question text, options, and settings as needed. Use the arrows to reorder questions.
            Check "Exclude from exam" to remove questions. {pdfUrl && "Click 'View Original PDF' to reference the source document."} Click "Finalize Exam" when ready to enable the simulator.
          </p>
        </div>

        <div className="flex gap-4">
          <Badge variant="secondary">
            {visibleQuestions.length} Questions
          </Badge>
          {requiresReviewCount > 0 && (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              {requiresReviewCount} Require Review
            </Badge>
          )}
          <Badge variant="outline">
            <XCircle className="mr-1 h-3 w-3" />
            {questions.filter(q => q.is_excluded).length} Excluded
          </Badge>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Left Column: PDF Viewer (only if split view is enabled and PDF exists) */}
        {splitView && showPdf && pdfUrl && (
          <div className="w-1/2 h-full">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading PDF viewer…</div>}>
              <PdfSnipper pdfUrl={pdfUrl} onSnip={handleSnip} />
            </Suspense>
          </div>
        )}

        {/* Right Column: Questions List */}
        <div className={`${splitView && showPdf && pdfUrl ? "w-1/2" : "w-full"} h-full overflow-y-auto pr-2 space-y-4`}>
          {questions.map((question, index) => (
            <Card
              key={question.id}
              className={`transition-all duration-200 ${question.is_excluded ? "opacity-50" : ""} ${activeQuestionId === question.id ? "ring-2 ring-blue-500 shadow-lg" : "hover:border-blue-300"}`}
              onClick={() => setActiveQuestionId(question.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <CardTitle className="text-lg cursor-pointer">
                      Question {question.q_no}
                    </CardTitle>
                    {activeQuestionId === question.id && (
                      <Badge className="bg-blue-500">Active</Badge>
                    )}
                    {question.requires_review && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Review
                      </Badge>
                    )}
                    {question.confidence !== null && (
                      <Badge variant="outline" className="text-xs">
                        {(question.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    )}
                    {question.is_excluded && (
                      <Badge variant="secondary" className="text-xs">
                        Excluded
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveQuestion(index, "up")}
                      disabled={!isPrimarySection || index === 0}
                    >
                      <MoveUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveQuestion(index, "down")}
                      disabled={!isPrimarySection || index === questions.length - 1}
                    >
                      <MoveDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor={`text-${question.id}`}>Question Text</Label>
                  <Textarea
                    id={`text-${question.id}`}
                    value={question.text}
                    onChange={(e) =>
                      setQuestions(prev =>
                        prev.map(q =>
                          q.id === question.id ? { ...q, text: e.target.value } : q
                        )
                      )
                    }
                    onBlur={() => updateQuestion(question.id, { text: question.text })}
                    rows={3}
                  />
                </div>

                <div
                  className="space-y-2"
                  onPaste={(e) => handlePaste(e, question.id)}
                >
                  <Label>Question Image</Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById(`image-${question.id}`)?.click()}
                        disabled={uploadingImage === question.id}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {uploadingImage === question.id ? "Uploading..." : "Upload Image"}
                      </Button>
                      <span className="text-xs text-muted-foreground">or paste (Ctrl+V)</span>
                      <input
                        type="file"
                        accept="image/*"
                        id={`image-${question.id}`}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(question.id, file);
                        }}
                      />
                    </div>
                  </div>

                  {/* Images Grid */}
                  <div className="mt-2">
                    {(question.image_urls && question.image_urls.length > 0) ? (
                      <div className="grid grid-cols-2 gap-4">
                        {question.image_urls.map((url, idx) => (
                          <div key={idx} className="relative group border rounded-md overflow-hidden bg-muted/50">
                            <img
                              src={url}
                              alt={`Question Image ${idx + 1}`}
                              className="max-h-60 object-contain mx-auto"
                            />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                const newImages = question.image_urls!.filter((_, i) => i !== idx);
                                updateQuestion(question.id, {
                                  image_urls: newImages,
                                  image_url: newImages.length > 0 ? newImages[0] : null
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : question.image_url ? (
                      <div className="relative group border rounded-md overflow-hidden bg-muted/50">
                        <img
                          src={question.image_url}
                          alt="Question"
                          className="max-h-60 object-contain mx-auto"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => updateQuestion(question.id, { image_url: null, image_urls: [] })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-md p-8 text-center text-muted-foreground hover:bg-muted/50 transition-colors">
                        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No image attached</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`type-${question.id}`}>Answer Type</Label>
                    <Select
                      value={question.answer_type}
                      onValueChange={(value) =>
                        updateQuestion(question.id, { answer_type: value })
                      }
                      // Answer type is structure: it decides how every language's
                      // students answer. Decided on the primary paper only.
                      disabled={!isPrimarySection}
                    >
                      <SelectTrigger id={`type-${question.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Choice</SelectItem>
                        <SelectItem value="multi">Multiple Choice</SelectItem>
                        <SelectItem value="numeric">Numeric</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {question.section_label && (
                    <div>
                      <Label htmlFor={`section-${question.id}`}>Section Label</Label>
                      <Input
                        id={`section-${question.id}`}
                        value={question.section_label}
                        onChange={(e) =>
                          setQuestions(prev =>
                            prev.map(q =>
                              q.id === question.id ? { ...q, section_label: e.target.value } : q
                            )
                          )
                        }
                        onBlur={() =>
                          updateQuestion(question.id, { section_label: question.section_label })
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Show options editor if options exist OR if it's a choice-based question type */}
                {(question.options || ["single", "multi", "multiple_choice", "true_false"].includes(question.answer_type)) && (
                  <div>
                    <Label>Options (JSON format)</Label>
                    {question.options ? (
                      <Textarea
                        value={JSON.stringify(question.options, null, 2)}
                        onChange={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            setQuestions(prev =>
                              prev.map(q =>
                                q.id === question.id ? { ...q, options: parsed } : q
                              )
                            );
                          } catch (err) {
                            // Invalid JSON, don't update state yet, let user type
                          }
                        }}
                        onBlur={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value);
                            updateQuestion(question.id, { options: parsed });
                          } catch (err) {
                            // Reset to valid state on blur if invalid
                          }
                        }}
                        rows={5}
                        className="font-mono text-sm"
                        // Option COUNT is structure (it must match every twin);
                        // option TEXT is content, edited on the translation via
                        // the form in ExamDetail, not this raw JSON.
                        disabled={!isPrimarySection}
                      />
                    ) : (
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground mb-2">No options defined for this question.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const defaultOptions = ["Option A", "Option B", "Option C", "Option D"];
                            updateQuestion(question.id, { options: defaultOptions });
                          }}
                          disabled={!isPrimarySection}
                        >
                          Initialize Options
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {question.answer_hint !== undefined && (
                  <div>
                    <Label htmlFor={`hint-${question.id}`}>Answer Hint</Label>
                    <Input
                      id={`hint-${question.id}`}
                      value={question.answer_hint || ""}
                      onChange={(e) =>
                        setQuestions(prev =>
                          prev.map(q =>
                            q.id === question.id ? { ...q, answer_hint: e.target.value } : q
                          )
                        )
                      }
                      onBlur={() =>
                        updateQuestion(question.id, { answer_hint: question.answer_hint })
                      }
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor={`correct-${question.id}`} className="text-green-600 font-semibold">Correct Answer</Label>
                  <p className="text-xs text-muted-foreground mb-1">
                    {question.answer_type === 'multi'
                      ? "For multiple choice, enter values separated by commas (e.g., Option A, Option B)"
                      : "Enter the exact correct answer value"}
                  </p>
                  <Input
                    id={`correct-${question.id}`}
                    value={
                      Array.isArray(question.correct_answer)
                        ? question.correct_answer.join(", ")
                        : (typeof question.correct_answer === 'object' && question.correct_answer !== null ? JSON.stringify(question.correct_answer) : (question.correct_answer || ""))
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      // Store raw string in state for editing convenience, parse on blur
                      // But we need to update state to show what user types.
                      // Since we map state directly to value, we might need a temp holder or just update it as string if we strictly use the value prop logic above.
                      // However, question.correct_answer in state is likely expected to be the actual shape (array/string).
                      // To support editing, we'll just update it as a string in state temporarily if we can, or usually separate 'editing' state is needed.
                      // Simpler approach: update state as formatted string? No, that breaks partial updates.
                      // Only way: parse immediately or handle string-to-object conversion in the value prop.

                      // Let's UPDATE the state as the parsed version immediately? No, that makes typing commas hard.
                      // A better way for this quick fix:
                      // We'll update the state with the *value* as-is if it's text, but we need to know it's "dirty".
                      // Actually, let's just assume for 'multi', the user types a string, and we parse it.

                      // For now, let's treat the state update as string, and the `updateQuestion` call will handle the persistence.
                      // But wait, `questions` state expects `ParsedQuestion` which has `correct_answer: any`.
                      // So we can store the string.

                      setQuestions(prev =>
                        prev.map(q =>
                          q.id === question.id ? { ...q, correct_answer: val } : q
                        )
                      )
                    }}
                    onBlur={(e) => {
                      let val: any = e.target.value;
                      if (question.answer_type === 'multi') {
                        val = val.split(',').map((s: string) => s.trim()).filter(Boolean);
                      }
                      // If it looks like a number and type is numeric?
                      if (question.answer_type === 'numeric') {
                        const num = parseFloat(val);
                        if (!isNaN(num)) val = num;
                      }

                      // Update state with valid shape
                      setQuestions(prev =>
                        prev.map(q =>
                          q.id === question.id ? { ...q, correct_answer: val } : q
                        )
                      );
                      // Persist
                      updateQuestion(question.id, { correct_answer: val });
                    }}
                    placeholder={question.answer_type === 'multi' ? "Option A, Option B" : "Correct Answer"}
                    className="border-green-200 focus:border-green-500"
                    // The key is language-independent and ExamDetail mirrors it
                    // from the primary; editing it on a translation would let
                    // the two papers grade differently.
                    disabled={!isPrimarySection}
                  />
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`exclude-${question.id}`}
                      checked={question.is_excluded}
                      disabled={!isPrimarySection}
                      onCheckedChange={(checked) =>
                        updateQuestion(question.id, { is_excluded: !!checked })
                      }
                    />
                    <label
                      htmlFor={`exclude-${question.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Exclude from exam
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-4 mt-6">
        <Button
          variant="outline"
          onClick={() => navigate(`/exam/${examId}`)}
        >
          Cancel
        </Button>
        <Button
          onClick={finalizeExam}
          disabled={saving || visibleQuestions.length === 0}
        >
          <Check className="mr-2 h-4 w-4" />
          Finalize Exam
        </Button>
      </div>
    </div>
  );
}
