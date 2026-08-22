-- ============================================================
-- STUDENT RANKS: rank every sitting against every other sitting
--
-- WHAT WAS BROKEN
-- Analytics and ExamReview both tried to rank a student against the whole
-- cohort by selecting every attempt on the exam's sections. But the only
-- SELECT policies on public.attempts are "Users can view their own attempts"
-- (auth.uid() = user_id) and a creator-only policy, so RLS silently filtered
-- the result to the caller's own rows. The pages then ranked a student's
-- sittings against each other and printed it as a leaderboard placement: one
-- sitting rendered "🏆 #1/1", two sittings rendered "#1/2" and "#2/2". No
-- error — just a one-user result set. ExamReview's own comment ("Compute Rank
-- across ALL users for this exam") says what was intended.
--
-- THE FIX, AND WHY IT IS AN RPC
-- Ranking needs to see every student's rows; showing a rank does not need to
-- REVEAL every student's rows. Opening up a cross-user SELECT policy on
-- attempts would hand every student the whole class's scores. So the ranking
-- runs here, with definer rights, and returns only the target's own attempts —
-- their position and the size of the field. Nobody else's score, name or id
-- crosses the wire.
--
-- THE UNIT OF RANKING IS A SITTING, NOT A STUDENT
-- Each run through an exam is ranked on its own. A student who sat the paper
-- three times occupies three places in the table, so their first attempt can
-- be #5 and their second #2 while another student's second attempt is #1.
-- `total` is therefore the number of SITTINGS on the exam, not the number of
-- students.
--
-- A sitting starts at an attempt on a first section (one per language variant,
-- ordered by sort_order, created_at, id) and absorbs every later attempt until
-- the next first-section attempt. Within a sitting only the LATEST attempt per
-- section counts toward the score: re-answering one section mid-sitting must
-- replace that section's score, not add to it, or a student could sit section 2
-- three times and outrank a clean run with a total above the paper maximum.
-- Every attempt id in the sitting still maps to the sitting's rank, so opening
-- a superseded attempt still shows the placement it belongs to.
--
-- Attempts occurring before any first-section attempt ("orphans") are NOT a run
-- through the exam, so they are excluded: they neither receive a rank nor
-- inflate anyone's `total`. The client renders no badge for them.
--
-- METRIC: sum of marks_score when EVERY ranked sitting on the exam has marks on
-- every counted attempt, otherwise the raw correct-count. A single unscored
-- sitting drops the whole exam to correct-count, because a partial marks sum is
-- an undercount and would rank below a complete one for the wrong reason. Ties
-- share a place (1, 2, 2, 4) via RANK().
--
-- The exam creator's own attempts are excluded, matching the creator-facing Top
-- Students leaderboard — a creator's own practice runs are not a cohort.
--
-- p_user_id lets a creator read a STUDENT's placement while reviewing that
-- student's attempt, which the page has always shown. It is honoured only when
-- the caller owns one of the exams asked about; otherwise it is ignored and the
-- caller gets their own rows. A student cannot use it to read anyone else.
-- ============================================================

-- LANGUAGE sql, deliberately. In PL/pgSQL the RETURNS TABLE column named
-- `rank` becomes a variable in the body and collides with the RANK() window
-- function; a SQL body has no variables, so the hazard cannot arise. It also
-- makes the null-caller case fall out for free: auth.uid() is NULL for an
-- anonymous caller, `user_id = NULL` matches nothing, and the function returns
-- an empty set instead of raising — which is the contract the History page
-- needs, since an exception there would break the whole list.
-- CREATE OR REPLACE does not replace across a differing argument list — it
-- ADDS an overload, and PostgREST could then resolve a one-argument call to the
-- older body. Drop the single-argument form first so only one definition of
-- this name can ever exist.
DROP FUNCTION IF EXISTS public.get_my_exam_ranks(uuid[]);

