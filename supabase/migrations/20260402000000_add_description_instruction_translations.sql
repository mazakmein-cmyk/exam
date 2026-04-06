-- Add JSONB columns for multi-language description and instructions
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS description_translations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS instruction_translations JSONB DEFAULT '{}'::jsonb;

-- Backfill existing descriptions into the 'en' translation to prevent data loss
UPDATE public.exams
SET description_translations = jsonb_build_object('en', description)
WHERE description IS NOT NULL AND description != '';

UPDATE public.exams
SET instruction_translations = jsonb_build_object('en', instruction)
WHERE instruction IS NOT NULL AND instruction != '';
