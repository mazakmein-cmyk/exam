-- ============================================================
-- LIVE EXAM v2 — PHASE 6: D1, THE SESSION REPORT
--
-- Pressing End used to compute final rankings and then offer a button back to the
-- editor. Every insight from the session stayed scattered across per-question
-- rows that nobody assembles by hand at 3:40pm on a Friday.
--
-- A live quiz with no report is entertainment. A live quiz that ends with "here
-- are the three things to reteach" is a teaching tool.
--
-- Two design decisions worth stating
-- ----------------------------------
-- COMPUTED ONCE, AT END. The payload is built and stored when the session ends,
-- so the public link never runs a query — it reads one row. A shareable URL that
-- executed aggregates on every hit would be a denial-of-service surface pointed
-- at a free-tier database.
--
-- NAMES ARE RESOLVED AT READ TIME, NOT BAKED IN. The payload stores user_ids. If
-- it stored names, toggling privacy mode after the fact would leave a report full
-- of real ones — which is exactly the bug that produced the fastest_user_name leak
-- in Phase 1, and exactly why that phase needed a re-mask trigger. Storing ids and
-- masking on read means the report follows the setting, forever, with no trigger.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Storage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_exam_reports (
  live_exam_id UUID PRIMARY KEY REFERENCES public.live_exams(id) ON DELETE CASCADE,
  payload      JSONB       NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_exam_reports ENABLE ROW LEVEL SECURITY;

-- No student policy at all. The payload carries user_ids and per-student detail;
-- both read paths below are SECURITY DEFINER and mask on the way out.
DROP POLICY IF EXISTS "Creator can read own reports" ON public.live_exam_reports;
CREATE POLICY "Creator can read own reports"
  ON public.live_exam_reports FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));


-- ============================================================
-- 2. build_live_exam_report — the aggregate, run once
--
--    Everything here is already computed and sitting in a row somewhere; this
--    assembles it. The value is not new numbers, it is the numbers finally in one
--    place, ordered by what a creator should do on Monday.
-- ============================================================
CREATE OR REPLACE FUNCTION public.build_live_exam_report(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam     public.live_exams;
  v_payload  JSONB;
  v_questions JSONB;
  v_pacing   JSONB;
  v_moments  JSONB;
  v_attend   JSONB;
  v_totals   JSONB;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ─── Headline ─────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_responses', COALESCE(SUM(a.total_responses), 0),
    'total_correct',   COALESCE(SUM(a.correct_count), 0),
    'accuracy_pct',    CASE
                         WHEN COALESCE(SUM(a.total_responses), 0) > 0
                         THEN ROUND(100.0 * SUM(a.correct_count) / SUM(a.total_responses))
                         ELSE NULL
                       END,
    'questions_asked', COUNT(*),
    'confusion_total', COALESCE(SUM(a.confusion_count), 0)
  )
  INTO v_totals
  FROM public.live_question_analytics a
  WHERE a.live_exam_id = p_live_exam_id;

  -- ─── Per question, hardest first ──────────────────────────
  -- Ordered by accuracy ascending so "what do I reteach" is the top of the list
  -- rather than something to scroll for.
  SELECT COALESCE(jsonb_agg(q ORDER BY q.accuracy_pct NULLS LAST, q.ordinal), '[]')
  INTO v_questions
  FROM (
    SELECT
      lr.question_ordinal AS ordinal,
      lq.text,
      lq.options,
      lq.correct_answer,
      lq.answer_type,
      a.total_responses,
      a.correct_count,
      a.wrong_count,
      a.skipped_count,
      a.option_distribution,
      a.median_time_ms,
      a.fast_correct, a.slow_correct, a.fast_wrong, a.slow_wrong,
      a.impulsive_wrong,
      a.confusion_count,
      CASE WHEN a.total_responses > 0
           THEN ROUND(100.0 * a.correct_count / a.total_responses)
           ELSE NULL END AS accuracy_pct
    FROM public.live_question_analytics a
    JOIN public.live_questions lq ON lq.id = a.live_question_id
    LEFT JOIN LATERAL (
      SELECT DISTINCT r.question_ordinal
      FROM public.live_responses r
      WHERE r.live_exam_id = a.live_exam_id AND r.live_question_id = a.live_question_id
      LIMIT 1
    ) lr ON TRUE
    WHERE a.live_exam_id = p_live_exam_id
  ) q;

  -- ─── Pacing, from the unlock log ──────────────────────────
  -- Real per-question durations including where time was granted and where an
  -- unlock was taken back. This is the only place that history exists.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal',       ul.question_ordinal,
    'unlocked_at',   ul.unlocked_at,
    'extra_seconds', ul.extra_seconds,
    'undo_count',    ul.undo_count
  ) ORDER BY ul.question_ordinal), '[]')
  INTO v_pacing
  FROM public.live_unlock_log ul
  WHERE ul.live_exam_id = p_live_exam_id AND ul.undone_at IS NULL;

  -- ─── Moments: ids only, resolved on read ──────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal',  lm.question_ordinal,
    'kind',     lm.kind,
    'user_id',  lm.user_id,
    'value',    lm.value,
    'priority', lm.priority
  ) ORDER BY lm.question_ordinal, lm.priority), '[]')
  INTO v_moments
  FROM public.live_moments lm
  WHERE lm.live_exam_id = p_live_exam_id;

  -- ─── Attendance: ids only, resolved on read ───────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',        lp.user_id,
    'joined_at',      lp.joined_at,
    'total_correct',  lp.total_correct,
    'total_answered', lp.total_answered,
    'rank',           lp.rank,
    -- Join order, so a masked name can be derived identically to everywhere else.
    'anon_ordinal',   (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)
  ) ORDER BY lp.rank NULLS LAST, lp.joined_at)
  , '[]')
  INTO v_attend
  FROM public.live_participants lp
  WHERE lp.live_exam_id = p_live_exam_id;

  v_payload := jsonb_build_object(
    'exam_name',    v_exam.name,
    'started_at',   v_exam.started_at,
    'ended_at',     v_exam.ended_at,
    'origin_exam_id', v_exam.origin_exam_id,
    'totals',       COALESCE(v_totals, '{}'::jsonb),
    'questions',    v_questions,
    'pacing',       v_pacing,
    'moments',      v_moments,
    'attendance',   v_attend
  );

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_live_exam_report(UUID) TO authenticated;


