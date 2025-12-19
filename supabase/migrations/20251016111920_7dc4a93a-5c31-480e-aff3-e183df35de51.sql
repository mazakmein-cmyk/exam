-- Create attempts table to track exam sessions
CREATE TABLE public.attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  time_spent_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create responses table to track individual question answers
CREATE TABLE public.responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.parsed_questions(id) ON DELETE CASCADE,
  selected_answer JSONB,
  is_marked_for_review BOOLEAN DEFAULT false,
  time_spent_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for attempts
CREATE POLICY "Users can create their own attempts"
ON public.attempts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own attempts"
ON public.attempts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own attempts"
ON public.attempts
FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for responses
CREATE POLICY "Users can create responses for their attempts"
ON public.responses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.attempts
    WHERE attempts.id = responses.attempt_id
    AND attempts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view responses for their attempts"
ON public.responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.attempts
    WHERE attempts.id = responses.attempt_id
    AND attempts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update responses for their attempts"
ON public.responses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.attempts
    WHERE attempts.id = responses.attempt_id
    AND attempts.user_id = auth.uid()
  )
);

-- Create trigger for updating responses updated_at
CREATE TRIGGER update_responses_updated_at
BEFORE UPDATE ON public.responses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();