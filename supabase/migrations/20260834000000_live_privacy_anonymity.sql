-- ============================================================
-- PRIVACY MODE ACTUALLY ANONYMISES (issue 7, all three leaks)
--
-- Privacy mode replaced names with pseudonyms on screen while the data kept
-- carrying real identities three ways:
--
--   LEAK 1 — live_question_analytics stored fastest_user_id (a real auth UUID)
--   beside the masked pseudonym, the row is in the realtime publication
--   (realtime delivers WHOLE rows, no column filtering exists), and its SELECT
--   policy admitted ANY authenticated user, participant or not. One request +
--   public_profiles resolved the UUID to a handle, and the same UUID linked a
--   person across sessions.
--
--   LEAK 2 — the shared report token returned the stored payload plus a
--   {real user_id -> name} map. Even with names masked, the KEYS were real
--   account UUIDs, on an endpoint granted to anon.
--
--   LEAK 3 — pseudonyms are assigned by join order and live_participants_public
--   published joined_at unmasked, so sorting by join time decoded every
--   pseudonym without touching a real id.
--
-- The fixes, in the same order:
--
--   1. The analytics row now stores fastest_participant_id — the participant
--      ROW id, which joins to nothing a student can read — and fastest_user_id
--      is nulled, on write and retroactively. The creator's deck resolves the
--      real name from the participant id (it already reads live_participants).
--      The SELECT policy narrows to the room: creator or participant.
--
--   2. The token read path masks ids the way it already masked names: every
--      user_id in attendance/moments and every key in the names map becomes an
--      opaque per-exam 'p<ordinal>'. The client joins on the key, so it renders
--      identically; there is simply no real id left to resolve. The creator's
--      own path (get_live_exam_report) is untouched — their screen is the one
--      allowed to know.
--
--   3. live_participants_public masks joined_at exactly like it masks user_id:
--      your own row keeps it, everyone else's is NULL while privacy mode is on.
--      Join order can no longer be reconstructed from published data. (Ordinals
--      deliberately STAY join-ordered: they are append-only, so pseudonyms
--      never change mid-session — a hash order would reshuffle names every time
--      someone joined.)
--
-- Requires (apply first): 20260803030000 (live_anon_name, the public view),
-- 20260805000000 (compute_live_question_analytics), 20260807000000 (report).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'live_anon_name') THEN
    RAISE EXCEPTION 'apply 20260803030000_live_v2_privacy_hardening.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'compute_live_question_analytics') THEN
    RAISE EXCEPTION 'apply 20260805000000_live_v2_moments.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'get_live_exam_report_by_token') THEN
    RAISE EXCEPTION 'apply 20260807000000_live_v2_report.sql first';
  END IF;
END $$;


-- ============================================================
-- 1a. The de-identified fastest reference
-- ============================================================
ALTER TABLE public.live_question_analytics
  ADD COLUMN IF NOT EXISTS fastest_participant_id UUID
  REFERENCES public.live_participants(id) ON DELETE SET NULL;

-- ============================================================
-- 1b. compute_live_question_analytics — stop writing the real id
--
--     Verbatim copy of the 20260805 definition except: the fastest response now
--     also resolves its participant ROW id, the upsert writes that and NULLs
--     fastest_user_id. The column itself stays (clients and generated types
--     reference it); it just never carries an identity again.
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
  v_fastest_pid        UUID;
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
    -- The participant ROW id is what the row carries from now on. It joins to
    -- nothing a student can read (live_participants has no student policy),
    -- while the creator's deck already holds a participant map to resolve it.
    SELECT lp.id INTO v_fastest_pid
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id AND lp.user_id = v_fastest_uid;

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
    fastest_time_ms, fastest_user_id, fastest_participant_id, fastest_user_name,
    computed_at,
    median_time_ms, fast_correct, slow_correct, fast_wrong, slow_wrong,
    impulsive_wrong, time_histogram, confusion_count
  ) VALUES (
    p_live_exam_id, p_live_question_id, v_total_responses, v_correct_count,
    v_wrong_count, v_skipped_count, v_option_dist, v_avg_time_correct,
    -- fastest_user_id is written NULL forever: this row is broadcast whole to
    -- every student over realtime, and a real auth UUID beside a pseudonym is
    -- the leak privacy mode existed to prevent.
    v_fastest_time, NULL, v_fastest_pid, v_fastest_name,
    now(),
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
    fastest_user_id     = NULL,
    fastest_participant_id = EXCLUDED.fastest_participant_id,
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

-- ── Retroactive scrub: history must not keep leaking either ─────────────────
UPDATE public.live_question_analytics a
SET fastest_participant_id = lp.id
FROM public.live_participants lp
WHERE a.fastest_user_id IS NOT NULL
  AND a.fastest_participant_id IS NULL
  AND lp.live_exam_id = a.live_exam_id
  AND lp.user_id = a.fastest_user_id;

UPDATE public.live_question_analytics
SET fastest_user_id = NULL
WHERE fastest_user_id IS NOT NULL;

-- ── 1c. The room's analytics are the room's ─────────────────────────────────
-- "Anyone can view" meant any signed-in account on the platform. Realtime
-- respects RLS, so students in the room keep their live updates; everyone else
-- now gets nothing.
DROP POLICY IF EXISTS "Anyone can view analytics of live exams" ON public.live_question_analytics;
DROP POLICY IF EXISTS "Room members can view analytics of live exams" ON public.live_question_analytics;
CREATE POLICY "Room members can view analytics of live exams"
  ON public.live_question_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_exams le
      WHERE le.id = live_question_analytics.live_exam_id
        AND le.status IN ('live', 'ended')
        AND (
          le.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.live_participants lp
            WHERE lp.live_exam_id = le.id AND lp.user_id = auth.uid()
          )
        )
    )
  );


