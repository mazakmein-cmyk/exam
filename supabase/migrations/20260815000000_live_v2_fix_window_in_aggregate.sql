-- ============================================================================
-- HOTFIX — two window functions nested where Postgres will not allow it
--
-- Symptom the creator saw: opening a live session's report showed the whole page
-- replaced by one line of text —
--
--     aggregate function calls cannot contain window function calls
--
-- Both bugs are the same mistake in two places, and both were invisible until a
-- creator opened the report, because plpgsql does not parse a statement until
-- control reaches it. `CREATE OR REPLACE FUNCTION` accepted both bodies happily;
-- the SQL inside was never analysed at migration time. Nothing in the test suite
-- caught it either, because every test here reads the migration as TEXT.
--
--  1. build_live_exam_report (20260807) — the attendance block called
--     ROW_NUMBER() OVER (...) as an argument to jsonb_agg(). Postgres rejects
--     that outright: an aggregate's arguments are evaluated before windows exist.
--     The function therefore NEVER succeeded, not once, for any session:
--
--       - end_live_session wraps the report INSERT in EXCEPTION WHEN OTHERS and
--         only RAISE WARNINGs, so pressing End looked completely normal and
--         live_exam_reports stayed empty.
--       - get_live_exam_report then finds no stored payload, rebuilds on demand,
--         and there the error is NOT swallowed — so it travels to PostgREST, and
--         the page renders the raw Postgres message. That is the screenshot.
--
--  2. compute_live_moments (20260805) — the comeback query wrapped
--     MAX(... ROW_NUMBER() OVER (...)) in a second OVER (...). Nested window
--     functions, which Postgres rejects as "window function calls cannot be
--     nested". Same story: caught by the EXCEPTION WHEN OTHERS in
--     compute_live_question_analytics, so every session silently recorded zero
--     moments. No comeback, no streak, no lone-correct, ever — and the report's
--     moments section has been empty by construction rather than by chance.
--
-- The shape of the fix, both times: number the rows in a subquery, aggregate the
-- resulting column. Same output, one extra level of nesting.
--
-- Both function bodies are reproduced whole below, because CREATE OR REPLACE does
-- not merge bodies. Nothing else about them changes — same privacy properties
-- (the stored payload still holds ids and never names), same ordering, same
-- moment thresholds.
--
-- Safe to re-run.
-- ============================================================================


-- ============================================================
-- 1. build_live_exam_report — attendance no longer aggregates a window
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


-- ============================================================
-- 2. compute_live_moments — the comeback query no longer nests windows
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
  --
  -- THE FIX is the `g` level. MAX(...) OVER (...) may not take a window function
  -- as its argument — that is a nested window call, and Postgres refuses it. The
  -- run-grouping key is computed once in `g`, then `t` runs the two window
  -- aggregates over that plain column. Identical result, one more subquery.
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
        g.user_id,
        g.is_correct,
        g.question_ordinal,
        g.grp,
        -- The trailing correct run: grp rises with the ordinal, so the largest
        -- grp among a student's correct answers is their most recent run.
        MAX(g.grp) FILTER (WHERE g.is_correct) OVER (PARTITION BY g.user_id) AS last_grp,
        MIN(g.question_ordinal) FILTER (WHERE g.is_correct) OVER (PARTITION BY g.user_id) AS first_right
      FROM (
        SELECT
          m.user_id,
          m.is_correct,
          m.question_ordinal,
          -- Group consecutive same-result answers.
          m.question_ordinal - ROW_NUMBER() OVER (
            PARTITION BY m.user_id, m.is_correct ORDER BY m.question_ordinal
          ) AS grp
        FROM _moment_hist m
      ) g
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
-- 3. Backfill every session that already ended
--
--    Two things need repairing for past sessions, and neither heals on its own:
--
--    a) live_moments is empty, and nothing recomputes it. end_live_session's
--       backfill only visits questions with NO analytics row, and those rows all
--       exist — the analytics were always fine, it was only the moment derived
--       from them that threw.
--
--    b) live_exam_reports is empty. get_live_exam_report WOULD rebuild on demand
--       now that the function works, but it FREEZES whatever it builds. Opening a
--       report before the moments exist would permanently store a payload with an
--       empty moments list, so the order here is load-bearing: moments first,
--       payload second.
--
--    Deliberately NOT wrapped in EXCEPTION WHEN OTHERS. A swallowed exception in
--    exactly this code path is why nobody noticed for eight migrations; if a
--    window is still nested somewhere, this migration should fail loudly and say
--    which exam it died on. Running it IS the verification.
-- ============================================================
DO $$
DECLARE
  v_exam_id   UUID;
  v_ordinal   INTEGER;
  v_exams     INTEGER := 0;
  v_moments   INTEGER := 0;
  v_reports   INTEGER := 0;
