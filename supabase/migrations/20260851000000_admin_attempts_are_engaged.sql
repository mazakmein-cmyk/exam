-- ============================================================
-- THE ADMIN CONSOLE COUNTS THE SAME ATTEMPTS THE DASHBOARD DOES
--
-- WHAT WAS BROKEN
-- An attempt row is created the moment a student clicks Start, before they
-- answer anything, because the clock and the resume feature both need a row to
-- exist. Someone who opens a paper, sees 100 questions and closes the tab
-- leaves a permanent record behind.
--
-- 20260845000000 settled what to do about that for the creator dashboard:
-- answered at least one question = an attempt, touched nothing = not an
-- attempt. The admin console never got the rule. Both of its numbers --
-- `exams_attempted` in admin_get_all_users and the "N Attempted" popup from
-- admin_get_user_attempts -- counted raw rows, so the two screens disagree
-- about the same student in the same database.
--
-- It is a small number and it is read directly, by a person, as "is this
-- student actually using the product". A group link where 25 of 30 recipients
-- bounced off the start screen gave 25 people a permanent "1 Attempted".
--
-- WHY ONE SHARED FUNCTION RATHER THAN THE SAME FILTER TWICE
-- The count and the popup were already written to mirror each other by hand --
-- 20260826000000 says so in its own header, because rows in the popup that do
-- not add up to the number above them is its own bug. Two copies of a filter
-- is how they drift. Both now select from one function, so they cannot.
--
-- THE SITTING SUBTLETY THAT A NAIVE FILTER GETS WRONG
-- A four-section paper writes FOUR attempt rows per sitting. Both admin
-- queries already lean on that: they count only rows on the first section of
-- each exam-language variant, which is this schema's only proxy for "one
-- sitting" (there is no sitting id on attempts).
--
-- So testing engagement on the first-section row alone would be wrong in a new
-- direction: a student who skipped a hard section 1 outright and answered
-- thirty questions in section 2 genuinely sat the paper, and would vanish from
-- the count. Engagement is therefore tested across the whole SITTING -- every
-- attempt row for that student, that exam and that language from this sitting's
-- start until the next sitting's start, found with lead() over the same
-- first-section rows that identify the sittings.
--
-- WHAT DELIBERATELY DOES NOT CARRY OVER FROM 20260845000000
-- That function also excludes the creator's own runs (`a.user_id <> e.user_id`),
-- because it measures the cohort that sat one exam and the author is not part
-- of it. This is a different question -- what has this USER done -- and a
-- creator who sat their own paper did sit it. Copying the exclusion here would
-- blank the activity of every creator who tested their own work.
--
-- Retakes still count separately, and each language variant of a paper still
-- counts separately. Both are pre-existing behaviour, both are what the popup
-- shows (one dated row per sitting), and neither is what this file is about.
--
-- COST
-- The count is a correlated call, so listing the users table runs the helper
-- once per user instead of one subquery per user. At this project's scale --
-- a few hundred users, a few thousand attempt rows -- that is milliseconds,
-- and it is an admin-only screen that one person opens occasionally. Nothing
-- on a student or creator hot path calls any of this. The helper is STABLE and
-- reads only attempts/sections/responses, all of which are already indexed on
-- the columns it joins.
--
-- Requires (apply first): 20260843000000 (mock_has_answer).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mock_has_answer'
  ) THEN
    RAISE EXCEPTION
      'apply 20260843000000_marks_scored_in_db.sql first — mock_has_answer is the shared definition of "answered"';
  END IF;
END $$;


