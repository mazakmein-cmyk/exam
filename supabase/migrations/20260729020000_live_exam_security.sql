-- ============================================================
-- LIVE EXAM SECURITY HARDENING
-- 1. Hide correct_answer from students at the DB level (view without the column;
--    base-table student SELECT policy removed).
-- 2. Server-side grading + server-side timestamps: submissions go through a
--    SECURITY DEFINER RPC that grades against the DB copy of correct_answer,
--    enforces the currently-unlocked question, applies a 2s grace window, and
--    makes the first submission final (no overwrites).
-- 3. Session control RPCs stamp now() (DB time) instead of trusting client clocks.
-- 4. Answer reveal RPC: correct answers are only readable once a question's
--    timer (+grace) has ended, or the exam has ended.
-- 5. Participant score columns protected from self-inflation by trigger.
-- 6. Multi-language fix: responses are canonicalized to the primary-language
--    question row and stamped with question_ordinal so analytics and reviews
--    aggregate across languages.
-- Only touches live_* objects. No mock-exam table is modified.
-- ============================================================

-- ============================================================
-- 0. live_responses.question_ordinal — ordinal position of the question
--    (0-based, order of play) so clients can key responses independently
--    of which language row they submitted against.
-- ============================================================
ALTER TABLE public.live_responses
  ADD COLUMN IF NOT EXISTS question_ordinal INTEGER NOT NULL DEFAULT -1;

-- ============================================================
-- 1. Hide correct_answer from students
-- ============================================================

-- Students no longer read the base table (creators keep their FOR ALL policy).
DROP POLICY IF EXISTS "Anyone can view live questions of joinable exams" ON public.live_questions;

-- Student-facing view: every column EXCEPT correct_answer, limited to joinable exams.
-- Runs with definer rights (owner bypasses RLS), which is exactly the point:
-- expose a column subset the base-table policies can't express.
CREATE OR REPLACE VIEW public.live_questions_student AS
SELECT
  lq.id,
  lq.live_section_id,
  lq.q_no,
  lq.text,
  lq.options,
  lq.answer_type,
  lq.time_seconds,
  lq.image_url,
  lq.image_urls,
  lq.question_group_id,
  lq.global_index,
  lq.section_label,
  lq.created_at
FROM public.live_questions lq
WHERE lq.live_section_id IN (
  SELECT ls.id
  FROM public.live_sections ls
  JOIN public.live_exams le ON ls.live_exam_id = le.id
  WHERE le.status IN ('published', 'live', 'ended')
);

GRANT SELECT ON public.live_questions_student TO authenticated, anon;

-- ============================================================
-- 2. Shared grading helper (mirrors the client's original semantics:
--    array answers match by inclusion of the raw or stringified value;
--    scalars compare as strings; arrays submitted for array answers
--    compare as sets)
-- ============================================================
CREATE OR REPLACE FUNCTION public.grade_live_answer(p_correct JSONB, p_selected JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sel_text TEXT;
BEGIN
  IF p_correct IS NULL OR p_selected IS NULL
     OR jsonb_typeof(p_correct) = 'null' OR jsonb_typeof(p_selected) = 'null' THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_correct) = 'array' THEN
    IF jsonb_typeof(p_selected) = 'array' THEN
      -- multi-select: set equality
      RETURN p_correct <@ p_selected AND p_selected <@ p_correct;
    END IF;
    v_sel_text := trim(both '"' from p_selected::text);
    RETURN p_correct @> p_selected
        OR p_correct @> to_jsonb(v_sel_text);
  END IF;

  RETURN trim(both '"' from p_correct::text) = trim(both '"' from p_selected::text);
END;
$$;

