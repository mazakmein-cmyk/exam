-- ============================================================
-- LIVE EXAMS: a session whose host has gone closes itself
--
-- WHAT IS BROKEN
-- If the host's tab goes away mid-session — a dead battery, a closed laptop, a
-- browser crash — the exam stays 'live' forever. Students sit on "waiting for
-- the next question" indefinitely, anyone holding the share code can still walk
-- in hours later, and the session produces NO report and NO final standings,
-- because end_live_session is what computes the rankings and builds the report.
-- The teacher loses the results of a class that actually happened.
--
-- WHY NOTHING NOTICED
-- Two individually correct decisions combine into a blind spot:
--
--   * joinLiveExam deliberately does NOT insert the creator into
--     live_participants — a teacher must not appear on their own leaderboard.
--   * live_session_sync records presence only `IF p_beat AND v_is_participant`.
--
-- So the host's browser has been sending a heartbeat every 30 seconds all along
-- and the server has been throwing it away. The one person whose absence breaks
-- the room is the one person the room was not watching.
--
-- THE FIX, AT NO REQUEST COST
-- Start recording that heartbeat, and let the poll that every client already
-- makes notice when it has gone quiet. No cron, no scheduled task, no new
-- client code — the creator's page ALREADY sends p_beat=true on the same
-- schedule as a student's, because shouldBeat() in useLiveSession is not gated
-- on role. This migration is the whole feature.
--
-- "THE CLOCK MUST NOT RUN WHILE THE CREATOR'S TAB IS OPEN"
-- That is exactly what a heartbeat gives us, and it is why the staleness check
-- below runs BEFORE this caller's own beat is recorded. An open tab syncs every
-- few seconds and beats every 30, so its last_seen is never more than about a
-- minute old and the 15-minute test can never pass. Both creator surfaces
-- count: the control page and the projector both authenticate as the creator
-- and both run the same sync loop, so a session being driven from either one is
-- never considered abandoned.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- Nothing changes on the student's screen. There is no "your host has
-- disconnected" message and no new state to render: the session simply ends,
-- and every client already knows what to do with status='ended'.
-- ============================================================

-- ── Order dependency, made loud ────────────────────────────────────────────
-- This migration recreates live_session_sync from the 20260844000000 version.
-- Pasted before that one, it would install a body referencing a column that does
-- not exist yet — and the failure would surface as a broken sync for every
-- client in every live session, not as an error here. Migrations in this project
-- are applied by hand, so filename order is a convention, not a guarantee.
DO $dep$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_exams'
      AND column_name = 'current_question_payload'
  ) THEN
    RAISE EXCEPTION 'Apply 20260844000000_live_paper_released_per_question.sql FIRST - this file rebuilds live_session_sync from that version and would otherwise break every live session.';
  END IF;
END $dep$;


