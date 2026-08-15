-- ============================================================
-- SECURITY: live_questions_student is not for anonymous callers
--
-- The view is definer-rights (no security_invoker) and its only predicate is
-- exam status — there is no per-exam filter and no participation filter. So
-- anything holding the publishable key, which ships inside the client bundle,
-- can read the text, options and image URLs of EVERY published, live or ended
-- exam in the database with one unauthenticated request:
--
--     GET /rest/v1/live_questions_student?select=*
--
-- correct_answer is not in the view, so this was never an answer-key leak. It
-- is the paper itself — and in a live exam the paper is the secret, because the
-- format assumes nobody in the room has seen the next question yet.
--
-- Nothing anonymous reads it. Both callers already hold a session:
--   * LiveExamStudent.init() calls supabase.auth.getUser() FIRST and redirects
--     to /student-auth before it fetches questions.
--   * LiveExamPresent (the projector) is creator-authenticated, and it also
--     depends on live_session_sync, which is granted to authenticated only —
--     the wall cannot run on an anon key regardless of this grant.
-- The public report link is not a consumer either: get_live_exam_report_by_token
-- is SECURITY DEFINER over live_exam_reports.payload and never touches the view.
--
-- Same reasoning and the same shape as the live_participants_public revoke in
-- 20260803030000: joining requires an account, so an anonymous caller has no
-- business holding the questions.
--
-- The anon grant is issued by whichever migration last recreates the view
-- (20260731100000 today). CREATE OR REPLACE VIEW does not reset privileges, so
-- a future recreate must not re-add anon or this silently reopens.
-- Idempotent: safe to re-run.
-- ============================================================

REVOKE ALL ON public.live_questions_student FROM anon;
GRANT SELECT ON public.live_questions_student TO authenticated;


-- ============================================================
-- Self-check — anon must be gone AND students must still be able to read.
-- The second half matters as much as the first: an over-broad revoke here
-- would hand every student an empty paper mid-session, and the client's catch
-- blocks would turn that into a blank screen rather than a visible error.
-- ============================================================
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.live_questions_student', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still SELECT live_questions_student — the revoke did not take (a PUBLIC grant would also produce this)';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.live_questions_student', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on live_questions_student — every student would load a blank paper';
  END IF;

  RAISE NOTICE 'live_questions_student: anon revoked, authenticated intact';
END $$;
