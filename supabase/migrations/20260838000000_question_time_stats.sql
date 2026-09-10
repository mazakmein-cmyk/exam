-- ============================================================
-- HONEST TIME NUMBERS (issues 12 + the "solve time" comparison)
--
-- TWO THINGS, ONE MIGRATION:
--
-- 1. "Avg Time / Question" rewarded quitting (issue 12). The tile divides
--    total question time by the section's FULL question count, so answering
--    10 of 100 read ~10x faster than reality. The honest divisor — how many
--    questions the student actually opened — was never stored. Now
--    submit_exam_attempt counts it from the very rows it just graded and
--    writes attempts.questions_visited. The client divides by that (falling
--    back to total_questions on rows older than this migration).
--    avg_time_per_question itself is UNCHANGED — the dashboard reconstructs
--    total time as avg x total_questions, and re-basing the stored average
--    would silently break that arithmetic on every consumer at once.
--
--    Alongside it, questions_answered (issue 13): the tile named "Accuracy"
--    was correct / ALL questions — a score percentage. True accuracy is
--    correct / ANSWERED, and "answered" was never stored either. Counted in
--    the same pass; "answered" means the stored answer passes the shared
--    hasAnswer rule (mock_answer_present, 20260833000000) — blank strings and
--    empty arrays are not answers. The dashboard now shows BOTH numbers,
--    labelled honestly.
--
-- 2. A student can see they spent 3 minutes on Q17 but has no idea whether
--    that is slow or normal. get_exam_question_time_stats returns, per
--    question, the average time among CORRECT answers — aggregate numbers
--    only, no identities, creator's own attempts excluded — for any caller
--    who has actually attempted the exam (or owns it). Shown on the review
--    screen as "Avg time to solve correctly".
--
-- COST: zero on the hot path. questions_visited rides the submit that
-- already happens; the stats function is called once when a review page
-- opens — a cold path.
--
-- Requires (apply first): 20260831000000 (submit_exam_attempt),
-- 20260837000000 (the column lock this migration extends),
-- 20260828000000 (grade_mock_answer). Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'submit_exam_attempt') THEN
    RAISE EXCEPTION 'apply 20260831000000_submit_exam_attempt.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'attempts_lock_columns') THEN
    RAISE EXCEPTION 'apply 20260837000000_attempts_columns_locked.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'grade_mock_answer') THEN
    RAISE EXCEPTION 'apply 20260828000000_exam_analytics_summary.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'mock_answer_present') THEN
    RAISE EXCEPTION 'apply 20260833000000_blank_answers_are_unanswered.sql first';
  END IF;
END $$;

-- ============================================================
-- 1a. How many questions the student actually opened
-- ============================================================
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS questions_visited INTEGER;

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS questions_answered INTEGER;

-- 1b. The column lock grows by one: visited is a server-computed fact, and a
--     browser rewriting it re-fakes the very speed metric this exists to fix.
--     Verbatim copy of 20260837000000's function plus the one new line.
CREATE OR REPLACE FUNCTION public.attempts_lock_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Server-side writers pass untouched: SECURITY DEFINER functions run as
  -- their owner, the SQL editor as postgres, the backend as service_role.
  -- Only the roles a browser can hold are constrained.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id                    IS DISTINCT FROM OLD.id
     OR NEW.user_id               IS DISTINCT FROM OLD.user_id
     OR NEW.section_id            IS DISTINCT FROM OLD.section_id
     OR NEW.language              IS DISTINCT FROM OLD.language
     OR NEW.score                 IS DISTINCT FROM OLD.score
     OR NEW.total_questions       IS DISTINCT FROM OLD.total_questions
     OR NEW.accuracy_percentage   IS DISTINCT FROM OLD.accuracy_percentage
     OR NEW.avg_time_per_question IS DISTINCT FROM OLD.avg_time_per_question
     OR NEW.time_spent_seconds    IS DISTINCT FROM OLD.time_spent_seconds
     OR NEW.started_at            IS DISTINCT FROM OLD.started_at
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
     OR NEW.submitted_at          IS DISTINCT FROM OLD.submitted_at
     OR NEW.clock_deadline_at     IS DISTINCT FROM OLD.clock_deadline_at
     OR NEW.questions_visited     IS DISTINCT FROM OLD.questions_visited
     OR NEW.questions_answered    IS DISTINCT FROM OLD.questions_answered
  THEN
    RAISE EXCEPTION 'ATTEMPTS_COLUMN_LOCKED: only marks_score and marks_max may be updated directly';
  END IF;

  RETURN NEW;
END;
$$;

