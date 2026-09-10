-- ============================================================
-- THE PYQ BADGE STOPS BEING AN HONOR SYSTEM (issue 17)
--
-- WHAT WAS BROKEN
-- profiles.can_set_paper_type was presented as an authorization boundary —
-- admin-granted, per creator — but nothing server-side ever consulted it. The
-- exam editor merely HID the Mock/PYQ selector from ungranted creators, and
-- the only database rule on paper_type was a spelling CHECK. Any creator
-- could PATCH paper_type='pyq' onto their own exam through the API and get
-- the gold badge, the ?type=pyq listing and the SEO shelf — while the admin
-- console still showed them as not having the right.
--
-- THE FIX
-- A BEFORE INSERT OR UPDATE trigger on exams: CHANGING paper_type to 'pyq'
-- from a browser role requires the caller to hold the grant. Same role gate
-- as attempts_lock_columns (20260837000000): SECURITY DEFINER functions, the
-- SQL editor and the service role pass untouched, so the admin console needs
-- no rewrite.
--
-- REVOKE KEEPS EXISTING MARKS, BY DESIGN. The gate fires only when the value
-- is being SET to 'pyq' — an update that leaves an already-'pyq' exam as it
-- is passes, so revoking a creator's grant stops NEW markings without
-- stripping old ones, and without bricking their ability to save unrelated
-- edits on an exam that is already PYQ.
--
-- COST: zero — one indexed own-row read inside exam saves that already
-- happen, on a creator-only cold path.
--
-- Requires (apply first): 20260825000000 (the column and the grant).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'can_set_paper_type'
  ) THEN
    RAISE EXCEPTION 'apply 20260825000000_add_exam_paper_type.sql first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.exams_enforce_paper_type_grant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Server-side writers pass untouched: SECURITY DEFINER functions run as
  -- their owner, the SQL editor as postgres, the backend as service_role.
  -- Only the roles a browser can hold are constrained.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Only the TRANSITION to 'pyq' is gated. Keeping an existing 'pyq' as it is
  -- must pass, or revoking a grant would brick every save on the exams the
  -- creator legitimately marked while granted.
  IF NEW.paper_type = 'pyq'
     AND (TG_OP = 'INSERT' OR NEW.paper_type IS DISTINCT FROM OLD.paper_type)
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.can_set_paper_type = true
    ) THEN
      RAISE EXCEPTION 'PAPER_TYPE_NOT_GRANTED: marking an exam as a previous-year paper requires an admin grant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exams_enforce_paper_type_grant ON public.exams;
CREATE TRIGGER exams_enforce_paper_type_grant
  BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW
  EXECUTE FUNCTION public.exams_enforce_paper_type_grant();

-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'exams'
      AND t.tgname = 'exams_enforce_paper_type_grant' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'the paper-type grant trigger did not land';
  END IF;

  v_def := pg_get_functiondef('public.exams_enforce_paper_type_grant()'::regprocedure);
  IF position('can_set_paper_type = true' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the trigger does not consult the grant';
  END IF;
  IF position('NEW.paper_type IS DISTINCT FROM OLD.paper_type' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the transition-only rule is gone — revoking a grant would brick saves on existing PYQ exams';
  END IF;
  IF position('current_user NOT IN (''authenticated'', ''anon'')' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the server-role passthrough is gone — admin functions would be blocked';
  END IF;

  RAISE NOTICE 'the PYQ badge now requires its grant: browsers cannot set paper_type=pyq without it';
END $$;
