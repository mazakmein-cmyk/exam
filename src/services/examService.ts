
import { supabase } from "@/integrations/supabase/client";

export type QuestionState = {
    selectedAnswer: any;
    isMarkedForReview: boolean;
    timeSpentSeconds: number;
    status: "untouched" | "attempted" | "viewed";
};

export type ExamSubmissionData = {
    userId: string;
    sectionId: string;
    attemptId?: string;
    timeSpentSeconds: number;
    questions: { id: string }[];
    questionStates: Record<string, QuestionState>;
};

export const saveExamAttempt = async ({
    userId,
    sectionId,
    attemptId,
    timeSpentSeconds,
    questions,
    questionStates,
}: ExamSubmissionData) => {
    let finalAttemptId = attemptId;

    // If no attemptId exists (new attempt), create one
    if (!finalAttemptId) {
        const { data, error } = await supabase
            .from("attempts")
            .insert({
                user_id: userId,
                section_id: sectionId,
                started_at: new Date().toISOString(), // Approximation for late submission
                submitted_at: new Date().toISOString(),
                time_spent_seconds: timeSpentSeconds,
            })
            .select()
            .single();

        if (error) throw error;
        finalAttemptId = data.id;
    } else {
        // Update existing attempt
        const { error } = await supabase
            .from("attempts")
            .update({
                submitted_at: new Date().toISOString(),
                time_spent_seconds: timeSpentSeconds,
            })
            .eq("id", finalAttemptId);

        if (error) throw error;
    }

    // Save responses
    const responses = questions.map((q) => ({
        attempt_id: finalAttemptId,
        question_id: q.id,
        selected_answer: questionStates[q.id]?.selectedAnswer || null,
        is_marked_for_review: questionStates[q.id]?.isMarkedForReview || false,
        time_spent_seconds: questionStates[q.id]?.timeSpentSeconds || 0,
    }));

    const { error: matchError } = await supabase.from("responses").insert(responses);
    if (matchError) throw matchError;

    return finalAttemptId;
};
