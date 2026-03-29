-- Performance indexes on hot foreign key columns
-- These columns are used in .in() and .eq() filters on every exam start, analytics load, and review page
-- PostgreSQL does NOT auto-create indexes on foreign keys, so these are all missing
-- Adding indexes is non-destructive: no schema change, no data change, only faster reads

-- attempts.section_id: queried with .in("section_id", sectionIds) on every analytics and review load
CREATE INDEX IF NOT EXISTS idx_attempts_section_id ON public.attempts (section_id);

-- attempts.user_id: queried with .eq("user_id", userId) on every student analytics load
CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON public.attempts (user_id);

-- responses.attempt_id: queried with .in("attempt_id", attemptIds) on every analytics and review load
CREATE INDEX IF NOT EXISTS idx_responses_attempt_id ON public.responses (attempt_id);

-- parsed_questions.section_id: queried with .eq("section_id", sectionId) on every exam start
CREATE INDEX IF NOT EXISTS idx_parsed_questions_section_id ON public.parsed_questions (section_id);
