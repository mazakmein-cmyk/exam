-- ============================================================
-- LIVE EXAM v2 — PHASE 0: FOUNDATIONS
--
-- Ships no new user-facing feature. It makes the live session cheap enough to
-- run at scale, and collapses duplicated logic so later phases are small.
--
--  1. ONE deadline. The question deadline was derived independently in five
--     places (three RPCs + both pages). A3 "add time" cannot land safely until
--     they agree, so every SQL path now calls live_question_deadline().
--  2. THE FAN-OUT FIX. live_participants was in the realtime publication and
--     compute_live_rankings UPDATEs every participant row after every question,
--     so each student received (participants x questions) messages. At 1000
--     students that is 20,000,000 messages per session against a 2,000,000/month
--     free-tier allowance. It also delivered nothing: ranks only change when the
--     rankings RPC runs, and both pages already refetch at that exact moment.
--     Dropped. live_responses goes too — the creator's counter is now served by
--     live_open_question_tally() from a single browser instead of one realtime
--     event per student per question.
--  3. ONE SYNC CALL. live_session_sync() returns session state + a server clock
--     anchor + a server-chosen poll interval + the presence heartbeat in a
--     single round trip, so students who cannot get a realtime connection
--     (free tier caps at 200 concurrent) degrade to polling instead of freezing.
--  4. Groundwork carried by this migration so later phases are additive only:
--     extra-seconds column (A3), unlock log (A10 restore + D1 timeline),
--     presence (A8), confusion signals (B12), time-profile analytics (B6),
--     and the settings columns for A9/C10/D1/E1/E3.
--
-- Idempotent: safe to re-run. Only live_* objects are touched.
-- ============================================================


