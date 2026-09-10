-- ============================================================
-- MARKS ARE SCORED BY THE SERVER, AND marks_score JOINS THE LOCK
--
-- WHAT WAS BROKEN
-- 20260837000000 locked every trusted column on attempts except two, and said
-- so out loud: marks_score/marks_max stay writable because the marks engine
-- runs in the browser. That residual is load-bearing, because get_my_exam_ranks
-- does not rank by the locked score whenever an exam has marks:
--
--     ORDER BY (CASE WHEN rank_by_marks THEN total_marks ELSE total_score END)
--
-- So on any marks-enabled exam the placement everyone sees is decided by a
-- number the student's own browser wrote. A student could PATCH marks_score to
-- anything and take rank 1 — and because RANK() compares the cohort, every
-- honest sitting below them moved down with it. The same door blanked it:
-- rank_by_marks is bool_and(has_marks) OVER (PARTITION BY exam_id), so ONE
-- NULLed marks_score switched marks-based ranking off for the whole exam.
--
-- THE FIX
-- Move the engine to where the answer key already is. submit_exam_attempt has
-- graded the paper by the time it stamps the attempt; it now also computes the
-- marks in the same transaction, and marks_score/marks_max join the locked
-- columns. Nothing a browser sends decides a placement any more.
--
-- FAITHFUL, NOT REDESIGNED — this is a port of src/services/scoringEngine.ts:
--   * resolveConfig picks ONE level whole: question -> section -> exam -> none.
--     It is not a per-field merge, so a section override with marks_wrong = 0
--     does not inherit the exam's penalty. cfg_level below preserves that.
--   * No config at any level = an unscored question: 0 awarded, and it adds
--     nothing to marks_max.
--   * marks_max counts marks_correct for every SCORED question, answered or not.
--   * skipped = no response row, or status 'untouched', or no answer value —
--     where "" and [] are not answers (hasAnswerValue), so a cleared text box
--     is a skip and never pays the wrong-answer penalty.
--   * multi = answer_type in (multi, multiple) AND an array key, matching
--     calculateMarks. Anything else scores as SCQ, including a multi-typed
--     question whose key was saved as a scalar.
--   * MCQ dedupes BOTH sides before counting, so a repeated option cannot
--     inflate partial credit.
--   * Partial credit rounds; the all-or-nothing and penalty paths do not.
--
-- WHY mock_js_round2 EXISTS
-- JS Math.round is floor(x + 0.5) — it breaks .5 toward +infinity, so
-- Math.round(-2.5) is -2. Postgres round() breaks half AWAY from zero and
-- returns -3. Totals are routinely negative under negative marking, so using
-- round() would have quietly disagreed with every historical attempt at exactly
-- the .005 boundary. floor(v * 100 + 0.5) / 100 reproduces JS exactly.
--
-- MULTI-LANGUAGE
-- Scoring config is authored on the PRIMARY language's rows. A Hindi sitting
-- resolves its config through section_group_id / question_group_id, exactly as
-- examService did, and falls back to its own ids when a pairing is missing.
-- The marks LOG is written against the questions the student actually answered.
--
-- THE CLIENT PATH IS NOT DELETED
-- submit_exam_attempt now returns marks_scored. examService runs its own marks
-- module only when that is falsy, which is what a database carrying the grader
-- but not this migration returns. Both deploy orders stay correct.
--
-- BACKFILL: attempts submitted before this lands keep the marks their browser
-- wrote. To re-derive them from the record:
--   SELECT public.compute_attempt_marks(id) FROM public.attempts
--   WHERE submitted_at IS NOT NULL;
--
-- Requires (apply first): 20260831000000 (grader), 20260837000000 (attempts
-- lock), 20260839000000 (mock_answer_norm), 20260410000000 (marks tables).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'submit_exam_attempt') THEN
    RAISE EXCEPTION 'apply 20260831000000_submit_exam_attempt.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'mock_answer_norm') THEN
    RAISE EXCEPTION 'apply 20260839000000_unicode_numeric_answer_match.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'attempts_lock_columns') THEN
    RAISE EXCEPTION 'apply 20260837000000_attempts_columns_locked.sql first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'question_marks_log') THEN
    RAISE EXCEPTION 'apply 20260410000000_add_marks_module.sql first';
  END IF;
END $$;


-- ============================================================
-- 1. Helpers — direct ports, kept separate so the tests can reach them
-- ============================================================

