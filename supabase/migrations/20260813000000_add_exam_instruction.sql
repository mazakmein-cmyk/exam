-- Split exam instructions into two fields:
--   instruction / instruction_translations           → "General Instruction" (existing column, label change only)
--   exam_instruction / exam_instruction_translations → "Exam Instruction" (new, optional)
-- Existing data stays where it is and renders as the General Instruction.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS exam_instruction TEXT,
  ADD COLUMN IF NOT EXISTS exam_instruction_translations JSONB DEFAULT '{}'::jsonb;

-- PostgREST caches the column list; without this, inserts/updates naming the
-- new columns fail with PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';

-- Verify the paste itself: raise immediately if the columns did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
      AND column_name = 'exam_instruction'
  ) THEN
    RAISE EXCEPTION 'exams.exam_instruction missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
      AND column_name = 'exam_instruction_translations'
  ) THEN
    RAISE EXCEPTION 'exams.exam_instruction_translations missing after migration';
  END IF;
END $$;
