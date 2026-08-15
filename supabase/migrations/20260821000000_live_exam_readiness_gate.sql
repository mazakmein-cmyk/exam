-- ============================================================
-- LIVE EXAMS: a real check before a session can start
--
-- WHAT EXISTS TODAY
-- The entire pre-flight for a live exam is one line in the client:
--
--     if (sections.length === 0) { toast("Add at least one section with questions.") }
--
-- It does not look at a single question. Its own message promises it checks for
-- questions; it does not. And it is client-side, which for this table means
-- advisory only — publishing is a plain UPDATE on live_exams permitted by the
-- creator's own RLS policy, so nothing stops it being set another way. Questions
-- can also be added AFTER publishing (handleAddQuestion has no status guard), so
-- even a perfect check at publish time says nothing about the exam that actually
-- goes live twenty minutes later.
--
-- WHY THE GATE IS THE POINT, NOT A GARNISH
-- The name-tag work fixed how a translation is MATCHED at run time. It did not
-- make translations correct — those are paired by position when a JSON is
-- imported, and that pairing is frozen into the tags. Moving the assumption from
-- run time to authoring time is only a win because an authoring-time pairing can
-- be inspected and refused before anyone sits down. This is where it gets
-- refused.
--
-- ONE VALIDATOR, TWO CALLERS
-- live_exam_readiness() is the single definition of "is this exam fit to run".
-- start_live_session RAISEs on its blockers, and the creator's UI renders the
-- same rows as a checklist. Writing the rule twice is how a gate ends up
-- blocking something the panel says is fine.
--
-- WHERE THE ENFORCEMENT SITS, AND WHY HERE
-- start_live_session is the one door every session passes through: it is an
-- RPC, it already checks the creator, and it is the only transition that can
-- put students in front of questions. A check at publish time is skippable
-- three ways; this one is not.
--
-- WHAT IS A BLOCKER VS A WARNING
-- Blocker: the session would be actively wrong — the room reads different
-- questions, answers attach to the wrong row, or everyone is marked wrong.
-- Warning: worth knowing, not worth refusing.
-- Marks are NOT checked. Live exams score on correctness and speed; there is no
-- marking scheme to be missing.
-- ============================================================


