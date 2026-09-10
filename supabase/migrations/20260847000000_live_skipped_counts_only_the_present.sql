-- ============================================================
-- LIVE EXAMS: "skipped" counts only people who were in the room
--
-- WHAT IS BROKEN
-- compute_live_question_analytics measures a question's skip rate as
--
--     skipped = (everyone who ever joined) - (people who answered THIS question)
--
-- with no bound on WHEN anyone joined. Being on the attendee list at all is
-- taken as having been present for every question of the paper.
--
-- Usually invisible, because a question's analytics are computed the moment its
-- timer ends and the attendee list at that instant holds only people who had
-- already arrived. It bites when a question's numbers are computed LATE: the
-- backfill inside end_live_session fills in every unlocked question that never
-- got analytics, using the FINAL head count. That path is the normal one for a
-- session whose host closed their tab — and it is EVERY question of a session
-- that auto-closes under 20260845000000.
--
-- The result is early questions looking more ignored than they were, in the one
-- number a teacher uses to decide what to reteach.
--
-- Notably the student's own screen already gets this right: it remembers which
-- question was open when they joined and labels anything earlier "Missed"
-- rather than "Skipped". This moves the same rule to the server.
--
-- HOW
-- Stamp the play position at join, next to the joined_at that is already
-- server-stamped, then count only participants whose join position was at or
-- before the question being measured.
--
-- Rows written before this migration have no stamp. They are counted as present
-- throughout, which is exactly today's behaviour — so no past report silently
-- changes its numbers. Only sessions from here on get the accurate count.
--
--
-- ============================================================
-- AND A DEFECT IN 20260845000000, FIXED HERE
-- ============================================================
-- The auto-end added by that migration cannot work as shipped, and this is the
-- only place that can fix it, because the fix is in this same function.
--
-- end_live_session_system backfills analytics for unlocked questions that never
-- got them. It calls compute_live_question_analytics, whose first act is:
--
--     SELECT privacy_mode INTO v_privacy FROM live_exams
--     WHERE id = p_live_exam_id AND user_id = auth.uid();
--     IF v_privacy IS NULL THEN RAISE EXCEPTION 'Access denied: not the exam creator';
--
-- On the auto-end path the caller is a STUDENT whose poll noticed the host had
-- gone. SECURITY DEFINER changes the ROLE, not auth.uid() — that reads a
-- request GUC and still returns the student. So the backfill raises, the
-- exception escapes end_live_session_system and live_session_sync, and the
-- whole transaction rolls back: the session does NOT end, and every student's
-- poll errors instead, over and over, for as long as the tab is open.
--
-- Worse, it is guaranteed to be reached. Analytics are computed from exactly
-- one place, the creator's control room, so a session whose host has gone
-- ALWAYS has at least one unlocked question with no analytics — which is
-- precisely the condition the backfill loop looks for.
--
-- The repair is the same shape as end_live_session/end_live_session_system: the
-- work moves into a core function with no ownership test, and the caller-facing
-- function keeps the test and delegates. Nothing about who may call what
-- changes — the core is revoked from every browser-reachable role.
-- ============================================================

ALTER TABLE public.live_participants
  ADD COLUMN IF NOT EXISTS joined_at_question_index INTEGER;

COMMENT ON COLUMN public.live_participants.joined_at_question_index IS
  'Play position of the question that was open when this person joined (-1 = before the first unlock). Server-stamped, like joined_at. NULL on rows written before 20260847000000, which are counted as present throughout so historical analytics do not change.';


