-- ============================================================
-- RESPONSES: one row per (attempt, question), enforced
--
-- WHAT IS BROKEN
-- examService submits with
--     .upsert(rows, { onConflict: 'attempt_id,question_id' })
-- but no unique index or constraint on those columns has ever existed. Postgres
-- rejects that ON CONFLICT target (42P10) on EVERY submit, and the code quietly
-- falls back to a plain insert (src/services/examService.ts, the matchError
-- branch) which APPENDS instead of replacing.
--
-- So a re-submitted section writes a second full set of answers under the same
-- attempt. ExamSimulator submits multi-section papers in a sequential loop and
-- releases its submit latch on failure, and the exam timer can re-fire the same
-- loop on expiry — so one dropped request duplicates every earlier section.
--
-- WHY IT MATTERS MORE FROM NOW ON
-- Everything that reads answers COUNTS ROWS. get_exam_analytics does COUNT(*)
-- per question and sums score per attempt, so duplicates print accuracy above
-- 100% and a score above the paper maximum, and put the same student in both
-- the "correct" and the "unanswered" bucket for one question. ExamReview
-- double-counts the same way and can cross the 1000-row response cap.
--
-- And this is the prerequisite for saving answers DURING the exam: an
-- incremental writer needs upsert to actually upsert. Without this index, a
-- single 100-question sitting would accumulate hundreds of rows instead of 100.
--
-- WHAT THIS DOES
-- 1. Reports how many duplicates exist, before touching anything.
-- 2. Deletes all but the most recently updated row of each duplicate group.
--    Latest wins because that is the student's final answer for that question.
-- 3. Adds the unique index, so the append path can never be taken again.
--
-- THIS DELETES ROWS. Only rows that share (attempt_id, question_id) with a
-- newer row — never a question's only answer. To see the scale first, without
-- changing anything:
--
--     SELECT count(*) AS duplicate_rows_to_remove
--     FROM (SELECT ROW_NUMBER() OVER (PARTITION BY attempt_id, question_id
--                  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC) AS rn
--           FROM public.responses) t
--     WHERE t.rn > 1;
--
-- Idempotent: re-running finds nothing to delete and the index already exists.
-- ============================================================

DO $$
DECLARE
  v_dupes bigint;
  v_groups bigint;
BEGIN
  SELECT count(*), count(DISTINCT (attempt_id, question_id))
    INTO v_dupes, v_groups
  FROM (
    SELECT
      attempt_id,
      question_id,
      ROW_NUMBER() OVER (
        PARTITION BY attempt_id, question_id
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.responses
  ) t
  WHERE t.rn > 1;

  RAISE NOTICE 'responses: % duplicate row(s) across % question(s) will be removed', v_dupes, v_groups;
END $$;


-- Keep the most recently updated row of each group; delete the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY attempt_id, question_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.responses
)
DELETE FROM public.responses r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;


-- The index the upsert has been asking for since it was written. A unique index
-- is all ON CONFLICT (attempt_id, question_id) needs to infer its target.
CREATE UNIQUE INDEX IF NOT EXISTS responses_attempt_question_key
  ON public.responses (attempt_id, question_id);

-- Superseded: the unique index above covers the same columns in the same order.
DROP INDEX IF EXISTS public.idx_responses_attempt_question;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Self-check: the index must exist and the table must actually be unique on
-- those columns. If a duplicate survived, the CREATE UNIQUE INDEX above would
-- already have failed — this catches the case where the index pre-existed in a
-- different form.
-- ============================================================
DO $$
DECLARE
  v_remaining bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'responses'
      AND indexname = 'responses_attempt_question_key'
  ) THEN
    RAISE EXCEPTION 'responses_attempt_question_key missing after migration';
  END IF;

  SELECT count(*) INTO v_remaining
  FROM (
    SELECT 1 FROM public.responses
    GROUP BY attempt_id, question_id
    HAVING count(*) > 1
  ) t;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'responses still has % duplicated (attempt_id, question_id) group(s)', v_remaining;
  END IF;

  RAISE NOTICE 'responses: one row per (attempt, question) is now enforced';
END $$;
