-- ============================================================
-- THE CLOCK'S LENGTH IS CAPPED BY THE PAPER ITSELF (resume feature, piece 4)
--
-- WHAT WAS LEFT OPEN
-- 20260836000000 made the deadline server-stamped and unresumable-past, and
-- 20260837000000 made it untouchable afterwards — but the DURATION at start
-- was still whatever the browser claimed (p_clock_seconds). A devtools user
-- could not reset a clock anymore, but could request a ten-hour one at the
-- moment they pressed Start.
--
-- THE CAP
-- The paper itself bounds its own clock: the requested seconds are clamped to
-- 60 x (sum of the requested sections' minutes
--       + the exam's whole-paper allowance, if the column exists
--       + the exam's timing-group pool overrides, if the table exists).
-- Deliberately GENEROUS — it is a ceiling against forgery, not a re-derivation
-- of the timing rules (the client's timingUnits stays the one implementation;
-- duplicating it in SQL is the drift trap this repo keeps warning about).
-- The hand-pasted schema pieces are probed with exception guards, so a
-- database missing the switching or grouping migrations still starts exams.
--
-- Depends on the timing-group double-pool fix (issue 6) landing client-side
-- first: the pool override is trusted as a cap input, and it is sane now that
-- a split group can no longer pay it twice.
--
-- Everything else in start_exam_clock is verbatim 20260836000000: SECURITY
-- INVOKER, resume-before-create, strictest-deadline-wins, created_at stagger.
-- COST: zero — same single call per exam start.
--
-- Requires (apply first): 20260836000000. Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'start_exam_clock') THEN
    RAISE EXCEPTION 'apply 20260836000000_exam_clock_in_db.sql first';
  END IF;
END $$;

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
  v_uid           UUID := auth.uid();
  v_now           TIMESTAMPTZ := now();
  v_deadline      TIMESTAMPTZ;
  v_resumed       BOOLEAN := false;
  v_attempts      JSONB;
  v_seconds       INTEGER;
  v_exam_id       UUID;
  v_sum_minutes   INTEGER := 0;
  v_total_minutes INTEGER := 0;
  v_group_minutes INTEGER := 0;
  v_cap_seconds   INTEGER := 0;
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

  -- ── The paper's own ceiling ─────────────────────────────────────────────
  SELECT COALESCE(SUM(s.time_minutes), 0), MAX(s.exam_id)
  INTO v_sum_minutes, v_exam_id
  FROM public.sections s
  WHERE s.id = ANY(p_section_ids);

  -- Hand-pasted migrations mean either of these can be absent; a missing
  -- column or table contributes zero instead of failing the start.
  BEGIN
    EXECUTE 'SELECT COALESCE(total_time_minutes, 0) FROM public.exams WHERE id = $1'
    INTO v_total_minutes USING v_exam_id;
  EXCEPTION WHEN undefined_column THEN
    v_total_minutes := 0;
  END;
  BEGIN
    EXECUTE 'SELECT COALESCE(SUM(time_minutes), 0) FROM public.section_timing_groups WHERE exam_id = $1'
    INTO v_group_minutes USING v_exam_id;
  EXCEPTION WHEN undefined_table THEN
    v_group_minutes := 0;
  END;

  v_cap_seconds := 60 * (COALESCE(v_sum_minutes, 0) + COALESCE(v_total_minutes, 0) + COALESCE(v_group_minutes, 0));
  -- A paper with no timing data anywhere yields cap 0 — then the 24h ceiling
  -- above is the only bound, exactly as before this migration.
  IF v_cap_seconds >= 60 THEN
    v_seconds := LEAST(v_seconds, v_cap_seconds);
  END IF;

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
  v_def := pg_get_functiondef('public.start_exam_clock(uuid[], integer, text)'::regprocedure);
  IF position('v_seconds := LEAST(v_seconds, v_cap_seconds)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the paper-derived clock cap did not land';
  END IF;
  IF position('WHEN undefined_column' IN v_def) = 0
     OR position('WHEN undefined_table' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the cap lost its absent-schema guards — un-migrated databases would fail every start';
  END IF;
  IF position('MIN(a.clock_deadline_at)' IN v_def) = 0
     OR position('clock_deadline_at > v_now' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the resume rules from 20260836000000 were lost in the rewrite';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'start_exam_clock' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'start_exam_clock must stay SECURITY INVOKER';
  END IF;

  RAISE NOTICE 'the clock length is now capped by the paper itself; resume rules unchanged';
END $$;
