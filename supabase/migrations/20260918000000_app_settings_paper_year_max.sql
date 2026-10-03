-- App settings, and the first thing kept in them: how far into the future a
-- paper may be dated.
--
-- WHY A SETTING AT ALL. The Year picker (20260917000000) runs from this year
-- back to 1990, which is right for a paper that has already been sat. But
-- Indian exam cycles are named for the year AHEAD — "JEE Main 2027" is written
-- and talked about all through 2026 — so a creator preparing that paper in
-- December needs a year the calendar has not reached. Rather than guess how
-- many years ahead to offer, the ceiling is one number an admin moves.
--
-- WHY A KEY/VALUE TABLE and not a paper_year_max column somewhere: this repo
-- had nowhere to put a global, admin-owned setting — every admin control so far
-- is a per-creator grant on profiles. The next such setting should not need its
-- own table and its own policies, so this one is generic and this migration
-- writes the RLS once.
--
-- NO SEED ROW. An absent key means "the current year", the same absent-tolerant
-- rule the rest of this codebase uses: a database without this migration, a
-- fetch that fails, a key nobody has set — all behave exactly as the picker did
-- before this existed. There is no half-configured state to reason about, and
-- nothing drifts as the calendar moves.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. app_settings — one row per setting, value as jsonb
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_settings IS
  'Global, admin-owned configuration. One row per setting, keyed by a stable string. Readable by everyone (it is not secret and the creator UI needs it before sign-in completes); writable only through SECURITY DEFINER admin RPCs — there is deliberately no INSERT/UPDATE/DELETE policy.';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Read: everyone, signed in or not. The year ceiling shapes a picker, not a
-- permission, and keeping it readable means no extra round trip through an RPC
-- on a page a creator opens constantly.
DROP POLICY IF EXISTS "app_settings are world readable" ON public.app_settings;
CREATE POLICY "app_settings are world readable"
  ON public.app_settings FOR SELECT
  USING (true);

-- Write: nobody, by policy. Every change goes through an admin RPC below, which
-- is SECURITY DEFINER and checks the caller's email. A table with RLS enabled
-- and no write policy denies all writes, which is exactly the intent — stated
-- here rather than left to be inferred from the absence of a policy.
REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon, authenticated;
GRANT SELECT ON public.app_settings TO anon, authenticated;


-- ============================================================
-- 2. admin_set_paper_year_max — move the ceiling
--
-- An explicit setter, like admin_set_paper_type_access: the console knows the
-- value it wants, so there is no increment to double-fire.
--
-- The floor is the CURRENT year, not 1990. Lowering the ceiling below today
-- would stop creators dating a paper that has already been sat, which is the
-- field's whole purpose; the admin can always walk an over-eager 2030 back down
-- to this year. Papers already dated above a lowered ceiling keep their year —
-- the column's own 1990..2100 constraint still holds it, and the picker keeps
-- offering a value it is currently showing (see PaperYearSelect).
--
-- now() is allowed here because this is a function body, not a CHECK
-- constraint — which is why the column's constraint had to settle for 2100.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_paper_year_max(next_year integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  this_year integer := extract(year from now())::integer;
BEGIN
  IF auth.jwt() ->> 'email' NOT IN ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') THEN
    RAISE EXCEPTION 'Access Denied: Admin privileges required.';
  END IF;

  IF next_year IS NULL THEN
    RAISE EXCEPTION 'A year is required.';
  END IF;

  IF next_year < this_year THEN
    RAISE EXCEPTION 'The ceiling cannot be earlier than % — creators must always be able to date a paper from this year.', this_year;
  END IF;

  IF next_year > 2100 THEN
    RAISE EXCEPTION 'exams.paper_year only accepts years up to 2100.';
  END IF;

  INSERT INTO public.app_settings (key, value, updated_at, updated_by)
  VALUES ('paper_year_max', to_jsonb(next_year), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  RETURN next_year;
END;
$$;

COMMENT ON FUNCTION public.admin_set_paper_year_max(integer) IS
  'Set the newest year creators may pick for a previous-year paper. Admin only. The key is absent until this is first called, and absent means "the current year".';


-- PostgREST caches the schema; without this the new table and function are
-- invisible (PGRST202/PGRST205) until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';


-- Verify the paste itself: raise immediately if anything did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings'
  ) THEN
    RAISE EXCEPTION 'public.app_settings missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_set_paper_year_max'
  ) THEN
    RAISE EXCEPTION 'admin_set_paper_year_max missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_settings' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'app_settings has no SELECT policy — the picker could not read the ceiling';
  END IF;
END $$;
