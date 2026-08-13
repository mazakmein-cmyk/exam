-- ============================================================
-- public.public_profiles — the public handle, and nothing else
-- plus: make the gold badge stop depending on a one-time backfill
--
-- Two separate bugs made the marketplace byline render "by Unknown" with no
-- badge. The name and the tick failed for different reasons.
--
-- ---- 1. the name ----
--
-- 20260803030000 replaced `profiles ... for select using (true)` with
-- own-row-only, and that audit recorded "exactly one call site in the app reads
-- profiles (joinLiveExam, own row only)". That count was wrong. Two call sites
-- read OTHER users' rows:
--
--   src/pages/Marketplace.tsx  — creator username + is_verified + is_admin_gold
--   src/pages/Analytics.tsx    — top-3 leaderboard names
--
-- Neither errors under the tightened policy. RLS filters rows silently, so the
-- `.in('id', userIds)` query returns [] and both fall through to their
-- `|| 'Unknown'` default.
--
-- The fix is the one 20260803030000 itself prescribed: a view exposing only the
-- safe columns, never a widened policy on the base table, because the base
-- table carries phone_number and full_name.
--
--   exposed:  id, username, avatar_url, is_verified, is_admin_gold
--   withheld: full_name, phone_number, website, updated_at
--
-- full_name stays behind. A real name is exactly what the hardening migration
-- was closing off, and a public handle is all either call site needs.
--
-- The view is intentionally NOT security_invoker: it runs as its owner so it
-- can read past the own-row policy. That is the whole mechanism, and it is safe
-- only because the column list above is narrow — widening it re-opens the leak.
--
-- ---- 2. the tick ----
--
-- Verified against the live database before writing this: NO row in profiles
-- has is_admin_gold = true. Not one. The grant in 20260102000007 never took
-- here — it is a one-time UPDATE, not a trigger, and onboarding inserts profile
-- rows by hand (OnboardingModal.tsx), so any account that onboarded after that
-- migration ran was never considered by it.
--
-- This stayed invisible because the three surfaces resolve the badge
-- differently against lib/verification.ts:17, which returns gold when EITHER
-- the column is true OR the email is the official one:
--
--   ProfileDialog.tsx:145    passes email + column  -> gold via the email branch
--   AdminDashboard.tsx:1032  passes email + column  -> gold via the email branch
--   Marketplace.tsx:336      passes column only     -> nothing
--
-- So the tick visible elsewhere was always the email fallback papering over a
-- false column. The marketplace cannot use that fallback: this view is granted
-- to anon, and exposing email there would re-open the very leak fixed above.
--
-- Deriving gold inside the view via a join to auth.users was the obvious fix
-- and is deliberately NOT used here. Under that shape every anonymous byline
-- read depends on the view owner retaining SELECT on auth.users; if that ever
-- fails the query does not lose a badge, it errors, and every name on the page
-- reverts to "Unknown". That trades a cosmetic bug for a load-bearing one.
--
-- Instead the column stays the single source of truth, and a trigger keeps it
-- true. The read path remains a plain projection of profiles — the exact shape
-- already confirmed working for anon.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ============================================================
-- The view — plain projection, no joins on the anon read path.
-- ============================================================
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT
  p.id,
  p.username,
  p.avatar_url,
  COALESCE(p.is_verified, false)   AS is_verified,
  COALESCE(p.is_admin_gold, false) AS is_admin_gold
FROM public.profiles p;

-- The marketplace is an unauthenticated route (App.tsx mounts /marketplace
-- outside any auth guard), so a signed-out visitor browsing published exams
-- must still see who wrote them. These columns are already on public display
-- next to every published exam.
GRANT SELECT ON public.public_profiles TO anon, authenticated;


-- ============================================================
-- Keep is_admin_gold correct without a human remembering to.
--
-- Grant-only on purpose: it sets the flag for the official account and leaves
-- every other row untouched, so an admin can still grant gold deliberately
-- later without this silently reverting it.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_admin_gold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = NEW.id
      AND lower(u.email) = 'admin@mocksetu.in'
  ) THEN
    NEW.is_admin_gold := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_admin_gold ON public.profiles;
CREATE TRIGGER profiles_sync_admin_gold
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_gold();


-- Repair the existing row. This is what 20260102000007 intended to do and did
-- not achieve on this database; from here the trigger holds it.
UPDATE public.profiles p
SET is_admin_gold = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = 'admin@mocksetu.in'
  AND COALESCE(p.is_admin_gold, false) = false;


-- PostgREST caches the schema, and a brand-new relation it has not seen yet is
-- a 404 rather than a silent empty result. Without this the marketplace keeps
-- saying "Unknown" after the migration and looks like it did not apply.
NOTIFY pgrst, 'reload schema';
