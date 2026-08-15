-- ============================================================
-- LIVE EXAMS: one definition of "the primary language's play order"
--
-- ZERO BEHAVIOUR CHANGE. This migration extracts a copy-pasted subquery into a
-- helper and repoints four callers at it. Nothing computes a different answer.
--
-- WHY THIS IS WORTH A MIGRATION OF ITS OWN
-- This subquery —
--
--     SELECT lq.id,
--            ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
--     FROM public.live_questions lq
--     JOIN public.live_sections ls ON lq.live_section_id = ls.id
--     WHERE ls.live_exam_id = ... AND ls.language = <primary>
--
-- is pasted into nine functions. It answers "which primary-language question is
-- at position N", which is what live_exams.current_question_index means, and it
-- is CORRECT — position is genuinely the right key for the host's cursor.
--
-- The hazard is arithmetic, not semantic: nine copies means nine chances to miss
-- one. That risk is not hypothetical here. live_session_sync alone has SIX
-- definitions across six migrations, and because CREATE OR REPLACE does not
-- merge, only the last one applied exists — editing any of the other five is a
-- silent no-op. The upcoming change to question_group_id matching has to touch
-- this area, and doing that against nine copies is how a half-migrated system
-- ships.
--
-- SCOPE — four of the nine, deliberately
-- Converted here: flag_live_confusion, live_open_question_tally,
-- undo_last_live_unlock, end_live_session. These four use position and will
-- keep using position; nothing later in this project changes their semantics,
-- so converting them now is pure de-duplication at zero risk.
--
-- NOT converted here, on purpose:
--   * submit_live_response, get_revealed_live_answers, live_ordinal_min_seconds,
--     live_ordinal_max_seconds — these do genuine cross-language matching and
--     are being rewritten in the question_group_id migration. Rewriting them
--     twice doubles the transcription risk for no gain.
--   * live_session_sync — gains a new field when the student client starts
--     resolving its question by name tag. Same argument: rewrite it once, in
--     the migration that actually changes it.
--
-- WHAT IS NOT ADDED
-- No inverse helper (question → ordinal). Nothing here needs one; it belongs in
-- the migration that first uses it. live_primary_questions is the single
-- definition of the ordering either way, so adding it later duplicates nothing.
-- ============================================================


