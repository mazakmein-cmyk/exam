-- Migration: Add pdf_url to live_sections
ALTER TABLE public.live_sections
ADD COLUMN IF NOT EXISTS pdf_url TEXT;
