-- Read-only. Answers: why does the gold tick show in the profile dialog but not
-- on the marketplace card?
--
-- The two surfaces resolve the badge differently:
--
--   ProfileDialog / AdminDashboard  →  getVerificationTier({ email, ... })
--   Marketplace                     →  getVerificationTier({ is_admin_gold })   -- no email
--
-- verification.ts:17 returns "gold" if EITHER is_admin_gold is true OR the email
-- is admin@mocksetu.in. So a false column still shows gold anywhere email is in
-- scope, and hides it on the marketplace. Run this to see which is happening.

-- 1. Who owns the published exams, and is their column actually set?
SELECT
  p.username,
  u.email,
  COALESCE(p.is_admin_gold, false) AS column_says_gold,
  lower(u.email) = 'admin@mocksetu.in' AS email_says_gold,
  COALESCE(p.is_verified, false)    AS is_verified,
  COUNT(e.id)                       AS published_exams
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.exams e ON e.user_id = p.id AND e.is_published = true
GROUP BY p.username, u.email, p.is_admin_gold, p.is_verified
HAVING COUNT(e.id) > 0
ORDER BY published_exams DESC;

-- Reading the result:
--   column_says_gold = false AND email_says_gold = true
--     → the 20260102000007 backfill never took on this database. Expected if it
--       ran against the wrong project, or if the profile row was created after
--       it ran (onboarding inserts profiles manually; the migration is a
--       one-time UPDATE, not a trigger).
--   column_says_gold = false AND email_says_gold = false
--     → this account is not admin@mocksetu.in at all. The gold tick seen
--       elsewhere is coming from a different signed-in account than the one
--       that owns the exam.

-- 2. Does anyone hold the column at all?
SELECT COUNT(*) AS profiles_with_gold_column
FROM public.profiles
WHERE is_admin_gold = true;
