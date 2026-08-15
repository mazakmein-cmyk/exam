-- ============================================================
-- LIVE EXAMS: attribute a student's answer by NAME TAG, not by position
--
-- ⚠️ DO NOT APPLY THIS ALONE. See "APPLY WITH PHASE 5" below.
--
-- WHAT CHANGES
-- submit_live_response decides two things about an incoming answer:
--   (1) is this question the one that is currently open?
--   (2) which canonical row does the response get filed under?
-- Both were answered by COUNTING: the student's question was located by
-- ROW_NUMBER() within their own language, and that number was compared to
-- live_exams.current_question_index and then used to pick the primary-language
-- row at the same number.
--
-- That is a seat number. It is only correct while every language holds the same
-- questions in the same order. When Hindi is one question short, the Hindi
-- student at position 5 is reading the translation of primary question 6 — and
-- today the server accepts it and files it under primary question 5. Nothing
-- errors. The report's "Q5" quietly becomes a blend of two different questions.
--
-- After this migration a tagged question resolves through
-- live_questions.question_group_id: the shared name tag that says "these two
-- rows are the same question". Position stops being the identity.
--
-- WHY THIS IS SAFE FOR A WELL-FORMED EXAM — provably identical
-- In an exam whose languages hold the same questions in the same order, the row
-- at own-ordinal N carries the tag of the primary row at ordinal N. So:
--     old: accept iff own_ordinal = current_index; file under primary[current_index]
--     new: accept iff tag_of(X) resolves to primary[current_index]; file there
-- resolve to the same condition and the same row, for every question. Nothing
-- moves.
--
-- WHERE IT DELIBERATELY DIFFERS
-- On a DRIFTED exam the two disagree, and that disagreement is the entire point.
-- Today the mis-matched submission is ACCEPTED and mis-filed, silently. Here it
-- is REFUSED with the same 'not currently open' error the function already
-- raises. A refusal is visible and recoverable; a silent mis-attribution is
-- neither, and it is only discovered when someone reads a report that has been
-- wrong for weeks.
--
-- ⚠️ APPLY WITH PHASE 5 — the client change that selects by name tag
-- Until the student client picks its question by tag, it still picks by array
-- position. On a drifted exam it would therefore hand this function a question
-- whose tag does not match the open one, and this function would refuse it —
-- turning a silent mis-attribution into a student who cannot submit at all.
-- That trade is only worth making once the client is choosing correctly, at
-- which point the mismatch stops occurring: the client picks the row whose tag
-- matches the open question, and this function accepts it.
--   * Well-formed exams: safe to apply alone. Nothing changes.
--   * Drifted exams: apply together with the client change, or the drifted
--     language is locked out.
-- The self-check at the end of this file names every exam in this database that
-- is affected, so the decision can be made on facts rather than on this comment.
--
-- WHAT IS NOT TOUCHED HERE, ON PURPOSE
-- get_revealed_live_answers, live_ordinal_min_seconds and live_ordinal_max_seconds
-- also match across languages by position and are also wrong. They are NOT in
-- this migration: reveal decides which answer keys become visible to students,
-- so getting it wrong leaks answers early, and it deserves its own change and
-- its own review rather than riding along with this one.
--
-- PRESERVED EXACTLY, because losing any of them is silent
--   * the 'Time is up for this question' deadline block, and v_deadline's reuse
--     in the time_taken_ms clamp — plpgsql does not parse a statement until
--     control reaches it, so dropping this would pass CREATE OR REPLACE, pass
--     every body-text test, and accept answers after the clock
--   * FOR SHARE on live_exams, which is what makes undo_last_live_unlock's
--     response count trustworthy
--   * grading against v_question.correct_answer — the row the student actually
--     read, never the twin's
--   * the INSERT column list and ON CONFLICT (live_question_id, user_id)
--   * question_ordinal still written, still the position, still the client's key
--   * v_result.is_correct := NULL, the server-side mask
-- ============================================================


