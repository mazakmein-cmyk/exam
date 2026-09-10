-- ============================================================
-- BLANK ANSWERS ARE UNANSWERED, NOT WRONG
--
-- WHAT WAS BROKEN
-- A student who types into a text/numeric box and backspaces it empty stores
-- "" as their answer; emptying a multi-select stores []. The student's review
-- screen (ExamReview.hasSelection) and the runner's palette (hasAnswer) both
-- call that UNANSWERED — but get_exam_analytics called anything non-null an
-- answer, so the same sitting showed up as WRONG on the creator's dashboard.
-- Worse, the "" landed in the wrong-answer tally, where it could win
-- most_common_wrong and render a blank "Most chose wrong option:" label.
--
-- THE RULE, IN ONE PLACE
-- mock_answer_present is the browser's hasAnswer (src/lib/examNavigation.js)
-- rewritten in SQL: SQL NULL and JSON null are nothing, "" and whitespace-only
-- strings are nothing, [] is nothing, everything else is an answer. If
-- hasAnswer changes, change this too.
--
-- Grading is untouched: grade_mock_answer already returns false for a blank
-- selection, and a blank was never counted correct. Only the wrong-vs-
-- unanswered split and the misconceptions tally move.
--
-- Requires 20260828000000_exam_analytics_summary.sql (grade_mock_answer,
-- mock_answer_norm, mock_answer_label) to be applied first.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'grade_mock_answer'
  ) THEN
    RAISE EXCEPTION 'apply 20260828000000_exam_analytics_summary.sql first';
  END IF;
END $$;

