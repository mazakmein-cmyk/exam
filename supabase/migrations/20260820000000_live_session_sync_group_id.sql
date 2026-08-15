-- ============================================================
-- LIVE EXAMS: tell every client WHICH question is open, by name
--
-- ADDITIVE AND SAFE TO APPLY ALONE. This adds one key to the payload
-- live_session_sync already returns. No existing key changes, is removed, or
-- changes meaning. A client that does not read the new key behaves identically.
--
-- WHY
-- The previous migration taught the SERVER to attribute an answer by name tag
-- instead of by position. That fixes the filing. It does not fix what the
-- student is looking at, because the student's app still picks its question by
-- counting:
--
--     currentQuestion = questions[currentQuestionIndex]   // LiveExamStudent.tsx
--
-- `questions` is that student's own-language list. So on an exam where the
-- Hindi list is one question short, the host announces question 5, the English
-- half of the room reads question 5, and the Hindi half reads the translation
-- of question 6 — both in good faith, on the same timer, with nothing on any
-- screen suggesting anything is wrong. Server-side matching cannot fix that:
-- by the time the answer arrives the student has already read the wrong
-- question.
--
-- The app cannot fix it either, on its own. It knows the host is on position 5;
-- it has no way to know WHICH question that is. Only the server knows, because
-- only the server holds the primary-language list that current_question_index
-- indexes.
--
-- So the server now says so. current_question_group_id is the name tag of the
-- open question, and a client that looks for that tag in its own list lands on
-- the right question regardless of how the two lists line up.
--
-- WHAT IT IS NULL FOR, WHICH IS MOST THINGS
--   * no question open (status not live, or index < 0)
--   * the open question carries no tag — every single-language exam, where
--     there is nothing to translate to and counting is already correct
--   * the primary language has no row at the current index
-- In every one of those cases a client falls back to position, which is what it
-- does today. The new key adds a better answer when one exists; it never
-- removes the old one.
--
-- ALSO: the inline canonical lookup here becomes a call to
-- live_primary_questions (20260817000000). That was deferred out of the
-- de-duplication migration precisely so this function would be rewritten once
-- rather than twice — it has SIX definitions across six migrations and only the
-- last one applied exists, so every extra rewrite is another chance to edit a
-- body that is not the live one.
--
-- Reproduced from 20260812000000_live_v2_leaderboard_off.sql:42-221, the latest
-- of those six. That version is the only one carrying all five present_* keys
-- and the E3 score_visible gate; rebuilding from any earlier body would
-- silently revert them.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.live_primary_questions(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'live_primary_questions is missing. Apply 20260817000000_live_primary_questions_helper.sql first. Nothing in this migration has been applied.';
  END IF;
END $$;


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
  v_open_group_id  TEXT;
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
    -- Which primary-language row is at the host's position. Still located by
    -- position, and correctly so — current_question_index IS a position, and it
    -- indexes the primary language, the one list guaranteed to exist.
    SELECT id INTO v_canonical_id
    FROM public.live_primary_questions(p_live_exam_id)
    WHERE ordinal = v_exam.current_question_index;

    -- Its timer and its name tag. time_seconds comes from the same row it
    -- always did; question_group_id is the new part, and it is what lets a
    -- client find this question in a list that does not line up.
    IF v_canonical_id IS NOT NULL THEN
      SELECT lq.time_seconds, lq.question_group_id
      INTO v_time_seconds, v_open_group_id
      FROM public.live_questions lq
      WHERE lq.id = v_canonical_id;
    END IF;

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
    -- NEW. The name tag of the open question, so a client can find it in its own
    -- language's list instead of counting to current_question_index. NULL when
    -- nothing is open, when the open question has no tag (every single-language
    -- exam), or when the primary language has no row at that position — in all
    -- of which a client correctly falls back to counting.
    'current_question_group_id',      v_open_group_id,
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
-- Self-check — every key the old payload had, the new one still has
--
--    live_session_sync is the single call every client polls, so a dropped key
--    is a feature going dark across the whole product with no error anywhere.
--    Six definitions of this function exist and only the last applied one is
--    real, which is exactly how a key gets lost: rebuild from the wrong body
--    and the present_* flags or the E3 rank gate quietly revert.
--
--    Asserted against the installed function's source rather than a list in a
--    comment, so it cannot drift from what actually shipped.
-- ============================================================
DO $$
DECLARE
  v_src     TEXT := pg_get_functiondef('public.live_session_sync(uuid,boolean)'::regprocedure);
  v_missing TEXT := '';
  k         TEXT;
BEGIN
  FOREACH k IN ARRAY ARRAY[
    'status', 'current_question_index', 'current_question_unlocked_at',
    'current_question_extra_seconds', 'scheduled_start_at', 'auto_start',
    'privacy_mode', 'leaderboard_visibility', 'present_show_leaderboard',
    'present_show_river', 'present_show_options', 'present_reveal_answer',
    'present_theme', 'celebrate_seq', 'total_questions', 'server_now',
    'next_poll_ms', 'online_count', 'joined_count', 'is_creator', 'my_rank',
    'my_total_correct', 'score_visible', 'confusion_count', 'open_response_count',
    'current_question_group_id'
  ]
  LOOP
    IF position('''' || k || '''' IN v_src) = 0 THEN
      v_missing := v_missing || k || ' ';
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'live_session_sync payload lost key(s): %', v_missing;
  END IF;

  IF position('leaderboard_visibility = ''off''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the E3 rank gate is missing — this body was rebuilt from a pre-20260812000000 definition';
  END IF;

  RAISE NOTICE 'live_session_sync: all 25 existing keys intact, current_question_group_id added';
END $$;