-- ============================================================
-- 0. Dependency check — FIRST, before anything is replaced
--
--    This ran at the BOTTOM of the file in the first version, which was wrong.
--    A guard placed after the CREATE OR REPLACE statements only tells you the
--    dependency is missing once you have already swapped submit_live_response
--    for a body that calls a function which does not exist. Whether that is
--    survivable then depends entirely on whether the client wrapped the script
--    in a transaction — and if it did not, every answer submission in every
--    live exam raises "function live_primary_questions(uuid) does not exist"
--    until the helper is applied. A dependency check is worthless anywhere but
--    the top.
-- ============================================================
DO $$
BEGIN
  IF to_regprocedure('public.live_primary_questions(uuid)') IS NULL THEN
    RAISE EXCEPTION
      'live_primary_questions is missing. Apply 20260817000000_live_primary_questions_helper.sql first, then re-run this file. Nothing in this migration has been applied.';
  END IF;
END $$;


-- ============================================================
-- 1. live_canonical_for — "which row is this a translation of?"
--
--    The counterpart to live_primary_questions (20260817000000), which answers
--    "which row is at position N". This one answers the question position
--    cannot: given a row in any language, which primary-language row is it the
--    same question as?
--
--    NULL tag → the row is its own group and resolves to itself. That is not a
--    degraded path, it is the correct answer for every single-language exam,
--    where there is nothing to translate to. It is also what keeps a row the
--    backfill deliberately refused (20260816000000 skips cross-section pairs)
--    behaving exactly as it does today rather than resolving somewhere wrong.
--
--    Returns UUID, not the question row: a SECURITY DEFINER function returning
--    public.live_questions would hand correct_answer to any caller.
--
--    LIMIT 1 with a total order, because nothing in the schema stops two
--    primary rows sharing a tag. The audit reports that as a BLOCKER; this
--    makes the lookup deterministic in the meantime rather than arbitrary.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_canonical_for(
  p_live_exam_id UUID,
  p_live_question_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group  TEXT;
  v_result UUID;
BEGIN
  SELECT lq.question_group_id INTO v_group
  FROM public.live_questions lq
  JOIN public.live_sections ls ON ls.id = lq.live_section_id
  WHERE lq.id = p_live_question_id AND ls.live_exam_id = p_live_exam_id;

  IF v_group IS NULL THEN
    RETURN p_live_question_id;
  END IF;

  SELECT lq.id INTO v_result
  FROM public.live_questions lq
  JOIN public.live_sections ls ON ls.id = lq.live_section_id
  JOIN public.live_exams    le ON le.id = ls.live_exam_id
  WHERE ls.live_exam_id = p_live_exam_id
    AND ls.language = le.primary_language
    AND lq.question_group_id = v_group
  ORDER BY lq.global_index, lq.q_no, lq.id
  LIMIT 1;

  RETURN COALESCE(v_result, p_live_question_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.live_canonical_for(UUID, UUID) FROM PUBLIC;


-- ============================================================
-- 2. submit_live_response
--
--    Reproduced from 20260804000000_live_v2_controls.sql:462-587. The only
--    edited region is the open-question gate and the canonical lookup
--    (originally lines 523-535 and 546-557). Everything before and after is
--    verbatim.
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
  v_open_id        UUID;
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

  -- ─── The open question, and whether this is it ───────────────
  -- v_open_id is the canonical row the host currently has unlocked. It is still
  -- located by position, and correctly so: current_question_index IS a position,
  -- and it indexes the primary language, which is the one list guaranteed to
  -- exist. What changes is how the SUBMITTED row is matched against it.
  SELECT id INTO v_open_id
  FROM public.live_primary_questions(p_live_exam_id)
  WHERE ordinal = v_exam.current_question_index;

  IF v_question.question_group_id IS NOT NULL AND v_open_id IS NOT NULL THEN
    -- TAGGED PATH. The name tag is the identity, so the gate asks the only
    -- question that matters: is this row a translation of the open question?
    -- On a drifted exam this refuses where the old code silently mis-filed.
    v_canonical_id := public.live_canonical_for(p_live_exam_id, p_live_question_id);

    IF v_canonical_id IS DISTINCT FROM v_open_id THEN
      RAISE EXCEPTION 'This question is not currently open for answers';
    END IF;

    -- Past the gate the two are the same question, so its position is the
    -- host's cursor by definition. question_ordinal keeps its old meaning.
    v_ordinal := v_exam.current_question_index;
  ELSE
    -- UNTAGGED PATH — byte-for-byte today's behaviour, and reached by every
    -- single-language exam (where no tag is written and none is needed), by any
    -- row the backfill deliberately left unlinked, and whenever the primary
    -- language has no row at the current index.
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

    v_canonical_id := COALESCE(v_open_id, p_live_question_id);
  END IF;

  -- ─── Unchanged from here down ────────────────────────────────
  v_deadline := public.live_question_deadline(
    v_exam.current_question_unlocked_at,
    v_question.time_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() > v_deadline THEN
    RAISE EXCEPTION 'Time is up for this question';
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
-- 3. Self-check — name every exam whose behaviour actually changes
--
--    Runs live_canonical_for against every question in the database and
--    compares it with the position-based canonical it replaces. For a
--    well-formed exam the two agree everywhere and this prints a clean line.
--    Where they disagree, the exam is drifted: the answer was being mis-filed
--    before, and after this migration a student in that language is refused
--    until the client selects by tag.
--
--    NOTICE, not EXCEPTION. A disagreement is not a reason to abort — it is
--    precisely the condition this work exists to fix, and blocking would leave
--    the broken exams broken. But it must be SEEN, because it is the list of
--    exams that need the client change applied at the same time.
-- ============================================================
DO $$
DECLARE
  v_checked  INTEGER := 0;
  v_diff     INTEGER := 0;
  r          RECORD;
BEGIN
  -- (The dependency check lives at the top of this file, deliberately.)
  WITH by_position AS (
    SELECT
      ls.live_exam_id AS exam_id,
      lq.id           AS question_id,
      ls.language,
      (ROW_NUMBER() OVER (
         PARTITION BY ls.live_exam_id, ls.language
         ORDER BY lq.global_index, lq.q_no, lq.id
       ) - 1)::INTEGER AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON ls.id = lq.live_section_id
  ),
  resolved AS (
    SELECT
      b.exam_id,
      b.question_id,
      b.language,
      (SELECT p.id FROM public.live_primary_questions(b.exam_id) p WHERE p.ordinal = b.ordinal) AS by_pos,
      public.live_canonical_for(b.exam_id, b.question_id)                                       AS by_tag
    FROM by_position b
  )
  SELECT count(*), count(*) FILTER (WHERE by_tag IS DISTINCT FROM COALESCE(by_pos, question_id))
  INTO v_checked, v_diff
  FROM resolved;

  IF v_diff = 0 THEN
    RAISE NOTICE 'name-tag matching agrees with position for all % question(s): no exam changes behaviour', v_checked;
  ELSE
    RAISE NOTICE 'name-tag matching DIFFERS from position for % of % question(s). These exams are drifted — they were being mis-filed before, and their non-primary students will now be REFUSED until the client selects by name tag. Apply the client change with this migration:', v_diff, v_checked;

    FOR r IN
      WITH by_position AS (
        SELECT ls.live_exam_id AS exam_id, lq.id AS question_id, ls.language,
               (ROW_NUMBER() OVER (
                  PARTITION BY ls.live_exam_id, ls.language
                  ORDER BY lq.global_index, lq.q_no, lq.id
                ) - 1)::INTEGER AS ordinal
        FROM public.live_questions lq
        JOIN public.live_sections ls ON ls.id = lq.live_section_id
      )
      SELECT e.name AS exam_name, b.language, count(*) AS n
      FROM by_position b
      JOIN public.live_exams e ON e.id = b.exam_id
      WHERE public.live_canonical_for(b.exam_id, b.question_id) IS DISTINCT FROM
            COALESCE((SELECT p.id FROM public.live_primary_questions(b.exam_id) p WHERE p.ordinal = b.ordinal), b.question_id)
      GROUP BY e.name, b.language
      ORDER BY e.name, b.language
    LOOP
      RAISE NOTICE '  • "%" [%] — % question(s) resolve differently', r.exam_name, r.language, r.n;
    END LOOP;
  END IF;
END $$;
