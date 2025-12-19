-- Create RLS policies for exam-pdfs storage bucket

-- Allow authenticated users to upload PDFs to their own exam folders
CREATE POLICY "Users can upload PDFs to their exams"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM exams WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to read PDFs from their own exams
CREATE POLICY "Users can view their exam PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM exams WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to update PDFs in their own exams
CREATE POLICY "Users can update their exam PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'exam-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM exams WHERE user_id = auth.uid()
  )
);

-- Allow authenticated users to delete PDFs from their own exams
CREATE POLICY "Users can delete their exam PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-pdfs' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM exams WHERE user_id = auth.uid()
  )
);