BEGIN
  FOR v_exam_id IN
    SELECT id FROM public.live_exams
    WHERE ended_at IS NOT NULL
    ORDER BY ended_at
  LOOP
    v_exams := v_exams + 1;

    -- Ascending: compute_live_moments reads history up to each ordinal, and
    -- class_first_perfect explicitly asks whether an earlier one exists.
    FOR v_ordinal IN
      SELECT DISTINCT question_ordinal
      FROM public.live_responses
      WHERE live_exam_id = v_exam_id AND question_ordinal IS NOT NULL
      ORDER BY question_ordinal
    LOOP
      PERFORM public.compute_live_moments(v_exam_id, v_ordinal);
    END LOOP;

    INSERT INTO public.live_exam_reports (live_exam_id, payload)
    VALUES (v_exam_id, public.build_live_exam_report(v_exam_id))
    ON CONFLICT (live_exam_id) DO UPDATE
      SET payload = EXCLUDED.payload, computed_at = now();
    v_reports := v_reports + 1;
  END LOOP;

  SELECT COUNT(*) INTO v_moments FROM public.live_moments;

  RAISE NOTICE 'Rebuilt % report payload(s) across % ended session(s); live_moments now holds % row(s).',
    v_reports, v_exams, v_moments;

  IF v_exams = 0 THEN
    -- Nothing to exercise the fixed statements against, so prove the shapes parse
    -- rather than letting the migration claim a success it did not test.
    PERFORM (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('anon_ordinal', lp.anon_ordinal)), '[]')
      FROM (
        SELECT (ROW_NUMBER() OVER (ORDER BY p.joined_at, p.id) - 1) AS anon_ordinal
        FROM public.live_participants p
        WHERE false
      ) lp
    );
    RAISE NOTICE 'No ended sessions yet — the fixed statement shapes parse, but nothing ran against real rows.';
  END IF;
END $$;


-- ============================================================
-- 4. Verification — the bodies in the database are the fixed ones
--
--    Text checks, because the definitive check already happened above: the
--    backfill executed both functions. This catches the other failure mode this
--    project keeps hitting — a migration applied out of order, so that an older
--    CREATE OR REPLACE ran last and silently won.
-- ============================================================
DO $$
DECLARE
  v_src     TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Matched on the identifiers rather than on indentation: a whitespace-sensitive
  -- LIKE would "fail" a body that is perfectly correct but reformatted.
  SELECT pg_get_functiondef('public.build_live_exam_report(uuid)'::regprocedure) INTO v_src;
  IF v_src LIKE '%ROW_NUMBER() OVER (ORDER BY lp.joined_at%' THEN
    v_missing := v_missing ||
      'build_live_exam_report still aggregates a window function — the report page will 500 again'::TEXT;
  END IF;
  IF v_src NOT LIKE '%lp.anon_ordinal%' THEN
    v_missing := v_missing ||
      'build_live_exam_report is not the fixed body — attendance does not read a pre-numbered ordinal'::TEXT;
  END IF;
  -- The COLUMN REFERENCE, not the word. pg_get_functiondef hands back the
  -- comments too, so '%display_name%' matches a comment explaining that names
  -- must not be stored — and fails the migration for describing the rule.
  IF v_src LIKE '%.display_name%' THEN
    v_missing := v_missing ||
      'build_live_exam_report reads a display_name column — the stored payload must hold ids only'::TEXT;
  END IF;

  SELECT pg_get_functiondef('public.compute_live_moments(uuid,integer)'::regprocedure) INTO v_src;
  IF v_src LIKE '%MAX(m.question_ordinal - ROW_NUMBER()%' THEN
    v_missing := v_missing ||
      'compute_live_moments still nests windows — moments stay silently empty forever'::TEXT;
  END IF;
  IF v_src NOT LIKE '%MAX(g.grp)%' THEN
    v_missing := v_missing ||
      'compute_live_moments is not the fixed body — the run-grouping key is not computed in a subquery'::TEXT;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'window-nesting hotfix incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'Live analytics repaired: the report builds, and moments compute for the first time.';
END $$;
