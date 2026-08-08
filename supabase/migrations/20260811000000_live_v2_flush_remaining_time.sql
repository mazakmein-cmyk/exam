-- ============================================================
-- LIVE EXAM v2 — A3b: END THE CLOCK NOW ("flush the leftover time")
--
-- A3 gave the creator +30s and +60s. This is the same control pointing the other
-- way, and a live class needs it more often: the room has finished, every hand is
-- down, the answer count stopped moving forty seconds ago, and the only thing
-- still happening is a ring emptying itself in front of thirty bored people.
--
-- WHAT IT IS NOT
-- --------------
-- It is not a new session state, and it does not skip, close, grade or advance
-- anything. It removes the seconds that are left and then gets out of the way:
-- the countdown reaches zero the way it always does, the 2s grace still catches a
-- submission already in flight, the creator's tab still computes analytics after
-- that grace, the reveal still publishes on the deadline, and the unlock button
-- still arms itself when the timer ends. Every downstream flow runs unchanged
-- because from the outside there is nothing to distinguish "the clock ran out"
-- from "the clock was made to run out".
--
-- HOW — negative extra_seconds
-- ----------------------------
-- Every deadline in this system, in SQL and in the client, is the one expression
--
--     visual end = unlocked_at + time_seconds + extra_seconds
--
-- so the only edit that reaches all of them at once is to extra_seconds. A3 makes
-- it larger; this makes it small enough that the visual end lands on now(). No new
-- column, no second definition of "closed", and nothing to keep in step later —
-- which is the whole reason live_question_visual_end exists.
--
-- The column has no non-negative constraint (20260802000000 §1) and every reader
-- of it either adds it into an interval or clamps the window it derives:
-- compute_live_question_analytics already takes GREATEST(window, 1), and
-- submit_live_response's clamp stays positive because time + extra is the elapsed
-- span by construction. So a negative value is arithmetic here, not a sentinel.
--
-- FLOOR, and the LONGEST sibling
-- ------------------------------
-- Two details that look like fussiness and are not:
--
--   FLOOR of the elapsed seconds, never CEIL. extra_seconds is an INTEGER, so the
--   visual end can only land on a whole second — and it must land on or BEFORE
--   now(). Rounding up leaves the room with a straggler second on a clock the
--   creator has already announced as finished.
--
--   live_ordinal_max_seconds, where A3 uses live_ordinal_min_seconds. The two
--   controls bound in opposite directions for the same reason: a bilingual exam
--   can carry different time_seconds per translation, and A3 must not extend past
--   the FASTEST-closing sibling, so this must not stop short of the SLOWEST one.
--   Bound this at the minimum and a 90s translation keeps running after the
--   creator has flushed the 60s one — which is the single thing this control
--   exists to prevent. The cost is that the shorter sibling's deadline lands
--   further in the past than now(), i.e. it loses its grace window; that is the
--   correct trade, because the creator has just declared time up for the room.
--
-- ERROR CONTRACT: ENDTIME_* codes are defined in src/lib/live/liveErrors.ts,
-- which is the authoritative list. A test asserts every RAISE literal here has an
-- entry there.
--
-- Idempotent: safe to re-run. Depends on live_question_visual_end and
-- live_ordinal_min_seconds from 20260804000000, which §3 asserts.
-- ============================================================


