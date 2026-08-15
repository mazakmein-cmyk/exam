-- ============================================================
-- LIVE EXAMS: reveal and timer bounds follow the PLAY order, not a seat number
--
-- The last three functions that match across languages by counting.
--
-- ── THE REVEAL BUG IS NOT WHAT IT LOOKS LIKE ──
-- It is tempting to say a drifted translation gets handed the WRONG answer key.
-- It does not, and it is worth being precise, because the wrong diagnosis leads
-- to the wrong fix. get_revealed_live_answers selects `t.id, t.correct_answer`
-- from the SAME row — a question can only ever be paired with its own key.
--
-- The actual fault is DISCLOSURE TIMING. Revealability is decided by comparing a
-- row's OWN-LANGUAGE ordinal against current_question_index. On a drifted
-- language those two numbers describe different questions: a Hindi row sitting
-- at own-ordinal 4 may be the translation of the primary question at ordinal 5 —
-- the one currently on screen. Its ordinal is below the cursor, so the server
-- publishes its answer to every Hindi student while the host still has that
-- question open and the room is still answering it.
--
-- So the fix is not "reveal a different row". It is "decide revealability by
-- where the question actually PLAYS".
--
-- ── PLAY ORDINAL ──
-- The position a question is played at, in the host's numbering:
--   tagged   → the ordinal of the primary-language row sharing its name tag
--   untagged → its own-language ordinal, exactly as today
-- For a well-formed exam the two are equal everywhere and nothing changes.
--
-- ── WHY THE SAME IDEA FIXES THE TIMER BOUNDS ──
-- live_ordinal_min_seconds exists because translations may carry different
-- time_seconds, and a whole-session extension must be bounded by the SHORTEST
-- one — extend past it and the fastest-closing language has already published
-- its answer.
--
-- A naive "MIN over the name-tag group" would make this WORSE, and silently: an
-- unlinked sibling is not in the group, so it drops out of the MIN, the bound
-- RISES, and the creator can extend past a language's real end. Using play
-- ordinal avoids that by construction — an untagged row keeps its own ordinal
-- and therefore stays in the set. Every row still lands in exactly one bucket.
--
-- ── PRESERVED DELIBERATELY ──
--   * the deadline is still computed from each emitted row's OWN time_seconds
--     via live_question_deadline() — asserted by live-v2-answer-reveal.test.mjs
--   * `MIN(t.time_seconds)` and `PARTITION BY ls.language` remain literally in
--     live_ordinal_min_seconds, so verify_phase2.sql checks 15/16 keep passing.
--     They are body-text assertions: a correct rewrite that changed the spelling
--     would report as a regression, and a red check treated as "expected" is how
--     a real failure gets waved through.
--   * both bound functions keep their signatures, so add_live_question_time and
--     end_live_question_time need no change
--   * the play-ordinal computation is repeated in all three rather than factored
--     into a helper — precisely to keep those spellings where the verification
--     looks for them. Eight duplicated lines is the cheaper mistake.
-- ============================================================

