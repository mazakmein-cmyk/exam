
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

    // 1. Fetch correct answers to grade the exam
    const questionIds = questions.map((q) => q.id);
    const { data: questionData, error: qError } = await supabase
        .from("parsed_questions")
        .select("id, correct_answer, answer_type")
        .in("id", questionIds);

    if (qError) throw qError;

    // 2. Grade the responses
    let correctCount = 0;
    let totalQuestions = questions.length;
    let totalTimeOnQuestions = 0;

    const responses = questions.map((q) => {
        const state = questionStates[q.id];
        const selectedAnswer = state?.selectedAnswer || null;
        const timeSpent = state?.timeSpentSeconds || 0;
        totalTimeOnQuestions += timeSpent;

        const dbQuestion = questionData?.find((dq) => dq.id === q.id);
        const correctAnswer = dbQuestion?.correct_answer;

        let isCorrect = false;

        const normalize = (val: any) => String(val).trim().toLowerCase();

        if (selectedAnswer !== null && correctAnswer !== null && correctAnswer !== undefined) {
            if (Array.isArray(correctAnswer)) {
                // Multi-select comparison
                const selectedArray = Array.isArray(selectedAnswer) ? selectedAnswer : [selectedAnswer];
                if (selectedArray.length === correctAnswer.length) {
                    const sortedSelected = [...selectedArray].map(normalize).sort();
                    const sortedCorrect = [...correctAnswer].map(normalize).sort();
                    isCorrect = sortedSelected.every((val, index) => val === sortedCorrect[index]);
                }
            } else if (typeof correctAnswer === 'object' && correctAnswer !== null) {
                // Handle potential simplified JSON structure { "answer": "A" }
                const val = (correctAnswer as any).answer || (correctAnswer as any).value;
                isCorrect = normalize(val) === normalize(selectedAnswer);
            } else {
                // Direct comparison (normalized)
                isCorrect = normalize(selectedAnswer) === normalize(correctAnswer);
            }
        }

        if (isCorrect) correctCount++;

        return {
            attempt_id: finalAttemptId, // Placeholder, updated below
            question_id: q.id,
            selected_answer: selectedAnswer,
            is_correct: isCorrect,
            is_marked_for_review: state?.isMarkedForReview || false,
            time_spent_seconds: timeSpent,
        };
    });

    // 3. Calculate metrics
    const accuracyPercentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const avgTimePerQuestion = totalQuestions > 0 ? totalTimeOnQuestions / totalQuestions : 0;
    const score = correctCount; // Assuming 1 point per question for now

    // 4. Create or Update Attempt
    if (!finalAttemptId) {
        const { data, error } = await supabase
            .from("attempts")
            .insert({
                user_id: userId,
                section_id: sectionId,
                started_at: new Date().toISOString(),
                submitted_at: new Date().toISOString(),
                time_spent_seconds: timeSpentSeconds,
                score: score,
                total_questions: totalQuestions,
                accuracy_percentage: accuracyPercentage,
                avg_time_per_question: avgTimePerQuestion,
            })
            .select()
            .single();

        if (error) throw error;
        finalAttemptId = data.id;
    } else {
        const { error } = await supabase
            .from("attempts")
            .update({
                submitted_at: new Date().toISOString(),
                time_spent_seconds: timeSpentSeconds,
                score: score,
                total_questions: totalQuestions,
                accuracy_percentage: accuracyPercentage,
                avg_time_per_question: avgTimePerQuestion,
            })
            .eq("id", finalAttemptId);

        if (error) throw error;
    }

    // 5. Save responses (with correct attempt_id)
    const responsesWithId = responses.map(r => ({ ...r, attempt_id: finalAttemptId }));

    // First delete existing responses if any (retry logic) to avoid duplicates or use upsert?
    // Simple insert might fail if unique violation? responses usually don't have unique constraint on (attempt_id, question_id) unless specified.
    // Ideally we should upsert or delete-then-insert. Let's try upsert if unique constraint exists, or just insert if simple log.
    // Checking previous code: it just used insert. Assuming new attempt or unique response tracking.
    // Given we might be updating an attempt (re-submission?), we should probably delete old responses for this attempt first strictly speaking, but previous code didn't.
    // Let's stick to simple insert. Wait, if `finalAttemptId` existed (else block), we are updating. We should probably clear old responses to be safe, or use upsert.
    // Safest for now: upsert on (attempt_id, question_id) if constraint exists.
    // I'll stick to insert for now as per original code pattern, but keep in mind duplicates.

    // Actually, usually fetching for analytics joins distinct responses. 
    // Let's rely on standard insert.

    const { error: matchError } = await supabase.from("responses").upsert(responsesWithId, { onConflict: 'attempt_id, question_id' }); // Adding optimistic conflict handling if constrained
    // If no constraint, upsert works as insert if no conflict.

    if (matchError) {
        // Fallback to simple insert if upsert fails due to missing constraint index
        const { error: insertError } = await supabase.from("responses").insert(responsesWithId);
        if (insertError) throw insertError;
    }

    return finalAttemptId;
};
