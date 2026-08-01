-- ============================================================
-- LIVE EXAM v2 — PHASE 1: PRIVACY MODE (E1) + LEADERBOARD VISIBILITY (E3)
--
-- STEP 1 OF 2. This migration is deliberately ADDITIVE ONLY: it creates the
-- masked view and leaves the existing student policy on live_participants in
-- place, so a browser running the PREVIOUS client keeps working. Deploy the
-- code, then run 20260803010000_live_v2_privacy_step3.sql to close the old
-- door. Collapsing the two would blank the leaderboard of every student tab
-- that happened to be open at deploy time.
--
-- Why this cannot be done in the UI
-- ---------------------------------
-- Two separate leaks made client-side masking cosmetic:
--
--  1. live_participants.display_name is readable by any authenticated user for
--     any live/ended exam ("Participants can view leaderboard"). Hiding a name
--     in React leaves it one devtools request away.
--
--  2. live_question_analytics.fastest_user_name is a DENORMALISED name, and
--     that table is in the realtime publication. Realtime delivers whole rows;
--     a subscription cannot project columns. So no view, policy or client code
--     can stop that column reaching every student — the only fix is for the
--     stored value itself to be safe. compute_live_question_analytics now
--     writes the display-safe name, and the creator recovers the real one from
--     fastest_user_id against the base table they alone can read.
--
-- Pseudonyms are Google-Docs style: "Brave Badger", stable for the whole
-- session, derived from join order rather than a hash. Hashing user_id into a
-- 2304-name space would collide constantly at class sizes over ~60 (birthday
-- problem); join order is collision-free by construction and joined_at is
-- already immutable, protected by protect_live_participant_scores.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Deterministic pseudonyms
--
--    48 adjectives x 48 animals = 2304 distinct names, so every participant in
--    any realistic class gets a unique one with no suffix. Ordinals beyond that
--    wrap, which is the right failure: a duplicate animal in a 2304-person
--    session is cosmetic, whereas a suffix on every name would not be.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_anon_name(p_ordinal INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT adjectives[(GREATEST(COALESCE(p_ordinal, 0), 0) / 48) % 48 + 1]
         || ' ' ||
         animals[GREATEST(COALESCE(p_ordinal, 0), 0) % 48 + 1]
  FROM (
    SELECT
      ARRAY[
        'Anonymous','Bold','Brave','Bright','Calm','Cheerful','Clever','Curious',
        'Daring','Eager','Fearless','Gentle','Graceful','Happy','Honest','Jolly',
        'Keen','Kind','Lively','Loyal','Merry','Mighty','Nimble','Noble',
        'Patient','Playful','Plucky','Polite','Proud','Quick','Quiet','Ready',
        'Regal','Sharp','Silent','Sleek','Smart','Snappy','Steady','Sunny',
        'Swift','Tidy','Upbeat','Valiant','Vivid','Warm','Wise','Witty'
      ] AS adjectives,
      ARRAY[
        'Aardvark','Badger','Beaver','Bison','Cheetah','Cobra','Condor','Coyote',
        'Crane','Dingo','Dolphin','Eagle','Falcon','Ferret','Finch','Gecko',
        'Gibbon','Giraffe','Gopher','Heron','Ibex','Impala','Jackal','Jaguar',
        'Kestrel','Koala','Lemur','Leopard','Lynx','Macaw','Magpie','Marmot',
        'Meerkat','Mongoose','Narwhal','Ocelot','Osprey','Otter','Panda',
        'Pelican','Puffin','Quail','Raccoon','Raven','Salmon','Tapir','Toucan',
        'Walrus'
      ] AS animals
  ) lists;
$$;

GRANT EXECUTE ON FUNCTION public.live_anon_name(INTEGER) TO authenticated, anon;


-- ============================================================
-- 2. live_participants_public — the only participant list students may read
--
--    Runs with the view owner's rights (no security_invoker), which is the
--    point: it exposes a masked column set and a row filter that base-table RLS
--    cannot express. Every access rule therefore has to live in here.
--
--    Masking applies to EVERY caller, creators included. The present screen
--    (A2) is authenticated as the creator and is pointed at a projector, so a
--    creator exemption here would put real names on the wall — the precise
--    thing privacy mode exists to prevent. Creators read real names from the
--    base table instead, which only they can select.
-- ============================================================
CREATE OR REPLACE VIEW public.live_participants_public AS
WITH ranked AS (
  SELECT
    lp.id,
    lp.live_exam_id,
    lp.user_id,
    lp.display_name,
    lp.joined_at,
    lp.is_active,
    lp.total_correct,
    lp.total_answered,
    lp.total_time_ms,
    lp.rank,
    -- Join order, 0-based. Stable for the session because joined_at is
    -- immutable, so a student's pseudonym never changes mid-exam.
    (ROW_NUMBER() OVER (
       PARTITION BY lp.live_exam_id
       ORDER BY lp.joined_at, lp.id
     ) - 1)::INTEGER AS anon_ordinal
  FROM public.live_participants lp
)
SELECT
  r.id,
  r.live_exam_id,
  r.user_id,
  CASE
    WHEN le.privacy_mode THEN public.live_anon_name(r.anon_ordinal)
    ELSE r.display_name
  END AS display_name,
  r.joined_at,
  r.is_active,
  r.total_correct,
  r.total_answered,
  r.total_time_ms,
  r.rank
FROM ranked r
JOIN public.live_exams le ON le.id = r.live_exam_id
WHERE le.status IN ('live', 'ended')
  AND (
    -- E3. 'full' shows the room to the room. 'private' and 'off' collapse it to
    -- your own row: scores are still computed and the creator still sees
    -- everything, but no student learns anyone else's standing.
    le.leaderboard_visibility = 'full'
    OR r.user_id = auth.uid()
  );

GRANT SELECT ON public.live_participants_public TO authenticated, anon;


-- ============================================================
-- 3. compute_live_question_analytics — store a display-SAFE fastest name
--
--    Only the stored value can be made safe (see the header note on realtime
--    delivering whole rows). fastest_user_id keeps the real identity, so the
--    creator's control room can resolve the true name against live_participants.
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
  -- B6
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

  -- The name written here is read by students through realtime, so under
  -- privacy mode it must already be the pseudonym. Same join-order ordinal the
  -- public view uses, so the two always agree.
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

  -- ─── B6: time profile ───────────────────────────────────────

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

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;


-- ============================================================
-- 4. Re-mask names already stored under privacy mode
--
--    A session that ran before this migration has real names sitting in
--    fastest_user_name. Turning privacy mode on afterwards would not retro-mask
--    them, and those rows are readable by students.
-- ============================================================
UPDATE public.live_question_analytics a
SET fastest_user_name = public.live_anon_name(t.ord)
FROM (
  SELECT lp.live_exam_id, lp.user_id,
         (ROW_NUMBER() OVER (PARTITION BY lp.live_exam_id ORDER BY lp.joined_at, lp.id) - 1)::INTEGER AS ord
  FROM public.live_participants lp
) t
JOIN public.live_exams le ON le.id = t.live_exam_id
WHERE a.live_exam_id = t.live_exam_id
  AND a.fastest_user_id = t.user_id
  AND le.privacy_mode = true;
