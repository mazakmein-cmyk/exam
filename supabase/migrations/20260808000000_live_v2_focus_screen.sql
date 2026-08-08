-- ============================================================================
-- LIVE EXAM v2 — THE FOCUS SCREEN: STAGING CONTROLS (Q15, Q16)
--
-- Two settings for the projector / livestream view, both of them the creator's
-- call rather than the viewer's, and both of them display-only.
--
--   present_show_options  Q15. Are the answer choices drawn on the wall at all?
--                         Off is how you read the options aloud, hold a
--                         discussion on the question before anyone has seen them,
--                         or keep an answer set off camera on a public stream.
--                         Students always receive every choice on their own
--                         device — this changes one screen, never the exam.
--
--   present_theme         Q16. 'dark' | 'light'. A theme is normally the viewer's
--                         preference; here nobody looking at the screen can reach
--                         the setting. A weak projector in a daylit room cannot
--                         render black — it renders grey — and the creator is the
--                         only party in the building who can see that.
--
-- Why they belong on live_exams next to the other present_* columns
-- ----------------------------------------------------------------
-- The focus screen reads the session from the database itself rather than
-- mirroring the control room, which is what lets it keep counting down when the
-- creator closes the cockpit. A setting held only in the control room's memory
-- would be lost by exactly the accident the split was designed to survive, and
-- would not be there at all when the projector window is reloaded mid-session.
--
-- The BroadcastChannel `config` intent still exists, but only as an optimistic
-- preview so a toggle lands on the same keystroke. The row remains the truth.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================
-- 1. Columns
--
--    Defaults chosen so that an exam created before this migration behaves
--    exactly as it did before it: choices shown, dark frame.
-- ============================================================
ALTER TABLE public.live_exams
  ADD COLUMN IF NOT EXISTS present_show_options BOOLEAN NOT NULL DEFAULT true,   -- Q15
  ADD COLUMN IF NOT EXISTS present_theme        TEXT    NOT NULL DEFAULT 'dark'; -- Q16

-- A CHECK rather than an enum: the set is small, unlikely to grow, and a text
-- column with a constraint can be widened in one statement where a Postgres enum
-- needs a type migration. ADD CONSTRAINT has no IF NOT EXISTS, hence the guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_exams_present_theme_check'
      AND conrelid = 'public.live_exams'::regclass
  ) THEN
    ALTER TABLE public.live_exams
      ADD CONSTRAINT live_exams_present_theme_check
      CHECK (present_theme IN ('dark', 'light'));
  END IF;
END $$;

COMMENT ON COLUMN public.live_exams.present_show_options IS
  'Q15. Display-only: whether the focus screen draws the answer choices. Students always receive them.';
COMMENT ON COLUMN public.live_exams.present_theme IS
  'Q16. Focus screen frame: dark or light. A broadcast decision, not a viewer preference.';


