-- Add image_url column to parsed_questions table for image-based questions
ALTER TABLE parsed_questions ADD COLUMN IF NOT EXISTS image_url text;