DO $$
BEGIN
  IF to_regprocedure('public.live_primary_questions(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'live_primary_questions is missing. Apply 20260817000000_live_primary_questions_helper.sql first. Nothing in this migration has been applied.';
  END IF;
END $$;


-- ============================================================
-- 1. get_revealed_live_answers — publish an answer only once its question has
--    actually finished playing
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_revealed_live_answers(p_live_exam_id UUID)
RETURNS TABLE (live_question_id UUID, correct_answer JSONB)
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
    RETURN; -- nothing revealed for drafts / published-not-started / unknown exams
  END IF;

  RETURN QUERY
  WITH own AS (
    SELECT
      lq.id,
      lq.correct_answer,
      lq.time_seconds,
      lq.question_group_id,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ),
  -- Where each name tag plays. DISTINCT ON because nothing in the schema stops
  -- two primary rows sharing a tag; the readiness gate blocks that, but a
  -- fan-out here would duplicate rows into the reveal set rather than fail
  -- loudly, so it is made deterministic instead of assumed away.
  prim_tag AS (
    SELECT DISTINCT ON (lq.question_group_id)
           lq.question_group_id, p.ordinal
    FROM public.live_primary_questions(p_live_exam_id) p
    JOIN public.live_questions lq ON lq.id = p.id
    WHERE lq.question_group_id IS NOT NULL
    ORDER BY lq.question_group_id, p.ordinal
  ),
  t AS (
    SELECT
      o.id,
      o.correct_answer,
      o.time_seconds,
      -- Tagged rows play where their primary twin plays; untagged rows play
      -- where they sit. The LEFT JOIN never matches a NULL tag, so single-
      -- language exams take the second branch for every row — today's behaviour.
      COALESCE(pt.ordinal, o.ordinal) AS ordinal
    FROM own o
    LEFT JOIN prim_tag pt ON pt.question_group_id = o.question_group_id
  )
  SELECT t.id, t.correct_answer
  FROM t
  WHERE v_exam.status = 'ended'
     OR t.ordinal < v_exam.current_question_index
     OR (
       t.ordinal = v_exam.current_question_index
       AND v_exam.current_question_unlocked_at IS NOT NULL
       -- Still this row's OWN time_seconds: the deadline is a property of the
       -- paper in front of the student, not of the twin. Only the decision
       -- about WHICH questions are eligible moved.
       AND now() >= public.live_question_deadline(
             v_exam.current_question_unlocked_at,
             t.time_seconds,
             v_exam.current_question_extra_seconds
           )
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revealed_live_answers(UUID) TO authenticated;


-- ============================================================
-- 2. live_ordinal_min_seconds — the shortest sibling actually playing at N
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
  WITH own AS (
    SELECT
      lq.id,
      lq.time_seconds,
      lq.question_group_id,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ),
  prim_tag AS (
    SELECT DISTINCT ON (lq.question_group_id)
           lq.question_group_id, p.ordinal
    FROM public.live_primary_questions(p_live_exam_id) p
    JOIN public.live_questions lq ON lq.id = p.id
    WHERE lq.question_group_id IS NOT NULL
    ORDER BY lq.question_group_id, p.ordinal
  ),
  t AS (
    SELECT o.time_seconds, COALESCE(pt.ordinal, o.ordinal) AS ordinal
    FROM own o
    LEFT JOIN prim_tag pt ON pt.question_group_id = o.question_group_id
  )
  SELECT MIN(t.time_seconds)::INTEGER
  FROM t
  WHERE t.ordinal = p_ordinal;
$$;

GRANT EXECUTE ON FUNCTION public.live_ordinal_min_seconds(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 3. live_ordinal_max_seconds — the mirror, unchanged in intent
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
  WITH own AS (
    SELECT
      lq.id,
      lq.time_seconds,
      lq.question_group_id,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ),
  prim_tag AS (
    SELECT DISTINCT ON (lq.question_group_id)
           lq.question_group_id, p.ordinal
    FROM public.live_primary_questions(p_live_exam_id) p
    JOIN public.live_questions lq ON lq.id = p.id
    WHERE lq.question_group_id IS NOT NULL
    ORDER BY lq.question_group_id, p.ordinal
  ),
  t AS (
    SELECT o.time_seconds, COALESCE(pt.ordinal, o.ordinal) AS ordinal
    FROM own o
    LEFT JOIN prim_tag pt ON pt.question_group_id = o.question_group_id
  )
  SELECT MAX(t.time_seconds)::INTEGER
  FROM t
  WHERE t.ordinal = p_ordinal;
$$;

GRANT EXECUTE ON FUNCTION public.live_ordinal_max_seconds(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 4. Self-check
--
--    Executes all three, because plpgsql does not parse a statement until
--    control reaches it — two broken bodies in this project's history survived
--    eight migrations precisely because nothing ever ran them.
--
--    Then proves the change is behaviour-neutral where it should be: for every
--    exam, the set of rows the bound functions consider must be UNCHANGED from
--    the own-ordinal grouping, except where a name tag genuinely relocates a
--    question. Any exam where that differs is drifted, and is named.
-- ============================================================
DO $$
DECLARE
  v_exam    public.live_exams;
  v_moved   INTEGER := 0;
  r         RECORD;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams ORDER BY created_at LIMIT 1;

  IF v_exam.id IS NULL THEN
    RAISE NOTICE 'no live exams to execute against; bodies installed but not exercised';
  ELSE
    PERFORM public.get_revealed_live_answers(v_exam.id);
    PERFORM public.live_ordinal_min_seconds(v_exam.id, 0);
    PERFORM public.live_ordinal_max_seconds(v_exam.id, 0);
    RAISE NOTICE 'all three functions executed successfully against "%"', v_exam.name;
  END IF;

  FOR r IN
    WITH own AS (
      SELECT ls.live_exam_id, lq.id, lq.question_group_id,
             (ROW_NUMBER() OVER (
                PARTITION BY ls.live_exam_id, ls.language
                ORDER BY lq.global_index, lq.q_no, lq.id
              ) - 1)::INTEGER AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
    ),
    prim_tag AS (
      SELECT DISTINCT ON (e.id, lq.question_group_id)
             e.id AS exam_id, lq.question_group_id, p.ordinal
      FROM public.live_exams e
      CROSS JOIN LATERAL public.live_primary_questions(e.id) p
      JOIN public.live_questions lq ON lq.id = p.id
      WHERE lq.question_group_id IS NOT NULL
      ORDER BY e.id, lq.question_group_id, p.ordinal
    )
    SELECT e.name, count(*) AS n
    FROM own o
    JOIN public.live_exams e ON e.id = o.live_exam_id
    LEFT JOIN prim_tag pt
      ON pt.exam_id = o.live_exam_id AND pt.question_group_id = o.question_group_id
    WHERE COALESCE(pt.ordinal, o.ordinal) <> o.ordinal
    GROUP BY e.name
    ORDER BY e.name
  LOOP
    v_moved := v_moved + 1;
    RAISE NOTICE '  • "%" — % question(s) now reveal at a different position (this exam is drifted; those answers were being published early)', r.name, r.n;
  END LOOP;

  IF v_moved = 0 THEN
    RAISE NOTICE 'play order is unchanged for every exam: reveal timing and timer bounds behave exactly as before';
  END IF;
END $$;