-- ── Where the host's heartbeat goes ────────────────────────────────────────
-- Its own table, for two reasons that are both load-bearing:
--
--   NOT live_presence — live_session_sync computes v_online as COUNT(*) over
--   that table, so a row for the host would add a phantom to every "58 students
--   online" reading, on the creator's own dashboard and on the projector.
--
--   NOT a column on live_exams — that table is published over Realtime, so a
--   write every 30 seconds would broadcast the entire exam row to every student
--   in the room every 30 seconds, for the whole session. On a 300-student class
--   that is a five-figure message count for a timestamp nobody renders.
CREATE TABLE IF NOT EXISTS public.live_host_presence (
  live_exam_id UUID PRIMARY KEY REFERENCES public.live_exams(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.live_host_presence IS
  'When the creator was last seen driving a live session. Written by live_session_sync on the creator''s own heartbeat; read only to decide whether an abandoned session should close itself. Deliberately not live_presence (which is counted for the head count) and not a column on live_exams (which is broadcast over Realtime).';

ALTER TABLE public.live_host_presence ENABLE ROW LEVEL SECURITY;

-- No policies, and no grants. Only SECURITY DEFINER functions touch this, and
-- they run as the table owner, which bypasses RLS. A student must not be able to
-- read when the host was last seen, and must certainly not be able to forge it —
-- a forged future timestamp would keep an abandoned session open forever, and a
-- forged past one would end a class that is still running.
REVOKE ALL ON public.live_host_presence FROM PUBLIC;
REVOKE ALL ON public.live_host_presence FROM anon, authenticated;


-- ── Ending a session, with the ownership test lifted out ───────────────────
-- Extracted verbatim from end_live_session (20260817000000), minus the
-- `user_id = auth.uid()` predicate, so the same steps can run on behalf of a
-- session nobody is left to end. end_live_session is rewritten below to call
-- this, so there is exactly ONE copy of what "ending a session" means — a
-- second copy would drift the moment either is fixed.
CREATE OR REPLACE FUNCTION public.end_live_session_system(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result public.live_exams;
  v_qid    UUID;
BEGIN
  -- `AND status = 'live'` is a correctness guard, not a formality. When the
  -- grace period lapses, every client still in the room polls within the same
  -- second and every one of them reaches this statement. Postgres serialises
  -- them on the row lock: the first flips the row, the rest then match no row
  -- and fall straight out. The rankings and the report are therefore built
  -- exactly once, however many callers arrive together.
  UPDATE public.live_exams
  SET status = 'ended',
      ended_at = now()
  WHERE id = p_live_exam_id
    AND status = 'live'
  RETURNING * INTO v_result;

  -- Not an error: it means somebody else got there first, which is the expected
  -- outcome for all but one caller. The auto-end path treats this as "already
  -- handled"; end_live_session turns it back into the exception it always was.
  IF v_result.id IS NULL THEN
    RETURN v_result;
  END IF;

  -- Safety net: compute analytics for any unlocked primary-language question
  -- that never got them (e.g. the creator's tab was closed at timer expiry).
  -- NOTE: status is flipped to 'ended' ABOVE, before this loop, and the analytics
  -- guard depends on that ordering. Do not reorder.
  FOR v_qid IN
    SELECT p.id
    FROM public.live_primary_questions(p_live_exam_id) p
    WHERE p.ordinal <= v_result.current_question_index
      AND NOT EXISTS (
        SELECT 1 FROM public.live_question_analytics a
        WHERE a.live_exam_id = p_live_exam_id AND a.live_question_id = p.id
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
$fn$;

-- Left reachable, ANY student could call this and end the exam they are sitting,
-- at any moment, for everyone. It is meant to be reachable only from inside
-- live_session_sync, which decides for itself whether the host has actually gone.
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
--
-- The owner (postgres) keeps EXECUTE regardless, which is what lets the
-- SECURITY DEFINER live_session_sync go on calling it.
REVOKE EXECUTE ON FUNCTION public.end_live_session_system(UUID) FROM PUBLIC, anon, authenticated;


-- ── Same hole, one migration back ──────────────────────────────────────────
-- 20260844000000 locked live_question_payload_at with FROM PUBLIC alone, so on
-- a Supabase project it is still callable by any signed-in student:
--
--     rpc('live_question_payload_at', { p_live_exam_id: <their exam>, p_ordinal: 39 })
--
-- returns question 40 before it has been asked — which defeats the entire
-- one-question-at-a-time release that migration exists to provide. Repaired
-- here rather than by re-pasting that file, so a project already running it is
-- fixed by applying this one. 20260844000000 is corrected too, for fresh installs.
DO $lock$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'live_question_payload_at'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.live_question_payload_at(uuid, integer)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $lock$;


-- ── The creator's own "End session", unchanged in behaviour ────────────────
-- Same signature, same return, same exception text. The ownership test moves
-- from the UPDATE's WHERE clause into an explicit guard so the steps below it
-- can be shared. The re-check after the call covers the gap between the two:
-- if the row stopped being 'live' in between, this still raises exactly as it
-- did when both tests lived in one statement.
CREATE OR REPLACE FUNCTION public.end_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result public.live_exams;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id
      AND user_id = auth.uid()
      AND status = 'live'
  ) THEN
    RAISE EXCEPTION 'Cannot end: not the creator or exam is not live';
  END IF;

  v_result := public.end_live_session_system(p_live_exam_id);

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot end: not the creator or exam is not live';
  END IF;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.end_live_session(UUID) TO authenticated;


-- ── live_session_sync, now watching the host ───────────────────────────────
-- Body copied from 20260844000000; two blocks added, marked below.
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
  v_host_seen      TIMESTAMPTZ;
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

  -- ── ADDED 20260845000000: close a session whose host has gone ────────────
  -- Deliberately ABOVE the beat writes below. An open creator tab syncs every
  -- few seconds and beats every 30, so its last_seen is never more than about a
  -- minute old and this test cannot pass — which is precisely the requirement
  -- that the 15 minutes must not run while the creator's tab is open. Testing
  -- after the beat instead would let a creator returning after an hour stamp a
  -- fresh timestamp on the way in, and no session would ever close itself.
  --
  -- Costs nothing: it rides a poll that already happens for the heartbeat, the
  -- clock samples and the head count.
  IF v_exam.status = 'live' THEN
    SELECT hp.last_seen_at INTO v_host_seen
    FROM public.live_host_presence hp
    WHERE hp.live_exam_id = p_live_exam_id;

    -- Unlocking a question, and starting the session, are both proof the host
    -- was here — and for a session that began before this migration they are
    -- the ONLY evidence there is. Without this fallback the first poll after
    -- the migration lands would end every session in progress at once.
    v_host_seen := GREATEST(
      COALESCE(v_host_seen, to_timestamp(0)),
      COALESCE(v_exam.current_question_unlocked_at, to_timestamp(0)),
      COALESCE(v_exam.started_at, to_timestamp(0))
    );

    -- No evidence at all: do nothing. Never end a session on an absence of
    -- information — the cost of leaving one open is an untidy row, and the cost
    -- of closing one wrongly is a class cut off mid-paper.
    IF v_host_seen > to_timestamp(0)
       AND now() - v_host_seen > interval '15 minutes' THEN
      -- Advisory lock so the losers do not queue behind the winner's report
      -- build. Without it the row lock inside end_live_session_system makes
      -- every client in the room wait out the rankings and the report on this
      -- one poll. They skip instead and see status='ended' a beat later.
      -- The `status = 'live'` predicate in there remains the real guarantee;
      -- this is only about not stalling everyone at the moment of closing.
      IF pg_try_advisory_xact_lock(hashtext('live_auto_end'), hashtext(p_live_exam_id::text)) THEN
        PERFORM public.end_live_session_system(p_live_exam_id);
        -- Re-read so THIS reply already says 'ended' and the room acts on it
        -- now rather than on the next poll.
        SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
      END IF;
    END IF;
  END IF;

  IF p_beat AND v_is_participant THEN
    INSERT INTO public.live_presence (live_exam_id, user_id, last_seen_at)
    VALUES (p_live_exam_id, v_uid, now())
    ON CONFLICT (live_exam_id, user_id) DO UPDATE SET last_seen_at = now();
  END IF;

  -- ── ADDED 20260845000000: the host's own heartbeat ───────────────────────
  -- The client has been sending this all along — shouldBeat() in useLiveSession
  -- is not gated on role, so the creator's page beats on the same 30s schedule
  -- as a student's. The server was simply dropping it, because the creator is
  -- (correctly) never in live_participants. Nothing on the client changes.
  IF p_beat AND v_is_creator THEN
    INSERT INTO public.live_host_presence (live_exam_id, last_seen_at)
    VALUES (p_live_exam_id, now())
    ON CONFLICT (live_exam_id) DO UPDATE SET last_seen_at = now();
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

-- Seed a heartbeat for every session that is live RIGHT NOW, so applying this
-- mid-class does not read as "the host has been gone since the epoch". Without
-- it the fallback below would still save them (started_at / the last unlock are
-- both recent in a real session), but a session parked on a long question could
-- be ended the moment this lands, in front of the room.
INSERT INTO public.live_host_presence (live_exam_id, last_seen_at)
SELECT le.id, now()
FROM public.live_exams le
WHERE le.status = 'live'
ON CONFLICT (live_exam_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
--
-- The dangerous failure here is not "abandoned sessions stay open" — that is
-- today's behaviour and it is survivable. It is ending a session that is still
-- running, in front of a room, halfway through a paper. So the checks below care
-- most about the things that keep that from happening: the fallback evidence,
-- the ordering of the staleness test against the beat, and the fact that no
-- student can reach the ending function directly.
-- ============================================================
DO $chk$
DECLARE
  v_src TEXT;
  v_beat_pos INT;
  v_check_pos INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'live_host_presence'
  ) THEN
    RAISE EXCEPTION 'live_host_presence missing - nothing would ever record the host';
  END IF;

  -- A student who could write this table could keep a session open forever, or
  -- close one that is still running.
  IF has_table_privilege('authenticated', 'public.live_host_presence', 'INSERT')
     OR has_table_privilege('authenticated', 'public.live_host_presence', 'UPDATE')
     OR has_table_privilege('anon', 'public.live_host_presence', 'SELECT') THEN
    RAISE EXCEPTION 'live_host_presence is reachable from a browser - the host clock could be forged';
  END IF;

  -- The one that would let any candidate end the exam they are sitting.
  IF has_function_privilege('authenticated', 'public.end_live_session_system(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'end_live_session_system is callable by students - any of them could end the session';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.end_live_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'creators lost end_live_session - nobody could end a session at all';
  END IF;

  -- The paper-release fix one migration back is only as strong as this.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'live_question_payload_at'
  ) AND has_function_privilege('authenticated', 'public.live_question_payload_at(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'live_question_payload_at is callable by students - any of them could read a question before it is asked, which defeats 20260844000000 entirely';
  END IF;

  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'live_session_sync';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'live_session_sync missing';
  END IF;

  -- ORDER IS THE FEATURE. The staleness test must run BEFORE this caller's own
  -- beat is written, or a creator reopening their tab after an hour would
  -- refresh the clock on the way in and the session would never close. It is
  -- also what makes "the tab is open" mean "the 15 minutes do not count".
  v_check_pos := position('end_live_session_system' in v_src);
  -- The INSERT specifically: the function READS this table in the staleness
  -- test above, so a plain first-mention search would find the read and report
  -- the two blocks in the wrong order.
  v_beat_pos  := position('INSERT INTO public.live_host_presence' in v_src);
  IF v_check_pos = 0 THEN
    RAISE EXCEPTION 'live_session_sync never checks for an absent host';
  END IF;
  IF v_beat_pos = 0 THEN
    RAISE EXCEPTION 'live_session_sync never records the host heartbeat';
  END IF;
  IF v_check_pos > v_beat_pos THEN
    RAISE EXCEPTION 'live_session_sync records the host beat BEFORE testing staleness - a returning host would reset the clock and no session would ever auto-close';
  END IF;

  -- The fallback that stops this ending sessions that predate the migration.
  IF position('current_question_unlocked_at' in v_src) = 0 THEN
    RAISE EXCEPTION 'the host-absence test has no fallback evidence - a session with no heartbeat row yet would be ended immediately';
  END IF;

  -- The head count must not have grown a phantom host.
  IF position('live_host_presence' in v_src) > 0
     AND v_src ~ 'COUNT\(\*\)\s+INTO\s+v_online\s+FROM\s+public\.live_host_presence' THEN
    RAISE EXCEPTION 'the online count is reading the host presence table';
  END IF;

  RAISE NOTICE 'abandoned live sessions now close themselves after 15 quiet minutes, at no extra request cost';
END $chk$;
