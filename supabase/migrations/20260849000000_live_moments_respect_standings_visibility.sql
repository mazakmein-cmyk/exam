-- ============================================================
-- LIVE EXAMS: the highlights feed obeys the standings setting
--
-- WHAT IS BROKEN
-- get_live_moments is granted to every authenticated user and, once inside,
-- asks exactly two questions: does this exam exist, and is it live or ended.
-- That is all. It never reads leaderboard_visibility — the string does not
-- appear in the function — and it never checks that the caller is in the room.
--
-- So a creator who sets standings to "Off" (labelled "No ranking shown to
-- anyone") or "Just me" still hands out, per question, who was on a streak, who
-- came back from a bad run, and who was first in the class to go perfect. By
-- real name, unless privacy mode also happens to be on — and hiding the
-- standings does NOT turn privacy mode on. Two settings that read as though they
-- do the same job; only one of them was consulted.
--
-- No student PAGE renders moments, so nothing was visible on screen. That is not
-- much comfort: every student's browser already holds the exam id and the
-- publishable key, which is everything needed to ask for them directly. This is
-- the same argument 20260812000000 made about my_rank — "a ranking hidden by a
-- component is one devtools request away from being read".
--
-- WHAT 'private' AND 'off' MEAN HERE
-- Taken from 20260812000000 rather than invented. Its floor, which
-- live_participants_public has always applied, is that BOTH settings collapse
-- the room to the caller's own row; 'off' then additionally strips the rank.
-- A moment carries no rank, so there is nothing extra for 'off' to remove and
-- the two behave alike:
--
--   creator     everything, always. The control room and the projector both
--               authenticate as the creator, so neither is affected.
--   'full'      everything, with names masked when privacy_mode is on (unchanged).
--   'private'   the caller's own moments.
--   'off'       the caller's own moments.
--
-- Moments attached to NOBODY (user_id IS NULL) stay visible throughout: there is
-- no person in them to expose.
--
-- Consistency is the argument for keeping 'private' and 'off' identical. Making
-- 'off' mean "not even your own" would be a new behaviour, invented here, and
-- inconsistent with the setting's own promise that scores are always recorded.
--
-- AND A MEMBERSHIP TEST
-- Being signed in is not being in the room. Someone who was never a participant
-- now gets nothing, which closes the case of a share link forwarded to a person
-- who never sat the exam.
--
-- Body redefined verbatim from 20260809000000 with the gates added; the
-- pseudonym derivation, the withheld user_id and the ordering are untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_live_moments(p_live_exam_id UUID)
RETURNS TABLE (
  question_ordinal INTEGER,
  kind TEXT,
  user_id UUID,
  display_name TEXT,
  value INTEGER,
  priority INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_exam        public.live_exams;
  v_uid         UUID := auth.uid();
  v_is_creator  BOOLEAN := false;
  v_own_only    BOOLEAN := false;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status NOT IN ('live', 'ended') THEN
    RETURN;
  END IF;

  -- ── ADDED 20260849000000: who is asking ─────────────────────────────────
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_creator := (v_exam.user_id = v_uid);

  -- Signed in is not the same as being in the room. Without this, anyone who
  -- gets hold of the exam id — a forwarded link, a shared screenshot of the
  -- URL — can read the room's highlights.
  IF NOT v_is_creator AND NOT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) THEN
    RETURN;
  END IF;

  -- E3. The setting this function never used to read. 'private' and 'off' share
  -- the floor live_participants_public has always applied: the room collapses to
  -- the caller's own row. A moment carries no rank, so 'off' has nothing further
  -- to strip and the two are identical here.
  IF NOT v_is_creator
     AND COALESCE(v_exam.leaderboard_visibility, 'full') IN ('private', 'off') THEN
    v_own_only := true;
  END IF;

  RETURN QUERY
  WITH ordinals AS (
    -- Join order across the whole exam, 0-based — identical to the expression in
    -- live_participants_public, so a student's moment pseudonym and their
    -- leaderboard pseudonym are the same string.
    SELECT
      p.user_id AS uid,
      p.display_name AS real_name,
      (ROW_NUMBER() OVER (ORDER BY p.joined_at, p.id) - 1)::INTEGER AS ord
    FROM public.live_participants p
    WHERE p.live_exam_id = p_live_exam_id
  )
  SELECT
    lm.question_ordinal,
    lm.kind,
    -- The id is withheld from everyone but the creator, for the same reason the
    -- masked participant view withholds it: it maps back to a real person.
    CASE WHEN v_is_creator THEN lm.user_id ELSE NULL END,
    CASE
      WHEN lm.user_id IS NULL THEN NULL
      WHEN v_exam.privacy_mode THEN public.live_anon_name(o.ord)
      ELSE o.real_name
    END,
    lm.value,
    lm.priority
  FROM public.live_moments lm
  LEFT JOIN ordinals o ON o.uid = lm.user_id
  WHERE lm.live_exam_id = p_live_exam_id
    -- ── ADDED 20260849000000 ──────────────────────────────────────────────
    -- A moment attached to nobody stays visible: there is no person in it to
    -- expose, and dropping it would blank class-level highlights for no gain.
    AND (
      NOT v_own_only
      OR lm.user_id IS NULL
      OR lm.user_id = v_uid
    )
  ORDER BY lm.question_ordinal, lm.priority;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_live_moments(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
--
-- Both directions. An over-tight gate here does not read as a privacy fix — it
-- reads as "the highlights panel is empty", on the creator's own projector,
-- mid-session, with nothing logged.
-- ============================================================
DO $chk$
DECLARE
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_live_moments';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'get_live_moments missing - the control room and the projector both read it';
  END IF;

  -- The whole point of the migration.
  IF position('leaderboard_visibility' in v_src) = 0 THEN
    RAISE EXCEPTION 'get_live_moments still ignores the standings setting - hiding the standings would still leak named highlights';
  END IF;

  IF position('live_participants' in v_src) = 0 THEN
    RAISE EXCEPTION 'get_live_moments has no membership test - anyone holding the exam id could read the room';
  END IF;

  -- The creator must keep everything, or their own screens go blank.
  IF position('v_is_creator' in v_src) = 0 THEN
    RAISE EXCEPTION 'get_live_moments no longer distinguishes the creator - the control room and projector would lose their highlights';
  END IF;

  -- Things that were already right and must not have been lost in the rewrite.
  IF position('live_anon_name' in v_src) = 0 THEN
    RAISE EXCEPTION 'get_live_moments lost pseudonym masking - privacy mode would expose real names again';
  END IF;

  IF position('ORDER BY lm.question_ordinal, lm.priority' in v_src) = 0 THEN
    RAISE EXCEPTION 'get_live_moments lost its ordering';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_live_moments(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_live_moments is no longer callable - the creator reads it as an authenticated user like everyone else';
  END IF;

  RAISE NOTICE 'highlights now follow the standings setting, and only the room can read them';
END $chk$;