-- ============================================================
-- 2. live_session_sync — carry the two new settings
--
--    Redefined verbatim from 20260804000000 with two keys added to the returned
--    object and nothing else touched. In particular §3 of 20260803030000 (the
--    score_visible gate) is preserved below: dropping it would reopen the
--    mid-question correctness leak, which is exactly how it was nearly lost once
--    already.
--
--    Clients tolerate the keys being absent (they read `!== false` and validate
--    the theme string), so an app deployed ahead of this migration degrades to the
--    defaults rather than failing. This function is what makes them real.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_session_sync(
  p_live_exam_id UUID,
  p_beat BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_exam           public.live_exams;
  v_is_creator     BOOLEAN := false;
  v_is_participant BOOLEAN := false;
  v_online         INTEGER := 0;
  v_joined         INTEGER := 0;
  v_time_seconds   INTEGER;
  v_deadline       TIMESTAMPTZ;
  v_visual_end     TIMESTAMPTZ;
  v_ms_to_deadline BIGINT;
  v_ms_to_visual   BIGINT;
  v_open           BOOLEAN := false;
  v_wait_ms        INTEGER;
  v_open_ms        INTEGER;
  v_next_ms        INTEGER;
  v_my_rank        INTEGER;
  v_my_correct     INTEGER;
  v_confusion      INTEGER;
  v_open_responses INTEGER;
  v_canonical_id   UUID;
  v_score_visible  BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Live exam not found';
  END IF;

  v_is_creator := (v_exam.user_id = v_uid);

  IF NOT v_is_creator AND v_exam.status NOT IN ('published', 'live', 'ended') THEN
    RAISE EXCEPTION 'Live exam not available';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) INTO v_is_participant;

  IF p_beat AND v_is_participant THEN
    INSERT INTO public.live_presence (live_exam_id, user_id, last_seen_at)
    VALUES (p_live_exam_id, v_uid, now())
    ON CONFLICT (live_exam_id, user_id) DO UPDATE SET last_seen_at = now();
  END IF;

  SELECT COUNT(*) INTO v_online
  FROM public.live_presence
  WHERE live_exam_id = p_live_exam_id
    AND last_seen_at > now() - interval '45 seconds';

  SELECT COUNT(*) INTO v_joined
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id;

  IF v_exam.status = 'live'
     AND v_exam.current_question_index >= 0
     AND v_exam.current_question_unlocked_at IS NOT NULL THEN
    SELECT t.id, t.time_seconds INTO v_canonical_id, v_time_seconds
    FROM (
      SELECT lq.id, lq.time_seconds,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
    ) t
    WHERE t.ordinal = v_exam.current_question_index;

    IF v_time_seconds IS NOT NULL THEN
      v_visual_end := public.live_question_visual_end(
        v_exam.current_question_unlocked_at, v_time_seconds,
        v_exam.current_question_extra_seconds
      );
      v_deadline := public.live_question_deadline(
        v_exam.current_question_unlocked_at, v_time_seconds,
        v_exam.current_question_extra_seconds
      );
      v_ms_to_visual   := (extract(epoch from (v_visual_end - now())) * 1000)::bigint;
      v_ms_to_deadline := (extract(epoch from (v_deadline - now())) * 1000)::bigint;
      v_open := v_ms_to_deadline > 0;
    END IF;
  END IF;

  v_wait_ms := CASE WHEN v_online > 600 THEN 4000 WHEN v_online > 200 THEN 2500 ELSE 1500 END;
  v_open_ms := CASE WHEN v_online > 600 THEN 8000 WHEN v_online > 200 THEN 6000 ELSE 5000 END;

  IF v_exam.status IN ('ended', 'draft') THEN
    v_next_ms := 0;
  ELSIF v_open THEN
    IF v_ms_to_visual > 0 THEN
      -- Land just BEFORE the visual end. That is the last instant A3 can be used,
      -- so it is the one a poll-lane client must not sleep through.
      v_next_ms := GREATEST(750, LEAST(v_open_ms, (v_ms_to_visual - 500)::integer));
    ELSE
      -- Inside the grace: the close is imminent and no extension is possible.
      v_next_ms := GREATEST(750, (v_ms_to_deadline + 1000)::integer);
    END IF;
  ELSE
    v_next_ms := v_wait_ms;
  END IF;

  IF v_is_creator THEN
    IF v_canonical_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_open_responses
      FROM public.live_responses
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

      SELECT COUNT(*) INTO v_confusion
      FROM public.live_confusion_signals
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
    END IF;
  ELSE
    -- Preserved from 20260803030000 §3. A score that moves is the same
    -- information as an is_correct flag, so it is withheld on the same terms.
    v_score_visible := (
      v_exam.status = 'ended'
      OR v_exam.current_question_index < 0
      OR NOT v_open
    );

    IF v_score_visible THEN
      SELECT rank, total_correct INTO v_my_rank, v_my_correct
      FROM public.live_participants
      WHERE live_exam_id = p_live_exam_id AND user_id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status',                         v_exam.status,
    'current_question_index',         v_exam.current_question_index,
    'current_question_unlocked_at',   v_exam.current_question_unlocked_at,
    'current_question_extra_seconds', v_exam.current_question_extra_seconds,
    'scheduled_start_at',             v_exam.scheduled_start_at,
    'auto_start',                     v_exam.auto_start,
    'privacy_mode',                   v_exam.privacy_mode,
    'leaderboard_visibility',         v_exam.leaderboard_visibility,
    'present_show_leaderboard',       v_exam.present_show_leaderboard,
    'present_show_river',             v_exam.present_show_river,
    'present_show_options',           v_exam.present_show_options,
    'present_theme',                  v_exam.present_theme,
    'celebrate_seq',                  v_exam.celebrate_seq,
    'total_questions',                v_exam.total_questions,
    'server_now',                     now(),
    'next_poll_ms',                   v_next_ms,
    'online_count',                   v_online,
    'joined_count',                   v_joined,
    'is_creator',                     v_is_creator,
    'my_rank',                        v_my_rank,
    'my_total_correct',               v_my_correct,
    'score_visible',                  (v_is_creator OR v_score_visible),
    'confusion_count',                v_confusion,
    'open_response_count',            v_open_responses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_sync(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 3. Self-check
--
--    A migration whose whole job is "two columns and one key each in a JSON blob"
--    is exactly the kind that gets half-applied and noticed a week later on a
--    projector in front of a class.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_src     TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_exams'
      AND column_name = 'present_show_options'
  ) THEN
    v_missing := v_missing || 'live_exams.present_show_options'::TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_exams'
      AND column_name = 'present_theme'
  ) THEN
    v_missing := v_missing || 'live_exams.present_theme'::TEXT;
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'live_session_sync' LIMIT 1;
  IF v_src IS NULL OR v_src NOT LIKE '%present_show_options%' THEN
    v_missing := v_missing || 'live_session_sync does not return present_show_options'::TEXT;
  END IF;
  IF v_src IS NULL OR v_src NOT LIKE '%present_theme%' THEN
    v_missing := v_missing || 'live_session_sync does not return present_theme'::TEXT;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Focus screen migration incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'Focus screen staging controls ready (Q15 options, Q16 theme).';
END $$;
