-- ============================================================
-- LIVE EXAM NAME-TAG AUDIT — read only, changes nothing.
--
-- Run this BEFORE 20260816000000_live_question_group_backfill.sql and before
-- any function change. It answers one question: can live exams safely switch
-- from matching translations BY POSITION to matching them BY question_group_id?
--
-- Today every runtime path resolves a student's question to its primary-language
-- twin by counting: ROW_NUMBER() OVER (ORDER BY global_index, q_no, id) - 1,
-- computed inside the student's own language. That is a seat number, not a name
-- tag, and it silently mis-pairs the moment two languages hold different numbers
-- of questions.
--
-- Only MULTI-LANGUAGE exams are audited. A single-language exam has nothing to
-- match against — its "translation" is itself — so a missing name tag there is
-- harmless. (This rests on supported_languages being frozen after creation:
-- updateLiveExam's type permits writing it, but no caller does. If an
-- add-a-language feature ever ships, that assumption dies and single-language
-- exams must be audited too.)
--
-- RUN AS THE TABLE OWNER — i.e. the Supabase SQL editor, not an app session.
-- RLS is enabled on live_exams/live_sections/live_questions. Under a restricted
-- role the policies silently filter rows and every check below returns green
-- for data it simply cannot see. This audit fails OPEN, so the role matters.
--
-- HOW TO READ THE OUTPUT
--   severity = 'EMPTY'    → the audit found nothing to audit. Check the row.
--   severity = 'BLOCKER'  → must be resolved before the semantic change ships
--   severity = 'BACKFILL' → the backfill migration fixes it
--   severity = 'GATE'     → structural; Phase 6's publish gate is what prevents it
--   severity = 'OK'       → nothing found for that check
--
-- GO / NO-GO: zero rows of BOTH finding D and finding E.
-- Both mean an existing name tag points somewhere other than where position
-- points, so switching to name tags silently reinterprets which question
-- existing responses belong to. D catches a tag aimed at the wrong ordinal;
-- E catches a tag aimed at nothing at all. D structurally cannot see E's case
-- (its join to primary_tags finds no row), which is why they are separate.
--
-- Every check emits an 'OK' row when it finds nothing, so a check can never
-- vanish from the output — a missing row would otherwise read as "clean".
-- Exam names are suffixed with a short id because two exams may share a name.
-- ============================================================