CREATE OR REPLACE FUNCTION public.get_my_exam_ranks(
  p_exam_ids uuid[],
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (attempt_id uuid, rank integer, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    -- Whose ranks are being asked for. p_user_id is honoured only for a caller
    -- who owns one of these exams; everyone else silently reads themselves.
    SELECT CASE
      WHEN p_user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.exams e
        WHERE e.id = ANY(p_exam_ids) AND e.user_id = auth.uid()
      ) THEN p_user_id
      ELSE auth.uid()
    END AS uid
  ),
  scope AS (
    -- Only exams the target actually sat. The caller filter cannot be pushed
    -- below the window functions, so without this every call would rank the
    -- full cohort of every exam id passed and then discard all of it. The
    -- length bound stops a caller asking about the whole table at once.
    SELECT DISTINCT s.exam_id
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    WHERE s.exam_id = ANY(p_exam_ids)
      AND a.submitted_at IS NOT NULL
      AND a.user_id = (SELECT uid FROM target)
      AND COALESCE(array_length(p_exam_ids, 1), 0) BETWEEN 1 AND 200
  ),
  first_sections AS (
    -- One "first section" per language variant. The trailing id keeps this
    -- deterministic when a bulk import lands several sections on the same
    -- sort_order and created_at; the client sorts by the same keys.
    SELECT DISTINCT ON (s.exam_id, COALESCE(s.language, 'en'))
      s.exam_id,
      s.id AS section_id
    FROM public.sections s
    JOIN scope ON scope.exam_id = s.exam_id
    ORDER BY s.exam_id, COALESCE(s.language, 'en'), s.sort_order ASC, s.created_at ASC, s.id ASC
  ),
  att AS (
    SELECT
      a.id,
      a.user_id,
      s.exam_id,
      a.section_id,
      a.created_at,
      COALESCE(a.score, 0) AS score,
      a.marks_score,
      (fs.section_id IS NOT NULL) AS is_first
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    JOIN scope ON scope.exam_id = s.exam_id
    JOIN public.exams e ON e.id = s.exam_id
    LEFT JOIN first_sections fs ON fs.section_id = a.section_id
    WHERE a.submitted_at IS NOT NULL
      AND a.user_id <> e.user_id
  ),
  numbered AS (
    -- Running count of first-section attempts = the sitting number. Attempts
    -- before the first one land in sitting 0 and are dropped below.
    SELECT
      n.*,
      SUM(CASE WHEN n.is_first THEN 1 ELSE 0 END) OVER (
        PARTITION BY n.exam_id, n.user_id
        ORDER BY n.created_at ASC, n.id ASC
        ROWS UNBOUNDED PRECEDING
      ) AS sitting_no
    FROM att n
  ),
  in_sitting AS (
    SELECT * FROM numbered WHERE sitting_no > 0
  ),
  counted AS (
    -- Latest attempt per section wins, so a re-answered section replaces its
    -- earlier score instead of stacking on top of it.
    SELECT DISTINCT ON (exam_id, user_id, sitting_no, section_id)
      exam_id, user_id, sitting_no, score, marks_score
    FROM in_sitting
    ORDER BY exam_id, user_id, sitting_no, section_id, created_at DESC, id DESC
  ),
  scored AS (
    SELECT
      exam_id,
      user_id,
      sitting_no,
      SUM(score)::numeric AS total_score,
      SUM(COALESCE(marks_score, 0))::numeric AS total_marks,
      bool_and(marks_score IS NOT NULL) AS has_marks
    FROM counted
    GROUP BY exam_id, user_id, sitting_no
  ),
  ids AS (
    -- Every attempt of the sitting, superseded ones included, so opening any of
    -- them resolves to the sitting's rank.
    SELECT exam_id, user_id, sitting_no, array_agg(id) AS attempt_ids
    FROM in_sitting
    GROUP BY exam_id, user_id, sitting_no
  ),
  sittings AS (
    SELECT sc.*, i.attempt_ids
    FROM scored sc
    JOIN ids i USING (exam_id, user_id, sitting_no)
  ),
  gated AS (
    SELECT
      g.*,
      bool_and(g.has_marks) OVER (PARTITION BY g.exam_id) AS rank_by_marks
    FROM sittings g
  ),
  ranked AS (
    SELECT
      r.user_id,
      r.attempt_ids,
      RANK() OVER (
        PARTITION BY r.exam_id
        ORDER BY (CASE WHEN r.rank_by_marks THEN r.total_marks ELSE r.total_score END) DESC
      )::integer AS rnk,
      COUNT(*) OVER (PARTITION BY r.exam_id)::integer AS total_sittings
    FROM gated r
  )
  SELECT
    unnest(ranked.attempt_ids),
    ranked.rnk,
    ranked.total_sittings
  FROM ranked
  WHERE ranked.user_id = (SELECT uid FROM target);
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on every new function, which would leave
-- this callable with the browser's publishable key. Same REVOKE-then-GRANT the
-- other definer functions in this directory use.
REVOKE EXECUTE ON FUNCTION public.get_my_exam_ranks(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_exam_ranks(uuid[], uuid) TO authenticated;

-- Supports the scope probe and the sections -> attempts walk.
CREATE INDEX IF NOT EXISTS idx_attempts_section_submitted
  ON public.attempts (section_id, created_at)
  WHERE submitted_at IS NOT NULL;

-- ============================================================
-- Self-check: the function must exist, must refuse an anonymous caller without
-- raising (an exception here would break the History page for everyone, so the
-- contract is "return nothing", not "fail"), and must not be PUBLIC.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_exam_ranks'
  ) THEN
    RAISE EXCEPTION 'get_my_exam_ranks missing after migration';
  END IF;

  IF has_function_privilege('public', 'public.get_my_exam_ranks(uuid[], uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_exam_ranks is still executable by PUBLIC';
  END IF;

  PERFORM public.get_my_exam_ranks(ARRAY[]::uuid[]);
  RAISE NOTICE 'get_my_exam_ranks installed';
END $$;
