-- Create storage bucket for question images
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for question images
CREATE POLICY "Users can upload question images" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'question-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view question images" ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'question-images');

CREATE POLICY "Users can update their question images" ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their question images" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'question-images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);