-- hasAnswerValue: "" and [] are cleared answers, not answers.
CREATE OR REPLACE FUNCTION public.mock_has_answer(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN false
    WHEN jsonb_typeof(v) = 'array'  THEN jsonb_array_length(v) > 0
    WHEN jsonb_typeof(v) = 'string' THEN btrim(v #>> '{}') <> ''
    ELSE true
  END;
$$;

-- JS Math.round(x * 100) / 100, including its half-toward-+infinity rule.
CREATE OR REPLACE FUNCTION public.mock_js_round2(v numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT floor(v * 100 + 0.5) / 100;
$$;

-- applyRounding. 'none' is exact; the rest work to 2dp like the engine.
CREATE OR REPLACE FUNCTION public.mock_apply_rounding(v numeric, strategy text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE strategy
    WHEN 'floor' THEN floor(v * 100) / 100
    WHEN 'round' THEN public.mock_js_round2(v)
    WHEN 'ceil'  THEN ceil(v * 100) / 100
    ELSE v
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.mock_has_answer(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mock_js_round2(numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mock_apply_rounding(numeric, text) FROM PUBLIC;


-- ============================================================
-- 2. The engine
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_attempt_marks(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt        public.attempts;
  v_section        public.sections;
  v_exam_id        uuid;
  v_primary_lang   text;
  v_config_section uuid;
  v_total          numeric;
  v_max            numeric;
  v_scored         integer;
  v_rows           jsonb;
BEGIN
  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_section FROM public.sections WHERE id = v_attempt.section_id;
  IF v_section.id IS NULL THEN RETURN NULL; END IF;
  v_exam_id := v_section.exam_id;

  SELECT e.primary_language INTO v_primary_lang FROM public.exams e WHERE e.id = v_exam_id;

  -- Config is authored on the primary language's section.
  v_config_section := v_section.id;
  IF v_primary_lang IS NOT NULL
     AND v_section.language IS NOT NULL
     AND v_section.language <> v_primary_lang
     AND v_section.section_group_id IS NOT NULL THEN
    SELECT s.id INTO v_config_section
    FROM public.sections s
    WHERE s.section_group_id = v_section.section_group_id
      AND s.language = v_primary_lang
    LIMIT 1;
    v_config_section := COALESCE(v_config_section, v_section.id);
  END IF;

  WITH served AS (
    SELECT q.id, q.answer_type, q.correct_answer, q.question_group_id
    FROM public.parsed_questions q
    WHERE q.section_id = v_attempt.section_id
      AND q.is_excluded = false
  ),
  -- Each served question mapped to the row its config is authored on.
  -- A scalar subquery, not a join: nothing constrains question_group_id to be
  -- unique within a section, and a duplicate tag on the primary side would
  -- otherwise fan this question out into two rows and score it twice.
  cfgmap AS (
    SELECT
      s.id AS qid,
      COALESCE((
        SELECT pq.id
        FROM public.parsed_questions pq
        WHERE v_config_section <> v_attempt.section_id
          AND s.question_group_id IS NOT NULL
          AND pq.section_id = v_config_section
          AND pq.question_group_id = s.question_group_id
        ORDER BY pq.q_no, pq.id
        LIMIT 1
      ), s.id) AS config_qid
    FROM served s
  ),
  -- resolveConfig: one level, whole. Never a per-field merge.
  cfg AS (
    SELECT
      s.id, s.answer_type, s.correct_answer,
      CASE WHEN qsc.question_id IS NOT NULL THEN 'question'
           WHEN ssd.section_id  IS NOT NULL THEN 'section'
           WHEN esd.exam_id     IS NOT NULL THEN 'exam' END AS cfg_level,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.marks_correct
           WHEN ssd.section_id  IS NOT NULL THEN ssd.marks_correct
           WHEN esd.exam_id     IS NOT NULL THEN esd.marks_correct END AS marks_correct,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.marks_wrong
           WHEN ssd.section_id  IS NOT NULL THEN ssd.marks_wrong
           WHEN esd.exam_id     IS NOT NULL THEN esd.marks_wrong END AS marks_wrong,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.marks_skipped
           WHEN ssd.section_id  IS NOT NULL THEN ssd.marks_skipped
           WHEN esd.exam_id     IS NOT NULL THEN esd.marks_skipped END AS marks_skipped,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.mcq_mode
           WHEN ssd.section_id  IS NOT NULL THEN ssd.mcq_mode
           WHEN esd.exam_id     IS NOT NULL THEN esd.mcq_mode END AS mcq_mode,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.mcq_wrong_penalty
           WHEN ssd.section_id  IS NOT NULL THEN ssd.mcq_wrong_penalty
           WHEN esd.exam_id     IS NOT NULL THEN esd.mcq_wrong_penalty END AS mcq_wrong_penalty,
      CASE WHEN qsc.question_id IS NOT NULL THEN qsc.rounding_strategy
           WHEN ssd.section_id  IS NOT NULL THEN ssd.rounding_strategy
           WHEN esd.exam_id     IS NOT NULL THEN esd.rounding_strategy END AS rounding_strategy
    FROM served s
    JOIN cfgmap m ON m.qid = s.id
    LEFT JOIN public.question_scoring_config  qsc ON qsc.question_id = m.config_qid
    LEFT JOIN public.section_scoring_defaults ssd ON ssd.section_id  = v_config_section
    LEFT JOIN public.exam_scoring_defaults    esd ON esd.exam_id     = v_exam_id
  ),
  prep AS (
    SELECT
      c.*,
      r.selected_answer,
      -- COALESCE, because a row with a NULL status and a real answer leaves
      -- the OR chain UNKNOWN, and an UNKNOWN here would drop the question out
      -- of the multi-select counts below rather than scoring it.
      COALESCE(r.question_id IS NULL
        OR r.status = 'untouched'
        OR NOT public.mock_has_answer(r.selected_answer), false) AS is_skipped,
      (c.answer_type IN ('multi', 'multiple')
        AND jsonb_typeof(c.correct_answer) = 'array')     AS is_multi
    FROM cfg c
    LEFT JOIN public.responses r
      ON r.attempt_id = p_attempt_id AND r.question_id = c.id
  ),
  -- Deduped set counts for multi-select. COALESCE to '' throughout: a NULL
  -- normalisation inside NOT IN would poison the comparison to UNKNOWN.
  counts AS (
    SELECT
      p.id,
      COALESCE(tc.n, 0)          AS total_correct,
      COALESCE(sc.correct_sel, 0) AS correct_sel,
      COALESCE(sc.wrong_sel, 0)   AS wrong_sel
    FROM prep p
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT COALESCE(public.mock_answer_norm(e.v), '')) AS n
      FROM jsonb_array_elements(
        CASE WHEN p.is_multi THEN p.correct_answer ELSE '[]'::jsonb END
      ) AS e(v)
    ) tc ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE u.n IN (
          SELECT COALESCE(public.mock_answer_norm(c2.v), '')
          FROM jsonb_array_elements(
            CASE WHEN p.is_multi THEN p.correct_answer ELSE '[]'::jsonb END
          ) AS c2(v))) AS correct_sel,
        COUNT(*) FILTER (WHERE u.n NOT IN (
          SELECT COALESCE(public.mock_answer_norm(c3.v), '')
          FROM jsonb_array_elements(
            CASE WHEN p.is_multi THEN p.correct_answer ELSE '[]'::jsonb END
          ) AS c3(v))) AS wrong_sel
      FROM (
        SELECT DISTINCT COALESCE(public.mock_answer_norm(e.v), '') AS n
        FROM jsonb_array_elements(
          CASE
            WHEN NOT p.is_multi OR p.is_skipped THEN '[]'::jsonb
            WHEN jsonb_typeof(p.selected_answer) = 'array' THEN p.selected_answer
            ELSE jsonb_build_array(p.selected_answer)
          END
        ) AS e(v)
      ) u
    ) sc ON true
  ),
  -- scoreSCQ's comparison, including the { answer } / { value } shape read
  -- with an explicit null test so a correct answer of 0 still matches.
  scq AS (
    SELECT
      p.id,
      CASE
        WHEN p.correct_answer IS NULL OR jsonb_typeof(p.correct_answer) = 'null' THEN false
        WHEN jsonb_typeof(p.correct_answer) = 'object' THEN
          COALESCE(public.mock_answer_norm(
            CASE WHEN p.correct_answer -> 'answer' IS NOT NULL
                  AND jsonb_typeof(p.correct_answer -> 'answer') <> 'null'
                 THEN p.correct_answer -> 'answer'
                 ELSE p.correct_answer -> 'value' END), '')
            = COALESCE(public.mock_answer_norm(p.selected_answer), '')
        ELSE
          COALESCE(public.mock_answer_norm(p.selected_answer), '')
            = COALESCE(public.mock_answer_norm(p.correct_answer), '')
      END AS is_correct
    FROM prep p
  ),
  scored_rows AS (
    SELECT
    p.id AS question_id,
    p.cfg_level,
    COALESCE(p.marks_correct, 0) AS marks_correct,
    CASE
      WHEN p.cfg_level IS NULL THEN 0::numeric
      WHEN p.is_skipped THEN -p.marks_skipped
      WHEN p.is_multi THEN
        CASE
          WHEN p.mcq_mode = 'all_or_nothing' THEN
            CASE WHEN n.wrong_sel > 0                    THEN -p.marks_wrong
                 WHEN n.correct_sel = n.total_correct    THEN p.marks_correct
                 ELSE 0::numeric END
          ELSE
            CASE
              WHEN n.wrong_sel > 0 THEN
                CASE WHEN p.mcq_wrong_penalty = 'flat' THEN -p.marks_wrong
                     ELSE GREATEST(-p.marks_wrong * n.wrong_sel, -p.marks_correct) END
              WHEN n.correct_sel > 0 AND n.total_correct > 0 THEN
                public.mock_apply_rounding(
                  n.correct_sel * (p.marks_correct / n.total_correct), p.rounding_strategy)
              ELSE 0::numeric
            END
        END
      ELSE
        CASE WHEN q.is_correct THEN p.marks_correct ELSE -p.marks_wrong END
    END AS marks_awarded,
    jsonb_build_object(
      'correct_selected',
        CASE WHEN p.cfg_level IS NULL OR p.is_skipped THEN 0
             WHEN p.is_multi THEN n.correct_sel
             WHEN q.is_correct THEN 1 ELSE 0 END,
      'total_correct',
        CASE WHEN p.cfg_level IS NULL THEN 0
             WHEN p.is_multi THEN n.total_correct ELSE 1 END,
      'wrong_selected',
        CASE WHEN p.cfg_level IS NULL OR p.is_skipped THEN 0
             WHEN p.is_multi THEN n.wrong_sel
             WHEN q.is_correct THEN 0 ELSE 1 END,
      'mode',
        CASE WHEN p.cfg_level IS NULL THEN 'unscored'
             WHEN p.is_skipped THEN 'skipped'
             WHEN p.is_multi THEN p.mcq_mode
             ELSE 'scq' END
    ) AS breakdown
    FROM prep p
    JOIN counts n ON n.id = p.id
    JOIN scq    q ON q.id = p.id
  )
  -- One pass: the per-question rows are buffered as JSON for the log write
  -- below, so the whole chain is not evaluated twice. No temp table, because
  -- this function is also the backfill and DDL per row would not survive it.
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id',   r.question_id,
      'marks_awarded', r.marks_awarded,
      'breakdown',     r.breakdown)), '[]'::jsonb),
    public.mock_js_round2(COALESCE(SUM(r.marks_awarded), 0)),
    public.mock_js_round2(COALESCE(SUM(r.marks_correct) FILTER (WHERE r.cfg_level IS NOT NULL), 0)),
    COUNT(*) FILTER (WHERE r.cfg_level IS NOT NULL)
  INTO v_rows, v_total, v_max, v_scored
  FROM scored_rows r;

  -- No config at any level anywhere = this paper is not scored by marks.
  -- Leave marks_score NULL exactly as the browser path did, so rank falls back
  -- to the correct-count rather than ranking everyone on zeros.
  IF v_scored = 0 THEN
    RETURN jsonb_build_object('scored', false, 'marks_score', NULL, 'marks_max', NULL);
  END IF;

  INSERT INTO public.question_marks_log (attempt_id, question_id, marks_awarded, breakdown)
  SELECT
    p_attempt_id,
    (e ->> 'question_id')::uuid,
    (e ->> 'marks_awarded')::numeric,
    e -> 'breakdown'
  FROM jsonb_array_elements(v_rows) AS e
  ON CONFLICT (attempt_id, question_id) DO UPDATE SET
    marks_awarded = EXCLUDED.marks_awarded,
    breakdown     = EXCLUDED.breakdown;

  UPDATE public.attempts
  SET marks_score = v_total,
      marks_max   = v_max
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object('scored', true, 'marks_score', v_total, 'marks_max', v_max);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_attempt_marks(uuid) FROM PUBLIC;


