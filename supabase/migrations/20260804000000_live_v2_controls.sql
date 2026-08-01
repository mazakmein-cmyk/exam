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
