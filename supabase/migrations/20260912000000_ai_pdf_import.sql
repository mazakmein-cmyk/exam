-- AI PDF import — "Import from PDF" inside MockSetu, one creator at a time.
--
-- Until now a creator ran the extraction prompt in their own AI and uploaded
-- the JSON by hand. This migration backs the in-app version, where the
-- ai-pdf-import edge function sends the same prompt and the creator's PDF to
-- Gemini with MockSetu's key, and the exam page turns the reply into sections
-- and questions automatically.
--
-- Three pieces, and why each lives where it does:
--
--   profiles.can_use_ai_import   who may use it (boolean, off for everyone)
--   admin_set_ai_import_access   the admin console's grant/revoke
--   ai_import_jobs               one row per Gemini run — status, the raw reply,
--                                which key slot served it, and whether the
--                                result was imported. Lets a creator close the
--                                window and pick the job up again, and lets the
--                                admin see what the platform key is spending.
--
-- The grant is OFF for everybody. A creator without it never sees the menu
-- item, and the edge function refuses them even if they call it directly. Same
-- shape as profiles.can_set_paper_type (20260825000000), on purpose: the admin
-- console already knows how to show and flip a per-creator boolean.
--
-- Apply AFTER 20260851000000_admin_attempts_are_engaged.sql: section 3 below
-- carries that file's admin_get_all_users body forward and calls
-- admin_engaged_sittings(), which it defines.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. profiles.can_use_ai_import — the per-creator grant, off by default
--
-- Readable by the creator themselves through profiles' own-row SELECT policy;
-- the app reads its own flag to decide whether to render the menu item. NOT
-- added to public_profiles: who may spend the platform's Gemini quota is
-- nobody else's business.
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_use_ai_import boolean;
UPDATE public.profiles SET can_use_ai_import = false WHERE can_use_ai_import IS NULL;
ALTER TABLE public.profiles ALTER COLUMN can_use_ai_import SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN can_use_ai_import SET NOT NULL;

COMMENT ON COLUMN public.profiles.can_use_ai_import IS
  'Admin-granted: may this creator import questions from a PDF with Gemini inside MockSetu? false for everyone until granted from the admin console. Checked by the ai-pdf-import edge function on every call, not only by the UI.';


