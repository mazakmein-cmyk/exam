-- AI PDF import — parallel extraction.
--
-- Until now one Gemini call emitted the whole paper. That call is decode-bound:
-- the measured SBI Clerk run produced ~25k output tokens plus ~38k thinking
-- tokens, and a model emits those one after another however fast the network
-- is. 126 s on 3.5 Flash, 270 s on 2.5 Flash, and no amount of key rotation or
-- retrying moves that number, because nothing had failed — it was simply still
-- typing. The only way to finish sooner is to have several models emitting
-- different parts of the paper at the same time.
--
-- So a job became: one small INDEX pass that reads the paper's shape and
-- transcribes the answer key, then N extraction workers that each own a range
-- of printed question numbers, then a deterministic merge back into the single
-- JSON block the browser already knows how to import. The exam page is not
-- told any of this happened and needs no change.
--
-- That needs somewhere to keep the plan, somewhere to collect the parts, and a
-- safe way for several workers finishing at once to write their results:
--
--   orchestration   the plan: phase, deadlines, and one record per worker
--                   (which key, which question ranges, which attempt). Small,
--                   and read on every poll.
--   shard_results   the parts themselves, keyed by worker index ("-1" is the
--                   index pass). Hundreds of KB, and read only at merge time.
--
--   ai_import_record_shard        a worker finished — store its output AND
--                                 stamp its status in one statement.
--   ai_import_mark_shard_running  a background worker started — remember the
--                                 interaction id before anything else can.
--
-- Why the two functions exist at all: several workers finish independently, and
-- a read-modify-write from each of them would lose whichever landed first. Both
-- functions do their read and write inside a single UPDATE, so the database
-- serialises them instead of the edge function hoping they do not collide.
--
-- Apply AFTER 20260912000000_ai_pdf_import.sql. Idempotent: safe to re-run.
--
-- RE-PASTE THIS FILE IF IT WAS PASTED BEFORE 2026-09-23. The first version of
-- both functions below raised `22P02 malformed array literal: "status"` on
-- EVERY call: they appended untyped literals to a text[] (`target || 'status'`),
-- and Postgres resolves text[] || 'unknown' as array || array, then tries to
-- read the word "status" as an array literal. The edge function probes these
-- functions before planning a split, saw the error, and quietly ran the slow
-- single pass for every import while logging a warning nobody reads. Every
-- literal is now cast (`'status'::text`), and the DO block at the end CALLS
-- both functions so a broken body fails the paste itself, loudly, right here.
--
-- Nothing here is required for the feature to keep working. The edge function
-- checks for these columns and, if they are absent, runs exactly the
-- single-pass import it ran before — so pasting this file is what makes the
-- import fast, not what makes it work.

-- ============================================================
-- 1. The two columns
-- ============================================================
ALTER TABLE public.ai_import_jobs ADD COLUMN IF NOT EXISTS orchestration jsonb;
ALTER TABLE public.ai_import_jobs ADD COLUMN IF NOT EXISTS shard_results  jsonb;

COMMENT ON COLUMN public.ai_import_jobs.orchestration IS
  'Parallel-import plan: phase, job and per-worker deadlines, and one record per worker (key slot, question ranges, attempt count). Small on purpose — every status poll reads it. NULL on a job that ran as a single pass.';

COMMENT ON COLUMN public.ai_import_jobs.shard_results IS
  'One entry per worker, keyed by its index as text; "-1" is the index pass. Read only when the parts are merged, which is why it is not in the column list a poll selects. Cleared with raw_output by ack.';


