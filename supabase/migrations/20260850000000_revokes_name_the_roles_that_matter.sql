-- ============================================================
-- THE REVOKES ACTUALLY REVOKE SOMETHING
--
-- WHAT IS BROKEN
-- 26 statements across this project's migrations read
--
--     REVOKE EXECUTE ON FUNCTION public.something(...) FROM PUBLIC;
--
-- and none of them removed anything. A Supabase project ships with
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
--
-- so every new function in this schema is granted EXECUTE to those roles
-- DIRECTLY. PUBLIC was never the grant being used, and revoking it removes a
-- key nobody was holding.
--
-- It survived 26 repetitions because it looks verified. 20260833000000 even
-- checks its own work, with has_function_privilege('public', ...), and raises
-- if PUBLIC can still execute. That check passes: PUBLIC really did lose its
-- grant. Meanwhile `authenticated` — the role every signed-in student actually
-- is — kept theirs. The migration confirmed the lock by testing a door nobody
-- uses.
--
-- HOW BAD WAS IT
-- Less bad than 26 suggests, and worth being accurate about: every sensitive
-- one defends itself INSIDE. get_exam_analytics filters on
-- `e.user_id = auth.uid()`, get_attempt_answer_key on
-- `(a.user_id = auth.uid() OR e.user_id = auth.uid())`, and so on. The rest are
-- pure arithmetic on values the caller already has. The outer lock was a second
-- layer.
--
-- But two functions had NO inner check and were reachable for real, both found
-- this month: end_live_session_system (any candidate could end the exam they
-- were sitting, for the whole room) and live_question_payload_at (any candidate
-- could read question 40 before it was asked). Those are already repaired. This
-- file closes the pattern, so the next helper written without an inner check is
-- not silently open.
--
--
-- THREE GROUPS, BECAUSE ONE BLANKET RULE WOULD BREAK THE APP
-- Most of these functions are SUPPOSED to be callable from a browser. Revoking
-- `authenticated` from all 26 would 403 the exam runner, the review screen and
-- the creator dashboard. So each is treated by its intent, read off the GRANT
-- that accompanies it:
--
--   INTERNAL   no GRANT anywhere, no RLS policy references it, and every caller
--              is a SECURITY DEFINER function running as the owner (which keeps
--              EXECUTE regardless). Nothing in a browser calls these.
--              -> revoked from PUBLIC, anon AND authenticated.
--
--   AUTHED     GRANT ... TO authenticated, and called over rpc by the app.
--              -> revoked from PUBLIC and anon; authenticated KEPT.
--              Each also checks auth.uid() internally, so anon could never have
--              got data out of them anyway — which is the argument that
--              removing anon cannot break a feature that works today.
--
--   UNTOUCHED  get_published_question_ids. Granted `TO authenticated, anon`
--              deliberately and referenced inside an RLS policy
--              ("Public read question scoring for published exams"). Revoking
--              anon there would silently strip per-question marks from
--              signed-out browsing. It is correct as it stands.
--
-- start_exam_clock deserves a note: guests CAN sit an exam in this app, so an
-- anon caller was plausible. Traced it — the rpc sits inside
-- `if (user && !isPreview)` in ExamSimulator, so no signed-out path reaches it.
--
-- COST
-- None. These are one-time privilege changes. No function body, query plan or
-- request count changes; nothing new runs at request time.
--
-- WHY A NEW FILE RATHER THAN EDITING THE 26
-- Those migrations are already applied. Rewriting applied history changes
-- nothing in the database — only a new statement does. The historical files are
-- left alone; their self-checks already ran and still pass, because what they
-- assert (PUBLIC cannot execute) remains true.
-- ============================================================

DO $revoke$
DECLARE
  r          RECORD;
  v_internal TEXT[] := ARRAY[
    'live_primary_questions',
    'live_canonical_for',
    'live_report_masked_ids',
    'compute_attempt_marks',
    'grade_mock_answer',
    'mock_answer_norm',
    'mock_answer_label',
    'mock_answer_present',
    'mock_has_answer',
    'mock_js_round2',
    'mock_apply_rounding'
  ];
  v_authed   TEXT[] := ARRAY[
    'live_exam_readiness',
    'get_my_exam_ranks',
    'get_exam_analytics',
    'submit_exam_attempt',
    'get_attempt_answer_key',
    'start_exam_clock',
    'get_exam_question_time_stats',
    'get_exam_engaged_attempts'
  ];
  v_has_anon BOOLEAN;
  v_has_auth BOOLEAN;
  v_done     INTEGER := 0;
  v_skipped  INTEGER := 0;
