-- ============================================================
-- STOP SENDING THE ANSWER KEY TO STUDENTS
--
-- WHAT IS BROKEN
-- "Anyone can view questions of published exams" grants SELECT on whole rows of
-- parsed_questions, and the exam runner does select("*"). So the correct answer
-- to every question is delivered into the student's browser the moment the exam
-- starts. It is not one request away — it is in the page.
--
-- The policy has no TO clause, so it applies to anon as well: a visitor with no
-- account, holding only the publishable key that ships in the bundle, can read
-- the answer key of every published exam in the database.
--
-- Three surfaces also RENDER it to anyone who types the URL, because none of
-- them checks ownership: the exam editor, the question fix editor, and the
-- creator analytics page. No developer tools needed. Dropping the student
-- policy closes all three at once — those pages keep working for the owner
-- through "Users can view questions from their exams".
--
-- HOW THIS FIXES IT
-- The same shape live exams already use: a definer-rights view exposing a
-- column subset (which an RLS policy cannot express), and the student-facing
-- policy on the base table removed. Creators keep the base table.
--
-- TWO COLUMNS ARE WITHHELD, NOT ONE. answer_hint is a second answer channel —
-- supabase/functions/parse-pdf instructs the parser to put the answer key there
-- if it finds one in the paper. Withholding correct_answer alone would close
-- one door and leave the other open.
--
-- ANON KEEPS ACCESS, DELIBERATELY. Unlike live exams, practice exams are
-- designed to be sat without an account (examAccess resolves a signed-out
-- visitor to "take"). The revoke that 20260823000000 had to apply to the live
-- view must NOT be copied here — it would blank the paper for every guest.
--
-- CREATOR PREVIEW STILL WORKS. The runner is also how a creator previews their
-- own unpublished exam, so the view's predicate is published OR owned. A
-- predicate of is_published alone would blank every draft preview.
--
-- CREATE OR REPLACE VIEW SNAPSHOTS ITS COLUMN LIST. A future ALTER TABLE ...
-- ADD COLUMN never reaches this view. 20260731100000 exists solely because
-- option_image_urls was missed on the live one. If you add a student-visible
-- column to parsed_questions, add it here too.
-- ============================================================

-- ── The student's view of a question ────────────────────────────────────────
-- 13 columns. Withheld: correct_answer, answer_hint, confidence, created_at,
-- image_region, is_finalized, requires_review.
CREATE OR REPLACE VIEW public.parsed_questions_student AS
SELECT
  q.id,
  q.section_id,
  q.q_no,
  q.section_label,
  q.text,
  q.options,
  q.answer_type,
  q.image_url,
  q.image_urls,
  q.option_image_urls,
  q.question_group_id,
  -- Kept because the runner filters on it; the view does not filter, so
  -- behaviour is identical to the policy it replaces.
  q.is_excluded,
  -- Kept because the runner sorts on it. Omitting it silently reorders the
  -- paper to q_no order.
  q.final_order
FROM public.parsed_questions q
JOIN public.sections s ON s.id = q.section_id
JOIN public.exams e ON e.id = s.exam_id
WHERE e.is_published = true
   OR e.user_id = auth.uid();

GRANT SELECT ON public.parsed_questions_student TO authenticated, anon;

COMMENT ON VIEW public.parsed_questions_student IS
  'Questions as a candidate may see them: no correct_answer, no answer_hint. Definer rights, so it can express a column subset RLS cannot. Published exams, plus the owner''s own drafts for preview. Anon is intentionally granted — practice exams can be sat without an account.';


-- ── Remove the student-facing read of the base table ───────────────────────
-- The creator policy "Users can view questions from their exams" is a separate
-- object and is untouched, so every creator surface keeps working unchanged.
DROP POLICY IF EXISTS "Anyone can view questions of published exams" ON public.parsed_questions;


-- ── The answer key, after the exam is over ─────────────────────────────────
-- The review screen legitimately needs the key — that is its purpose. It gets
-- exactly two columns, for one attempt, and only once that attempt is
-- submitted. Never SETOF parsed_questions: returning a base-table rowtype from
-- a definer function hands over every column and reopens the hole.
CREATE OR REPLACE FUNCTION public.get_attempt_answer_key(p_attempt_id uuid)
RETURNS TABLE (question_id uuid, correct_answer jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.correct_answer
  FROM public.attempts a
  JOIN public.sections s ON s.id = a.section_id
  JOIN public.exams e ON e.id = s.exam_id
  JOIN public.parsed_questions q ON q.section_id = a.section_id
  WHERE a.id = p_attempt_id
    -- Not before the paper is handed in. Otherwise a student opens the review
    -- of an attempt they are still sitting in another tab.
    AND a.submitted_at IS NOT NULL
    -- Their own attempt, or the exam's owner reviewing a student's.
    AND (a.user_id = auth.uid() OR e.user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_attempt_answer_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attempt_answer_key(uuid) TO authenticated;


-- ── Keep per-question marks working for students ───────────────────────────
-- "Public read question scoring for published exams" reached through
-- parsed_questions in its USING clause, as the INVOKER. With the student policy
-- gone that EXISTS is false for every student, so they would silently get no
-- per-question scoring overrides and their marks would quietly fall back to the
-- section/exam defaults. scoringService swallows the error, so there would be
-- no sign of it — just wrong marks.
--
-- Routed through a definer helper instead, mirroring get_published_section_ids.
CREATE OR REPLACE FUNCTION public.get_published_question_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id
  FROM public.parsed_questions q
  JOIN public.sections s ON s.id = q.section_id
  JOIN public.exams e ON e.id = s.exam_id
  WHERE e.is_published = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_published_question_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_question_ids() TO authenticated, anon;

DROP POLICY IF EXISTS "Public read question scoring for published exams" ON public.question_scoring_config;
CREATE POLICY "Public read question scoring for published exams"
  ON public.question_scoring_config FOR SELECT
  USING (question_id IN (SELECT public.get_published_question_ids()));

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Self-check. Both halves matter: the key must be gone, and students must still
-- be able to read a paper. An over-broad change here hands every candidate a
-- blank exam, and the client's catch blocks would turn that into an empty
-- screen rather than an error.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'parsed_questions_student'
  ) THEN
    RAISE EXCEPTION 'parsed_questions_student missing after migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parsed_questions_student'
      AND column_name IN ('correct_answer', 'answer_hint')
  ) THEN
    RAISE EXCEPTION 'the student view still exposes an answer channel';
  END IF;

  -- The runner filters on is_excluded and sorts on final_order; without them it
  -- gets a 400 and the student cannot open the paper at all.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parsed_questions_student'
      AND column_name = 'is_excluded'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'parsed_questions_student'
      AND column_name = 'final_order'
  ) THEN
    RAISE EXCEPTION 'the student view is missing a column the runner needs';
  END IF;

  IF NOT has_table_privilege('anon', 'public.parsed_questions_student', 'SELECT') THEN
    RAISE EXCEPTION 'anon lost the student view — practice exams can be sat without an account';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parsed_questions'
      AND policyname = 'Anyone can view questions of published exams'
  ) THEN
    RAISE EXCEPTION 'the student policy on parsed_questions is still there — the key is still readable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'parsed_questions'
      AND policyname = 'Users can view questions from their exams'
  ) THEN
    RAISE EXCEPTION 'the creator policy is gone — every authoring screen would be blank';
  END IF;

  IF has_function_privilege('public', 'public.get_attempt_answer_key(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_attempt_answer_key is executable by PUBLIC';
  END IF;

  RAISE NOTICE 'answer key withheld from students; review reveal and marks overrides intact';
END $$;
