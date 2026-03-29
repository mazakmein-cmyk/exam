-- Optimize RLS policies by replacing per-row correlated subqueries with
-- STABLE helper functions that PostgreSQL evaluates ONCE per statement.
--
-- BEFORE: Every row in parsed_questions triggers a 2-table JOIN (sections → exams)
--         With 100 questions, that's 100 × 2 table lookups = 200 operations per query
--
-- AFTER:  A STABLE function computes the set of accessible section_ids ONCE,
--         then each row just checks membership in that cached result set.
--         With 100 questions, that's 1 function call + 100 hash lookups.

-- ============================================================
-- 1. Helper functions (STABLE = cached within a single statement)
-- ============================================================

-- Returns section IDs owned by the current user (for creators)
CREATE OR REPLACE FUNCTION public.get_owned_section_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM sections s
  JOIN exams e ON s.exam_id = e.id
  WHERE e.user_id = auth.uid();
$$;

-- Returns section IDs for published exams (for students/anonymous)
CREATE OR REPLACE FUNCTION public.get_published_section_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM sections s
  JOIN exams e ON s.exam_id = e.id
  WHERE e.is_published = true;
$$;

-- Returns exam IDs owned by the current user (for creators viewing sections)
CREATE OR REPLACE FUNCTION public.get_owned_exam_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM exams WHERE user_id = auth.uid();
$$;

-- Returns exam IDs that are published (for students viewing sections)
CREATE OR REPLACE FUNCTION public.get_published_exam_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM exams WHERE is_published = true;
$$;

-- ============================================================
-- 2. Rewrite sections SELECT policies (1-table subquery → function call)
-- ============================================================

DROP POLICY IF EXISTS "Users can view sections of their exams" ON public.sections;
CREATE POLICY "Users can view sections of their exams"
  ON public.sections FOR SELECT
  USING (exam_id IN (SELECT public.get_owned_exam_ids()));

DROP POLICY IF EXISTS "Anyone can view sections of published exams" ON public.sections;
CREATE POLICY "Anyone can view sections of published exams"
  ON public.sections FOR SELECT
  USING (exam_id IN (SELECT public.get_published_exam_ids()));

-- ============================================================
-- 3. Rewrite parsed_questions SELECT policies (2-table subquery → function call)
-- ============================================================

DROP POLICY IF EXISTS "Users can view questions from their exams" ON public.parsed_questions;
CREATE POLICY "Users can view questions from their exams"
  ON public.parsed_questions FOR SELECT
  USING (section_id IN (SELECT public.get_owned_section_ids()));

DROP POLICY IF EXISTS "Anyone can view questions of published exams" ON public.parsed_questions;
CREATE POLICY "Anyone can view questions of published exams"
  ON public.parsed_questions FOR SELECT
  USING (section_id IN (SELECT public.get_published_section_ids()));