-- ============================================================
-- 2. ai_import_record_shard — a worker finished
--
-- Stores the output and stamps the worker's status in ONE statement, so two
-- workers landing in the same millisecond cannot overwrite each other. A NULL
-- payload means the worker failed and has nothing to store; its status and
-- reason are still recorded, which is what the scheduler retries on.
--
-- p_index < 0 addresses the index pass (orchestration -> planShard) rather than
-- an entry in the shards array.
-- ============================================================
-- The signature grew a p_attempt argument after this file first existed, and a
-- default argument makes that a DIFFERENT function rather than a replacement.
-- Dropping the old one unconditionally means re-pasting this file upgrades a
-- database that already has it; without the drop both would exist and a
-- five-argument call would be ambiguous.
DROP FUNCTION IF EXISTS public.ai_import_record_shard(uuid, int, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.ai_import_record_shard(
  p_job     uuid,
  p_index   int,
  p_payload jsonb,
  p_status  text,
  p_error   text,
  p_attempt int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target text[];
  live   jsonb;
BEGIN
  IF p_status NOT IN ('done', 'failed') THEN
    RAISE EXCEPTION 'ai_import_record_shard: status must be done or failed, got %', p_status;
  END IF;

  target := CASE
              WHEN p_index < 0 THEN ARRAY['planShard']
              ELSE ARRAY['shards', p_index::text]
            END;

  SELECT orchestration #> target INTO live FROM public.ai_import_jobs WHERE id = p_job;

  -- A LATE REPLY FROM AN ABANDONED ATTEMPT MUST NOT SPEAK FOR THE LIVE ONE.
  -- A worker that runs past its deadline is written off and restarted on
  -- another key; the abandoned call can still finish afterwards and report
  -- itself. Without this check that stale "failed" would mark the REPLACEMENT
  -- failed and send the scheduler round again, paying for a third call to do
  -- work that is already in flight. The attempt number is the only thing that
  -- distinguishes the two, so a write that names an older one is dropped.
  IF p_attempt IS NOT NULL AND live IS NOT NULL
     AND (live ->> 'attempt') IS NOT NULL
     AND (live ->> 'attempt')::int > p_attempt THEN
    RETURN;
  END IF;

  UPDATE public.ai_import_jobs
  SET
    -- First result for a worker index wins. Two attempts that both succeed
    -- carry the same slice of the same paper, so there is nothing to gain from
    -- letting the later one overwrite output already merged against.
    shard_results = CASE
                      WHEN p_payload IS NULL THEN shard_results
                      ELSE jsonb_build_object(p_index::text, p_payload)
                           || coalesce(shard_results, '{}'::jsonb)
                    END,
    -- A job with no plan (single pass, or a row from before this migration) is
    -- left alone: there is no worker record to stamp, and inventing one would
    -- make the scheduler believe in a parallel run that never happened.
    orchestration = CASE
                      WHEN orchestration IS NULL THEN orchestration
                      WHEN orchestration #> target IS NULL THEN orchestration
                      -- `::text` on every literal is load-bearing, not style:
                      -- text[] || 'status' is parsed as array || array and
                      -- fails with 22P02 at plan time, even on the branch not
                      -- taken. See the header.
                      ELSE jsonb_set(
                             jsonb_set(orchestration, target || 'status'::text, to_jsonb(p_status), true),
                             target || 'error'::text,
                             CASE WHEN p_error IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_error) END,
                             true
                           )
                    END,
    updated_at = now()
  WHERE id = p_job;
END;
$$;

COMMENT ON FUNCTION public.ai_import_record_shard(uuid, int, jsonb, text, text, int) IS
  'Atomically record one parallel-import worker''s output and status. Called by the ai-pdf-import edge function with the service role; never by a client.';


-- ============================================================
-- 3. ai_import_mark_shard_running — a background worker started
--
-- The interaction id is the ONLY handle on work that is now running on
-- Gemini's side and being billed for. It is written the instant Gemini returns
-- it, in its own statement, so a worker that dies immediately afterwards still
-- leaves the job something to poll instead of an orphan nobody is watching.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ai_import_mark_shard_running(
  p_job         uuid,
  p_index       int,
  p_interaction text,
  p_slot        text,
  p_deadline    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target text[];
BEGIN
  target := CASE
              WHEN p_index < 0 THEN ARRAY['planShard']
              ELSE ARRAY['shards', p_index::text]
            END;

  UPDATE public.ai_import_jobs
  SET
    orchestration = CASE
                      WHEN orchestration IS NULL THEN orchestration
                      WHEN orchestration #> target IS NULL THEN orchestration
                      -- `::text` casts: see ai_import_record_shard and the header.
                      ELSE jsonb_set(
                             jsonb_set(
                               jsonb_set(orchestration, target || 'interactionId'::text, to_jsonb(p_interaction), true),
                               target || 'slot'::text, to_jsonb(p_slot), true
                             ),
                             target || 'deadlineAt'::text, to_jsonb(p_deadline), true
                           )
                    END,
    interaction_id = coalesce(interaction_id, p_interaction),
    updated_at = now()
  WHERE id = p_job;
END;
$$;

COMMENT ON FUNCTION public.ai_import_mark_shard_running(uuid, int, text, text, text) IS
  'Record the Gemini interaction id of a parallel-import worker the moment it starts. Called by the ai-pdf-import edge function with the service role; never by a client.';


-- ============================================================
-- 4. Only the service role may call them
--
-- Both functions are SECURITY DEFINER and write job rows that the table's RLS
-- deliberately lets creators read but never write. Leaving EXECUTE on PUBLIC
-- would hand any signed-in user a way to write arbitrary JSON into another
-- creator's import and mark its workers finished.
-- ============================================================
REVOKE ALL ON FUNCTION public.ai_import_record_shard(uuid, int, jsonb, text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_import_mark_shard_running(uuid, int, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_import_record_shard(uuid, int, jsonb, text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_import_mark_shard_running(uuid, int, text, text, text) TO service_role;


-- PostgREST caches the column list and the RPC list; without this the new
-- columns and functions 404 / PGRST204 until the cache refreshes on its own,
-- and the edge function would keep falling back to the slow single pass while
-- the database already had everything it needed.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 5. Prove the paste worked — by CALLING the functions
--
-- Existence is not enough: the 2026-09-16 bodies existed, were locked to the
-- service role, and raised 22P02 on every call. Each call below names a job id
-- that cannot exist, so it matches no row and changes nothing — it only has to
-- RUN. If any of it raises, the paste fails here with the real error instead
-- of every import silently taking the slow path for a week.
-- ============================================================
DO $$
DECLARE
  probe constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_import_jobs' AND column_name = 'orchestration'
  ) THEN
    RAISE EXCEPTION 'ai_import_jobs.orchestration missing after migration';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_import_jobs' AND column_name = 'shard_results'
  ) THEN
    RAISE EXCEPTION 'ai_import_jobs.shard_results missing after migration';
  END IF;

  -- A worker (index 0) and the index pass (index -1), done and failed, with and
  -- without an attempt number: every path through the body.
  PERFORM public.ai_import_record_shard(probe, 0, NULL, 'done', NULL, 0);
  PERFORM public.ai_import_record_shard(probe, -1, '{"pages": 1}'::jsonb, 'done', NULL, 1);
  PERFORM public.ai_import_record_shard(probe, 2, NULL, 'failed', 'probe', NULL);
  PERFORM public.ai_import_mark_shard_running(probe, 0, 'probe', 'primary', now()::text);
  PERFORM public.ai_import_mark_shard_running(probe, -1, 'probe', 'fallback3', now()::text);

  -- The old five-argument signature must be gone, or a five-argument call from
  -- an older build would be ambiguous.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ai_import_record_shard' AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'the five-argument ai_import_record_shard still exists';
  END IF;

  RAISE NOTICE 'ai_import parallel functions verified: both callable, no ambiguous overload';
END $$;
