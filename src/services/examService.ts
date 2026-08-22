
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
    // Tolerated, not required. Once the answer key is withheld from students
    // (20260832000000) this comes back empty for them, and the server grader
    // supplies the key instead — see step 4b. It is still attempted so that a
    // database without that migration keeps grading exactly as it used to,
    // which makes the two deploys safe in either order.
    const { data: legacyKeyData } = await supabase
        .from("parsed_questions")
        .select("id, correct_answer, answer_type")
        .in("id", questionIds);
    let questionData: any[] | null = legacyKeyData as any[] | null;
    const hasLocalKey = (questionData?.length ?? 0) > 0;

    // 2. Grade the responses
    let correctCount = 0;
    let totalQuestions = questions.length;
    let totalTimeOnQuestions = 0;

    // Object-shaped correct answers ({ answer: ... } / { value: ... }) are read
    // with an explicit null/undefined test, never truthiness: a legitimate
    // answer of 0 (or false, or "") would otherwise read as "no answer stored"
    // and grade every submission wrong.
    const objectAnswer = (o: any) =>
        o?.answer !== undefined && o?.answer !== null ? o.answer : o?.value;

    const responses = questions.map((q) => {
        const state = questionStates[q.id];
        // `??`, not `||`: a selected answer of 0 is a real choice, not a blank.
        const selectedAnswer = state?.selectedAnswer ?? null;
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
                const val = objectAnswer(correctAnswer);
                isCorrect = val !== undefined && val !== null
                    && normalize(val) === normalize(selectedAnswer);
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
            // Carried through so a submitted row keeps the palette state the
            // in-exam writer recorded. Without it, this upsert would blank the
            // status the student's own progress had already saved.
            status: state?.status ?? "untouched",
        };
    });

    // 3. Calculate metrics
    const accuracyPercentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const avgTimePerQuestion = totalQuestions > 0 ? totalTimeOnQuestions / totalQuestions : 0;
    const score = correctCount; // Assuming 1 point per question for now

    // 4. Make sure the attempt row exists — but do NOT stamp submitted_at here.
    //
    // The server grader below refuses to grade an attempt that is already
    // submitted (that guard is what stops it being an answer oracle a student
    // can probe one answer at a time). Stamping it first would therefore make
    // every submission take the "already submitted" branch and never be graded.
    // The scores are written once, by whichever path actually grades.
    const attemptCreated = !finalAttemptId;
    if (!finalAttemptId) {
        const { data, error } = await supabase
            .from("attempts")
            .insert({
                user_id: userId,
                section_id: sectionId,
                started_at: new Date().toISOString(),
                time_spent_seconds: timeSpentSeconds,
            })
            .select()
            .single();

        if (error) throw error;
        finalAttemptId = data.id;
    }

    // 4b. Let the server grade and stamp the attempt.
    //
    // The browser has always graded, which is only possible because it holds
    // the answer key — and the key is delivered to it at exam start. Moving the
    // grading here is the step that lets the key stop being sent at all.
    //
    // It also makes `score` the server's to decide. The attempts UPDATE policy
    // is USING (auth.uid() = user_id) with no restriction on WHICH columns, so
    // while the client computes the score, a student can simply PATCH their own
    // to full marks.
    //
    // All-or-nothing on purpose: if the function is not there yet, the whole
    // original path below runs unchanged. No half-graded submissions.
    let serverGraded = false;
    try {
        const { data: graded, error: gradeError } = await (supabase.rpc as any)(
            "submit_exam_attempt",
            {
                p_attempt_id: finalAttemptId,
                p_answers: responses.map(r => ({
                    question_id: r.question_id,
                    selected_answer: r.selected_answer,
                    is_marked_for_review: r.is_marked_for_review,
                    time_spent_seconds: r.time_spent_seconds,
                    status: r.status,
                })),
                p_time_spent_seconds: timeSpentSeconds,
            }
        );
        if (gradeError) {
            // Not applied yet is the one case worth continuing past quietly.
            if (!/does not exist|schema cache/i.test(gradeError.message || "")) throw gradeError;
            console.warn(
                "submit_exam_attempt missing — grading in the browser. " +
                "Apply 20260831000000_submit_exam_attempt.sql.",
                gradeError
            );
        } else if (graded) {
            serverGraded = true;
            // The server counted from the section, not from this payload, so
            // trust its numbers over the ones computed above.
            correctCount = Number((graded as any).score ?? correctCount);
            totalQuestions = Number((graded as any).total_questions ?? totalQuestions);
            // It also hands back the key it graded against, which is what lets
            // the marks module keep doing partial credit without the browser
            // ever holding the key before the paper is handed in.
            const returned = ((graded as any).results ?? []) as any[];
            if (returned.length > 0) {
                questionData = returned.map(r => ({
                    id: r.question_id,
                    correct_answer: r.correct_answer,
                    answer_type: r.answer_type,
                }));
            }
        }
    } finally {
        // Nothing to clean up — the try exists only so a missing function can be
        // told apart from a real failure, which is handled above. A genuine
        // error propagates, deliberately: falling through to a second,
        // differently-graded write is how one attempt ends up with two scores.
    }

    if (!serverGraded && !hasLocalKey) {
        // Neither path can score this paper: the key is withheld from students
        // (as it should be) and the server grader is not installed. Failing
        // loudly beats writing a silent zero for a student who answered well.
        throw new Error(
            "Cannot grade this submission: apply migration " +
            "20260831000000_submit_exam_attempt.sql."
        );
    }

    // 4c. Only when the server did not grade: write what it would have written.
    // Same values as before this change, from the same client-side grading.
    if (!serverGraded) {
        const { error: stampError } = await supabase
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
        if (stampError) throw stampError;
    }

    // 5. Save responses (with correct attempt_id).
    // Skipped when the server graded: it already wrote every row, WITH the
    // authoritative is_correct. Re-writing them here would overwrite the
    // server's verdicts with the browser's.
    const responsesWithId = responses.map(r => ({ ...r, attempt_id: finalAttemptId }));

    // No space after the comma: PostgREST splits on_conflict on commas without
    // trimming, so 'attempt_id, question_id' names a column called " question_id"
    // and the upsert can never match the intended constraint.
    const { error: matchError } = serverGraded
        ? { error: null }
        : await supabase.from("responses").upsert(responsesWithId, { onConflict: 'attempt_id,question_id' });

    if (matchError) {
        // The upsert needs a unique index on responses(attempt_id, question_id).
        // Until 20260829000000 is applied, Postgres rejects the ON CONFLICT
        // target (42P10) and this fallback APPENDS — so a re-submitted section
        // writes a second full set of answers and every row-counting reader
        // (get_exam_analytics, ExamReview) double-counts it. Kept so an
        // un-migrated database can still submit, but no longer silent: this is
        // data corruption in slow motion, and it should be visible.
        console.warn(
            "responses upsert fell back to insert — duplicates will accumulate. " +
            "Apply migration 20260829000000_responses_one_row_per_question.sql.",
            matchError
        );
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
