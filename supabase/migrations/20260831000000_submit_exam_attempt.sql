-- ============================================================
-- SUBMIT A PRACTICE ATTEMPT ON THE SERVER
--
-- WHY THIS EXISTS
-- The exam runner does select("*") on parsed_questions, and the RLS policy
-- "Anyone can view questions of published exams" returns whole rows — so the
-- answer key for every question is delivered into the student's browser the
-- moment the exam starts. Marking happens there too, which is only possible
-- BECAUSE the browser holds the key.
--
-- Live exams already solved this: students read a projection with no
-- correct_answer, and submit_live_response grades server-side. Practice exams
-- never got the same treatment. This is that function for practice exams.
--
-- WHAT IT DOES, AND DELIBERATELY DOES NOT DO
-- It grades. It does not compute marks. The marks module — negative marking,
-- partial credit, per-question and per-section and per-exam settings, and the
-- primary-language resolution — stays in TypeScript, in one place. It does not
-- need the answer key; it only needs to know which questions were right, which
-- is what this returns. Porting it to SQL would create the largest pair of
-- duplicate implementations in the codebase, in the part students care most
-- about, and every bug found in this review was a duplicated rule that drifted.
--
-- Grading reuses public.grade_mock_answer, whose agreement with the browser's
-- comparison is pinned by the assertions in 20260828000000.
--
-- IT IS THE AUTHORITY ON score. Writing the attempt's score here also closes a
-- separate hole: the attempts UPDATE policy is USING (auth.uid() = user_id)
-- with no restriction on WHICH columns, so a student could PATCH their own
-- score to full marks. Once the client no longer computes the score, that write
-- can be taken away from it.
--
-- CALLING IT TWICE IS SAFE AND TELLS YOU NOTHING NEW. A second call on an
-- already-submitted attempt returns the stored result WITHOUT re-grading. That
-- matters: without it, a student could submit one answer, read the verdict,
-- change it and submit again — turning this into an answer oracle. One grading
-- per attempt, first call wins.
--
-- total_questions comes from the section, not from the payload: the browser
-- should not get to decide its own denominator.
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id uuid,
  p_answers jsonb,
  p_time_spent_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.attempts;
  v_total integer;
  v_correct integer;
  v_time_on_questions integer;
  v_results jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;
  IF v_attempt.user_id <> v_uid THEN
    RAISE EXCEPTION 'Not your attempt';
  END IF;

  -- Served-question count, matching what the runner shows and what
  -- get_exam_analytics counts. Floored at 1 so no caller divides by zero.
  SELECT GREATEST(COUNT(*), 1)::integer INTO v_total
  FROM public.parsed_questions q
  WHERE q.section_id = v_attempt.section_id
    AND q.is_excluded = false;

  -- ── Already submitted: report, do not re-grade ─────────────────────────
  -- Idempotent for a retry whose first response was lost, and it is what stops
  -- this being an oracle a student can probe one answer at a time.
  IF v_attempt.submitted_at IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'question_id', r.question_id,
             'is_correct', COALESCE(r.is_correct, false),
             'answer_type', q.answer_type,
             'correct_answer', q.correct_answer
           )), '[]'::jsonb)
      INTO v_results
    FROM public.responses r
    JOIN public.parsed_questions q ON q.id = r.question_id
    WHERE r.attempt_id = p_attempt_id;

    RETURN jsonb_build_object(
      'attempt_id', p_attempt_id,
      'already_submitted', true,
      'score', COALESCE(v_attempt.score, 0),
      'total_questions', COALESCE(v_attempt.total_questions, v_total),
      'results', v_results
    );
  END IF;

  -- ── Grade and store the answers ───────────────────────────────────────
  WITH incoming AS (
    SELECT
      (a ->> 'question_id')::uuid AS question_id,
      CASE
        WHEN a -> 'selected_answer' IS NULL OR jsonb_typeof(a -> 'selected_answer') = 'null'
          THEN NULL
        ELSE a -> 'selected_answer'
      END AS selected_answer,
      COALESCE((a ->> 'is_marked_for_review')::boolean, false) AS is_marked_for_review,
      GREATEST(COALESCE((a ->> 'time_spent_seconds')::integer, 0), 0) AS time_spent_seconds,
      NULLIF(a ->> 'status', '') AS status
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
  ),
  graded AS (
    -- Only questions that actually belong to this attempt's section, so a
    -- crafted payload cannot inject rows for someone else's questions.
    SELECT
      i.*,
      public.grade_mock_answer(q.correct_answer, i.selected_answer) AS is_correct
    FROM incoming i
    JOIN public.parsed_questions q ON q.id = i.question_id
    WHERE q.section_id = v_attempt.section_id
  ),
  saved AS (
    INSERT INTO public.responses AS r (
      attempt_id, question_id, selected_answer,
      is_marked_for_review, time_spent_seconds, status, is_correct
    )
    SELECT
      p_attempt_id, g.question_id, g.selected_answer,
      g.is_marked_for_review, g.time_spent_seconds, g.status, g.is_correct
    FROM graded g
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      selected_answer      = EXCLUDED.selected_answer,
      is_marked_for_review = EXCLUDED.is_marked_for_review,
      time_spent_seconds   = EXCLUDED.time_spent_seconds,
      status               = COALESCE(EXCLUDED.status, r.status),
      is_correct           = EXCLUDED.is_correct,
      updated_at           = now()
    RETURNING r.question_id, r.is_correct, r.time_spent_seconds
  )
  SELECT
    COALESCE(SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(s.time_spent_seconds), 0)::integer,
    -- answer_type and correct_answer are returned so the marks module can do
    -- partial credit on multi-select, which needs to know WHICH options were
    -- right — a bare true/false cannot express that. Returning the key here is
    -- not a leak: this runs once, at the moment the paper is handed in, and the
    -- review screen shows the same thing a second later. It is what lets the
    -- marks logic stay in one place instead of being rewritten in SQL.
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id', s.question_id,
      'is_correct', s.is_correct,
      'answer_type', q.answer_type,
      'correct_answer', q.correct_answer
    )), '[]'::jsonb)
  INTO v_correct, v_time_on_questions, v_results
  FROM saved s
  JOIN public.parsed_questions q ON q.id = s.question_id;

  -- ── Stamp the attempt ─────────────────────────────────────────────────
  UPDATE public.attempts
  SET submitted_at          = now(),
      time_spent_seconds    = GREATEST(COALESCE(p_time_spent_seconds, 0), 0),
      score                 = v_correct,
      total_questions       = v_total,
      accuracy_percentage   = (v_correct::numeric / v_total) * 100,
      avg_time_per_question = v_time_on_questions::numeric / v_total
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'already_submitted', false,
    'score', v_correct,
    'total_questions', v_total,
    'results', v_results
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_exam_attempt'
  ) THEN
    RAISE EXCEPTION 'submit_exam_attempt missing after migration';
  END IF;

  IF has_function_privilege('public', 'public.submit_exam_attempt(uuid, jsonb, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'submit_exam_attempt is still executable by PUBLIC';
  END IF;

  -- It depends on the unique index from 20260829000000 for its upsert, and on
  -- the grader and status column. Fail loudly here rather than at a student's
  -- submit.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'responses'
      AND indexname = 'responses_attempt_question_key'
  ) THEN
    RAISE EXCEPTION 'apply 20260829000000_responses_one_row_per_question.sql first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'apply 20260830000000_responses_status.sql first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'grade_mock_answer'
  ) THEN
    RAISE EXCEPTION 'apply 20260828000000_exam_analytics_summary.sql first';
  END IF;

  RAISE NOTICE 'submit_exam_attempt installed';
END $$;
