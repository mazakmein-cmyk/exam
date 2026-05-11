-- ============================================================
-- MARKS MODULE — Additive migration
-- Creates scoring config tables + marks log + additive columns
-- Does NOT modify any existing table schemas
-- ============================================================

-- 1. Exam-level scoring defaults
CREATE TABLE public.exam_scoring_defaults (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id           UUID UNIQUE NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  marks_correct     NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (marks_correct >= 0),
  marks_wrong       NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_wrong >= 0),
  marks_skipped     NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_skipped >= 0),
  mcq_mode          TEXT NOT NULL DEFAULT 'partial' CHECK (mcq_mode IN ('partial','all_or_nothing')),
  mcq_wrong_penalty TEXT NOT NULL DEFAULT 'flat' CHECK (mcq_wrong_penalty IN ('flat','per_option')),
  rounding_strategy TEXT NOT NULL DEFAULT 'floor' CHECK (rounding_strategy IN ('floor','round','ceil','none')),
  show_marks_in_simulator BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- 2. Section-level scoring defaults (overrides exam defaults)
CREATE TABLE public.section_scoring_defaults (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id        UUID UNIQUE NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  marks_correct     NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (marks_correct >= 0),
  marks_wrong       NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_wrong >= 0),
  marks_skipped     NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_skipped >= 0),
  mcq_mode          TEXT NOT NULL DEFAULT 'partial' CHECK (mcq_mode IN ('partial','all_or_nothing')),
  mcq_wrong_penalty TEXT NOT NULL DEFAULT 'flat' CHECK (mcq_wrong_penalty IN ('flat','per_option')),
  rounding_strategy TEXT NOT NULL DEFAULT 'floor' CHECK (rounding_strategy IN ('floor','round','ceil','none')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- 3. Per-question scoring config (highest priority override)
CREATE TABLE public.question_scoring_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id       UUID UNIQUE NOT NULL REFERENCES public.parsed_questions(id) ON DELETE CASCADE,
  marks_correct     NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (marks_correct >= 0),
  marks_wrong       NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_wrong >= 0),
  marks_skipped     NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (marks_skipped >= 0),
  mcq_mode          TEXT NOT NULL DEFAULT 'partial' CHECK (mcq_mode IN ('partial','all_or_nothing')),
  mcq_wrong_penalty TEXT NOT NULL DEFAULT 'flat' CHECK (mcq_wrong_penalty IN ('flat','per_option')),
  rounding_strategy TEXT NOT NULL DEFAULT 'floor' CHECK (rounding_strategy IN ('floor','round','ceil','none')),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- 4. Per-question marks awarded per attempt (for review and analytics)
CREATE TABLE public.question_marks_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES public.parsed_questions(id) ON DELETE CASCADE,
  marks_awarded NUMERIC(8,2) NOT NULL DEFAULT 0,
  breakdown     JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(attempt_id, question_id)
);

-- 5. Additive columns on attempts (does NOT touch existing score column)
ALTER TABLE public.attempts
  ADD COLUMN IF NOT EXISTS marks_score NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marks_max   NUMERIC(10,2) DEFAULT NULL;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_question_marks_log_attempt ON public.question_marks_log(attempt_id);
CREATE INDEX idx_question_marks_log_question ON public.question_marks_log(question_id);
CREATE INDEX idx_question_scoring_config_question ON public.question_scoring_config(question_id);
CREATE INDEX idx_section_scoring_defaults_section ON public.section_scoring_defaults(section_id);
CREATE INDEX idx_exam_scoring_defaults_exam ON public.exam_scoring_defaults(exam_id);

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.exam_scoring_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_scoring_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_marks_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: exam_scoring_defaults — Creator CRUD
-- ============================================================
CREATE POLICY "Creator can manage exam scoring defaults"
  ON public.exam_scoring_defaults FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = exam_scoring_defaults.exam_id
      AND exams.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = exam_scoring_defaults.exam_id
      AND exams.user_id = auth.uid()
    )
  );

-- Public read for published exams (students see marks badges)
CREATE POLICY "Public read exam scoring for published exams"
  ON public.exam_scoring_defaults FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exams
      WHERE exams.id = exam_scoring_defaults.exam_id
      AND exams.is_published = true
    )
  );

-- ============================================================
-- RLS: section_scoring_defaults — Creator CRUD
-- ============================================================
CREATE POLICY "Creator can manage section scoring defaults"
  ON public.section_scoring_defaults FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = section_scoring_defaults.section_id
      AND exams.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = section_scoring_defaults.section_id
      AND exams.user_id = auth.uid()
    )
  );

-- Public read for published exams
CREATE POLICY "Public read section scoring for published exams"
  ON public.section_scoring_defaults FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sections
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE sections.id = section_scoring_defaults.section_id
      AND exams.is_published = true
    )
  );

-- ============================================================
-- RLS: question_scoring_config — Creator CRUD
-- ============================================================
CREATE POLICY "Creator can manage question scoring config"
  ON public.question_scoring_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.parsed_questions
      JOIN public.sections ON parsed_questions.section_id = sections.id
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE parsed_questions.id = question_scoring_config.question_id
      AND exams.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.parsed_questions
      JOIN public.sections ON parsed_questions.section_id = sections.id
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE parsed_questions.id = question_scoring_config.question_id
      AND exams.user_id = auth.uid()
    )
  );

-- Public read for published exams
CREATE POLICY "Public read question scoring for published exams"
  ON public.question_scoring_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.parsed_questions
      JOIN public.sections ON parsed_questions.section_id = sections.id
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE parsed_questions.id = question_scoring_config.question_id
      AND exams.is_published = true
    )
  );

-- ============================================================
-- RLS: question_marks_log — Student reads own, Creator reads all
-- ============================================================
CREATE POLICY "Students can read their own marks log"
  ON public.question_marks_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.attempts
      WHERE attempts.id = question_marks_log.attempt_id
      AND attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Creator can read marks log for their exams"
  ON public.question_marks_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.parsed_questions
      JOIN public.sections ON parsed_questions.section_id = sections.id
      JOIN public.exams ON sections.exam_id = exams.id
      WHERE parsed_questions.id = question_marks_log.question_id
      AND exams.user_id = auth.uid()
    )
  );

-- Authenticated users can insert marks log (for exam submission)
CREATE POLICY "Authenticated can insert marks log"
  ON public.question_marks_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.attempts
      WHERE attempts.id = question_marks_log.attempt_id
      AND attempts.user_id = auth.uid()
    )
  );

-- Authenticated users can update marks log (for upsert on re-submission)
CREATE POLICY "Authenticated can update own marks log"
  ON public.question_marks_log FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.attempts
      WHERE attempts.id = question_marks_log.attempt_id
      AND attempts.user_id = auth.uid()
    )
  );

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================
CREATE TRIGGER update_exam_scoring_defaults_updated_at
  BEFORE UPDATE ON public.exam_scoring_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_section_scoring_defaults_updated_at
  BEFORE UPDATE ON public.section_scoring_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_question_scoring_config_updated_at
  BEFORE UPDATE ON public.question_scoring_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
