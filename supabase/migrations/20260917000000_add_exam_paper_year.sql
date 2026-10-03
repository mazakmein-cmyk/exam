-- Paper year — WHICH year's paper is this?
--
-- The companion to paper_type (20260825000000). A previous-year paper is never
-- just "a previous-year paper": it is "SSC MTS 2024", and the year is the token
-- aspirants actually scan, search and filter by.
--
--   exams.paper_type   what this paper IS         ('mock' | 'pyq')
--   exams.paper_year   WHICH year it was set in   (1990..2100, or NULL)
--
-- NULLABLE, and deliberately NOT backfilled. Every exam that exists when this
-- is pasted keeps an empty year — including the previous-year papers already
-- tagged. Their year is not knowable from here: the numeral in a title is a
-- guess, and inventing one would put fabricated data behind a student-facing
-- filter. Creators fill it in as they next edit the paper; the app demands it
-- only for a paper being saved as a PYQ from now on.
--
-- Why no NOT NULL and no cross-column CHECK ("a mock must have no year"):
-- either would turn an unrelated UPDATE into a failure. savePaperType() writes
-- paper_type on its own, and a constraint spanning both columns would make that
-- write fail on any row the app had not already cleaned up. The pairing is
-- enforced in ONE place instead — effectivePaperYear() in src/lib/paperType.js,
-- which every write goes through — and readPaperYear() ignores a year sitting
-- on a mock, so a stray value can never leak into the library's filter.
--
-- Why the upper bound is 2100 and not "this year": a CHECK constraint may only
-- call IMMUTABLE functions, so extract(year from now()) is not available here.
-- The PICKER stops at the current year (paperYearOptions()); this constraint is
-- only the guard rail that keeps a typo or a bad client out of the column.
--
-- No index. The student library filters by year client-side, over the published
-- list it has already fetched — an index here would be paid for on every write
-- and read by nothing.
--
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. exams.paper_year — nullable integer, no backfill
-- ============================================================
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS paper_year integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exams'::regclass
      AND conname = 'exams_paper_year_valid'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_paper_year_valid
      CHECK (paper_year IS NULL OR (paper_year BETWEEN 1990 AND 2100));
  END IF;
END $$;

COMMENT ON COLUMN public.exams.paper_year IS
  'The year a previous-year paper was actually set (1990..2100). NULL for every mock, and NULL for every paper that existed before this column — it is never backfilled from the title. Only creators with profiles.can_set_paper_type can set it, and only on a paper_type = ''pyq'' exam; see src/lib/paperType.js (effectivePaperYear).';


-- PostgREST caches the column list; without this, inserts/updates naming
-- paper_year fail with PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';


-- Verify the paste itself: raise immediately if anything did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'paper_year'
  ) THEN
    RAISE EXCEPTION 'exams.paper_year missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exams'::regclass AND conname = 'exams_paper_year_valid'
  ) THEN
    RAISE EXCEPTION 'exams_paper_year_valid constraint missing after migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exams
    WHERE paper_year IS NOT NULL AND paper_year NOT BETWEEN 1990 AND 2100
  ) THEN
    RAISE EXCEPTION 'exams.paper_year holds a value outside 1990..2100 after migration';
  END IF;
END $$;
