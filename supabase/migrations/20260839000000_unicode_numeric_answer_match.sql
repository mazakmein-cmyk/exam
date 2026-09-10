-- ============================================================
-- THE SAME ANSWER, TYPED DIFFERENTLY, STOPS BEING WRONG (issue 16 residual)
--
-- TWO GAPS, BOTH INVISIBLE WHEN THEY BITE:
--
-- 1. UNICODE. The same Hindi word arrives as different byte sequences from
--    different keyboards — one IME saves a combined character, another a base
--    letter plus a separate mark. On screen: pixel-identical. To a string
--    comparison: unequal. A student whose keyboard composes "दिल्ली"
--    differently from the answer key's transliteration tool was marked wrong
--    against an answer that RENDERS identically to theirs, systematically, on
--    every such question. Fix: NFC-normalize both sides before comparing.
--
-- 2. NUMERIC STRINGS. The grader knew 5.0 = 5 only when the key was stored as
--    a JSON NUMBER; "5.0" vs "5" as strings never matched, and the browser's
--    graders knew no numeric equivalence at all — so the server and the marks
--    engine could rule differently on the same answer. Fix: a string that is
--    a PLAIN decimal literal canonicalises to its numeric text, under a guard
--    regex that excludes commas ("1,000"), exponents ("1e3") and >15-digit
--    precision traps — those stay text, identically, on both graders.
--
-- The client mirror is lib/answerNormalize.js (plus the deliberate copy in
-- scoringEngine.ts) — same NFC, same regex, same order. If one changes,
-- change all.
--
-- OLD GRADES ARE UNTOUCHED, BY OWNER DECISION: responses keep the is_correct
-- stamped when they were submitted; nothing is re-graded and no rank moves
-- retroactively. This fixes grading from now on.
--
-- COST: zero — a transformation inside comparisons that already run.
--
-- Requires (apply first): 20260828000000 (mock_answer_norm/grade_mock_answer).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'grade_mock_answer') THEN
    RAISE EXCEPTION 'apply 20260828000000_exam_analytics_summary.sql first';
  END IF;
END $$;

