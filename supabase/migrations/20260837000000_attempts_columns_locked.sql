-- ============================================================
-- STUDENTS CAN NO LONGER EDIT THEIR OWN RESULTS (issue 14)
--
-- WHAT WAS BROKEN
-- The UPDATE policy on attempts is USING (auth.uid() = user_id) with no
-- restriction on WHICH columns — RLS cannot express one. So any student with
-- devtools could PATCH their own row: marks_score (what the leaderboard ranks
-- by when marks are on), submitted_at, the time fields — and since
-- 20260836000000, clock_deadline_at, i.e. their own exam deadline. The score
-- column was already safe (server-written, 20260831000000); the rest was not.
--
-- THE FIX
-- A BEFORE UPDATE trigger that closes every column except the two the browser
-- legitimately writes (marks_score / marks_max — the marks engine runs
-- client-side by design, see 20260831000000's header). Everything else only
-- changes through the server's own functions.
--
-- HOW SERVER WRITES STAY ALLOWED
-- The gate is the ROLE, not a flag: PostgREST executes browser requests as
-- `authenticated` (or `anon`), while a SECURITY DEFINER function — like
-- submit_exam_attempt, which stamps submitted_at/score/times — runs as its
-- owner, and the SQL editor / service role are their own roles. The trigger
-- constrains only the two roles a browser can ever hold, so no server function
-- needed a rewrite. (start_exam_clock is SECURITY INVOKER but only INSERTs;
-- this trigger fires on UPDATE alone, and creators' attempt DELETEs are
-- likewise untouched.)
--
-- COST: zero. No new requests anywhere — a trivial per-row check inside
-- writes that already happen, none of which are on the 500-student hot path.
--
-- HONEST RESIDUAL: marks_score/marks_max stay client-writable because the
-- client computes them. Faking marks remains possible until the marks engine
-- moves server-side (tangled with issue 15). What is closed today: the clock,
-- the timestamps, the score, the denominators — everything the resume feature
-- and the analytics trust.
--
-- Requires (apply first): 20260836000000 (the trigger reads clock_deadline_at).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attempts'
      AND column_name = 'clock_deadline_at'
  ) THEN
    RAISE EXCEPTION 'apply 20260836000000_exam_clock_in_db.sql first';
  END IF;
END $$;

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
  THEN
    RAISE EXCEPTION 'ATTEMPTS_COLUMN_LOCKED: only marks_score and marks_max may be updated directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attempts_lock_columns ON public.attempts;
CREATE TRIGGER attempts_lock_columns
  BEFORE UPDATE ON public.attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.attempts_lock_columns();

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
    WHERE n.nspname = 'public' AND c.relname = 'attempts'
      AND t.tgname = 'attempts_lock_columns' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'the attempts column lock did not land';
  END IF;

  v_def := pg_get_functiondef('public.attempts_lock_columns()'::regprocedure);
  -- The columns the resume feature and analytics trust must all be in the lock.
  IF position('clock_deadline_at     IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the lock does not cover clock_deadline_at — a student could extend their own exam';
  END IF;
  IF position('submitted_at          IS DISTINCT FROM' IN v_def) = 0
     OR position('score                 IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the lock does not cover the graded columns';
  END IF;
  -- And the gate must be the role, or the server''s own stamps stop working.
  IF position('current_user NOT IN (''authenticated'', ''anon'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the server-role passthrough is gone — submit_exam_attempt would be blocked';
  END IF;

  RAISE NOTICE 'attempts are locked: browsers may update marks_score/marks_max and nothing else';
END $$;