-- ── Stamp it at join ───────────────────────────────────────────────────────
-- Body copied from 20260823010000; one assignment added, in the same INSERT
-- branch and for the same reason the join TIME is stamped there: a client that
-- could choose its own join position could exempt itself from every skip count.
CREATE OR REPLACE FUNCTION public.protect_live_participant_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_creator BOOLEAN;
BEGIN
  -- Identity columns are immutable on UPDATE — a student can't relocate their
  -- row into another exam (which would also dodge the creator check below).
  IF TG_OP = 'UPDATE' THEN
    NEW.live_exam_id := OLD.live_exam_id;
    NEW.user_id      := OLD.user_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = NEW.live_exam_id AND user_id = auth.uid()
  ) INTO v_is_creator;

  IF NOT v_is_creator THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.total_correct  := OLD.total_correct;
      NEW.total_answered := OLD.total_answered;
      NEW.total_time_ms  := OLD.total_time_ms;
      NEW.rank           := OLD.rank;
      NEW.joined_at      := OLD.joined_at;
      -- Immutable after the fact, like joined_at: re-joining a session must not
      -- move you forward past the questions you already missed.
      NEW.joined_at_question_index := OLD.joined_at_question_index;
    ELSE
      NEW.total_correct  := 0;
      NEW.total_answered := 0;
      NEW.total_time_ms  := 0;
      NEW.rank           := NULL;
      -- Join time is a ranking tiebreaker and an ordinal key, so it is the
      -- server's to decide — never the joining client's.
      NEW.joined_at      := now();
      -- NEW: where the room had got to. -1 before the first unlock, which is
      -- what a published-but-unstarted exam sits at, so an early joiner is
      -- correctly counted as present for question 0.
      SELECT le.current_question_index INTO NEW.joined_at_question_index
      FROM public.live_exams le
      WHERE le.id = NEW.live_exam_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;