-- ============================================================
-- 3. The grader now owns marks too.
--    Body is 20260831000000's, unchanged except the marks step and the flag.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  p_attempt_id uuid,
  p_answers jsonb,
  p_time_spent_seconds integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_attempt public.attempts;
  v_total integer;
  v_correct integer;
  v_time_on_questions integer;
  v_results jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_attempt FROM public.attempts WHERE id = p_attempt_id;
  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Attempt not found';
  END IF;
  IF v_attempt.user_id <> v_uid THEN
    RAISE EXCEPTION 'Not your attempt';
  END IF;

  SELECT GREATEST(COUNT(*), 1)::integer INTO v_total
  FROM public.parsed_questions q
  WHERE q.section_id = v_attempt.section_id
    AND q.is_excluded = false;

  IF v_attempt.submitted_at IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'question_id', r.question_id,
             'is_correct', COALESCE(r.is_correct, false),
             'answer_type', q.answer_type,
             'correct_answer', q.correct_answer
           )), '[]'::jsonb)
      INTO v_results
    FROM public.responses r
    JOIN public.parsed_questions q ON q.id = r.question_id
    WHERE r.attempt_id = p_attempt_id;

    RETURN jsonb_build_object(
      'attempt_id', p_attempt_id,
      'already_submitted', true,
      'score', COALESCE(v_attempt.score, 0),
      'total_questions', COALESCE(v_attempt.total_questions, v_total),
      -- Already marked, by whichever path ran first. Claiming the marks step
      -- here would let a retry re-open the client path against a locked column.
      'marks_scored', true,
      'results', v_results
    );
  END IF;

  WITH incoming AS (
    SELECT
      (a ->> 'question_id')::uuid AS question_id,
      CASE
        WHEN a -> 'selected_answer' IS NULL OR jsonb_typeof(a -> 'selected_answer') = 'null'
          THEN NULL
        ELSE a -> 'selected_answer'
      END AS selected_answer,
      COALESCE((a ->> 'is_marked_for_review')::boolean, false) AS is_marked_for_review,
      GREATEST(COALESCE((a ->> 'time_spent_seconds')::integer, 0), 0) AS time_spent_seconds,
      NULLIF(a ->> 'status', '') AS status
    FROM jsonb_array_elements(COALESCE(p_answers, '[]'::jsonb)) AS a
  ),
  graded AS (
    SELECT
      i.*,
      public.grade_mock_answer(q.correct_answer, i.selected_answer) AS is_correct
    FROM incoming i
    JOIN public.parsed_questions q ON q.id = i.question_id
    WHERE q.section_id = v_attempt.section_id
  ),
  saved AS (
    INSERT INTO public.responses AS r (
      attempt_id, question_id, selected_answer,
      is_marked_for_review, time_spent_seconds, status, is_correct
    )
    SELECT
      p_attempt_id, g.question_id, g.selected_answer,
      g.is_marked_for_review, g.time_spent_seconds, g.status, g.is_correct
    FROM graded g
    ON CONFLICT (attempt_id, question_id) DO UPDATE SET
      selected_answer      = EXCLUDED.selected_answer,
      is_marked_for_review = EXCLUDED.is_marked_for_review,
      time_spent_seconds   = EXCLUDED.time_spent_seconds,
      status               = COALESCE(EXCLUDED.status, r.status),
      is_correct           = EXCLUDED.is_correct,
      updated_at           = now()
    RETURNING r.question_id, r.is_correct, r.time_spent_seconds
  )
  SELECT
    COALESCE(SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(s.time_spent_seconds), 0)::integer,
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id', s.question_id,
      'is_correct', s.is_correct,
      'answer_type', q.answer_type,
      'correct_answer', q.correct_answer
    )), '[]'::jsonb)
  INTO v_correct, v_time_on_questions, v_results
  FROM saved s
  JOIN public.parsed_questions q ON q.id = s.question_id;

  UPDATE public.attempts
  SET submitted_at          = now(),
      time_spent_seconds    = GREATEST(COALESCE(p_time_spent_seconds, 0), 0),
      score                 = v_correct,
      total_questions       = v_total,
      accuracy_percentage   = (v_correct::numeric / v_total) * 100,
      avg_time_per_question = v_time_on_questions::numeric / v_total
  WHERE id = p_attempt_id;

  -- Marks, in the same transaction and off the same stored answers. Not
  -- guarded: a marks failure must roll the submission back rather than leave a
  -- graded attempt whose placement is missing.
  PERFORM public.compute_attempt_marks(p_attempt_id);

  RETURN jsonb_build_object(
    'attempt_id', p_attempt_id,
    'already_submitted', false,
    'score', v_correct,
    'total_questions', v_total,
    'marks_scored', true,
    'results', v_results
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, jsonb, integer) TO authenticated;


