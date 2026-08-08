-- ============================================================================
-- Has 20260815 (the window-nesting hotfix) been applied?
--
-- Read-only. Safe to run any number of times, on any database, at any point.
--
-- It answers two separate questions, because they can disagree: whether the
-- FUNCTIONS were replaced, and whether the BACKFILL actually ran. A paste that
-- aborted part-way could leave the first done and the second not.
--
-- Every value is derived with format() rather than ||, so this file cannot
-- repeat the untyped-literal bug it exists to check for.
-- ============================================================================
WITH fn AS (
  SELECT
    (SELECT prosrc FROM pg_proc WHERE proname = 'build_live_exam_report' LIMIT 1) AS report_src,
    (SELECT prosrc FROM pg_proc WHERE proname = 'compute_live_moments'   LIMIT 1) AS moments_src
),
counts AS (
  SELECT
    (SELECT COUNT(*) FROM public.live_exams WHERE ended_at IS NOT NULL) AS ended_sessions,
    (SELECT COUNT(*) FROM public.live_exam_reports)                     AS stored_reports,
    (SELECT COUNT(*) FROM public.live_moments)                          AS moments
),
checks AS (
  SELECT 1 AS n, 'build_live_exam_report' AS item,
    CASE
      WHEN report_src IS NULL
        THEN 'MISSING — migration 20260807 was never applied'
      WHEN report_src LIKE '%ROW_NUMBER() OVER (ORDER BY lp.joined_at%'
        THEN 'NOT APPLIED — the report page still shows the aggregate/window error'
      WHEN report_src LIKE '%lp.anon_ordinal%'
        THEN 'APPLIED'
      ELSE 'UNRECOGNISED — neither the broken body nor the fixed one'
    END AS status
  FROM fn

  UNION ALL SELECT 2, 'compute_live_moments',
    CASE
      WHEN moments_src IS NULL
        THEN 'MISSING — migration 20260805 was never applied'
      WHEN moments_src LIKE '%MAX(m.question_ordinal - ROW_NUMBER()%'
        THEN 'NOT APPLIED — moments still fail silently on every question'
      WHEN moments_src LIKE '%MAX(g.grp)%'
        THEN 'APPLIED'
      ELSE 'UNRECOGNISED — neither the broken body nor the fixed one'
    END
  FROM fn

  UNION ALL SELECT 3, 'report payloads',
    CASE
      WHEN ended_sessions = 0
        THEN 'no ended sessions yet — nothing to back-fill'
      WHEN stored_reports >= ended_sessions
        THEN format('BACKFILLED — %s payload(s) for %s ended session(s)', stored_reports, ended_sessions)
      ELSE format('INCOMPLETE — only %s payload(s) for %s ended session(s); re-run the migration',
                  stored_reports, ended_sessions)
    END
  FROM counts

  UNION ALL SELECT 4, 'moments recorded',
    CASE
      WHEN moments > 0 THEN format('%s row(s)', moments)
      ELSE 'none — expected if the backfill has not run, or if no session earned one'
    END
  FROM counts
)
SELECT item, status FROM checks ORDER BY n;
