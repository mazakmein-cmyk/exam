-- ============================================================
-- STUDENT RANKS: return one JSON document, not one row per attempt
--
-- WHAT WAS BROKEN
-- get_my_exam_ranks (20260827000000) is set-returning: one row per attempt of
-- the caller. PostgREST's 1000-row cap applies to RPC results exactly as it
-- does to table reads, so a heavy user's ranks were silently truncated — the
-- same defect the sibling migration 20260828000000 was written to avoid, left
-- behind in the function next to it. There was also no top-level ORDER BY, so
-- WHICH ranks survived was arbitrary: rank badges disappeared from some history
-- rows and not others, with no pattern and no error.
--
-- THE FIX
-- Return a single jsonb array. One row can never be truncated. The body is
-- otherwise unchanged — same sitting boundaries, same latest-attempt-per-section
-- rule, same orphan exclusion, same marks gate, same creator-owner delegation.
--
-- The return type changes, so CREATE OR REPLACE cannot do it: both signatures
-- are dropped first. Idempotent, and safe to run before or after the client.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_my_exam_ranks(uuid[]);
DROP FUNCTION IF EXISTS public.get_my_exam_ranks(uuid[], uuid);

CREATE OR REPLACE FUNCTION public.get_my_exam_ranks(
  p_exam_ids uuid[],
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    -- p_user_id is honoured only for a caller who owns one of these exams, so a
    -- creator reviewing a student keeps the rank card; everyone else silently
    -- reads themselves.
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
    -- full cohort of every exam id passed and then discard all of it.
    SELECT DISTINCT s.exam_id
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    WHERE s.exam_id = ANY(p_exam_ids)
      AND a.submitted_at IS NOT NULL
      AND a.user_id = (SELECT uid FROM target)
      AND COALESCE(array_length(p_exam_ids, 1), 0) BETWEEN 1 AND 200
  ),
  first_sections AS (
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
    -- Sitting 0 is the orphan bucket: attempts before any first-section
    -- attempt. Not a run through the exam, so it neither ranks nor counts.
    SELECT * FROM numbered WHERE sitting_no > 0
  ),
  counted AS (
    -- Latest attempt per section wins, so re-answering a section replaces its
    -- score instead of stacking on top of it.
    SELECT DISTINCT ON (exam_id, user_id, sitting_no, section_id)
      exam_id, user_id, sitting_no, score, marks_score
    FROM in_sitting
    ORDER BY exam_id, user_id, sitting_no, section_id, created_at DESC, id DESC
  ),
  scored AS (
    SELECT
      exam_id, user_id, sitting_no,
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
    SELECT g.*, bool_and(g.has_marks) OVER (PARTITION BY g.exam_id) AS rank_by_marks
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
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'attempt_id', x.attempt_id,
      'rank', x.rnk,
      'total', x.total_sittings
    ))
    FROM (
      SELECT unnest(ranked.attempt_ids) AS attempt_id, ranked.rnk, ranked.total_sittings
      FROM ranked
      WHERE ranked.user_id = (SELECT uid FROM target)
    ) x
  ), '[]'::jsonb);
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_exam_ranks(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_exam_ranks(uuid[], uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_exam_ranks'
      AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'get_my_exam_ranks did not become a jsonb-returning function';
  END IF;

  IF has_function_privilege('public', 'public.get_my_exam_ranks(uuid[], uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_my_exam_ranks is still executable by PUBLIC';
  END IF;

  -- An anonymous caller owns nothing: empty array, never an error.
  v_out := public.get_my_exam_ranks(ARRAY[]::uuid[]);
  ASSERT v_out = '[]'::jsonb, 'empty input must return an empty array';

  RAISE NOTICE 'get_my_exam_ranks now returns a single jsonb document';
END $$;
