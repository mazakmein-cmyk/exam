-- ============================================================================
-- LIVE EXAM v2 — THE FOCUS SCREEN: REVEAL THE ANSWER WHEN TIME IS UP (Q15b)
--
-- A third staging control, and a direct extension of Q15 rather than a new idea:
--
--   present_reveal_answer  Once the timer (plus its grace) has run out, mark the
--                          correct choice on the wall — green, ticked, and named
--                          in words underneath. Until then the wall looks exactly
--                          as it does today.
--
-- Why it is bound to present_show_options
-- ---------------------------------------
-- There is nothing to mark when the choices are not drawn. A creator who hides
-- the options is reading them aloud or holding the room on the question, and
-- "the answer is B" on a wall showing no B is worse than silence. So the control
-- room only offers this setting while the choices are on, and the focus screen
-- gates the reveal on both.
--
-- That relationship is deliberately NOT a CHECK constraint. The two columns are
-- independent preferences: a creator who turns the choices off mid-question to
-- discuss it, then turns them back on, must get their reveal setting back — a
-- constraint would force it to false on the way through and silently lose it.
--
-- Why nothing here needs a new security path
-- ------------------------------------------
-- This column decides whether the wall DRAWS a key it is allowed to have; it does
-- not decide what it is allowed to have. That gate already exists and stays where
-- it is: get_revealed_live_answers returns a question's correct_answer only once
-- now() has passed live_question_deadline(unlocked_at, time_seconds, extra) — so
-- extra time granted with A3 moves the reveal with it, and a client bug cannot
-- pull an answer forward, because the server simply does not return one.
--
-- The focus screen still reads live_questions_student, which has no
-- correct_answer column at all. The key arrives separately, late, and only for
-- questions the server considers closed.
--
-- Default false: showing an answer key on a projector is a change of behaviour
-- for a room and for a livestream, and every exam that existed before this
-- migration must keep behaving as its creator last saw it.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================
-- 1. Column
-- ============================================================
ALTER TABLE public.live_exams
  ADD COLUMN IF NOT EXISTS present_reveal_answer BOOLEAN NOT NULL DEFAULT false;  -- Q15b

COMMENT ON COLUMN public.live_exams.present_reveal_answer IS
  'Q15b. Display-only: whether the focus screen marks the correct choice once the question closes. Meaningful only while present_show_options is true. The answer itself is still gated by get_revealed_live_answers.';


-- ============================================================
-- 2. live_session_sync — carry the new setting
--
--    Redefined verbatim from 20260808000000 with one key added to the returned
--    object and nothing else touched. In particular the score_visible gate from
--    20260803030000 §3 is preserved below: dropping it would reopen the
--    mid-question correctness leak, which is how it was nearly lost once already.
--
--    Clients tolerate the key being absent (they read `=== true`), so an app
--    deployed ahead of this migration degrades to "off" — the safe direction for
--    a setting whose only effect is putting an answer on a wall.
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
    'present_reveal_answer',          v_exam.present_reveal_answer,
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
--    The last assertion is the one worth having. This feature is only safe
--    because the answer it draws comes from a function that will not hand one
--    over early; if that gate were ever relaxed to a bare status check, the wall
--    would start showing the key to a room mid-question.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_src     TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_exams'
      AND column_name = 'present_reveal_answer'
  ) THEN
    v_missing := v_missing || 'live_exams.present_reveal_answer';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'live_session_sync' LIMIT 1;
  IF v_src IS NULL OR v_src NOT LIKE '%present_reveal_answer%' THEN
    v_missing := v_missing || 'live_session_sync does not return present_reveal_answer';
  END IF;
  -- The keys this migration inherited must still be there: it redefines the
  -- whole function, so a bad merge here silently un-ships Q15 and Q16.
  IF v_src IS NULL OR v_src NOT LIKE '%present_show_options%' THEN
    v_missing := v_missing || 'live_session_sync lost present_show_options';
  END IF;
  IF v_src IS NULL OR v_src NOT LIKE '%present_theme%' THEN
    v_missing := v_missing || 'live_session_sync lost present_theme';
  END IF;
  IF v_src IS NULL OR v_src NOT LIKE '%score_visible%' THEN
    v_missing := v_missing || 'live_session_sync lost the score_visible gate';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'get_revealed_live_answers' LIMIT 1;
  IF v_src IS NULL THEN
    v_missing := v_missing || 'get_revealed_live_answers is missing';
  ELSIF v_src NOT LIKE '%live_question_deadline%' THEN
    v_missing := v_missing ||
      'get_revealed_live_answers no longer honours live_question_deadline — the focus screen would draw the key before the timer is up';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Answer-reveal migration incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'Focus screen can now reveal the answer when time is up (Q15b).';
END $$;