-- ── hasAnswer, in SQL ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mock_answer_present(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN false
    WHEN jsonb_typeof(v) = 'string' THEN btrim(v #>> '{}') <> ''
    WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) > 0
    ELSE true
  END;
$$;

-- ── The summary, rebuilt with the shared rule ────────────────────────────────
-- Identical to 20260828000000 except the three marked spots: unanswered_count,
-- wrong_count, and the wrong_tally filter now use mock_answer_present instead
-- of a null-only test.
CREATE OR REPLACE FUNCTION public.get_exam_analytics(p_exam_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owned AS (
    -- Creator-only. This returns cohort aggregates, so a non-owner gets
    -- nothing back rather than an error the dashboard would have to special-case.
    SELECT 1 AS ok
    FROM public.exams e
    WHERE e.id = p_exam_id AND e.user_id = auth.uid()
  ),
  qs AS (
    SELECT q.id, q.section_id, q.correct_answer
    FROM public.parsed_questions q
    JOIN public.sections s ON s.id = q.section_id
    WHERE s.exam_id = p_exam_id
      AND q.is_excluded = false
      AND EXISTS (SELECT 1 FROM owned)
  ),
  qcount AS (
    SELECT section_id, COUNT(*)::int AS n FROM qs GROUP BY section_id
  ),
  att AS (
    SELECT a.id, a.section_id, a.submitted_at
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    JOIN public.exams e ON e.id = s.exam_id
    WHERE s.exam_id = p_exam_id
      AND a.user_id <> e.user_id
      AND EXISTS (SELECT 1 FROM owned)
  ),
  resp AS (
    SELECT
      r.attempt_id,
      r.question_id,
      r.selected_answer,
      COALESCE(r.is_marked_for_review, false) AS reviewed,
      COALESCE(r.time_spent_seconds, 0) AS secs,
      COALESCE(r.is_correct, public.grade_mock_answer(q.correct_answer, r.selected_answer)) AS correct,
      a.submitted_at,
      (q.id IS NOT NULL) AS counts_for_question_stats
    FROM public.responses r
    JOIN att a ON a.id = r.attempt_id
    LEFT JOIN qs q ON q.id = r.question_id
  ),
  attempt_rows AS (
    -- LEFT JOIN so an attempt with no responses still reports 0, as the
    -- browser's empty-array path did.
    SELECT
      a.id AS attempt_id,
      COALESCE(SUM(CASE WHEN r.correct THEN 1 ELSE 0 END), 0)::int AS correct_count,
      COALESCE(SUM(r.secs), 0)::int AS total_time_seconds,
      COALESCE(MAX(qc.n), 0)::int AS section_question_count
    FROM att a
    LEFT JOIN resp r ON r.attempt_id = a.id
    LEFT JOIN qcount qc ON qc.section_id = a.section_id
    GROUP BY a.id
  ),
  q_rows AS (
    SELECT
      r.question_id,
      COUNT(*)::int AS total_attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END)::int AS correct_count,
      -- CHANGED: "unanswered" is the browser's hasAnswer rule — SQL/JSON null,
      -- "" (or whitespace) and [] all count as no answer, so a cleared box
      -- agrees with the student's review screen instead of reading as wrong.
      SUM(CASE WHEN NOT r.correct AND NOT public.mock_answer_present(r.selected_answer)
               THEN 1 ELSE 0 END)::int AS unanswered_count,
      SUM(CASE WHEN NOT r.correct AND public.mock_answer_present(r.selected_answer)
               THEN 1 ELSE 0 END)::int AS wrong_count,
      SUM(CASE WHEN r.reviewed THEN 1 ELSE 0 END)::int AS reviewed_count,
      SUM(r.secs)::int AS total_time_seconds
    FROM resp r
    WHERE r.submitted_at IS NOT NULL
      AND r.counts_for_question_stats
    GROUP BY r.question_id
  ),
  wrong_tally AS (
    SELECT
      r.question_id,
      public.mock_answer_label(r.selected_answer) AS label,
      COUNT(*) AS n
    FROM resp r
    WHERE r.submitted_at IS NOT NULL
      AND r.counts_for_question_stats
      AND NOT r.correct
      -- CHANGED: a blank is not a misconception; it must not win the
      -- most_common_wrong label as an invisible entry.
      AND public.mock_answer_present(r.selected_answer)
    GROUP BY r.question_id, public.mock_answer_label(r.selected_answer)
  ),
  wrong_top AS (
    SELECT DISTINCT ON (question_id) question_id, label
    FROM wrong_tally
    ORDER BY question_id, n DESC, label ASC
  )
  SELECT jsonb_build_object(
    'attempts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'attempt_id', ar.attempt_id,
        'correct_count', ar.correct_count,
        'total_time_seconds', ar.total_time_seconds,
        'section_question_count', ar.section_question_count
      )) FROM attempt_rows ar), '[]'::jsonb),
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id', qr.question_id,
        'total_attempts', qr.total_attempts,
        'correct_count', qr.correct_count,
        'wrong_count', qr.wrong_count,
        'unanswered_count', qr.unanswered_count,
        'reviewed_count', qr.reviewed_count,
        'total_time_seconds', qr.total_time_seconds,
        'most_common_wrong', wt.label
      )) FROM q_rows qr LEFT JOIN wrong_top wt ON wt.question_id = qr.question_id), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_analytics(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mock_answer_present(jsonb) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check: the SQL rule must agree with the browser's hasAnswer on every
-- shape, and the summary must actually have been rebuilt on top of it.
-- ============================================================
DO $$
BEGIN
  -- nothing
  ASSERT NOT public.mock_answer_present(NULL),              'SQL NULL is no answer';
  ASSERT NOT public.mock_answer_present('null'::jsonb),     'JSON null is no answer';
  ASSERT NOT public.mock_answer_present('""'::jsonb),       'empty string is no answer';
  ASSERT NOT public.mock_answer_present('"   "'::jsonb),    'whitespace is no answer';
  ASSERT NOT public.mock_answer_present('[]'::jsonb),       'empty array is no answer';
  -- something
  ASSERT public.mock_answer_present('"a"'::jsonb),          'a string is an answer';
  ASSERT public.mock_answer_present('"0"'::jsonb),          'the string zero is an answer';
  ASSERT public.mock_answer_present('0'::jsonb),            'the number zero is an answer';
  ASSERT public.mock_answer_present('false'::jsonb),        'false is an answer';
  ASSERT public.mock_answer_present('["0"]'::jsonb),        'a ticked option is an answer';
  ASSERT public.mock_answer_present('{"answer":"x"}'::jsonb), 'an object is an answer';

  -- the summary was rebuilt, not left on the null-only rule
  IF position('mock_answer_present' IN pg_get_functiondef('public.get_exam_analytics(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_exam_analytics was not rebuilt with the blank-answer rule';
  END IF;

  IF has_function_privilege('public', 'public.get_exam_analytics(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_exam_analytics is still executable by PUBLIC';
  END IF;

  -- Anonymous caller owns nothing, so this must come back empty, not error.
  PERFORM public.get_exam_analytics('00000000-0000-0000-0000-000000000000'::uuid);

  RAISE NOTICE 'blank answers now count as unanswered in creator analytics';
END $$;