-- ============================================================
-- 4. marks_score / marks_max join the lock.
--    20260837000000's body, with the residual closed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.attempts_lock_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.id                    IS DISTINCT FROM OLD.id
     OR NEW.user_id               IS DISTINCT FROM OLD.user_id
     OR NEW.section_id            IS DISTINCT FROM OLD.section_id
     OR NEW.language              IS DISTINCT FROM OLD.language
     OR NEW.score                 IS DISTINCT FROM OLD.score
     OR NEW.total_questions       IS DISTINCT FROM OLD.total_questions
     OR NEW.accuracy_percentage   IS DISTINCT FROM OLD.accuracy_percentage
     OR NEW.avg_time_per_question IS DISTINCT FROM OLD.avg_time_per_question
     OR NEW.time_spent_seconds    IS DISTINCT FROM OLD.time_spent_seconds
     OR NEW.started_at            IS DISTINCT FROM OLD.started_at
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
     OR NEW.submitted_at          IS DISTINCT FROM OLD.submitted_at
     OR NEW.clock_deadline_at     IS DISTINCT FROM OLD.clock_deadline_at
     -- Closed by 20260843000000: the marks engine runs in the database now, so
     -- the placement these decide is no longer the browser's to write.
     OR NEW.marks_score           IS DISTINCT FROM OLD.marks_score
     OR NEW.marks_max             IS DISTINCT FROM OLD.marks_max
  THEN
    RAISE EXCEPTION 'ATTEMPTS_COLUMN_LOCKED: attempt results are written by the server only';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 5. The marks log is a server record too.
