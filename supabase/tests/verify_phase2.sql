-- ============================================================
-- PHASE 2 VERIFICATION — read only, changes nothing.
-- Run AFTER 20260804000000_live_v2_controls.sql. All checks must PASS.
--
-- Two lessons from the earlier verification files are applied here.
--
-- 1. NEVER grep pg_get_functiondef() raw. A review of the first Phase 2 draft
--    found a check passing because the words it searched for appeared in a
--    COMMENT, not in code. Every text assertion below runs against a
--    comment-stripped copy (the `code` column of the `fns` CTE).
--
-- 2. NEVER put the assertion in a FROM-based branch alone. verify_phase1 checks
--    7, 10 and 14 select FROM pg_proc/pg_trigger — so if the object is missing the
--    branch yields NO ROW and silently disappears from the output instead of
--    reporting FAIL. That is how a missing trigger showed up as 13 rows rather
--    than a failure. Every check here uses a scalar subquery or EXISTS so the row
--    always exists and can always fail.
--
-- Behavioural checks (the deadline maths) call only IMMUTABLE helpers. The
-- mutating RPCs are asserted on their source, never invoked.
-- ============================================================

WITH fns AS (
  SELECT
    p.proname AS name,
    -- Comments stripped: -- to end of line, and /* ... */ blocks.
    regexp_replace(
      regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
      '/\*.*?\*/', '', 'gs'
    ) AS code
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
checks AS (

  -- ─── Existence ───────────────────────────────────────────

  SELECT '01. add_live_question_time exists' AS check_name,
         'checked' AS detail,
         EXISTS (SELECT 1 FROM fns WHERE name = 'add_live_question_time') AS ok

  UNION ALL
  SELECT '02. undo_last_live_unlock exists', 'checked',
         EXISTS (SELECT 1 FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  SELECT '03. helpers exist (grace, visual_end, min_seconds)',
         (SELECT count(*)::text || ' of 3' FROM fns
          WHERE name IN ('live_question_grace_seconds','live_question_visual_end','live_ordinal_min_seconds')),
         (SELECT count(*) = 3 FROM fns
          WHERE name IN ('live_question_grace_seconds','live_question_visual_end','live_ordinal_min_seconds'))

  UNION ALL
  SELECT '04. both RPCs granted to authenticated',
         'checked',
         (SELECT count(*) = 2
          FROM information_schema.routine_privileges
          WHERE specific_schema = 'public'
            AND routine_name IN ('add_live_question_time','undo_last_live_unlock')
            AND grantee = 'authenticated' AND privilege_type = 'EXECUTE')

  -- ─── Behaviour: the deadline maths, actually executed ─────

  UNION ALL
  SELECT '05. grace is 2s, in exactly one place',
         (SELECT public.live_question_grace_seconds()::text || 's'),
         (SELECT public.live_question_grace_seconds() = 2)

  UNION ALL
  SELECT '06. visual end EXCLUDES the grace (60s + 30s extra -> 10:01:30)',
         (SELECT to_char(public.live_question_visual_end('2026-08-01 10:00:00+00'::timestamptz, 60, 30), 'HH24:MI:SS')),
         (SELECT public.live_question_visual_end('2026-08-01 10:00:00+00'::timestamptz, 60, 30)
                 = '2026-08-01 10:01:30+00'::timestamptz)

  UNION ALL
  SELECT '07. deadline is visual end + grace (-> 10:01:32)',
         (SELECT to_char(public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, 30), 'HH24:MI:SS')),
         (SELECT public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, 30)
                 = '2026-08-01 10:01:32+00'::timestamptz)

  UNION ALL
  SELECT '08. deadline is DERIVED from visual end, not re-spelled',
         'checked',
         (SELECT public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 45, 15)
                 = public.live_question_visual_end('2026-08-01 10:00:00+00'::timestamptz, 45, 15)
                   + make_interval(secs => public.live_question_grace_seconds()))

  UNION ALL
  SELECT '09. NULL extra seconds does not annihilate either helper',
         'checked',
         (SELECT public.live_question_visual_end('2026-08-01 10:00:00+00'::timestamptz, 60, NULL)
                   = '2026-08-01 10:01:00+00'::timestamptz
                 AND public.live_question_deadline('2026-08-01 10:00:00+00'::timestamptz, 60, NULL)
                   = '2026-08-01 10:01:02+00'::timestamptz)

  -- ─── A3 guards, asserted on comment-stripped code ─────────

  UNION ALL
  SELECT '10. add-time guards on the VISUAL end, not the deadline',
         'checked',
         (SELECT code LIKE '%live_question_visual_end%'
                 AND code NOT LIKE '%live_question_deadline%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  SELECT '11. add-time refuses past that end (ADDTIME_TOO_LATE)',
         'checked',
         (SELECT code LIKE '%ADDTIME_TOO_LATE%' AND code LIKE '%now() > v_visual_end%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  SELECT '12. add-time caps the total at 300s',
         'checked',
         (SELECT code LIKE '%300%' AND code LIKE '%ADDTIME_CAP_REACHED%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  SELECT '13. add-time accepts only 30 or 60',
         'checked',
         (SELECT code LIKE '%NOT IN (30, 60)%' AND code LIKE '%ADDTIME_BAD_AMOUNT%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  -- A stranger must learn "not the creator", never a different answer depending
  -- on the number they sent.
  SELECT '14. ownership is checked BEFORE the amount',
         'checked',
         (SELECT strpos(code, 'ADDTIME_NOT_CREATOR') > 0
                 AND strpos(code, 'ADDTIME_NOT_CREATOR') < strpos(code, 'ADDTIME_BAD_AMOUNT')
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  -- Reveal and submit both use each question's OWN time_seconds, so a single
  -- whole-session control must bound itself by the shortest translation.
  SELECT '15. add-time bounds by the SHORTEST language sibling',
         'checked',
         (SELECT code LIKE '%live_ordinal_min_seconds%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  SELECT '16. live_ordinal_min_seconds really takes the minimum across languages',
         'checked',
         (SELECT code LIKE '%MIN(t.time_seconds)%' AND code LIKE '%PARTITION BY ls.language%'
          FROM fns WHERE name = 'live_ordinal_min_seconds')

  UNION ALL
  -- B6 reads granted seconds from the log, never from live_exams, because
  -- live_exams only holds the CURRENT question's.
  SELECT '17. add-time keeps live_unlock_log.extra_seconds in step',
         'checked',
         (SELECT code LIKE '%UPDATE public.live_unlock_log%'
                 AND code LIKE '%SET extra_seconds = v_new_extra%'
          FROM fns WHERE name = 'add_live_question_time')

  UNION ALL
  SELECT '18. add-time locks the exam row, so the cap is a real cap',
         'checked',
         (SELECT code LIKE '%FOR UPDATE%' FROM fns WHERE name = 'add_live_question_time')

  -- ─── A10 guards ──────────────────────────────────────────

  UNION ALL
  SELECT '19. undo has a 5 second window',
         'checked',
         (SELECT code LIKE '%interval ''5 seconds''%' AND code LIKE '%UNDO_WINDOW_EXPIRED%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  SELECT '20. undo refuses when anyone answered, and reports the count',
         'checked',
         (SELECT code LIKE '%UNDO_HAS_RESPONSES:%%' AND code LIKE '%v_responses%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  SELECT '21. undo NEVER deletes a response',
         'checked',
         (SELECT code NOT LIKE '%DELETE FROM public.live_responses%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  -- A past unlock time does not mean a closed question: nothing forces the
  -- creator to wait for Q(N-1) to expire before moving on.
  SELECT '22. undo refuses if the previous question is still running',
         'checked',
         (SELECT code LIKE '%UNDO_PREV_STILL_OPEN%' AND code LIKE '%live_question_deadline%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  -- Restoring NULL would brick the session: no unlock control, and Q(N-1)'s
  -- reveal retracted from every student.
  SELECT '23. undo refuses rather than restoring a missing history row',
         'checked',
         (SELECT code LIKE '%UNDO_NO_HISTORY%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  SELECT '24. undo restores unlocked_at and extra_seconds from the log',
         'checked',
         (SELECT code LIKE '%FROM public.live_unlock_log%'
                 AND code LIKE '%question_ordinal = v_index - 1%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  SELECT '25. undo is serialised: row lock plus an optimistic index check',
         'checked',
         (SELECT code LIKE '%FOR UPDATE%'
                 AND code LIKE '%AND current_question_index = v_index%'
                 AND code LIKE '%UNDO_CONFLICT%'
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  -- The only destructive statement in the function must run after every guard
  -- that can abort the transaction, so the ordering is not an accident.
  SELECT '26. undo deletes confusion signals LAST',
         'checked',
         (SELECT strpos(code, 'DELETE FROM public.live_confusion_signals')
                   > strpos(code, 'UNDO_HAS_RESPONSES')
                 AND strpos(code, 'DELETE FROM public.live_confusion_signals')
                   > strpos(code, 'UNDO_CONFLICT')
          FROM fns WHERE name = 'undo_last_live_unlock')

  UNION ALL
  -- undo_count survives the re-unlock upsert that clears undone_at, which is how
  -- D1's pacing timeline can still show an undo happened.
  SELECT '27. live_unlock_log.undo_count exists and is incremented',
         'checked',
         (EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'live_unlock_log'
                    AND column_name = 'undo_count')
          AND (SELECT code LIKE '%undo_count = undo_count + 1%'
               FROM fns WHERE name = 'undo_last_live_unlock'))

  -- ─── Locking on the paths A10 races ──────────────────────

  UNION ALL
  -- Without this an unguarded read-then-increment can skip a whole question.
  SELECT '28. unlock locks the row and guards its own increment',
         'checked',
         (SELECT code LIKE '%FOR UPDATE%'
                 AND code LIKE '%AND current_question_index = v_exam.current_question_index%'
                 AND code LIKE '%UNLOCK_CONFLICT%'
          FROM fns WHERE name = 'unlock_next_live_question')

  UNION ALL
  -- FOR SHARE, not FOR UPDATE: submissions must not serialise against each other,
  -- only against add-time and undo. This is what makes undo's response count
  -- trustworthy instead of racing an in-flight insert.
  SELECT '29. submit takes a SHARE lock, not an exclusive one',
         'checked',
         (SELECT code LIKE '%FOR SHARE%' AND code NOT LIKE '%FOR UPDATE%'
          FROM fns WHERE name = 'submit_live_response')

  UNION ALL
  SELECT '30. submit derives its time clamp instead of re-spelling + 2',
         'checked',
         (SELECT code LIKE '%live_question_deadline%'
                 AND code NOT LIKE '%+ 2) * 1000%'
          FROM fns WHERE name = 'submit_live_response')

  -- ─── The cadence fix ─────────────────────────────────────

  UNION ALL
  -- Phase 0 slept from visualEnd-1.5s to visualEnd+3.5s, justified by "A3 is
  -- refused past the deadline". A3 is legal right up TO the visual end, so that
  -- was precisely the window a poll-lane student could not hear an extension in.
  SELECT '31. sync wakes before the VISUAL end, not after the deadline',
         'checked',
         (SELECT code LIKE '%v_ms_to_visual%'
                 AND code LIKE '%live_question_visual_end%'
          FROM fns WHERE name = 'live_session_sync')

  -- ─── Earlier phases must not have regressed ──────────────

  UNION ALL
  -- An earlier Phase 2 draft redefined live_session_sync WITHOUT this gate,
  -- which would have reopened the mid-question correctness leak.
  SELECT '32. the score_visible gate survived this migration',
         'checked',
         (SELECT code LIKE '%v_score_visible%' AND code LIKE '%score_visible%'
          FROM fns WHERE name = 'live_session_sync')

  UNION ALL
  SELECT '33. profiles is still own-row only',
         (SELECT coalesce(string_agg(policyname, ', '), '(none)')
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
            AND cmd = 'SELECT'),
         NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'profiles'
                       AND policyname = 'Public profiles are viewable by everyone.')

  UNION ALL
  SELECT '34. participants and responses are still out of realtime',
         (SELECT CASE WHEN count(*) = 0 THEN 'still removed' ELSE 'REGRESSED' END
          FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
            AND tablename IN ('live_participants','live_responses')),
         (SELECT count(*) = 0 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
            AND tablename IN ('live_participants','live_responses'))

  UNION ALL
  SELECT '35. the privacy re-mask trigger is still installed',
         'checked',
         EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.live_exams'::regclass
                   AND tgname = 'trg_live_privacy_mode_changed'
                   AND NOT tgisinternal)

  UNION ALL
  -- Every deadline consumer still routes through the shared helper.
  SELECT '36. all deadline consumers still use the helper',
         (SELECT count(*)::text || ' of 4' FROM fns
          WHERE name IN ('get_revealed_live_answers','get_my_live_responses',
                         'submit_live_response','live_session_sync')
            AND code LIKE '%live_question_deadline%'),
         (SELECT count(*) = 4 FROM fns
          WHERE name IN ('get_revealed_live_answers','get_my_live_responses',
                         'submit_live_response','live_session_sync')
            AND code LIKE '%live_question_deadline%')
)
SELECT
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END AS result,
  check_name,
  detail
FROM checks
ORDER BY check_name;
