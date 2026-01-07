-- Allow creators to view attempts for their exams
CREATE POLICY "Creators can view attempts for their exams"
ON public.attempts
FOR SELECT
USING (
  auth.uid() IN (
    SELECT e.user_id
    FROM public.exams e
    JOIN public.sections s ON s.exam_id = e.id
    WHERE s.id = attempts.section_id
  )
);

-- Allow creators to view responses for attempts on their exams
CREATE POLICY "Creators can view responses for their exams"
ON public.responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.attempts a
    JOIN public.sections s ON s.id = a.section_id
    JOIN public.exams e ON e.id = s.exam_id
    WHERE a.id = responses.attempt_id
    AND e.user_id = auth.uid()
  )
);
