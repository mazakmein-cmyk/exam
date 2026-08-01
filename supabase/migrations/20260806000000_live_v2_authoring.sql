-- ============================================================
-- LIVE EXAM v2 — PHASE 5: AUTHORING (C7) AND SCHEDULING (C10)
--
-- C10's columns already exist (scheduled_start_at, auto_start, added in Phase 0),
-- so scheduling is entirely client work. This migration is C7.
--
-- Why reordering needs a server function at all
-- ---------------------------------------------
-- Play order is `global_index`, and renumbering it was a client-side loop issuing
-- one UPDATE per question (renumberLiveGlobalIndexes in liveExamService). A
-- 200-question bilingual exam is up to 400 sequential round trips, and — worse —
-- a failure halfway leaves the exam in an order that matches neither the old one
-- nor the new. Play order IS the exam; a half-applied reorder is corruption.
--
-- The multi-language trap
-- ----------------------
-- Sibling translations are linked by question_group_id, and every ordinal RPC
-- resolves a question by ROW_NUMBER() over (global_index, q_no, id) WITHIN a
-- language. So moving the English Q4 without moving the Hindi Q4 does not produce
-- a visibly wrong list — it produces two languages whose ordinal 3 is a different
-- question, and every downstream thing keyed on ordinal (responses, analytics,
-- confusion signals, moments) quietly attaches to the wrong one.
--
-- This function therefore moves the whole group or nothing.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- reorder_live_section_questions
--
--    Rewrites q_no within one section from an explicit ordered list, propagates
--    the same order to every language sibling, and renumbers global_index across
--    the whole exam — all inside the one transaction a plpgsql function gives us.
--
--    Editor-only by contract: the caller must not offer this while a session is
--    live, because current_question_index points at a POSITION, and shuffling
--    underneath it changes which question "number 7" means mid-flight. Enforced
--    here as well as in the UI, because "the UI does not offer it" is not a
--    guarantee.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reorder_live_section_questions(
  p_section_id UUID,
  p_ordered_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam_id     UUID;
  v_status      TEXT;
  v_expected    INTEGER;
  v_provided    INTEGER;
  v_lang        TEXT;
  v_group_order UUID[];
BEGIN
  SELECT le.id, le.status
  INTO v_exam_id, v_status
  FROM public.live_sections ls
  JOIN public.live_exams le ON le.id = ls.live_exam_id
  WHERE ls.id = p_section_id AND le.user_id = auth.uid();

  IF v_exam_id IS NULL THEN
    RAISE EXCEPTION 'REORDER_NOT_CREATOR';
  END IF;

  -- current_question_index is a position, so reordering during a session would
  -- silently redefine which question is on screen.
  IF v_status IN ('live', 'ended') THEN
    RAISE EXCEPTION 'REORDER_SESSION_ACTIVE';
  END IF;

  -- The provided list must be exactly this section's questions: no additions, no
  -- omissions, no duplicates. Anything else and the renumber below would leave
  -- gaps or collisions in q_no.
  SELECT COUNT(*) INTO v_expected
  FROM public.live_questions WHERE live_section_id = p_section_id;

  SELECT COUNT(DISTINCT id) INTO v_provided
  FROM unnest(p_ordered_ids) AS id
  WHERE id IN (SELECT lq.id FROM public.live_questions lq WHERE lq.live_section_id = p_section_id);

  IF v_provided <> v_expected OR array_length(p_ordered_ids, 1) IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'REORDER_SET_MISMATCH:%', v_expected;
  END IF;

  -- ─── 1. This section ──────────────────────────────────────
  -- Two passes via a large offset: q_no has no unique constraint today, but
  -- writing 1..n directly over an existing 1..n is the kind of thing that starts
  -- failing the day someone adds one.
  UPDATE public.live_questions lq
  SET q_no = ord.rn + 100000
  FROM (SELECT id, ROW_NUMBER() OVER () AS rn FROM unnest(p_ordered_ids) AS id) ord
  WHERE lq.id = ord.id;

  UPDATE public.live_questions
  SET q_no = q_no - 100000
  WHERE live_section_id = p_section_id AND q_no > 100000;

  -- ─── 2. Every language sibling ────────────────────────────
  -- The new order expressed as group ids, then applied to the matching section in
  -- each other language. A question with no group id is unlinked and is left
  -- alone: it exists in one language only.
  SELECT array_agg(lq.question_group_id ORDER BY lq.q_no)
  INTO v_group_order
  FROM public.live_questions lq
  WHERE lq.live_section_id = p_section_id
    AND lq.question_group_id IS NOT NULL;

  IF v_group_order IS NOT NULL AND array_length(v_group_order, 1) > 0 THEN
    FOR v_lang IN
      SELECT DISTINCT ls.language
      FROM public.live_sections ls
      WHERE ls.live_exam_id = v_exam_id
        AND ls.id <> p_section_id
        AND ls.section_group_id = (
          SELECT section_group_id FROM public.live_sections WHERE id = p_section_id
        )
    LOOP
      UPDATE public.live_questions lq
      SET q_no = ord.rn + 100000
      FROM (
        SELECT g AS group_id, ROW_NUMBER() OVER () AS rn
        FROM unnest(v_group_order) AS g
      ) ord
      WHERE lq.question_group_id::text = ord.group_id::text
        AND lq.live_section_id IN (
          SELECT ls2.id FROM public.live_sections ls2
          WHERE ls2.live_exam_id = v_exam_id AND ls2.language = v_lang
            AND ls2.section_group_id = (
              SELECT section_group_id FROM public.live_sections WHERE id = p_section_id
            )
        );

      UPDATE public.live_questions lq
      SET q_no = lq.q_no - 100000
      WHERE lq.q_no > 100000
        AND lq.live_section_id IN (
          SELECT ls2.id FROM public.live_sections ls2
          WHERE ls2.live_exam_id = v_exam_id AND ls2.language = v_lang
        );
    END LOOP;
  END IF;

  -- ─── 3. Renumber play order across the exam ───────────────
  PERFORM public.renumber_live_global_indexes(v_exam_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_live_section_questions(UUID, UUID[]) TO authenticated;


-- ============================================================
-- renumber_live_global_indexes — the client loop, moved server-side
--
--    Walks each language's sections in sort_order and its questions in q_no,
--    assigning a dense 0-based global_index. Every language is walked with the
--    same section-group order, so sibling questions keep matching indexes and the
--    per-language ordinal computations continue to agree.
--
--    Replaces a browser loop that issued one UPDATE per question.
-- ============================================================
CREATE OR REPLACE FUNCTION public.renumber_live_global_indexes(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'REORDER_NOT_CREATOR';
  END IF;

  UPDATE public.live_questions lq
  SET global_index = t.new_index
  FROM (
    SELECT
      q.id,
      (ROW_NUMBER() OVER (
        PARTITION BY s.language
        ORDER BY s.sort_order, s.id, q.q_no, q.id
      ) - 1)::INTEGER AS new_index
    FROM public.live_questions q
    JOIN public.live_sections s ON s.id = q.live_section_id
    WHERE s.live_exam_id = p_live_exam_id
  ) t
  WHERE lq.id = t.id
    AND lq.global_index IS DISTINCT FROM t.new_index;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renumber_live_global_indexes(UUID) TO authenticated;
