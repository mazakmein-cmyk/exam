-- ============================================================
-- LIVE EXAMS: a student holds only the questions they have been asked
--
-- WHAT IS BROKEN
-- fetchAllLiveQuestionsStudent selects every question of the exam in one
-- request at join, and live_questions_student gates only on exam STATUS. So a
-- student's browser holds the whole paper from the moment they open the link —
-- and the link is handed out at publish, before the session starts. The answer
-- keys are correctly withheld, but the paper itself is the secret in a live
-- exam: the format assumes nobody has seen the next question yet.
-- One-question-at-a-time is currently a visual effect.
--
-- THE COST CONSTRAINT
-- The obvious fix — fetch each question as it unlocks — costs one request per
-- question per student, which is exactly what a free-tier project cannot
-- spend. This spends nothing. Two halves:
--
--   1. The view stops returning questions past the one being played, so the
--      SAME single fetch the client already makes at join now returns only
--      what has actually been asked. No new call; the existing one narrows.
--
--   2. Each newly unlocked question is written onto the live_exams row, which
--      every student is ALREADY receiving — over realtime on the push lane
--      (postgres_changes sends the whole row) and inside live_session_sync on
--      the pull lane (a poll that already runs for the heartbeat, the clock
--      samples and the head count). The question arrives on a message that was
--      going to be sent anyway.
--
-- Net effect on request count: unchanged at join, zero per unlock, and nothing
-- extra at the end — by then everything is unlocked, so the review has it all.
--
-- WHY A TRIGGER RATHER THAN EDITING THE UNLOCK FUNCTION
-- Two functions move the pointer today (unlock_next_live_question, and the undo
-- in 20260817000000), and a third would be easy to add and easy to forget. A
-- trigger on the column catches every writer, including future ones.
--
-- The payload carries EVERY language's copy of the open question, because a
-- student may switch language mid-session and that switch must not become a
-- new request either. It never carries correct_answer — the key is still
-- released only by get_revealed_live_answers, on its own timer.
-- ============================================================

ALTER TABLE public.live_exams
  ADD COLUMN IF NOT EXISTS current_question_payload jsonb;

COMMENT ON COLUMN public.live_exams.current_question_payload IS
  'The open question, every language, no correct_answer. Maintained by trg_live_question_payload. Rides the realtime row push and live_session_sync so a student never needs a request per question.';


