-- ─────────────────────────────────────────────────────────────────────────
-- Problem 2 (images) groundwork:
--
-- 1. Persist the AI's image_region on parsed_questions so auto-snip can be
--    re-run after import (previously the page/bbox lived only in browser
--    memory during the upload session and was lost forever).
--
-- 2. Ensure the PUBLIC `question-images` bucket exists. Student-visible
--    images (auto-snips, pasted screenshots, uploads) now go here instead
--    of the private `exam-pdfs` bucket, whose public URLs 403 for anyone
--    but the owner. Everything is idempotent: safe to run whether or not
--    the original 20251116135017 bucket migration was ever applied.
-- ─────────────────────────────────────────────────────────────────────────

-- [1] image_region on parsed_questions.
-- Shape: { "page": int >=1, "x_min"|"y_min"|"x_max"|"y_max": int 0-1000 (optional),
--          "padding_pct": number } — mirrors the import JSON's image_region.
ALTER TABLE public.parsed_questions
  ADD COLUMN IF NOT EXISTS image_region jsonb;

-- [2] question-images bucket: create if missing, force public if present.
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- [3] Policies (wrapped so re-running never errors on duplicates).
DO $$ BEGIN
  CREATE POLICY "Users can upload question images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'question-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT is OWNER-scoped: creators list/manage their own images via the API,
-- while students load images through the bucket's public URLs (which bypass
-- RLS entirely on a public bucket). A blanket authenticated SELECT would let
-- any signed-in user enumerate every question image, including unpublished
-- exams. DROP first so re-running this file upgrades an older blanket policy.
DROP POLICY IF EXISTS "Users can view question images" ON storage.objects;
DO $$ BEGIN
  CREATE POLICY "Users can view question images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'question-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their question images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'question-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their question images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'question-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
