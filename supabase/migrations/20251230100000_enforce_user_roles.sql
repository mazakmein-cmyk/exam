-- Migration to enforce User Roles (Student vs Creator)

-- 1. EXAMS TABLE
-- Allow INSERT/UPDATE/DELETE only if user is NOT a student (Creators + Legacy)
DROP POLICY IF EXISTS "Users can create their own exams" ON public.exams;
CREATE POLICY "Users can create their own exams"
  ON public.exams FOR INSERT
  WITH CHECK (
    auth.uid() = user_id 
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can update their own exams" ON public.exams;
CREATE POLICY "Users can update their own exams"
  ON public.exams FOR UPDATE
  USING (
    auth.uid() = user_id 
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can delete their own exams" ON public.exams;
CREATE POLICY "Users can delete their own exams"
  ON public.exams FOR DELETE
  USING (
    auth.uid() = user_id 
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

-- 2. SECTIONS TABLE
-- Similar restriction: Students cannot manage sections
DROP POLICY IF EXISTS "Users can create sections for their exams" ON public.sections;
CREATE POLICY "Users can create sections for their exams"
  ON public.sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = sections.exam_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can update sections of their exams" ON public.sections;
CREATE POLICY "Users can update sections of their exams"
  ON public.sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = sections.exam_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can delete sections of their exams" ON public.sections;
CREATE POLICY "Users can delete sections of their exams"
  ON public.sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = sections.exam_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

-- 3. PARSED_QUESTIONS TABLE
-- Students cannot manage questions
DROP POLICY IF EXISTS "Users can create questions for their exams" ON public.parsed_questions;
CREATE POLICY "Users can create questions for their exams"
  ON public.parsed_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can update questions from their exams" ON public.parsed_questions;
CREATE POLICY "Users can update questions from their exams"
  ON public.parsed_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );

DROP POLICY IF EXISTS "Users can delete questions from their exams" ON public.parsed_questions;
CREATE POLICY "Users can delete questions from their exams"
  ON public.parsed_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
    AND (auth.jwt() -> 'user_metadata' ->> 'user_type') IS DISTINCT FROM 'student'
  );


-- 4. ATTEMPTS TABLE
-- Restrict taking exams (INSERT attempt)
-- Allowed IF: User is Student OR (User is Creator AND it is THEIR own exam)
DROP POLICY IF EXISTS "Users can create their own attempts" ON public.attempts;
CREATE POLICY "Users can create their own attempts"
  ON public.attempts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id -- Basic integrity check
    AND (
      -- Option A: Is a Student
      (auth.jwt() -> 'user_metadata' ->> 'user_type') = 'student'
      OR
      -- Option B: Is taking their OWN exam (Preview Mode for Creators/Legacy)
      EXISTS (
        SELECT 1 FROM public.sections
        JOIN public.exams ON sections.exam_id = exams.id
        WHERE sections.id = section_id
        AND exams.user_id = auth.uid()
      )
    )
  );

-- Note: We generally assume Responses follow Attempts. 
-- Since a Creator cannot create an attempt for other exams, they consequently cannot create responses for them either 
-- (as the `responses` policy checks for valid `attempt` ownership).
-- So checking only `attempts` INSERT is sufficient to block the "Take Exam" flow.
