-- ============================================================
-- STUDENTS CAN NO LONGER EDIT THEIR OWN ANSWER SHEET
--
-- WHAT WAS BROKEN
-- 20260837000000 locked the attempts row, so a student can no longer PATCH
-- their own score. The answer sheet underneath it was left on the original
-- day-one policies: "you may write rows belonging to your own attempt", with no
-- restriction on WHICH columns (RLS cannot express one) and no trigger. So a
-- student could still PATCH responses.is_correct = true across their own rows.
--
-- That matters because the creator dashboard does not read the locked score. It
-- rebuilds one: get_exam_analytics (20260828000000) sums
--   COALESCE(r.is_correct, grade_mock_answer(...))
-- per attempt, and Analytics.tsx then overwrites attempt.score with that count
-- before Top Students, Score Distribution, the accuracy tiles and every
-- per-question difficulty number are derived from it. The honest, server-written
-- score sits in the attempts row and is discarded.
--
-- The COALESCE is the second half of the same hole. A row whose is_correct is
-- NULL is re-graded on the fly, so a student did not even need to claim a
-- verdict: INSERTing a fresh row with the right answer AFTER handing the paper
-- in was enough to be counted correct. Forcing is_correct to NULL on insert
-- alone would therefore have closed nothing.
--
-- THE FIX — two invariants, both enforced for browser roles only
--   1. A verdict is the server's to write. is_correct (and the identity columns
--      that decide which question a verdict belongs to) cannot be set or changed
--      from a browser.
--   2. A handed-in paper does not change. Once attempts.submitted_at is set, no
--      browser write may add to or alter that attempt's answers.
-- Invariant 2 is what makes invariant 1 airtight, because of the COALESCE.
--
-- WHAT THE BROWSER MAY STILL DO — the whole in-exam path is untouched
-- examProgress.flushProgress upserts selected_answer, is_marked_for_review,
-- time_spent_seconds and status while the attempt is open. None of those are
-- locked, and an open attempt has submitted_at NULL, so save-as-you-go and
-- resume keep working exactly as they do today. is_correct is not in that
-- payload, so an upsert that lands as an UPDATE leaves it untouched and the
-- IS DISTINCT FROM test below never fires.
--
-- HOW SERVER WRITES STAY ALLOWED
-- Same gate as 20260837000000: the ROLE, not a flag. submit_exam_attempt is
-- SECURITY DEFINER, so it runs as its owner and passes straight through — which
-- is also why it can write the verdicts and stamp submitted_at in the same
-- transaction. Creators deleting a section's data are unaffected: this fires on
-- INSERT and UPDATE, never DELETE.
--
-- WHY THIS REQUIRES THE SERVER GRADER
-- Without 20260831000000, examService grades in the browser and writes
-- is_correct itself (its `serverGraded` false branch). Locking the column on a
-- database without the grader would break submission outright, so this refuses
-- to install. With the grader present that branch never runs: it skips the
-- responses write entirely and lets the server's verdicts stand.
--
-- COST: one primary-key lookup on attempts per written row, inside writes that
-- already happen. Not the zero of 20260837000000, but the in-exam flush is a
-- handful of rows on a debounce, and the submit path bypasses the trigger.
--
-- HONEST RESIDUAL: marks_score/marks_max remain client-writable (20260837000000's
-- own residual), so marks-based rank can still be faked until the marks engine
-- moves server-side. This closes the correct-count path only.
--
-- Requires (apply first): 20260831000000_submit_exam_attempt.sql.
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_exam_attempt'
  ) THEN
    RAISE EXCEPTION
      'apply 20260831000000_submit_exam_attempt.sql first — without the server grader the browser must still write is_correct, and this lock would break every submission';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.responses_lock_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_submitted_at TIMESTAMPTZ;
BEGIN
  -- Server-side writers pass untouched: SECURITY DEFINER functions run as
  -- their owner, the SQL editor as postgres, the backend as service_role.
  -- Only the roles a browser can ever hold are constrained.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Invariant 2: a handed-in paper does not change. Checked first because it
  -- is the one that closes the COALESCE re-grade path, and it applies to every
  -- column — a post-submission edit of selected_answer is not a scoring exploit
  -- but it does make a student's review disagree with their own verdict.
  SELECT a.submitted_at INTO v_submitted_at
  FROM public.attempts a
  WHERE a.id = NEW.attempt_id;

  IF v_submitted_at IS NOT NULL THEN
    RAISE EXCEPTION
      'RESPONSES_ATTEMPT_SUBMITTED: this attempt has been handed in; its answers can no longer be written from a browser';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Invariant 1, insert side. An answer saved mid-exam is ungraded by
    -- definition; the grader decides the verdict at submit. Normalised rather
    -- than rejected, because a NULL here is exactly what the in-exam writer
    -- already sends and what the row would default to.
    NEW.is_correct := NULL;
    RETURN NEW;
  END IF;

  -- Invariant 1, update side.
  IF NEW.is_correct IS DISTINCT FROM OLD.is_correct
     OR NEW.id          IS DISTINCT FROM OLD.id
     OR NEW.attempt_id  IS DISTINCT FROM OLD.attempt_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
  THEN
    RAISE EXCEPTION
      'RESPONSES_COLUMN_LOCKED: is_correct and the identity columns are written by the server only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS responses_lock_columns ON public.responses;
CREATE TRIGGER responses_lock_columns
  BEFORE INSERT OR UPDATE ON public.responses
  FOR EACH ROW
  EXECUTE FUNCTION public.responses_lock_columns();


-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'responses'
      AND t.tgname = 'responses_lock_columns' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'the responses column lock did not land';
  END IF;

  v_def := pg_get_functiondef('public.responses_lock_columns()'::regprocedure);

  -- The verdict column is the whole point of the lock.
  IF position('NEW.is_correct IS DISTINCT FROM OLD.is_correct' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the lock does not cover is_correct — a student could mark their own answers correct';
  END IF;

  -- Without the submitted seal, a post-submission INSERT is re-graded by
  -- get_exam_analytics's COALESCE and counted correct.
  IF position('RESPONSES_ATTEMPT_SUBMITTED' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the submitted-attempt seal is gone — answers could be added after the paper was handed in';
  END IF;

  -- And the gate must be the role, or the server's own verdicts stop working.
  IF position('current_user NOT IN (''authenticated'', ''anon'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the server-role passthrough is gone — submit_exam_attempt would be blocked';
  END IF;

  -- It must fire on INSERT as well as UPDATE: the re-grade path is an insert.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'responses'
      AND t.tgname = 'responses_lock_columns'
      -- tgtype is a bitmask: 4 = INSERT, 16 = UPDATE
      AND (t.tgtype & 4) > 0 AND (t.tgtype & 16) > 0
  ) THEN
    RAISE EXCEPTION 'the lock must fire on INSERT and UPDATE';
  END IF;

  RAISE NOTICE 'answers are locked: browsers may write selected_answer/is_marked_for_review/time_spent_seconds/status on an open attempt, and nothing else';
END $$;