-- ============================================================
-- 1. The one definition of "this user sat this paper"
--
-- One row per engaged sitting, newest first. Column names and order match what
-- admin_get_user_attempts has always returned, so the popup is a pass-through.
--
-- INTERNAL (20260850000000's classification): no browser calls this, both
-- callers are SECURITY DEFINER and run as the owner, which keeps EXECUTE
-- regardless of the revokes below. It carries no admin gate of its own for
-- exactly that reason — the gate lives in the two callers, and this must not be
-- reachable from a browser to be asked about somebody else's activity.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_engaged_sittings(p_user_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  exam_id uuid,
  exam_name text,
  attempt_language text,
  attempted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH first_sections AS (
    -- The same "first section of each exam-language variant" rule both admin
    -- queries already used, so one sitting stays one row.
    SELECT DISTINCT ON (s.exam_id, coalesce(s.language, 'en'))
      s.id,
      s.exam_id,
      coalesce(s.language, 'en') AS lang
    FROM public.sections s
    ORDER BY s.exam_id, coalesce(s.language, 'en'), s.sort_order ASC, s.created_at ASC
  ),
  sittings AS (
    SELECT
      a.id,
      a.created_at,
      fs.exam_id,
      fs.lang,
      -- Where this sitting ends: the moment the next one on the same paper
      -- began. NULL for the most recent, which therefore has no upper bound.
      lead(a.created_at) OVER (
        PARTITION BY fs.exam_id, fs.lang ORDER BY a.created_at
      ) AS next_started
    FROM public.attempts a
    JOIN first_sections fs ON fs.id = a.section_id
    WHERE a.user_id = p_user_id
  )
  SELECT
    si.id,
    si.exam_id,
    e.name::text,
    si.lang,
    si.created_at
  FROM sittings si
  JOIN public.exams e ON e.id = si.exam_id
  WHERE EXISTS (
    -- Answered anything, anywhere in this sitting. Every section of it, not
    -- just the first: skipping section 1 entirely is not the same as bouncing
    -- off the start screen.
    SELECT 1
    FROM public.attempts sib
    JOIN public.sections ss  ON ss.id = sib.section_id
    JOIN public.responses r  ON r.attempt_id = sib.id
    WHERE sib.user_id = p_user_id
      AND ss.exam_id = si.exam_id
      AND coalesce(ss.language, 'en') = si.lang
      AND sib.created_at >= si.created_at
      AND (si.next_started IS NULL OR sib.created_at < si.next_started)
      -- mock_has_answer, not "a response row exists": the in-exam writer saves
      -- a row as soon as a question is VIEWED, so counting rows counts reading.
      -- It is also the same test the marks engine uses for a skip, so "" and []
      -- — a text box typed into and cleared — are not answers here either.
      AND public.mock_has_answer(r.selected_answer)
  )
  ORDER BY si.created_at DESC;
$$;

-- All three roles in one statement, per 20260850000000: a Supabase project
-- grants EXECUTE on new public functions to anon and authenticated DIRECTLY, so
-- revoking PUBLIC alone removes a key nobody was holding.
REVOKE EXECUTE ON FUNCTION public.admin_engaged_sittings(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. The popup — now a pass-through over the shared definition
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_attempts(target_user_id uuid)
RETURNS TABLE (
  attempt_id uuid,
  exam_id uuid,
  exam_name text,
  attempt_language text,
  attempted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.jwt() ->> 'email' NOT IN ('abarnwal3008@mocksetu.in', 'admin@mocksetu.in') THEN
    RAISE EXCEPTION 'Access Denied: Admin privileges required.';
  END IF;

  RETURN QUERY SELECT * FROM public.admin_engaged_sittings(target_user_id);
END;
$$;


-- ============================================================
-- 3. The users table — the number above the popup, from the same source
--
-- Body copied forward from 20260825000000 (the current definition) with the
-- exams_attempted subquery replaced. Every other column is byte-identical:
-- this function is a document builder whose other numbers this file is not
-- touching, and a transcription slip here would corrupt them silently.
--
-- The return type is unchanged, so no DROP is needed.
-- ============================================================
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
    -- Was a raw count of first-section attempt rows, which counted anyone who
    -- opened a paper and closed the tab.
    (select count(*)::int from public.admin_engaged_sittings(u.id)) AS exams_attempted,
    coalesce(p.can_set_paper_type, false) AS can_set_paper_type
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  ORDER BY u.created_at DESC;
END;
$$;


-- PostgREST caches function signatures; without this the console can keep
-- calling the old definitions until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_helper TEXT;
  v_popup  TEXT;
  v_users  TEXT;
BEGIN
  v_helper := pg_get_functiondef('public.admin_engaged_sittings(uuid)'::regprocedure);
  v_popup  := pg_get_functiondef('public.admin_get_user_attempts(uuid)'::regprocedure);
  v_users  := pg_get_functiondef('public.admin_get_all_users()'::regprocedure);

  IF position('mock_has_answer' IN v_helper) = 0 THEN
    RAISE EXCEPTION 'engagement must be tested with mock_has_answer, or viewing a question counts as answering it';
  END IF;
  IF position('next_started' IN v_helper) = 0 THEN
    RAISE EXCEPTION 'the sitting window is missing — a student who skipped section 1 would drop out of the count';
  END IF;

  -- Both callers must read the SHARED definition. Two hand-mirrored filters is
  -- how the number and the rows under it drifted apart in the first place.
  IF position('admin_engaged_sittings' IN v_popup) = 0 THEN
    RAISE EXCEPTION 'the popup must select from admin_engaged_sittings';
  END IF;
  IF position('admin_engaged_sittings' IN v_users) = 0 THEN
    RAISE EXCEPTION 'exams_attempted must count admin_engaged_sittings, not raw attempt rows';
  END IF;
  IF position('Admin privileges required' IN v_popup) = 0
     OR position('Admin privileges required' IN v_users) = 0 THEN
    RAISE EXCEPTION 'an admin gate was lost in the rewrite';
  END IF;

  -- The helper answers "what has this user done" for any user id it is handed,
  -- and carries no gate of its own, so a browser must not be able to call it.
  IF has_function_privilege('authenticated', 'public.admin_engaged_sittings(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can still execute admin_engaged_sittings — any signed-in user could read anyone''s activity';
  END IF;
  IF has_function_privilege('anon', 'public.admin_engaged_sittings(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute admin_engaged_sittings';
  END IF;

  RAISE NOTICE 'admin attempts: an attempt is a sitting where at least one question was answered, counted once';
END $$;
