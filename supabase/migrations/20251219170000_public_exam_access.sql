-- Add RLS policies to allow public access to published exams and their content

-- Policy: Anyone can view published exams
CREATE POLICY "Anyone can view published exams"
  ON public.exams FOR SELECT
  USING (is_published = true);

-- Policy: Anyone can view sections of published exams
CREATE POLICY "Anyone can view sections of published exams"
  ON public.sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = sections.exam_id
      AND exams.is_published = true
    )
  );

-- Policy: Anyone can view questions of published exams
CREATE POLICY "Anyone can view questions of published exams"
  ON public.parsed_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON exams.id = sections.exam_id
      WHERE sections.id = parsed_questions.section_id
      AND exams.is_published = true
    )
  );
