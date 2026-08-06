-- Section navigation mode.
--
-- Until now every exam ran one section at a time: the student got that
-- section's `sections.time_minutes`, submitted it, and the section was closed
-- for good. Some papers (SSC CGL Tier-1, CAT, most college internals) instead
-- give ONE clock for the whole paper and let the candidate move between
-- sections until that clock runs out.
--
--   allow_section_switching = false  → today's behavior, unchanged.
--                                      Per-section timer, sequential, no return.
--   allow_section_switching = true   → one clock for the paper. Students see a
--                                      section tab strip and may revisit any
--                                      section until they submit.
--
-- `total_time_minutes` is only consulted when switching is on. It is nullable
-- so "creator has not chosen yet" is distinguishable from "creator chose 0";
-- readers fall back to the sum of the section times (see
-- src/lib/examNavigation.js → totalExamMinutes).
--
-- Per-section `sections.time_minutes` is deliberately NOT dropped or zeroed:
-- turning switching back off must restore the paper exactly as it was.

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS allow_section_switching BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER;

COMMENT ON COLUMN public.exams.allow_section_switching IS
  'true = one clock for the whole paper, student may move between sections freely; false = per-section timer, one-way (default)';
COMMENT ON COLUMN public.exams.total_time_minutes IS
  'Whole-paper time limit in minutes. Only used when allow_section_switching is true. NULL = fall back to the sum of sections.time_minutes.';

-- A creator cannot hand out a paper with a nonsensical clock.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exams_total_time_minutes_positive'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_total_time_minutes_positive
      CHECK (total_time_minutes IS NULL OR total_time_minutes > 0);
  END IF;
END $$;

-- PostgREST caches the column list; without this, inserts/updates naming the
-- new columns fail with PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';

-- Verify the paste itself: raise immediately if the columns did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
      AND column_name = 'allow_section_switching'
  ) THEN
    RAISE EXCEPTION 'exams.allow_section_switching missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams'
      AND column_name = 'total_time_minutes'
  ) THEN
    RAISE EXCEPTION 'exams.total_time_minutes missing after migration';
  END IF;
END $$;
