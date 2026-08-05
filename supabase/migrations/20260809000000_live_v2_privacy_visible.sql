-- ============================================================================
-- LIVE EXAM v2 — PRIVACY MODE: MAKE IT LOOK LIKE IT WORKS
--
-- "Hide student names is not working at all."
--
-- It was working. Every masking path was intact and the database was doing its
-- job: the masked view, the analytics compute, the re-mask trigger and the report
-- token path all keyed correctly off live_exams.privacy_mode. What the feature
-- did not do was produce any evidence of itself, and two of the three names it
-- generated were the same name.
--
-- Three defects, all in the derivation of the pseudonym rather than in the
-- decision to use one:
--
--   1. live_anon_name gave EVERY participant in a class of 48 or fewer the same
--      adjective, 'Anonymous' — so a real session read "Anonymous Aardvark",
--      "Anonymous Badger", "Anonymous Beaver". The integer division that picks the
--      adjective only advances once per 48 joiners, so in every session anyone
--      will ever run it never advanced at all. The UI promises "Brave Badger";
--      what the room got looked like a placeholder that had failed to fill in,
--      which is precisely how a working feature gets reported as broken.
--
--   2. get_live_moments computed its ordinal with a ROW_NUMBER() over a subquery
--      already filtered to one participant, so it was always 1 and the ordinal
--      always 0. Every moment of the session was therefore attributed to
--      live_anon_name(0) — one pseudonym for the whole class, and not the same one
--      the leaderboard gave that student.
--
--   3. Consequence of fixing (1): stored analytics names must be re-derived, or
--      fastest_user_name keeps yesterday's pseudonym while the leaderboard shows
--      today's. live_refresh_fastest_names already exists for exactly this and is
--      reused rather than reimplemented.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================
-- 1. live_anon_name — vary the adjective within the first class
--
--    Same 48 x 48 = 2304 name space, still IMMUTABLE, still collision-free.
--    The only change is which of the 2304 a given ordinal maps to.
--
--    The animal continues to come from ordinal % 48, so consecutive joiners get
--    visibly different animals. The adjective now advances with the ordinal too:
--
--      adjective_index = (ordinal / 48 + ordinal) % 48
--
--    Still a bijection over 0..2303. Given a name, the animal fixes a = ordinal
--    % 48 and the adjective then fixes ordinal / 48 uniquely, so no two ordinals
--    below 2304 can collide — the property the old expression had and the reason
--    there are no numeric suffixes anywhere in this feature.
--
--    'Anonymous' is GONE from the adjective list, replaced by 'Agile'.
--
--    That word was the actual source of the complaint, and offsetting the index
--    to dodge it was the wrong fix: an offset only moves which ordinal lands on
--    it. The first attempt here added + 2, which pushed the placeholder from the
--    1st joiner to the 47th — still an ordinary class size, and now harder to
--    find. A name space for anonymising people should not contain the word
--    "Anonymous" at any index; every one of the 2304 names should read like a
--    nickname. Deleting it makes that unconditional instead of arithmetic.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_anon_name(p_ordinal INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT adjectives[((GREATEST(COALESCE(p_ordinal, 0), 0) / 48)
                     + GREATEST(COALESCE(p_ordinal, 0), 0)) % 48 + 1]
         || ' ' ||
         animals[GREATEST(COALESCE(p_ordinal, 0), 0) % 48 + 1]
  FROM (
    SELECT
      ARRAY[
        'Agile','Bold','Brave','Bright','Calm','Cheerful','Clever','Curious',
        'Daring','Eager','Fearless','Gentle','Graceful','Happy','Honest','Jolly',
        'Keen','Kind','Lively','Loyal','Merry','Mighty','Nimble','Noble',
        'Patient','Playful','Plucky','Polite','Proud','Quick','Quiet','Ready',
        'Regal','Sharp','Silent','Sleek','Smart','Snappy','Steady','Sunny',
        'Swift','Tidy','Upbeat','Valiant','Vivid','Warm','Wise','Witty'
      ] AS adjectives,
      ARRAY[
        'Aardvark','Badger','Beaver','Bison','Cheetah','Cobra','Condor','Coyote',
        'Crane','Dingo','Dolphin','Eagle','Falcon','Ferret','Finch','Gecko',
        'Gibbon','Giraffe','Gopher','Heron','Ibex','Impala','Jackal','Jaguar',
        'Kestrel','Koala','Lemur','Leopard','Lynx','Macaw','Magpie','Marmot',
        'Meerkat','Mongoose','Narwhal','Ocelot','Osprey','Otter','Panda',
        'Pelican','Puffin','Quail','Raccoon','Raven','Salmon','Tapir','Toucan',
        'Walrus'
      ] AS animals
  ) lists;
$$;

GRANT EXECUTE ON FUNCTION public.live_anon_name(INTEGER) TO authenticated, anon;


-- ============================================================
-- 2. get_live_moments — rank the whole room, not one row
--
--    The ordinal has to be the participant's position among ALL participants of
--    the exam, because that is what live_participants_public uses. The old
--    LATERAL filtered to p.user_id = lm.user_id BEFORE the window function ran,
--    so ROW_NUMBER() counted to one every time.
--
--    Redefined verbatim apart from that: the creator-only user_id projection
--    (§ the masked view withholds the join key for the same reason) and the
--    privacy_mode branch are preserved exactly.
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
AS $$
DECLARE
  v_exam public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status NOT IN ('live', 'ended') THEN
    RETURN;
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
    CASE WHEN v_exam.user_id = auth.uid() THEN lm.user_id ELSE NULL END,
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
  ORDER BY lm.question_ordinal, lm.priority;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_moments(UUID) TO authenticated;


-- ============================================================
-- 3. Re-derive every stored pseudonym
--
--    live_anon_name changed, so every fastest_user_name written by the old
--    expression is now inconsistent with what the view returns for the same
--    student. live_refresh_fastest_names is the one place that derivation lives;
--    it skips rows already correct, so this is cheap and fires no needless
--    realtime UPDATE.
--
--    Run for every exam with a resolvable fastest answer, not only the
--    privacy-mode ones — an exam toggled on and then off is the same bug pointing
--    the other way.
--
--    The function is re-declared here rather than assumed.
--
--    It is created by 20260803020000, which APPLY_REMAINING.sql omits on the
--    stated assumption that it "was applied earlier" — an assumption nothing
--    verifies. The first draft of this migration guarded on the function existing
--    and raised a WARNING if it did not, which was the wrong shape twice over:
--    the Supabase SQL editor is this project's actual deployment channel and it
--    renders result sets, not NOTICE/WARNING traffic, so the "loud" signal was
--    invisible — and it left the one section that could silently do nothing as
--    the one section with no assertion behind it.
--
--    CREATE OR REPLACE is idempotent and the body is copied verbatim, so this is
--    safe whether or not 20260803020000 ran. Its only dependency is
--    live_anon_name, which §1 has just redefined. The trigger that calls it still
--    lives in 20260803020000 — this section makes the FUNCTION unconditional, not
--    the trigger, so if that file was skipped the re-mask-on-toggle invariant is
--    still missing and §4 now says so out loud.
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


-- ============================================================
-- 4. Self-check
--
--    Every assertion is over the WHOLE 2304-name space, not a sample.
--
--    The first draft bounded two of these to ordinals 0..45 and both passed while
--    ordinal 46 still produced "Anonymous Toucan" — a bound chosen, without
--    meaning to, to stop one short of the surviving bug. A range that happens to
--    exclude the failing case is worse than no test, because it reports safety.
-- ============================================================
DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_distinct_adj INTEGER;
  v_distinct_all INTEGER;
  v_placeholder TEXT;
  v_src TEXT;
BEGIN
  -- Consecutive joiners must differ in the adjective, not only the animal. 48 is
  -- the full first block, i.e. every class that does not wrap.
  SELECT COUNT(DISTINCT split_part(public.live_anon_name(n), ' ', 1))
  INTO v_distinct_adj
  FROM generate_series(0, 47) AS n;
  IF v_distinct_adj <> 48 THEN
    v_missing := v_missing || format(
      'live_anon_name repeats adjectives within the first 48 ordinals (%s distinct) — the reported bug',
      v_distinct_adj
    );
  END IF;

  -- The word must not exist at ANY index. Checked across the entire space rather
  -- than a plausible class size, because an index offset only moves which ordinal
  -- lands on it.
  SELECT string_agg(DISTINCT public.live_anon_name(n), ', ')
  INTO v_placeholder
  FROM generate_series(0, 2303) AS n
  WHERE public.live_anon_name(n) ILIKE '%anonymous%';
  IF v_placeholder IS NOT NULL THEN
    v_missing := v_missing || format(
      'live_anon_name still yields the placeholder word: %s', v_placeholder
    );
  END IF;

  -- Collision-free across the full name space, which is what lets the feature
  -- get away with no numeric suffixes.
  SELECT COUNT(DISTINCT public.live_anon_name(n))
  INTO v_distinct_all
  FROM generate_series(0, 2303) AS n;
  IF v_distinct_all <> 2304 THEN
    v_missing := v_missing || format('live_anon_name is no longer collision-free (%s of 2304 distinct)', v_distinct_all);
  END IF;

  -- The moments ordinal must be ranked over the exam, not over one row.
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_live_moments';
  IF v_src IS NULL THEN
    v_missing := v_missing || 'get_live_moments is missing';
  ELSIF v_src LIKE '%p.user_id = lm.user_id%' THEN
    v_missing := v_missing || 'get_live_moments still filters the participant set before ranking it';
  END IF;

  -- The re-mask-on-toggle invariant lives in 20260803020000, which
  -- APPLY_REMAINING.sql omits by assumption. §3 makes the function unconditional
  -- but cannot create the trigger, so check for it and name the remedy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_live_privacy_mode_changed'
  ) THEN
    v_missing := v_missing || 'trigger trg_live_privacy_mode_changed is absent — apply 20260803020000_live_v2_privacy_remask_trigger.sql, or flipping privacy mode will not re-mask already-computed questions';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Privacy-visibility migration incomplete: %', array_to_string(v_missing, ', ');
  END IF;
