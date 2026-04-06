-- Multi-Language Exam Support Migration
-- Adds language fields to exams, sections, and attempts tables

-- 1. Add supported_languages and published_languages to exams
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  ADD COLUMN IF NOT EXISTS published_languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. Add language tag and section_group_id to sections
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS section_group_id UUID DEFAULT gen_random_uuid();

-- 3. Add language to attempts
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_sections_language ON public.sections(exam_id, language);
CREATE INDEX IF NOT EXISTS idx_sections_group ON public.sections(section_group_id);
CREATE INDEX IF NOT EXISTS idx_attempts_language ON public.attempts(language);

-- 5. Backfill: Set existing published exams' published_languages to ['en']
UPDATE public.exams
SET published_languages = ARRAY['en']
WHERE is_published = true AND (published_languages IS NULL OR published_languages = ARRAY[]::TEXT[]);
