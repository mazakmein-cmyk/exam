-- ============================================================================
-- LIVE EXAM v2 — EVERYTHING STILL TO APPLY, IN ORDER
--
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Order is load-bearing: the moments and report migrations redefine functions
-- that the controls migration establishes. Running them out of order would leave
-- an older definition in place with no error to tell you.
--
-- Every statement is idempotent, so re-running this file is safe.
--
-- Already applied earlier and NOT repeated here:
--   20260802000000  foundations
--   20260803000000  privacy step 1
--   20260803010000  privacy step 2
--   20260803020000  privacy re-mask trigger
--   20260803030000  security hardening
--
-- After this, run supabase/tests/verify_phase2.sql — 36 checks.
-- ============================================================================




-- ##########################################################################
-- HOTFIX — students cannot rejoin (RUN THIS FIRST)
-- source: supabase/migrations/20260803040000_live_v2_fix_participant_self_select.sql
-- ##########################################################################

-- ============================================================
-- HOTFIX — students cannot join: "new row violates row-level security
-- policy for table live_participants"
--
-- Cause
-- -----
-- 20260803010000 (privacy step 2) dropped "Participants can view leaderboard",
-- which was the ONLY SELECT policy students had on live_participants. That was
-- correct for its stated purpose — the leaderboard now goes through
-- live_participants_public, which masks names — but it also removed SELECT from a
-- path nobody checked.
--
-- joinLiveExam runs:
--
--   .upsert({...}, { onConflict: "live_exam_id,user_id" }).select().single()
--
-- INSERT ... ON CONFLICT DO UPDATE needs to READ the conflicting row to decide
-- whether to update it, and PostgreSQL applies SELECT policies to that read. With
-- no SELECT policy the statement is refused, and the error surfaces as a
-- row-level-security violation on the insert. The trailing .select() would fail
-- for the same reason.
--
-- So every returning student — anyone whose participant row already existed —
-- could no longer rejoin. A first-time join inserted cleanly; a reload did not.
--
-- Fix
-- ---
-- Give a student SELECT on their OWN row and nothing else. That is strictly
-- narrower than what was dropped: the old policy exposed every participant of any
-- live exam, which is what made privacy mode cosmetic. This exposes one row to the
-- person it describes.
--
-- The leaderboard is unaffected and still goes through live_participants_public.
--
-- Lesson recorded in the code: dropping a policy is a change to every statement
-- that touches the table, not only to the query you had in mind. An upsert reads.
--
-- Idempotent: safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Users can view own participant record" ON public.live_participants;
CREATE POLICY "Users can view own participant record"
  ON public.live_participants FOR SELECT
  USING (auth.uid() = user_id);

-- Sanity check: the two policies this path also depends on must still exist. If a
-- future migration removes either, joining breaks again in a way that looks like
-- this one and is easy to misdiagnose.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_participants'
      AND policyname = 'Authenticated users can join live exams'
  ) THEN
    RAISE WARNING 'live_participants has no INSERT policy — students cannot join at all.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_participants'
      AND policyname = 'Users can update own participant record'
  ) THEN
    RAISE WARNING 'live_participants has no UPDATE policy — the upsert conflict path will fail.';
  END IF;
END $$;


-- ##########################################################################
-- PHASE 2 — A3 add time, A10 undo unlock
-- source: supabase/migrations/20260804000000_live_v2_controls.sql
-- ##########################################################################

-- ============================================================
-- LIVE EXAM v2 — PHASE 2: A3 "ADD TIME" AND A10 "UNDO UNLOCK"
--
-- Two live controls, and the four corrections an adversarial review of the first
-- attempt at this file forced.
--
-- CORRECTION 1 — the guard belongs at the VISUAL end, not the deadline.
--   The plan specified `now() <= live_question_deadline(...)`. That helper bakes
--   in the 2s grace, so the server would have accepted +30s for two seconds AFTER
--   every client had already latched "expired" and begun revealing the answer.
--   Four client sites assume "the countdown reading zero is final"; moving the
--   guard earlier makes the server agree with them instead of fighting them.
--   `live_question_visual_end` is now the primitive and the deadline is derived
--   from it, so the grace constant exists once.
--
-- CORRECTION 2 — a restored timestamp being in the past does not mean closed.
--   The plan assumed undo could restore Q(N-1) safely because its unlock time is
--   necessarily past. But nothing requires Q(N-1) to have EXPIRED before the
--   creator moved on: two unlocks inside one question's span leave Q(N-1) still
--   running, and undoing then reopens a question whose answer key the reveal RPC
--   has not yet published — or worse, has. Undo now proves the restored question
--   is genuinely closed and refuses otherwise.
--
-- CORRECTION 3 — per-language timers.
--   Reveal, submit and the analytics window all use each question's OWN
--   time_seconds. Reading only the primary language would let a bilingual exam
--   with differing timers extend past a sibling's close. Add-time guards against
--   the SHORTEST sibling at that ordinal.
--
-- CORRECTION 4 — locking.
--   `submit_live_response` read live_exams with no lock, so a submission whose
--   snapshot predated an undo still passed every guard and inserted, leaving an
--   ungradeable response on a withdrawn question. `unlock_next_live_question` had
--   the same hole in the other direction: an unguarded read-then-increment can
--   skip a whole question. Both are fixed here, with FOR SHARE on the hot path so
--   submissions never serialise against each other.
--
-- ERROR CONTRACT: codes are defined in src/lib/live/liveErrors.ts, which is the
-- authoritative list — a SQL comment cannot be imported by the client, and a
-- test asserts every RAISE literal here has an entry there.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. The grace constant, once — and the visual end as the primitive
--
--    Before: `+ 2` was spelled out in live_question_deadline, again in
--    submit_live_response's time clamp, and again in the client. Three copies of
--    a number whose whole purpose is that everyone agrees on it.
--
--    The visual end is now the primitive because it is the honest boundary: it is
--    what the student's countdown reaches, and therefore what "out of time" means
--    to every human involved. The deadline is that plus a grace the UI never
--    shows, which exists only so an answer already in flight over a slow
--    connection is not thrown away.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_question_grace_seconds()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 2; $$;