BEGIN
  -- Only roles that exist. anon/authenticated always do on Supabase, but a
  -- REVOKE naming an absent role aborts the whole script, and the migrations
  -- here are pasted by hand into whatever database happens to be open.
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          INTO v_has_anon;
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') INTO v_has_auth;

  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proname = ANY(v_internal) AS internal
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(v_internal || v_authed)
  LOOP
    -- Identity arguments rather than a hand-written signature: exact for
    -- overloads, and it cannot drift from what is actually installed.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                   r.proname, r.args);

    IF v_has_anon THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                     r.proname, r.args);
    END IF;

    -- The one line that separates the two groups. authenticated is the app's
    -- own access; taking it from an AUTHED function is the break this migration
    -- exists to avoid.
    IF r.internal AND v_has_auth THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated',
                     r.proname, r.args);
    END IF;

    v_done := v_done + 1;
  END LOOP;

  -- A function from an unapplied migration simply is not here yet. Its own
  -- migration will grant it on the Supabase default, so re-pasting THIS file
  -- afterwards is what closes it. Silence would hide that, so it is counted.
  v_skipped := cardinality(v_internal || v_authed) - v_done;

  RAISE NOTICE 'tightened EXECUTE on % function(s); % not installed yet (re-run this file after applying their migrations)',
    v_done, v_skipped;
END $revoke$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check — testing the roles that matter, which is the whole point
--
-- Both directions. Losing an `authenticated` grant here does not look like a
-- security fix; it looks like the exam runner returning 403 at start, the review
-- screen with no marks, and an empty creator dashboard.
-- ============================================================
DO $chk$
DECLARE
  r        RECORD;
  v_sig    TEXT;
  v_open   TEXT[] := ARRAY[]::TEXT[];
  v_broken TEXT[] := ARRAY[]::TEXT[];
  v_all    TEXT[] := ARRAY[
    'live_primary_questions','live_canonical_for','live_report_masked_ids',
    'compute_attempt_marks','grade_mock_answer','mock_answer_norm',
    'mock_answer_label','mock_answer_present','mock_has_answer',
    'mock_js_round2','mock_apply_rounding',
    'live_exam_readiness','get_my_exam_ranks','get_exam_analytics',
    'submit_exam_attempt','get_attempt_answer_key','start_exam_clock',
    'get_exam_question_time_stats','get_exam_engaged_attempts'
  ];
  v_int    TEXT[] := ARRAY[
    'live_primary_questions','live_canonical_for','live_report_masked_ids',
    'compute_attempt_marks','grade_mock_answer','mock_answer_norm',
    'mock_answer_label','mock_answer_present','mock_has_answer',
    'mock_js_round2','mock_apply_rounding'
  ];
BEGIN
  FOR r IN
    SELECT p.oid AS fnoid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proname = ANY(v_int) AS internal
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_all)
  LOOP
    -- Human-readable, for the exception messages only. It is NOT passed to
    -- has_function_privilege: that function parses its second argument as a
    -- regprocedure, whose input parser accepts argument TYPES and rejects
    -- argument NAMES — while pg_get_function_identity_arguments includes the
    -- names (`p_attempt_id uuid`). The first version of this file did pass it
    -- and failed on the first paste with
    --   invalid type name "p_attempt_id uuid"
    -- which, because the SQL editor runs the file in one transaction, rolled the
    -- revokes above back with it. The oid overload has no parser to upset.
    v_sig := format('public.%I(%s)', r.proname, r.args);

    -- Nothing in either group may be reachable by an anonymous caller.
    IF has_function_privilege('anon', r.fnoid, 'EXECUTE') THEN
      v_open := v_open || v_sig;
    END IF;

    IF r.internal THEN
      -- Internal helpers must be closed to signed-in callers too.
      IF has_function_privilege('authenticated', r.fnoid, 'EXECUTE') THEN
        v_open := v_open || v_sig;
      END IF;
    ELSE
      -- ...while the app's own RPCs must still work.
      IF NOT has_function_privilege('authenticated', r.fnoid, 'EXECUTE') THEN
        v_broken := v_broken || v_sig;
      END IF;
    END IF;
  END LOOP;

  IF cardinality(v_broken) > 0 THEN
    RAISE EXCEPTION 'these are called by the app and lost their grant, which breaks the exam runner / review / dashboard: %',
      array_to_string(v_broken, ', ');
  END IF;

  IF cardinality(v_open) > 0 THEN
    RAISE EXCEPTION 'still reachable from a browser: %', array_to_string(v_open, ', ');
  END IF;

  -- The deliberate exception, asserted so nobody tidies it away later.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_published_question_ids'
  ) AND NOT has_function_privilege('anon', 'public.get_published_question_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_published_question_ids lost anon - signed-out readers silently lose per-question marks (it is used inside an RLS policy)';
  END IF;

  RAISE NOTICE 'internal helpers are closed to browsers; the app own RPCs still work';
END $chk$;
