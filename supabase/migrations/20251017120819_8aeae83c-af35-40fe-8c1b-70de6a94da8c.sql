-- Add correct_answer field to parsed_questions for answer keys
ALTER TABLE public.parsed_questions 
ADD COLUMN correct_answer jsonb;

-- Add grading and analytics fields to attempts
ALTER TABLE public.attempts 
ADD COLUMN score integer DEFAULT 0,
ADD COLUMN total_questions integer DEFAULT 0,
ADD COLUMN accuracy_percentage numeric(5,2) DEFAULT 0,
ADD COLUMN avg_time_per_question numeric(10,2) DEFAULT 0;

-- Add correctness tracking to responses
ALTER TABLE public.responses 
ADD COLUMN is_correct boolean DEFAULT NULL;

-- Create index for faster analytics queries
CREATE INDEX idx_attempts_user_submitted ON public.attempts(user_id, submitted_at DESC) WHERE submitted_at IS NOT NULL;