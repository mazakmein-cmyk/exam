-- ─────────────────────────────────────────────────────────────────────────
-- Problem 2b: image answer-options (mirror-image / figure-series questions).
--
-- Options stay a plain text array (`options` jsonb) so scoring, imports and
-- every existing question keep working untouched. Images live in a PARALLEL
-- array aligned by position:
--
--   option_image_urls: ["https://...png", null, "https://...png", null]
--
-- null = that option has no image. An option may have text, an image, or
-- both. Index-based correct_answer semantics are unchanged.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.parsed_questions
  ADD COLUMN IF NOT EXISTS option_image_urls jsonb;