-- ============================================================
-- 2. The shared report stops shipping real ids
--
--    Same masking contract live_report_with_names already applies to NAMES,
--    extended to the IDS: every user_id in attendance and moments, and every
--    key of the names map, becomes 'p<ordinal>'. The client joins name to row
--    by key, so it renders identically — there is just nothing left to
--    resolve. joined_at is stripped from attendance while privacy mode is on
--    (leak 3's report-side half).
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_report_masked_ids(
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
  v_keys    JSONB; -- real user_id -> 'p<ordinal>'
  v_names   JSONB; -- 'p<ordinal>' -> display name (masked per privacy)
  v_attend  JSONB;
  v_moments JSONB;
BEGIN
  SELECT
    COALESCE(jsonb_object_agg(t.uid, t.key), '{}'),
    COALESCE(jsonb_object_agg(t.key, t.name), '{}')
  INTO v_keys, v_names
  FROM (
    SELECT
      lp.user_id::text AS uid,
      'p' || ((ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id)) - 1)::text AS key,
      CASE
        WHEN p_reveal_real_names THEN lp.display_name
        ELSE public.live_anon_name(
          ((ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id)) - 1)::INTEGER
        )
      END AS name
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id
  ) t;

  SELECT COALESCE(jsonb_agg(
    (CASE WHEN p_reveal_real_names THEN t.e ELSE t.e - 'joined_at' END)
      - 'user_id'
      || jsonb_build_object('user_id', v_keys -> (t.e ->> 'user_id'))
    ORDER BY t.ord
  ), '[]')
  INTO v_attend
  FROM jsonb_array_elements(COALESCE(p_payload -> 'attendance', '[]'::jsonb))
       WITH ORDINALITY AS t(e, ord);

  SELECT COALESCE(jsonb_agg(
    t.e - 'user_id'
      || jsonb_build_object('user_id',
           CASE WHEN t.e ->> 'user_id' IS NULL THEN NULL
                ELSE v_keys -> (t.e ->> 'user_id') END)
    ORDER BY t.ord
  ), '[]')
  INTO v_moments
  FROM jsonb_array_elements(COALESCE(p_payload -> 'moments', '[]'::jsonb))
       WITH ORDINALITY AS t(e, ord);

  RETURN (p_payload - 'attendance' - 'moments')
    || jsonb_build_object(
         'attendance', v_attend,
         'moments',    v_moments,
         'names',      v_names
       );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.live_report_masked_ids(UUID, JSONB, BOOLEAN) FROM PUBLIC;

