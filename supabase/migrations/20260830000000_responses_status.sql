-- ============================================================
-- RESPONSES: remember whether a question was seen
--
-- WHY
-- The runner tracks three states per question — "untouched" (never opened),
-- "viewed" (read and left blank), "attempted" (answered) — and the question
-- palette is built from them: it is how a candidate finds the questions they
-- skipped on purpose. None of that survives a page load, because the state
-- lives only in React and `responses` has nowhere to put it.
--
-- All three collapse to a NULL selected_answer once written, and so does an
-- answer the student typed and then cleared. So the distinction cannot be
-- recovered after the fact — a resumed exam would show every read-and-skipped
-- question as never-visited, which is the one thing the palette exists to tell
-- a candidate apart.
--
-- This is the last column needed before answers can be saved during the exam
-- rather than only at submit.
--
-- NULL is allowed and means "written before this column existed". Nothing reads
-- it yet except the runner, and the runner treats NULL as: answered if there is
-- a selected_answer, untouched otherwise — the best guess available for a row
-- that predates the column.
-- ============================================================

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.responses'::regclass
      AND conname = 'responses_status_known'
  ) THEN
    ALTER TABLE public.responses
      ADD CONSTRAINT responses_status_known
      CHECK (status IS NULL OR status IN ('untouched', 'viewed', 'attempted'));
  END IF;
END $$;

COMMENT ON COLUMN public.responses.status IS
  'Runner-side question state: untouched | viewed | attempted. NULL on rows written before the column existed. Drives the question palette on resume; not used for grading.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION 'responses.status missing after migration';
  END IF;
  RAISE NOTICE 'responses.status ready';
END $$;
