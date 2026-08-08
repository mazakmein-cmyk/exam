-- ============================================================================
-- LIVE EXAM v2 — E3: MAKE "OFF" MEAN OFF
--
-- The leaderboard control offers three choices and has only ever had two
-- behaviours. 'private' and 'off' were collapsed into the same branch at every
-- layer:
--
--   * live_participants_public returns the caller's own row for both — correct,
--     deliberate, and covered by a test. That is what 'private' means, and it is
--     the right floor for 'off' too.
--   * live_session_sync returns my_rank to every participant with no reference to
--     leaderboard_visibility at all, so the number survives both settings.
--   * the student page never read the setting, so it rendered the standings card,
--     the header rank chip and the climb/fall badge identically under all three.
--
-- The result: a creator picking "Off" — labelled "No ranking shown to anyone" —
-- got exactly what "Just me" gives. Students kept a live "#14" pinned to the top
-- of their screen for the whole session.
--
-- This file fixes the server half. Withholding the rank here rather than only in
-- the client is the same argument the masked view was built on: a ranking hidden
-- by a component is one devtools request away from being read, and my_rank rides
-- a payload every student's browser already receives twice a minute.
--
-- What 'off' does NOT hide: my_total_correct. A score is not a ranking — the
-- student can count their own green ticks in the review list either way, and the
-- setting's own copy promises "scores are always recorded". Hiding it would be a
-- different feature, and a dishonest one at this altitude.
--
-- Redefined verbatim from 20260810000000 with the one gate added. The
-- score_visible gate from 20260803030000 §3 and every key added since are
-- preserved below and asserted in §2 — this function has been rebuilt five times
-- and losing a clause to a copy is its established failure mode.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================
-- 1. live_session_sync — no rank for a room that turned ranking off
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
      -- E3. 'off' means no ranking reaches a student, so the rank is dropped on
      -- the way out rather than trusted to the client that receives it. The score
      -- is unaffected: it is this student's own result, not a position in a room.
      --
      -- The creator branch above never reaches here, which is the point — ranks
      -- stay computed, the control room keeps them, and D1 still has them.
      SELECT
        CASE WHEN v_exam.leaderboard_visibility = 'off' THEN NULL ELSE lp.rank END,
        lp.total_correct
      INTO v_my_rank, v_my_correct
      FROM public.live_participants lp
      WHERE lp.live_exam_id = p_live_exam_id AND lp.user_id = v_uid;
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
    'present_reveal_answer',          v_exam.present_reveal_answer,
    'present_theme',                  v_exam.present_theme,
    'celebrate_seq',                  v_exam.celebrate_seq,
    'total_questions',                v_exam.total_questions,
    'server_now',                     now(),
    'next_poll_ms',                   v_next_ms,
    'online_count',                   v_online,
    'joined_count',                   v_joined,
    'is_creator',                     v_is_creator,
    -- Null while a question is open, and null for every student when E3 is 'off'.
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
-- 2. Self-check
--
--    The first assertion is this migration. The rest exist because
--    live_session_sync is redefined wholesale by every feature that adds a
--    setting, and each rewrite is a chance to drop a clause that no test on the
--    happy path would notice missing.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_src     TEXT;
  v_view    TEXT;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'live_session_sync' LIMIT 1;

  IF v_src IS NULL THEN
    v_missing := v_missing || 'live_session_sync is missing'::TEXT;
  ELSE
    -- The fix.
    IF v_src NOT LIKE '%leaderboard_visibility = ''off''%' THEN
      v_missing := v_missing ||
        'live_session_sync still hands every student their rank when E3 is off'::TEXT;
    END IF;

    -- Everything the rewrite had to carry forward.
    IF v_src NOT LIKE '%v_score_visible%' THEN
      v_missing := v_missing ||
        'live_session_sync lost the score_visible gate — mid-question correctness would leak again'::TEXT;
    END IF;
    IF v_src NOT LIKE '%present_reveal_answer%' THEN
      v_missing := v_missing || 'live_session_sync lost present_reveal_answer (Q15b)'::TEXT;
    END IF;
    IF v_src NOT LIKE '%present_show_options%' THEN
      v_missing := v_missing || 'live_session_sync lost present_show_options (Q15)'::TEXT;
    END IF;
    IF v_src NOT LIKE '%present_theme%' THEN
      v_missing := v_missing || 'live_session_sync lost present_theme (Q16)'::TEXT;
    END IF;
    IF v_src NOT LIKE '%live_question_visual_end%' THEN
      v_missing := v_missing ||
        'live_session_sync lost the visual-end cadence — poll-lane clients would sleep through the A3 window'::TEXT;
    END IF;
  END IF;

  -- 'off' must still inherit the 'private' floor: the room's rows never leave the
  -- database in the first place. This migration does not touch the view, so this
  -- is a guard against a future one relaxing it.
  SELECT pg_get_viewdef('public.live_participants_public'::regclass) INTO v_view;
  IF v_view IS NULL OR v_view NOT LIKE '%leaderboard_visibility%' THEN
    v_missing := v_missing ||
      'live_participants_public no longer applies E3 — the standings are readable directly again'::TEXT;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'E3 "off" migration incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'E3 is now three settings: full shows the room, private shows you, off shows nobody a rank.';
END $$;
