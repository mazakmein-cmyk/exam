-- ─────────────────────────────────────────────────────────────────────────
-- Live-exam parity for image answer-options (mirrors parsed_questions'
-- option_image_urls from 20260731000000):
--
--   option_image_urls: ["https://...png", null, ...]  -- aligned with options
--
-- IMPORTANT: students read live_questions_student, a definer-rights VIEW
-- whose column list was snapshotted at creation — a plain ADD COLUMN never
-- reaches it. The view is recreated below with the new column APPENDED
-- (CREATE OR REPLACE VIEW requires existing columns keep name/order).
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.live_questions
  ADD COLUMN IF NOT EXISTS option_image_urls jsonb;

CREATE OR REPLACE VIEW public.live_questions_student AS
SELECT
  lq.id,
  lq.live_section_id,
  lq.q_no,
  lq.text,
  lq.options,
  lq.answer_type,
  lq.time_seconds,
  lq.image_url,
  lq.image_urls,
  lq.question_group_id,
  lq.global_index,
  lq.section_label,
  lq.created_at,
  lq.option_image_urls
FROM public.live_questions lq
WHERE lq.live_section_id IN (
  SELECT ls.id
  FROM public.live_sections ls
  JOIN public.live_exams le ON ls.live_exam_id = le.id
  WHERE le.status IN ('published', 'live', 'ended')
);

GRANT SELECT ON public.live_questions_student TO authenticated, anon;