-- ── Build the payload for one play position ────────────────────────────────
-- Ordinal is per language, the same shape get_revealed_live_answers uses, so a
-- translated room stays in step with the primary cursor.
CREATE OR REPLACE FUNCTION public.live_question_payload_at(
  p_live_exam_id uuid,
  p_ordinal integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE WHEN p_ordinal IS NULL OR p_ordinal < 0 THEN NULL ELSE (
    SELECT COALESCE(jsonb_agg(to_jsonb(q) - 'ordinal'), '[]'::jsonb)
    FROM (
      SELECT
        lq.id,
        lq.live_section_id,
        lq.q_no,
        lq.text,
        lq.options,
        lq.answer_type,
        lq.time_seconds,
        lq.image_url,
        lq.image_urls,
        lq.option_image_urls,
        lq.question_group_id,
        lq.global_index,
        lq.section_label,
        lq.created_at,
        ls.language,
        (ROW_NUMBER() OVER (
           PARTITION BY ls.language
           ORDER BY lq.global_index, lq.q_no, lq.id
         ) - 1) AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON ls.id = lq.live_section_id
      WHERE ls.live_exam_id = p_live_exam_id
    ) q
    WHERE q.ordinal = p_ordinal
  ) END;
$fn$;

-- A SECURITY DEFINER function that returns any question by ordinal is a
-- paper-reading oracle, so it must not be reachable from a browser.
--
-- FROM PUBLIC IS NOT ENOUGH ON SUPABASE.
-- A Supabase project ships with
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- so every new function in this schema is granted EXECUTE to those roles
-- DIRECTLY, not through PUBLIC. Revoking from PUBLIC therefore removes a grant
-- that was never the one being used, and the function stays wide open. Every
-- REVOKE EXECUTE written in this repo before this migration has that hole; the
-- self-check at the bottom of this file is the first one that actually tested it,
-- and it failed on the first paste.
REVOKE EXECUTE ON FUNCTION public.live_question_payload_at(uuid, integer)
  FROM PUBLIC, anon, authenticated;


-- ── Keep it in step with the pointer ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.live_question_payload_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.current_question_index IS DISTINCT FROM OLD.current_question_index THEN
    NEW.current_question_payload :=
      public.live_question_payload_at(NEW.id, NEW.current_question_index);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_live_question_payload ON public.live_exams;
CREATE TRIGGER trg_live_question_payload
  BEFORE UPDATE ON public.live_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.live_question_payload_sync();


-- ── The view stops running ahead of the session ────────────────────────────
-- Column list copied from 20260731100000 unchanged; only the predicate grows.
CREATE OR REPLACE VIEW public.live_questions_student AS
SELECT
  q.id,
  q.live_section_id,
  q.q_no,
  q.text,
  q.options,
  q.answer_type,
  q.time_seconds,
  q.image_url,
  q.image_urls,
  q.question_group_id,
  q.global_index,
  q.section_label,
  q.created_at,
  q.option_image_urls
FROM (
  SELECT
    lq.*,
    le.status  AS exam_status,
    le.current_question_index AS cursor,
    (ROW_NUMBER() OVER (
       PARTITION BY ls.live_exam_id, ls.language
       ORDER BY lq.global_index, lq.q_no, lq.id
     ) - 1) AS ordinal
  FROM public.live_questions lq
  JOIN public.live_sections ls ON ls.id = lq.live_section_id
  JOIN public.live_exams le ON le.id = ls.live_exam_id
  WHERE le.status IN ('published', 'live', 'ended')
) q
WHERE
  -- Once the session is over there is nothing left to protect, and the review
  -- screen needs the whole paper.
  q.exam_status = 'ended'
  -- Otherwise only up to the question being played. A published-but-not-started
  -- exam sits at -1 and returns nothing, which is the point: the link is shared
  -- before the session opens.
  OR q.ordinal <= q.cursor;

-- authenticated ONLY. 20260823000000 revoked anon from this view and warned in
-- as many words that "a future recreate must not re-add anon or this silently
-- reopens" — this is that future recreate. The view is definer-rights and its
-- predicate is per-exam status and cursor, with no participation filter, so an
-- anon grant lets anything holding the publishable key (which ships inside the
-- client bundle) read the released questions of every live exam in the database.
-- Nothing anonymous needs it: LiveExamStudent.init() calls auth.getUser() and
-- redirects to /student-auth before it ever fetches questions.
REVOKE ALL ON public.live_questions_student FROM anon;
GRANT SELECT ON public.live_questions_student TO authenticated;


-- ── live_session_sync, carrying the open question ──────────────────────────
-- Body copied verbatim from 20260820000000; one field added to the return so
-- the pull lane gets the question on a poll it was already making.
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
    -- The open question itself, so a student never holds one they have not
    -- been asked. Written onto the row by trg_live_question_payload, so it
    -- rides the realtime push and this poll - both already happen. No answer
    -- key: that is still released only by get_revealed_live_answers.
    'current_question_payload',       v_exam.current_question_payload,
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

-- Backfill so a session that is ALREADY live keeps working the moment this
-- lands: without it the open question would have no payload until the next
-- unlock, and the room would sit on a blank question.
UPDATE public.live_exams le
SET current_question_payload = public.live_question_payload_at(le.id, le.current_question_index)
WHERE le.status = 'live'
  AND le.current_question_index >= 0
  AND le.current_question_payload IS NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check: the paper must be withheld AND the room must still work. An
-- over-tight predicate here hands every candidate a blank exam mid-session.
-- ============================================================
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_exams'
      AND column_name = 'current_question_payload'
  ) THEN
    RAISE EXCEPTION 'live_exams.current_question_payload missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_live_question_payload') THEN
    RAISE EXCEPTION 'trg_live_question_payload missing - newly unlocked questions would never reach students';
  END IF;

  -- The key must still be absent from the student view.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_questions_student'
      AND column_name IN ('correct_answer', 'answer_hint')
  ) THEN
    RAISE EXCEPTION 'live_questions_student exposes an answer channel';
  END IF;

  -- The runner reads these; losing one blanks the paper rather than erroring.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_questions_student'
      AND column_name = 'global_index'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_questions_student'
      AND column_name = 'option_image_urls'
  ) THEN
    RAISE EXCEPTION 'live_questions_student lost a column the runner needs';
  END IF;

  -- The grant, both directions. Recreating this view is exactly how the anon
  -- hole 20260823000000 closed would come back, and losing authenticated is how
  -- every student gets a blank paper mid-session.
  IF has_table_privilege('anon', 'public.live_questions_student', 'SELECT') THEN
    RAISE EXCEPTION 'anon can SELECT live_questions_student - this recreate reopened the hole 20260823000000 closed';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.live_questions_student', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on live_questions_student - every student would load a blank paper';
  END IF;

  RAISE NOTICE 'live paper is released one question at a time, at no extra request cost';
END $chk$;