-- Same shape as the 20260828 definition; the string paths gain NFC and the
-- plain-decimal canon. The number branch already used trim_scale, and
-- mock_answer_label stays deliberately raw — it is a display label, not a
-- comparison key.
CREATE OR REPLACE FUNCTION public.mock_answer_norm(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN NULL
    WHEN jsonb_typeof(v) = 'string' THEN
      CASE
        WHEN btrim(normalize(v #>> '{}', NFC)) ~ '^[+-]?([0-9]{1,15}(\.[0-9]{1,10})?|\.[0-9]{1,10})$'
          THEN trim_scale(btrim(normalize(v #>> '{}', NFC))::numeric)::text
        ELSE lower(btrim(normalize(v #>> '{}', NFC)))
      END
    WHEN jsonb_typeof(v) = 'number' THEN lower(btrim(trim_scale((v #>> '{}')::numeric)::text))
    WHEN jsonb_typeof(v) = 'object' THEN '[object object]'
    WHEN jsonb_typeof(v) = 'array' THEN lower(btrim(COALESCE((
      SELECT string_agg(
               CASE
                 WHEN jsonb_typeof(t.e) = 'null' THEN ''
                 WHEN jsonb_typeof(t.e) = 'string' THEN normalize(t.e #>> '{}', NFC)
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

REVOKE EXECUTE ON FUNCTION public.mock_answer_norm(jsonb) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check: the new rules hold, AND every behaviour 20260828000000 pinned
-- still holds — this function sits under every grader.
-- ============================================================
DO $$
BEGIN
  -- NEW: Unicode — composed and decomposed forms of the same word match.
  ASSERT public.grade_mock_answer(to_jsonb('दिल्ली'::text), to_jsonb(normalize('दिल्ली', NFD))),
    'NFD-composed Hindi must match the NFC key';
  ASSERT public.grade_mock_answer(to_jsonb(normalize('café', NFD)), to_jsonb('café'::text)),
    'a decomposed accent must match the composed key';
  ASSERT public.grade_mock_answer(to_jsonb(' दिल्ली '::text), to_jsonb('दिल्ली'::text)),
    'trim still applies around normalized text';

  -- NEW: numeric strings.
  ASSERT public.grade_mock_answer('"5"'::jsonb, '"5.0"'::jsonb),   'string 5.0 equals string 5';
  ASSERT public.grade_mock_answer('"5"'::jsonb, '"05"'::jsonb),    'leading zero is the same number';
  ASSERT public.grade_mock_answer('"5"'::jsonb, '"+5"'::jsonb),    'an explicit plus is the same number';
  ASSERT public.grade_mock_answer('"0.5"'::jsonb, '".5"'::jsonb),  'a bare leading dot is the same number';
  ASSERT NOT public.grade_mock_answer('"1000"'::jsonb, '"1,000"'::jsonb),
    'commas stay text on both graders — the client cannot parse them either';
  ASSERT NOT public.grade_mock_answer('"1000"'::jsonb, '"1e3"'::jsonb),
    'exponents stay text on both graders';

  -- STILL TRUE: everything 20260828000000 pinned.
  ASSERT public.grade_mock_answer('"2"'::jsonb, '"2"'::jsonb),            'scalar equal';
  ASSERT public.grade_mock_answer('"B"'::jsonb, '" b "'::jsonb),          'scalar trims and lowercases';
  ASSERT NOT public.grade_mock_answer('"2"'::jsonb, '"3"'::jsonb),        'scalar unequal';
  ASSERT public.grade_mock_answer('2'::jsonb, '"2"'::jsonb),              'number key vs string answer';
  ASSERT public.grade_mock_answer('["0","2"]'::jsonb, '["2","0"]'::jsonb), 'set equal out of order';
  ASSERT NOT public.grade_mock_answer('["0","2"]'::jsonb, '"0"'::jsonb),   'partial answer is wrong';
  ASSERT NOT public.grade_mock_answer('["0","2"]'::jsonb, '["0","1"]'::jsonb), 'wrong member';
  ASSERT public.grade_mock_answer('["1"]'::jsonb, '"1"'::jsonb),          'scalar against 1-element key';
  ASSERT public.grade_mock_answer('"1"'::jsonb, '["1"]'::jsonb),          'array selection vs scalar key';
  ASSERT public.grade_mock_answer('"0,2"'::jsonb, '["0","2"]'::jsonb),    'array selection vs comma-joined key';
  ASSERT public.grade_mock_answer('{"answer":"0,2"}'::jsonb, '["0","2"]'::jsonb), 'array selection vs comma-joined object key';
  ASSERT public.grade_mock_answer('1.0'::jsonb, '"1"'::jsonb),            'trailing zero in the key still matches';
  ASSERT public.grade_mock_answer('2.50'::jsonb, '"2.5"'::jsonb),         'stored scale does not change the answer';
  ASSERT public.grade_mock_answer('{"answer":"7"}'::jsonb, '"7"'::jsonb), 'object answer key';
  ASSERT public.grade_mock_answer('{"value":"7"}'::jsonb, '"7"'::jsonb),  'object value key';
  ASSERT public.grade_mock_answer('{"answer":0}'::jsonb, '0'::jsonb),     'zero is a real answer';
  ASSERT NOT public.grade_mock_answer(NULL, '"1"'::jsonb),                'no key is not correct';
  ASSERT NOT public.grade_mock_answer('""'::jsonb, '""'::jsonb),          'empty key is not a key';
  ASSERT NOT public.grade_mock_answer('"1"'::jsonb, NULL),                'no answer is not correct';
  ASSERT NOT public.grade_mock_answer('"1"'::jsonb, 'null'::jsonb),       'json null answer is not correct';
  ASSERT NOT public.grade_mock_answer('[]'::jsonb, '[]'::jsonb),          'an empty key marks nothing correct';

  RAISE NOTICE 'answers now compare in one canonical form: NFC unicode + plain-decimal canon, old grades untouched';
END $$;
