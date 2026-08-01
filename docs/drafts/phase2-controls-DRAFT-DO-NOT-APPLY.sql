-- ============================================================
-- LIVE EXAM v2 — PHASE 2: LIVE CONTROLS (A3 add time, A10 undo unlock)
--
-- Two buttons. Both of them break an assumption the rest of the live session
-- was quietly built on, which is why this migration touches six existing
-- functions rather than only adding two.
--
-- THE ASSUMPTION A3 BREAKS: "the countdown reading zero is final."
--
--   Four client sites treat local timer expiry as the end of the question: the
--   control room starts a 2.5s grace then computes analytics, the missed-expiry
--   sweep computes immediately, the answer key auto-reveals, and the student's
--   isLocked goes true. The plan specified the add-time guard as
--   `now() <= live_question_deadline(...)`, but that helper bakes in the +2s
--   grace — so the server would have accepted +30s for two full seconds AFTER
--   every client had latched "expired" and begun the reveal. A question would
--   have been answerable and revealed at the same time.
--
--   Fixed at the root: A3 is refused past the VISUAL end (§3). "The clock reads
--   zero" now means "no more time can be granted" on both sides of the wire, so
--   all four client sites become correct again without changing any of them.
--   Everything else in this file is the consequences of that invariant being
--   enforced rather than assumed:
--
--     §5/§6  an analytics row may not EXIST for a question whose countdown is
--            still running. Publishing the class distribution while the question
--            is open is a functional reveal even though the key itself stays
--            hidden, and it is what locks students out of an extended question.
--     §7     rankings count only SETTLED answers, so a ranking recompute during
--            an extension cannot tell a student through my_total_correct
--            whether they were right — the mask get_my_live_responses exists to
--            enforce was bypassed by that column.
--     §9     the poll lane must stay awake until the visual end, because that is
--            exactly the moment a creator presses +30s and the old cadence slept
--            through it (up to 8s blind on a large room).
--
-- THE ASSUMPTION A10 BREAKS: "current_question_index only ever increases."
--
--   The restore is load-bearing, not cosmetic: get_revealed_live_answers,
--   get_my_live_responses and submit_live_response all re-hide the withdrawn
--   ordinal automatically, but ONLY because unlocked_at is restored from
--   live_unlock_log to a real past timestamp. Inherit a NULL there and the
--   session bricks — the previous question's reveal is retracted from every
--   student and the creator loses the unlock control entirely. So a missing log
--   row is a hard refusal (§4), never a silent NULL.
--
--   A10 is also why A3 must write the log in the same transaction: B6's window
--   reads extra_seconds from live_unlock_log, never from live_exams. A missed
--   log write raises nothing and just produces wrong "fast/slow" numbers, and a
--   later undo would restore the wrong window too.
--
-- MACHINE-PARSEABLE ERROR CONTRACT
--
--   PostgREST turns `RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', 3` into a 400 whose
--   body is {"code":"P0001","message":"UNDO_HAS_RESPONSES:3",...}, and
--   supabase-js exposes that string as error.message. A prefix parse on
--   error.message is therefore sufficient; the count stays in the MESSAGE rather
--   than DETAIL so one parse covers every case. The client must map every code
--   through a lookup with a safe default — a raw Postgres string must never
--   reach a creator who is mid-sentence in front of a room.
--
--   add_live_question_time
--     ADDTIME_NOT_CREATOR          not the creator (or unknown exam)
--     ADDTIME_NOT_LIVE             session is not live
--     ADDTIME_NO_OPEN_QUESTION     index < 0, unlocked_at null, or no such question
--     ADDTIME_BAD_AMOUNT:<n>       p_seconds was not 30 or 60
--     ADDTIME_TOO_LATE             now() is past the VISUAL end — the countdown
--                                  already read zero, so time cannot be granted
--     ADDTIME_CAP:<remaining>      would exceed 300s; <remaining> is how many
--                                  seconds may still be granted (0, 30 or 60)
--
--   undo_last_live_unlock
--     UNDO_NOT_CREATOR             not the creator (or unknown exam)
--     UNDO_NOT_LIVE                session is not live
--     UNDO_NOTHING_TO_UNDO         no question is open
--     UNDO_WINDOW_EXPIRED          more than 5s since the unlock
--     UNDO_HAS_RESPONSES:<n>       n students already answered — say "1 student
--                                  has already answered" for n = 1
--     UNDO_HAS_ANALYTICS           belt and braces; tell the creator the same
--                                  thing as UNDO_WINDOW_EXPIRED, they cannot act
--                                  on the distinction
--     UNDO_NOT_LATEST              this ordinal is not the most recent unlock —
--                                  one undo per unlock, no cascading walk-back
--     UNDO_NO_HISTORY              no unlock log for this ordinal or the previous
--                                  one (a session that was already live when
--                                  Phase 0 shipped). "Undo isn't available for
--                                  this session."
--     UNDO_CONFLICT                the index moved under us. "The session moved
--                                  on — nothing to undo."
--
--   compute_live_question_analytics  (both existing call sites must tolerate
--   these; they are expected, not failures — do not toast them)
--     ANALYTICS_TOO_EARLY:<ms>     the countdown is still running; retry in <ms>
--                                  milliseconds. Only reachable once A3 has moved
--                                  the end — a compute at the unextended visual
--                                  end is still allowed (see §5).
--     ANALYTICS_QUESTION_WITHDRAWN this ordinal is past the session's current
--                                  index, or was undone and not re-unlocked.
--                                  Silent no-op: a second control tab's grace
--                                  timer reaching this is the whole point.
--
--   submit_live_response
--     SUBMIT_QUESTION_WITHDRAWN    A10 took the question back while this answer
--                                  was in flight. Neutral message to the
--                                  student, never a destructive toast — they did
--                                  exactly what the screen invited.
--     The two pre-existing prose messages ('This question is not currently open
--     for answers', 'Time is up for this question') are deliberately unchanged;
--     the client already keys off them.
--
-- No student response is deleted anywhere in this file. Confusion signals are
-- deleted on undo (§4) — a hand-raise about a question being shown is transient
-- and re-raisable by design, unlike an answer of record.
--
-- Idempotent: safe to re-run. Only live_* objects are touched.
-- ============================================================


-- ============================================================
-- 1. The grace constant, named once
--
--    GRACE_SECONDS lived in three places (the deadline helper, the time_taken_ms
--    clamp, and deadline.js on the client). A3 needs to talk about the VISUAL
--    end — the instant the countdown reads zero, which is the deadline minus the
--    grace — so the constant now has a name and the two derived instants are
--    both functions. Nothing re-spells the arithmetic.
--
--    live_question_deadline keeps exactly its previous behaviour
--    (unlocked_at + time + extra + 2); only the way the 2 is spelled changed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_question_grace_seconds()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2;
$$;

COMMENT ON FUNCTION public.live_question_grace_seconds() IS
  'Seconds the server keeps accepting answers after the countdown reaches zero, so a submission already in flight over a slow connection is not thrown away. Mirrored by GRACE_SECONDS in src/lib/live/deadline.js — if one changes, both must.';

CREATE OR REPLACE FUNCTION public.live_question_deadline(
  p_unlocked_at   TIMESTAMPTZ,
  p_time_seconds  INTEGER,
  p_extra_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_unlocked_at
       + make_interval(secs => p_time_seconds
                               + COALESCE(p_extra_seconds, 0)
                               + public.live_question_grace_seconds());
$$;

-- When the countdown reaches zero. Derived FROM the deadline rather than
-- re-spelled, so the two can never drift apart. Mirrors visualEndMs() in
-- src/lib/live/deadline.js.
CREATE OR REPLACE FUNCTION public.live_question_visual_end(
  p_unlocked_at   TIMESTAMPTZ,
  p_time_seconds  INTEGER,
  p_extra_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.live_question_deadline(p_unlocked_at, p_time_seconds, p_extra_seconds)
       - make_interval(secs => public.live_question_grace_seconds());
$$;

GRANT EXECUTE ON FUNCTION public.live_question_grace_seconds()                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.live_question_deadline(TIMESTAMPTZ, INTEGER, INTEGER)   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.live_question_visual_end(TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated, anon;


-- ============================================================
-- 2. live_unlock_log — undo history that survives a re-unlock
--
--    undone_at alone cannot record that an undo happened: the overwhelmingly
--    common sequence is undo-then-re-unlock, and unlock_next_live_question's
--    ON CONFLICT sets undone_at = NULL. So D1's pacing timeline would show one
--    clean unlock and "where the creator backed up" would be unrecoverable.
--
--    These two columns are deliberately absent from that ON CONFLICT SET list,
--    which is what makes them survive. Additive now; unfixable later, because
--    the information only exists at the moment the undo happens.
-- ============================================================
ALTER TABLE public.live_unlock_log
  ADD COLUMN IF NOT EXISTS undo_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_undone_at TIMESTAMPTZ;


-- ============================================================
-- 3. A3 — add_live_question_time
--
--    The guard that matters is ADDTIME_TOO_LATE, and it is measured against the
--    VISUAL end, not the deadline. The plan specified the deadline; that would
--    have left a two-second window in which the server grants time to a question
--    whose countdown has already hit zero on every screen in the room — the
--    control deck has started collecting final answers, the key has
--    auto-revealed, and the students are locked. Refusing at the visual end
--    restores "the countdown reading zero is final" for every consumer at once.
--
--    Two writes, one transaction: live_exams for the deadline everything derives
--    from, and live_unlock_log for B6's window. The second is the silent one —
--    compute_live_question_analytics reads extra_seconds from the LOG and never
--    from live_exams, so a missed log write raises nothing and simply produces
--    wrong fast/slow/impulsive numbers.
--
--    Note the semantics this imports, which are a decision and not an accident:
--    because the window is re-read at compute time, granting time RETROACTIVELY
--    reclassifies answers already given. A wrong answer at 15s on a 60s question
--    is not impulsive (0.2 x 60s = 12s); after +60s it is (0.2 x 120s = 24s).
--    That is the honest reading — the question really did last 120 seconds.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_live_question_time(
  p_live_exam_id UUID,
  p_seconds      INTEGER
)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam         public.live_exams;
  v_time_seconds INTEGER;
  v_visual_end   TIMESTAMPTZ;
  v_new_extra    INTEGER;
  v_result       public.live_exams;
BEGIN
  IF p_seconds IS NULL OR p_seconds NOT IN (30, 60) THEN
    RAISE EXCEPTION 'ADDTIME_BAD_AMOUNT:%', COALESCE(p_seconds::text, 'null');
  END IF;

  -- FOR UPDATE serialises two control tabs (or a double-fire) pressing +60s at
  -- the same instant. Without it both read the same extra_seconds, both pass the
  -- cap against that stale value, and the question lands 60s over the cap.
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'ADDTIME_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'ADDTIME_NOT_LIVE';
  END IF;
  IF v_exam.current_question_index < 0
     OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'ADDTIME_NO_OPEN_QUESTION';
  END IF;

  v_new_extra := COALESCE(v_exam.current_question_extra_seconds, 0) + p_seconds;
  IF v_new_extra > 300 THEN
    -- Report what is still available so the UI can grey the right button rather
    -- than both of them.
    RAISE EXCEPTION 'ADDTIME_CAP:%',
      GREATEST(300 - COALESCE(v_exam.current_question_extra_seconds, 0), 0);
  END IF;

  -- The open question, in the primary language's play order. Every ordinal in
  -- the session is defined against that ordering.
  SELECT t.time_seconds INTO v_time_seconds
  FROM (
    SELECT lq.time_seconds,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_exam.current_question_index;

  IF v_time_seconds IS NULL THEN
    RAISE EXCEPTION 'ADDTIME_NO_OPEN_QUESTION';
  END IF;

  v_visual_end := public.live_question_visual_end(
    v_exam.current_question_unlocked_at,
    v_time_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() > v_visual_end THEN
    RAISE EXCEPTION 'ADDTIME_TOO_LATE';
  END IF;

  -- No "analytics already exist" guard here on purpose. §5 refuses to let an
  -- analytics row appear while now() <= the visual end, and this function refuses
  -- to grant time once now() > the visual end: the two conditions are exact
  -- complements, so "time granted" and "analytics exist" cannot both be true for
  -- the same question. A third error code for an unreachable state is one more
  -- thing for the UI to map and nothing else.

  UPDATE public.live_exams
  SET current_question_extra_seconds = v_new_extra
  WHERE id = p_live_exam_id
  RETURNING * INTO v_result;

  -- Upsert, not update: a session that was already live when Phase 0 shipped has
  -- no log row for its open ordinal, and an UPDATE would silently affect zero
  -- rows. live_exams.current_question_unlocked_at is the authoritative
  -- timestamp, so writing it here also repairs a log row that had drifted.
  INSERT INTO public.live_unlock_log
    (live_exam_id, question_ordinal, unlocked_at, extra_seconds)
  VALUES
    (p_live_exam_id, v_exam.current_question_index,
     v_exam.current_question_unlocked_at, v_new_extra)
  ON CONFLICT (live_exam_id, question_ordinal) DO UPDATE
    SET extra_seconds = EXCLUDED.extra_seconds,
        unlocked_at   = EXCLUDED.unlocked_at;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_live_question_time(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 4. A10 — undo_last_live_unlock
--
--    Takes back an accidental unlock. Never deletes a response; if one exists
--    the undo is refused and the count is reported so the creator is told why.
--
--    The restore is where the correctness lives. Setting the index back is the
--    easy half; unlocked_at and extra_seconds must come from the PREVIOUS log
--    row, because live_exams only ever holds the current one and three functions
--    re-derive the reveal from it:
--      * get_revealed_live_answers keeps Q(N-1) revealed only because the
--        restored timestamp is real and long past;
--      * get_my_live_responses keeps is_correct unmasked for the same reason;
--      * submit_live_response refuses late answers to the reopened Q(N-1).
--    A plpgsql SELECT INTO with no matching row yields NULL with no error, and
--    inheriting that NULL retracts Q(N-1)'s reveal from every student AND leaves
--    the creator with no unlock control at all (hasOpenQuestion goes false, so
--    the primary action falls through to "Syncing with the live session…").
--    Hence UNDO_NO_HISTORY: refuse loudly rather than restore a NULL.
--
--    One undo per unlock. After the first undo the log's highest ordinal is the
--    one just withdrawn, so UNDO_NOT_LATEST stops a second click walking back
--    over a question the class genuinely saw. Re-unlocking clears undone_at and
--    re-arms the button.
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
  v_count         INTEGER := 0;
  v_max_ordinal   INTEGER;
  v_cur_undone    TIMESTAMPTZ;
  v_new_unlocked  TIMESTAMPTZ;
  v_new_extra     INTEGER := 0;
  v_result        public.live_exams;
BEGIN
  -- FOR UPDATE makes two concurrent undos (two control tabs, or a double-click
  -- that outran the client's in-flight ref) deterministic instead of a race that
  -- decrements twice.
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'UNDO_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'UNDO_NOT_LIVE';
  END IF;

  v_index := v_exam.current_question_index;
  IF v_index < 0 OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'UNDO_NOTHING_TO_UNDO';
  END IF;

  -- The 5s window is measured from live_exams, not from the log row: the exam
  -- row is the timestamp every other deadline in the system derives from, which
  -- removes a whole class of bug where the two disagree after a raced re-unlock.
  IF now() > v_exam.current_question_unlocked_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'UNDO_WINDOW_EXPIRED';
  END IF;

  -- Canonical (primary-language) question for the open ordinal. Responses,
  -- confusion signals and analytics all key off this row, so all three guards
  -- below aggregate across translations.
  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_index;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'UNDO_NOTHING_TO_UNDO';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_question_analytics
    WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id
  ) THEN
    RAISE EXCEPTION 'UNDO_HAS_ANALYTICS';
  END IF;

  -- The log row for THIS ordinal is required, not optional: without it we cannot
  -- prove this was the most recent unlock, and we have nowhere to record the
  -- undo for D1.
  SELECT undone_at INTO v_cur_undone
  FROM public.live_unlock_log
  WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNDO_NO_HISTORY';
  END IF;

  SELECT MAX(question_ordinal) INTO v_max_ordinal
  FROM public.live_unlock_log
  WHERE live_exam_id = p_live_exam_id;

  IF v_cur_undone IS NOT NULL OR v_max_ordinal IS DISTINCT FROM v_index THEN
    RAISE EXCEPTION 'UNDO_NOT_LATEST';
  END IF;

  IF v_index = 0 THEN
    -- Back to the lobby. This is the only case where a NULL unlocked_at is
    -- correct, and the only case where the plan's "students return to waiting"
    -- description actually happens.
    v_new_unlocked := NULL;
    v_new_extra    := 0;
  ELSE
    SELECT unlocked_at, COALESCE(extra_seconds, 0)
    INTO v_new_unlocked, v_new_extra
    FROM public.live_unlock_log
    WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index - 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'UNDO_NO_HISTORY';
    END IF;
    -- unlocked_at is NOT NULL on the table, so a found row is always a real
    -- past timestamp. That is what keeps Q(N-1) closed-and-revealed.
  END IF;

  -- The new index comes from the value already read, never from
  -- `current_question_index = current_question_index - 1`: the self-referential
  -- form decrements twice under a double-fire. The WHERE re-asserts what we read
  -- so the loser of any race that skipped the row lock fails cleanly.
  UPDATE public.live_exams
  SET current_question_index         = v_index - 1,
      current_question_unlocked_at   = v_new_unlocked,
      current_question_extra_seconds = v_new_extra
  WHERE id = p_live_exam_id
    AND current_question_index = v_index
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'UNDO_CONFLICT';
  END IF;

  -- Keep unlocked_at and extra_seconds on the withdrawn row (D1's timeline wants
  -- to show the aborted unlock) and never delete it — unlock_next_live_question's
  -- ON CONFLICT path is what makes re-unlocking the same ordinal legal.
  UPDATE public.live_unlock_log
  SET undone_at      = now(),
      last_undone_at = now(),
      undo_count     = undo_count + 1
  WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_index;

  -- Confusion signals for the withdrawn question go. This is not a response: it
  -- is a transient hand-raise about a question being shown, and it is
  -- re-raisable by design. Left in place, the PK (live_question_id, user_id)
  -- would silently swallow the student's second, genuine signal on the re-asked
  -- question, strand their button on "Sent", and mix two showings into one count
  -- that the creator is shown exactly ("1 student flagged confusion").
  DELETE FROM public.live_confusion_signals
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

  -- Re-check, in a new statement and therefore a new snapshot. A submission
  -- whose snapshot predates our UPDATE sees the question open, passes every
  -- guard in submit_live_response and inserts; the count above could not see it.
  -- Anything that committed while we worked is visible now, and raising here
  -- rolls the whole undo back so the student's answer wins. See the note in §8
  -- for the other half of this, and for why neither side takes a shared lock on
  -- the submit path.
  SELECT COUNT(*) INTO v_count
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'UNDO_HAS_RESPONSES:%', v_count;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_last_live_unlock(UUID) TO authenticated;


-- ============================================================
-- 5. When an analytics row is ALLOWED TO EXIST
--
--    This is the sixth deadline-dependent site, and before this migration it had
--    no time gate anywhere. live_question_analytics is readable by every student
--    of any live exam ("Anyone can view analytics of live exams") and the table
--    is in the realtime publication, so a row written mid-question is pushed to
--    the whole room. On the student page the mere EXISTENCE of that row sets
--    isLocked: options disable, the submit bar unmounts, the per-option class
--    percentages render and the verdict strip appears. The key itself stays
--    hidden (get_revealed_live_answers re-checks the moved deadline correctly),
--    but publishing the distribution and correct_count while the question is
--    answerable is a functional reveal.
--
--    Enforced at WRITE time rather than in RLS, deliberately. Expressing the
--    gate as a read policy means a correlated window function evaluated per row
--    per subscriber on the hot realtime path; enforcing it once per write costs
--    one query per question and makes the invariant true for every reader,
--    including realtime, for free. The rule is: the row may not appear while the
--    question's countdown is still running.
--
--    THE BOUNDARY IS THE VISUAL END, NOT THE DEADLINE, and that is a judgement
--    call worth stating. The entire client reveals at the visual end — "Time's
--    up, grading the class" is the intended behaviour when the countdown reads
--    zero — while the answer KEY stays gated on the deadline in
--    get_revealed_live_answers, so the key still trails the distribution by the
--    grace exactly as it does today. Gating this at the deadline instead would
--    refuse the control room's own missed-expiry sweep for two seconds at every
--    single question, turning a rare edge case into a per-question error loop,
--    and would buy only the 2s grace window. Residual, stated plainly: for those
--    2 seconds the distribution is public while submit_live_response still
--    accepts, so a student driving devtools could read the split and then answer.
--    Closing that would mean refusing a submission once analytics exist, which
--    throws away the honest in-flight answer the grace exists to protect.
--
--    Returns NULL when the write is allowed, otherwise the error code. One
--    definition, two callers: the RPC (§6) and the trigger below, which is what
--    stops a second control tab's grace timer — or a creator with devtools —
--    reaching the table by another route.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_analytics_block_reason(
  p_live_exam_id     UUID,
  p_live_question_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam        public.live_exams;
  v_lang        TEXT;
  v_time_secs   INTEGER;
  v_ordinal     INTEGER;
  v_undone      TIMESTAMPTZ;
  v_visual_end  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RETURN NULL;                    -- unknown exam: an FK problem, not a timing one
  END IF;
  IF v_exam.status = 'ended' THEN
    RETURN NULL;                    -- everything is closed; end_live_session backfills here
  END IF;

  SELECT ls.language, lq.time_seconds INTO v_lang, v_time_secs
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE lq.id = p_live_question_id AND ls.live_exam_id = p_live_exam_id;
  IF v_lang IS NULL THEN
    RETURN NULL;                    -- not this exam's question; nothing to protect
  END IF;

  -- Ordinal within the question's OWN language partition, matching
  -- get_revealed_live_answers: every translation of a question shares an ordinal.
  SELECT t.ordinal INTO v_ordinal
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_lang
  ) t
  WHERE t.id = p_live_question_id;

  IF v_ordinal IS NULL THEN
    RETURN NULL;
  END IF;

  -- Past the session's current position: either never asked, or withdrawn by
  -- A10. Same rule end_live_session's backfill loop already applies to itself.
  IF v_ordinal > v_exam.current_question_index THEN
    RETURN 'ANALYTICS_QUESTION_WITHDRAWN';
  END IF;

  -- Belt and braces for the same case: a re-unlock clears undone_at, so a row
  -- still carrying it was withdrawn and not re-asked.
  SELECT undone_at INTO v_undone
  FROM public.live_unlock_log
  WHERE live_exam_id = p_live_exam_id AND question_ordinal = v_ordinal;
  IF v_undone IS NOT NULL THEN
    RETURN 'ANALYTICS_QUESTION_WITHDRAWN';
  END IF;

  IF v_ordinal = v_exam.current_question_index
     AND v_exam.current_question_unlocked_at IS NOT NULL THEN
    v_visual_end := public.live_question_visual_end(
      v_exam.current_question_unlocked_at,
      v_time_secs,
      v_exam.current_question_extra_seconds
    );
    -- The VISUAL end, and `<=` so the boundary is the exact complement of A3's:
    -- add_live_question_time accepts while now() <= visual end, this refuses
    -- while now() <= visual end. An analytics row can therefore only exist once
    -- no more time can be granted, which is the whole invariant.
    IF now() <= v_visual_end THEN
      RETURN 'ANALYTICS_TOO_EARLY:'
             || GREATEST(CEIL(extract(epoch from (v_visual_end - now())) * 1000), 0)::bigint::text;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Owner-only. Nothing outside the two SECURITY DEFINER callers needs it, and a
-- smaller surface is one less thing to reason about. Both revokes are needed:
-- new functions in this project inherit the implicit PUBLIC execute grant (see
-- the note at 20260729020000:492), and Supabase's default privileges may also
-- name the two client roles directly.
REVOKE EXECUTE ON FUNCTION public.live_analytics_block_reason(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.live_analytics_block_reason(UUID, UUID) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.live_analytics_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT;
BEGIN
  -- An existing row's question was validated when the row appeared. Re-checking
  -- on every UPDATE would break Phase 1's re-mask trigger, which rewrites
  -- fastest_user_name on rows of a live exam and must never be refused.
  IF TG_OP = 'UPDATE'
     AND NEW.live_question_id IS NOT DISTINCT FROM OLD.live_question_id THEN
    RETURN NEW;
  END IF;

  v_reason := public.live_analytics_block_reason(NEW.live_exam_id, NEW.live_question_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_analytics_guard ON public.live_question_analytics;
CREATE TRIGGER trg_live_analytics_guard
  BEFORE INSERT OR UPDATE ON public.live_question_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.live_analytics_guard();


-- ============================================================
-- 6. compute_live_question_analytics — gated, and honest about the window
--
--    Three changes over the Phase 1 definition; the privacy masking is verbatim.
--
--    a. The §5 gate, so no caller can publish a distribution for a question whose
--       countdown is still running or which has been withdrawn. Both call sites on
--       the control page must treat these two codes as expected rather than as
--       failures (see the contract in the header): the grace-window compute of an
--       extended question, and a second control tab's grace timer after an undo,
--       are supposed to be refused.
--    b. The ordinal comes from the question's own position in the play order.
--       It used to come from an arbitrary response row, so a question that got
--       +60s and zero answers was measured with the un-extended window.
--    c. extra_seconds still comes from live_unlock_log, but falls back to
--       live_exams when the log has no row for the ordinal AND that ordinal is
--       the one currently open. That removes the silent-wrong-numbers failure
--       mode for sessions that predate the log.
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
  v_exam               public.live_exams;
  v_block              TEXT;
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
  -- B6
  v_lang               TEXT;
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
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;
  v_privacy := COALESCE(v_exam.privacy_mode, false);

  v_block := public.live_analytics_block_reason(p_live_exam_id, p_live_question_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION '%', v_block;
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

  -- The name written here is read by students through realtime, so under privacy
  -- mode it must already be the pseudonym. Same join-order ordinal the public
  -- view uses, so the two always agree.
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

  -- ─── B6: time profile ───────────────────────────────────────

  SELECT ls.language, lq.time_seconds INTO v_lang, v_time_seconds
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE lq.id = p_live_question_id AND ls.live_exam_id = p_live_exam_id;
  v_time_seconds := COALESCE(v_time_seconds, 0);

  -- From the play order, not from a response row: a question that was extended
  -- and answered by nobody still has to be measured against its real window.
  IF v_lang IS NOT NULL THEN
    SELECT t.ordinal INTO v_ordinal
    FROM (
      SELECT lq.id,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_lang
    ) t
    WHERE t.id = p_live_question_id;
  END IF;

  -- The log is the record of what actually happened, so it wins. The fallback
  -- covers an ordinal unlocked before live_unlock_log existed: for the currently
  -- open question live_exams still knows the answer, and for an older one there
  -- is nothing to recover and 0 is the truth we have.
  IF v_ordinal IS NOT NULL THEN
    SELECT COALESCE(ul.extra_seconds, 0) INTO v_extra_seconds
    FROM public.live_unlock_log ul
    WHERE ul.live_exam_id = p_live_exam_id AND ul.question_ordinal = v_ordinal;
    IF NOT FOUND THEN
      IF v_ordinal = v_exam.current_question_index THEN
        v_extra_seconds := COALESCE(v_exam.current_question_extra_seconds, 0);
      ELSE
        v_extra_seconds := 0;
      END IF;
    END IF;
  END IF;
  v_extra_seconds := COALESCE(v_extra_seconds, 0);

  -- A DURATION, not a deadline: the visual span the student was shown. The +2s
  -- grace is excluded on purpose — "fast" must be measured against the clock the
  -- room actually saw. The consequence is that an answer accepted inside the
  -- grace exceeds this window and lands in the last histogram bucket, which is
  -- exactly where an answer given at the last possible instant belongs.
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

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;


-- ============================================================
-- 7. compute_live_rankings — only SETTLED answers count
--
--    get_my_live_responses masks is_correct until a question closes, precisely so
--    a second account cannot probe correctness mid-question. live_session_sync
--    then hands out my_total_correct straight off live_participants, which
--    compute_live_rankings had aggregated from EVERY response including the open
--    one, with no deadline condition. Before A3 that was unreachable (rankings
--    only ran after the deadline had passed); the +30s button makes it reachable,
--    and a recompute during an extension would tell every student whether they
--    were right while the rest of the room still had half a minute.
--
--    Fixed here rather than in live_session_sync, because the stored aggregate is
--    read by the leaderboard, the present screen and D1 as well. The predicate is
--    the same one get_revealed_live_answers and get_my_live_responses use: ended,
--    or a past ordinal, or the current ordinal once its deadline has passed.
--
--    It also drops responses whose ordinal is AHEAD of the session — the residual
--    race in §8 — so a withdrawn answer cannot inflate a score, and it removes
--    the separate "zero out participants with no responses" pass: a LEFT JOIN
--    with COUNT does that in the same statement, and now also correctly zeroes a
--    participant whose only answers have become unsettled.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_rankings(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.live_exams;
BEGIN
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();

  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  WITH settled AS (
    SELECT lr.user_id, lr.is_correct, lr.time_taken_ms
    FROM public.live_responses lr
    WHERE lr.live_exam_id = p_live_exam_id
      AND (
        v_exam.status = 'ended'
        OR lr.question_ordinal < v_exam.current_question_index
        OR (
          lr.question_ordinal = v_exam.current_question_index
          AND v_exam.current_question_unlocked_at IS NOT NULL
          AND now() >= public.live_question_deadline(
                v_exam.current_question_unlocked_at,
                (SELECT lq.time_seconds FROM public.live_questions lq
                  WHERE lq.id = lr.live_question_id),
                v_exam.current_question_extra_seconds
              )
        )
      )
  ),
  agg AS (
    SELECT
      lp.id,
      COUNT(s.user_id)                                                   AS total_count,
      COUNT(*) FILTER (WHERE s.is_correct = true)                        AS correct_count,
      COALESCE(SUM(s.time_taken_ms) FILTER (WHERE s.is_correct = true), 0) AS total_time
    FROM public.live_participants lp
    LEFT JOIN settled s ON s.user_id = lp.user_id
    WHERE lp.live_exam_id = p_live_exam_id
    GROUP BY lp.id
  )
  UPDATE public.live_participants lp
  SET total_correct  = agg.correct_count,
      total_answered = agg.total_count,
      total_time_ms  = agg.total_time
  FROM agg
  WHERE lp.id = agg.id;

  -- More correct wins; ties broken by less time spent on correct answers, then
  -- by who joined first.
  UPDATE public.live_participants lp
  SET rank = sub.new_rank
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             ORDER BY total_correct DESC, total_time_ms ASC, joined_at ASC
           ) AS new_rank
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id
  ) sub
  WHERE lp.id = sub.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_rankings(UUID) TO authenticated;


-- ============================================================
-- 8. submit_live_response — the clamp derives from the helper, and a
--    withdrawn question rejects
--
--    Two changes; every guard is otherwise identical.
--
--    a. time_taken_ms's ceiling was the last hand-written copy of the deadline
--       arithmetic in SQL (`time + extra + 2`, spelled out). It now comes from
--       live_question_deadline, so the grace constant has exactly one home.
--    b. A10 can withdraw this question while a submission is in flight. Our
--       snapshot still shows it open, so every guard passes and the row inserts:
--       ON CONFLICT DO NOTHING then means the student can NEVER answer the
--       re-asked question, and their answer to a question they saw for four
--       seconds stands. Re-reading the index after the insert catches everything
--       that committed while we worked and rolls our insert back.
--
--       Only a BACKWARD move is fatal. A normal unlock racing a late-but-honest
--       submission must still be accepted — that is what the grace window is
--       for — so the test is `index < our ordinal`, not `index <> our ordinal`.
--
--    Deliberately NOT done: `FOR SHARE` on this read. It would close the race
--    completely, but it puts a shared row lock on live_exams on the hottest path
--    in the system, once per submission per student, and Phase 0 exists because
--    per-student costs are the ones that fail at 1000. The two re-checks (here
--    and in §4) narrow the window to a single statement, and §7 makes any
--    survivor score-neutral while it is withdrawn. If that residual is ever
--    judged unacceptable, add FOR SHARE here and FOR UPDATE is already in §4.
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
  v_now_index      INTEGER;
  v_result         public.live_responses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_selected_answer IS NULL OR jsonb_typeof(p_selected_answer) = 'null' THEN
    RAISE EXCEPTION 'No answer provided';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
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

  -- Ordinal of the submitted question within its own language's play order
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

  -- Canonical (primary-language) question row for cross-language aggregation
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

  -- Clamp to the same window the deadline uses, so an answer accepted inside an
  -- extended question can never record a time beyond that question's span.
  v_window_ms := (extract(epoch from (v_deadline - v_exam.current_question_unlocked_at)) * 1000)::integer;
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

  -- New statement, new snapshot: did A10 take this question back underneath us?
  SELECT current_question_index INTO v_now_index
  FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_now_index < v_ordinal THEN
    RAISE EXCEPTION 'SUBMIT_QUESTION_WITHDRAWN';
  END IF;

  -- First submission is final: return whatever row now exists.
  SELECT * INTO v_result
  FROM public.live_responses
  WHERE live_question_id = v_canonical_id AND user_id = v_uid;

  -- Don't leak correctness while the question can still be answered.
  v_result.is_correct := NULL;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_live_response(UUID, UUID, JSONB) TO authenticated;


-- ============================================================
-- 9. live_session_sync — the poll lane must be awake at the visual end
--
--    Only the cadence block changes. Its previous justification was
--    "nothing that matters can change in the tail: A3 is refused past the
--    deadline and A10 past 5s" — which was exactly backwards for A3, because A3
--    is legal right UP TO the end and the tail began before it. The branch
--    collapsed to "sleep until after the question closes" as soon as
--    (ms_to_deadline + 1500) < open_ms, i.e. from 1.5s before the visual end on
--    a small room and 4.5s before it on a room of 600+. For those seconds a
--    poll-lane student's countdown read zero, isLocked was true and the submit
--    bar was gone, while the server was still accepting — and "most of the room
--    is still reading, give them 30s" is precisely when the creator presses the
--    button. The free-tier students Lane B exists for were the ones who got the
--    broken experience.
--
--    Now the shortcut applies only inside the GRACE window, which is genuinely
--    safe once A3 refuses past the visual end (§3). Cost is at most one extra
--    round trip per question per client.
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

  -- Heartbeat. Creators are never counted as present: they are not in the
  -- room in the sense A8 cares about, and counting them would inflate the
  -- response-rate denominator by one.
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

  -- ─── Is a question open, and for how much longer? ───────────
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
      -- now() is transaction-stable, so these two are measured from the same
      -- instant and differ by exactly the grace.
      v_ms_to_visual := (extract(epoch from (
        public.live_question_visual_end(
          v_exam.current_question_unlocked_at, v_time_seconds,
          v_exam.current_question_extra_seconds
        ) - now()
      )) * 1000)::bigint;
      v_open := v_ms_to_deadline > 0;
    END IF;
  END IF;

  -- ─── Cadence, scaled by how many people are actually in the room ───
  v_wait_ms := CASE WHEN v_online > 600 THEN 4000 WHEN v_online > 200 THEN 2500 ELSE 1500 END;
  v_open_ms := CASE WHEN v_online > 600 THEN 8000 WHEN v_online > 200 THEN 6000 ELSE 5000 END;

  IF v_exam.status IN ('ended', 'draft') THEN
    v_next_ms := 0;                                  -- stop polling
  ELSIF v_open THEN
    IF v_ms_to_visual > 0 THEN
      -- A3 can grant time right up to the visual end, so never sleep past it.
      v_next_ms := GREATEST(750, LEAST(v_open_ms, v_ms_to_visual::integer));
    ELSE
      -- Inside the grace: the countdown already reads zero, A3 is refused and
      -- A10's 5s is long gone, so nothing that matters can change. Wake once
      -- shortly after the question closes and grading begins.
      v_next_ms := GREATEST(750, (v_ms_to_deadline + 1500)::integer);
    END IF;
  ELSE
    v_next_ms := v_wait_ms;                          -- lobby / between questions
  END IF;

  -- ─── Caller-specific extras ───────────────────────────────
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
    -- Safe to hand out unmasked because §7 keeps the currently-answerable
    -- question out of these aggregates entirely. Reading them straight off the
    -- row used to defeat get_my_live_responses' is_correct mask the moment a
    -- ranking recompute ran during an A3 extension.
    SELECT rank, total_correct INTO v_my_rank, v_my_correct
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid;
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
    'confusion_count',                v_confusion,
    'open_response_count',            v_open_responses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_sync(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 10. Session state is RPC-only
--
--     "Creator can manage own live exams" is FOR ALL, so it grants UPDATE on
--     every column of live_exams — including the three that define the deadline.
--     updateLiveExam narrows that to a settings whitelist in TypeScript only.
--     Which means A3's 300s cap, its 30/60 restriction, the visual-end guard and
--     the paired live_unlock_log write are all RPC convention rather than rules:
--     a creator with devtools can set extra_seconds = 3600, desync it from the
--     log, and silently corrupt B6's window for that question.
--
--     Low severity — it is self-harm on their own exam — but if the cap is worth
--     writing it is worth enforcing. Every live_* session-control RPC is SECURITY
--     DEFINER and therefore runs as the table owner, so keying on current_user
--     cannot lock the RPCs out; it only closes the direct-PostgREST door.
--
--     Scoped with UPDATE OF plus a WHEN clause, like Phase 1's privacy trigger,
--     so it costs nothing on the settings writes that happen mid-session.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_exams_guard_session_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Deliberately NOT SECURITY DEFINER: this needs the caller's effective role,
  -- and a DEFINER trigger would report the owner for everybody and pass always.
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'SESSION_STATE_IS_RPC_ONLY';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_exams_guard_session_state ON public.live_exams;
CREATE TRIGGER trg_live_exams_guard_session_state
  BEFORE UPDATE OF current_question_index,
                   current_question_unlocked_at,
                   current_question_extra_seconds
  ON public.live_exams
  FOR EACH ROW
  WHEN (NEW.current_question_index         IS DISTINCT FROM OLD.current_question_index
     OR NEW.current_question_unlocked_at   IS DISTINCT FROM OLD.current_question_unlocked_at
     OR NEW.current_question_extra_seconds IS DISTINCT FROM OLD.current_question_extra_seconds)
  EXECUTE FUNCTION public.live_exams_guard_session_state();


-- ============================================================
-- 11. Repair: no analytics row may already exist for a running question
--
--     §5 stops new ones appearing; a session that is live at the moment this
--     migration runs may already be holding one, and that row is exactly what
--     locks a whole class out of a question. Deleting it is safe and
--     self-healing: the creator's grace-window compute, or end_live_session's
--     backfill, writes it again once the question is genuinely closed. No student
--     response is touched.
--
--     Restricted to status = 'live' on purpose. An 'ended' exam is never blocked
--     by §5 anyway, and a draft/published exam has no legitimate analytics — if
--     one somehow has them they are historical, and this migration is not the
--     place to decide they should be destroyed.
-- ============================================================
DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH doomed AS (
    SELECT a.live_exam_id, a.live_question_id
    FROM public.live_question_analytics a
    JOIN public.live_exams le ON le.id = a.live_exam_id
    WHERE le.status = 'live'
      AND public.live_analytics_block_reason(a.live_exam_id, a.live_question_id) IS NOT NULL
  )
  DELETE FROM public.live_question_analytics a
  USING doomed d
  WHERE a.live_exam_id = d.live_exam_id
    AND a.live_question_id = d.live_question_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 0 THEN
    RAISE NOTICE 'live_v2_controls: removed % premature analytics row(s) for questions whose countdown was still running', v_deleted;
  END IF;
END $$;
