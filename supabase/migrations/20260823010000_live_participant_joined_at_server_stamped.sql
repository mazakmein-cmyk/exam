-- ============================================================
-- LIVE EXAMS: joined_at is stamped by the server on INSERT, not by the client
--
-- WHAT IS BROKEN
-- protect_live_participant_scores (20260729020000) pins joined_at on the UPDATE
-- branch, so an existing row's join time can never be moved. The INSERT branch
-- only zeroes the score columns — joined_at arrives verbatim from the client.
-- A student inserts their OWN live_participants row (the self-insert policy is
-- what lets them join at all), so they can send joined_at '1970-01-01' and the
-- trigger keeps it.
--
-- WHY THAT MATTERS
-- joined_at is the final tiebreaker in compute_live_rankings:
--
--     ORDER BY total_correct DESC, total_time_ms ASC, joined_at ASC
--
-- so the earliest fake join time wins every tie in the room. The same column
-- also orders anon_ordinal in every masked view and RPC (ORDER BY lp.joined_at,
-- lp.id), so the forged value additionally pins the caller to ordinal 0 and the
-- first anonymous nickname.
--
-- THE FIX
-- On INSERT by a non-creator, stamp joined_at from the server clock. The
-- creator branch is deliberately untouched: compute_live_rankings and the other
-- recompute RPCs run with the creator's auth.uid() and must keep writing
-- participant rows verbatim.
--
-- Nothing legitimate regresses. joinLiveExam never sends joined_at — it relies
-- on the column DEFAULT now(). The rejoin path is an upsert on
-- (live_exam_id, user_id), so a returning student takes the UPDATE branch and
-- keeps their ORIGINAL joined_at rather than being re-stamped to the back of
-- the queue, which is the invariant stable anon names depend on.
--
-- Only future INSERTs are covered. Any row already carrying a forged joined_at
-- keeps it, because the UPDATE branch pins it — normalising those needs a
-- one-off UPDATE run as the creator or service role.
--
-- The BEFORE INSERT OR UPDATE trigger from 20260729020000 resolves this
-- function by name, so replacing the body is enough — no trigger changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_live_participant_scores()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_creator BOOLEAN;
BEGIN
  -- Identity columns are immutable on UPDATE — a student can't relocate their
  -- row into another exam (which would also dodge the creator check below).
  IF TG_OP = 'UPDATE' THEN
    NEW.live_exam_id := OLD.live_exam_id;
    NEW.user_id      := OLD.user_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = NEW.live_exam_id AND user_id = auth.uid()
  ) INTO v_is_creator;

  IF NOT v_is_creator THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.total_correct  := OLD.total_correct;
      NEW.total_answered := OLD.total_answered;
      NEW.total_time_ms  := OLD.total_time_ms;
      NEW.rank           := OLD.rank;
      NEW.joined_at      := OLD.joined_at;
    ELSE
      NEW.total_correct  := 0;
      NEW.total_answered := 0;
      NEW.total_time_ms  := 0;
      NEW.rank           := NULL;
      -- Join time is a ranking tiebreaker and an ordinal key, so it is the
      -- server's to decide — never the joining client's.
      NEW.joined_at      := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
