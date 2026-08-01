-- ============================================================
-- SECURITY HARDENING — found by an audit of the shipped Phase 0/1 code
--
-- Three holes, verified against the live database, not inferred.
--
--  1. public.profiles is readable by EVERYONE, including anonymous callers, and
--     holds full_name and phone_number. An unauthenticated request to
--     /rest/v1/profiles?select=full_name,phone_number returns the whole table.
--     The anon key ships inside the client bundle, so this is effectively public.
--     This is not a live-exam bug — it predates the feature — but the live-exam
--     audit is what surfaced it, and it is the most severe issue found.
--
--  2. Because of (1), privacy mode (E1) was cosmetic. live_participants_public
--     masks display_name but still projects user_id, so two requests rebuild the
--     real-name leaderboard: read the masked view for user_ids, then join
--     profiles for names. The view was also granted to anon, which has no reason
--     to read a leaderboard at all.
--
--  3. live_session_sync returns my_total_correct with no deadline gate, while
--     get_my_live_responses deliberately masks is_correct until a question has
--     closed — the original comment says it "prevents a second account probing
--     correctness mid-question" (20260729020000). Two accounts can therefore
--     learn the right answer while the question is still answerable: A answers,
--     A's sync reveals whether the score moved, B submits knowingly. The window
--     is currently ~2s (analytics compute inside the grace) and A3 "add time"
--     would widen it to however long the creator extends.
--
-- Blast radius of (1) was checked before changing it: exactly one call site in
-- the app reads profiles (joinLiveExam, own row only), and every other reference
-- is inside an admin RPC declared `security definer`, which bypasses RLS.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. profiles — a profile is yours, not the internet's
--
--    Replaces `for select using (true)`. Own row only; everything that needs
--    cross-user reads is an admin RPC running as definer, which is unaffected.
--
--    If a future feature genuinely needs to show another user's public handle,
--    add a VIEW exposing only the safe columns (username, avatar_url,
--    is_verified) — never widen this policy back to the base table, because the
--    base table carries phone_number.
-- ============================================================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);


-- ============================================================
-- 2. live_participants_public — stop handing out the join key
--
--    display_name is masked, so user_id must be too: it is the key that maps
--    straight back to a real identity. The caller still gets their OWN user_id,
--    which is all the client needs to highlight "you" in the list.
--
--    `id` (the participant row id) is returned unchanged and is what React keys
--    off. It joins to nothing outside live_participants, which students cannot
--    read.
--
--    Under privacy mode other rows return NULL for user_id. With privacy off the
--    real names are already on display, so withholding the id would buy nothing.
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
    le.leaderboard_visibility = 'full'
    OR r.user_id = auth.uid()
  );

-- Joining requires an account, so an anonymous caller has no business reading a
-- leaderboard. Narrowing this also means an anon key alone can no longer
-- enumerate participants.
REVOKE ALL ON public.live_participants_public FROM anon;
GRANT SELECT ON public.live_participants_public TO authenticated;


-- ============================================================
-- 3. live_session_sync — do not leak my own correctness mid-question
--
--    Mirrors the gate get_my_live_responses already applies to is_correct: the
--    running score is only returned once the current question has genuinely
--    closed (deadline + grace), or for a question already behind us, or once the
--    exam has ended.
--
--    Everything else in the payload is unchanged. my_rank is included in the
--    gate for the same reason — a rank that moves is the same signal as a score
--    that moves.
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
  v_ms_to_deadline BIGINT;
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
      v_deadline := public.live_question_deadline(
        v_exam.current_question_unlocked_at, v_time_seconds,
        v_exam.current_question_extra_seconds
      );
      v_ms_to_deadline := (extract(epoch from (v_deadline - now())) * 1000)::bigint;
      v_open := v_ms_to_deadline > 0;
    END IF;
  END IF;

  -- Cadence, scaled by how many people are actually in the room.
  v_wait_ms := CASE WHEN v_online > 600 THEN 4000 WHEN v_online > 200 THEN 2500 ELSE 1500 END;
  v_open_ms := CASE WHEN v_online > 600 THEN 8000 WHEN v_online > 200 THEN 6000 ELSE 5000 END;

  IF v_exam.status IN ('ended', 'draft') THEN
    v_next_ms := 0;
  ELSIF v_open THEN
    v_next_ms := GREATEST(750, LEAST(v_open_ms, (v_ms_to_deadline + 1500)::integer));
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
    -- THE GATE. A score that moves is the same information as an is_correct
    -- flag, so it is withheld on exactly the same terms: the exam is over, or
    -- no question is open, or the open question has closed for good.
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
    'celebrate_seq',                  v_exam.celebrate_seq,
    'total_questions',                v_exam.total_questions,
    'server_now',                     now(),
    'next_poll_ms',                   v_next_ms,
    'online_count',                   v_online,
    'joined_count',                   v_joined,
    'is_creator',                     v_is_creator,
    -- Null while a question is open. The client keeps its previous value rather
    -- than flashing a dash, so this reads as "not updated yet", not "reset".
    'my_rank',                        v_my_rank,
    'my_total_correct',               v_my_correct,
    'score_visible',                  (v_is_creator OR v_score_visible),
    'confusion_count',                v_confusion,
    'open_response_count',            v_open_responses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_sync(UUID, BOOLEAN) TO authenticated;
