-- ============================================================
-- LIVE EXAMS: the share link stops admitting people when the session ends
--
-- WHAT IS BROKEN
-- joinLiveExam upserts a live_participants row with no status check, and the
-- INSERT policy only asks "are you signed in, and are you a student". So anyone
-- opening a share link AFTER the session has finished is silently enrolled as
-- an attendee of an exam they never sat. They are shown a "here's how you
-- finished" card reporting zero, and — worse, because it is other people's data
-- now — that zero row appears in the standings the class can see, in the
-- creator's participant list, and in the head count on the report.
--
-- A live exam's link is long-lived by design: it is handed out at publish and
-- pasted into class groups. So this is not an edge case, it is what happens
-- every time somebody scrolls back to yesterday's message.
--
-- THE RULE
-- A session that has ended admits nobody new. Someone who WAS in the room keeps
-- full access — reopening the link to read your own result is the normal way
-- that page is used afterwards — because they already have a row and therefore
-- never INSERT again. The client is careful not to upsert on this path for
-- exactly that reason: an upsert is still checked against the INSERT policy
-- even when the row exists, so a returning student would be refused by their
-- own re-join.
--
-- WHY THE POLICY AND NOT THE TRIGGER
-- trg_live_participant_guard (20260823010000) already normalises this table on
-- write, and it would have been the shorter edit. But it is a BEFORE trigger
-- that RETURNs NEW, so refusing there means RAISE — a Postgres string in front
-- of a student. A policy refusal is a clean 42501 the client already maps to
-- "Link expired".
--
-- 'draft' is excluded too. It was never reachable (a draft has no share link),
-- and naming the two statuses that ARE joinable is what keeps a future status
-- from being admitted by default.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can join live exams" ON public.live_participants;

CREATE POLICY "Authenticated users can join live exams"
  ON public.live_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    -- Creators never answer their own exam (20260801000000). Unchanged.
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') = 'student'
    -- NEW: the session must still be open to newcomers.
    AND EXISTS (
      SELECT 1 FROM public.live_exams le
      WHERE le.id = live_exam_id
        AND le.status IN ('published', 'live')
    )
  );


-- ============================================================
-- Self-check
--
-- Two directions, and the second matters as much as the first: an over-broad
-- predicate here does not read as a security fix, it reads as "nobody can join
-- the exam", discovered by a room of students at the moment the host starts.
-- ============================================================
DO $chk$
DECLARE
  v_qual TEXT;
BEGIN
  SELECT with_check INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'live_participants'
    AND policyname = 'Authenticated users can join live exams';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'the join policy is missing - nobody could join any live exam';
  END IF;

  -- The new half.
  IF position('status' in v_qual) = 0 THEN
    RAISE EXCEPTION 'the join policy does not look at the session status - an ended link still enrols phantom attendees';
  END IF;

  IF position('''live''' in v_qual) = 0 OR position('''published''' in v_qual) = 0 THEN
    RAISE EXCEPTION 'the join policy does not admit published/live sessions - the room could not fill';
  END IF;

  -- The halves that were already there and must not have been dropped in the
  -- rewrite. Losing the first lets one student join as another; losing the
  -- second lets a creator enrol on their own leaderboard.
  IF position('uid()' in v_qual) = 0 THEN
    RAISE EXCEPTION 'the join policy lost its identity check';
  END IF;

  IF position('user_type' in v_qual) = 0 THEN
    RAISE EXCEPTION 'the join policy lost the creator exclusion from 20260801000000';
  END IF;

  RAISE NOTICE 'an ended live session no longer admits anyone new; people already in the room keep full access';
END $chk$;
