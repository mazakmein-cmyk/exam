-- ============================================================
-- REPORT SHARE LINKS BECOME ACTUAL SECRETS (issue 8)
--
-- WHAT WAS BROKEN
-- 1. report_share_token lived as a plain column on live_exams, whose student
--    SELECT policy ("Anyone can view joinable live exams") has no column
--    restriction. One request — GET /live_exams?select=id,report_share_token —
--    listed every shared report token on the platform, and every student in a
--    room already received their room's token inside the exam row. A "secret
--    link" anyone can enumerate is not a secret.
-- 2. The report payload the token serves includes every question's
--    correct_answer and the origin exam id. Live exams are duplicated to
--    re-run, so a report shared with one batch is the next batch's answer key.
--
-- THE FIX
-- 1. Tokens move to their own table, live_report_shares, which students cannot
--    read at all (creator-only SELECT; writes only through the definer
--    function). Every token already minted moves over, then the live_exams
--    column is scrubbed. The column itself stays (clients and generated types
--    reference it) but is NULL forever.
-- 2. The token read path strips correct_answer from every question and drops
--    origin_exam_id. The creator's own path keeps both — their screen, their
--    keys. The public page renders the same distributions minus the green
--    "this was the answer" marks.
--
-- COST: nothing on the hot path. Tokens are touched once when a creator
-- toggles sharing and once per report-link open — single indexed lookups, the
-- same count of requests as before. Nothing 500 concurrent students do reads
-- or writes any of this.
--
-- Requires (apply first): 20260834000000 (live_report_masked_ids).
-- Idempotent: safe to re-run.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'live_report_masked_ids') THEN
    RAISE EXCEPTION 'apply 20260834000000_live_privacy_anonymity.sql first';
  END IF;
END $$;


-- ============================================================
-- 1. The vault
-- ============================================================
CREATE TABLE IF NOT EXISTS public.live_report_shares (
  live_exam_id UUID PRIMARY KEY REFERENCES public.live_exams(id) ON DELETE CASCADE,
  token        TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_report_shares_token_key
  ON public.live_report_shares(token);

ALTER TABLE public.live_report_shares ENABLE ROW LEVEL SECURITY;

-- The creator sees their own row (the report page shows the current link on
-- load). Nobody else has any policy: students cannot read tokens they cannot
-- see, and writes happen only inside the definer function below.
DROP POLICY IF EXISTS "Creator can read own report shares" ON public.live_report_shares;
CREATE POLICY "Creator can read own report shares"
  ON public.live_report_shares FOR SELECT
  USING (live_exam_id IN (SELECT id FROM public.live_exams WHERE user_id = auth.uid()));

-- ── Move every minted token, then scrub the readable copy ───────────────────
INSERT INTO public.live_report_shares (live_exam_id, token, enabled)
SELECT id, report_share_token, report_public
FROM public.live_exams
WHERE report_share_token IS NOT NULL
ON CONFLICT (live_exam_id) DO NOTHING;

UPDATE public.live_exams
SET report_share_token = NULL
WHERE report_share_token IS NOT NULL;


-- ============================================================
-- 2. set_live_report_sharing — same signature, new storage
--
--    The client's contract is unchanged: returns the token when enabling,
--    NULL when disabling. report_public keeps being written on live_exams —
--    it is a harmless boolean some UI reads — but the token never goes back.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_live_report_sharing(
  p_live_exam_id UUID,
  p_enabled BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.live_exams
    WHERE id = p_live_exam_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'REPORT_NOT_CREATOR';
  END IF;

  SELECT token INTO v_token
  FROM public.live_report_shares
  WHERE live_exam_id = p_live_exam_id;

  -- Minted once and kept, so turning sharing off and on again does not silently
  -- break a link the creator already sent.
  IF v_token IS NULL AND p_enabled THEN
    v_token := encode(gen_random_bytes(18), 'hex');
  END IF;

  IF v_token IS NOT NULL THEN
    INSERT INTO public.live_report_shares (live_exam_id, token, enabled)
    VALUES (p_live_exam_id, v_token, p_enabled)
    ON CONFLICT (live_exam_id) DO UPDATE SET enabled = EXCLUDED.enabled;
  END IF;

  UPDATE public.live_exams
  SET report_public = p_enabled,
      report_share_token = NULL
  WHERE id = p_live_exam_id;

  RETURN CASE WHEN p_enabled THEN v_token ELSE NULL END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_live_report_sharing(UUID, BOOLEAN) TO authenticated;


-- ============================================================
-- 3. get_live_exam_report_by_token — vault lookup, no answer keys
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_live_exam_report_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam      public.live_exams;
  v_payload   JSONB;
  v_questions JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT le.* INTO v_exam
  FROM public.live_report_shares s
  JOIN public.live_exams le ON le.id = s.live_exam_id
  WHERE s.token = p_token AND s.enabled = true;

  IF v_exam.id IS NULL THEN
    RETURN NULL; -- unknown token, or sharing switched off again
  END IF;

  SELECT payload INTO v_payload
  FROM public.live_exam_reports WHERE live_exam_id = v_exam.id;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  -- Ids masked as of 20260834000000; names follow the privacy setting.
  v_payload := public.live_report_masked_ids(v_exam.id, v_payload, NOT v_exam.privacy_mode);

  -- Live exams are duplicated to re-run, so a shared report with the keys in
  -- it is next period's answer sheet. The distributions stay; the green marks
  -- go. The creator's own path (get_live_exam_report) keeps them.
  SELECT COALESCE(jsonb_agg(t.e - 'correct_answer' ORDER BY t.ord), '[]')
  INTO v_questions
  FROM jsonb_array_elements(COALESCE(v_payload -> 'questions', '[]'::jsonb))
       WITH ORDINALITY AS t(e, ord);

  RETURN (v_payload - 'origin_exam_id')
    || jsonb_build_object('questions', v_questions);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_exam_report_by_token(TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Self-check
-- ============================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  -- The vault exists and only the creator can read it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'live_report_shares'
  ) THEN
    RAISE EXCEPTION 'live_report_shares table missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'live_report_shares'
      AND policyname = 'Creator can read own report shares'
  ) THEN
    RAISE EXCEPTION 'creator SELECT policy missing on live_report_shares';
  END IF;
  IF (SELECT COUNT(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'live_report_shares') <> 1 THEN
    RAISE EXCEPTION 'live_report_shares must have exactly the one creator policy';
  END IF;

  -- The enumerable copy is gone.
  IF EXISTS (SELECT 1 FROM public.live_exams WHERE report_share_token IS NOT NULL) THEN
    RAISE EXCEPTION 'live_exams still carries report tokens';
  END IF;

  -- Both functions moved to the vault; the token path drops the keys.
  v_def := pg_get_functiondef('public.set_live_report_sharing(uuid, boolean)'::regprocedure);
  IF position('live_report_shares' IN v_def) = 0 THEN
    RAISE EXCEPTION 'set_live_report_sharing still writes the token to live_exams';
  END IF;
  v_def := pg_get_functiondef('public.get_live_exam_report_by_token(text)'::regprocedure);
  IF position('live_report_shares' IN v_def) = 0 THEN
    RAISE EXCEPTION 'get_live_exam_report_by_token still looks tokens up on live_exams';
  END IF;
  IF position('- ''correct_answer''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the shared report still ships the answer key';
  END IF;
  IF position('- ''origin_exam_id''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'the token path lost its origin_exam_id strip';
  END IF;

  RAISE NOTICE 'report links are secrets now: tokens vaulted and scrubbed, shared reports carry no answer keys';
END $$;
