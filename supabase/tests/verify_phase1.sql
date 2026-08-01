-- ============================================================
-- PHASE 1 VERIFICATION — read only, changes nothing.
--
-- Run AFTER 20260803000000_live_v2_privacy.sql.
-- Check 5 is EXPECTED TO FAIL until you have deployed the Phase 1 client and
-- then run 20260803010000_live_v2_privacy_step3.sql. That is the whole point of
-- the two-step deploy: the old door stays open while the new client rolls out.
-- Everything else must be PASS immediately.
-- ============================================================

WITH checks AS (

  -- 1. The pseudonym generator exists and is deterministic
  SELECT '1. live_anon_name exists' AS check_name,
         coalesce(public.live_anon_name(0), '(null)') AS detail,
         (public.live_anon_name(0) IS NOT NULL) AS ok

  UNION ALL

  -- 2. 2304 distinct names before any wrap, so no class realistically collides
  SELECT '2. pseudonyms unique across 2304 ordinals',
         count(DISTINCT public.live_anon_name(g))::text || ' distinct',
         (count(DISTINCT public.live_anon_name(g)) = 2304)
  FROM generate_series(0, 2303) AS g

  UNION ALL

  -- 3. Stable: the same ordinal always yields the same name, so a student's
  --    pseudonym cannot change mid-session
  SELECT '3. pseudonym stable for an ordinal',
         public.live_anon_name(7) || ' = ' || public.live_anon_name(7),
         (public.live_anon_name(7) = public.live_anon_name(7)
          AND public.live_anon_name(7) <> public.live_anon_name(8))

  UNION ALL

  -- 4. The masked view exists
  SELECT '4. live_participants_public view exists',
         'checked',
         EXISTS (SELECT 1 FROM information_schema.views
                 WHERE table_schema = 'public'
                   AND table_name = 'live_participants_public')

  UNION ALL

  -- 5. ⚠️ EXPECTED FAIL until step 2 is run (see header)
  SELECT '5. old student policy on live_participants is gone',
         CASE WHEN count(*) = 0
              THEN 'removed — step 2 has run'
              ELSE 'still present — run step 2 after deploying the client' END,
         (count(*) = 0)
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'live_participants'
    AND policyname = 'Participants can view leaderboard'

  UNION ALL

  -- 6. ...but the creator's policy must survive, or the control room loses its
  --    leaderboard and the creator can never see a real name again
  SELECT '6. creator policy on live_participants intact',
         'checked',
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'live_participants'
                   AND policyname = 'Creator can view all participants')

  UNION ALL

  -- 7. The view must NOT be security_invoker: it deliberately runs with the
  --    owner's rights so it can expose a masked column set that base-table RLS
  --    cannot express. If this flips on, students see nothing at all.
  SELECT '7. view runs with owner rights (not security_invoker)',
         coalesce(array_to_string(c.reloptions, ', '), '(no options)'),
         (c.reloptions IS NULL
          OR NOT ('security_invoker=true' = ANY(c.reloptions)))
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'live_participants_public'

  UNION ALL

  -- 8. The view masks on privacy_mode
  SELECT '8. view masks display_name under privacy_mode',
         'checked',
         (pg_get_viewdef('public.live_participants_public'::regclass) LIKE '%privacy_mode%'
          AND pg_get_viewdef('public.live_participants_public'::regclass) LIKE '%live_anon_name%')

  UNION ALL

  -- 9. E3 is enforced in the view, not merely in the UI
  SELECT '9. view enforces leaderboard_visibility (E3)',
         'checked',
         (pg_get_viewdef('public.live_participants_public'::regclass) LIKE '%leaderboard_visibility%')

  UNION ALL

  -- 10. THE REALTIME LEAK. fastest_user_name is denormalised into a table that
  --     is broadcast to every student, and realtime cannot project columns — so
  --     the STORED value has to already be safe.
  SELECT '10. analytics stores a privacy-safe fastest name',
         'checked',
         (pg_get_functiondef(p.oid) LIKE '%live_anon_name%'
          AND pg_get_functiondef(p.oid) LIKE '%v_privacy%')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'compute_live_question_analytics'

  UNION ALL

  -- 11. No real name is left sitting in an analytics row of a privacy-mode exam
  --     (the migration back-fills these; a non-zero count means it did not run)
  SELECT '11. no unmasked fastest names remain under privacy mode',
         count(*)::text || ' leaked row(s)',
         (count(*) = 0)
  FROM public.live_question_analytics a
  JOIN public.live_exams le ON le.id = a.live_exam_id
  JOIN public.live_participants lp
    ON lp.live_exam_id = a.live_exam_id AND lp.user_id = a.fastest_user_id
  WHERE le.privacy_mode = true
    AND a.fastest_user_name IS NOT NULL
    AND a.fastest_user_name = lp.display_name

  UNION ALL

  -- 12. live_participants is still OUT of realtime (Phase 0). If it came back,
  --     masking would be pointless: realtime delivers whole rows.
  SELECT '12. live_participants still out of realtime',
         CASE WHEN count(*) = 0 THEN 'still removed' ELSE 'REGRESSED' END,
         (count(*) = 0)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename = 'live_participants'

  UNION ALL

  -- 13. Check 11 is an invariant, not a one-off. Masking at compute time plus a
  --     migration back-fill leaves a hole: a creator who turns privacy ON later
  --     never re-masks the rows written while it was off. A trigger closes it,
  --     because privacy_mode can be flipped from anywhere.
  SELECT '13. privacy toggle re-masks stored names (trigger)',
         'checked',
         EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.live_exams'::regclass
                   AND tgname = 'trg_live_privacy_mode_changed'
                   AND NOT tgisinternal)

  UNION ALL

  -- 14. That trigger must be narrowly scoped. live_exams is UPDATEd on every
  --     unlock, so an unguarded trigger would re-scan the whole exam's analytics
  --     dozens of times per session for nothing.
  SELECT '14. re-mask trigger only fires when privacy_mode changes',
         'checked',
         (pg_get_triggerdef(t.oid) LIKE '%UPDATE OF privacy_mode%'
          AND pg_get_triggerdef(t.oid) LIKE '%privacy_mode IS DISTINCT FROM%')
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.live_exams'::regclass
    AND t.tgname = 'trg_live_privacy_mode_changed'
)
SELECT
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END AS result,
  check_name,
  detail
FROM checks
ORDER BY check_name;
