-- ============================================================
-- LIVE EXAM MODULE — Complete schema for live/interactive exams
-- Creates 6 new tables, all separate from existing mock exam tables.
-- Does NOT modify any existing table.
-- ============================================================

-- ============================================================
-- 1. live_exams — Main live exam table
-- ============================================================
CREATE TABLE public.live_exams (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  description              TEXT,
  instruction              TEXT,
  status                   TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published', 'live', 'ended')),
  share_code               TEXT UNIQUE NOT NULL DEFAULT upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  started_at               TIMESTAMPTZ,
  ended_at                 TIMESTAMPTZ,
  current_question_index   INTEGER NOT NULL DEFAULT -1,
  current_question_unlocked_at TIMESTAMPTZ,
  supported_languages      TEXT[] NOT NULL DEFAULT ARRAY['en'],
  primary_language         TEXT NOT NULL DEFAULT 'en',
  total_questions          INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE TRIGGER update_live_exams_updated_at
  BEFORE UPDATE ON public.live_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_live_exams_user    ON public.live_exams(user_id);
CREATE INDEX idx_live_exams_status  ON public.live_exams(status);
CREATE UNIQUE INDEX idx_live_exams_share_code ON public.live_exams(share_code);

-- ============================================================
-- 2. live_sections — Sections within a live exam
-- ============================================================
CREATE TABLE public.live_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_exam_id     UUID NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  language         TEXT NOT NULL DEFAULT 'en',
  section_group_id UUID DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_sections_exam     ON public.live_sections(live_exam_id);
CREATE INDEX idx_live_sections_language ON public.live_sections(live_exam_id, language);
CREATE INDEX idx_live_sections_group    ON public.live_sections(section_group_id);

-- ============================================================
-- 3. live_questions — Questions within a live section
-- ============================================================
CREATE TABLE public.live_questions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_section_id   UUID NOT NULL REFERENCES public.live_sections(id) ON DELETE CASCADE,
  q_no              INTEGER NOT NULL,
  text              TEXT NOT NULL,
  options           JSONB,
  answer_type       TEXT NOT NULL DEFAULT 'single',
  correct_answer    JSONB,
  time_seconds      INTEGER NOT NULL DEFAULT 60,
  image_url         TEXT,
  image_urls        TEXT[] DEFAULT '{}',
  question_group_id TEXT,
  global_index      INTEGER NOT NULL DEFAULT 0,
  section_label     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_questions_section      ON public.live_questions(live_section_id);
CREATE INDEX idx_live_questions_global_index ON public.live_questions(global_index);
CREATE INDEX idx_live_questions_group        ON public.live_questions(question_group_id);

-- ============================================================
-- 4. live_participants — Students who joined a live exam
-- ============================================================
CREATE TABLE public.live_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_exam_id    UUID NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT NOT NULL DEFAULT 'Anonymous',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  total_correct   INTEGER NOT NULL DEFAULT 0,
  total_answered  INTEGER NOT NULL DEFAULT 0,
  total_time_ms   BIGINT NOT NULL DEFAULT 0,
  rank            INTEGER,
  UNIQUE(live_exam_id, user_id)
);

CREATE INDEX idx_live_participants_exam ON public.live_participants(live_exam_id);
CREATE INDEX idx_live_participants_user ON public.live_participants(user_id);
CREATE INDEX idx_live_participants_rank ON public.live_participants(live_exam_id, rank);

-- ============================================================
-- 5. live_responses — Per-question student answers
-- ============================================================
CREATE TABLE public.live_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_exam_id      UUID NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  live_question_id  UUID NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_answer   JSONB,
  is_correct        BOOLEAN,
  time_taken_ms     INTEGER NOT NULL DEFAULT 0,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_question_id, user_id)
);

CREATE INDEX idx_live_responses_exam     ON public.live_responses(live_exam_id);
CREATE INDEX idx_live_responses_question ON public.live_responses(live_question_id);
CREATE INDEX idx_live_responses_user     ON public.live_responses(user_id);

-- ============================================================
-- 6. live_question_analytics — Per-question stats computed after timer ends
-- ============================================================
CREATE TABLE public.live_question_analytics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_exam_id        UUID NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  live_question_id    UUID NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  total_responses     INTEGER NOT NULL DEFAULT 0,
  correct_count       INTEGER NOT NULL DEFAULT 0,
  wrong_count         INTEGER NOT NULL DEFAULT 0,
  skipped_count       INTEGER NOT NULL DEFAULT 0,
  option_distribution JSONB DEFAULT '{}',
  avg_time_correct_ms INTEGER,
  fastest_time_ms     INTEGER,
  fastest_user_id     UUID REFERENCES auth.users(id),
  fastest_user_name   TEXT,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(live_exam_id, live_question_id)
);

