-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-pdfs', 'exam-pdfs', false);

-- Storage policies for exam PDFs
CREATE POLICY "Users can view their own PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exam-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload their own PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exam-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'exam-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Add PDF tracking columns to sections
ALTER TABLE public.sections
ADD COLUMN pdf_url TEXT,
ADD COLUMN pdf_name TEXT,
ADD COLUMN parsing_status TEXT DEFAULT 'pending',
ADD COLUMN parsing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN parsing_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN total_questions INTEGER DEFAULT 0,
ADD COLUMN questions_requiring_review INTEGER DEFAULT 0;

-- Create parsed questions table
CREATE TABLE public.parsed_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  q_no INTEGER NOT NULL,
  section_label TEXT,
  text TEXT NOT NULL,
  options JSONB,
  answer_type TEXT NOT NULL,
  answer_hint TEXT,
  confidence DECIMAL(3,2),
  requires_review BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on parsed questions
ALTER TABLE public.parsed_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for parsed questions
CREATE POLICY "Users can view questions from their exams"
  ON public.parsed_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create questions for their exams"
  ON public.parsed_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update questions from their exams"
  ON public.parsed_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete questions from their exams"
  ON public.parsed_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = parsed_questions.section_id
      AND exams.user_id = auth.uid()
    )
  );