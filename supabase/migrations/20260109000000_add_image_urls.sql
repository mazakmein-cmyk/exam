-- Add image_urls column
ALTER TABLE parsed_questions ADD COLUMN image_urls text[] DEFAULT '{}';

-- Migrate existing image_url data to image_urls
UPDATE parsed_questions 
SET image_urls = ARRAY[image_url] 
WHERE image_url IS NOT NULL;
