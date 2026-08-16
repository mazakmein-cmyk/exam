-- Section timing groups ("Session I: two subjects, one 45-minute pool").
--
-- Real papers (TSPSC Group-4 and friends) sit several subjects on ONE shared
-- clock while scoring each subject separately. Until now the app knew only the
-- two extremes: locked (every section its own clock) and free
-- (allow_section_switching — the whole paper on one clock). This adds the
-- middle: a creator groups 2+ adjacent sections into a timing group; the group
-- shares one pool of minutes (students move freely inside it), groups and solo
-- sections are still sat in order, a submitted group stays closed, and time
-- never carries over. Marks, attempts and analytics stay per-section — nothing
-- about scoring changes shape.
--
-- Naming: `sections.section_group_id` is TAKEN (it links language twins of one
-- logical section), and "session" is taken twice (live-exam sessions; the
-- results pages' reconstructed sittings). Hence timing_group.
--
-- Language rule: `timing_group_id` is written ONLY on PRIMARY-language section
-- rows. Secondary-language rows keep it NULL and derive their grouping through
-- the twin link (section_group_id → primary twin → its timing_group_id) — the
-- same single-source-of-truth rule the marks module already uses for scoring
-- config. One copy of the structure means the Hindi and English sittings can
-- never disagree about the paper's timing shape.
--
-- Groups are IGNORED while allow_section_switching is true (the whole paper is
-- one clock — a grouping within it means nothing). The rows are kept, not
-- deleted, exactly like sections.time_minutes survives the switch: turning
-- whole-paper switching back off restores the grouped paper as it was.

CREATE TABLE IF NOT EXISTS public.section_timing_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  -- Creator-facing label in the exam's primary language ("Session I").
  name text NOT NULL,
  -- Language code → localized label; a missing key falls back to `name`
  -- everywhere (one shared rule — see src/lib/timingGroups.js).
  name_translations jsonb,
  -- Explicit pool for the group. NULL = the sum of the member sections'
  -- time_minutes, which is the default a creator means by "Session I's time".
  time_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT section_timing_groups_time_positive
    CHECK (time_minutes IS NULL OR time_minutes > 0)
);

COMMENT ON TABLE public.section_timing_groups IS
  'A shared time pool over 2+ adjacent sections (TSPSC-style "Session"). Membership lives on sections.timing_group_id (primary-language rows only). Ignored while exams.allow_section_switching is true.';
COMMENT ON COLUMN public.section_timing_groups.time_minutes IS
  'Pool minutes for the whole group. NULL = fall back to the sum of member sections'' time_minutes.';

-- Membership. ON DELETE SET NULL: deleting a group ungroups its members and
-- never blocks; the hand-rolled cascade deletes in Dashboard/ExamDetail keep
-- working untouched because the exam_id FK above cascades the group rows.
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS timing_group_id uuid
    REFERENCES public.section_timing_groups(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sections.timing_group_id IS
  'Timing group (shared time pool) this section belongs to. Set on PRIMARY-language rows only; secondary languages derive it via section_group_id. NULL = the section keeps its own clock. NOT the multi-language link — that is section_group_id.';

CREATE INDEX IF NOT EXISTS idx_sections_timing_group
  ON public.sections(timing_group_id);
CREATE INDEX IF NOT EXISTS idx_section_timing_groups_exam
  ON public.section_timing_groups(exam_id);

-- RLS mirrors sections exactly: the creator manages their own exam's groups,
-- and anyone may read the groups of a published exam (the intro page and the
-- runner both need them before an anonymous student signs in).
ALTER TABLE public.section_timing_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'section_timing_groups'
      AND policyname = 'Users can view timing groups of their exams'
  ) THEN
    CREATE POLICY "Users can view timing groups of their exams"
      ON public.section_timing_groups FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.exams
          WHERE exams.id = section_timing_groups.exam_id
          AND exams.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'section_timing_groups'
      AND policyname = 'Users can create timing groups for their exams'
  ) THEN
    CREATE POLICY "Users can create timing groups for their exams"
      ON public.section_timing_groups FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.exams
          WHERE exams.id = section_timing_groups.exam_id
          AND exams.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'section_timing_groups'
      AND policyname = 'Users can update timing groups of their exams'
  ) THEN
    CREATE POLICY "Users can update timing groups of their exams"
      ON public.section_timing_groups FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.exams
          WHERE exams.id = section_timing_groups.exam_id
          AND exams.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'section_timing_groups'
      AND policyname = 'Users can delete timing groups of their exams'
  ) THEN
    CREATE POLICY "Users can delete timing groups of their exams"
      ON public.section_timing_groups FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.exams
          WHERE exams.id = section_timing_groups.exam_id
          AND exams.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'section_timing_groups'
      AND policyname = 'Anyone can view timing groups of published exams'
  ) THEN
    CREATE POLICY "Anyone can view timing groups of published exams"
      ON public.section_timing_groups FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.exams
          WHERE exams.id = section_timing_groups.exam_id
          AND exams.is_published = true
        )
      );
  END IF;
END $$;

-- PostgREST caches the column list; without this, inserts/updates naming the
-- new table or column fail with PGRST204 until the cache refreshes on its own.
NOTIFY pgrst, 'reload schema';

-- Verify the paste itself: raise immediately if anything did not land.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'section_timing_groups'
  ) THEN
    RAISE EXCEPTION 'section_timing_groups table missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sections'
      AND column_name = 'timing_group_id'
  ) THEN
    RAISE EXCEPTION 'sections.timing_group_id missing after migration';
  END IF;
END $$;
