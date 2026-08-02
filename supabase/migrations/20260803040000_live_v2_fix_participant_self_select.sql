-- ============================================================
-- HOTFIX — students cannot join: "new row violates row-level security
-- policy for table live_participants"
--
-- Cause
-- -----
-- 20260803010000 (privacy step 2) dropped "Participants can view leaderboard",
-- which was the ONLY SELECT policy students had on live_participants. That was
-- correct for its stated purpose — the leaderboard now goes through
-- live_participants_public, which masks names — but it also removed SELECT from a
-- path nobody checked.
--
-- joinLiveExam runs:
--
--   .upsert({...}, { onConflict: "live_exam_id,user_id" }).select().single()
--
-- INSERT ... ON CONFLICT DO UPDATE needs to READ the conflicting row to decide
-- whether to update it, and PostgreSQL applies SELECT policies to that read. With
-- no SELECT policy the statement is refused, and the error surfaces as a
-- row-level-security violation on the insert. The trailing .select() would fail
-- for the same reason.
--
-- So every returning student — anyone whose participant row already existed —
-- could no longer rejoin. A first-time join inserted cleanly; a reload did not.
--
-- Fix
-- ---
-- Give a student SELECT on their OWN row and nothing else. That is strictly
-- narrower than what was dropped: the old policy exposed every participant of any
-- live exam, which is what made privacy mode cosmetic. This exposes one row to the
-- person it describes.
--
-- The leaderboard is unaffected and still goes through live_participants_public.
--
-- Lesson recorded in the code: dropping a policy is a change to every statement
-- that touches the table, not only to the query you had in mind. An upsert reads.
--
-- Idempotent: safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Users can view own participant record" ON public.live_participants;
CREATE POLICY "Users can view own participant record"
  ON public.live_participants FOR SELECT
  USING (auth.uid() = user_id);

-- Sanity check: the two policies this path also depends on must still exist. If a
-- future migration removes either, joining breaks again in a way that looks like
-- this one and is easy to misdiagnose.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_participants'
      AND policyname = 'Authenticated users can join live exams'
  ) THEN
    RAISE WARNING 'live_participants has no INSERT policy — students cannot join at all.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_participants'
      AND policyname = 'Users can update own participant record'
  ) THEN
    RAISE WARNING 'live_participants has no UPDATE policy — the upsert conflict path will fail.';
  END IF;
END $$;
