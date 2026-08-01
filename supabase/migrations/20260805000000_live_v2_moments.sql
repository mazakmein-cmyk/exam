-- ============================================================
-- LIVE EXAM v2 — PHASE 4: B14, MOMENTS AND CELEBRATION
--
-- The problem: the leaderboard rewards about three students and ignores thirty.
-- "Fastest correct answer" can only ever be won by one person per question, and
-- in practice it is the same confident student every time. Everyone else gets
-- nothing all session.
--
-- Moments find the other stories. A comeback — four wrong, then three right — is
-- invisible on a leaderboard and is the single most worth saying out loud,
-- because it tells the room that getting better counts.
--
-- Why this is computed in SQL
-- ---------------------------
-- Streaks and comebacks need one student's whole answer history in play order. At
-- a thousand students over twenty questions that is twenty thousand rows, and
-- none of it belongs in a browser. The index added in Phase 0
-- (live_exam_id, user_id, question_ordinal) exists for exactly this query.
--
-- Names are NOT stored
-- --------------------
-- Only user_id. A snapshotted name would fight privacy mode, which can be toggled
-- at any time — the same trap that produced the fastest_user_name leak in Phase 1.
-- get_live_moments resolves the display name at READ time, masked, and the
-- creator's own screen recovers the real one from the id.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. live_moments
--
--    One moment of each kind per question, so re-running the analytics compute
--    updates rather than duplicates. Not in the realtime publication: the creator
--    fetches these with the analytics they are already waiting for.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_moments (
  live_exam_id     UUID        NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  question_ordinal INTEGER     NOT NULL,
  kind             TEXT        NOT NULL,
  /** NULL for class-wide moments. */
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  /** Streak length, comeback size, run length — whatever the kind counts. */
  value            INTEGER     NOT NULL DEFAULT 0,
  /** Lower sorts first. Baked in so the client never has to know the ranking. */
  priority         INTEGER     NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_exam_id, question_ordinal, kind)
);

CREATE INDEX IF NOT EXISTS idx_live_moments_exam
  ON public.live_moments(live_exam_id, question_ordinal);

ALTER TABLE public.live_moments ENABLE ROW LEVEL SECURITY;

-- Reads go through get_live_moments, which masks names. No direct policy for
-- students: the raw table carries user_ids, and Phase 1 established that a user_id
-- is a join key back to a real identity.
DROP POLICY IF EXISTS "Creator can read moments for own exams" ON public.live_moments;
CREATE POLICY "Creator can read moments for own exams"
  ON public.live_moments FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));