--    Without this a student rewrites the per-question breakdown their review
--    and the creator's review both read, even though the total is now safe.
-- ============================================================
CREATE OR REPLACE FUNCTION public.question_marks_log_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'QUESTION_MARKS_LOG_LOCKED: marks are written by compute_attempt_marks';
END;
$$;

DROP TRIGGER IF EXISTS question_marks_log_locked ON public.question_marks_log;
CREATE TRIGGER question_marks_log_locked
  BEFORE INSERT OR UPDATE ON public.question_marks_log
  FOR EACH ROW
  EXECUTE FUNCTION public.question_marks_log_locked();

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.attempts_lock_columns()'::regprocedure);
  IF position('NEW.marks_score           IS DISTINCT FROM' IN v_def) = 0
     OR position('NEW.marks_max             IS DISTINCT FROM' IN v_def) = 0 THEN
    RAISE EXCEPTION 'marks_score/marks_max are still writable — rank can still be faked';
  END IF;
  IF position('current_user NOT IN (''authenticated'', ''anon'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the server-role passthrough is gone — compute_attempt_marks would be blocked';
  END IF;

  v_def := pg_get_functiondef('public.submit_exam_attempt(uuid, jsonb, integer)'::regprocedure);
  IF position('compute_attempt_marks' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the grader no longer scores marks — every attempt would land with marks_score NULL';
  END IF;
  IF position('''marks_scored'', true' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the marks_scored flag is missing — the browser would run its own marks pass into a locked column';
  END IF;

  -- JS Math.round(-2.5) is -2; Postgres round(-2.5) is -3. Negative totals are
  -- ordinary under negative marking, so this is a real divergence, not trivia.
  IF public.mock_js_round2(-0.025) <> -0.02 THEN
    RAISE EXCEPTION 'mock_js_round2 does not match JS Math.round at the .5 boundary';
  END IF;
  IF public.mock_apply_rounding(0.6667, 'floor') <> 0.66
     OR public.mock_apply_rounding(0.6667, 'ceil') <> 0.67
     OR public.mock_apply_rounding(0.6667, 'none') <> 0.6667 THEN
    RAISE EXCEPTION 'mock_apply_rounding does not match the engine';
  END IF;
  -- "" and [] are cleared answers: scoring them wrong charges a penalty for a blank.
  IF public.mock_has_answer('""'::jsonb) OR public.mock_has_answer('[]'::jsonb)
     OR public.mock_has_answer('null'::jsonb) OR NOT public.mock_has_answer('0'::jsonb) THEN
    RAISE EXCEPTION 'mock_has_answer does not match hasAnswerValue';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'question_marks_log'
      AND t.tgname = 'question_marks_log_locked' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'the marks log lock did not land';
  END IF;

  RAISE NOTICE 'marks are scored in the database and locked: no browser write decides a placement';
END $$;