-- ============================================================
-- 3. Answer reveal RPC — correct answers become readable only once a
--    question's timer + 2s grace has fully ended (or the exam ended).
--    Ordinals are computed per language so multi-language exams reveal
--    every translation of a finished question.
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
  SELECT t.id, t.correct_answer
  FROM (
    SELECT
      lq.id,
      lq.correct_answer,
      lq.time_seconds,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ) t
  WHERE v_exam.status = 'ended'
     OR t.ordinal < v_exam.current_question_index
     OR (
       t.ordinal = v_exam.current_question_index
       AND v_exam.current_question_unlocked_at IS NOT NULL
       AND now() >= v_exam.current_question_unlocked_at
                    + make_interval(secs => t.time_seconds + 2)
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revealed_live_answers(UUID) TO authenticated;

-- ============================================================
-- 4. Server-side submission RPC
--    - only while the exam is live and the question is the unlocked one
--    - accepted until unlock + time_seconds + 2s grace (DB clock)
--    - graded server-side; time taken measured server-side
--    - first submission is final (ON CONFLICT DO NOTHING)
--    - canonicalized to the primary-language question row
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
  v_uid UUID := auth.uid();
  v_exam public.live_exams;
  v_question public.live_questions;
  v_lang TEXT;
  v_ordinal INTEGER;
  v_canonical_id UUID;
  v_is_correct BOOLEAN;
  v_time_taken_ms INTEGER;
  v_deadline TIMESTAMPTZ;
  v_result public.live_responses;
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

  -- Timer window: unlock .. unlock + time_seconds + 2s grace (DB clock)
  v_deadline := v_exam.current_question_unlocked_at
                + make_interval(secs => v_question.time_seconds + 2);
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
  v_time_taken_ms := LEAST(
    GREATEST((extract(epoch from (now() - v_exam.current_question_unlocked_at)) * 1000)::integer, 0),
    (v_question.time_seconds + 2) * 1000
  );

  INSERT INTO public.live_responses (
    live_exam_id, live_question_id, user_id, selected_answer,
    is_correct, time_taken_ms, submitted_at, question_ordinal
  ) VALUES (
    p_live_exam_id, v_canonical_id, v_uid, p_selected_answer,
    v_is_correct, v_time_taken_ms, now(), v_ordinal
  )
  ON CONFLICT (live_question_id, user_id) DO NOTHING;

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

-- Submissions now ONLY happen through the RPC: remove the direct INSERT path.
DROP POLICY IF EXISTS "Users can submit own live responses" ON public.live_responses;

-- Students read their own responses through an RPC that masks is_correct
-- while the question is still answerable (prevents a second account probing
-- correctness mid-question). Creators keep their SELECT policy.
DROP POLICY IF EXISTS "Users can view own live responses" ON public.live_responses;

CREATE OR REPLACE FUNCTION public.get_my_live_responses(p_live_exam_id UUID)
RETURNS SETOF public.live_responses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_exam public.live_exams;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;

  RETURN QUERY
  SELECT
    lr.id, lr.live_exam_id, lr.live_question_id, lr.user_id, lr.selected_answer,
    CASE
      WHEN v_exam.status = 'ended' THEN lr.is_correct
      WHEN lr.question_ordinal < v_exam.current_question_index THEN lr.is_correct
      WHEN lr.question_ordinal = v_exam.current_question_index
           AND v_exam.current_question_unlocked_at IS NOT NULL
           AND now() >= v_exam.current_question_unlocked_at + make_interval(secs => (
             SELECT lq.time_seconds FROM public.live_questions lq WHERE lq.id = lr.live_question_id
           ) + 2)
        THEN lr.is_correct
      ELSE NULL
    END AS is_correct,
    lr.time_taken_ms, lr.submitted_at, lr.question_ordinal
  FROM public.live_responses lr
  WHERE lr.live_exam_id = p_live_exam_id AND lr.user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_live_responses(UUID) TO authenticated;

-- ============================================================
-- 5. Session control RPCs — DB-clock timestamps, creator-only
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.live_exams;
BEGIN
  UPDATE public.live_exams
  SET status = 'live',
      started_at = now(),
      current_question_index = -1,
      current_question_unlocked_at = NULL
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'published'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot start: not the creator or exam is not published';
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_next_live_question(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.live_exams;
  v_question_count INTEGER;
  v_result public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'Exam is not live';
  END IF;

  SELECT COUNT(*) INTO v_question_count
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language;

  IF v_exam.current_question_index + 1 >= v_question_count THEN
    RAISE EXCEPTION 'No more questions to unlock';
  END IF;

  UPDATE public.live_exams
  SET current_question_index = v_exam.current_question_index + 1,
      current_question_unlocked_at = now()
  WHERE id = p_live_exam_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.live_exams;
  v_qid UUID;
BEGIN
  UPDATE public.live_exams
  SET status = 'ended',
      ended_at = now()
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'live'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot end: not the creator or exam is not live';
  END IF;

  -- Safety net: compute analytics for any unlocked primary-language question
  -- that never got them (e.g. the creator's tab was closed at timer expiry).
  FOR v_qid IN
    SELECT t.id
    FROM (
      SELECT lq.id,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_result.primary_language
    ) t
    WHERE t.ordinal <= v_result.current_question_index
      AND NOT EXISTS (
        SELECT 1 FROM public.live_question_analytics a
        WHERE a.live_exam_id = p_live_exam_id AND a.live_question_id = t.id
      )
  LOOP
    PERFORM public.compute_live_question_analytics(p_live_exam_id, v_qid);
  END LOOP;

  PERFORM public.compute_live_rankings(p_live_exam_id);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_live_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_next_live_question(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_live_session(UUID) TO authenticated;

-- ============================================================
-- 6. Participant hardening
-- ============================================================

-- The original UPDATE policy had USING but no WITH CHECK.
DROP POLICY IF EXISTS "Users can update own participant record" ON public.live_participants;
CREATE POLICY "Users can update own participant record"
  ON public.live_participants FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Students may only touch display_name / is_active on their own row.
-- Score columns are preserved (UPDATE) or zeroed (INSERT) unless the caller
-- is the exam creator (the ranking RPC runs with the creator's auth.uid()).
CREATE OR REPLACE FUNCTION public.protect_live_participant_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    ELSE
      NEW.total_correct  := 0;
      NEW.total_answered := 0;
      NEW.total_time_ms  := 0;
      NEW.rank           := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The two analytics/ranking RPCs from the base migration rely on the implicit
-- PUBLIC execute grant; make it explicit so a future REVOKE-from-PUBLIC
-- hardening pass can't silently break the creator's compute flow.
GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_live_rankings(UUID) TO authenticated;

DROP TRIGGER IF EXISTS trg_protect_live_participant_scores ON public.live_participants;
CREATE TRIGGER trg_protect_live_participant_scores
  BEFORE INSERT OR UPDATE ON public.live_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_live_participant_scores();