-- ============================================================
-- 1. live_primary_questions — the play order, defined once
--
--    Set-returning rather than scalar because the callers need two different
--    shapes of the same question: three want "the row AT ordinal N", and
--    end_live_session wants "every row UP TO ordinal N". A scalar
--    canonical_question(exam, ordinal) would have served the first three and
--    left the fourth with its own private copy of the ordering — which is the
--    problem this migration exists to remove.
--
--    Resolves primary_language itself instead of taking it as an argument. The
--    callers all had it to hand from a row they had already fetched, but making
--    the helper self-contained means a caller cannot pass the wrong language.
--
--    SECURITY DEFINER with no GRANT: every caller is itself a SECURITY DEFINER
--    function, and inside one the effective user is the owner, who always holds
--    EXECUTE on its own functions. So the helper works without being reachable
--    from PostgREST. The explicit REVOKE matters because PostgreSQL grants
--    EXECUTE to PUBLIC by default — this repo has exactly one other REVOKE in
--    62 migrations, so the default has bitten before.
--
--    It returns (id, ordinal) and nothing else. An earlier draft returned
--    `public.live_questions`, which would have handed correct_answer to any
--    caller — reopening the hole that 20260729020000 closed by dropping
--    students' direct read on the table in favour of the live_questions_student
--    view.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_primary_questions(p_live_exam_id UUID)
RETURNS TABLE (id UUID, ordinal INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lq.id,
    (ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1)::INTEGER AS ordinal
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  JOIN public.live_exams    le ON le.id = ls.live_exam_id
  WHERE ls.live_exam_id = p_live_exam_id
    AND ls.language = le.primary_language;
$$;

REVOKE EXECUTE ON FUNCTION public.live_primary_questions(UUID) FROM PUBLIC;


-- ============================================================
-- 2. flag_live_confusion — unchanged except for the lookup
-- ============================================================
CREATE OR REPLACE FUNCTION public.flag_live_confusion(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_exam         public.live_exams;
  v_canonical_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status <> 'live' OR v_exam.current_question_index < 0 THEN
    RAISE EXCEPTION 'No question is currently open';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Join the exam first';
  END IF;

  -- Signals attach to the canonical (primary-language) question row, exactly
  -- like responses, so counts aggregate across translations.
  SELECT p.id INTO v_canonical_id
  FROM public.live_primary_questions(p_live_exam_id) p
  WHERE p.ordinal = v_exam.current_question_index;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'No question is currently open';
  END IF;

  INSERT INTO public.live_confusion_signals
    (live_exam_id, live_question_id, user_id, question_ordinal)
  VALUES
    (p_live_exam_id, v_canonical_id, v_uid, v_exam.current_question_index)
  ON CONFLICT (live_question_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_live_confusion(UUID) TO authenticated;


-- ============================================================
-- 3. live_open_question_tally — unchanged except for the lookup
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_open_question_tally(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam           public.live_exams;
  v_canonical_id   UUID;
  v_count          INTEGER := 0;
  v_confusion      INTEGER := 0;
  v_tally          JSONB   := '{}';
  v_first          TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  IF v_exam.current_question_index < 0 THEN
    RETURN jsonb_build_object(
      'live_question_id', NULL, 'response_count', 0, 'confusion_count', 0,
      'option_tally', '{}'::jsonb, 'first_response_at', NULL, 'server_now', now()
    );
  END IF;

  SELECT p.id INTO v_canonical_id
  FROM public.live_primary_questions(p_live_exam_id) p
  WHERE p.ordinal = v_exam.current_question_index;

  IF v_canonical_id IS NULL THEN
    RETURN jsonb_build_object(
      'live_question_id', NULL, 'response_count', 0, 'confusion_count', 0,
      'option_tally', '{}'::jsonb, 'first_response_at', NULL, 'server_now', now()
    );
  END IF;

  SELECT COUNT(*), MIN(submitted_at) INTO v_count, v_first
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

  -- Keys are the JSON text of selected_answer, identical to
  -- live_question_analytics.option_distribution, so one client-side
  -- normaliser serves both the live river and the post-reveal breakdown.
  SELECT COALESCE(jsonb_object_agg(opt, cnt), '{}')
  INTO v_tally
  FROM (
    SELECT selected_answer::text AS opt, COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id
      AND live_question_id = v_canonical_id
      AND selected_answer IS NOT NULL
    GROUP BY selected_answer::text
  ) sub;

  SELECT COUNT(*) INTO v_confusion
  FROM public.live_confusion_signals
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

  RETURN jsonb_build_object(
    'live_question_id',   v_canonical_id,
    'response_count',     v_count,
    'confusion_count',    v_confusion,
    'option_tally',       v_tally,
    'first_response_at',  v_first,
    'server_now',         now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_open_question_tally(UUID) TO authenticated;


-- ============================================================
-- 4. undo_last_live_unlock — unchanged except for the lookup
--
--    Reproduced from 20260804000000_live_v2_controls.sql:247-378 verbatim.
--    Every guard, every ordering constraint and every comment is preserved:
--    the FOR UPDATE that makes the response count trustworthy, the 5-second
--    window, the UNDO_PREV_STILL_OPEN check, the optimistic index guard, and
--    the deliberate placement of the confusion DELETE last.
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_last_live_unlock(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam          public.live_exams;
  v_index         INTEGER;
  v_canonical_id  UUID;
  v_responses     INTEGER;
  v_prev_unlocked TIMESTAMPTZ;
  v_prev_extra    INTEGER;
  v_prev_seconds  INTEGER;
  v_result        public.live_exams;
BEGIN
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR UPDATE;

  IF v_exam.id IS NULL OR v_exam.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'UNDO_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'UNDO_NOT_LIVE';
  END IF;

  v_index := v_exam.current_question_index;
  IF v_index < 0 OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'UNDO_NOTHING_TO_UNDO';
  END IF;

  -- Five seconds. Long enough to catch a fat-fingered space bar, short enough
  -- that nobody has read the question yet.
  IF now() > v_exam.current_question_unlocked_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'UNDO_WINDOW_EXPIRED';
  END IF;

  SELECT p.id INTO v_canonical_id
  FROM public.live_primary_questions(p_live_exam_id) p
  WHERE p.ordinal = v_index;

  -- Anyone answered? The FOR UPDATE above is what makes this count trustworthy:
  -- submit_live_response takes FOR SHARE on the same row (section 7), so any
  -- submission that began before us has committed by the time we get here, and
  -- any that begins after us sees the rewound index and is refused.
  IF v_canonical_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_responses
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

    IF v_responses > 0 THEN
      RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', v_responses;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.live_question_analytics
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id
    ) THEN
      RAISE EXCEPTION 'UNDO_ALREADY_GRADED';
    END IF;
  END IF;

  -- ─── Restore the previous question ────────────────────────
  IF v_index = 0 THEN
    v_prev_unlocked := NULL;
    v_prev_extra := 0;
  ELSE
    SELECT unlocked_at, extra_seconds INTO v_prev_unlocked, v_prev_extra
    FROM public.live_unlock_log
    WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index - 1;

    -- No log row means this session predates the log (or it was pruned). Restoring
    -- NULL would brick the session: no unlock control, and the previous question's
    -- reveal retracted from every student. Refusing is the honest outcome.
    IF v_prev_unlocked IS NULL THEN
      RAISE EXCEPTION 'UNDO_NO_HISTORY';
    END IF;

    -- CORRECTION 2. A past unlock time does not mean a closed question. Nothing
    -- forces the creator to wait for Q(N-1) to expire before moving on, so undoing
    -- a fast double-unlock would drop the room back into a question that is still
    -- running — and whose answer the reveal RPC may already have published.
    v_prev_seconds := public.live_ordinal_min_seconds(p_live_exam_id, v_index - 1);
    IF v_prev_seconds IS NOT NULL
       AND now() < public.live_question_deadline(v_prev_unlocked, v_prev_seconds, v_prev_extra) THEN
      RAISE EXCEPTION 'UNDO_PREV_STILL_OPEN';
    END IF;
  END IF;

  UPDATE public.live_exams
  SET current_question_index = v_index - 1,
      current_question_unlocked_at = v_prev_unlocked,
      current_question_extra_seconds = COALESCE(v_prev_extra, 0)
  WHERE id = p_live_exam_id
    -- Optimistic guard. Two control tabs cannot both undo the same unlock: the
    -- loser finds the index already moved and affects zero rows.
    AND current_question_index = v_index
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'UNDO_CONFLICT';
  END IF;

  -- The row is retained rather than deleted, so MAX(question_ordinal) still shows
  -- N and a second undo is refused. undo_count survives the re-unlock upsert that
  -- clears undone_at, which is how D1's timeline can still say this happened.
  UPDATE public.live_unlock_log
  SET undone_at = now(),
      undo_count = undo_count + 1
  WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index;

  -- LAST, deliberately. This is the only destructive statement in the function,
  -- and every guard that could abort the transaction has now passed. Confusion
  -- signals must go because their PK would silently swallow a re-raised signal
  -- when the question is asked again, leaving the student stuck on "Sent" and the
  -- creator's count short.
  IF v_canonical_id IS NOT NULL THEN
    DELETE FROM public.live_confusion_signals
    WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_live_unlock(UUID) TO authenticated;


-- ============================================================
-- 5. end_live_session — unchanged except for the lookup
--
--    The one caller that wants a RANGE (every question up to the current one)
--    rather than a single row, which is why the helper is set-returning.
--    Reproduced from 20260807000000_live_v2_report.sql:371-428.
-- ============================================================
CREATE OR REPLACE FUNCTION public.end_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.live_exams;
  v_qid UUID;
BEGIN
  UPDATE public.live_exams
  SET status = 'ended',
      ended_at = now()
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'live'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot end: not the creator or exam is not live';
  END IF;

  -- Safety net: compute analytics for any unlocked primary-language question
  -- that never got them (e.g. the creator's tab was closed at timer expiry).
  -- NOTE: status is flipped to 'ended' ABOVE, before this loop, and the analytics
  -- guard depends on that ordering. Do not reorder.
  FOR v_qid IN
    SELECT p.id
    FROM public.live_primary_questions(p_live_exam_id) p
    WHERE p.ordinal <= v_result.current_question_index
      AND NOT EXISTS (
        SELECT 1 FROM public.live_question_analytics a
        WHERE a.live_exam_id = p_live_exam_id AND a.live_question_id = p.id
      )
  LOOP
    PERFORM public.compute_live_question_analytics(p_live_exam_id, v_qid);
  END LOOP;

  PERFORM public.compute_live_rankings(p_live_exam_id);

  -- D1. After the backfill and the rankings, so the report sees final numbers.
  BEGIN
    INSERT INTO public.live_exam_reports (live_exam_id, payload)
    VALUES (p_live_exam_id, public.build_live_exam_report(p_live_exam_id))
    ON CONFLICT (live_exam_id) DO UPDATE
      SET payload = EXCLUDED.payload, computed_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'build_live_exam_report failed for %: %', p_live_exam_id, SQLERRM;
  END;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_live_session(UUID) TO authenticated;


-- ============================================================
-- 6. Self-check — prove the helper is EXACTLY the expression it replaced
--
--    Not a body-text assertion. This runs the helper against every live exam in
--    the database and set-compares its output with the inline expression it was
--    extracted from, in both directions. Zero differences is the only acceptable
--    result, because the entire claim of this migration is "zero behaviour
--    change" — and unlike the four rewritten functions, this can be proven
--    rather than reviewed.
--
--    It RAISES rather than notices. A mismatch means the refactor changed what
--    the host's cursor resolves to, which would mis-attribute every response of
--    every session that followed.
-- ============================================================
DO $$
DECLARE
  v_only_helper INTEGER;
  v_only_inline INTEGER;
  v_exams       INTEGER;
BEGIN
  SELECT count(*) INTO v_exams FROM public.live_exams;

  WITH helper AS (
    SELECT e.id AS exam_id, h.id AS question_id, h.ordinal
    FROM public.live_exams e
    CROSS JOIN LATERAL public.live_primary_questions(e.id) h
  ),
  inline AS (
    SELECT ls.live_exam_id AS exam_id, lq.id AS question_id,
           (ROW_NUMBER() OVER (
              PARTITION BY ls.live_exam_id
              ORDER BY lq.global_index, lq.q_no, lq.id
            ) - 1)::INTEGER AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    JOIN public.live_exams    le ON le.id = ls.live_exam_id
    WHERE ls.language = le.primary_language
  )
  SELECT
    (SELECT count(*) FROM (SELECT * FROM helper EXCEPT SELECT * FROM inline) a),
    (SELECT count(*) FROM (SELECT * FROM inline EXCEPT SELECT * FROM helper) b)
  INTO v_only_helper, v_only_inline;

  IF v_only_helper <> 0 OR v_only_inline <> 0 THEN
    RAISE EXCEPTION
      'live_primary_questions is NOT equivalent to the expression it replaced: % row(s) only in the helper, % only inline. Do not proceed — the host cursor would resolve differently.',
      v_only_helper, v_only_inline;
  END IF;

  RAISE NOTICE 'live_primary_questions verified equivalent across % live exam(s); 4 callers repointed', v_exams;
END $$;
