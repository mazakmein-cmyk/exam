-- ============================================================
-- LIVE EXAM v2 — PHASE 1: PRIVACY MODE, STEP 2 OF 2
--
-- ⚠️  RUN THIS ONLY AFTER THE PHASE 1 CLIENT IS DEPLOYED.
--
-- Step 1 (20260803000000) created live_participants_public and deliberately
-- left the old base-table policy in place, so browsers still running the
-- previous client kept working while the new one rolled out.
--
-- This closes that door. Once it runs, students can no longer read
-- live_participants directly — which is the whole point, because a name hidden
-- only in React is one devtools request away from being visible.
--
-- If you run this BEFORE deploying the code, every student tab currently open
-- shows an empty leaderboard until it reloads. Nothing is corrupted and
-- re-running the previous migration is not required — just deploy and the
-- leaderboards return. Ordering it correctly simply avoids the blank minute.
--
-- Verify with supabase/tests/verify_phase1.sql (check 5 flips to PASS here).
-- Idempotent: safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Participants can view leaderboard" ON public.live_participants;

-- The creator's own SELECT policy is untouched and remains the only way to read
-- real names — that is how the control room shows a creator who to help while
-- the projector shows the room a pseudonym.
--
-- Sanity check: the creator policy must still exist, or a creator would lose
-- their own leaderboard entirely.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'live_participants'
      AND policyname = 'Creator can view all participants'
  ) THEN
    RAISE EXCEPTION
      'Refusing to drop the student policy: the creator SELECT policy on live_participants is missing, so the control room would have no leaderboard.';
  END IF;
END $$;