-- ============================================================
-- 2. admin_set_ai_import_access — grant/revoke, one creator at a time
--
-- Explicit setter, not a toggle, for the same reason as the paper-type grant:
-- a double-click on a toggle would silently flip the grant back. UPDATE-only:
-- minting a profile row here would skip onboarding.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_ai_import_access(
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
  SET can_use_ai_import = coalesce(allow, false)
  WHERE id = target_user_id
  RETURNING can_use_ai_import INTO new_status;

  IF new_status IS NULL THEN
    RAISE EXCEPTION 'This account has no profile yet — it must finish onboarding before AI import can be granted.';
  END IF;

  RETURN new_status;
END;
$$;


-- ============================================================
-- 3. admin_get_all_users — carry the new grant so the console can show it
--
-- Body copied forward from 20260851000000 (the current definition) with one
-- column appended. DROP first: the return type changed.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_get_all_users();
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
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
  can_set_paper_type boolean,
  can_use_ai_import boolean
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
    -- Engaged sittings only (20260851000000): a raw attempt count included
    -- anyone who opened a paper and closed the tab.
    (select count(*)::int from public.admin_engaged_sittings(u.id)) AS exams_attempted,
    coalesce(p.can_set_paper_type, false) AS can_set_paper_type,
    coalesce(p.can_use_ai_import, false) AS can_use_ai_import
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  ORDER BY u.created_at DESC;
END;
$$;


-- ============================================================
-- 4. ai_import_jobs — one row per Gemini run
--
-- Written ONLY by the edge function (service role). Creators get a SELECT
-- policy on their own rows so the exam page can offer to resume a job that is
-- still running, or reuse a finished reply that was never imported. No
-- INSERT/UPDATE/DELETE policy on purpose: a job row is the platform's record
-- of what its key was asked to do, and the client must not be able to forge
-- one.
--
--   engine        'background' — Gemini runs it server-side (Interactions API,
--                                background=true) and we poll by interaction_id.
--                 'live'       — the edge function itself waits on Gemini
--                                (models that refuse background mode), bounded
--                                by the function wall-clock limit.
--   api_key_slot  which configured key served the job — 'primary', 'fallback',
--                 'fallback2' or 'fallback3', matching GEMINI_API_KEY and its
--                 three optional fallbacks. A background interaction can only
--                 be polled with the key that created it, so this is not just
--                 bookkeeping.
--   raw_output    Gemini's reply, verbatim. The client parses it with the same
--                 parser the manual JSON upload uses. Cleared by ack once the
--                 result has been imported.
--   imported_at   set when the exam page has committed the result. A completed
--                 job with imported_at NULL is a reply the creator can still
--                 use (closed the window between "done" and "saved").
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_import_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id        uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  language       text NOT NULL,
  model          text NOT NULL,
  engine         text NOT NULL CHECK (engine IN ('background', 'live')),
  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  interaction_id text,
  api_key_slot   text NOT NULL DEFAULT 'primary'
                 CHECK (api_key_slot IN ('primary', 'fallback', 'fallback2', 'fallback3')),
  storage_path   text NOT NULL,
  pdf_name       text,
  pdf_url        text,
  section_names  text[] NOT NULL DEFAULT '{}',
  prompt_version text NOT NULL DEFAULT '1.0',
  raw_output     text,
  usage          jsonb,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  imported_at    timestamptz
);

-- The key chain grew from two slots to four after the table first shipped, and
-- CREATE TABLE IF NOT EXISTS above is a no-op on a database that already has
-- it. Restate the constraint unconditionally so re-pasting this file widens an
-- existing table too — without it the edge function's UPDATE fails with a check
-- violation the moment a job is served by 'fallback2' or 'fallback3'.
ALTER TABLE public.ai_import_jobs
  DROP CONSTRAINT IF EXISTS ai_import_jobs_api_key_slot_check;
ALTER TABLE public.ai_import_jobs
  ADD CONSTRAINT ai_import_jobs_api_key_slot_check
  CHECK (api_key_slot IN ('primary', 'fallback', 'fallback2', 'fallback3'));

COMMENT ON TABLE public.ai_import_jobs IS
  'One row per in-app "Import from PDF" run. Written only by the ai-pdf-import edge function; creators may read their own rows to resume or reuse a job.';

ALTER TABLE public.ai_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators read their own AI import jobs" ON public.ai_import_jobs;
CREATE POLICY "Creators read their own AI import jobs"
  ON public.ai_import_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_import_jobs_user_created
  ON public.ai_import_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_import_jobs_exam_created
  ON public.ai_import_jobs(exam_id, created_at DESC);


-- PostgREST caches the column list and the RPC list; without this the new
-- column, table and function 404 / PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';


-- Verify the paste itself: raise immediately if anything did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'can_use_ai_import'
  ) THEN
    RAISE EXCEPTION 'profiles.can_use_ai_import missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_import_jobs'
  ) THEN
    RAISE EXCEPTION 'ai_import_jobs missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_set_ai_import_access'
  ) THEN
    RAISE EXCEPTION 'admin_set_ai_import_access missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_import_jobs'
      AND policyname = 'Creators read their own AI import jobs'
  ) THEN
    RAISE EXCEPTION 'ai_import_jobs SELECT policy missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_import_jobs'::regclass
      AND conname = 'ai_import_jobs_api_key_slot_check'
      AND pg_get_constraintdef(oid) LIKE '%fallback3%'
  ) THEN
    RAISE EXCEPTION 'ai_import_jobs.api_key_slot still rejects the extra fallback keys';
  END IF;
END $$;
