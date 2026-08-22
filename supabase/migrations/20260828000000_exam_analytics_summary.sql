-- ============================================================
-- CREATOR ANALYTICS: aggregate in the database, ship a summary
--
-- WHAT WAS BROKEN
-- The creator dashboard downloaded every student's every answer and graded them
-- in the browser. PostgREST caps a response at 1000 rows and says nothing, and
-- the fetch was batched by ATTEMPT (200 at a time) while it needed one row per
-- ANSWER — so 200 attempts on a 25-question section asked for 5,000 rows and
-- got 1,000. The other 4,000 answers looked like they were never given: real
-- students rendered at 0 correct and 0% accuracy, the per-question breakdown
-- showed invented "skipped" counts, and Top Students was wrong. Truncation
-- began around 40 attempts on a 25-question section — an ordinary class.
--
-- Paging the fetch would have fixed the corruption while still moving every
-- answer of every student across the network on every page load. This does the
-- counting where the rows already are and returns a fixed-size summary instead:
-- a few numbers per attempt and per question, no matter how many students sat
-- the paper.
--
-- WHY IT RETURNS ONE JSONB ROW
-- PostgREST's 1000-row cap applies to RPC results too, so a set-returning
-- function would have reintroduced the same silent ceiling at a different
-- number. One row containing a JSON document has no such ceiling.
--
-- SEMANTICS ARE THE BROWSER'S, MOVED — not redesigned:
--   * The creator's own attempts are excluded from everything.
--   * Only questions the runner actually serves count (is_excluded = false),
--     because counting excluded ones inflates every denominator.
--   * is_correct is trusted when it is set. It is NULL only on responses
--     written before the column existed, and those are re-graded on the fly by
--     grade_mock_answer, which is the browser's comparison rewritten in SQL.
--   * Attempt scores span every response on the attempt. Question stats count
--     only responses belonging to a SUBMITTED attempt — an abandoned attempt
--     should not tell a creator a question was skipped.
--   * total_questions is left to the caller: it still falls back to the
--     attempt's stored count, then to 1, exactly as before.
-- ============================================================