CREATE INDEX idx_live_q_analytics_exam     ON public.live_question_analytics(live_exam_id);
CREATE INDEX idx_live_q_analytics_question ON public.live_question_analytics(live_question_id);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.live_exams              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sections           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_responses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_question_analytics ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: live_exams
-- ============================================================

-- Creator: full CRUD on own exams
CREATE POLICY "Creator can manage own live exams"
  ON public.live_exams FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone: can view published / live / ended exams (for students joining via share link)
CREATE POLICY "Anyone can view joinable live exams"
  ON public.live_exams FOR SELECT
  USING (status IN ('published', 'live', 'ended'));

-- ============================================================
-- RLS: live_sections
-- ============================================================

-- Creator: full CRUD
CREATE POLICY "Creator can manage live sections"
  ON public.live_sections FOR ALL
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()))
  WITH CHECK (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));

-- Students: read sections of joinable exams
CREATE POLICY "Anyone can view live sections of joinable exams"
  ON public.live_sections FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE status IN ('published', 'live', 'ended')));

-- ============================================================
-- RLS: live_questions
-- ============================================================

-- Creator: full CRUD
CREATE POLICY "Creator can manage live questions"
  ON public.live_questions FOR ALL
  USING (live_section_id IN (
    SELECT ls.id FROM public.live_sections ls
    JOIN public.live_exams le ON ls.live_exam_id = le.id
    WHERE le.user_id = auth.uid()
  ))
  WITH CHECK (live_section_id IN (
    SELECT ls.id FROM public.live_sections ls
    JOIN public.live_exams le ON ls.live_exam_id = le.id
    WHERE le.user_id = auth.uid()
  ));

-- Students: read questions of joinable exams
-- NOTE: correct_answer is visible at the DB level; the frontend will hide it
-- until the question timer expires by checking current_question_index & analytics existence
CREATE POLICY "Anyone can view live questions of joinable exams"
  ON public.live_questions FOR SELECT
  USING (live_section_id IN (
    SELECT ls.id FROM public.live_sections ls
    JOIN public.live_exams le ON ls.live_exam_id = le.id
    WHERE le.status IN ('published', 'live', 'ended')
  ));

-- ============================================================
-- RLS: live_participants
-- ============================================================

-- Any authenticated user can join (insert) — one entry per exam per user
CREATE POLICY "Authenticated users can join live exams"
  ON public.live_participants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Anyone in the same exam can see participants (for leaderboard)
CREATE POLICY "Participants can view leaderboard"
  ON public.live_participants FOR SELECT
  USING (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE status IN ('live', 'ended'))
  );

-- Creator can view all participants
CREATE POLICY "Creator can view all participants"
  ON public.live_participants FOR SELECT
  USING (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid())
  );

-- Users can update their own participant row (is_active flag)
CREATE POLICY "Users can update own participant record"
  ON public.live_participants FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- RLS: live_responses
-- ============================================================

-- Students can submit their own responses
CREATE POLICY "Users can submit own live responses"
  ON public.live_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Students can view their own responses
CREATE POLICY "Users can view own live responses"
  ON public.live_responses FOR SELECT
  USING (auth.uid() = user_id);

-- Creator can view all responses for their exams
CREATE POLICY "Creator can view all responses for own exams"
  ON public.live_responses FOR SELECT
  USING (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid())
  );

-- ============================================================
-- RLS: live_question_analytics
-- ============================================================

-- Creator: full insert/update (they compute analytics)
CREATE POLICY "Creator can manage analytics for own exams"
  ON public.live_question_analytics FOR ALL
  USING (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid())
  )
  WITH CHECK (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid())
  );

-- Anyone can read analytics for live/ended exams (students see after timer)
CREATE POLICY "Anyone can view analytics of live exams"
  ON public.live_question_analytics FOR SELECT
  USING (
    live_exam_id IN (SELECT id FROM public.live_exams WHERE status IN ('live', 'ended'))
  );

-- ============================================================
-- ENABLE SUPABASE REALTIME on key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_exams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_question_analytics;