-- ── The analytics core: same body, no ownership test, honest skip count ────
-- Body copied from 20260834000000. Three changes, all marked inline.
CREATE OR REPLACE FUNCTION public.compute_live_question_analytics_core(
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
  v_fastest_pid        UUID;
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
  v_play_ordinal       INTEGER;
BEGIN
  -- CHANGE 1 of 3. No ownership test here; compute_live_question_analytics
  -- below keeps it and delegates. Lifting it out is what lets the auto-end in
  -- 20260845000000 backfill analytics from a STUDENT's poll — auth.uid() reads
  -- a request GUC, so SECURITY DEFINER does not make the caller the creator,
  -- and the old test raised there and rolled the whole ending back.
  -- privacy_mode is still read, because it decides what this row may name.
  SELECT privacy_mode INTO v_privacy
  FROM public.live_exams
  WHERE id = p_live_exam_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Live exam not found';
  END IF;
  v_privacy := COALESCE(v_privacy, false);

  -- CHANGE 2 of 3. Where this question sits in the play order. From the primary
  -- question list rather than from a response row: a question nobody answered
  -- has no responses, and that is exactly the question whose skip count matters.
  SELECT p.ordinal INTO v_play_ordinal
  FROM public.live_primary_questions(p_live_exam_id) p
  WHERE p.id = p_live_question_id;

  -- CHANGE 3 of 3. Only people who were in the room when this question was
  -- asked. Previously every attendee counted for every question, so anyone who
  -- walked in late was recorded as having skipped everything before they
  -- arrived — in the one number a teacher uses to decide what to reteach.
  --
  -- COALESCE(..., -1) keeps rows written before this migration counted as
  -- present throughout, which is precisely today's behaviour: no past report
  -- silently changes its numbers.
  --
  -- A NULL ordinal (question not in the primary list — it should not happen)
  -- also falls back to counting everyone. On uncertainty, keep the old answer
  -- rather than invent a new one.
  SELECT COUNT(*) INTO v_total_participants
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id
    AND (
      v_play_ordinal IS NULL
      OR COALESCE(joined_at_question_index, -1) <= v_play_ordinal
    );

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
    -- The participant ROW id is what the row carries from now on. It joins to
    -- nothing a student can read (live_participants has no student policy),
    -- while the creator's deck already holds a participant map to resolve it.
    SELECT lp.id INTO v_fastest_pid
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id AND lp.user_id = v_fastest_uid;

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
    fastest_time_ms, fastest_user_id, fastest_participant_id, fastest_user_name,
    computed_at,
    median_time_ms, fast_correct, slow_correct, fast_wrong, slow_wrong,
    impulsive_wrong, time_histogram, confusion_count
  ) VALUES (
    p_live_exam_id, p_live_question_id, v_total_responses, v_correct_count,
    v_wrong_count, v_skipped_count, v_option_dist, v_avg_time_correct,
    -- fastest_user_id is written NULL forever: this row is broadcast whole to
    -- every student over realtime, and a real auth UUID beside a pseudonym is
    -- the leak privacy mode existed to prevent.
    v_fastest_time, NULL, v_fastest_pid, v_fastest_name,
    now(),
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
    fastest_user_id     = NULL,
    fastest_participant_id = EXCLUDED.fastest_participant_id,
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

REVOKE EXECUTE ON FUNCTION public.compute_live_question_analytics_core(UUID, UUID)
  FROM PUBLIC, anon, authenticated;


-- ── The caller-facing function: unchanged signature, unchanged rules ───────
-- Same name, same arguments, same return type, same exception text, same grant.
-- Only the ownership test lives here now; the work is in the core.
CREATE OR REPLACE FUNCTION public.compute_live_question_analytics(
  p_live_exam_id UUID,
  p_live_question_id UUID
)
RETURNS public.live_question_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  RETURN public.compute_live_question_analytics_core(p_live_exam_id, p_live_question_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;


-- ── The ending, now able to backfill on the auto-end path ─────────────────
-- Body identical to 20260845000000 except for the one PERFORM, which targets
-- the core. Without this the auto-end raises 'Access denied: not the exam
-- creator' on the student poll that triggers it, rolls the whole transaction
-- back, and re-raises on every poll thereafter.
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
  -- and fall straight out.
  UPDATE public.live_exams
  SET status = 'ended',
      ended_at = now()
  WHERE id = p_live_exam_id
    AND status = 'live'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RETURN v_result;
  END IF;

  -- Safety net: compute analytics for any unlocked primary-language question
  -- that never got them. This is not a rare path — analytics are computed from
  -- exactly one place, the creator's control room, so a session whose host has
  -- gone ALWAYS has at least one question waiting here.
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
    -- _core, not the caller-facing function: on the auto-end path the caller is
    -- a student, and the ownership test would raise and roll back the ending.
    PERFORM public.compute_live_question_analytics_core(p_live_exam_id, v_qid);
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

REVOKE EXECUTE ON FUNCTION public.end_live_session_system(UUID) FROM PUBLIC, anon, authenticated;

-- Stamp everyone already in a session that has not finished, so the change does
-- not read as "these people joined at question -1" for a room mid-flight.
UPDATE public.live_participants lp
SET joined_at_question_index = -1
FROM public.live_exams le
WHERE le.id = lp.live_exam_id
  AND le.status IN ('published', 'live')
  AND lp.joined_at_question_index IS NULL;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
--
-- Two things must hold, and the second is the one that would take a live room
-- down rather than merely miscount it.
-- ============================================================
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'live_participants'
      AND column_name = 'joined_at_question_index'
  ) THEN
    RAISE EXCEPTION 'live_participants.joined_at_question_index missing - skip counts would still include people who were not in the room';
  END IF;

  -- The trigger has to stamp it, or every new joiner is NULL and the count
  -- silently falls back to the old behaviour for ever.
  IF position('joined_at_question_index' in
       (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'protect_live_participant_scores')) = 0 THEN
    RAISE EXCEPTION 'the participant trigger does not stamp the join position';
  END IF;

  -- The auto-end repair. If the ending still calls the ownership-checked
  -- function, a session whose host has gone cannot close: the student poll that
  -- notices raises, rolls back, and repeats for ever.
  IF position('compute_live_question_analytics_core' in
       (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'end_live_session_system')) = 0 THEN
    RAISE EXCEPTION 'end_live_session_system still calls the ownership-checked analytics function - auto-end would raise on the student poll that triggers it';
  END IF;

  -- The core must not be reachable from a browser: it computes and STORES
  -- analytics for any exam, and names the fastest student when privacy is off.
  IF has_function_privilege('authenticated', 'public.compute_live_question_analytics_core(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'compute_live_question_analytics_core is callable by students';
  END IF;

  -- ...while the creator's own call must still work.
  IF NOT has_function_privilege('authenticated', 'public.compute_live_question_analytics(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'creators lost compute_live_question_analytics - the control room could not draw a breakdown';
  END IF;

  RAISE NOTICE 'skip counts now exclude people who had not joined yet; auto-end can close an abandoned session';
END $chk$;