-- ============================================================
-- 1. live_exams — new columns
--    All defaulted, so existing rows need no backfill and the previous
--    client keeps working against this schema unchanged.
-- ============================================================
ALTER TABLE public.live_exams
  ADD COLUMN IF NOT EXISTS current_question_extra_seconds INTEGER NOT NULL DEFAULT 0,  -- A3
  ADD COLUMN IF NOT EXISTS scheduled_start_at             TIMESTAMPTZ,                 -- A9 / C10
  ADD COLUMN IF NOT EXISTS auto_start                     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_mode                   BOOLEAN NOT NULL DEFAULT false, -- E1
  ADD COLUMN IF NOT EXISTS leaderboard_visibility         TEXT    NOT NULL DEFAULT 'full', -- E3
  ADD COLUMN IF NOT EXISTS present_show_leaderboard       BOOLEAN NOT NULL DEFAULT true,   -- Q3
  ADD COLUMN IF NOT EXISTS present_show_river             BOOLEAN NOT NULL DEFAULT true,   -- Q6 / B9
  ADD COLUMN IF NOT EXISTS celebrate_seq                  INTEGER NOT NULL DEFAULT 0,      -- B14
  ADD COLUMN IF NOT EXISTS report_share_token             TEXT,                            -- D1
  ADD COLUMN IF NOT EXISTS report_public                  BOOLEAN NOT NULL DEFAULT false,  -- D1
  ADD COLUMN IF NOT EXISTS origin_exam_id                 UUID;                            -- D1 run comparison

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.live_exams'::regclass
      AND conname  = 'live_exams_leaderboard_visibility_check'
  ) THEN
    ALTER TABLE public.live_exams
      ADD CONSTRAINT live_exams_leaderboard_visibility_check
      CHECK (leaderboard_visibility IN ('full', 'private', 'off'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.live_exams'::regclass
      AND conname  = 'live_exams_origin_exam_id_fkey'
  ) THEN
    ALTER TABLE public.live_exams
      ADD CONSTRAINT live_exams_origin_exam_id_fkey
      FOREIGN KEY (origin_exam_id) REFERENCES public.live_exams(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_exams_report_token
  ON public.live_exams(report_share_token)
  WHERE report_share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_exams_scheduled
  ON public.live_exams(scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;


-- ============================================================
-- 2. live_question_analytics — B6 time profile
--    Computed inside compute_live_question_analytics so it costs one extra
--    pass per question, arrives on the analytics realtime event the clients
--    already listen to, and is persisted for the D1 report with no recompute.
-- ============================================================
ALTER TABLE public.live_question_analytics
  ADD COLUMN IF NOT EXISTS median_time_ms   INTEGER,
  ADD COLUMN IF NOT EXISTS fast_correct     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slow_correct     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fast_wrong       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slow_wrong       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impulsive_wrong  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_histogram   JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confusion_count  INTEGER NOT NULL DEFAULT 0;


-- ============================================================
-- 3. New tables
--    None of these are added to the realtime publication. Every write goes
--    through a SECURITY DEFINER RPC, so students need no direct grants and
--    the only SELECT policy is the creator's.
-- ============================================================

-- Presence heartbeat (A8's "who is actually here", and an honest denominator
-- for response rate — is_active on live_participants was never maintained by
-- any client, so "in the room" has always meant "ever joined").
CREATE TABLE IF NOT EXISTS public.live_presence (
  live_exam_id UUID        NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_exam_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_presence_recent
  ON public.live_presence(live_exam_id, last_seen_at DESC);

-- B12 "I'm lost". One signal per student per question, enforced by the PK.
CREATE TABLE IF NOT EXISTS public.live_confusion_signals (
  live_exam_id     UUID        NOT NULL REFERENCES public.live_exams(id)     ON DELETE CASCADE,
  live_question_id UUID        NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  question_ordinal INTEGER     NOT NULL DEFAULT -1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (live_question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_confusion_exam
  ON public.live_confusion_signals(live_exam_id, live_question_id);

-- Unlock history. Written on every unlock so A10 can restore the previous
-- question's real unlock timestamp (it is not recoverable from live_exams,
-- which only ever holds the current one), and so D1 gets a true pacing
-- timeline including where time was added.
CREATE TABLE IF NOT EXISTS public.live_unlock_log (
  live_exam_id     UUID        NOT NULL REFERENCES public.live_exams(id) ON DELETE CASCADE,
  question_ordinal INTEGER     NOT NULL,
  unlocked_at      TIMESTAMPTZ NOT NULL,
  extra_seconds    INTEGER     NOT NULL DEFAULT 0,
  undone_at        TIMESTAMPTZ,
  PRIMARY KEY (live_exam_id, question_ordinal)
);

ALTER TABLE public.live_presence           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_confusion_signals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_unlock_log         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creator can read presence for own exams" ON public.live_presence;
CREATE POLICY "Creator can read presence for own exams"
  ON public.live_presence FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Creator can read confusion for own exams" ON public.live_confusion_signals;
CREATE POLICY "Creator can read confusion for own exams"
  ON public.live_confusion_signals FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Creator can read unlock log for own exams" ON public.live_unlock_log;
CREATE POLICY "Creator can read unlock log for own exams"
  ON public.live_unlock_log FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));


-- ============================================================
-- 4. live_responses — index for B6 buckets and B14 streaks
--    Streak/comeback detection walks one student's answers in play order;
--    without this it is a seq scan over every response in the exam.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_live_responses_user_ordinal
  ON public.live_responses(live_exam_id, user_id, question_ordinal);


-- ============================================================
-- 5. THE FAN-OUT FIX — realtime publication surgery
--
--    Remaining in the publication: live_exams (1 row per unlock, the only
--    push students genuinely need) and live_question_analytics (1 row per
--    question). Both are O(questions), not O(students).
--
--    At 1000 students / 20 questions this takes a session from ~20,000,000
--    realtime messages to ~65,000.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'live_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.live_participants;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'live_responses'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.live_responses;
  END IF;
END $$;


-- ============================================================
-- 6. ONE DEADLINE
--
--    The single definition of when a question closes. The +2s grace is baked
--    in here so no caller can forget it, and extra_seconds (A3) is honoured
--    everywhere at once. IMMUTABLE so it inlines inside larger queries.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_question_deadline(
  p_unlocked_at   TIMESTAMPTZ,
  p_time_seconds  INTEGER,
  p_extra_seconds INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_unlocked_at
       + make_interval(secs => p_time_seconds + COALESCE(p_extra_seconds, 0) + 2);
$$;

GRANT EXECUTE ON FUNCTION public.live_question_deadline(TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated, anon;


-- ============================================================
-- 7. Rewire the three deadline consumers onto the helper.
--    Behaviour is identical while extra_seconds = 0 — deliberately, so this
--    migration can be verified in isolation before A3 exists.
-- ============================================================

-- 7a. Answer reveal
CREATE OR REPLACE FUNCTION public.get_revealed_live_answers(p_live_exam_id UUID)
RETURNS TABLE (live_question_id UUID, correct_answer JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status NOT IN ('live', 'ended') THEN
    RETURN; -- nothing revealed for drafts / published-not-started / unknown exams
  END IF;

  RETURN QUERY
  SELECT t.id, t.correct_answer
  FROM (
    SELECT
      lq.id,
      lq.correct_answer,
      lq.time_seconds,
      ROW_NUMBER() OVER (
        PARTITION BY ls.language
        ORDER BY lq.global_index, lq.q_no, lq.id
      ) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id
  ) t
  WHERE v_exam.status = 'ended'
     OR t.ordinal < v_exam.current_question_index
     OR (
       t.ordinal = v_exam.current_question_index
       AND v_exam.current_question_unlocked_at IS NOT NULL
       AND now() >= public.live_question_deadline(
             v_exam.current_question_unlocked_at,
             t.time_seconds,
             v_exam.current_question_extra_seconds
           )
     );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revealed_live_answers(UUID) TO authenticated;

-- 7b. The student's own responses, with is_correct masked until close
CREATE OR REPLACE FUNCTION public.get_my_live_responses(p_live_exam_id UUID)
RETURNS SETOF public.live_responses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_exam public.live_exams;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;

  RETURN QUERY
  SELECT
    lr.id, lr.live_exam_id, lr.live_question_id, lr.user_id, lr.selected_answer,
    CASE
      WHEN v_exam.status = 'ended' THEN lr.is_correct
      WHEN lr.question_ordinal < v_exam.current_question_index THEN lr.is_correct
      WHEN lr.question_ordinal = v_exam.current_question_index
           AND v_exam.current_question_unlocked_at IS NOT NULL
           AND now() >= public.live_question_deadline(
                 v_exam.current_question_unlocked_at,
                 (SELECT lq.time_seconds FROM public.live_questions lq WHERE lq.id = lr.live_question_id),
                 v_exam.current_question_extra_seconds
               )
        THEN lr.is_correct
      ELSE NULL
    END AS is_correct,
    lr.time_taken_ms, lr.submitted_at, lr.question_ordinal
  FROM public.live_responses lr
  WHERE lr.live_exam_id = p_live_exam_id AND lr.user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_live_responses(UUID) TO authenticated;

-- 7c. Submission
CREATE OR REPLACE FUNCTION public.submit_live_response(
  p_live_exam_id UUID,
  p_live_question_id UUID,
  p_selected_answer JSONB
)
RETURNS public.live_responses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_exam           public.live_exams;
  v_question       public.live_questions;
  v_lang           TEXT;
  v_ordinal        INTEGER;
  v_canonical_id   UUID;
  v_is_correct     BOOLEAN;
  v_time_taken_ms  INTEGER;
  v_deadline       TIMESTAMPTZ;
  v_window_ms      INTEGER;
  v_result         public.live_responses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_selected_answer IS NULL OR jsonb_typeof(p_selected_answer) = 'null' THEN
    RAISE EXCEPTION 'No answer provided';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Live exam not found';
  END IF;
  IF v_exam.status <> 'live' OR v_exam.current_question_index < 0
     OR v_exam.current_question_unlocked_at IS NULL THEN
    RAISE EXCEPTION 'No question is currently open for answers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Join the exam before submitting answers';
  END IF;

  SELECT lq.* INTO v_question
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE lq.id = p_live_question_id AND ls.live_exam_id = p_live_exam_id;
  IF v_question.id IS NULL THEN
    RAISE EXCEPTION 'Question does not belong to this exam';
  END IF;

  SELECT ls.language INTO v_lang
  FROM public.live_sections ls
  WHERE ls.id = v_question.live_section_id;

  -- Ordinal of the submitted question within its own language's play order
  SELECT t.ordinal INTO v_ordinal
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_lang
  ) t
  WHERE t.id = p_live_question_id;

  IF v_ordinal IS DISTINCT FROM v_exam.current_question_index THEN
    RAISE EXCEPTION 'This question is not currently open for answers';
  END IF;

  v_deadline := public.live_question_deadline(
    v_exam.current_question_unlocked_at,
    v_question.time_seconds,
    v_exam.current_question_extra_seconds
  );
  IF now() > v_deadline THEN
    RAISE EXCEPTION 'Time is up for this question';
  END IF;

  -- Canonical (primary-language) question row for cross-language aggregation
  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_ordinal;
  IF v_canonical_id IS NULL THEN
    v_canonical_id := p_live_question_id;
  END IF;

  v_is_correct := public.grade_live_answer(v_question.correct_answer, p_selected_answer);

  -- Clamp to the same window the deadline uses, so an answer accepted inside
  -- an extended question can never record a time beyond that question's span.
  v_window_ms := (v_question.time_seconds + COALESCE(v_exam.current_question_extra_seconds, 0) + 2) * 1000;
  v_time_taken_ms := LEAST(
    GREATEST((extract(epoch from (now() - v_exam.current_question_unlocked_at)) * 1000)::integer, 0),
    v_window_ms
  );

  INSERT INTO public.live_responses (
    live_exam_id, live_question_id, user_id, selected_answer,
    is_correct, time_taken_ms, submitted_at, question_ordinal
  ) VALUES (
    p_live_exam_id, v_canonical_id, v_uid, p_selected_answer,
    v_is_correct, v_time_taken_ms, now(), v_ordinal
  )
  ON CONFLICT (live_question_id, user_id) DO NOTHING;

  -- First submission is final: return whatever row now exists.
  SELECT * INTO v_result
  FROM public.live_responses
  WHERE live_question_id = v_canonical_id AND user_id = v_uid;

  -- Don't leak correctness while the question can still be answered.
  v_result.is_correct := NULL;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_live_response(UUID, UUID, JSONB) TO authenticated;


-- ============================================================
-- 8. Session control — log the unlock, reset extra seconds
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_live_session(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.live_exams;
BEGIN
  UPDATE public.live_exams
  SET status = 'live',
      started_at = now(),
      current_question_index = -1,
      current_question_unlocked_at = NULL,
      current_question_extra_seconds = 0
  WHERE id = p_live_exam_id
    AND user_id = auth.uid()
    AND status = 'published'
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'Cannot start: not the creator or exam is not published';
  END IF;

  -- A fresh session must not inherit unlock history: A10 restores from this
  -- log, and a stale row would resurrect a timestamp from a previous run.
  -- Reachable only once per session (start requires status='published').
  DELETE FROM public.live_unlock_log WHERE live_exam_id = p_live_exam_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_next_live_question(p_live_exam_id UUID)
RETURNS public.live_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam           public.live_exams;
  v_question_count INTEGER;
  v_result         public.live_exams;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;
  IF v_exam.status <> 'live' THEN
    RAISE EXCEPTION 'Exam is not live';
  END IF;

  SELECT COUNT(*) INTO v_question_count
  FROM public.live_questions lq
  JOIN public.live_sections ls ON lq.live_section_id = ls.id
  WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language;

  IF v_exam.current_question_index + 1 >= v_question_count THEN
    RAISE EXCEPTION 'No more questions to unlock';
  END IF;

  UPDATE public.live_exams
  SET current_question_index = v_exam.current_question_index + 1,
      current_question_unlocked_at = now(),
      current_question_extra_seconds = 0
  WHERE id = p_live_exam_id
  RETURNING * INTO v_result;

  -- ON CONFLICT covers re-unlocking an ordinal after an A10 undo.
  INSERT INTO public.live_unlock_log (live_exam_id, question_ordinal, unlocked_at, extra_seconds)
  VALUES (p_live_exam_id, v_result.current_question_index, v_result.current_question_unlocked_at, 0)
  ON CONFLICT (live_exam_id, question_ordinal) DO UPDATE
    SET unlocked_at   = EXCLUDED.unlocked_at,
        extra_seconds = 0,
        undone_at     = NULL;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_live_session(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_next_live_question(UUID) TO authenticated;


-- ============================================================
-- 9. B12 — flag confusion
--    Anonymous to every other student: nothing is returned to the caller, and
--    only the creator can read the table. The PK makes it one signal per
--    student per question, so no rate limiter is needed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.flag_live_confusion(p_live_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_exam         public.live_exams;
  v_canonical_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL OR v_exam.status <> 'live' OR v_exam.current_question_index < 0 THEN
    RAISE EXCEPTION 'No question is currently open';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Join the exam first';
  END IF;

  -- Signals attach to the canonical (primary-language) question row, exactly
  -- like responses, so counts aggregate across translations.
  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_exam.current_question_index;

  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'No question is currently open';
  END IF;

  INSERT INTO public.live_confusion_signals
    (live_exam_id, live_question_id, user_id, question_ordinal)
  VALUES
    (p_live_exam_id, v_canonical_id, v_uid, v_exam.current_question_index)
  ON CONFLICT (live_question_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_live_confusion(UUID) TO authenticated;


-- ============================================================
-- 10. compute_live_question_analytics — plus the B6 time profile
--
--     "Fast" is relative to the question, never an absolute number of
--     seconds: 5s is fast on a 15s question and impossible on a 90s one.
--     The threshold is this question's own median, falling back to 35% of
--     the allotted window when there are too few responses for a median to
--     mean anything.
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
  v_total_responses    INTEGER;
  v_correct_count      INTEGER;
  v_wrong_count        INTEGER;
  v_skipped_count      INTEGER;
  v_option_dist        JSONB;
  v_avg_time_correct   INTEGER;
  v_fastest_time       INTEGER;
  v_fastest_uid        UUID;
  v_fastest_name       TEXT;
  -- B6
  v_ordinal            INTEGER;
  v_time_seconds       INTEGER;
  v_extra_seconds      INTEGER := 0;
  v_window_ms          INTEGER;
  v_median_ms          INTEGER;
  v_threshold_ms       INTEGER;
  v_fast_correct       INTEGER := 0;
  v_slow_correct       INTEGER := 0;
  v_fast_wrong         INTEGER := 0;
  v_slow_wrong         INTEGER := 0;
  v_impulsive_wrong    INTEGER := 0;
  v_histogram          JSONB;
  v_confusion          INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  SELECT COUNT(*) INTO v_total_participants
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*) FILTER (WHERE is_correct = false)
  INTO v_total_responses, v_correct_count, v_wrong_count
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id;

  v_skipped_count := GREATEST(v_total_participants - v_total_responses, 0);

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

  SELECT AVG(time_taken_ms)::integer
  INTO v_avg_time_correct
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true;

  SELECT time_taken_ms, user_id
  INTO v_fastest_time, v_fastest_uid
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id
    AND live_question_id = p_live_question_id
    AND is_correct = true
  ORDER BY time_taken_ms ASC
  LIMIT 1;

  IF v_fastest_uid IS NOT NULL THEN
    SELECT display_name INTO v_fastest_name
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_fastest_uid;
  END IF;

  -- ─── B6: time profile ───────────────────────────────────────

  SELECT lq.time_seconds INTO v_time_seconds
  FROM public.live_questions lq WHERE lq.id = p_live_question_id;
  v_time_seconds := COALESCE(v_time_seconds, 0);

  SELECT lr.question_ordinal INTO v_ordinal
  FROM public.live_responses lr
  WHERE lr.live_exam_id = p_live_exam_id AND lr.live_question_id = p_live_question_id
  LIMIT 1;

  -- The real window includes any A3 time the creator granted, so "fast"
  -- stays honest on a question that was extended mid-flight.
  IF v_ordinal IS NOT NULL THEN
    SELECT COALESCE(ul.extra_seconds, 0) INTO v_extra_seconds
    FROM public.live_unlock_log ul
    WHERE ul.live_exam_id = p_live_exam_id AND ul.question_ordinal = v_ordinal;
  END IF;
  v_extra_seconds := COALESCE(v_extra_seconds, 0);
  v_window_ms := GREATEST((v_time_seconds + v_extra_seconds) * 1000, 1);

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY time_taken_ms)::integer
  INTO v_median_ms
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  v_threshold_ms := CASE
    WHEN v_total_responses >= 8 AND v_median_ms IS NOT NULL THEN v_median_ms
    ELSE (v_window_ms * 0.35)::integer
  END;

  SELECT
    COUNT(*) FILTER (WHERE is_correct = true  AND time_taken_ms <= v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = true  AND time_taken_ms >  v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms <= v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms >  v_threshold_ms),
    COUNT(*) FILTER (WHERE is_correct = false AND time_taken_ms <  (v_window_ms * 0.2))
  INTO v_fast_correct, v_slow_correct, v_fast_wrong, v_slow_wrong, v_impulsive_wrong
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  -- Dense 12-bucket histogram: generate_series guarantees every bucket is
  -- present so the client can render a sparkline without gap handling.
  SELECT COALESCE(jsonb_agg(COALESCE(b.cnt, 0) ORDER BY g.bucket), '[]')
  INTO v_histogram
  FROM generate_series(1, 12) AS g(bucket)
  LEFT JOIN (
    SELECT
      LEAST(width_bucket(time_taken_ms, 0, v_window_ms, 12), 12) AS bucket,
      COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id
    GROUP BY 1
  ) b ON b.bucket = g.bucket;

  SELECT COUNT(*) INTO v_confusion
  FROM public.live_confusion_signals
  WHERE live_exam_id = p_live_exam_id AND live_question_id = p_live_question_id;

  INSERT INTO public.live_question_analytics (
    live_exam_id, live_question_id, total_responses, correct_count,
    wrong_count, skipped_count, option_distribution, avg_time_correct_ms,
    fastest_time_ms, fastest_user_id, fastest_user_name, computed_at,
    median_time_ms, fast_correct, slow_correct, fast_wrong, slow_wrong,
    impulsive_wrong, time_histogram, confusion_count
  ) VALUES (
    p_live_exam_id, p_live_question_id, v_total_responses, v_correct_count,
    v_wrong_count, v_skipped_count, v_option_dist, v_avg_time_correct,
    v_fastest_time, v_fastest_uid, v_fastest_name, now(),
    v_median_ms, v_fast_correct, v_slow_correct, v_fast_wrong, v_slow_wrong,
    v_impulsive_wrong, v_histogram, v_confusion
  )
  ON CONFLICT (live_exam_id, live_question_id) DO UPDATE SET
    total_responses     = EXCLUDED.total_responses,
    correct_count       = EXCLUDED.correct_count,
    wrong_count         = EXCLUDED.wrong_count,
    skipped_count       = EXCLUDED.skipped_count,
    option_distribution = EXCLUDED.option_distribution,
    avg_time_correct_ms = EXCLUDED.avg_time_correct_ms,
    fastest_time_ms     = EXCLUDED.fastest_time_ms,
    fastest_user_id     = EXCLUDED.fastest_user_id,
    fastest_user_name   = EXCLUDED.fastest_user_name,
    median_time_ms      = EXCLUDED.median_time_ms,
    fast_correct        = EXCLUDED.fast_correct,
    slow_correct        = EXCLUDED.slow_correct,
    fast_wrong          = EXCLUDED.fast_wrong,
    slow_wrong          = EXCLUDED.slow_wrong,
    impulsive_wrong     = EXCLUDED.impulsive_wrong,
    time_histogram      = EXCLUDED.time_histogram,
    confusion_count     = EXCLUDED.confusion_count,
    computed_at         = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_live_question_analytics(UUID, UUID) TO authenticated;


-- ============================================================
-- 11. live_session_sync — the pull lane
--
--     One round trip returns everything a client needs to stay in step, plus
--     the presence heartbeat. Students who cannot hold a realtime connection
--     (free tier caps concurrent connections) poll this instead of freezing.
--
--     next_poll_ms is the load governor: the server, which is the only party
--     that knows how many people are in the room, decides how often to be
--     asked again. Clients may slow it down (hidden tab) but never speed it up.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_session_sync(
  p_live_exam_id UUID,
  p_beat BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_exam           public.live_exams;
  v_is_creator     BOOLEAN := false;
  v_is_participant BOOLEAN := false;
  v_online         INTEGER := 0;
  v_joined         INTEGER := 0;
  v_time_seconds   INTEGER;
  v_deadline       TIMESTAMPTZ;
  v_ms_to_deadline BIGINT;
  v_open           BOOLEAN := false;
  v_wait_ms        INTEGER;
  v_open_ms        INTEGER;
  v_next_ms        INTEGER;
  v_my_rank        INTEGER;
  v_my_correct     INTEGER;
  v_confusion      INTEGER;
  v_open_responses INTEGER;
  v_canonical_id   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_exam FROM public.live_exams WHERE id = p_live_exam_id;
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Live exam not found';
  END IF;

  v_is_creator := (v_exam.user_id = v_uid);

  IF NOT v_is_creator AND v_exam.status NOT IN ('published', 'live', 'ended') THEN
    RAISE EXCEPTION 'Live exam not available';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid
  ) INTO v_is_participant;

  -- Heartbeat. Creators are never counted as present: they are not in the
  -- room in the sense A8 cares about, and counting them would inflate the
  -- response-rate denominator by one.
  IF p_beat AND v_is_participant THEN
    INSERT INTO public.live_presence (live_exam_id, user_id, last_seen_at)
    VALUES (p_live_exam_id, v_uid, now())
    ON CONFLICT (live_exam_id, user_id) DO UPDATE SET last_seen_at = now();
  END IF;

  SELECT COUNT(*) INTO v_online
  FROM public.live_presence
  WHERE live_exam_id = p_live_exam_id
    AND last_seen_at > now() - interval '45 seconds';

  SELECT COUNT(*) INTO v_joined
  FROM public.live_participants
  WHERE live_exam_id = p_live_exam_id;

  -- ─── Is a question open, and for how much longer? ───────────
  IF v_exam.status = 'live'
     AND v_exam.current_question_index >= 0
     AND v_exam.current_question_unlocked_at IS NOT NULL THEN
    SELECT t.id, t.time_seconds INTO v_canonical_id, v_time_seconds
    FROM (
      SELECT lq.id, lq.time_seconds,
             ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
      FROM public.live_questions lq
      JOIN public.live_sections ls ON lq.live_section_id = ls.id
      WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
    ) t
    WHERE t.ordinal = v_exam.current_question_index;

    IF v_time_seconds IS NOT NULL THEN
      v_deadline := public.live_question_deadline(
        v_exam.current_question_unlocked_at, v_time_seconds,
        v_exam.current_question_extra_seconds
      );
      v_ms_to_deadline := (extract(epoch from (v_deadline - now())) * 1000)::bigint;
      v_open := v_ms_to_deadline > 0;
    END IF;
  END IF;

  -- ─── Cadence, scaled by how many people are actually in the room ───
  v_wait_ms := CASE WHEN v_online > 600 THEN 4000 WHEN v_online > 200 THEN 2500 ELSE 1500 END;
  v_open_ms := CASE WHEN v_online > 600 THEN 8000 WHEN v_online > 200 THEN 6000 ELSE 5000 END;

  IF v_exam.status IN ('ended', 'draft') THEN
    v_next_ms := 0;                                  -- stop polling
  ELSIF v_open THEN
    -- Nothing that matters can change in the tail: A3 is refused past the
    -- deadline and A10 past 5s. So instead of polling through it, wake once
    -- shortly after the question closes and grading begins.
    v_next_ms := GREATEST(750, LEAST(v_open_ms, (v_ms_to_deadline + 1500)::integer));
  ELSE
    v_next_ms := v_wait_ms;                          -- lobby / between questions
  END IF;

  -- ─── Caller-specific extras ───────────────────────────────
  IF v_is_creator THEN
    IF v_canonical_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_open_responses
      FROM public.live_responses
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

      SELECT COUNT(*) INTO v_confusion
      FROM public.live_confusion_signals
      WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;
    END IF;
  ELSE
    SELECT rank, total_correct INTO v_my_rank, v_my_correct
    FROM public.live_participants
    WHERE live_exam_id = p_live_exam_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'status',                         v_exam.status,
    'current_question_index',         v_exam.current_question_index,
    'current_question_unlocked_at',   v_exam.current_question_unlocked_at,
    'current_question_extra_seconds', v_exam.current_question_extra_seconds,
    'scheduled_start_at',             v_exam.scheduled_start_at,
    'auto_start',                     v_exam.auto_start,
    'privacy_mode',                   v_exam.privacy_mode,
    'leaderboard_visibility',         v_exam.leaderboard_visibility,
    'present_show_leaderboard',       v_exam.present_show_leaderboard,
    'present_show_river',             v_exam.present_show_river,
    'celebrate_seq',                  v_exam.celebrate_seq,
    'total_questions',                v_exam.total_questions,
    'server_now',                     now(),
    'next_poll_ms',                   v_next_ms,
    'online_count',                   v_online,
    'joined_count',                   v_joined,
    'is_creator',                     v_is_creator,
    'my_rank',                        v_my_rank,
    'my_total_correct',               v_my_correct,
    'confusion_count',                v_confusion,
    'open_response_count',            v_open_responses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_session_sync(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 12. live_open_question_tally — the creator's fast lane
--
--     Replaces the per-response realtime binding. One creator browser polling
--     this at 750ms costs 1.3 requests/second and powers, from a single round
--     trip: the Answered meter, B9's live river, B12's confusion count, and
--     A10's "somebody already answered" guard. The realtime alternative was
--     one message per student per question.
-- ============================================================
CREATE OR REPLACE FUNCTION public.live_open_question_tally(p_live_exam_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam           public.live_exams;
  v_canonical_id   UUID;
  v_count          INTEGER := 0;
  v_confusion      INTEGER := 0;
  v_tally          JSONB   := '{}';
  v_first          TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_exam FROM public.live_exams
  WHERE id = p_live_exam_id AND user_id = auth.uid();
  IF v_exam.id IS NULL THEN
    RAISE EXCEPTION 'Access denied: not the exam creator';
  END IF;

  IF v_exam.current_question_index < 0 THEN
    RETURN jsonb_build_object(
      'live_question_id', NULL, 'response_count', 0, 'confusion_count', 0,
      'option_tally', '{}'::jsonb, 'first_response_at', NULL, 'server_now', now()
    );
  END IF;

  SELECT t.id INTO v_canonical_id
  FROM (
    SELECT lq.id,
           ROW_NUMBER() OVER (ORDER BY lq.global_index, lq.q_no, lq.id) - 1 AS ordinal
    FROM public.live_questions lq
    JOIN public.live_sections ls ON lq.live_section_id = ls.id
    WHERE ls.live_exam_id = p_live_exam_id AND ls.language = v_exam.primary_language
  ) t
  WHERE t.ordinal = v_exam.current_question_index;

  IF v_canonical_id IS NULL THEN
    RETURN jsonb_build_object(
      'live_question_id', NULL, 'response_count', 0, 'confusion_count', 0,
      'option_tally', '{}'::jsonb, 'first_response_at', NULL, 'server_now', now()
    );
  END IF;

  SELECT COUNT(*), MIN(submitted_at) INTO v_count, v_first
  FROM public.live_responses
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

  -- Keys are the JSON text of selected_answer, identical to
  -- live_question_analytics.option_distribution, so one client-side
  -- normaliser serves both the live river and the post-reveal breakdown.
  SELECT COALESCE(jsonb_object_agg(opt, cnt), '{}')
  INTO v_tally
  FROM (
    SELECT selected_answer::text AS opt, COUNT(*) AS cnt
    FROM public.live_responses
    WHERE live_exam_id = p_live_exam_id
      AND live_question_id = v_canonical_id
      AND selected_answer IS NOT NULL
    GROUP BY selected_answer::text
  ) sub;

  SELECT COUNT(*) INTO v_confusion
  FROM public.live_confusion_signals
  WHERE live_exam_id = p_live_exam_id AND live_question_id = v_canonical_id;

  RETURN jsonb_build_object(
    'live_question_id',   v_canonical_id,
    'response_count',     v_count,
    'confusion_count',    v_confusion,
    'option_tally',       v_tally,
    'first_response_at',  v_first,
    'server_now',         now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_open_question_tally(UUID) TO authenticated;
