-- ============================================================
-- AN ATTEMPT IS SOMEONE WHO ANSWERED SOMETHING
--
-- WHAT WAS BROKEN
-- An attempt row is created the moment a student clicks Start — before they
-- answer anything, because the clock and the resume feature both need a row to
-- exist. Someone who opens the paper, sees 100 questions and closes the tab
-- leaves a permanent record behind.
--
-- get_exam_analytics already ignores those rows where it matters most: the
-- per-question stats count responses on SUBMITTED attempts only. But the four
-- headline numbers the browser derives -- Total Attempts, Unique Students,
-- Repeaters and the Score Distribution -- were computed from the raw attempts
-- list, so an empty start counted as a student who scored zero. On a paper
-- shared to a group, the people who bounced off the start screen outnumbered
-- the ones who sat it, and the distribution read as though the paper had
-- crushed the class. The accuracy tile, computed from a different set, said the
-- opposite on the same screen.
--
-- THE RULE, AS THE CREATOR STATED IT
-- Answered at least one question = an attempt. Touched nothing = not an
-- attempt, and not a repeat visit either. Submission is NOT the test: someone
-- who answered forty questions and then lost their connection genuinely sat the
-- paper, and their work should count.
--
-- WHY NOT "has any response row"
-- The in-exam writer saves a row as soon as a question is VIEWED, carrying
-- status and time with a null answer, so counting rows would count reading.
-- public.mock_has_answer (20260843000000) is the same test the marks engine
-- uses for a skip, so "" and [] -- a text box typed into and cleared -- are not
-- answers here either. One definition of "answered" across scoring and
-- counting.
--
-- WHY A SEPARATE FUNCTION RATHER THAN A FIELD ON THE SUMMARY
-- get_exam_analytics is a 150-line document builder whose every number is
-- pinned by tests. Adding a column meant restating the whole body in a
-- CREATE OR REPLACE, and a transcription slip there would silently corrupt
-- numbers this migration is not otherwise touching. This is additive: the
-- summary is untouched, and the page fetches both in the request it already
-- makes in parallel.
--
-- Same ownership gate as the summary: a non-owner gets an empty list rather
-- than an error, because the dashboard would have to special-case the error.
--
-- Requires (apply first): 20260843000000 (mock_has_answer).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mock_has_answer'
  ) THEN
    RAISE EXCEPTION
      'apply 20260843000000_marks_scored_in_db.sql first — mock_has_answer is the shared definition of "answered"';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.get_exam_engaged_attempts(p_exam_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owned AS (
    SELECT 1 AS ok
    FROM public.exams e
    WHERE e.id = p_exam_id AND e.user_id = auth.uid()
  ),
  engaged AS (
    SELECT DISTINCT a.id
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    JOIN public.exams e    ON e.id = s.exam_id
    JOIN public.responses r ON r.attempt_id = a.id
    WHERE s.exam_id = p_exam_id
      -- The creator's own runs are excluded from every other number the
      -- dashboard shows; they must not reappear through this door.
      AND a.user_id <> e.user_id
      AND EXISTS (SELECT 1 FROM owned)
      AND public.mock_has_answer(r.selected_answer)
  )
  SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM engaged;
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_engaged_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_engaged_attempts(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.get_exam_engaged_attempts(uuid)'::regprocedure);

  IF position('mock_has_answer' IN v_def) = 0 THEN
    RAISE EXCEPTION 'engagement must be tested with mock_has_answer, or viewing a question would count as answering it';
  END IF;
  IF position('a.user_id <> e.user_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the creator''s own attempts must stay excluded';
  END IF;
  IF position('EXISTS (SELECT 1 FROM owned)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the ownership gate is missing — this would list attempt ids to any caller';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_exam_engaged_attempts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'the creator dashboard cannot call this';
  END IF;

  RAISE NOTICE 'engaged attempts: an attempt is a sitting where at least one question was answered';
END $$;