-- ============================================================
-- 1. The longest sibling at an ordinal
--
--    The mirror of live_ordinal_min_seconds. Kept as its own function rather than
--    a MIN/MAX flag on that one: they are read in opposite directions by opposite
--    controls, and a boolean argument at the call site reads as "the bound", which
--    is exactly the detail a future edit must not be able to blur.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_ordinal_max_seconds(
  p_live_exam_id UUID,
  p_ordinal INTEGER
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(t.time_seconds)::INTEGER
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

GRANT EXECUTE ON FUNCTION public.live_ordinal_max_seconds(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 2. A3b — drop the remaining time on the open question
--
--    Guard order copied deliberately from add_live_question_time: ownership and
--    status BEFORE anything that describes the question, so a stranger probing
--    this RPC with an arbitrary exam id learns "not the creator" and nothing else.
--
--    FOR UPDATE for the same reason A3 takes it: two control tabs, or a creator
--    clicking twice, must serialise. Without it the second caller reads the
--    pre-flush extra_seconds and recomputes a value from a now-stale baseline.
-- ============================================================
CREATE OR REPLACE FUNCTION public.end_live_question_time(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam        public.live_exams;
  v_max_seconds INTEGER;
  v_visual_end  TIMESTAMPTZ;
  v_elapsed     INTEGER;
  v_new_extra   INTEGER;
  v_result      public.live_exams;
BEGIN
  SELECT * INTO v_exam
  FROM public.live_exams
  WHERE id = p_live_exam_id
  FOR UPDATE;

  IF v_exam.id IS NULL OR v_exam.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'ENDTIME_NOT_CREATOR';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'ENDTIME_NOT_LIVE';
  END IF;
  IF v_exam.current_question_index < 0 OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'ENDTIME_NO_OPEN_QUESTION';
  END IF;

  v_max_seconds := public.live_ordinal_max_seconds(
    p_live_exam_id, v_exam.current_question_index
  );
  IF v_max_seconds IS NULL THEN
    RAISE EXCEPTION 'ENDTIME_NO_OPEN_QUESTION';
  END IF;

  -- Already over for every sibling: there is no time left to remove, and writing
  -- anyway would move a deadline the room has already passed — retracting a
  -- reveal that students can be looking at right now. Refusing is the honest
  -- outcome, and the client's button is hidden in this state anyway, so reaching
  -- here means two tabs raced.
  v_visual_end := public.live_question_visual_end(
    v_exam.current_question_unlocked_at,
    v_max_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() >= v_visual_end THEN
    RAISE EXCEPTION 'ENDTIME_ALREADY_OVER';
  END IF;

  -- Whole seconds since the unlock, rounded DOWN, so the visual end lands on or
  -- just before now() and never up to a second after it.
  v_elapsed := FLOOR(
    extract(epoch from (now() - v_exam.current_question_unlocked_at))
  )::INTEGER;

  -- LEAST, so this can only ever shorten the question. A stored extra_seconds that
  -- was somehow already smaller than the computed one (a second flush landing in
  -- the same second, a hand-edited row) must not be given time back by a control
  -- whose entire promise is to take it away.
  v_new_extra := LEAST(
    COALESCE(v_exam.current_question_extra_seconds, 0),
    v_elapsed - v_max_seconds
  );

  UPDATE public.live_exams
  SET current_question_extra_seconds = v_new_extra
  WHERE id = p_live_exam_id
  RETURNING * INTO v_result;

  -- Same pairing A3 documents: compute_live_question_analytics reads the granted
  -- seconds from the unlock log, not from live_exams, because live_exams only ever
  -- holds the current question's. Miss this write and B6's "fast answer" threshold
  -- keeps measuring against the window the question WOULD have had.
  UPDATE public.live_unlock_log
  SET extra_seconds = v_new_extra
  WHERE live_exam_id = p_live_exam_id
    AND question_ordinal = v_result.current_question_index;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_live_question_time(UUID) TO authenticated;


-- ============================================================
-- 3. Self-check
--
--    The Supabase SQL editor renders result sets, not NOTICE traffic, so a
--    dependency that is missing must RAISE rather than warn.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_src     TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'live_question_visual_end') THEN
    v_missing := v_missing ||
      'live_question_visual_end is missing — apply 20260804000000 (live controls) first'::TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'live_ordinal_min_seconds') THEN
    v_missing := v_missing ||
      'live_ordinal_min_seconds is missing — apply 20260804000000 (live controls) first'::TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'live_ordinal_max_seconds') THEN
    v_missing := v_missing || 'live_ordinal_max_seconds was not created'::TEXT;
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'end_live_question_time' LIMIT 1;
  IF v_src IS NULL THEN
    v_missing := v_missing || 'end_live_question_time was not created'::TEXT;
  ELSE
    -- The bound. Flushing against the shortest sibling leaves the longest one
    -- running, which is the one failure this control cannot have.
    IF v_src NOT LIKE '%live_ordinal_max_seconds%' THEN
      v_missing := v_missing || 'end_live_question_time must bound on the LONGEST sibling'::TEXT;
    END IF;
    IF v_src NOT LIKE '%FLOOR%' THEN
      v_missing := v_missing ||
        'end_live_question_time must round the elapsed seconds DOWN, or it leaves a second on the clock'::TEXT;
    END IF;
    IF v_src NOT LIKE '%FOR UPDATE%' THEN
      v_missing := v_missing || 'end_live_question_time must lock the row it rewrites'::TEXT;
    END IF;
    IF v_src NOT LIKE '%live_unlock_log%' THEN
      v_missing := v_missing ||
        'end_live_question_time must mirror the write to live_unlock_log, which is where the analytics window is read from'::TEXT;
    END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Flush-time migration incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'A3b ready: the creator can now drop the remaining time on an open question.';
END $$;
