import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Circle, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Response {
  id: string;
  question_id: string;
  selected_answer: any;
  is_marked_for_review: boolean;
  time_spent_seconds: number;
  is_correct: boolean | null;
  question: {
    text: string;
    options: any;
    answer_type: string;
    correct_answer: any;
    q_no: number;
    section_id: string;
  };
}

interface AttemptStats {
  score: number;
  total_questions: number;
  accuracy_percentage: number;
  avg_time_per_question: number;
  time_spent_seconds: number;
}

export default function ExamReview() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [responses, setResponses] = useState<Response[]>([]);
  const [stats, setStats] = useState<AttemptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionId, setSectionId] = useState<string>("");
  const [sections, setSections] = useState<any[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [answerKeyInSamePdf, setAnswerKeyInSamePdf] = useState(false);
  const [uploadingAnswerKey, setUploadingAnswerKey] = useState(false);

  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    fetchReviewData();
  }, [attemptId]);

  const fetchReviewData = async () => {
    try {
      setLoading(true);

      // 1. Fetch current attempt to identify exam and user
      const { data: currentAttempt, error: attemptError } = await supabase
        .from("attempts")
        .select("user_id, section_id, sections(id, exam_id)")
        .eq("id", attemptId)
        .single();

      if (attemptError) throw attemptError;

      const examId = currentAttempt.sections.exam_id;
      const userId = currentAttempt.user_id;
      setSectionId(currentAttempt.sections.id); // Default to current section for uploads

      // 1b. Check if current user is the creator
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: examData, error: examError } = await supabase
          .from("exams")
          .select("user_id")
          .eq("id", examId)
          .single();

        if (!examError && examData) {
          setIsCreator(user.id === examData.user_id);
        }
      }

      // 2. Fetch all sections for this exam
      const { data: sections, error: sectionsError } = await supabase
        .from("sections")
        .select("*")
        .eq("exam_id", examId)
        .order("created_at");

      if (sectionsError) throw sectionsError;
      setSections(sections);

      // 3. Fetch ALL attempts for these sections by this user
      const { data: allAttempts, error: allAttemptsError } = await supabase
        .from("attempts")
        .select("*")
        .in("section_id", sections.map(s => s.id))
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (allAttemptsError) throw allAttemptsError;

      // 4. Group by section_id and pick latest attempt for each section
      const latestAttemptsBySection = new Map();
      allAttempts.forEach(attempt => {
        if (!latestAttemptsBySection.has(attempt.section_id)) {
          latestAttemptsBySection.set(attempt.section_id, attempt);
        }
      });

      const selectedAttempts = Array.from(latestAttemptsBySection.values());
      const selectedAttemptIds = selectedAttempts.map(a => a.id);

      // 5. Fetch Responses for ALL selected attempts
      const { data: responsesData, error: responsesError } = await supabase
        .from("responses")
        .select(`
          *,
          question:parsed_questions(text, options, answer_type, correct_answer, q_no, section_id)
        `)
        .in("attempt_id", selectedAttemptIds);

      if (responsesError) throw responsesError;

      // Sort responses: First by section order, then by question number
      const sectionOrder = new Map(sections.map((s, index) => [s.id, index]));

      const sortedResponses = (responsesData as any).sort((a: any, b: any) => {
        const sectionA = sectionOrder.get(a.question.section_id) ?? 999;
        const sectionB = sectionOrder.get(b.question.section_id) ?? 999;

        if (sectionA !== sectionB) return sectionA - sectionB;
        return a.question.q_no - b.question.q_no;
      });

      // 6. Calculate Stats & Grade on the fly
      const aggregatedStats: AttemptStats = {
        score: 0,
        total_questions: 0,
        accuracy_percentage: 0,
        avg_time_per_question: 0,
        time_spent_seconds: 0,
      };

      // Helper to check correctness
      const checkCorrectness = (response: any) => {
        if (response.is_correct !== null) return response.is_correct;

        const selected = response.selected_answer;
        const correct = response.question.correct_answer;

        if (!selected) return false;
        if (!correct) return false;

        const normalize = (val: any) => String(val).trim().toLowerCase();

        if (Array.isArray(correct)) {
          if (Array.isArray(selected)) {
            if (selected.length !== correct.length) return false;
            const sortedSelected = [...selected].sort().map(normalize);
            const sortedCorrect = [...correct].sort().map(normalize);
            return sortedSelected.every((val, index) => val === sortedCorrect[index]);
          }
          return correct.some(c => normalize(c) === normalize(selected));
        }

        return normalize(selected) === normalize(correct);
      };

      const gradedResponses = sortedResponses.map((r: any) => {
        const isCorrect = checkCorrectness(r);
        return { ...r, is_correct: isCorrect };
      });

      gradedResponses.forEach((r: any) => {
        aggregatedStats.total_questions++;
        aggregatedStats.time_spent_seconds += (r.time_spent_seconds || 0);
        if (r.is_correct) {
          aggregatedStats.score++;
        }
      });

      if (aggregatedStats.total_questions > 0) {
        aggregatedStats.accuracy_percentage = Math.round((aggregatedStats.score / aggregatedStats.total_questions) * 100);
        aggregatedStats.avg_time_per_question = aggregatedStats.time_spent_seconds / aggregatedStats.total_questions;
      }

      setStats(aggregatedStats);
      setResponses(gradedResponses);

    } catch (error: any) {
      console.error("Error fetching review data:", error);
      toast({
        title: "Error",
        description: "Failed to load exam review",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadAnswerKey = async (file: File | null) => {
    try {
      setUploadingAnswerKey(true);

      if (answerKeyInSamePdf) {
        // Trigger regrade with existing PDF
        toast({
          title: "Processing",
          description: "Extracting answer key from exam PDF...",
        });
        // TODO: Call edge function to extract answers from same PDF
      } else if (file) {
        // Upload new answer key PDF
        const fileName = `answer-key-${sectionId}-${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("exam-pdfs")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        toast({
          title: "Processing",
          description: "Parsing answer key PDF...",
        });
        // TODO: Call edge function to parse answer key and grade
      }

      setUploadDialogOpen(false);
      // Refresh data after grading
      setTimeout(() => fetchReviewData(), 2000);
    } catch (error: any) {
      console.error("Error uploading answer key:", error);
      toast({
        title: "Error",
        description: "Failed to upload answer key",
        variant: "destructive",
      });
    } finally {
      setUploadingAnswerKey(false);
    }
  };

  const getStatusIcon = (response: Response) => {
    if (response.is_correct === null) {
      return response.selected_answer ? (
        <Circle className="w-5 h-5 text-muted-foreground" />
      ) : (
        <Circle className="w-5 h-5 text-muted-foreground" />
      );
    }
    return response.is_correct ? (
      <CheckCircle2 className="w-5 h-5 text-green-500" />
    ) : (
      <XCircle className="w-5 h-5 text-destructive" />
    );
  };

  const getStatusText = (response: Response) => {
    if (response.is_correct === null) {
      return response.selected_answer ? "Attempted" : "Unattempted";
    }
    return response.is_correct ? "Correct" : "Wrong";
  };

  const formatAnswer = (answer: any, answerType: string) => {
    if (!answer) return "Not answered";
    if (
      answerType === "single" ||
      answerType === "multi" ||
      answerType === "multiple" ||
      answerType === "multiple_choice" ||
      answerType === "true_false"
    ) {
      return Array.isArray(answer) ? answer.join(", ") : answer;
    }
    return String(answer);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading review...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>

          {isCreator && (
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Answer Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Answer Key</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="same-pdf"
                      checked={answerKeyInSamePdf}
                      onCheckedChange={(checked) => setAnswerKeyInSamePdf(checked as boolean)}
                    />
                    <Label htmlFor="same-pdf">
                      Answer key is in the same PDF
                    </Label>
                  </div>

                  {!answerKeyInSamePdf && (
                    <div>
                      <Label htmlFor="answer-key-file">Upload Answer Key PDF</Label>
                      <input
                        id="answer-key-file"
                        type="file"
                        accept=".pdf"
                        className="mt-2 block w-full text-sm text-muted-foreground
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-semibold
                          file:bg-primary file:text-primary-foreground
                          hover:file:bg-primary/90"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleUploadAnswerKey(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  )}

                  {answerKeyInSamePdf && (
                    <Button
                      onClick={() => handleUploadAnswerKey(null)}
                      disabled={uploadingAnswerKey}
                      className="w-full"
                    >
                      {uploadingAnswerKey ? "Processing..." : "Extract & Grade"}
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stats Summary */}
        {stats && (
          <Card className="p-6 mb-6 bg-card">
            <h2 className="text-2xl font-bold mb-4">Exam Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="text-2xl font-bold">
                  {stats.score}/{stats.total_questions}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Accuracy</p>
                <p className="text-2xl font-bold">{stats.accuracy_percentage}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Time/Question</p>
                <p className="text-2xl font-bold">
                  {Math.round(stats.avg_time_per_question)}s
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Time</p>
                <p className="text-2xl font-bold">
                  {Math.floor(stats.time_spent_seconds / 60)}m {stats.time_spent_seconds % 60}s
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Questions Review */}
        <div className="space-y-4">
          {responses.map((response, index) => {
            const currentSectionId = response.question.section_id;
            const previousSectionId = index > 0 ? responses[index - 1].question.section_id : null;
            const showSectionHeader = currentSectionId !== previousSectionId;
            const sectionName = sections.find(s => s.id === currentSectionId)?.name;

            return (
              <div key={response.id}>
                {showSectionHeader && (
                  <div className="flex items-center gap-2 mt-8 mb-4">
                    <h3 className="text-xl font-bold text-primary">{sectionName}</h3>
                    <div className="h-px bg-border flex-1" />
                  </div>
                )}
                <Card className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(response)}
                      <div>
                        <h3 className="font-semibold">Question {response.question.q_no}</h3>
                        <Badge variant="secondary">{getStatusText(response)}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {response.time_spent_seconds}s
                    </div>
                  </div>

                  <p className="mb-4">{response.question.text}</p>

                  <div className="space-y-2 bg-muted/50 p-4 rounded-md">
                    <div>
                      <span className="font-semibold">Your Answer: </span>
                      <span className={response.is_correct === false ? "text-destructive" : ""}>
                        {formatAnswer(response.selected_answer, response.question.answer_type)}
                      </span>
                    </div>

                    {response.question.correct_answer && (
                      <div>
                        <span className="font-semibold">Correct Answer: </span>
                        <span className="text-green-600">
                          {formatAnswer(response.question.correct_answer, response.question.answer_type)}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
