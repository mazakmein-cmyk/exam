-- ============================================================
-- PRIMARY LANGUAGE + QUESTION GROUP — Additive migration
-- Adds primary_language to exams and question_group_id to parsed_questions.
-- Does NOT modify any existing data or behavior.
-- ============================================================

-- 1. Add primary_language column to exams (defaults to first supported language)
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS primary_language TEXT NOT NULL DEFAULT 'en';

-- 2. Add question_group_id to parsed_questions (links same question across languages)
ALTER TABLE public.parsed_questions
  ADD COLUMN IF NOT EXISTS question_group_id TEXT;

-- 3. Index for fast cross-language question lookups
CREATE INDEX IF NOT EXISTS idx_pq_question_group_id ON public.parsed_questions(question_group_id);

-- 4. Backfill primary_language from first element of supported_languages
UPDATE public.exams
SET primary_language = supported_languages[1]
WHERE supported_languages IS NOT NULL
  AND array_length(supported_languages, 1) > 0
  AND primary_language = 'en'
  AND supported_languages[1] != 'en';

-- 5. Backfill question_group_id for existing multi-language exams
-- Links questions across language variants by matching q_no within the same section_group
DO $$
DECLARE
  grp RECORD;
  qno RECORD;
  new_group_id TEXT;
BEGIN
  -- For each unique section_group_id that has multiple sections (i.e., multi-language)
  FOR grp IN
    SELECT section_group_id
    FROM public.sections
    WHERE section_group_id IS NOT NULL
    GROUP BY section_group_id
    HAVING COUNT(*) > 1
  LOOP
    -- For each distinct q_no within those sections
    FOR qno IN
      SELECT DISTINCT pq.q_no
      FROM public.parsed_questions pq
      JOIN public.sections s ON pq.section_id = s.id
      WHERE s.section_group_id = grp.section_group_id
      ORDER BY pq.q_no
    LOOP
      new_group_id := gen_random_uuid()::TEXT;
      UPDATE public.parsed_questions pq
      SET question_group_id = new_group_id
      FROM public.sections s
      WHERE pq.section_id = s.id
        AND s.section_group_id = grp.section_group_id
        AND pq.q_no = qno.q_no
        AND pq.question_group_id IS NULL;
    END LOOP;
  END LOOP;
END $$;
