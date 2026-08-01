-- ============================================================
-- PHASE 2 VERIFICATION — read only, changes nothing.
--
-- Run AFTER 20260804000000_live_v2_controls.sql (A3 add-time, A10 undo-unlock).
-- Every row must say PASS.
--
-- WHY THIS FILE IS MOSTLY SOURCE-TEXT ASSERTIONS
-- ----------------------------------------------
-- A3 and A10 are mutating RPCs whose whole value is in what they REFUSE, and
-- every refusal is a comparison of now() against a running session. Proving
-- "add-time is rejected one second after the deadline" or "undo is rejected once
-- three students have answered" requires a live exam, an unlocked question and a
-- clock — i.e. creating and then mangling real rows. A verification script must
-- not do that, so this file never calls the two new RPCs. It inspects pg_proc,
-- pg_get_functiondef, columns, triggers, grants and the realtime publication,
-- plus two invariants over real data.
--
-- Consequence, stated plainly: checks 04-21 prove that the guard is WRITTEN, not
-- that it FIRES. Each one names the exact shape of text it requires, so a FAIL
-- tells you what to write rather than only that something is missing. The
-- ordering of the guards, the arithmetic of the 5-second window and the 300s cap,
-- and the client behaviour around both, stay with §4.3's manual tests:
--   - student mid-answer when +30s fires — does the submission land at the NEW
--     deadline?
--   - undo while a student is reading — do they return cleanly, with no flash of
--     the reveal, and does the creator's grace-window compute get cancelled?
--
-- Useful as a pre-flight too: run it BEFORE the migration and checks 01-21 all
-- fail (nothing exists yet) while 22-30 must already pass — those nine are the
-- Phase 0 / Phase 1 invariants A3 and A10 are about to lean on, so if any of them
-- is already red, fix that first.
--
-- One structural difference from verify_phase0/1: the function source text is
-- lifted into CTEs first. A check written as `SELECT ... FROM pg_proc WHERE
-- proname = 'add_live_question_time'` returns ZERO ROWS when the function does
-- not exist — the check silently disappears instead of failing. Aggregating into
-- a one-row CTE guarantees every check produces a row, PASS or FAIL.
--
-- Check names are two-digit so ORDER BY check_name reads in order.
-- ============================================================