-- ============================================================
-- HELPER RPC: Compute analytics for a specific question
-- Called by the creator's browser when a question timer expires
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_question_analytics(
  p_live_exam_id UUID,
  p_live_question_id UUID
)
RETURNS public.live_question_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.live_question_analytics;
  v_total_participants INTEGER;
  v_total_responses INTEGER;
  v_correct_count INTEGER;
  v_wrong_count INTEGER;
  v_skipped_count INTEGER;
  v_option_dist JSONB;
  v_avg_time_correct INTEGER;
  v_fastest_time INTEGER;
  v_fastest_uid UUID;
  v_fastest_name TEXT;
BEGIN
  -- Only the exam creator can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  -- Count total participants
  SELECT COUNT(*) INTO v_total_participants
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id;

  -- Count responses
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*) FILTER (WHERE is_correct = false)
  INTO v_total_responses, v_correct_count, v_wrong_count
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id;

  v_skipped_count := GREATEST(v_total_participants - v_total_responses, 0);

  -- Option distribution: count how many students chose each option value
  SELECT COALESCE(jsonb_object_agg(opt, cnt), '{}')
  INTO v_option_dist
  FROM (
    SELECT selected_answer::text AS opt, COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id
      AND live_question_id = p_live_question_id
      AND selected_answer IS NOT NULL
    GROUP BY selected_answer::text
  ) sub;

  -- Average time for correct answers
  SELECT AVG(time_taken_ms)::integer
  INTO v_avg_time_correct
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true;

  -- Fastest correct answer
  SELECT time_taken_ms, user_id
  INTO v_fastest_time, v_fastest_uid
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true
  ORDER BY time_taken_ms ASC
  LIMIT 1;

  -- Get fastest user's display name
  IF v_fastest_uid IS NOT NULL THEN
    SELECT display_name INTO v_fastest_name
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_fastest_uid;
  END IF;

  -- Upsert analytics row
  INSERT INTO public.live_question_analytics (
    live_exam_id, live_question_id, total_responses, correct_count,
    wrong_count, skipped_count, option_distribution, avg_time_correct_ms,
    fastest_time_ms, fastest_user_id, fastest_user_name, computed_at
  ) VALUES (
    p_live_exam_id, p_live_question_id, v_total_responses, v_correct_count,
    v_wrong_count, v_skipped_count, v_option_dist, v_avg_time_correct,
    v_fastest_time, v_fastest_uid, v_fastest_name, now()
  )
  ON CONFLICT (live_exam_id, live_question_id) DO UPDATE SET
    total_responses = EXCLUDED.total_responses,
    correct_count = EXCLUDED.correct_count,
    wrong_count = EXCLUDED.wrong_count,
    skipped_count = EXCLUDED.skipped_count,
    option_distribution = EXCLUDED.option_distribution,
    avg_time_correct_ms = EXCLUDED.avg_time_correct_ms,
    fastest_time_ms = EXCLUDED.fastest_time_ms,
    fastest_user_id = EXCLUDED.fastest_user_id,
    fastest_user_name = EXCLUDED.fastest_user_name,
    computed_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ============================================================
-- HELPER RPC: Recompute rankings for all participants in a live exam
-- Called after each question's analytics are computed
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_live_rankings(
  p_live_exam_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the exam creator can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  -- Recompute aggregates from live_responses
  UPDATE public.live_participants lp SET
    total_correct = sub.correct_count,
    total_answered = sub.total_count,
    total_time_ms = sub.total_time
  FROM (
    SELECT
      lr.user_id,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE lr.is_correct = true) AS correct_count,
      COALESCE(SUM(lr.time_taken_ms) FILTER (WHERE lr.is_correct = true), 0) AS total_time
    FROM public.live_responses lr
    WHERE lr.live_exam_id = p_live_exam_id
    GROUP BY lr.user_id
  ) sub
  WHERE lp.live_exam_id = p_live_exam_id
    AND lp.user_id = sub.user_id;

  -- Also set 0s for participants who haven't answered anything
  UPDATE public.live_participants
  SET total_correct = 0, total_answered = 0, total_time_ms = 0
  WHERE live_exam_id = p_live_exam_id
    AND user_id NOT IN (
      SELECT DISTINCT user_id FROM public.live_responses WHERE live_exam_id = p_live_exam_id
    );

  -- Assign ranks: more correct = better, tiebreaker = less total time on correct answers
  UPDATE public.live_participants lp SET
    rank = sub.new_rank
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY total_correct DESC, total_time_ms ASC, joined_at ASC
      ) AS new_rank
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id
  ) sub
  WHERE lp.id = sub.id;
END;
$$;
