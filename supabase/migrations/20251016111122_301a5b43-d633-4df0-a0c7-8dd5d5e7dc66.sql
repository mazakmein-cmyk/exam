-- Add columns to parsed_questions for manual editing
ALTER TABLE public.parsed_questions
ADD COLUMN IF NOT EXISTS is_excluded boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_finalized boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS final_order integer;

-- Add finalization tracking to sections
ALTER TABLE public.sections
ADD COLUMN IF NOT EXISTS is_finalized boolean DEFAULT false;