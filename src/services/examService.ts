
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

    // ── MARKS MODULE: Non-fatal additive scoring ──
    // Does not affect existing `score` column. Writes to `marks_score`, `marks_max`, and `question_marks_log`.
    // KEY: For multi-language exams, scoring config is set on the PRIMARY language's sections/questions.
    // We resolve to primary IDs here so Hindi (or any secondary) students get the correct marks config.
    try {
        const { getQuestionScoringConfigs, getSectionScoringDefaults, getExamScoringDefault,
                getExamIdForSection, saveMarksLog, updateAttemptMarks } = await import('./scoringService');
        const { calculateMarks } = await import('./scoringEngine');

        const examIdForMarks = await getExamIdForSection(sectionId);
        if (examIdForMarks) {
            // Resolve primary language section and question IDs for scoring config lookup
            let configSectionId = sectionId;
            let configQuestionIds = questionIds;
            // Map: current question ID → config question ID (primary's question ID)
            let questionIdToConfigId = new Map<string, string>();
            questionIds.forEach(id => questionIdToConfigId.set(id, id)); // default: self

            try {
                // Check if this section belongs to a multi-language exam with a primary language
                const { data: currentSection } = await supabase
                    .from("sections")
                    .select("section_group_id, language")
                    .eq("id", sectionId)
                    .single();

                const { data: examForLang } = await supabase
                    .from("exams")
                    .select("primary_language")
                    .eq("id", examIdForMarks)
                    .single();

                const primaryLang = examForLang?.primary_language;

                if (primaryLang && currentSection?.language && currentSection.language !== primaryLang && currentSection.section_group_id) {
                    // This is a SECONDARY language submission — resolve to primary section
                    const { data: primarySection } = await supabase
                        .from("sections")
                        .select("id")
                        .eq("section_group_id", currentSection.section_group_id)
                        .eq("language", primaryLang)
                        .single();

                    if (primarySection) {
                        configSectionId = primarySection.id;

                        // Resolve primary question IDs via question_group_id
                        const { data: currentQuestions } = await supabase
                            .from("parsed_questions")
                            .select("id, question_group_id")
                            .in("id", questionIds);

                        const groupIds = (currentQuestions || [])
                            .map(q => q.question_group_id)
                            .filter(Boolean) as string[];

                        if (groupIds.length > 0) {
                            const { data: primaryQuestions } = await supabase
                                .from("parsed_questions")
                                .select("id, question_group_id")
                                .eq("section_id", primarySection.id)
                                .in("question_group_id", groupIds);

                            if (primaryQuestions && primaryQuestions.length > 0) {
                                // Build mapping: current question's group → primary question ID
                                const groupToPrimary = new Map(primaryQuestions.map(pq => [pq.question_group_id, pq.id]));
                                configQuestionIds = [];
                                for (const cq of (currentQuestions || [])) {
                                    const primaryId = cq.question_group_id ? groupToPrimary.get(cq.question_group_id) : undefined;
                                    if (primaryId) {
                                        questionIdToConfigId.set(cq.id, primaryId);
                                        configQuestionIds.push(primaryId);
                                    } else {
                                        configQuestionIds.push(cq.id); // fallback to self
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (resolveErr) {
                // Non-fatal: if resolution fails, fall back to current section/question IDs
                console.warn('[Marks] Primary language resolution failed, using current IDs:', resolveErr);
            }

            const [qConfigs, sConfigs, eConfig] = await Promise.all([
                getQuestionScoringConfigs(configQuestionIds),
                getSectionScoringDefaults([configSectionId]),
                getExamScoringDefault(examIdForMarks),
            ]);

            if (qConfigs.size > 0 || sConfigs.size > 0 || eConfig) {
                // Build questions array using the CONFIG IDs for scoring lookup
                // but keep the actual question data (answer_type, correct_answer) from the submitted questions
                const questionsForMarks = (questionData || []).map(q => ({
                    id: questionIdToConfigId.get(q.id) || q.id, // Use primary question ID for config lookup
                    section_id: configSectionId,  // Use primary section ID for config lookup
                    answer_type: (q as any).answer_type || 'single',
                    correct_answer: q.correct_answer,
                }));
                // Rekey questionStates by config (primary) IDs so calculateMarks' internal
                // `questionStates[q.id]` lookup resolves — q.id here is the primary ID.
                const statesForMarks: Record<string, QuestionState> = {};
                for (const [currentId, state] of Object.entries(questionStates)) {
                    const configId = questionIdToConfigId.get(currentId) || currentId;
                    statesForMarks[configId] = state;
                }
                const { total, max, perQuestion } = calculateMarks(
                    questionsForMarks, statesForMarks, qConfigs, sConfigs, eConfig
                );

                // Remap perQuestion keys back to current question IDs for logging
                // (perQuestion entries hold PRIMARY-language question_ids because we scored
                //  against the primary section/question config; we need to rewrite them
                //  back to the student's actual question_ids so question_marks_log rows
                //  point at the questions the student actually answered).
                const configToCurrentId = new Map<string, string>();
                questionIdToConfigId.forEach((configId, currentId) => configToCurrentId.set(configId, currentId));
                const remappedPerQuestion: typeof perQuestion = perQuestion.map((entry) => ({
                    ...entry,
                    question_id: configToCurrentId.get(entry.question_id) ?? entry.question_id,
                }));

                await saveMarksLog(finalAttemptId!, remappedPerQuestion);
                await updateAttemptMarks(finalAttemptId!, total, max);
            }
        }
    } catch (marksErr) {
        console.warn('[Marks] Non-fatal scoring error:', marksErr);
    }

    return finalAttemptId;
};
