-- ============================================================
-- LIVE EXAMS: NAME-TAG MATCHING — did it land? Read only, changes nothing.
--
-- Run AFTER 20260816000000 through 20260822000000. Every check must PASS.
--
-- This asserts the INSTALLED state, not file contents. Migrations here are
-- pasted by hand into the SQL editor, so "the file is in the repo" and "the
-- function in the database does that" are different claims, and only the second
-- one matters to a student sitting an exam. The .test.mjs suite covers the
-- files; this covers the database.
--
-- Two conventions carried from verify_phase2.sql, both learned the hard way:
--
-- 1. NEVER grep pg_get_functiondef() raw — a check once passed because the words
--    it searched for appeared in a COMMENT rather than in code. Every text
--    assertion below runs against a comment-stripped copy.
--
-- 2. NEVER put an assertion in a FROM-based branch alone. If the object is
--    missing the branch yields NO ROW and vanishes from the output instead of
--    reporting FAIL — which is how a missing trigger once showed up as thirteen
--    rows rather than a failure. Every check uses a scalar subquery or EXISTS so
--    the row always exists and can always fail.
-- ============================================================

WITH fns AS (
  SELECT
    p.proname AS name,
    regexp_replace(
      regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
      '/\*.*?\*/', '', 'gs'
    ) AS code
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
checks AS (

  -- ─── The three functions exist ───────────────────────────
  SELECT '01. live_primary_questions exists (the play order, defined once)' AS check_name,
         'checked' AS detail,
         EXISTS (SELECT 1 FROM fns WHERE name = 'live_primary_questions') AS ok

  UNION ALL
  SELECT '02. live_canonical_for exists (which row is this a translation of)', 'checked',
         EXISTS (SELECT 1 FROM fns WHERE name = 'live_canonical_for')

  UNION ALL
  SELECT '03. live_exam_readiness exists (the gate)', 'checked',
         EXISTS (SELECT 1 FROM fns WHERE name = 'live_exam_readiness')

  -- ─── They are wired into the callers that matter ─────────
  UNION ALL
  SELECT '04. submit_live_response attributes by name tag',
         'the whole point of 20260819000000',
         (SELECT code LIKE '%live_canonical_for%' FROM fns WHERE name = 'submit_live_response')

  UNION ALL
  SELECT '05. submit_live_response still refuses answers after the clock',
         'plpgsql does not parse until reached; losing this is silent',
         (SELECT code LIKE '%Time is up for this question%' FROM fns WHERE name = 'submit_live_response')

  UNION ALL
  SELECT '06. submit_live_response keeps the untagged fallback',
         'every single-language exam takes that branch',
         (SELECT code LIKE '%ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id)%'
          FROM fns WHERE name = 'submit_live_response')

  UNION ALL
  SELECT '07. live_session_sync publishes the open question tag',
         'without it the student client can only count',
         (SELECT code LIKE '%current_question_group_id%' FROM fns WHERE name = 'live_session_sync')

  UNION ALL
  SELECT '08. live_session_sync kept the E3 rank gate',
         'six bodies exist; rebuilding from the wrong one reverts it',
         (SELECT code LIKE '%leaderboard_visibility = ''off''%' FROM fns WHERE name = 'live_session_sync')

  UNION ALL
  SELECT '09. start_live_session refuses an exam that is not ready',
         'publish is a plain UPDATE, so this is the only real gate',
         (SELECT code LIKE '%live_exam_readiness%' FROM fns WHERE name = 'start_live_session')

  UNION ALL
  SELECT '10. start_live_session still wipes the unlock log',
         'a stale row resurrects a previous run''s timestamp',
         (SELECT code LIKE '%DELETE FROM public.live_unlock_log%' FROM fns WHERE name = 'start_live_session')

  UNION ALL
  SELECT '11. reveal decides by play order, not own-language position',
         'otherwise a drifted language sees an answer mid-question',
         (SELECT code LIKE '%prim_tag%' FROM fns WHERE name = 'get_revealed_live_answers')

  UNION ALL
  SELECT '12. reveal still computes the deadline from the emitted row',
         'the deadline belongs to the paper in front of the student',
         (SELECT code LIKE '%live_question_deadline%' FROM fns WHERE name = 'get_revealed_live_answers')

  UNION ALL
  SELECT '13. the time bounds follow play order too',
         'both, or they disagree about where a question plays',
         (SELECT count(*) = 2 FROM fns
          WHERE name IN ('live_ordinal_min_seconds', 'live_ordinal_max_seconds')
            AND code LIKE '%prim_tag%')

  UNION ALL
  SELECT '14. live_ordinal_min_seconds still takes the minimum across languages',
         'verify_phase2 check 16 asserts these exact spellings',
         (SELECT code LIKE '%MIN(t.time_seconds)%' AND code LIKE '%PARTITION BY ls.language%'
          FROM fns WHERE name = 'live_ordinal_min_seconds')

  -- ─── The helpers are not reachable from the API ──────────
  UNION ALL
  SELECT '15. helpers are revoked from PUBLIC',
         'PostgreSQL grants EXECUTE to PUBLIC by default',
         (SELECT bool_and(NOT has_function_privilege('public', p.oid, 'EXECUTE'))
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('live_primary_questions', 'live_canonical_for'))

  -- ─── The data the functions depend on ────────────────────
  UNION ALL
  SELECT '16. no untagged question in a multi-language exam',
         (SELECT count(*)::TEXT || ' untagged'
          FROM public.live_questions lq
          JOIN public.live_sections s ON s.id = lq.live_section_id
          JOIN public.live_exams    e ON e.id = s.live_exam_id
          WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
            AND lq.question_group_id IS NULL),
         (SELECT count(*) = 0
          FROM public.live_questions lq
          JOIN public.live_sections s ON s.id = lq.live_section_id
          JOIN public.live_exams    e ON e.id = s.live_exam_id
          WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
            AND lq.question_group_id IS NULL)

  UNION ALL
  SELECT '17. no name tag repeats inside one language',
         'a repeat makes the canonical lookup non-deterministic',
         (SELECT count(*) = 0 FROM (
            SELECT s.live_exam_id, s.language, lq.question_group_id
            FROM public.live_questions lq
            JOIN public.live_sections s ON s.id = lq.live_section_id
            WHERE lq.question_group_id IS NOT NULL
            GROUP BY s.live_exam_id, s.language, lq.question_group_id
            HAVING count(*) > 1
          ) d)

  -- ─── The helper is still what it replaced ────────────────
  UNION ALL
  SELECT '18. live_primary_questions equals the expression it extracted',
         'the sole claim of 20260817000000 was zero behaviour change',
         (
           SELECT NOT EXISTS (
             (SELECT e.id, h.id, h.ordinal
              FROM public.live_exams e
              CROSS JOIN LATERAL public.live_primary_questions(e.id) h
              EXCEPT
              SELECT ls.live_exam_id, lq.id,
                     (ROW_NUMBER() OVER (
                        PARTITION BY ls.live_exam_id
                        ORDER BY lq.global_index, lq.q_no, lq.id
                      ) - 1)::INTEGER
              FROM public.live_questions lq
              JOIN public.live_sections ls ON lq.live_section_id = ls.id
              JOIN public.live_exams    le ON le.id = ls.live_exam_id
              WHERE ls.language = le.primary_language)
             UNION ALL
             (SELECT ls.live_exam_id, lq.id,
                     (ROW_NUMBER() OVER (
                        PARTITION BY ls.live_exam_id
                        ORDER BY lq.global_index, lq.q_no, lq.id
                      ) - 1)::INTEGER
              FROM public.live_questions lq
              JOIN public.live_sections ls ON lq.live_section_id = ls.id
              JOIN public.live_exams    le ON le.id = ls.live_exam_id
              WHERE ls.language = le.primary_language
              EXCEPT
              SELECT e.id, h.id, h.ordinal
              FROM public.live_exams e
              CROSS JOIN LATERAL public.live_primary_questions(e.id) h)
           )
         )

  -- ─── What the gate would refuse — INFORMATIONAL, never fails ───
  --
  -- This was written as an assertion ("no exam is blocked") on the assumption
  -- that a blocked exam meant a false positive in the gate. It failed on install
  -- with 8, and every one was blocked for a real reason: questions with no
  -- correct answer marked, and one with fewer than two usable options. That is
  -- the gate doing its job, surfaced here instead of in front of a class — so
  -- failing on it reported a success as a defect.
  --
  -- Scoped to 'published' because that is the only status the gate can strand.
  -- A draft is still being built; 'live' and 'ended' are already past
  -- start_live_session, which is where the check runs.
  --
  -- Run this to see what is actually wrong:
  --   SELECT e.name, e.status, r.code, count(*), min(r.detail)
  --   FROM public.live_exams e
  --   CROSS JOIN LATERAL public.live_exam_readiness(e.id) r
  --   WHERE r.severity = 'blocker'
  --   GROUP BY e.name, e.status, r.code ORDER BY e.status, e.name;
  UNION ALL
  SELECT '19. published exams the gate would refuse (informational, never fails)',
         (SELECT count(*)::TEXT || ' of ' ||
                 (SELECT count(*)::TEXT FROM public.live_exams WHERE status = 'published') ||
                 ' published exam(s) would be refused go-live — fix them or unpublish; nothing else is affected'
          FROM public.live_exams e
          WHERE e.status = 'published'
            AND (SELECT count(*) FROM public.live_exam_readiness(e.id)
                 WHERE severity = 'blocker') > 0),
         true

  -- ─── The gate is not refusing for a reason that cannot apply ───
  --
  -- THIS one is a real assertion. Every cross-language blocker requires an exam
  -- with more than one language, and there are none — so any such row would mean
  -- the readiness rule fires on data that cannot exhibit the problem, which is
  -- the false-positive shape that would genuinely strand someone.
  UNION ALL
  SELECT '20. no cross-language blocker on a single-language exam',
         'a blocker that cannot apply is a false positive, and those do strand people',
         (SELECT count(*) = 0
          FROM public.live_exams e
          CROSS JOIN LATERAL public.live_exam_readiness(e.id) r
          WHERE COALESCE(array_length(e.supported_languages, 1), 1) = 1
            AND r.severity = 'blocker'
            AND r.code IN ('question_count_mismatch', 'section_missing_in_lang',
                           'not_linked_to_primary', 'orphan_translation',
                           'duplicate_group_in_language'))
)
SELECT
  CASE WHEN ok THEN '✅' ELSE '❌' END AS flag,
  CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result,
  check_name,
  detail
FROM checks
ORDER BY check_name;
