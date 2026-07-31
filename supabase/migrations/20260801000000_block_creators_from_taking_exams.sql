-- ============================================================
-- CREATORS CANNOT TAKE EXAMS (mock or live)
--
-- Product rule: a creator account never sits an exam. It may PREVIEW its own
-- exam, and a preview persists nothing — so the write paths that represent
-- "somebody is taking this exam" are closed to non-student accounts:
--
--   1. attempts INSERT          — mock exams (was: students OR own exam)
--   2. live_participants INSERT — live exams (was: any authenticated user)
--
-- Reads are untouched: creators keep their analytics/leaderboard SELECT
-- policies, and previewing only ever reads.
--
-- "Non-student" is the same test the rest of the schema already uses
-- (20251230100000_enforce_user_roles.sql): user_metadata.user_type. Legacy
-- accounts with no user_type are treated as creators, which matches how the
-- client resolves roles (src/hooks/use-user-role.ts, src/lib/examAccess.ts).
-- ============================================================

-- ── 1. attempts: only students may start a mock attempt ─────────────────────
-- Previously creators could also insert an attempt on their OWN exam ("preview
-- mode"); previews no longer create attempts at all, so that branch is gone and
-- a creator's own analytics stay free of self-attempts.
DROP POLICY IF EXISTS "Users can create their own attempts" ON public.attempts;
CREATE POLICY "Users can create their own attempts"
  ON public.attempts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') = 'student'
  );

-- Responses hang off an attempt the caller owns, so closing attempts INSERT
-- closes the whole mock "take exam" write path.

-- ── 2. live_participants: only students may join a live exam ────────────────
-- This is what a creator answering a rival's live exam relied on: any
-- authenticated user could insert a participant row and then submit answers
-- (submit_live_response requires a participant row, so this closes that too).
-- The creator's own preview never inserted a row (see joinLiveExam), so
-- watch-only previews are unaffected.
DROP POLICY IF EXISTS "Authenticated users can join live exams" ON public.live_participants;
CREATE POLICY "Authenticated users can join live exams"
  ON public.live_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') = 'student'
  );