-- ============================================================
-- 1. live_exam_readiness — every reason this exam should not run
--
--    Returns zero rows for a healthy exam. Deliberately NOT security-scoped to
--    the creator: it reads no answer keys, only whether one is absent, and both
--    callers already establish who is asking.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_exam_readiness(p_live_exam_id UUID)
RETURNS TABLE (severity TEXT, code TEXT, language TEXT, detail TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH exam AS (
  SELECT e.id, e.primary_language, e.supported_languages,
         COALESCE(array_length(e.supported_languages, 1), 1) > 1 AS multi
  FROM public.live_exams e
  WHERE e.id = p_live_exam_id
),
-- The language universe from the EXAM, not from observed questions. Driving it
-- off the question rows would make a language with zero questions vanish — and
-- that is the default shape of a half-authored bilingual exam, so the check
-- that matters most would silently pass.
langs AS (
  SELECT x.id AS exam_id, x.primary_language, l.language
  FROM exam x
  CROSS JOIN LATERAL (
    SELECT s.language FROM public.live_sections s WHERE s.live_exam_id = x.id
    UNION SELECT u FROM unnest(x.supported_languages) AS u
    UNION SELECT x.primary_language
  ) l
  WHERE x.multi
),
q AS (
  SELECT
    s.language,
    s.section_group_id,
    s.name              AS section_name,
    lq.id,
    lq.q_no,
    lq.text,
    lq.image_url,
    lq.image_urls,
    lq.options,
    lq.option_image_urls,
    lq.answer_type,
    lq.correct_answer,
    lq.question_group_id,
    x.primary_language,
    (ROW_NUMBER() OVER (
       PARTITION BY s.language
       ORDER BY lq.global_index, lq.q_no, lq.id
     ) - 1)::INTEGER    AS ordinal,
    -- How many options a candidate could actually pick. Counting array length
    -- is a different question: a draft save leaves blank slots, and a blank slot
    -- renders as an unlabelled button nobody can choose. An option counts when
    -- it has text OR an image — figure questions are legitimately text-free.
    --
    -- The two arrays are joined BY ORDINALITY rather than subscripted, and that
    -- is not stylistic. option_image_urls is jsonb (20260731100000), not TEXT[],
    -- and subscripting it three ways at once: WITH ORDINALITY yields bigint
    -- where a jsonb subscript must be integer, jsonb arrays are 0-based while
    -- ORDINALITY is 1-based, and a JSON `null` element — which is exactly what
    -- an option with no picture stores — is not SQL NULL, so `IS NOT NULL` would
    -- have counted every empty slot as an image. jsonb_array_elements_text turns
    -- a JSON null into a real SQL NULL, so all three problems disappear.
    (
      SELECT count(*)
      FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(lq.options) = 'array' THEN lq.options ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS o(val, idx)
      LEFT JOIN jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(lq.option_image_urls) = 'array' THEN lq.option_image_urls ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS im(img, idx) ON im.idx = o.idx
      WHERE btrim(regexp_replace(COALESCE(o.val, ''), '<[^>]*>', '', 'g')) <> ''
         OR btrim(COALESCE(im.img, '')) <> ''
    )                   AS filled_options,
    -- Mirrors the mock module's hasAnswerKey: "   " and ["", ""] grade every
    -- candidate wrong exactly as NULL does, and option index 0 is a real answer,
    -- so this tests emptiness rather than falsiness.
    CASE
      WHEN lq.correct_answer IS NULL OR jsonb_typeof(lq.correct_answer) = 'null' THEN true
      WHEN jsonb_typeof(lq.correct_answer) = 'array' THEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(lq.correct_answer) e WHERE btrim(e) <> ''
      )
      ELSE COALESCE(btrim(lq.correct_answer #>> '{}'), '') = ''
    END                 AS answer_missing
  FROM exam x
  JOIN public.live_sections  s  ON s.live_exam_id    = x.id
  JOIN public.live_questions lq ON lq.live_section_id = s.id
),
counts AS (
  SELECT l.language, l.primary_language,
         (SELECT count(*) FROM q WHERE q.language = l.language) AS n
  FROM langs l
)

-- ─── Structural: is there anything to run at all ───
SELECT 'blocker', 'no_sections', NULL::TEXT,
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.live_sections WHERE live_exam_id = x.id)
            THEN 'This exam has no sections yet.'
            ELSE 'There are no sections in the primary language, so there is nothing to play.'
       END
FROM exam x
WHERE NOT EXISTS (SELECT 1 FROM public.live_sections WHERE live_exam_id = x.id)
   OR NOT EXISTS (
        SELECT 1 FROM public.live_sections s
        WHERE s.live_exam_id = x.id AND s.language = x.primary_language
      )

UNION ALL
-- PER SECTION, not per exam. The first version asked only whether the exam had
-- any questions at all, so an exam with one full section and one empty one
-- passed — and an empty section is a dead entry in the student's tab strip with
-- nothing to play and nothing to grade. The mock publish gate has always checked
-- this per section (PublishExamDialog.tsx: "has no questions yet"); the live gate
-- did not, which is the gap this closes.
--
-- Cannot be derived from the `q` CTE: an empty section contributes no rows
-- there, so it is invisible to anything built on it. This has to walk
-- live_sections directly.
SELECT 'blocker', 'no_questions', s.language,
       'Section "' || s.name || '" has no questions.'
FROM exam x
JOIN public.live_sections s ON s.live_exam_id = x.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.live_questions lq WHERE lq.live_section_id = s.id
)

-- ─── Per question: would it grade, and can it be answered ───
UNION ALL
-- Blank means no text AND no picture. A diagram question with an empty text
-- field is a legitimate paper, and blocking it would refuse a whole class of
-- exam the editor deliberately supports — the same rule the mock publish gate
-- uses. image_urls is TEXT[] here, unlike option_image_urls which is jsonb.
SELECT 'blocker', 'blank_question', q.language,
       'Q' || q.q_no || ' in "' || q.section_name || '" has no text and no image.'