-- ============================================================
-- 2. compute_live_moments — find the stories in one question
--
--    Called at the end of the per-question analytics compute, so it runs exactly
--    when the numbers settle and also during end_live_session's backfill.
--
--    Kinds, in display priority. The ordering is the product decision: a comeback
--    is the most worth saying, and a streak is the least surprising.
--
--      10 comeback           >=2 wrong then >=2 right, ending here
--      20 lone_correct       exactly one student got it
--      30 streak             >=3 consecutive correct, ending here
--      40 perfect_run        still unbeaten at question 5 or later
--      50 class_first_perfect  first question nobody got wrong
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_moments(
  p_live_exam_id UUID,
  p_ordinal INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_value         INTEGER;
  v_correct_count INTEGER;
  v_total         INTEGER;
BEGIN
  IF p_ordinal IS NULL OR p_ordinal < 0 THEN
    RETURN;
  END IF;

  -- Per-student history up to and including this question, in play order.
  CREATE TEMP TABLE IF NOT EXISTS _moment_hist (
    user_id UUID,
    question_ordinal INTEGER,
    is_correct BOOLEAN
  ) ON COMMIT DROP;
  DELETE FROM _moment_hist;

  INSERT INTO _moment_hist (user_id, question_ordinal, is_correct)
  SELECT lr.user_id, lr.question_ordinal, COALESCE(lr.is_correct, false)
  FROM public.live_responses lr
  WHERE lr.live_exam_id = p_live_exam_id
    AND lr.question_ordinal <= p_ordinal;

  SELECT COUNT(*) FILTER (WHERE is_correct), COUNT(*)
  INTO v_correct_count, v_total
  FROM _moment_hist WHERE question_ordinal = p_ordinal;

  -- ─── comeback ─────────────────────────────────────────────
  -- The one that matters. Trailing run of correct answers >= 2, immediately
  -- preceded by a run of wrong answers >= 2. Says "you were struggling and you
  -- turned it around", which no leaderboard can.
  SELECT h.user_id, h.right_run
  INTO v_uid, v_value
  FROM (
    SELECT
      t.user_id,
      COUNT(*) FILTER (WHERE t.is_correct AND t.grp = t.last_grp) AS right_run,
      (SELECT COUNT(*) FROM _moment_hist w
       WHERE w.user_id = t.user_id AND NOT w.is_correct
         AND w.question_ordinal < t.first_right) AS wrong_before
    FROM (
      SELECT
        m.user_id,
        m.is_correct,
        m.question_ordinal,
        -- Group consecutive same-result answers.
        m.question_ordinal - ROW_NUMBER() OVER (
          PARTITION BY m.user_id, m.is_correct ORDER BY m.question_ordinal
        ) AS grp,
        MAX(m.question_ordinal - ROW_NUMBER() OVER (
          PARTITION BY m.user_id, m.is_correct ORDER BY m.question_ordinal
        )) FILTER (WHERE m.is_correct) OVER (PARTITION BY m.user_id) AS last_grp,
        MIN(m.question_ordinal) FILTER (WHERE m.is_correct) OVER (PARTITION BY m.user_id) AS first_right
      FROM _moment_hist m
    ) t
    WHERE t.is_correct
    GROUP BY t.user_id, t.first_right
  ) h
  JOIN _moment_hist latest
    ON latest.user_id = h.user_id AND latest.question_ordinal = p_ordinal AND latest.is_correct
  WHERE h.right_run >= 2 AND h.wrong_before >= 2
  ORDER BY h.right_run DESC, h.wrong_before DESC
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.live_moments (live_exam_id, question_ordinal, kind, user_id, value, priority)
    VALUES (p_live_exam_id, p_ordinal, 'comeback', v_uid, v_value, 10)
    ON CONFLICT (live_exam_id, question_ordinal, kind)
      DO UPDATE SET user_id = EXCLUDED.user_id, value = EXCLUDED.value, created_at = now();
  END IF;

  -- ─── lone_correct ─────────────────────────────────────────
  IF v_correct_count = 1 AND v_total >= 5 THEN
    SELECT user_id INTO v_uid
    FROM _moment_hist WHERE question_ordinal = p_ordinal AND is_correct LIMIT 1;

    INSERT INTO public.live_moments (live_exam_id, question_ordinal, kind, user_id, value, priority)
    VALUES (p_live_exam_id, p_ordinal, 'lone_correct', v_uid, v_total, 20)
    ON CONFLICT (live_exam_id, question_ordinal, kind)
      DO UPDATE SET user_id = EXCLUDED.user_id, value = EXCLUDED.value, created_at = now();
  END IF;

  -- ─── streak ───────────────────────────────────────────────
  v_uid := NULL;
  SELECT s.user_id, s.run INTO v_uid, v_value
  FROM (
    SELECT
      m.user_id,
      COUNT(*) AS run
    FROM _moment_hist m
    WHERE m.is_correct
      AND NOT EXISTS (
        SELECT 1 FROM _moment_hist g
        WHERE g.user_id = m.user_id
          AND NOT g.is_correct
          AND g.question_ordinal > m.question_ordinal
      )
    GROUP BY m.user_id
  ) s
  JOIN _moment_hist latest
    ON latest.user_id = s.user_id AND latest.question_ordinal = p_ordinal AND latest.is_correct
  WHERE s.run >= 3
  ORDER BY s.run DESC
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.live_moments (live_exam_id, question_ordinal, kind, user_id, value, priority)
    VALUES (p_live_exam_id, p_ordinal, 'streak', v_uid, v_value, 30)
    ON CONFLICT (live_exam_id, question_ordinal, kind)
      DO UPDATE SET user_id = EXCLUDED.user_id, value = EXCLUDED.value, created_at = now();
  END IF;

  -- ─── perfect_run ──────────────────────────────────────────
  -- Answered every question so far and never wrong. Only from question 5, or it
  -- is not yet an achievement.
  IF p_ordinal >= 4 THEN
    v_uid := NULL;
    SELECT m.user_id INTO v_uid
    FROM _moment_hist m
    GROUP BY m.user_id
    HAVING COUNT(*) = p_ordinal + 1
       AND COUNT(*) FILTER (WHERE m.is_correct) = p_ordinal + 1
    ORDER BY m.user_id
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
      INSERT INTO public.live_moments (live_exam_id, question_ordinal, kind, user_id, value, priority)
      VALUES (p_live_exam_id, p_ordinal, 'perfect_run', v_uid, p_ordinal + 1, 40)
      ON CONFLICT (live_exam_id, question_ordinal, kind)
        DO UPDATE SET user_id = EXCLUDED.user_id, value = EXCLUDED.value, created_at = now();
    END IF;
  END IF;

  -- ─── class_first_perfect ──────────────────────────────────
  -- A whole-class moment, with no user attached: the first question everybody who
  -- answered got right.
  IF v_total >= 5 AND v_correct_count = v_total THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.live_moments
      WHERE live_exam_id = p_live_exam_id AND kind = 'class_first_perfect'
        AND question_ordinal < p_ordinal
    ) THEN
      INSERT INTO public.live_moments (live_exam_id, question_ordinal, kind, user_id, value, priority)
      VALUES (p_live_exam_id, p_ordinal, 'class_first_perfect', NULL, v_total, 50)
      ON CONFLICT (live_exam_id, question_ordinal, kind)
        DO UPDATE SET value = EXCLUDED.value, created_at = now();
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_moments(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 3. get_live_moments — read with the name resolved and MASKED
--
--    Same rule as fastest_user_name: the value that leaves the database is the
--    display-safe one. The creator's control room turns the id back into a real
--    name locally, which is the only screen allowed to show it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_live_moments(p_live_exam_id UUID)
RETURNS TABLE (
  question_ordinal INTEGER,
  kind TEXT,
  user_id UUID,
  display_name TEXT,
  value INTEGER,
  priority INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status NOT IN ('live', 'ended') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lm.question_ordinal,
    lm.kind,
    -- The id is withheld from everyone but the creator, for the same reason the
    -- masked participant view withholds it: it maps back to a real person.
    CASE WHEN v_exam.user_id = auth.uid() THEN lm.user_id ELSE NULL END,
    CASE
      WHEN lm.user_id IS NULL THEN NULL
      WHEN v_exam.privacy_mode THEN public.live_anon_name(ord.anon_ordinal)
      ELSE lp.display_name
    END,
    lm.value,
    lm.priority
  FROM public.live_moments lm
  LEFT JOIN public.live_participants lp
    ON lp.live_exam_id = lm.live_exam_id AND lp.user_id = lm.user_id
  LEFT JOIN LATERAL (
    SELECT (ROW_NUMBER() OVER (ORDER BY p.joined_at, p.id) - 1)::INTEGER AS anon_ordinal
    FROM public.live_participants p
    WHERE p.live_exam_id = lm.live_exam_id
      AND p.user_id = lm.user_id
  ) ord ON TRUE
  WHERE lm.live_exam_id = p_live_exam_id
  ORDER BY lm.question_ordinal, lm.priority;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_moments(UUID) TO authenticated;


-- ============================================================
-- 4. celebrate_live_exam — the loud layer
--
--    A monotonic counter rather than a broadcast event, so a client that
--    reconnects can tell "I already fired for seq 3" from "seq 4 is new". One row
--    update reaches every student through the exam-row subscription they already
--    hold, which is why this is affordable at all: a deliberate, rare action
--    costing one message per student.
-- ============================================================
CREATE OR REPLACE FUNCTION public.celebrate_live_exam(p_live_exam_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  UPDATE public.live_exams
  SET celebrate_seq = celebrate_seq + 1
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'live'
  RETURNING celebrate_seq INTO v_seq;

  IF v_seq IS NULL THEN
    RAISE EXCEPTION 'CELEBRATE_NOT_ALLOWED';
  END IF;
  RETURN v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.celebrate_live_exam(UUID) TO authenticated;


-- ============================================================
-- 5. Hook moments into the analytics compute
--
--    Appended to the existing function rather than called separately, so moments
--    can never drift out of step with the analytics they are derived from — and
--    so end_live_session's backfill produces them too.
--
--    Everything above §5 in the Phase 1 and Phase 2 definitions is preserved
--    verbatim; only the final PERFORM is new.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_question_analytics(
  p_live_exam_id UUID,
  p_live_question_id UUID
)
RETURNS public.live_question_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.live_question_analytics;
  v_total_participants INTEGER;
  v_total_responses    INTEGER;
  v_correct_count      INTEGER;
  v_wrong_count        INTEGER;
  v_skipped_count      INTEGER;
  v_option_dist        JSONB;
  v_avg_time_correct   INTEGER;
  v_fastest_time       INTEGER;
  v_fastest_uid        UUID;
  v_fastest_name       TEXT;
  v_privacy            BOOLEAN := false;
  v_fastest_ordinal    INTEGER;
  v_ordinal            INTEGER;
  v_time_seconds       INTEGER;
  v_extra_seconds      INTEGER := 0;
  v_window_ms          INTEGER;
  v_median_ms          INTEGER;
  v_threshold_ms       INTEGER;
  v_fast_correct       INTEGER := 0;
  v_slow_correct       INTEGER := 0;
  v_fast_wrong         INTEGER := 0;
  v_slow_wrong         INTEGER := 0;
  v_impulsive_wrong    INTEGER := 0;
  v_histogram          JSONB;
  v_confusion          INTEGER := 0;
BEGIN
  SELECT privacy_mode INTO v_privacy
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();

  IF v_privacy IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  SELECT COUNT(*) INTO v_total_participants
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*) FILTER (WHERE is_correct = false)
  INTO v_total_responses, v_correct_count, v_wrong_count
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id;

  v_skipped_count := GREATEST(v_total_participants - v_total_responses, 0);

  SELECT COALESCE(jsonb_object_agg(opt, cnt), '{}')
  INTO v_option_dist
  FROM (
    SELECT selected_answer::text AS opt, COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id
      AND live_question_id = p_live_question_id
      AND selected_answer IS NOT NULL
    GROUP BY selected_answer::text
  ) sub;

  SELECT AVG(time_taken_ms)::integer
  INTO v_avg_time_correct
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true;

  SELECT time_taken_ms, user_id
  INTO v_fastest_time, v_fastest_uid
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true
  ORDER BY time_taken_ms ASC
  LIMIT 1;

  IF v_fastest_uid IS NOT NULL THEN
    IF v_privacy THEN
      SELECT t.ord INTO v_fastest_ordinal
      FROM (
        SELECT lp.user_id,
               (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)::INTEGER AS ord
        FROM public.live_participants lp
        WHERE lp.live_exam_id = p_live_exam_id
      ) t
      WHERE t.user_id = v_fastest_uid;
      v_fastest_name := public.live_anon_name(COALESCE(v_fastest_ordinal, 0));
    ELSE
      SELECT display_name INTO v_fastest_name
      FROM public.live_participants
      WHERE live_exam_id = p_live_exam_id AND user_id = v_fastest_uid;
    END IF;
  END IF;

  SELECT lq.time_seconds INTO v_time_seconds
  FROM public.live_questions lq WHERE lq.id = p_live_question_id;
  v_time_seconds := COALESCE(v_time_seconds, 0);

  SELECT lr.question_ordinal INTO v_ordinal
  FROM public.live_responses lr
  WHERE lr.live_exam_id = p_live_exam_id AND lr.live_question_id = p_live_question_id
  LIMIT 1;

  IF v_ordinal IS NOT NULL THEN
    SELECT COALESCE(ul.extra_seconds, 0) INTO v_extra_seconds
    FROM public.live_unlock_log ul
    WHERE ul.live_exam_id = p_live_exam_id AND ul.question_ordinal = v_ordinal;
  END IF;
  v_extra_seconds := COALESCE(v_extra_seconds, 0);
  v_window_ms := GREATEST((v_time_seconds + v_extra_seconds) * 1000, 1);

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY time_taken_ms)::integer
  INTO v_median_ms
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  v_threshold_ms := CASE
    WHEN v_total_responses >= 8 AND v_median_ms IS NOT NULL THEN v_median_ms
    ELSE (v_window_ms * 0.35)::integer
  END;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = true  AND time_taken_ms <= v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = true  AND time_taken_ms >  v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms <= v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms >  v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms <  (v_window_ms * 0.2))
  INTO v_fast_correct, v_slow_correct, v_fast_wrong, v_slow_wrong, v_impulsive_wrong
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  SELECT COALESCE(jsonb_agg(COALESCE(b.cnt, 0) ORDER BY g.bucket), '[]')
  INTO v_histogram
  FROM generate_series(1, 12) AS g(bucket)
  LEFT JOIN (
    SELECT
      LEAST(width_bucket(time_taken_ms, 0, v_window_ms, 12), 12) AS bucket,
      COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id
    GROUP BY 1
  ) b ON b.bucket = g.bucket;

  SELECT COUNT(*) INTO v_confusion
  FROM public.live_confusion_signals
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  INSERT INTO public.live_question_analytics (
    live_exam_id, live_question_id, total_responses, correct_count,
    wrong_count, skipped_count, option_distribution, avg_time_correct_ms,
    fastest_time_ms, fastest_user_id, fastest_user_name, computed_at,
    median_time_ms, fast_correct, slow_correct, fast_wrong, slow_wrong,
    impulsive_wrong, time_histogram, confusion_count
  ) VALUES (
    p_live_exam_id, p_live_question_id, v_total_responses, v_correct_count,
    v_wrong_count, v_skipped_count, v_option_dist, v_avg_time_correct,
    v_fastest_time, v_fastest_uid, v_fastest_name, now(),
    v_median_ms, v_fast_correct, v_slow_correct, v_fast_wrong, v_slow_wrong,
    v_impulsive_wrong, v_histogram, v_confusion
  )
  ON CONFLICT (live_exam_id, live_question_id) DO UPDATE SET
    total_responses     = EXCLUDED.total_responses,
    correct_count       = EXCLUDED.correct_count,
    wrong_count         = EXCLUDED.wrong_count,
    skipped_count       = EXCLUDED.skipped_count,
    option_distribution = EXCLUDED.option_distribution,
    avg_time_correct_ms = EXCLUDED.avg_time_correct_ms,
    fastest_time_ms     = EXCLUDED.fastest_time_ms,
    fastest_user_id     = EXCLUDED.fastest_user_id,
    fastest_user_name   = EXCLUDED.fastest_user_name,
    median_time_ms      = EXCLUDED.median_time_ms,
    fast_correct        = EXCLUDED.fast_correct,
    slow_correct        = EXCLUDED.slow_correct,
    fast_wrong          = EXCLUDED.fast_wrong,
    slow_wrong          = EXCLUDED.slow_wrong,
    impulsive_wrong     = EXCLUDED.impulsive_wrong,
    time_histogram      = EXCLUDED.time_histogram,
    confusion_count     = EXCLUDED.confusion_count,
    computed_at         = now()
  RETURNING * INTO result;

  -- B14. Last, and deliberately non-fatal: a moment is a nice-to-have, and a bug
  -- in a window function must never cost the class its analytics or its rankings.
  IF v_ordinal IS NOT NULL THEN
    BEGIN
      PERFORM public.compute_live_moments(p_live_exam_id, v_ordinal);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'compute_live_moments failed for exam % ordinal %: %',
        p_live_exam_id, v_ordinal, SQLERRM;
    END;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;
