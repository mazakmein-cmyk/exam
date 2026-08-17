-- Paper type — is this exam a mock, or a real previous-year paper?
--
-- Two columns, deliberately in different tables, because they answer two
-- different questions:
--
--   exams.paper_type            what this paper IS          ('mock' | 'pyq')
--   profiles.can_set_paper_type who is allowed to SAY so    (boolean)
--
-- The capability is OFF for everybody. Access is granted one creator at a time
-- from the admin console (admin_set_paper_type_access below). A creator without
-- the grant never sees the field — not in the create dialog, not in the exam
-- editor — and every exam they make is a 'mock', which is what the column
-- default already says. So the feature is invisible until it is granted, and
-- the data is complete either way: there is no "unset" third state for the
-- student-side filter to fall through.
--
-- Why 'pyq' and not 'previous_year_paper': the value travels in every exam row
-- and every filter URL, and "PYQ" is what aspirants call these papers. The
-- creator- and student-facing labels live in src/lib/paperType.js — this column
-- stores the key, never the label, so the wording can be rewritten without a
-- data migration.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. exams.paper_type — NOT NULL, defaults to 'mock'
--
-- Written in four steps rather than one ADD COLUMN ... NOT NULL DEFAULT so a
-- half-applied earlier paste (column added, constraint missing) converges
-- instead of erroring. Existing rows backfill to 'mock', which is exactly what
-- every exam created before this migration is.
-- ============================================================
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS paper_type text;
UPDATE public.exams SET paper_type = 'mock' WHERE paper_type IS NULL;
ALTER TABLE public.exams ALTER COLUMN paper_type SET DEFAULT 'mock';
ALTER TABLE public.exams ALTER COLUMN paper_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exams'::regclass
      AND conname = 'exams_paper_type_valid'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_paper_type_valid CHECK (paper_type IN ('mock', 'pyq'));
  END IF;
END $$;

COMMENT ON COLUMN public.exams.paper_type IS
  'What kind of paper this is: ''mock'' (default) or ''pyq'' (previous-year paper). Only creators with profiles.can_set_paper_type may choose; everyone else creates mocks. Labels live in src/lib/paperType.js.';

-- The student library filters published exams by type. Partial index: the
-- unpublished half of the table is never filtered this way.
CREATE INDEX IF NOT EXISTS idx_exams_paper_type_published
  ON public.exams(paper_type)
  WHERE is_published = true;


-- ============================================================
-- 2. profiles.can_set_paper_type — the per-creator grant, off by default
--
-- Readable by the creator themselves: profiles' SELECT policy is own-row only
-- (20260803030000), which is exactly the access the app needs — a creator reads
-- their own flag to decide whether to render the field.
--
-- NOT added to the public_profiles view. That view is granted to anon and its
-- column list is deliberately narrow; who may tag a PYQ is nobody else's
-- business.
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_set_paper_type boolean;
UPDATE public.profiles SET can_set_paper_type = false WHERE can_set_paper_type IS NULL;
ALTER TABLE public.profiles ALTER COLUMN can_set_paper_type SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN can_set_paper_type SET NOT NULL;

COMMENT ON COLUMN public.profiles.can_set_paper_type IS
  'Admin-granted: may this creator choose exams.paper_type? false for everyone until granted from the admin console. When false the field is not rendered anywhere and new exams stay ''mock''.';


-- ============================================================
-- 3. admin_set_paper_type_access — grant/revoke, one creator at a time
--
-- An explicit setter, not a toggle: the console already knows the state it
-- wants, and a double-click on a toggle would silently flip the grant back.
--
-- UPDATE-only on purpose. Inserting a profile row here would look harmless and
-- would break onboarding: Dashboard/Marketplace/Auth all treat "no profile row"
-- as "show the (non-dismissable) onboarding modal", so a bare row minted by an
-- admin would skip the flow and leave the account with no username. If the
-- creator has not onboarded there is nothing to grant yet, and saying so is
-- more useful than a silent no-op.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_paper_type_access(
  target_user_id uuid,
  allow boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_status boolean;
BEGIN
  IF auth.jwt() ->> 'email' NOT IN ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') THEN
    RAISE EXCEPTION 'Access Denied: Admin privileges required.';
  END IF;

  UPDATE public.profiles
  SET can_set_paper_type = coalesce(allow, false)
  WHERE id = target_user_id
  RETURNING can_set_paper_type INTO new_status;

  IF new_status IS NULL THEN
    RAISE EXCEPTION 'This account has no profile yet — it must finish onboarding before the paper type field can be granted.';
  END IF;

  RETURN new_status;
END;
$$;


-- ============================================================
-- 4. admin_get_all_users — carry the grant so the console can show it
--
-- Body copied forward from 20260727130000 (the current definition) with one
-- column added. DROP first: the return type changed.
-- ============================================================
DROP FUNCTION IF EXISTS admin_get_all_users();
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  phone text,
  user_type text,
  username text,
  created_at timestamptz,
  is_verified boolean,
  last_sign_in_at timestamptz,
  exams_created int,
  exams_attempted int,
  can_set_paper_type boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.jwt() ->> 'email' NOT IN ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') THEN
    RAISE EXCEPTION 'Access Denied: Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    coalesce(nullif(p.phone_number, ''), u.phone::text) AS phone,
    (u.raw_user_meta_data->>'user_type')::text AS user_type,
    p.username::text,
    u.created_at,
    coalesce(p.is_verified, false) AS is_verified,
    u.last_sign_in_at,
    (select count(*)::int from public.exams e where e.user_id = u.id) AS exams_created,
    (
      select count(*)::int
      from public.attempts a
      where a.user_id = u.id
        and a.section_id in (
          select distinct on (s.exam_id, coalesce(s.language, 'en')) s.id
          from public.sections s
          order by s.exam_id, coalesce(s.language, 'en'), s.sort_order asc, s.created_at asc
        )
    ) AS exams_attempted,
    coalesce(p.can_set_paper_type, false) AS can_set_paper_type
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  ORDER BY u.created_at DESC;
END;
$$;


-- PostgREST caches the column list; without this, inserts/updates naming
-- paper_type fail with PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';


-- Verify the paste itself: raise immediately if anything did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'paper_type'
  ) THEN
    RAISE EXCEPTION 'exams.paper_type missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'can_set_paper_type'
  ) THEN
    RAISE EXCEPTION 'profiles.can_set_paper_type missing after migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exams WHERE paper_type NOT IN ('mock', 'pyq')) THEN
    RAISE EXCEPTION 'exams.paper_type holds a value outside (mock, pyq) after migration';
  END IF;
END $$;
