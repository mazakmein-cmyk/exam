-- ============================================================
-- THE EXAM CLOCK SURVIVES A REFRESH (mock exams)
--
-- WHAT WAS BROKEN
-- The countdown existed only in the browser tab's memory. Refresh the page and
-- the app forgot everything about time — it greeted the student with a fresh
-- full-length clock and a second set of attempt rows. Since answers now save
-- continuously (examProgress), refreshing cost nothing and bought a whole new
-- hour: a one-key unlimited-time exploit.
--
-- THE FIX
-- The deadline is written into the attempts row at the moment the clock
-- starts, and starting an exam goes through one function that FIRST looks for
-- an unexpired, unsubmitted sitting on the same sections. If one exists, it is
-- returned instead of new rows — same attempt ids, same deadline, the clock
-- kept running while the tab was gone. A fresh clock is only possible once the
-- old one has actually expired.
--
-- SECURITY INVOKER, DELIBERATELY. The insert runs as the caller, through the
-- exact RLS policies the plain client insert used ("Users can create their own
-- attempts": own user_id + student account). This function changes WHEN rows
-- are created, never WHO may create them.
--
-- COST: zero increase. This one call REPLACES the insert the client already
-- made on every exam start — same request count. Nothing runs per-second or
-- per-question. (On an actual resume the client fetches its saved answers
-- back: one extra read, only when someone really did refresh mid-exam.)
--
-- HONEST LIMIT: p_clock_seconds still comes from the browser, as the clock
-- always has — a devtools user could inflate it, exactly as they could freeze
-- the old in-memory clock. This migration kills the refresh exploit every
-- student can do by accident; hard server-side timing is the resume feature's
-- (#33) remit.
--
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS clock_deadline_at TIMESTAMPTZ;

-- The resume lookup: one user's unsubmitted rows on a handful of sections.
-- Partial index keeps it instant no matter how many finished attempts pile up.
CREATE INDEX IF NOT EXISTS idx_attempts_live_clock
  ON public.attempts (user_id, section_id)
  WHERE submitted_at IS NULL AND clock_deadline_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_exam_clock(
  p_section_ids UUID[],
  p_clock_seconds INTEGER,
  p_language TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      TIMESTAMPTZ := now();
  v_deadline TIMESTAMPTZ;
  v_resumed  BOOLEAN := false;
  v_attempts JSONB;
  v_seconds  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_section_ids IS NULL OR cardinality(p_section_ids) = 0 THEN
    RAISE EXCEPTION 'No sections to open';
  END IF;
  IF cardinality(p_section_ids) > 50 THEN
    RAISE EXCEPTION 'Too many sections';
  END IF;

  -- Floor and cap: a clock of zero would make every sitting instantly
  -- resumable-then-expired, and nothing on this platform runs longer than a day.
  v_seconds := LEAST(GREATEST(COALESCE(p_clock_seconds, 0), 10), 24 * 60 * 60);

  -- An unexpired, unsubmitted sitting on any of these sections resumes.
  -- MIN(): if several deadlines somehow coexist, the strictest one wins —
  -- resuming must never be the longer clock.
  SELECT MIN(a.clock_deadline_at) INTO v_deadline
  FROM public.attempts a
  WHERE a.user_id = v_uid
    AND a.section_id = ANY(p_section_ids)
    AND a.submitted_at IS NULL
    AND a.clock_deadline_at IS NOT NULL
    AND a.clock_deadline_at > v_now;

  IF v_deadline IS NOT NULL THEN
    v_resumed := true;
  ELSE
    v_deadline := v_now + make_interval(secs => v_seconds);
  END IF;

  -- Create whatever the live sitting is missing: everything on a fresh start,
  -- nothing on a plain resume. created_at is handed out one millisecond apart
  -- in request order because ExamReview stitches a sitting back together by
  -- walking created_at — identical stamps would split one start in two.
  INSERT INTO public.attempts
    (user_id, section_id, started_at, language, created_at, clock_deadline_at)
  SELECT
    v_uid, s.sid, v_now, p_language,
    v_now + (s.ord - 1) * interval '1 millisecond',
    v_deadline
  FROM unnest(p_section_ids) WITH ORDINALITY AS s(sid, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.attempts a
    WHERE a.user_id = v_uid
      AND a.section_id = s.sid
      AND a.submitted_at IS NULL
      AND a.clock_deadline_at IS NOT NULL
      AND a.clock_deadline_at > v_now
  );

  -- The sitting as it now stands, newest row per section.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'section_id', t.section_id,
           'language', t.language
         ) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_attempts
  FROM (
    SELECT DISTINCT ON (a.section_id) a.id, a.section_id, a.language, a.created_at
    FROM public.attempts a
    WHERE a.user_id = v_uid
      AND a.section_id = ANY(p_section_ids)
      AND a.submitted_at IS NULL
      AND a.clock_deadline_at IS NOT NULL
      AND a.clock_deadline_at > v_now
    ORDER BY a.section_id, a.created_at DESC
  ) t;

  RETURN jsonb_build_object(
    'resumed', v_resumed,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_deadline - v_now)))::integer,
    'attempts', v_attempts
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_exam_clock(UUID[], INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_exam_clock(UUID[], INTEGER, TEXT) TO authenticated;

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
      AND column_name = 'clock_deadline_at'
  ) THEN
    RAISE EXCEPTION 'clock_deadline_at column missing on attempts';
  END IF;

  -- INVOKER is the security design: the insert must pass the caller's own RLS
  -- (student-only, own user_id). A definer here would reopen what
  -- 20260801000000 closed.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'start_exam_clock' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'start_exam_clock must stay SECURITY INVOKER';
  END IF;

  v_def := pg_get_functiondef('public.start_exam_clock(uuid[], integer, text)'::regprocedure);
  IF position('clock_deadline_at > v_now' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the resume lookup lost its not-expired condition';
  END IF;
  IF position('MIN(a.clock_deadline_at)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'resuming must take the strictest deadline, never a fresh one';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_attempts_live_clock'
  ) THEN
    RAISE EXCEPTION 'the resume lookup index did not land';
  END IF;

  RAISE NOTICE 'the exam clock now lives in the database: a refresh resumes the same deadline';
END $$;
