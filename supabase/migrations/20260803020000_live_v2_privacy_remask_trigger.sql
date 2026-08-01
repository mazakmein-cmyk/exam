-- ============================================================
-- LIVE EXAM v2 — PHASE 1 FIX: RE-MASK ON TOGGLE
--
-- The gap this closes
-- -------------------
-- 20260803000000 masked fastest_user_name at COMPUTE time and back-filled
-- existing rows ONCE, as a migration statement. Both were necessary and neither
-- was sufficient, because privacy_mode is a switch a creator flips whenever they
-- like:
--
--   1. Creator runs a session. Analytics rows store real names — correctly,
--      privacy mode is off.
--   2. Creator turns privacy mode on.
--   3. Nothing re-masks step 1's rows. They are still readable by every student,
--      and live_question_analytics is in the realtime publication, so they are
--      pushed to every student.
--
-- verify_phase1.sql check 11 found exactly this: 2 leaked rows.
--
-- A one-time UPDATE cannot fix a continuous invariant. The invariant is:
--
--   No analytics row of a privacy-mode exam contains a real display name.
--
-- Enforced here by a trigger, because privacy_mode can be changed from the
-- control room, from another client, from the SQL editor, or by a future feature
-- nobody has written yet. A client-side re-mask would be forgotten by exactly
-- one of those paths, and the cost of forgetting is a leak.
--
-- Both directions are handled. Turning privacy OFF must restore real names, or
-- the creator's own past sessions stay pseudonymised forever.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Re-derive every stored fastest name for one exam
--
--    fastest_user_id is the durable identity; fastest_user_name is only ever a
--    display value, derived from it plus the exam's current privacy_mode. This
--    function is the single place that derivation lives outside the analytics
--    compute itself, and it uses the same join-order ordinal as
--    live_participants_public so a pseudonym is identical on both surfaces.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_refresh_fastest_names(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privacy BOOLEAN;
BEGIN
  SELECT privacy_mode INTO v_privacy
  FROM public.live_exams
  WHERE id = p_live_exam_id;

  IF v_privacy IS NULL THEN
    RETURN; -- unknown exam; nothing to do
  END IF;

  UPDATE public.live_question_analytics a
  SET fastest_user_name = CASE
        WHEN v_privacy THEN public.live_anon_name(o.ord)
        ELSE o.display_name
      END
  FROM (
    SELECT
      lp.user_id,
      lp.display_name,
      (ROW_NUMBER() OVER (ORDER BY lp.joined_at, lp.id) - 1)::INTEGER AS ord
    FROM public.live_participants lp
    WHERE lp.live_exam_id = p_live_exam_id
  ) o
  WHERE a.live_exam_id = p_live_exam_id
    AND a.fastest_user_id = o.user_id
    -- Skip rows that are already correct, so a no-op toggle does not fire a
    -- realtime UPDATE per question to every student in the room.
    AND a.fastest_user_name IS DISTINCT FROM (
      CASE WHEN v_privacy THEN public.live_anon_name(o.ord) ELSE o.display_name END
    );

  -- A row whose fastest participant no longer exists cannot be re-derived. Under
  -- privacy mode that leaves a name we can no longer prove is safe, so blank it.
  -- (When privacy is off there is nothing to hide, and the historical name is
  -- worth more than a null.)
  IF v_privacy THEN
    UPDATE public.live_question_analytics a
    SET fastest_user_name = NULL
    WHERE a.live_exam_id = p_live_exam_id
      AND a.fastest_user_id IS NOT NULL
      AND a.fastest_user_name IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.live_participants lp
        WHERE lp.live_exam_id = p_live_exam_id
          AND lp.user_id = a.fastest_user_id
      );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_refresh_fastest_names(UUID) TO authenticated;


-- ============================================================
-- 2. Fire it whenever privacy_mode actually changes
--
--    Scoped with UPDATE OF plus a WHEN clause because live_exams is written on
--    every single unlock (index, unlocked_at, extra seconds). An unguarded
--    trigger would re-scan the analytics of the whole exam forty times a
--    session for nothing.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_privacy_mode_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.live_refresh_fastest_names(NEW.id);
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_live_privacy_mode_changed ON public.live_exams;
CREATE TRIGGER trg_live_privacy_mode_changed
  AFTER UPDATE OF privacy_mode ON public.live_exams
  FOR EACH ROW
  WHEN (OLD.privacy_mode IS DISTINCT FROM NEW.privacy_mode)
  EXECUTE FUNCTION public.live_privacy_mode_changed();


-- ============================================================
-- 3. Repair what is already stored
--
--    Runs for every exam that has a resolvable fastest answer, not only the
--    privacy-mode ones: an exam toggled ON and then OFF before this trigger
--    existed is sitting on pseudonyms with privacy off, which is the same bug
--    pointing the other way.
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT a.live_exam_id AS id
    FROM public.live_question_analytics a
    WHERE a.fastest_user_id IS NOT NULL
  LOOP
    PERFORM public.live_refresh_fastest_names(r.id);
  END LOOP;
END $$;