-- ── Text of a JSON value the way JavaScript's String() renders it ───────────
-- This has to be String(), not jsonb's text form, because it is compared
-- against keys the browser produced. The differences that bite:
--   array  -> String(["0","2"]) is `0,2`, NOT `["0", "2"]` (jsonb adds spaces)
--   object -> String({...}) is `[object Object]`
--   number -> String(1.0) is `1`, but jsonb keeps the stored scale (`1.0`)
-- Getting any of these wrong flips the grade on a legacy response whose
-- selected_answer is an array while its answer key is not.
CREATE OR REPLACE FUNCTION public.mock_answer_norm(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN NULL
    WHEN jsonb_typeof(v) = 'string' THEN lower(btrim(v #>> '{}'))
    WHEN jsonb_typeof(v) = 'number' THEN lower(btrim(trim_scale((v #>> '{}')::numeric)::text))
    WHEN jsonb_typeof(v) = 'object' THEN '[object object]'
    WHEN jsonb_typeof(v) = 'array' THEN lower(btrim(COALESCE((
      SELECT string_agg(
               CASE
                 WHEN jsonb_typeof(t.e) = 'null' THEN ''
                 WHEN jsonb_typeof(t.e) = 'string' THEN t.e #>> '{}'
                 WHEN jsonb_typeof(t.e) = 'number' THEN trim_scale((t.e #>> '{}')::numeric)::text
                 WHEN jsonb_typeof(t.e) = 'object' THEN '[object Object]'
                 ELSE t.e::text
               END,
               ',' ORDER BY t.ord
             )
      FROM jsonb_array_elements(v) WITH ORDINALITY AS t(e, ord)
    ), '')))
    ELSE lower(btrim(v::text))
  END;
$$;

-- ── The misconceptions key: String(selected), or selected.join(",") ─────────
-- Deliberately NOT normalised — this is a label shown to the creator, and the
-- browser built it from the raw value. Capped at 120 chars because
-- selected_answer is unbounded client-supplied JSON and this becomes a key.
CREATE OR REPLACE FUNCTION public.mock_answer_label(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN 'null'
    WHEN jsonb_typeof(v) = 'array' THEN COALESCE((
      SELECT string_agg(
               -- [].join(",") renders a null element as the empty string, so
               -- ["a",null] is `a,` — not `a,null`. This label is compared
               -- against option text to highlight the wrongly-chosen option.
               CASE
                 WHEN jsonb_typeof(t.e) = 'null' THEN ''
                 WHEN jsonb_typeof(t.e) = 'string' THEN t.e #>> '{}'
                 ELSE t.e::text
               END,
               ',' ORDER BY t.ord
             )
      FROM jsonb_array_elements(v) WITH ORDINALITY AS t(e, ord)
    ), '')
    WHEN jsonb_typeof(v) = 'string' THEN v #>> '{}'
    ELSE v::text
  END, 120);
$$;

-- ── The browser's grader, in SQL ────────────────────────────────────────────
-- Only reached for legacy responses whose is_correct was never written.
-- Branches on the SHAPE of the stored key, as the browser does:
--   array  -> same length, and the normalised sets match
--   object -> {answer:…} else {value:…}, compared as a scalar
--   scalar -> normalised string equality
CREATE OR REPLACE FUNCTION public.grade_mock_answer(p_correct jsonb, p_selected jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_inner jsonb;
BEGIN
  IF p_selected IS NULL OR jsonb_typeof(p_selected) = 'null' THEN RETURN false; END IF;
  IF p_correct IS NULL OR jsonb_typeof(p_correct) = 'null' THEN RETURN false; END IF;
  -- hasAnswerValue: an empty stored key is no key at all.
  IF jsonb_typeof(p_correct) = 'string' AND (p_correct #>> '{}') = '' THEN RETURN false; END IF;

  IF jsonb_typeof(p_correct) = 'array' THEN
    RETURN (
      SELECT sel.arr IS NOT NULL
         AND cor.arr IS NOT NULL
         AND cardinality(sel.arr) = cardinality(cor.arr)
         AND sel.arr = cor.arr
      FROM
        (SELECT array_agg(x ORDER BY x) AS arr FROM (
           SELECT public.mock_answer_norm(e) AS x
           FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p_selected) = 'array'
                       THEN p_selected
                       ELSE jsonb_build_array(p_selected) END) e
         ) a) sel,
        (SELECT array_agg(x ORDER BY x) AS arr FROM (
           SELECT public.mock_answer_norm(e) AS x
           FROM jsonb_array_elements(p_correct) e
         ) b) cor
    );
  END IF;

  IF jsonb_typeof(p_correct) = 'object' THEN
    v_inner := CASE
      WHEN p_correct ? 'answer' AND jsonb_typeof(p_correct -> 'answer') <> 'null'
        THEN p_correct -> 'answer'
      ELSE p_correct -> 'value'
    END;
    RETURN v_inner IS NOT NULL
       AND jsonb_typeof(v_inner) <> 'null'
       AND COALESCE(public.mock_answer_norm(v_inner), '') <> ''
       AND public.mock_answer_norm(v_inner) = public.mock_answer_norm(p_selected);
  END IF;

  RETURN public.mock_answer_norm(p_correct) = public.mock_answer_norm(p_selected);
END;
$$;

-- ── The summary ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_exam_analytics(p_exam_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owned AS (
    -- Creator-only. This returns cohort aggregates, so a non-owner gets
    -- nothing back rather than an error the dashboard would have to special-case.
    SELECT 1 AS ok
    FROM public.exams e
    WHERE e.id = p_exam_id AND e.user_id = auth.uid()
  ),
  qs AS (
    SELECT q.id, q.section_id, q.correct_answer
    FROM public.parsed_questions q
    JOIN public.sections s ON s.id = q.section_id
    WHERE s.exam_id = p_exam_id
      AND q.is_excluded = false
      AND EXISTS (SELECT 1 FROM owned)
  ),
  qcount AS (
    SELECT section_id, COUNT(*)::int AS n FROM qs GROUP BY section_id
  ),
  att AS (
    SELECT a.id, a.section_id, a.submitted_at
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    JOIN public.exams e ON e.id = s.exam_id
    WHERE s.exam_id = p_exam_id
      AND a.user_id <> e.user_id
      AND EXISTS (SELECT 1 FROM owned)
  ),
  resp AS (
    SELECT
      r.attempt_id,
      r.question_id,
      r.selected_answer,
      COALESCE(r.is_marked_for_review, false) AS reviewed,
      COALESCE(r.time_spent_seconds, 0) AS secs,
      COALESCE(r.is_correct, public.grade_mock_answer(q.correct_answer, r.selected_answer)) AS correct,
      a.submitted_at,
      (q.id IS NOT NULL) AS counts_for_question_stats
    FROM public.responses r
    JOIN att a ON a.id = r.attempt_id
    LEFT JOIN qs q ON q.id = r.question_id
  ),
  attempt_rows AS (
    -- LEFT JOIN so an attempt with no responses still reports 0, as the
    -- browser's empty-array path did.
    SELECT
      a.id AS attempt_id,
      COALESCE(SUM(CASE WHEN r.correct THEN 1 ELSE 0 END), 0)::int AS correct_count,
      COALESCE(SUM(r.secs), 0)::int AS total_time_seconds,
      COALESCE(MAX(qc.n), 0)::int AS section_question_count
    FROM att a
    LEFT JOIN resp r ON r.attempt_id = a.id
    LEFT JOIN qcount qc ON qc.section_id = a.section_id
    GROUP BY a.id
  ),
  q_rows AS (
    SELECT
      r.question_id,
      COUNT(*)::int AS total_attempts,
      SUM(CASE WHEN r.correct THEN 1 ELSE 0 END)::int AS correct_count,
      -- A JSON null and a SQL NULL both arrive in the browser as null, and the
      -- browser called both "unanswered".
      SUM(CASE WHEN NOT r.correct AND (r.selected_answer IS NULL OR jsonb_typeof(r.selected_answer) = 'null')
               THEN 1 ELSE 0 END)::int AS unanswered_count,
      SUM(CASE WHEN NOT r.correct AND r.selected_answer IS NOT NULL AND jsonb_typeof(r.selected_answer) <> 'null'
               THEN 1 ELSE 0 END)::int AS wrong_count,
      SUM(CASE WHEN r.reviewed THEN 1 ELSE 0 END)::int AS reviewed_count,
      SUM(r.secs)::int AS total_time_seconds
    FROM resp r
    WHERE r.submitted_at IS NOT NULL
      AND r.counts_for_question_stats
    GROUP BY r.question_id
  ),
  wrong_tally AS (
    SELECT
      r.question_id,
      public.mock_answer_label(r.selected_answer) AS label,
      COUNT(*) AS n
    FROM resp r
    WHERE r.submitted_at IS NOT NULL
      AND r.counts_for_question_stats
      AND NOT r.correct
      AND r.selected_answer IS NOT NULL
      AND jsonb_typeof(r.selected_answer) <> 'null'
    GROUP BY r.question_id, public.mock_answer_label(r.selected_answer)
  ),
  wrong_top AS (
    SELECT DISTINCT ON (question_id) question_id, label
    FROM wrong_tally
    ORDER BY question_id, n DESC, label ASC
  )
  SELECT jsonb_build_object(
    'attempts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'attempt_id', ar.attempt_id,
        'correct_count', ar.correct_count,
        'total_time_seconds', ar.total_time_seconds,
        'section_question_count', ar.section_question_count
      )) FROM attempt_rows ar), '[]'::jsonb),
    'questions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'question_id', qr.question_id,
        'total_attempts', qr.total_attempts,
        'correct_count', qr.correct_count,
        'wrong_count', qr.wrong_count,
        'unanswered_count', qr.unanswered_count,
        'reviewed_count', qr.reviewed_count,
        'total_time_seconds', qr.total_time_seconds,
        'most_common_wrong', wt.label
      )) FROM q_rows qr LEFT JOIN wrong_top wt ON wt.question_id = qr.question_id), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_exam_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_analytics(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.grade_mock_answer(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mock_answer_norm(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mock_answer_label(jsonb) FROM PUBLIC;

-- responses is walked by attempt for the whole exam on every dashboard load.
CREATE INDEX IF NOT EXISTS idx_responses_attempt_question
  ON public.responses (attempt_id, question_id);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check: the grader must agree with the browser on the shapes that
-- actually occur, and the summary must refuse a non-owner without raising.
-- ============================================================
DO $$
BEGIN
  -- scalars
  ASSERT public.grade_mock_answer('"2"'::jsonb, '"2"'::jsonb),            'scalar equal';
  ASSERT public.grade_mock_answer('"B"'::jsonb, '" b "'::jsonb),          'scalar trims and lowercases';
  ASSERT NOT public.grade_mock_answer('"2"'::jsonb, '"3"'::jsonb),        'scalar unequal';
  ASSERT public.grade_mock_answer('2'::jsonb, '"2"'::jsonb),              'number key vs string answer';
  -- multi-select: set equality, order-insensitive
  ASSERT public.grade_mock_answer('["0","2"]'::jsonb, '["2","0"]'::jsonb), 'set equal out of order';
  ASSERT NOT public.grade_mock_answer('["0","2"]'::jsonb, '"0"'::jsonb),   'partial answer is wrong';
  ASSERT NOT public.grade_mock_answer('["0","2"]'::jsonb, '["0","1"]'::jsonb), 'wrong member';
  -- single answer stored as a 1-element array
  ASSERT public.grade_mock_answer('["1"]'::jsonb, '"1"'::jsonb),          'scalar against 1-element key';
  -- An ARRAY selection against a NON-array key. These go through the scalar and
  -- object branches, so they are the shapes that broke when the normaliser
  -- rendered arrays as jsonb text instead of as String().
  ASSERT public.grade_mock_answer('"1"'::jsonb, '["1"]'::jsonb),          'array selection vs scalar key';
  ASSERT public.grade_mock_answer('"0,2"'::jsonb, '["0","2"]'::jsonb),    'array selection vs comma-joined key';
  ASSERT public.grade_mock_answer('{"answer":"0,2"}'::jsonb, '["0","2"]'::jsonb), 'array selection vs comma-joined object key';
  -- Numeric scale: String(1.0) is "1", but jsonb stores the literal 1.0.
  ASSERT public.grade_mock_answer('1.0'::jsonb, '"1"'::jsonb),            'trailing zero in the key still matches';
  ASSERT public.grade_mock_answer('2.50'::jsonb, '"2.5"'::jsonb),         'stored scale does not change the answer';
  -- object-shaped keys
  ASSERT public.grade_mock_answer('{"answer":"7"}'::jsonb, '"7"'::jsonb), 'object answer key';
  ASSERT public.grade_mock_answer('{"value":"7"}'::jsonb, '"7"'::jsonb), 'object value key';
  ASSERT public.grade_mock_answer('{"answer":0}'::jsonb, '0'::jsonb),     'zero is a real answer';
  -- absent / empty
  ASSERT NOT public.grade_mock_answer(NULL, '"1"'::jsonb),                'no key is not correct';
  ASSERT NOT public.grade_mock_answer('""'::jsonb, '""'::jsonb),          'empty key is not a key';
  ASSERT NOT public.grade_mock_answer('"1"'::jsonb, NULL),                'no answer is not correct';
  ASSERT NOT public.grade_mock_answer('"1"'::jsonb, 'null'::jsonb),       'json null answer is not correct';
  -- Deliberate divergence from the browser, which returned TRUE here: an empty
  -- answer key means the question was never keyed, and "answered nothing" is
  -- not a correct answer to it. Publish now blocks an unkeyed question, so this
  -- only concerns rows authored before that gate.
  ASSERT NOT public.grade_mock_answer('[]'::jsonb, '[]'::jsonb),          'an empty key marks nothing correct';

  IF has_function_privilege('public', 'public.get_exam_analytics(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_exam_analytics is still executable by PUBLIC';
  END IF;

  -- Anonymous caller owns nothing, so this must come back empty, not error.
  PERFORM public.get_exam_analytics('00000000-0000-0000-0000-000000000000'::uuid);

  RAISE NOTICE 'get_exam_analytics installed; grader agrees with the browser';
END $$;
