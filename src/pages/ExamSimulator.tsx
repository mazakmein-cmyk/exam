import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Flag, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Question = {
  id: string;
  q_no: number;
  text: string;
  answer_type: string;
  options: any;
  section_label: string | null;
  image_url: string | null;
};

type Section = {
  id: string;
  name: string;
  time_minutes: number;
};

type QuestionState = {
  selectedAnswer: any;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  status: "untouched" | "attempted" | "viewed";
};

const ExamSimulator = () => {
  const { examId, sectionId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [allSections, setAllSections] = useState<Section[]>([]);
  const [section, setSection] = useState<Section | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showSectionCompleteDialog, setShowSectionCompleteDialog] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSectionAndQuestions();
  }, [sectionId, examId]);

  useEffect(() => {
    if (!hasStarted || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleAutoSubmit();
          return 0;
        }
        if (prev === 300 && !showTimeWarning) {
          setShowTimeWarning(true);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasStarted, timeRemaining]);

  useEffect(() => {
    setQuestionStartTime(Date.now());
  }, [currentQuestionIndex]);

  const fetchSectionAndQuestions = async () => {
    if (!sectionId || !examId) return;

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Check if exam is published (for public access)
      const { data: examData } = await supabase
        .from("exams")
        .select("is_published")
        .eq("id", examId)
        .single();

      const isPublicExam = examData?.is_published === true;

      // If not logged in and exam is not public, deny access
      if (!user && !isPublicExam) {
        toast({
          title: "Access Denied",
          description: "Please sign in to take this exam",
          variant: "destructive",
        });
        return;
      }

      // Fetch all sections for the exam to determine order
      const { data: allSectionsData } = await supabase
        .from("sections")
        .select("*")
        .eq("exam_id", examId)
        .order("created_at", { ascending: true });

      setAllSections(allSectionsData || []);

      const { data: sectionData } = await supabase
        .from("sections")
        .select("*")
        .eq("id", sectionId)
        .single();

      const { data: questionsData } = await supabase
        .from("parsed_questions")
        .select("*")
        .eq("section_id", sectionId)
        .eq("is_excluded", false)
        .order("q_no", { ascending: true });

      // Sort questions: use final_order if available, otherwise fallback to q_no
      const sortedQuestions = (questionsData || []).sort((a, b) => {
        if (a.final_order !== null && b.final_order !== null) {
          return a.final_order - b.final_order;
        }
        return a.q_no - b.q_no;
      });

      if (sectionData) {
        setSection(sectionData);
        setQuestions(sortedQuestions as unknown as Question[]);
        setQuestionStates(
          sortedQuestions.reduce((acc, q) => ({
            ...acc,
            [q.id]: {
              selectedAnswer: null,
              isMarkedForReview: false,
              timeSpentSeconds: 0,
              status: "untouched",
            },
          }), {})
        );

        // Only create attempt if user is logged in
        if (user) {
          const { data, error } = await supabase
            .from("attempts")
            .insert({
              user_id: user.id,
              section_id: sectionId,
              started_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (error) {
            toast({
              title: "Error",
              description: "Failed to start exam attempt",
              variant: "destructive",
            });
            return;
          }

          setAttemptId(data.id);
        }

        setTimeRemaining(sectionData.time_minutes * 60);
        setHasStarted(true);
      }
    } catch (error) {
      console.error("Error fetching section:", error);
      toast({
        title: "Error",
        description: "Failed to load section",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuestionTime = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        timeSpentSeconds: prev[currentQuestion.id].timeSpentSeconds + timeSpent,
      },
    }));
  };

  const handleAnswerChange = (value: any) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        selectedAnswer: value,
        status: "attempted",
      },
    }));
  };

  const handleMarkForReview = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        isMarkedForReview: !prev[currentQuestion.id].isMarkedForReview,
      },
    }));
  };

  const handleNavigation = (direction: "next" | "prev") => {
    updateQuestionTime();

    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion && questionStates[currentQuestion.id].status === "untouched") {
      setQuestionStates((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          status: "viewed",
        },
      }));
    }

    if (direction === "next" && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else if (direction === "prev" && currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleQuestionSelect = (index: number) => {
    updateQuestionTime();

    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion && questionStates[currentQuestion.id].status === "untouched") {
      setQuestionStates((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          ...prev[currentQuestion.id],
          status: "viewed",
        },
      }));
    }

    setCurrentQuestionIndex(index);
  };

  const handleAutoSubmit = async () => {
    updateQuestionTime();
    await submitExam();
    toast({
      title: "Time's up!",
      description: "Your section has been automatically submitted.",
    });
  };

  const submitExam = async () => {
    // For anonymous users (no attemptId), just show completion dialog
    if (!attemptId) {
      toast({
        title: "Section Completed",
        description: "You've completed this section!",
      });
      setShowSectionCompleteDialog(true);
      return;
    }

    const totalTimeSpent = (section?.time_minutes || 0) * 60 - timeRemaining;

    // Update attempt
    await supabase
      .from("attempts")
      .update({
        submitted_at: new Date().toISOString(),
        time_spent_seconds: totalTimeSpent,
      })
      .eq("id", attemptId);

    // Save all responses
    const responses = questions.map((q) => ({
      attempt_id: attemptId,
      question_id: q.id,
      selected_answer: questionStates[q.id]?.selectedAnswer || null,
      is_marked_for_review: questionStates[q.id]?.isMarkedForReview || false,
      time_spent_seconds: questionStates[q.id]?.timeSpentSeconds || 0,
    }));

    await supabase.from("responses").insert(responses);

    toast({
      title: "Section Submitted",
      description: "Your responses have been saved successfully",
    });

    // Show completion dialog instead of navigating immediately
    setShowSectionCompleteDialog(true);
  };

  const handleProceedToNextSection = () => {
    const currentIndex = allSections.findIndex(s => s.id === sectionId);
    const nextSection = allSections[currentIndex + 1];
    if (nextSection) {
      // Reset state for next section
      setHasStarted(false);
      setShowSectionCompleteDialog(false);
      setCurrentQuestionIndex(0);
      setQuestionStates({});
      // Navigate to next section
      navigate(`/exam/${examId}/section/${nextSection.id}/simulator`);
    }
  };

  const handleFinishExam = () => {
    if (attemptId) {
      navigate(`/exam/review/${attemptId}`);
    } else {
      // Anonymous users - redirect to marketplace
      navigate("/marketplace");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getQuestionColor = (questionId: string) => {
    const state = questionStates[questionId];
    if (!state) return "bg-background";
    if (state.isMarkedForReview) return "bg-red-500 text-white";
    if (state.status === "attempted") return "bg-green-500 text-white";
    if (state.status === "viewed") return "bg-purple-500 text-white";
    return "bg-background";
  };

  const renderAnswerInput = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return null;

    const state = questionStates[currentQuestion.id];
    if (!state) return null; // Safety check

    // Prioritize showing options if they exist, regardless of answer_type
    // This ensures manually added options are always visible
    const hasOptions = currentQuestion.options && Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0;

    if (hasOptions) {
      // Check for multiple selection types
      if (currentQuestion.answer_type === "multi" || currentQuestion.answer_type === "multiple") {
        const selectedValues = state.selectedAnswer || [];
        return (
          <div className="space-y-3">
            {currentQuestion.options?.map((option: any, idx: number) => (
              <div key={idx} className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <Checkbox
                  id={`option-${idx}`}
                  checked={selectedValues.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleAnswerChange([...selectedValues, option]);
                    } else {
                      handleAnswerChange(selectedValues.filter((v: any) => v !== option));
                    }
                  }}
                />
                <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer font-normal">
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );
      }

      // Default to Single Choice (Radio) for all other types with options
      return (
        <RadioGroup
          value={state.selectedAnswer || ""}
          onValueChange={(value) => handleAnswerChange(value)}
        >
          {currentQuestion.options?.map((option: any, idx: number) => (
            <div key={idx} className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value={option} id={`option-${idx}`} />
              <Label htmlFor={`option-${idx}`} className="flex-1 cursor-pointer font-normal">
                {option}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }

    switch (currentQuestion.answer_type) {
      case "numeric":
        return (
          <Input
            type="number"
            value={state.selectedAnswer || ""}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Enter number"
            className="max-w-md"
          />
        );

      case "text":
      case "short_answer":
      case "essay":
      default:
        // Fallback for text or unknown types without options
        return (
          <div className="space-y-2">
            {currentQuestion.answer_type !== "text" && currentQuestion.answer_type !== "short_answer" && (
              <p className="text-sm text-muted-foreground italic">
                Options are missing for this question. Please enter your answer below.
              </p>
            )}
            {currentQuestion.answer_type === "essay" ? (
              <Textarea
                value={state.selectedAnswer || ""}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Enter your answer"
                rows={6}
              />
            ) : (
              <Input
                type="text"
                value={state.selectedAnswer || ""}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Enter your answer"
                className="max-w-md"
              />
            )}
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading section...</p>
        </div>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="absolute top-6 left-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{section?.name}</h1>
              <p className="text-muted-foreground">
                Time Limit: {section?.time_minutes} minutes
              </p>
              <p className="text-muted-foreground">
                Total Questions: {questions.length}
              </p>
            </div>
            <Button onClick={() => setHasStarted(true)} className="w-full" size="lg">
              Start Section
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentSectionIndex = allSections.findIndex(s => s.id === sectionId);
  const nextSection = allSections[currentSectionIndex + 1];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">{section?.name}</h1>
          <div className="flex items-center space-x-2 text-foreground">
            <Clock className="h-5 w-5" />
            <span className="text-lg font-mono">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Main Question Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
                {currentQuestion?.section_label && ` - ${currentQuestion.section_label}`}
              </h2>
              <Button
                variant={questionStates[currentQuestion?.id]?.isMarkedForReview ? "destructive" : "outline"}
                size="sm"
                onClick={handleMarkForReview}
              >
                <Flag className="h-4 w-4 mr-2" />
                {questionStates[currentQuestion?.id]?.isMarkedForReview ? "Marked" : "Mark for Review"}
              </Button>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-6">
                {currentQuestion?.image_url && (
                  <div className="border rounded-lg p-4 bg-slate-50">
                    <img
                      src={currentQuestion.image_url}
                      alt="Question"
                      className="max-w-full h-auto rounded-md"
                    />
                  </div>
                )}
                {currentQuestion?.text && (
                  <div className="text-foreground whitespace-pre-wrap">
                    {currentQuestion.text}
                  </div>
                )}
                {renderAnswerInput()}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => handleNavigation("prev")}
                disabled={currentQuestionIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              {currentQuestionIndex === questions.length - 1 ? (
                <Button onClick={() => setShowSubmitDialog(true)}>
                  Submit Section
                </Button>
              ) : (
                <Button onClick={() => handleNavigation("next")}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Question Palette */}
        <div className="w-80 border-l border-border bg-card overflow-y-auto p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Question Palette</h3>
          <div className="grid grid-cols-5 gap-2 mb-6">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => handleQuestionSelect(idx)}
                className={`aspect-square rounded-md text-sm transition-all ${idx === currentQuestionIndex
                  ? "border-4 border-primary font-bold text-lg shadow-lg scale-110"
                  : "border-2 border-border font-medium"
                  } ${getQuestionColor(q.id)}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span>Attempted</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-purple-500"></div>
              <span>Viewed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-background border border-border"></div>
              <span>Untouched</span>
            </div>
          </div>
        </div>
      </div>

      {/* Time Warning Dialog */}
      <AlertDialog open={showTimeWarning} onOpenChange={setShowTimeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>5 Minutes Remaining!</AlertDialogTitle>
            <AlertDialogDescription>
              You have only 5 minutes left to complete this section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Section?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit this section? You cannot change your answers after submission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitExam}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Section Completed Dialog */}
      <AlertDialog open={showSectionCompleteDialog} onOpenChange={setShowSectionCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Section Completed!</AlertDialogTitle>
            <AlertDialogDescription>
              You have successfully completed <strong>{section?.name}</strong>.
              {nextSection ? (
                <p className="mt-2">
                  The next section is <strong>{nextSection.name}</strong> ({nextSection.time_minutes} minutes).
                  Click below to proceed.
                </p>
              ) : (
                <p className="mt-2">
                  You have completed all sections of the exam.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {nextSection ? (
              <AlertDialogAction onClick={handleProceedToNextSection}>
                Start Next Section
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={handleFinishExam}>
                Finish Exam
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamSimulator;