-- Token path only. The creator's own path (get_live_exam_report) keeps real
-- ids: the control room is the one screen allowed to know, and it is gated on
-- ownership.
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

  -- Names follow the privacy setting as before; ids are ALWAYS masked on this
  -- path — a shareable link has no business carrying account UUIDs even when
  -- names are on display.
  RETURN public.live_report_masked_ids(v_exam.id, v_payload, NOT v_exam.privacy_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report_by_token(TEXT) TO authenticated, anon;


-- ============================================================
-- 3. joined_at is masked like user_id
--
--    Pseudonyms are assigned by join order (append-only on purpose — they must
--    never change mid-session), so publishing everyone's join time was a
--    decoder ring. Same rule as user_id: you keep your own, privacy mode hides
--    everyone else's. The ordinal itself still ranks on the raw column inside
--    the CTE, so masking changes nothing about which pseudonym anyone gets.
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
    (ROW_NUMBER() OVER (
       PARTITION BY lp.live_exam_id
       ORDER BY lp.joined_at, lp.id
     ) - 1)::INTEGER AS anon_ordinal
  FROM public.live_participants lp
)
SELECT
  r.id,
  r.live_exam_id,
  -- The caller always sees their own id; under privacy mode nobody else's.
  CASE
    WHEN NOT le.privacy_mode THEN r.user_id
    WHEN r.user_id = auth.uid() THEN r.user_id
    ELSE NULL
  END AS user_id,
  CASE
    WHEN le.privacy_mode THEN public.live_anon_name(r.anon_ordinal)
    ELSE r.display_name
  END AS display_name,
  -- Pseudonyms are a function of join order, so join time is the decoder.
  CASE
    WHEN NOT le.privacy_mode THEN r.joined_at
    WHEN r.user_id = auth.uid() THEN r.joined_at
    ELSE NULL
  END AS joined_at,
  r.is_active,
  r.total_correct,
  r.total_answered,
  r.total_time_ms,
  r.rank
FROM ranked r
JOIN public.live_exams le ON le.id = r.live_exam_id
WHERE le.status IN ('live', 'ended')
  AND (
    le.leaderboard_visibility = 'full'
    OR r.user_id = auth.uid()
  );

REVOKE ALL ON public.live_participants_public FROM anon;
GRANT SELECT ON public.live_participants_public TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_masked JSONB;
BEGIN
  -- 1. The identity column is gone from the data, not just the code.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_question_analytics'
      AND column_name = 'fastest_participant_id'
  ) THEN
    RAISE EXCEPTION 'fastest_participant_id column missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.live_question_analytics WHERE fastest_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'historical fastest_user_id values survived the scrub';
  END IF;
  IF position('v_fastest_pid' IN pg_get_functiondef('public.compute_live_question_analytics(uuid, uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'compute_live_question_analytics was not rebuilt';
  END IF;

  -- 1c. The open policy is gone; the room-scoped one exists.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_question_analytics'
      AND policyname = 'Anyone can view analytics of live exams'
  ) THEN
    RAISE EXCEPTION 'the anyone-can-view analytics policy is still in place';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_question_analytics'
      AND policyname = 'Room members can view analytics of live exams'
  ) THEN
    RAISE EXCEPTION 'the room-members analytics policy did not land';
  END IF;

  -- 2. The token path masks ids; the masking behaves on a synthetic payload.
  IF position('live_report_masked_ids' IN pg_get_functiondef('public.get_live_exam_report_by_token(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'get_live_exam_report_by_token still returns raw ids';
  END IF;
  v_masked := public.live_report_masked_ids(
    '00000000-0000-0000-0000-000000000000'::uuid,
    jsonb_build_object(
      'attendance', jsonb_build_array(jsonb_build_object(
        'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'joined_at', '2026-01-01T00:00:00Z', 'rank', 1)),
      'moments', jsonb_build_array(jsonb_build_object(
        'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kind', 'x'))
    ),
    false
  );
  IF v_masked::text LIKE '%aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa%' THEN
    RAISE EXCEPTION 'a real user_id survived masking';
  END IF;
  IF (v_masked #> '{attendance,0}') ? 'joined_at' THEN
    RAISE EXCEPTION 'joined_at survived the privacy-mode report';
  END IF;
  IF has_function_privilege('public', 'public.live_report_masked_ids(uuid, jsonb, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'live_report_masked_ids is executable by PUBLIC';
  END IF;

  -- 3. The view masks joined_at under privacy mode. pg_get_viewdef reprints
  -- the view from its parse tree (it does NOT keep the source text, unlike
  -- functions), so the probe must match the printer's output: a bare column
  -- prints as `r.joined_at` with no alias, while our CASE prints with an
  -- explicit `END AS joined_at`.
  IF position('END AS joined_at' IN pg_get_viewdef('public.live_participants_public'::regclass)) = 0 THEN
    RAISE EXCEPTION 'live_participants_public still publishes joined_at unmasked';
  END IF;

  RAISE NOTICE 'privacy mode now actually anonymises: analytics id de-identified, report ids masked, join times hidden';
END $$;