WITH multi AS (
  SELECT
    e.id,
    e.name || ' [' || left(e.id::TEXT, 8) || ']' AS name,
    e.status,
    e.primary_language,
    e.supported_languages
  FROM public.live_exams e
  WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
),
q AS (
  SELECT
    e.id               AS exam_id,
    e.name             AS exam_name,
    e.primary_language,
    s.language,
    s.id               AS section_id,
    s.section_group_id,
    lq.id              AS question_id,
    lq.q_no,
    lq.question_group_id,
    -- The exact expression every runtime function uses today.
    (ROW_NUMBER() OVER (
       PARTITION BY e.id, s.language
       ORDER BY lq.global_index, lq.q_no, lq.id
     ) - 1)::INTEGER   AS ordinal
  FROM multi e
  JOIN public.live_sections  s  ON s.live_exam_id    = e.id
  JOIN public.live_questions lq ON lq.live_section_id = s.id
),
-- The language universe, derived from the EXAM rather than from observed
-- questions. Building it from `q` (an inner-join chain down to live_questions)
-- was a false-negative factory: a language with zero questions produced no row,
-- so finding B — whose entire job is count mismatch — printed a green tick for
-- the largest mismatch there is. That is the default shape of a bilingual exam,
-- because createLiveExam inserts sections for every language up front and the
-- questions are authored afterwards, one language at a time.
-- Three sources are unioned because none alone is complete: live_sections.language
-- is not constrained to supported_languages, and primary_language need not appear
-- in either.
langs AS (
  SELECT m.id AS exam_id, m.name AS exam_name, m.primary_language, l.language
  FROM multi m
  CROSS JOIN LATERAL (
    SELECT s.language
    FROM public.live_sections s
    WHERE s.live_exam_id = m.id
    UNION
    SELECT u FROM unnest(m.supported_languages) AS u
    UNION
    SELECT m.primary_language
  ) l
),
counts AS (
  SELECT
    l.exam_id, l.exam_name, l.primary_language, l.language,
    count(qq.question_id) AS n
  FROM langs l
  LEFT JOIN q qq ON qq.exam_id = l.exam_id AND qq.language = l.language
  GROUP BY 1, 2, 3, 4
),
primary_tags AS (
  SELECT exam_id, ordinal, question_group_id
  FROM q
  WHERE language = primary_language AND question_group_id IS NOT NULL
),
findings AS (

  -- ─── 0. Scope — sorted FIRST, because an empty audit looks identical to a
  -- clean one. This project has previously been bitten by running against the
  -- wrong Supabase project (config.toml and .env name different ones).
  SELECT '0. scope'::TEXT AS finding,
         (CASE WHEN (SELECT count(*) FROM multi) = 0 THEN 'EMPTY' ELSE 'SCOPE' END)::TEXT AS severity,
         ((SELECT count(*) FROM multi)::TEXT || ' multi-language exam(s)')::TEXT AS exam_name,
         ((SELECT count(*) FROM q)::TEXT || ' question(s)')::TEXT AS language,
         (CASE WHEN (SELECT count(*) FROM multi) = 0
            THEN 'NOTHING WAS AUDITED. Every check below is vacuously green. Confirm you are connected to the right project before reading this as clean.'
            ELSE 'single-language exams are deliberately not audited — nothing to match against'
          END)::TEXT AS detail

  -- ─── A. Missing name tags ───
  UNION ALL
  SELECT 'A. no name tag', 'BACKFILL',
         exam_name, language,
         count(*)::TEXT || ' question(s) have no question_group_id'
  FROM q WHERE question_group_id IS NULL
  GROUP BY exam_id, exam_name, language

  UNION ALL
  SELECT 'A. no name tag', 'OK', '—', '—',
         'every question in every multi-language exam is tagged'
  WHERE NOT EXISTS (SELECT 1 FROM q WHERE question_group_id IS NULL)

  -- ─── B. Language holds a different number of questions ───
  -- The mismatch position-matching structurally cannot detect, and the one that
  -- splits the room. Counts come from `counts`, which now includes languages
  -- holding zero questions.
  UNION ALL
  SELECT 'B. question count differs from primary', 'GATE',
         c.exam_name, c.language,
         c.n::TEXT || ' questions vs primary''s ' || COALESCE(p.n, 0)::TEXT
  FROM counts c
  LEFT JOIN counts p ON p.exam_id = c.exam_id AND p.language = c.primary_language
  WHERE c.language <> c.primary_language
    AND c.n <> COALESCE(p.n, 0)

  UNION ALL
  SELECT 'B. question count differs from primary', 'OK', '—', '—',
         'every language matches its primary question count'
  WHERE NOT EXISTS (
    SELECT 1 FROM counts c
    LEFT JOIN counts p ON p.exam_id = c.exam_id AND p.language = c.primary_language
    WHERE c.language <> c.primary_language
      AND c.n <> COALESCE(p.n, 0)
  )

  -- ─── C. Same name tag twice inside one language ───
  -- Would make a canonical lookup non-deterministic — strictly worse than the
  -- deterministic ROW_NUMBER it replaces. Must be zero.
  UNION ALL
  SELECT 'C. duplicate name tag in one language', 'BLOCKER',
         exam_name, language,
         'tag ' || question_group_id || ' appears ' || count(*)::TEXT || ' times'
  FROM q WHERE question_group_id IS NOT NULL
  GROUP BY exam_id, exam_name, language, question_group_id
  HAVING count(*) > 1

  UNION ALL
  SELECT 'C. duplicate name tag in one language', 'OK', '—', '—',
         'no name tag repeats inside a language'
  WHERE NOT EXISTS (
    SELECT 1 FROM q WHERE question_group_id IS NOT NULL
    GROUP BY exam_id, language, question_group_id HAVING count(*) > 1
  )

  -- ─── D. Name tag disagrees with position ← GO/NO-GO ───
  -- The tag says "I am the translation of primary ordinal X" but this row sits
  -- at ordinal Y. Today the runtime believes Y. After the change it believes X.
  UNION ALL
  SELECT 'D. name tag disagrees with position', 'BLOCKER',
         o.exam_name, o.language,
         'sits at ordinal ' || o.ordinal::TEXT ||
         ' but is tagged as the twin of primary ordinal ' || p.ordinal::TEXT ||
         ' (q_no ' || o.q_no::TEXT || ')'
  FROM q o
  JOIN primary_tags p ON p.exam_id = o.exam_id AND p.question_group_id = o.question_group_id
  WHERE o.language <> o.primary_language AND o.ordinal <> p.ordinal

  UNION ALL
  SELECT 'D. name tag disagrees with position', 'OK', '—', '—',
         'every existing name tag agrees with the position the runtime uses'
  WHERE NOT EXISTS (
    SELECT 1 FROM q o
    JOIN primary_tags p ON p.exam_id = o.exam_id AND p.question_group_id = o.question_group_id
    WHERE o.language <> o.primary_language AND o.ordinal <> p.ordinal
  )

  -- ─── E. Translation whose name tag matches nothing in primary ← GO/NO-GO ───
  -- BLOCKER, not GATE: this reinterprets existing responses exactly as D does.
  -- Today the row resolves by position to SOME primary question; after the
  -- change its tag resolves to nothing and it falls back to itself. D cannot
  -- see this case, because D's join to primary_tags finds no row to compare.
  UNION ALL
  SELECT 'E. orphan translation', 'BLOCKER',
         o.exam_name, o.language,
         'q_no ' || o.q_no::TEXT || ' (ordinal ' || o.ordinal::TEXT ||
         ') carries a tag with no primary-language twin'
  FROM q o
  LEFT JOIN primary_tags p ON p.exam_id = o.exam_id AND p.question_group_id = o.question_group_id
  WHERE o.language <> o.primary_language
    AND o.question_group_id IS NOT NULL
    AND p.question_group_id IS NULL

  UNION ALL
  SELECT 'E. orphan translation', 'OK', '—', '—',
         'every tagged translation has a primary-language twin'
  WHERE NOT EXISTS (
    SELECT 1 FROM q o
    LEFT JOIN primary_tags p ON p.exam_id = o.exam_id AND p.question_group_id = o.question_group_id
    WHERE o.language <> o.primary_language
      AND o.question_group_id IS NOT NULL
      AND p.question_group_id IS NULL
  )

  -- ─── F. Section present in primary but missing in a language ───
  -- Languages enumerated from `langs`, not from observed questions, so a
  -- language whose sections were never created is still checked.
  UNION ALL
  SELECT DISTINCT 'F. section missing in a language', 'GATE',
         e.name, l.language,
         'section "' || ps.name || '" has no counterpart'
  FROM multi e
  JOIN langs l ON l.exam_id = e.id AND l.language <> e.primary_language
  JOIN public.live_sections ps
    ON ps.live_exam_id = e.id AND ps.language = e.primary_language
  WHERE ps.section_group_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.live_sections ss
      WHERE ss.live_exam_id = e.id
        AND ss.language = l.language
        AND ss.section_group_id = ps.section_group_id
    )

  UNION ALL
  SELECT 'F. section missing in a language', 'OK', '—', '—',
         'every primary section has a counterpart in every language'
  WHERE NOT EXISTS (
    SELECT 1
    FROM multi e
    JOIN langs l ON l.exam_id = e.id AND l.language <> e.primary_language
    JOIN public.live_sections ps
      ON ps.live_exam_id = e.id AND ps.language = e.primary_language
    WHERE ps.section_group_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.live_sections ss
        WHERE ss.live_exam_id = e.id
          AND ss.language = l.language
          AND ss.section_group_id = ps.section_group_id
      )
  )

  -- ─── G. Section with no section_group_id ───
  -- Finding F can only check sections that HAVE a group id, so an untagged
  -- section is invisible to it. It is also invisible to the backfill's
  -- same-section guard, so its questions stay unlinked.
  UNION ALL
  SELECT 'G. section has no group id', 'GATE',
         e.name, s.language,
         'section "' || s.name || '" has a NULL section_group_id — cannot be matched across languages'
  FROM multi e
  JOIN public.live_sections s ON s.live_exam_id = e.id
  WHERE s.section_group_id IS NULL

  UNION ALL
  SELECT 'G. section has no group id', 'OK', '—', '—',
         'every section carries a section_group_id'
  WHERE NOT EXISTS (
    SELECT 1
    FROM multi e
    JOIN public.live_sections s ON s.live_exam_id = e.id
    WHERE s.section_group_id IS NULL
  )
)
SELECT
  CASE severity
    WHEN 'EMPTY'    THEN '⚠️'
    WHEN 'SCOPE'    THEN '🔎'
    WHEN 'BLOCKER'  THEN '🛑'
    WHEN 'BACKFILL' THEN '🔧'
    WHEN 'GATE'     THEN '🚧'
    ELSE '✅'
  END AS flag,
  severity,
  finding,
  exam_name,
  language,
  detail
FROM findings
ORDER BY
  CASE severity
    WHEN 'EMPTY'    THEN 0
    WHEN 'SCOPE'    THEN 0
    WHEN 'BLOCKER'  THEN 1
    WHEN 'BACKFILL' THEN 2
    WHEN 'GATE'     THEN 3
    ELSE 4
  END,
  finding, exam_name, language, detail;