WITH fns AS (
  -- Every live-exam function with its source text and its security shape.
  -- prokind = 'f' keeps pg_get_functiondef away from aggregates, which it
  -- refuses to describe.
  SELECT
    p.proname                                  AS name,
    oidvectortypes(p.proargtypes)              AS argtypes,
    pg_get_functiondef(p.oid)                  AS def,
    p.prosecdef                                AS secdef,
    (p.provolatile = 'v')                      AS is_volatile,
    (array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path%') AS path_pinned,
    (p.prorettype = 'public.live_exams'::regtype) AS returns_live_exams,
    EXISTS (
      SELECT 1 FROM aclexplode(p.proacl) a
      WHERE a.privilege_type = 'EXECUTE'
        AND pg_get_userbyid(a.grantee) = 'authenticated'
    )                                          AS auth_can_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname LIKE '%live%'
),

-- A3. One row even when the function is absent (count = 0, def = '').
a3 AS (
  SELECT
    count(*)::int                                  AS n,
    COALESCE(string_agg(argtypes, ' / '), '(missing)') AS argtypes,
    COALESCE(string_agg(def, E'\n'), '')           AS def,
    COALESCE(bool_and(secdef), false)              AS secdef,
    COALESCE(bool_and(is_volatile), false)         AS is_volatile,
    COALESCE(bool_and(path_pinned), false)         AS path_pinned,
    COALESCE(bool_and(returns_live_exams), false)  AS returns_live_exams,
    COALESCE(bool_and(auth_can_execute), false)    AS auth_can_execute
  FROM fns WHERE name = 'add_live_question_time'
),

-- A10. Same shape.
a10 AS (
  SELECT
    count(*)::int                                  AS n,
    COALESCE(string_agg(argtypes, ' / '), '(missing)') AS argtypes,
    COALESCE(string_agg(def, E'\n'), '')           AS def,
    COALESCE(bool_and(secdef), false)              AS secdef,
    COALESCE(bool_and(is_volatile), false)         AS is_volatile,
    COALESCE(bool_and(path_pinned), false)         AS path_pinned,
    COALESCE(bool_and(returns_live_exams), false)  AS returns_live_exams,
    COALESCE(bool_and(auth_can_execute), false)    AS auth_can_execute
  FROM fns WHERE name = 'undo_last_live_unlock'
),

checks AS (

  -- ─── Existence and shape ─────────────────────────────────────

  -- 01. Both RPCs exist with the exact signatures the client calls, and both
  --     return the live_exams row so the caller can setExam(updated) instead of
  --     waiting for the realtime UPDATE to come back around.
  SELECT '01. both Phase 2 RPCs exist with the right signature' AS check_name,
         'add(' || a3.argtypes || ') undo(' || a10.argtypes || ')' AS detail,
         (a3.n = 1 AND a3.argtypes = 'uuid, integer' AND a3.returns_live_exams
          AND a10.n = 1 AND a10.argtypes = 'uuid' AND a10.returns_live_exams) AS ok
  FROM a3, a10

  UNION ALL

  -- 02. Both must be SECURITY DEFINER with a pinned search_path (they write
  --     tables the caller has no direct grant on) and VOLATILE (a STABLE
  --     mutating function can be folded or run against a stale snapshot).
  SELECT '02. both RPCs are SECURITY DEFINER, VOLATILE, search_path pinned',
         'add: ' || a3.secdef || '/' || a3.is_volatile || '/' || a3.path_pinned ||
         '  undo: ' || a10.secdef || '/' || a10.is_volatile || '/' || a10.path_pinned,
         (a3.secdef AND a3.is_volatile AND a3.path_pinned
          AND a10.secdef AND a10.is_volatile AND a10.path_pinned)
  FROM a3, a10

  UNION ALL

  -- 03. Explicitly granted to authenticated, like every other live RPC. Relying
  --     on Supabase's default privileges is not the same as writing the GRANT.
  SELECT '03. both RPCs granted EXECUTE to authenticated',
         'add: ' || a3.auth_can_execute || '  undo: ' || a10.auth_can_execute,
         (a3.auth_can_execute AND a10.auth_can_execute)
  FROM a3, a10

  UNION ALL

  -- ─── A3: add time ───────────────────────────────────────────

  -- 04. The four entry guards. Text only: presence of auth.uid(), 'live',
  --     current_question_index and current_question_unlocked_at in the body.
  SELECT '04. A3 guards creator / live / index >= 0 / unlocked_at',
         'checked',
         (a3.def LIKE '%auth.uid()%'
          AND a3.def LIKE '%''live''%'
          AND a3.def LIKE '%current_question_index%'
          AND a3.def LIKE '%current_question_unlocked_at%')
  FROM a3

  UNION ALL

  -- 05. p_seconds is a closed set, not an integer. Accepts either the IN-list
  --     form or two explicit <> comparisons.
  SELECT '05. A3 accepts only 30 or 60 seconds',
         'checked',
         (a3.def ~ '\(\s*30\s*,\s*60\s*\)'
          OR (a3.def ~ '(<>|!=)\s*30' AND a3.def ~ '(<>|!=)\s*60'))
  FROM a3

  UNION ALL

  -- 06. Hard per-question cap. A creator who can grant unbounded time can also
  --     desync B6's window from the timer the class actually saw.
  SELECT '06. A3 caps granted time at 300s',
         'checked',
         (a3.def ~ '\m300\M')
  FROM a3

  UNION ALL

  -- 07. The deadline must come from the shared helper. Phase 0 collapsed five
  --     independent derivations onto live_question_deadline precisely so that A3
  --     could not resurrect the sixth.
  SELECT '07. A3 derives the deadline from live_question_deadline',
         'checked',
         (a3.def LIKE '%live_question_deadline%')
  FROM a3

  UNION ALL

  -- 08. THE BLOCKER. live_question_deadline bakes in the +2s grace, so a guard
  --     of `now() <= live_question_deadline(...)` accepts time for two seconds
  --     AFTER every client has latched "expired" and started the reveal: the
  --     creator's grace compute is already armed, the projector already says
  --     "Time up", the student is already locked. The guard must therefore be
  --     the VISUAL end — the deadline minus the 2s grace — so that "the
  --     countdown reads zero" means "no more time can be granted" everywhere at
  --     once. Requires a literal 2-second interval subtraction in the body.
  SELECT '08. A3 refuses inside the 2s grace (guard is the VISUAL end)',
         'checked',
         (a3.def LIKE '%live_question_deadline%'
          AND a3.def ~* '(interval\s*''2 second|make_interval\s*\(\s*secs\s*=>\s*2\s*\))')
  FROM a3

  UNION ALL

  -- 09. TWO WRITES, ONE TRANSACTION. compute_live_question_analytics never reads
  --     live_exams: its B6 window comes from live_unlock_log.extra_seconds. If
  --     A3 updates the exam row and forgets the log row, the median threshold,
  --     the impulsive-wrong cutoff and all 12 histogram buckets are quietly
  --     wrong and nothing raises. A10 also restores extra_seconds from that same
  --     log row, so a missed write survives the undo.
  SELECT '09. A3 writes BOTH live_exams and live_unlock_log.extra_seconds',
         'checked',
         (a3.def ~* 'current_question_extra_seconds\s*='
          AND a3.def ~* 'live_unlock_log[^;]*extra_seconds\s*=')
  FROM a3

  UNION ALL

  -- 10. Granting time must extend the deadline, never re-stamp the unlock. A new
  --     unlocked_at would restart the timer bar from full, reset the B6 window
  --     origin and make every already-recorded time_taken_ms meaningless.
  SELECT '10. A3 never re-stamps unlocked_at or rewrites the index',
         'checked',
         (NOT (a3.def ~* 'current_question_unlocked_at\s*=\s*now\s*\(\s*\)')
          AND NOT (a3.def ~* 'current_question_index\s*=\s*(public\.)?(live_exams\.)?current_question_index'))
  FROM a3

  UNION ALL

  -- ─── A10: undo unlock ───────────────────────────────────────

  -- 11. Entry guards, same reading as check 04.
  SELECT '11. A10 guards creator / live / index >= 0',
         'checked',
         (a10.def LIKE '%auth.uid()%'
          AND a10.def LIKE '%''live''%'
          AND a10.def LIKE '%current_question_index%')
  FROM a10

  UNION ALL

  -- 12. The 5-second window, measured from live_exams.current_question_unlocked_at
  --     — the authoritative timestamp every other deadline derives from, not the
  --     log row's copy, which can disagree after a raced re-unlock.
  SELECT '12. A10 refuses past 5s, measured from the exam row',
         'checked',
         (a10.def ~* '(interval\s*''5 second|make_interval\s*\(\s*secs\s*=>\s*5\s*\))'
          AND a10.def LIKE '%current_question_unlocked_at%'
          AND a10.def LIKE '%UNDO_WINDOW_EXPIRED%')
  FROM a10

  UNION ALL

  -- 13. Refuses once anyone has answered, and reports HOW MANY so the UI can say
  --     "3 students have already answered" instead of a generic failure. The
  --     count must be interpolated into the message (RAISE ... 'UNDO_HAS_RESPONSES:%',
  --     v_count) — a bare code would force a second round trip to be useful.
  SELECT '13. A10 refuses when a response exists AND reports the count',
         'checked',
         (a10.def ~ 'UNDO_HAS_RESPONSES:%'
          AND a10.def ~* 'count\s*\(\s*\*\s*\)[^;]*live_responses')
  FROM a10

  UNION ALL

  -- 14. Belt and braces: an analytics row for the ordinal means the class has
  --     already been shown the distribution, so the unlock is not undoable even
  --     if the response table happens to be empty.
  SELECT '14. A10 refuses when analytics already exist',
         'checked',
         (a10.def LIKE '%UNDO_HAS_ANALYTICS%'
          AND a10.def LIKE '%live_question_analytics%')
  FROM a10

  UNION ALL

  -- 15. RESPONSES ARE NEVER DELETED. Negative assertion on the source text: the
  --     body must contain no DELETE against live_responses. Undo withdraws a
  --     question, it does not erase what students did.
  SELECT '15. A10 never deletes responses',
         CASE WHEN a10.def ~* 'delete\s+from\s+(public\.)?live_responses'
              THEN 'DELETE FROM live_responses PRESENT' ELSE 'no delete' END,
         (NOT (a10.def ~* 'delete\s+from\s+(public\.)?live_responses'))
  FROM a10

  UNION ALL

  -- 16. The restore itself: stamp undone_at on the current ordinal's row and read
  --     unlocked_at / extra_seconds back from the PREVIOUS ordinal's row. That is
  --     the entire reason live_unlock_log exists — live_exams only ever holds the
  --     current unlock, so the previous timestamp is unrecoverable without it.
  --     Two or more references to the table = one write, one read.
  SELECT '16. A10 stamps undone_at and restores from the previous log row',
         ((length(a10.def) - length(replace(a10.def, 'live_unlock_log', '')))
            / length('live_unlock_log'))::text || ' live_unlock_log reference(s)',
         (a10.def LIKE '%undone_at%'
          AND ((length(a10.def) - length(replace(a10.def, 'live_unlock_log', '')))
                 / length('live_unlock_log')) >= 2
          AND a10.def ~* 'extra_seconds')
  FROM a10

  UNION ALL

  -- 17. A missing previous log row must be a decision, not an inherited NULL.
  --     SELECT ... INTO yields NULL silently when the row is absent, and a NULL
  --     unlocked_at at index >= 0 un-reveals the question the class already saw,
  --     re-masks is_correct, and leaves the creator with no unlock control at all
  --     (canUnlockNext goes false and the deck falls through to "Syncing with the
  --     live session…"). Sessions that went live before Phase 0 have no log rows,
  --     and start_live_session wipes the log per session, so this is reachable.
  --     Accepts either an explicit refusal or a deliberately-past synthesised
  --     timestamp.
  SELECT '17. A10 handles a missing previous log row explicitly',
         CASE WHEN a10.def LIKE '%UNDO_NO_HISTORY%' THEN 'refuses (UNDO_NO_HISTORY)'
              WHEN a10.def ~* 'now\s*\(\s*\)\s*-\s*(make_)?interval' THEN 'synthesises a past timestamp'
              ELSE 'NEITHER — a NULL unlocked_at will be inherited' END,
         (a10.def LIKE '%UNDO_NO_HISTORY%'
          OR a10.def ~* 'now\s*\(\s*\)\s*-\s*(make_)?interval')
  FROM a10

  UNION ALL

  -- 18. Concurrency. Two control tabs, a double-click or a keyboard repeat can
  --     fire two undos: `SET current_question_index = current_question_index - 1`
  --     decrements twice and walks back over a question that may have responses,
  --     so the new index must be computed from the value already read. The row
  --     lock (or an index-guarded UPDATE that raises UNDO_CONFLICT when it loses)
  --     also closes the MVCC hole against submit_live_response, whose snapshot can
  --     predate the undo's commit and insert a response for a withdrawn question.
  SELECT '18. A10 decrements from the read value and loses races cleanly',
         CASE WHEN a10.def ~* 'for\s+update' THEN 'row lock'
              WHEN a10.def LIKE '%UNDO_CONFLICT%' THEN 'index-guarded UPDATE'
              ELSE 'NEITHER — concurrent undos are unserialised' END,
         (NOT (a10.def ~* 'current_question_index\s*=\s*(public\.)?(live_exams\.)?current_question_index\s*-')
          AND (a10.def ~* 'for\s+update' OR a10.def LIKE '%UNDO_CONFLICT%'))
  FROM a10

  UNION ALL

  -- 19. Undoing the first question must land on index -1 with a NULL unlocked_at
  --     — the same "no question open" state start_live_session writes, which the
  --     lobby branch on every client already renders correctly. Static text can
  --     only show that the branch exists; the column being nullable is what makes
  --     the state representable at all.
  SELECT '19. A10 at index 0 yields index -1 with a NULL unlocked_at',
         'checked',
         (COALESCE((SELECT is_nullable = 'YES' FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'live_exams'
                      AND column_name = 'current_question_unlocked_at'), false)
          AND a10.def ~ '-\s*1'
          AND a10.def ~* 'current_question_unlocked_at\s*='
          AND a10.def ~* '(<\s*0|IS NULL)')
  FROM a10

  UNION ALL

  -- 20. Confusion signals for the withdrawn question must go. The PK is
  --     (live_question_id, user_id) with ON CONFLICT DO NOTHING, so a student who
  --     tapped "I'm lost" during the four seconds the question was up is stuck on
  --     "Sent ✓" forever and their real signal on the re-asked question is
  --     swallowed — and the creator's count mixes the aborted attempt with the
  --     real one. This is not a response of record; it is a re-raisable hand.
  SELECT '20. A10 clears confusion signals for the withdrawn question',
         'checked',
         (a10.def ~* 'delete\s+from\s+(public\.)?live_confusion_signals')
  FROM a10

  UNION ALL

  -- 21. D1 history. The PK is (live_exam_id, question_ordinal) and
  --     unlock_next_live_question's ON CONFLICT sets undone_at = NULL, so the
  --     moment the creator re-unlocks the question they just took back — the
  --     common sequence — the undo is erased from the log. A counter that the
  --     upsert does not touch is the only way Phase 6's pacing timeline can ever
  --     show "the creator backed up here".
  SELECT '21. live_unlock_log.undo_count survives a re-unlock',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema = 'public' AND table_name = 'live_unlock_log'
                                 AND column_name = 'undo_count')
              THEN 'column missing' ELSE 'checked' END,
         (EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'live_unlock_log'
                    AND column_name = 'undo_count')
          AND a10.def LIKE '%undo_count%'
          AND COALESCE((SELECT def NOT LIKE '%undo_count%' FROM fns
                        WHERE name = 'unlock_next_live_question'), false))
  FROM a10

  UNION ALL

  -- ─── Invariants over real data ──────────────────────────────

  -- 22. The two-writes invariant from check 09, measured rather than read. Any
  --     row here is a session whose B6 window disagrees with the timer the class
  --     saw, and whose A10 restore would hand back the wrong extra_seconds.
  SELECT '22. live_unlock_log.extra_seconds in step with the exam row',
         count(*)::text || ' desynced session(s)',
         (count(*) = 0)
  FROM public.live_exams le
  JOIN public.live_unlock_log ul
    ON ul.live_exam_id = le.id AND ul.question_ordinal = le.current_question_index
  WHERE le.current_question_index >= 0
    AND ul.undone_at IS NULL
    AND ul.extra_seconds <> COALESCE(le.current_question_extra_seconds, 0)

  UNION ALL

  -- 23. An undone ordinal is always AHEAD of the current index (that is what the
  --     undo did), and a re-unlock clears undone_at. A row at or below the index
  --     means an undo left the session pointing at a question it also marked
  --     withdrawn.
  SELECT '23. no undone unlock sits at or below the current index',
         count(*)::text || ' bad row(s)',
         (count(*) = 0)
  FROM public.live_unlock_log ul
  JOIN public.live_exams le ON le.id = ul.live_exam_id
  WHERE ul.undone_at IS NOT NULL
    AND ul.question_ordinal <= le.current_question_index

  UNION ALL

  -- ─── Phase 0 / Phase 1 must not have regressed ──────────────

  -- 24. THE FAN-OUT FIX. If either table came back into the publication, Phase 2
  --     makes it worse: A3 and A10 both UPDATE live_exams mid-question.
  SELECT '24. fan-out fix intact (participants/responses OUT of realtime)',
         CASE WHEN count(*) = 0 THEN 'both still removed'
              ELSE 'REGRESSED: ' || string_agg(tablename, ', ') END,
         (count(*) = 0)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename IN ('live_participants','live_responses')

  UNION ALL

  -- 25. ...and the two cheap ones must still be there, or A3's extension and
  --     A10's rewind never reach a student's screen except by poll.
  SELECT '25. live_exams + analytics STILL in realtime',
         coalesce(string_agg(tablename, ', ' ORDER BY tablename), '(none)'),
         (count(*) = 2)
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    AND tablename IN ('live_exams','live_question_analytics')

  UNION ALL

  -- 26. Every deadline consumer still routes through the helper. Phase 0 asserted
  --     three; this asserts five — it adds live_session_sync (a fourth derivation
  --     Phase 0 introduced and did not verify, and the one that decides the poll
  --     cadence a student sees during an extension) and A3 itself.
  SELECT '26. deadline consumers use live_question_deadline',
         count(*)::text || ' of 5',
         (count(*) = 5)
  FROM fns
  WHERE name IN ('get_revealed_live_answers','get_my_live_responses',
                 'submit_live_response','live_session_sync','add_live_question_time')
    AND def LIKE '%live_question_deadline%'

  UNION ALL

  -- 27. Nobody hand-rolls the deadline. Positive proof that the collapse held:
  --     only live_question_deadline may build an interval out of time_seconds.
  --     (submit_live_response's time_taken_ms clamp still re-spells
  --     `time + extra + 2` as arithmetic rather than deriving from the helper —
  --     it does honour extra seconds, so it is correct today and deliberately not
  --     failed here, but it is the last copy of the grace constant in SQL.)
  SELECT '27. only the helper builds a deadline interval from time_seconds',
         CASE WHEN count(*) = 0 THEN 'helper only'
              ELSE 'HAND-ROLLED IN: ' || string_agg(name, ', ' ORDER BY name) END,
         (count(*) = 0)
  FROM fns
  WHERE name <> 'live_question_deadline'
    AND def ~* 'make_interval\s*\(\s*secs\s*=>[^)]*time_seconds'

  UNION ALL

  -- 28. A10 restores from live_unlock_log, so the unlock RPC must still write it
  --     and must still reset extra_seconds to 0 — otherwise a re-unlocked
  --     question inherits the granted time, and an undo restores a window the
  --     class never saw.
  SELECT '28. unlock RPC still logs the unlock and resets extra_seconds',
         'checked',
         COALESCE((SELECT def LIKE '%live_unlock_log%'
                        AND def LIKE '%current_question_extra_seconds = 0%'
                   FROM fns WHERE name = 'unlock_next_live_question'), false)

  UNION ALL

  -- 29. B6's window is the one place A3 can go silently wrong, so assert the read
  --     it depends on still exists: the analytics compute takes extra_seconds from
  --     live_unlock_log, never from live_exams.
  SELECT '29. analytics window still reads live_unlock_log.extra_seconds',
         'checked',
         COALESCE((SELECT def ~* 'live_unlock_log[^;]*extra_seconds'
                   FROM fns WHERE name = 'compute_live_question_analytics'), false)

  UNION ALL

  -- 30. Phase 1's privacy surface is untouched: the masked view still masks, and
  --     the re-mask trigger still fires only when privacy_mode actually changes.
  --     A3 and A10 both UPDATE live_exams, so an unscoped trigger would now
  --     re-scan an exam's analytics on every grant and every undo as well as
  --     every unlock.
  SELECT '30. Phase 1 privacy surface intact (masked view + scoped re-mask trigger)',
         'checked',
         -- The viewdef is read inside a guarded subquery rather than through a
         -- ::regclass cast, so a missing view FAILS this check instead of
         -- aborting the whole script with a cast error.
         (COALESCE((SELECT pg_get_viewdef(c.oid) LIKE '%live_anon_name%'
                       AND pg_get_viewdef(c.oid) LIKE '%leaderboard_visibility%'
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relname = 'live_participants_public'
                      AND c.relkind = 'v'), false)
          AND EXISTS (SELECT 1 FROM pg_trigger t
                      WHERE t.tgrelid = 'public.live_exams'::regclass
                        AND t.tgname = 'trg_live_privacy_mode_changed'
                        AND NOT t.tgisinternal
                        AND pg_get_triggerdef(t.oid) LIKE '%UPDATE OF privacy_mode%'
                        AND pg_get_triggerdef(t.oid) LIKE '%privacy_mode IS DISTINCT FROM%'))
)
SELECT
  CASE WHEN ok THEN '✅ PASS' ELSE '❌ FAIL' END AS result,
  check_name,
  detail
FROM checks
ORDER BY check_name;