-- ============================================================
-- 3. Read paths — both mask names from the CURRENT privacy setting
--
--    The stored payload has ids; these put names on them. That is what makes a
--    privacy toggle apply retroactively to a report that was computed months ago,
--    with no trigger and no re-mask pass.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_report_with_names(
  p_live_exam_id UUID,
  p_payload JSONB,
  p_reveal_real_names BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(t.user_id::text, t.name), '{}')
  INTO v_names
  FROM (
    SELECT
      lp.user_id,
      CASE
        WHEN p_reveal_real_names THEN lp.display_name
        ELSE public.live_anon_name(
          (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)::INTEGER
        )
      END AS name
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id
  ) t;

  RETURN p_payload || jsonb_build_object('names', v_names);
END;
$$;

-- Creator: real names unless they have privacy on, in which case even their own
-- report shows pseudonyms in the SHAREABLE view. The creator's own view passes
-- reveal=true, which is the one screen allowed to show them.
CREATE OR REPLACE FUNCTION public.get_live_exam_report(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'REPORT_NOT_CREATOR';
  END IF;

  SELECT payload INTO v_payload
  FROM public.live_exam_reports WHERE live_exam_id = p_live_exam_id;

  IF v_payload IS NULL THEN
    -- Not yet computed (an old session, or End was pressed before this shipped).
    -- Build it on demand rather than showing the creator an empty page.
    v_payload := public.build_live_exam_report(p_live_exam_id);
    IF v_payload IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.live_exam_reports (live_exam_id, payload)
    VALUES (p_live_exam_id, v_payload)
    ON CONFLICT (live_exam_id) DO UPDATE SET payload = EXCLUDED.payload, computed_at = now();
  END IF;

  RETURN public.live_report_with_names(p_live_exam_id, v_payload, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report(UUID) TO authenticated;

-- Public link. No auth, a long random token, and it must be switched on.
-- Always masked per privacy_mode, because "shareable" means it can end up in a
-- staff group chat and from there anywhere.
CREATE OR REPLACE FUNCTION public.get_live_exam_report_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam    public.live_exams;
  v_payload JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE report_share_token = p_token AND report_public = true;

  IF v_exam.id IS NULL THEN
    RETURN NULL; -- unknown token, or sharing switched off again
  END IF;

  SELECT payload INTO v_payload
  FROM public.live_exam_reports WHERE live_exam_id = v_exam.id;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  -- Real names only when privacy mode is OFF. The setting is read now, not at
  -- compute time, so turning it on retroactively masks an already-shared link.
  RETURN public.live_report_with_names(v_exam.id, v_payload, NOT v_exam.privacy_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report_by_token(TEXT) TO authenticated, anon;


-- ============================================================
-- 4. enable_live_report_sharing — mint the token on demand
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_live_report_sharing(
  p_live_exam_id UUID,
  p_enabled BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT report_share_token INTO v_token
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_CREATOR';
  END IF;

  -- Minted once and kept, so turning sharing off and on again does not silently
  -- break a link the creator already sent.
  IF p_enabled AND v_token IS NULL THEN
    v_token := encode(gen_random_bytes(18), 'hex');
  END IF;

  UPDATE public.live_exams
  SET report_public = p_enabled,
      report_share_token = v_token
  WHERE id = p_live_exam_id;

  RETURN CASE WHEN p_enabled THEN v_token ELSE NULL END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_live_report_sharing(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 5. Build the report when the session ends
--
--    Appended to end_live_session so the creator lands on a finished page rather
--    than a spinner. Non-fatal for the same reason moments are: a report is
--    valuable, and it is not worth failing the end of a session over.
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
    SELECT t.id
    FROM (
      SELECT lq.id,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_result.primary_language
    ) t
    WHERE t.ordinal <= v_result.current_question_index
      AND NOT EXISTS (
        SELECT 1 FROM public.live_question_analytics a
        WHERE a.live_exam_id = p_live_exam_id AND a.live_question_id = t.id
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
