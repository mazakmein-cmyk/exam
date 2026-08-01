-- ============================================================
-- PHASE 0 VERIFICATION — read only, changes nothing.
-- Paste into the Supabase SQL editor after running the Phase 0 migration.
-- Every row must say PASS.
-- ============================================================

WITH checks AS (

  -- 1. live_exams gained all 11 settings/state columns
  SELECT '1. live_exams columns' AS check_name,
         count(*)::text || ' of 11' AS detail,
         (count(*) = 11) AS ok
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'live_exams'
    AND column_name IN (
      'current_question_extra_seconds','scheduled_start_at','auto_start',
      'privacy_mode','leaderboard_visibility','present_show_leaderboard',
      'present_show_river','celebrate_seq','report_share_token',
      'report_public','origin_exam_id')

  UNION ALL

  -- 2. live_question_analytics gained the B6 time-profile columns
  SELECT '2. analytics B6 columns',
         count(*)::text || ' of 8',
         (count(*) = 8)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'live_question_analytics'
    AND column_name IN (
      'median_time_ms','fast_correct','slow_correct','fast_wrong',
      'slow_wrong','impulsive_wrong','time_histogram','confusion_count')

  UNION ALL

  -- 3. The three new tables exist
  SELECT '3. new tables',
         coalesce(string_agg(table_name, ', ' ORDER BY table_name), '(none)'),
         (count(*) = 3)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('live_presence','live_confusion_signals','live_unlock_log')

  UNION ALL

  -- 4. RLS is on for all three (writes go through RPCs; only creators read)
  SELECT '4. RLS enabled on new tables',
         count(*)::text || ' of 3',
         (count(*) = 3)
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('live_presence','live_confusion_signals','live_unlock_log')
    AND rowsecurity = true

  UNION ALL

  -- 5. The new functions exist
  SELECT '5. new functions',
         coalesce(string_agg(p.proname, ', ' ORDER BY p.proname), '(none)'),
         (count(*) = 4)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('live_question_deadline','live_session_sync',
                      'live_open_question_tally','flag_live_confusion')

  UNION ALL

  -- 6. THE FAN-OUT FIX — these two must NOT be in the realtime publication
  SELECT '6. fan-out fix (participants/responses OUT of realtime)',
         CASE WHEN count(*) = 0 THEN 'both removed'
              ELSE 'STILL PUBLISHED: ' || string_agg(tablename, ', ') END,
         (count(*) = 0)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename IN ('live_participants','live_responses')

  UNION ALL

  -- 7. ...while the two cheap ones must still be there, or nothing pushes
  SELECT '7. live_exams + analytics STILL in realtime',
         coalesce(string_agg(tablename, ', ' ORDER BY tablename), '(none)'),
         (count(*) = 2)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename IN ('live_exams','live_question_analytics')

  UNION ALL

  -- 8. Every deadline consumer routes through the shared helper
  SELECT '8. deadline consumers use live_question_deadline',
         count(*)::text || ' of 3',
         (count(*) = 3)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_revealed_live_answers','get_my_live_responses','submit_live_response')
    AND pg_get_functiondef(p.oid) LIKE '%live_question_deadline%'

  UNION ALL

  -- 9. The unlock RPC records history (A10 restores from it) and clears granted time
  SELECT '9. unlock RPC writes live_unlock_log',
         'checked',
         (pg_get_functiondef(p.oid) LIKE '%live_unlock_log%'
          AND pg_get_functiondef(p.oid) LIKE '%current_question_extra_seconds = 0%')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'unlock_next_live_question'

  UNION ALL

  -- 10. The deadline helper agrees with the client: base + extra + 2s grace
  SELECT '10. deadline helper maths',
         to_char(public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, 30),
                 'HH24:MI:SS') || ' (expect 10:01:32)',
         (public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, 30)
            = '2026-08-01 10:01:32+00'::timestamptz)

  UNION ALL

  -- 11. A NULL extra_seconds must not annihilate the deadline
  SELECT '11. deadline helper tolerates NULL extra',
         'checked',
         (public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, NULL)
            = '2026-08-01 10:01:02+00'::timestamptz)

  UNION ALL

  -- 12. leaderboard_visibility is constrained to the three known values
  SELECT '12. leaderboard_visibility CHECK constraint',
         'checked',
         EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.live_exams'::regclass
                   AND conname = 'live_exams_leaderboard_visibility_check')

  UNION ALL

  -- 13. Index for B6 buckets / B14 streaks (a seq scan per question without it)
  SELECT '13. live_responses user+ordinal index',
         'checked',
         EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND indexname = 'idx_live_responses_user_ordinal')
)
SELECT
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END AS result,
  check_name,
  detail
FROM checks
ORDER BY check_name;