-- 1c. submit_exam_attempt counts visited questions while it grades.
--     Verbatim copy of the 20260831000000 definition except: the saved CTE
--     also returns status/selected_answer, one aggregate counts the visited
--     rows, and the attempt stamp writes questions_visited.
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
  v_visited integer;
  v_answered integer;
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
    RETURNING r.question_id, r.is_correct, r.time_spent_seconds, r.status, r.selected_answer
  )
  SELECT
    COALESCE(SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END), 0)::integer,
    -- Visited: the student opened it — spent time on it, moved through it, or
    -- answered it. This is the honest denominator for a speed metric; the
    -- full section count made abandoning a paper read as being 10x faster.
    COALESCE(COUNT(*) FILTER (
      WHERE COALESCE(s.time_spent_seconds, 0) > 0
         OR s.status IN ('viewed', 'attempted')
         OR (s.selected_answer IS NOT NULL AND jsonb_typeof(s.selected_answer) <> 'null')
    ), 0)::integer,
    -- Answered: the stored answer passes the shared hasAnswer rule — "" and []
    -- are not answers. This is true accuracy's denominator (correct/answered);
    -- the paper's full count is the score%'s.
    COALESCE(COUNT(*) FILTER (
      WHERE public.mock_answer_present(s.selected_answer)
    ), 0)::integer,
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
  INTO v_correct, v_visited, v_answered, v_time_on_questions, v_results
  FROM saved s
  JOIN public.parsed_questions q ON q.id = s.question_id;

  -- ── Stamp the attempt ─────────────────────────────────────────────────
  UPDATE public.attempts
  SET submitted_at          = now(),
      time_spent_seconds    = GREATEST(COALESCE(p_time_spent_seconds, 0), 0),
      score                 = v_correct,
      total_questions       = v_total,
      questions_visited     = v_visited,
      questions_answered    = v_answered,
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

-- ============================================================
-- 2. "Avg time to solve correctly", per question — aggregates only
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_exam_question_time_stats(p_exam_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    -- The caller sat this exam (any section, any sitting) or owns it. Nobody
    -- else gets timing data — and what they get carries no identities at all:
    -- an average and a count per question, nothing else.
    SELECT 1 AS ok
    FROM public.exams e
    WHERE e.id = p_exam_id
      AND (
        e.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.attempts a
          JOIN public.sections s ON s.id = a.section_id
          WHERE s.exam_id = p_exam_id AND a.user_id = auth.uid()
        )
      )
  ),
  solved AS (
    SELECT
      r.question_id,
      AVG(r.time_spent_seconds)::numeric AS avg_secs,
      COUNT(*)::int AS n
    FROM public.responses r
    JOIN public.attempts a ON a.id = r.attempt_id
    JOIN public.sections s ON s.id = a.section_id
    JOIN public.exams e ON e.id = s.exam_id
    JOIN public.parsed_questions q ON q.id = r.question_id
    WHERE s.exam_id = p_exam_id
      AND a.submitted_at IS NOT NULL
      AND a.user_id <> e.user_id
      -- Correct answers only: the number shown is "how long does it take to
      -- SOLVE this", not "how long do people stare before guessing".
      AND COALESCE(r.is_correct, public.grade_mock_answer(q.correct_answer, r.selected_answer)) = true
      -- Zero-time rows are pre-tracking history or instant blind luck;
      -- both drag the average into fiction.
      AND COALESCE(r.time_spent_seconds, 0) > 0
      AND EXISTS (SELECT 1 FROM allowed)
    GROUP BY r.question_id
  )
  SELECT COALESCE(jsonb_object_agg(
    solved.question_id,
    jsonb_build_object(
      'avg_seconds', ROUND(solved.avg_secs)::int,
      'solved_count', solved.n
    )
  ), '{}'::jsonb)
  FROM solved;
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_question_time_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_question_time_stats(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts'
      AND column_name = 'questions_visited'
  ) THEN
    RAISE EXCEPTION 'questions_visited column missing on attempts';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts'
      AND column_name = 'questions_answered'
  ) THEN
    RAISE EXCEPTION 'questions_answered column missing on attempts';
  END IF;

  v_def := pg_get_functiondef('public.submit_exam_attempt(uuid, jsonb, integer)'::regprocedure);
  IF position('questions_visited     = v_visited' IN v_def) = 0 THEN
    RAISE EXCEPTION 'submit_exam_attempt does not stamp the visited count';
  END IF;
  IF position('questions_answered    = v_answered' IN v_def) = 0 THEN
    RAISE EXCEPTION 'submit_exam_attempt does not stamp the answered count — true accuracy has no denominator';
  END IF;

  v_def := pg_get_functiondef('public.attempts_lock_columns()'::regprocedure);
  IF position('questions_visited     IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the column lock does not cover questions_visited — a browser could re-fake the speed metric';
  END IF;
  IF position('questions_answered    IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the column lock does not cover questions_answered — a browser could re-fake accuracy';
  END IF;
  IF position('clock_deadline_at     IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'rebuilding the lock dropped clock_deadline_at';
  END IF;

  v_def := pg_get_functiondef('public.get_exam_question_time_stats(uuid)'::regprocedure);
  IF position('a.user_id <> e.user_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the stats include the creator''s own attempts';
  END IF;
  IF position('jsonb_build_object' IN v_def) = 0
     OR position('user_id'', ' IN v_def) > 0 THEN
    RAISE EXCEPTION 'the stats payload must carry aggregates only, never identities';
  END IF;
  IF has_function_privilege('public', 'public.get_exam_question_time_stats(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_exam_question_time_stats is executable by PUBLIC';
  END IF;

  -- A caller who neither owns nor attempted the exam gets an empty object,
  -- not an error (and certainly not data).
  PERFORM public.get_exam_question_time_stats('00000000-0000-0000-0000-000000000000'::uuid);

  RAISE NOTICE 'time numbers are honest: visited count stamped at submit, solve-time averages served to participants';
END $$;