CREATE OR REPLACE FUNCTION public.live_question_visual_end(
  p_unlocked_at   TIMESTAMPTZ,
  p_time_seconds  INTEGER,
  p_extra_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_unlocked_at
       + make_interval(secs => COALESCE(p_time_seconds, 0) + COALESCE(p_extra_seconds, 0));
$$;

-- Redefined to derive from the visual end. Byte-identical results to the Phase 0
-- version; the point is that the grace now has exactly one home.
CREATE OR REPLACE FUNCTION public.live_question_deadline(
  p_unlocked_at   TIMESTAMPTZ,
  p_time_seconds  INTEGER,
  p_extra_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.live_question_visual_end(p_unlocked_at, p_time_seconds, p_extra_seconds)
       + make_interval(secs => public.live_question_grace_seconds());
$$;

GRANT EXECUTE ON FUNCTION public.live_question_grace_seconds() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.live_question_visual_end(TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.live_question_deadline(TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated, anon;


-- ============================================================
-- 2. The shortest sibling at an ordinal
--
--    A bilingual exam can carry different time_seconds per translation. Reveal,
--    submit and the analytics window each use the question the caller is actually
--    looking at, so the only safe bound for a whole-session control is the
--    shortest one: extend past that and the fastest-closing language has already
--    published its answer.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_ordinal_min_seconds(
  p_live_exam_id UUID,
  p_ordinal INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MIN(t.time_seconds)::INTEGER
  FROM (
    SELECT
      lq.time_seconds,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ) t
  WHERE t.ordinal = p_ordinal;
$$;

GRANT EXECUTE ON FUNCTION public.live_ordinal_min_seconds(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 3. live_unlock_log — survive a re-unlock
--
--    The log exists for A10's restore AND D1's pacing timeline, but the PK is
--    (exam, ordinal) and a re-unlock upserts over the row, wiping undone_at. So
--    the moment a creator undid a question and asked it again, the fact that an
--    undo ever happened was gone — the timeline could never show it.
--
--    A counter survives the upsert where a timestamp cannot.
-- ============================================================
ALTER TABLE public.live_unlock_log
  ADD COLUMN IF NOT EXISTS undo_count INTEGER NOT NULL DEFAULT 0;


-- ============================================================
-- 4. A3 — grant more time
--
--    Guard order matters and is deliberate: ownership and status BEFORE the
--    amount check, so a stranger probing this RPC with an arbitrary exam id
--    learns "not the creator" rather than "bad amount". The first attempt at this
--    file validated the amount first, which answered a stranger differently
--    depending on the number they sent.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_live_question_time(
  p_live_exam_id UUID,
  p_seconds INTEGER
)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam        public.live_exams;
  v_min_seconds INTEGER;
  v_visual_end  TIMESTAMPTZ;
  v_new_extra   INTEGER;
  v_result      public.live_exams;
BEGIN
  -- FOR UPDATE: two rapid clicks, or a second control tab, must serialise. The
  -- 300s cap is only a cap if the read and the write cannot interleave.
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR UPDATE;

  IF v_exam.id IS NULL OR v_exam.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'ADDTIME_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'ADDTIME_NOT_LIVE';
  END IF;
  IF v_exam.current_question_index < 0 OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'ADDTIME_NO_OPEN_QUESTION';
  END IF;
  IF p_seconds IS NULL OR p_seconds NOT IN (30, 60) THEN
    RAISE EXCEPTION 'ADDTIME_BAD_AMOUNT';
  END IF;

  v_min_seconds := public.live_ordinal_min_seconds(
    p_live_exam_id, v_exam.current_question_index
  );
  IF v_min_seconds IS NULL THEN
    RAISE EXCEPTION 'ADDTIME_NO_OPEN_QUESTION';
  END IF;

  -- The VISUAL end, not the deadline. Past this instant every client has already
  -- shown zero and begun the reveal, so re-opening the question would contradict
  -- what the room has been told — and on the student side the answer may already
  -- be on screen.
  v_visual_end := public.live_question_visual_end(
    v_exam.current_question_unlocked_at,
    v_min_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() > v_visual_end THEN
    RAISE EXCEPTION 'ADDTIME_TOO_LATE';
  END IF;

  v_new_extra := COALESCE(v_exam.current_question_extra_seconds, 0) + p_seconds;
  IF v_new_extra > 300 THEN
    RAISE EXCEPTION 'ADDTIME_CAP_REACHED:%', v_new_extra - p_seconds;
  END IF;

  UPDATE public.live_exams
  SET current_question_extra_seconds = v_new_extra
  WHERE id = p_live_exam_id
  RETURNING * INTO v_result;

  -- Kept in step deliberately: compute_live_question_analytics reads the granted
  -- seconds from HERE, not from live_exams, because live_exams only ever holds
  -- the current question's. Miss this write and B6's "fast" threshold silently
  -- uses the wrong window for every extended question.
  UPDATE public.live_unlock_log
  SET extra_seconds = v_new_extra
  WHERE live_exam_id = p_live_exam_id
    AND question_ordinal = v_result.current_question_index;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_live_question_time(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 5. A10 — take back an unlock
--
--    Never deletes a response. If anyone has answered, the unlock stands: an
--    answer already given is evidence about a student, and discarding it to tidy
--    up a creator's misclick is the wrong trade.
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_last_live_unlock(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam          public.live_exams;
  v_index         INTEGER;
  v_canonical_id  UUID;
  v_responses     INTEGER;
  v_prev_unlocked TIMESTAMPTZ;
  v_prev_extra    INTEGER;
  v_prev_seconds  INTEGER;
  v_result        public.live_exams;
BEGIN
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR UPDATE;

  IF v_exam.id IS NULL OR v_exam.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'UNDO_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'UNDO_NOT_LIVE';
  END IF;

  v_index := v_exam.current_question_index;
  IF v_index < 0 OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'UNDO_NOTHING_TO_UNDO';
  END IF;

  -- Five seconds. Long enough to catch a fat-fingered space bar, short enough
  -- that nobody has read the question yet.
  IF now() > v_exam.current_question_unlocked_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'UNDO_WINDOW_EXPIRED';
  END IF;

  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_index;

  -- Anyone answered? The FOR UPDATE above is what makes this count trustworthy:
  -- submit_live_response takes FOR SHARE on the same row (section 7), so any
  -- submission that began before us has committed by the time we get here, and
  -- any that begins after us sees the rewound index and is refused.
  IF v_canonical_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_responses
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

    IF v_responses > 0 THEN
      RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', v_responses;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.live_question_analytics
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id
    ) THEN
      RAISE EXCEPTION 'UNDO_ALREADY_GRADED';
    END IF;
  END IF;

  -- ─── Restore the previous question ────────────────────────
  IF v_index = 0 THEN
    v_prev_unlocked := NULL;
    v_prev_extra := 0;
  ELSE
    SELECT unlocked_at, extra_seconds INTO v_prev_unlocked, v_prev_extra
    FROM public.live_unlock_log
    WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index - 1;

    -- No log row means this session predates the log (or it was pruned). Restoring
    -- NULL would brick the session: no unlock control, and the previous question's
    -- reveal retracted from every student. Refusing is the honest outcome.
    IF v_prev_unlocked IS NULL THEN
      RAISE EXCEPTION 'UNDO_NO_HISTORY';
    END IF;

    -- CORRECTION 2. A past unlock time does not mean a closed question. Nothing
    -- forces the creator to wait for Q(N-1) to expire before moving on, so undoing
    -- a fast double-unlock would drop the room back into a question that is still
    -- running — and whose answer the reveal RPC may already have published.
    v_prev_seconds := public.live_ordinal_min_seconds(p_live_exam_id, v_index - 1);
    IF v_prev_seconds IS NOT NULL
       AND now() < public.live_question_deadline(v_prev_unlocked, v_prev_seconds, v_prev_extra) THEN
      RAISE EXCEPTION 'UNDO_PREV_STILL_OPEN';
    END IF;
  END IF;

  UPDATE public.live_exams
  SET current_question_index = v_index - 1,
      current_question_unlocked_at = v_prev_unlocked,
      current_question_extra_seconds = COALESCE(v_prev_extra, 0)
  WHERE id = p_live_exam_id
    -- Optimistic guard. Two control tabs cannot both undo the same unlock: the
    -- loser finds the index already moved and affects zero rows.
    AND current_question_index = v_index
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'UNDO_CONFLICT';
  END IF;

  -- The row is retained rather than deleted, so MAX(question_ordinal) still shows
  -- N and a second undo is refused. undo_count survives the re-unlock upsert that
  -- clears undone_at, which is how D1's timeline can still say this happened.
  UPDATE public.live_unlock_log
  SET undone_at = now(),
      undo_count = undo_count + 1
  WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index;

  -- LAST, deliberately. This is the only destructive statement in the function,
  -- and every guard that could abort the transaction has now passed. Confusion
  -- signals must go because their PK would silently swallow a re-raised signal
  -- when the question is asked again, leaving the student stuck on "Sent" and the
  -- creator's count short.
  IF v_canonical_id IS NOT NULL THEN
    DELETE FROM public.live_confusion_signals
    WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_live_unlock(UUID) TO authenticated;


-- ============================================================
-- 6. unlock_next_live_question — lock the row it increments
--
--    It read live_exams unlocked and then wrote index + 1 from the value it had
--    read. Two tabs, a double-fired space bar, or a retry could therefore both
--    read N and both write N+1 — or worse, interleave and skip a question in
--    front of the class. A10 raises the stakes: an undo racing an unlock could
--    leave the index and the log disagreeing about which question is current.
-- ============================================================
CREATE OR REPLACE FUNCTION public.unlock_next_live_question(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam           public.live_exams;
  v_question_count INTEGER;
  v_result         public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR UPDATE;

  IF v_exam.id IS NULL OR v_exam.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'Exam is not live';
  END IF;

  SELECT COUNT(*) INTO v_question_count
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language;

  IF v_exam.current_question_index + 1 >= v_question_count THEN
    RAISE EXCEPTION 'No more questions to unlock';
  END IF;

  UPDATE public.live_exams
  SET current_question_index = v_exam.current_question_index + 1,
      current_question_unlocked_at = now(),
      current_question_extra_seconds = 0
  WHERE id = p_live_exam_id
    AND current_question_index = v_exam.current_question_index
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'UNLOCK_CONFLICT';
  END IF;

  INSERT INTO public.live_unlock_log (live_exam_id, question_ordinal, unlocked_at, extra_seconds)
  VALUES (p_live_exam_id, v_result.current_question_index, v_result.current_question_unlocked_at, 0)
  ON CONFLICT (live_exam_id, question_ordinal) DO UPDATE
    SET unlocked_at   = EXCLUDED.unlocked_at,
        extra_seconds = 0,
        undone_at     = NULL;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_next_live_question(UUID) TO authenticated;


-- ============================================================
-- 7. submit_live_response — take a share lock, and honour the visual end
--
--    FOR SHARE, not FOR UPDATE: share locks are compatible with each other, so a
--    thousand simultaneous submissions still do not queue behind one another.
--    They only block against A3 and A10, which is exactly the point — an undo
--    must not be able to count zero responses while a submission is mid-flight.
--
--    The accept window still runs to the full deadline (visual end + grace): a
--    student whose answer left their device before the clock hit zero should not
--    lose it to their own latency. What changed is that the clamp now derives
--    from the helper instead of re-spelling `+ extra + 2`.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_live_response(
  p_live_exam_id UUID,
  p_live_question_id UUID,
  p_selected_answer JSONB
)
RETURNS public.live_responses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_exam           public.live_exams;
  v_question       public.live_questions;
  v_lang           TEXT;
  v_ordinal        INTEGER;
  v_canonical_id   UUID;
  v_is_correct     BOOLEAN;
  v_time_taken_ms  INTEGER;
  v_deadline       TIMESTAMPTZ;
  v_window_ms      INTEGER;
  v_result         public.live_responses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_selected_answer IS NULL OR jsonb_typeof(p_selected_answer) = 'null' THEN
    RAISE EXCEPTION 'No answer provided';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR SHARE;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Live exam not found';
  END IF;
  IF v_exam.status <> 'live' OR v_exam.current_question_index < 0
     OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'No question is currently open for answers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Join the exam before submitting answers';
  END IF;

  SELECT lq.* INTO v_question
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE lq.id = p_live_question_id AND ls.live_exam_id = p_live_exam_id;
  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'Question does not belong to this exam';
  END IF;

  SELECT ls.language INTO v_lang
  FROM public.live_sections ls
  WHERE ls.id = v_question.live_section_id;

  SELECT t.ordinal INTO v_ordinal
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_lang
  ) t
  WHERE t.id = p_live_question_id;

  IF v_ordinal IS DISTINCT FROM v_exam.current_question_index THEN
    RAISE EXCEPTION 'This question is not currently open for answers';
  END IF;

  v_deadline := public.live_question_deadline(
    v_exam.current_question_unlocked_at,
    v_question.time_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() > v_deadline THEN
    RAISE EXCEPTION 'Time is up for this question';
  END IF;

  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_ordinal;
  IF v_canonical_id IS NULL THEN
    v_canonical_id := p_live_question_id;
  END IF;

  v_is_correct := public.grade_live_answer(v_question.correct_answer, p_selected_answer);

  -- Derived, not re-spelled: this was the last hand-written copy of the deadline
  -- arithmetic in SQL, and its window disagreed with B6's.
  v_window_ms := GREATEST(
    (extract(epoch from (v_deadline - v_exam.current_question_unlocked_at)) * 1000)::integer,
    1
  );
  v_time_taken_ms := LEAST(
    GREATEST((extract(epoch from (now() - v_exam.current_question_unlocked_at)) * 1000)::integer, 0),
    v_window_ms
  );

  INSERT INTO public.live_responses (
    live_exam_id, live_question_id, user_id, selected_answer,
    is_correct, time_taken_ms, submitted_at, question_ordinal
  ) VALUES (
    p_live_exam_id, v_canonical_id, v_uid, p_selected_answer,
    v_is_correct, v_time_taken_ms, now(), v_ordinal
  )
  ON CONFLICT (live_question_id, user_id) DO NOTHING;

  SELECT * INTO v_result
  FROM public.live_responses
  WHERE live_question_id = v_canonical_id AND user_id = v_uid;

  v_result.is_correct := NULL;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_live_response(UUID, UUID, JSONB) TO authenticated;


-- ============================================================
-- 8. live_session_sync — wake BEFORE the visual end, not after the deadline
--
--    The Phase 0 cadence slept from visualEnd-1.5s to visualEnd+3.5s, justified
--    in its own comment by "nothing that matters can change in the tail: A3 is
--    refused past the deadline". A3 is legal right up TO the visual end, so that
--    window was precisely the one where a poll-lane student needed to hear about
--    an extension and could not. They watched a dead clock while the room worked.
--
--    Now the wake lands just before the visual end. If time was granted, they
--    learn immediately; if it was not, the same poll carries the close.
--
--    §3 of 20260803030000 (the score_visible gate) is preserved verbatim below —
--    an earlier draft of this file silently dropped it and would have reopened the
--    mid-question correctness leak.
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


-- ##########################################################################
-- PHASE 4 — B14 moments and celebration
-- source: supabase/migrations/20260805000000_live_v2_moments.sql
-- ##########################################################################

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


-- ##########################################################################
-- PHASE 5 — C7 drag reorder
-- source: supabase/migrations/20260806000000_live_v2_authoring.sql
-- ##########################################################################

-- ============================================================
-- LIVE EXAM v2 — PHASE 5: AUTHORING (C7) AND SCHEDULING (C10)
--
-- C10's columns already exist (scheduled_start_at, auto_start, added in Phase 0),
-- so scheduling is entirely client work. This migration is C7.
--
-- Why reordering needs a server function at all
-- ---------------------------------------------
-- Play order is `global_index`, and renumbering it was a client-side loop issuing
-- one UPDATE per question (renumberLiveGlobalIndexes in liveExamService). A
-- 200-question bilingual exam is up to 400 sequential round trips, and — worse —
-- a failure halfway leaves the exam in an order that matches neither the old one
-- nor the new. Play order IS the exam; a half-applied reorder is corruption.
--
-- The multi-language trap
-- ----------------------
-- Sibling translations are linked by question_group_id, and every ordinal RPC
-- resolves a question by ROW_NUMBER() over (global_index, q_no, id) WITHIN a
-- language. So moving the English Q4 without moving the Hindi Q4 does not produce
-- a visibly wrong list — it produces two languages whose ordinal 3 is a different
-- question, and every downstream thing keyed on ordinal (responses, analytics,
-- confusion signals, moments) quietly attaches to the wrong one.
--
-- This function therefore moves the whole group or nothing.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- reorder_live_section_questions
--
--    Rewrites q_no within one section from an explicit ordered list, propagates
--    the same order to every language sibling, and renumbers global_index across
--    the whole exam — all inside the one transaction a plpgsql function gives us.
--
--    Editor-only by contract: the caller must not offer this while a session is
--    live, because current_question_index points at a POSITION, and shuffling
--    underneath it changes which question "number 7" means mid-flight. Enforced
--    here as well as in the UI, because "the UI does not offer it" is not a
--    guarantee.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reorder_live_section_questions(
  p_section_id UUID,
  p_ordered_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id     UUID;
  v_status      TEXT;
  v_expected    INTEGER;
  v_provided    INTEGER;
  v_lang        TEXT;
  v_group_order UUID[];
BEGIN
  SELECT le.id, le.status
  INTO v_exam_id, v_status
  FROM public.live_sections ls
  JOIN public.live_exams le ON le.id = ls.live_exam_id
  WHERE ls.id = p_section_id AND le.user_id = auth.uid();

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'REORDER_NOT_CREATOR';
  END IF;

  -- current_question_index is a position, so reordering during a session would
  -- silently redefine which question is on screen.
  IF v_status IN ('live', 'ended') THEN
    RAISE EXCEPTION 'REORDER_SESSION_ACTIVE';
  END IF;

  -- The provided list must be exactly this section's questions: no additions, no
  -- omissions, no duplicates. Anything else and the renumber below would leave
  -- gaps or collisions in q_no.
  SELECT COUNT(*) INTO v_expected
  FROM public.live_questions WHERE live_section_id = p_section_id;

  SELECT COUNT(DISTINCT id) INTO v_provided
  FROM unnest(p_ordered_ids) AS id
  WHERE id IN (SELECT lq.id FROM public.live_questions lq WHERE lq.live_section_id = p_section_id);

  IF v_provided <> v_expected OR array_length(p_ordered_ids, 1) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'REORDER_SET_MISMATCH:%', v_expected;
  END IF;

  -- ─── 1. This section ──────────────────────────────────────
  -- Two passes via a large offset: q_no has no unique constraint today, but
  -- writing 1..n directly over an existing 1..n is the kind of thing that starts
  -- failing the day someone adds one.
  UPDATE public.live_questions lq
  SET q_no = ord.rn + 100000
  FROM (SELECT id, ROW_NUMBER() OVER () AS rn FROM unnest(p_ordered_ids) AS id) ord
  WHERE lq.id = ord.id;

  UPDATE public.live_questions
  SET q_no = q_no - 100000
  WHERE live_section_id = p_section_id AND q_no > 100000;

  -- ─── 2. Every language sibling ────────────────────────────
  -- The new order expressed as group ids, then applied to the matching section in
  -- each other language. A question with no group id is unlinked and is left
  -- alone: it exists in one language only.
  SELECT array_agg(lq.question_group_id ORDER BY lq.q_no)
  INTO v_group_order
  FROM public.live_questions lq
  WHERE lq.live_section_id = p_section_id
    AND lq.question_group_id IS NOT NULL;

  IF v_group_order IS NOT NULL AND array_length(v_group_order, 1) > 0 THEN
    FOR v_lang IN
      SELECT DISTINCT ls.language
      FROM public.live_sections ls
      WHERE ls.live_exam_id = v_exam_id
        AND ls.id <> p_section_id
        AND ls.section_group_id = (
          SELECT section_group_id FROM public.live_sections WHERE id = p_section_id
        )
    LOOP
      UPDATE public.live_questions lq
      SET q_no = ord.rn + 100000
      FROM (
        SELECT g AS group_id, ROW_NUMBER() OVER () AS rn
        FROM unnest(v_group_order) AS g
      ) ord
      WHERE lq.question_group_id::text = ord.group_id::text
        AND lq.live_section_id IN (
          SELECT ls2.id FROM public.live_sections ls2
          WHERE ls2.live_exam_id = v_exam_id AND ls2.language = v_lang
            AND ls2.section_group_id = (
              SELECT section_group_id FROM public.live_sections WHERE id = p_section_id
            )
        );

      UPDATE public.live_questions lq
      SET q_no = lq.q_no - 100000
      WHERE lq.q_no > 100000
        AND lq.live_section_id IN (
          SELECT ls2.id FROM public.live_sections ls2
          WHERE ls2.live_exam_id = v_exam_id AND ls2.language = v_lang
        );
    END LOOP;
  END IF;

  -- ─── 3. Renumber play order across the exam ───────────────
  PERFORM public.renumber_live_global_indexes(v_exam_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_live_section_questions(UUID, UUID[]) TO authenticated;


-- ============================================================
-- renumber_live_global_indexes — the client loop, moved server-side
--
--    Walks each language's sections in sort_order and its questions in q_no,
--    assigning a dense 0-based global_index. Every language is walked with the
--    same section-group order, so sibling questions keep matching indexes and the
--    per-language ordinal computations continue to agree.
--
--    Replaces a browser loop that issued one UPDATE per question.
-- ============================================================
CREATE OR REPLACE FUNCTION public.renumber_live_global_indexes(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'REORDER_NOT_CREATOR';
  END IF;

  UPDATE public.live_questions lq
  SET global_index = t.new_index
  FROM (
    SELECT
      q.id,
      (ROW_NUMBER() OVER (
        PARTITION BY s.language
        ORDER BY s.sort_order, s.id, q.q_no, q.id
      ) - 1)::INTEGER AS new_index
    FROM public.live_questions q
    JOIN public.live_sections s ON s.id = q.live_section_id
    WHERE s.live_exam_id = p_live_exam_id
  ) t
  WHERE lq.id = t.id
    AND lq.global_index IS DISTINCT FROM t.new_index;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renumber_live_global_indexes(UUID) TO authenticated;


-- ##########################################################################
-- PHASE 6 — D1 session report
-- source: supabase/migrations/20260807000000_live_v2_report.sql
-- ##########################################################################

-- ============================================================
-- LIVE EXAM v2 — PHASE 6: D1, THE SESSION REPORT
--
-- Pressing End used to compute final rankings and then offer a button back to the
-- editor. Every insight from the session stayed scattered across per-question
-- rows that nobody assembles by hand at 3:40pm on a Friday.
--
-- A live quiz with no report is entertainment. A live quiz that ends with "here
-- are the three things to reteach" is a teaching tool.
--
-- Two design decisions worth stating
-- ----------------------------------
-- COMPUTED ONCE, AT END. The payload is built and stored when the session ends,
-- so the public link never runs a query — it reads one row. A shareable URL that
-- executed aggregates on every hit would be a denial-of-service surface pointed
-- at a free-tier database.
--
-- NAMES ARE RESOLVED AT READ TIME, NOT BAKED IN. The payload stores user_ids. If
-- it stored names, toggling privacy mode after the fact would leave a report full
-- of real ones — which is exactly the bug that produced the fastest_user_name leak
-- in Phase 1, and exactly why that phase needed a re-mask trigger. Storing ids and
-- masking on read means the report follows the setting, forever, with no trigger.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Storage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_exam_reports (
  live_exam_id UUID PRIMARY KEY REFERENCES public.live_exams(id) ON DELETE CASCADE,
  payload      JSONB       NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_exam_reports ENABLE ROW LEVEL SECURITY;

-- No student policy at all. The payload carries user_ids and per-student detail;
-- both read paths below are SECURITY DEFINER and mask on the way out.
DROP POLICY IF EXISTS "Creator can read own reports" ON public.live_exam_reports;
CREATE POLICY "Creator can read own reports"
  ON public.live_exam_reports FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));


-- ============================================================
-- 2. build_live_exam_report — the aggregate, run once
--
--    Everything here is already computed and sitting in a row somewhere; this
--    assembles it. The value is not new numbers, it is the numbers finally in one
--    place, ordered by what a creator should do on Monday.
-- ============================================================
CREATE OR REPLACE FUNCTION public.build_live_exam_report(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam     public.live_exams;
  v_payload  JSONB;
  v_questions JSONB;
  v_pacing   JSONB;
  v_moments  JSONB;
  v_attend   JSONB;
  v_totals   JSONB;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ─── Headline ─────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_responses', COALESCE(SUM(a.total_responses), 0),
    'total_correct',   COALESCE(SUM(a.correct_count), 0),
    'accuracy_pct',    CASE
                         WHEN COALESCE(SUM(a.total_responses), 0) > 0
                         THEN ROUND(100.0 * SUM(a.correct_count) / SUM(a.total_responses))
                         ELSE NULL
                       END,
    'questions_asked', COUNT(*),
    'confusion_total', COALESCE(SUM(a.confusion_count), 0)
  )
  INTO v_totals
  FROM public.live_question_analytics a
  WHERE a.live_exam_id = p_live_exam_id;

  -- ─── Per question, hardest first ──────────────────────────
  -- Ordered by accuracy ascending so "what do I reteach" is the top of the list
  -- rather than something to scroll for.
  SELECT COALESCE(jsonb_agg(q ORDER BY q.accuracy_pct NULLS LAST, q.ordinal), '[]')
  INTO v_questions
  FROM (
    SELECT
      lr.question_ordinal AS ordinal,
      lq.text,
      lq.options,
      lq.correct_answer,
      lq.answer_type,
      a.total_responses,
      a.correct_count,
      a.wrong_count,
      a.skipped_count,
      a.option_distribution,
      a.median_time_ms,
      a.fast_correct, a.slow_correct, a.fast_wrong, a.slow_wrong,
      a.impulsive_wrong,
      a.confusion_count,
      CASE WHEN a.total_responses > 0
           THEN ROUND(100.0 * a.correct_count / a.total_responses)
           ELSE NULL END AS accuracy_pct
    FROM public.live_question_analytics a
    JOIN public.live_questions lq ON lq.id = a.live_question_id
    LEFT JOIN LATERAL (
      SELECT DISTINCT r.question_ordinal
      FROM public.live_responses r
      WHERE r.live_exam_id = a.live_exam_id AND r.live_question_id = a.live_question_id
      LIMIT 1
    ) lr ON TRUE
    WHERE a.live_exam_id = p_live_exam_id
  ) q;

  -- ─── Pacing, from the unlock log ──────────────────────────
  -- Real per-question durations including where time was granted and where an
  -- unlock was taken back. This is the only place that history exists.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal',       ul.question_ordinal,
    'unlocked_at',   ul.unlocked_at,
    'extra_seconds', ul.extra_seconds,
    'undo_count',    ul.undo_count
  ) ORDER BY ul.question_ordinal), '[]')
  INTO v_pacing
  FROM public.live_unlock_log ul
  WHERE ul.live_exam_id = p_live_exam_id AND ul.undone_at IS NULL;

  -- ─── Moments: ids only, resolved on read ──────────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ordinal',  lm.question_ordinal,
    'kind',     lm.kind,
    'user_id',  lm.user_id,
    'value',    lm.value,
    'priority', lm.priority
  ) ORDER BY lm.question_ordinal, lm.priority), '[]')
  INTO v_moments
  FROM public.live_moments lm
  WHERE lm.live_exam_id = p_live_exam_id;

  -- ─── Attendance: ids only, resolved on read ───────────────
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',        lp.user_id,
    'joined_at',      lp.joined_at,
    'total_correct',  lp.total_correct,
    'total_answered', lp.total_answered,
    'rank',           lp.rank,
    -- Join order, so a masked name can be derived identically to everywhere else.
    'anon_ordinal',   (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)
  ) ORDER BY lp.rank NULLS LAST, lp.joined_at)
  , '[]')
  INTO v_attend
  FROM public.live_participants lp
  WHERE lp.live_exam_id = p_live_exam_id;

  v_payload := jsonb_build_object(
    'exam_name',    v_exam.name,
    'started_at',   v_exam.started_at,
    'ended_at',     v_exam.ended_at,
    'origin_exam_id', v_exam.origin_exam_id,
    'totals',       COALESCE(v_totals, '{}'::jsonb),
    'questions',    v_questions,
    'pacing',       v_pacing,
    'moments',      v_moments,
    'attendance',   v_attend
  );

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_live_exam_report(UUID) TO authenticated;


-- ============================================================
-- 3. Read paths — both mask names from the CURRENT privacy setting
--
--    The stored payload has ids; these put names on them. That is what makes a
--    privacy toggle apply retroactively to a report that was computed months ago,
--    with no trigger and no re-mask pass.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_report_with_names(
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
  v_names JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(t.user_id::text, t.name), '{}')
  INTO v_names
  FROM (
    SELECT
      lp.user_id,
      CASE
        WHEN p_reveal_real_names THEN lp.display_name
        ELSE public.live_anon_name(
          (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)::INTEGER
        )
      END AS name
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id
  ) t;

  RETURN p_payload || jsonb_build_object('names', v_names);
END;
$$;

-- Creator: real names unless they have privacy on, in which case even their own
-- report shows pseudonyms in the SHAREABLE view. The creator's own view passes
-- reveal=true, which is the one screen allowed to show them.
CREATE OR REPLACE FUNCTION public.get_live_exam_report(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'REPORT_NOT_CREATOR';
  END IF;

  SELECT payload INTO v_payload
  FROM public.live_exam_reports WHERE live_exam_id = p_live_exam_id;

  IF v_payload IS NULL THEN
    -- Not yet computed (an old session, or End was pressed before this shipped).
    -- Build it on demand rather than showing the creator an empty page.
    v_payload := public.build_live_exam_report(p_live_exam_id);
    IF v_payload IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO public.live_exam_reports (live_exam_id, payload)
    VALUES (p_live_exam_id, v_payload)
    ON CONFLICT (live_exam_id) DO UPDATE SET payload = EXCLUDED.payload, computed_at = now();
  END IF;

  RETURN public.live_report_with_names(p_live_exam_id, v_payload, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report(UUID) TO authenticated;

-- Public link. No auth, a long random token, and it must be switched on.
-- Always masked per privacy_mode, because "shareable" means it can end up in a
-- staff group chat and from there anywhere.
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

  -- Real names only when privacy mode is OFF. The setting is read now, not at
  -- compute time, so turning it on retroactively masks an already-shared link.
  RETURN public.live_report_with_names(v_exam.id, v_payload, NOT v_exam.privacy_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report_by_token(TEXT) TO authenticated, anon;


-- ============================================================
-- 4. enable_live_report_sharing — mint the token on demand
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_live_report_sharing(
  p_live_exam_id UUID,
  p_enabled BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT report_share_token INTO v_token
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPORT_NOT_CREATOR';
  END IF;

  -- Minted once and kept, so turning sharing off and on again does not silently
  -- break a link the creator already sent.
  IF p_enabled AND v_token IS NULL THEN
    v_token := encode(gen_random_bytes(18), 'hex');
  END IF;

  UPDATE public.live_exams
  SET report_public = p_enabled,
      report_share_token = v_token
  WHERE id = p_live_exam_id;

  RETURN CASE WHEN p_enabled THEN v_token ELSE NULL END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_live_report_sharing(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 5. Build the report when the session ends
--
--    Appended to end_live_session so the creator lands on a finished page rather
--    than a spinner. Non-fatal for the same reason moments are: a report is
--    valuable, and it is not worth failing the end of a session over.
-- ============================================================
CREATE OR REPLACE FUNCTION public.end_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.live_exams;
  v_qid UUID;
BEGIN
  UPDATE public.live_exams
  SET status = 'ended',
      ended_at = now()
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'live'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot end: not the creator or exam is not live';
  END IF;

  -- Safety net: compute analytics for any unlocked primary-language question
  -- that never got them (e.g. the creator's tab was closed at timer expiry).
  -- NOTE: status is flipped to 'ended' ABOVE, before this loop, and the analytics
  -- guard depends on that ordering. Do not reorder.
  FOR v_qid IN
    SELECT t.id
    FROM (
      SELECT lq.id,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_result.primary_language
    ) t
    WHERE t.ordinal <= v_result.current_question_index
      AND NOT EXISTS (
        SELECT 1 FROM public.live_question_analytics a
        WHERE a.live_exam_id = p_live_exam_id AND a.live_question_id = t.id
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
$$;

GRANT EXECUTE ON FUNCTION public.end_live_session(UUID) TO authenticated;