FROM q
WHERE btrim(regexp_replace(COALESCE(q.text, ''), '<[^>]*>', '', 'g')) = ''
  AND q.image_url IS NULL
  AND COALESCE(array_length(q.image_urls, 1), 0) = 0

UNION ALL
SELECT 'blocker', 'invalid_question', q.language,
       'Q' || q.q_no || ' in "' || q.section_name || '" has ' ||
       CASE WHEN q.answer_type IS NULL OR btrim(q.answer_type) = ''
            THEN 'no question type.'
            ELSE 'fewer than 2 usable options.' END
FROM q
WHERE q.answer_type IS NULL
   OR btrim(q.answer_type) = ''
   OR (q.answer_type IN ('single', 'multi', 'multiple') AND q.filled_options < 2)

UNION ALL
-- The one that costs the most in a live room: grade_live_answer returns false
-- for a NULL key, so a keyless question marks EVERY student wrong at once, on
-- the leaderboard, on the projector, mid-session, with no way to take it back.
SELECT 'blocker', 'missing_answer', q.language,
       'Q' || q.q_no || ' in "' || q.section_name || '" has no correct answer marked — everyone would be marked wrong.'
FROM q
WHERE q.answer_missing
  AND COALESCE(q.answer_type, '') NOT IN ('subjective', '')

-- ─── Cross-language: does every student see the same exam ───
UNION ALL
SELECT 'blocker', 'question_count_mismatch', c.language,
       'This language has ' || c.n || ' question(s); the primary language has ' ||
       COALESCE((SELECT n FROM counts WHERE language = c.primary_language), 0) ||
       '. The room would split.'
FROM counts c
WHERE c.language <> c.primary_language
  AND c.n <> COALESCE((SELECT n FROM counts WHERE language = c.primary_language), 0)

UNION ALL
SELECT 'blocker', 'section_missing_in_lang', l.language,
       'Section "' || ps.name || '" has no counterpart in this language.'
FROM langs l
JOIN public.live_sections ps
  ON ps.live_exam_id = l.exam_id AND ps.language = l.primary_language
WHERE l.language <> l.primary_language
  AND ps.section_group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.live_sections ss
    WHERE ss.live_exam_id = l.exam_id
      AND ss.language = l.language
      AND ss.section_group_id = ps.section_group_id
  )

UNION ALL
SELECT 'blocker', 'not_linked_to_primary', l.language,
       'Q' || p.q_no || ' in "' || p.section_name || '" has no linked version in this language.'
FROM langs l
JOIN q p ON p.language = l.primary_language
WHERE l.language <> l.primary_language
  AND p.question_group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM q t
    WHERE t.language = l.language AND t.question_group_id = p.question_group_id
  )

UNION ALL
SELECT 'blocker', 'orphan_translation', t.language,
       'Q' || t.q_no || ' is linked to a question that does not exist in the primary language.'
FROM q t
WHERE t.language <> t.primary_language
  AND t.question_group_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM q p
    WHERE p.language = t.primary_language AND p.question_group_id = t.question_group_id
  )

UNION ALL
SELECT 'blocker', 'duplicate_group_in_language', d.language,
       'Two questions in this language share one link, so answers could attach to either.'
FROM (
  SELECT q.language, q.question_group_id
  FROM q
  WHERE q.question_group_id IS NOT NULL
  GROUP BY q.language, q.question_group_id
  HAVING count(*) > 1
) d

UNION ALL
-- Warning, not blocker. The tally keys on the option INDEX, so unequal option
-- counts across a pair make the creator's breakdown meaningless — but the
-- session still runs and every student is still graded against the paper in
-- front of them.
SELECT 'warning', 'option_count_mismatch', t.language,
       'Q' || t.q_no || ' has ' || t.filled_options || ' options; its primary version has ' || p.filled_options || '.'