END $$;


-- ============================================================
-- 5. Report the outcome as a ROW
--
--    Because the deployment channel is the Supabase SQL editor, which renders
--    result sets and discards NOTICE/WARNING traffic. A migration whose only
--    evidence of success is RAISE NOTICE finishes looking identical to one that
--    silently skipped its middle section — which is the failure mode this whole
--    file exists to stop happening to a different feature.
--
--    drifted_analytics_rows is the direct assertion §3 was missing: the number of
--    stored fastest names that disagree with what the view would return for the
--    same student right now. It must be 0.
-- ============================================================
SELECT
  public.live_anon_name(0) AS first_joiner_is_called,
  public.live_anon_name(1) AS second_joiner_is_called,
  (
    SELECT COUNT(*)
    FROM public.live_question_analytics a
    JOIN public.live_exams le ON le.id = a.live_exam_id
    JOIN (
      SELECT lp.live_exam_id, lp.user_id, lp.display_name,
             (ROW_NUMBER() OVER (PARTITION BY lp.live_exam_id
                                 ORDER BY lp.joined_at, lp.id) - 1)::INTEGER AS ord
      FROM public.live_participants lp
    ) o ON o.live_exam_id = a.live_exam_id AND o.user_id = a.fastest_user_id
    WHERE a.fastest_user_name IS DISTINCT FROM (
      CASE WHEN le.privacy_mode THEN public.live_anon_name(o.ord) ELSE o.display_name END
    )
  ) AS drifted_analytics_rows,
  'expect drifted_analytics_rows = 0' AS note;
