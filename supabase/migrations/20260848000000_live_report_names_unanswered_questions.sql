-- ============================================================
-- LIVE EXAMS: the report can name a question nobody answered
--
-- WHAT IS BROKEN
-- build_live_exam_report worked out each question's number by looking at
-- somebody's ANSWER to it — the play position is stored on live_responses, not
-- on the question. So a question with zero responses had no position, the
-- report sent null, and the report page rendered
--
--     Q{(q.ordinal ?? 0) + 1}
--
-- turning "we do not know which question this is" into "Q1". Every unanswered
-- question in the paper came out labelled Q1, several of them at once, sitting
-- beside the real question 1.
--
-- WHY IT MATTERS MORE THAN IT LOOKS
-- The report exists to answer "what do I reteach". A question that nobody
-- attempted is the strongest signal in it — and it was the exact kind the report
-- could not name. The teacher goes back over question 1, which was fine, while
-- the two questions that actually defeated the room stay anonymous.
--
-- THE FIX
-- A question's position belongs to the question, so read it from the question
-- list. live_primary_questions is the single definition of play order in this
-- database and it answers whether or not anybody responded. Same repair, and
-- the same reasoning, as the skip count in 20260847000000.
--
-- This also retires a quieter flaw in the old join: LIMIT 1 over the responses
-- picked an arbitrary one, and after an undo-and-re-ask the responses to a
-- single question can carry different ordinals.
--
-- No other part of the report changes. Body copied from 20260815000000, which
-- is the newest definition, with two marked edits.
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
      -- CHANGED 20260848000000. Was lr.question_ordinal, read off a RESPONSE.
      lr.ordinal AS ordinal,
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
    -- CHANGED 20260848000000. This used to be a lateral join onto live_responses
    -- that took the first matching row's question_ordinal — i.e. it read a
    -- question's POSITION off somebody's ANSWER to it. (The old text is not
    -- quoted here on purpose: prosrc includes comments, and the self-check at
    -- the bottom greps prosrc to prove the old join is gone.) A question
    -- nobody answered therefore had no position, the report sent null, and the
    -- page rendered `Q{(ordinal ?? 0) + 1}` — so every unanswered question came
    -- out as "Q1". Several unanswered questions all came out as "Q1" together,
    -- next to the real one.
    --
    -- Which is the worst possible thing to lose the name of: a question with
    -- zero attempts is the strongest "reteach this" signal the report has, and
    -- it was the only kind the report could not identify. The teacher re-covers
    -- question 1, which was fine.
    --
    -- The position belongs to the QUESTION, so read it from the question list.
    -- live_primary_questions is the one definition of play order in this
    -- database, and it answers whether or not anybody responded.
    --
    -- It also retires a second, quieter flaw: the old LIMIT 1 picked an
    -- arbitrary response, and after an undo-and-re-ask the responses to one
    -- question can carry different ordinals.
    --
    -- LEFT, not inner: an analytics row whose question is not in the primary
    -- list should still appear, with no number, rather than vanish from the
    -- report entirely.
    LEFT JOIN public.live_primary_questions(p_live_exam_id) lr
      ON lr.id = a.live_question_id
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
  --
  -- THE FIX. ROW_NUMBER() cannot be an argument to jsonb_agg() — an aggregate's
  -- arguments are computed before window functions are evaluated, so Postgres
  -- rejects the nesting at parse time rather than returning a wrong answer. The
  -- join order is numbered in the subquery and merely READ here.
  --
  -- The subquery is aliased `lp` so every column reference below is unchanged
  -- from the original, and the property that matters still reads the same way:
  -- what goes into the payload is a user_id, never a name.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',        lp.user_id,
    'joined_at',      lp.joined_at,
    'total_correct',  lp.total_correct,
    'total_answered', lp.total_answered,
    'rank',           lp.rank,
    -- Join order, so a masked name can be derived identically to everywhere else.
    'anon_ordinal',   lp.anon_ordinal
  ) ORDER BY lp.rank NULLS LAST, lp.joined_at)
  , '[]')
  INTO v_attend
  FROM (
    SELECT
      p.user_id,
      p.joined_at,
      p.total_correct,
      p.total_answered,
      p.rank,
      (ROW_NUMBER() OVER (ORDER BY p.joined_at, p.id) - 1) AS anon_ordinal
    FROM public.live_participants p
    WHERE p.live_exam_id = p_live_exam_id
  ) lp;

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

-- Rebuild the stored report of every finished session, so existing reports stop
-- saying Q1. The payload is a snapshot taken at end_live_session; nothing
-- refreshes it on its own, so without this the fix would only reach sessions
-- run from here on.
DO $rebuild$
DECLARE
  v_id  UUID;
  v_n   INTEGER := 0;
BEGIN
  FOR v_id IN
    SELECT live_exam_id FROM public.live_exam_reports
  LOOP
    BEGIN
      UPDATE public.live_exam_reports
      SET payload = public.build_live_exam_report(v_id), computed_at = now()
      WHERE live_exam_id = v_id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One unbuildable report must not abort the migration and take the other
      -- ninety-nine with it. The old payload stays; it is no worse than before.
      RAISE WARNING 'could not rebuild report for %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'rebuilt % stored live report(s)', v_n;
END $rebuild$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
-- ============================================================
DO $chk$
DECLARE
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'build_live_exam_report';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'build_live_exam_report missing - no session could produce a report';
  END IF;

  IF position('live_primary_questions(p_live_exam_id) lr' in v_src) = 0 THEN
    RAISE EXCEPTION 'the report still takes question numbers from responses - a question nobody answered would still be labelled Q1';
  END IF;

  -- The old join must be gone, not merely joined alongside.
  IF v_src ~ 'SELECT DISTINCT r\.question_ordinal' THEN
    RAISE EXCEPTION 'the response-derived ordinal join is still present';
  END IF;

  -- Everything else the report carries must survive the rewrite; losing one of
  -- these blanks a whole panel of the report rather than erroring.
  IF position('skipped_count' in v_src) = 0
     OR position('option_distribution' in v_src) = 0
     OR position('confusion_count' in v_src) = 0
     OR position('anon_ordinal' in v_src) = 0 THEN
    RAISE EXCEPTION 'the report lost a field it used to carry';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.build_live_exam_report(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'creators lost build_live_exam_report';
  END IF;

  RAISE NOTICE 'the report names every question, including the ones nobody answered';
END $chk$;