FROM q t
JOIN q p ON p.language = t.primary_language
        AND p.question_group_id = t.question_group_id
WHERE t.language <> t.primary_language
  AND t.question_group_id IS NOT NULL
  AND t.filled_options <> p.filled_options;
$$;

REVOKE EXECUTE ON FUNCTION public.live_exam_readiness(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_exam_readiness(UUID) TO authenticated;

-- PostgREST caches the schema, and a brand-new function it has not seen is a
-- 404 (PGRST202) rather than a call that reaches Postgres. This is the only
-- migration in this batch that adds a function the CLIENT calls — the other
-- helpers are revoked from PUBLIC and invoked server-side — so it is the only
-- one that needs the nudge. Without it the readiness panel keeps reporting
-- "could not check the exam" after a migration that plainly applied.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 2. start_live_session — refuse to open a session that would be wrong
--
--    Reproduced from 20260802000000_live_v2_foundations.sql:454-484. The only
--    addition is the readiness check, and it sits BEFORE the UPDATE so a refused
--    start leaves the exam exactly as it was — still 'published', still editable,
--    nothing half-transitioned.
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result   public.live_exams;
  v_blockers INTEGER;
  v_detail   TEXT;
BEGIN
  -- Creator check first, so a stranger learns nothing about the exam's contents.
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cannot start: not the creator or exam is not published';
  END IF;

  SELECT count(*) INTO v_blockers
  FROM public.live_exam_readiness(p_live_exam_id)
  WHERE severity = 'blocker';

  IF v_blockers > 0 THEN
    -- Capped at three. This surfaces in a toast, and the creator's real fix is
    -- the readiness panel, which lists all of them with a repair action.
    SELECT string_agg(detail, ' ')
    INTO v_detail
    FROM (
      SELECT detail FROM public.live_exam_readiness(p_live_exam_id)
      WHERE severity = 'blocker'
      ORDER BY code, detail
      LIMIT 3
    ) t;

    RAISE EXCEPTION 'LIVE_NOT_READY:% issue(s) must be fixed before going live. %',
      v_blockers, COALESCE(v_detail, '');
  END IF;

  UPDATE public.live_exams
  SET status = 'live',
      started_at = now(),
      current_question_index = -1,
      current_question_unlocked_at = NULL,
      current_question_extra_seconds = 0
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'published'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot start: not the creator or exam is not published';
  END IF;

  -- A fresh session must not inherit unlock history: A10 restores from this
  -- log, and a stale row would resurrect a timestamp from a previous run.
  -- Reachable only once per session (start requires status='published').
  DELETE FROM public.live_unlock_log WHERE live_exam_id = p_live_exam_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_live_session(UUID) TO authenticated;


-- ============================================================
-- 3. Self-check — the gate must not block exams that are fine
--
--    A gate that refuses a healthy exam is worse than no gate: it strands a
--    creator minutes before a class with no way through. So this reports, per
--    existing exam, what the new check would say — run it and look before
--    anyone tries to go live.
-- ============================================================
DO $$
DECLARE
  v_total    INTEGER := 0;
  v_blocked  INTEGER := 0;
  r          RECORD;
BEGIN
  SELECT count(*) INTO v_total FROM public.live_exams;

  FOR r IN
    SELECT e.id, e.name, e.status,
           (SELECT count(*) FROM public.live_exam_readiness(e.id) WHERE severity = 'blocker') AS blockers
    FROM public.live_exams e
    ORDER BY e.name
  LOOP
    IF r.blockers > 0 THEN
      v_blocked := v_blocked + 1;
      RAISE NOTICE '  • "%" [%] — % blocker(s) would prevent going live', r.name, r.status, r.blockers;
    END IF;
  END LOOP;

  IF v_blocked = 0 THEN
    RAISE NOTICE 'readiness gate installed: all % live exam(s) pass, none would be blocked', v_total;
  ELSE
    RAISE NOTICE 'readiness gate installed: % of % live exam(s) currently have blockers (listed above). They can still be edited and published — only go-live is refused.', v_blocked, v_total;
  END IF;
END $$;
