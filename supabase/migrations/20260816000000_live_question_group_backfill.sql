-- ============================================================
-- LIVE EXAMS: give translated questions a NAME TAG
--
-- WHY
-- Live exams match a student's question to its primary-language twin by
-- COUNTING — ROW_NUMBER() OVER (ORDER BY global_index, q_no, id) - 1, computed
-- inside the student's own language. That is a seat number. It is correct only
-- while every language holds the same questions in the same order, and it fails
-- silently the moment one does not: the room splits (half the students read a
-- different question than the host announced), responses are filed under the
-- wrong canonical row, and the language with fewer questions gets locked out at
-- the end with "This question is not currently open for answers".
--
-- live_questions.question_group_id already exists to be the name tag, and the
-- mock-exam module has used the equivalent column for exactly this since
-- 20260511000000. But on the live side it is only ever written when an exam has
-- more than one language, and the column has no DEFAULT — so it is NULL for
-- every question in every single-language exam, and NULL for anything created
-- before the group-id writers existed or copied through duplicateLiveExam.
--
-- This migration fills those blanks. It changes NO behaviour on its own: at the
-- time it runs, nothing at run time reads question_group_id. Only
-- reorder_live_section_questions (20260806000000) consults it, and that is an
-- authoring action, not a session one. The semantic switch is a later migration.
--
-- SCOPE: MULTI-LANGUAGE EXAMS ONLY — deliberately.
-- A single-language exam has nothing to match against; its "translation" is
-- itself, and the resolution rule "no tag → this question is its own group"
-- already handles it correctly. It also can never need one later: nothing in
-- the application writes supported_languages after createLiveExam, so a
-- single-language exam cannot become multi-language. Tagging them anyway would
-- mean touching far more rows for no behavioural gain.
--
-- BEHAVIOUR-PRESERVING BY CONSTRUCTION
-- Pairing uses the EXACT expression the runtime uses today, not the mock
-- module's per-section q_no pairing (20260511000000:26-60) — live's ordinal is
-- exam-wide per language over (global_index, q_no, id), and where the two
-- disagree a q_no pairing would bless a link the runtime never used. Freezing
-- today's behaviour into tags is what makes the later semantic change
-- reversible: revert the function bodies and the system behaves identically.
--
-- WHAT THIS DOES NOT DO
-- It does not move a question that already carries a tag: every UPDATE is
-- guarded by `question_group_id IS NULL`, so this is idempotent and can never
-- re-link something a creator deliberately linked.
--
-- WHAT IT DOES DO, AND IT IS EASY TO MISREAD
-- On an exam whose languages hold DIFFERENT numbers of questions, this does not
-- skip the short language — it tags it, cementing today's (wrong) pairing. That
-- is the behaviour-preserving choice and it is deliberate: freezing today's
-- behaviour is what makes the later semantic change reversible. But it means a
-- clean run of this migration is NOT evidence the exam is healthy. The count
-- mismatch remains, is still reported by verify_live_group_ids.sql finding B,
-- and is still what the publish/go-live gate must block. Read the audit, not
-- this migration's NOTICE, to decide whether an exam is sound.
--
-- Run supabase/tests/verify_live_group_ids.sql FIRST. Finding D (a tag that
-- disagrees with position) must be zero, or the later semantic change will
-- silently reinterpret existing responses.
-- ============================================================

-- Tags must be parseable UUIDs even though the column is TEXT:
-- reorder_live_section_questions aggregates this column into a UUID[]
-- (20260806000000_live_v2_authoring.sql:58,107-111) and would fail on anything
-- else. gen_random_uuid()::text satisfies that.

-- ─── Step 1: tag untagged PRIMARY-language questions ───
-- gen_random_uuid() is VOLATILE, so it is evaluated once per row — each
-- question gets its own tag, which is what a group-of-one needs.
UPDATE public.live_questions lq
SET question_group_id = gen_random_uuid()::text
FROM public.live_sections s
JOIN public.live_exams e ON e.id = s.live_exam_id
WHERE s.id = lq.live_section_id
  AND COALESCE(array_length(e.supported_languages, 1), 1) > 1
  AND s.language = e.primary_language
  AND lq.question_group_id IS NULL;

-- ─── Step 2: copy each primary tag onto the same-position sibling ───
WITH ord AS (
  SELECT
    lq.id,
    e.id               AS exam_id,
    e.primary_language,
    s.language,
    s.section_group_id,
    lq.question_group_id,
    (ROW_NUMBER() OVER (
       PARTITION BY e.id, s.language
       ORDER BY lq.global_index, lq.q_no, lq.id
     ) - 1)::INTEGER   AS ordinal
  FROM public.live_questions lq
  JOIN public.live_sections  s ON s.id = lq.live_section_id
  JOIN public.live_exams     e ON e.id = s.live_exam_id
  WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
),
primary_tags AS (
  SELECT o.exam_id, o.ordinal, o.section_group_id, o.question_group_id
  FROM ord o
  WHERE o.language = o.primary_language
    AND o.question_group_id IS NOT NULL
    -- Skip a tag the primary language itself uses more than once. It cannot
    -- identify a unique twin, and copying it to two different ordinals would
    -- manufacture exactly the in-language duplicate the guard below exists to
    -- prevent — which that guard cannot catch, because `ord` is the
    -- pre-statement snapshot and would not see the row this same UPDATE just
    -- wrote. Such tags are reported as BLOCKER by finding C of the audit.
    AND NOT EXISTS (
      SELECT 1 FROM ord d
      WHERE d.exam_id  = o.exam_id
        AND d.language = o.language
        AND d.question_group_id = o.question_group_id
        AND d.id <> o.id
    )
),
targets AS (
  SELECT o.id, p.question_group_id AS gid
  FROM ord o
  JOIN primary_tags p
    ON p.exam_id = o.exam_id
   AND p.ordinal = o.ordinal
  WHERE o.language <> o.primary_language
    AND o.question_group_id IS NULL
    -- Refuse to link across section families. The ordinal is exam-wide, so on
    -- an exam where the per-section split differs between languages — en S1=5
    -- S2=5, hi S1=4 S2=6, ten questions each — exam ordinal 4 is en-S1's last
    -- question but hi-S2's first. Every audit finding passes (counts match,
    -- both sections exist, nothing is duplicated) and the tag would still land
    -- on an unrelated question.
    -- That is not merely a wrong link, it is an actively destructive one:
    -- reorder_live_section_questions applies group order per section pair, so
    -- the cross-family row is excluded from its sibling list, keeps its old
    -- q_no while the rest are renumbered, and leaves two rows in hi-S2 sharing
    -- one q_no. renumber_live_global_indexes then tie-breaks that collision by
    -- id and silently reshuffles the Hindi play order — manufacturing, after
    -- the audit has already passed, the exact tag-disagrees-with-position state
    -- finding D exists to catch.
    -- Refused rows stay NULL: unlinked, visible to finding A, skipped by
    -- reorder's `question_group_id IS NOT NULL` filter — today's behaviour.
    AND p.section_group_id IS NOT DISTINCT FROM o.section_group_id
    -- Never create a second row carrying the same tag inside one language.
    -- A pre-existing tag elsewhere in this language (from an earlier import
    -- that paired differently) would otherwise be duplicated here, and the
    -- IS NULL guard means a re-run could never repair it. A row skipped by
    -- this clause stays NULL, stays visible to the audit, and resolves to
    -- itself at run time — degraded, but honest and detectable.
    AND NOT EXISTS (
      SELECT 1 FROM ord x
      WHERE x.exam_id  = o.exam_id
        AND x.language = o.language
        AND x.question_group_id = p.question_group_id
    )
)
UPDATE public.live_questions lq
SET question_group_id = t.gid
FROM targets t
WHERE lq.id = t.id
  -- Belt and braces. `targets` already tests IS NULL, but it does so against
  -- the statement snapshot; restating it on the target row means no path
  -- through this statement can overwrite a tag that already exists.
  AND lq.question_group_id IS NULL;

-- ─── Self-check ───
-- Reports rather than raises. An exam whose languages hold different numbers of
-- questions legitimately ends up with untagged rows — there is no twin to point
-- at — and that is the gate's problem, not this migration's. Raising here would
-- block a backfill that did everything it correctly could.
DO $$
DECLARE
  v_multi      INTEGER;
  v_untagged   INTEGER;
  v_dupes      INTEGER;
  v_live       INTEGER;
BEGIN
  SELECT count(*) INTO v_multi
  FROM public.live_exams
  WHERE COALESCE(array_length(supported_languages, 1), 1) > 1;

  SELECT count(*) INTO v_untagged
  FROM public.live_questions lq
  JOIN public.live_sections s ON s.id = lq.live_section_id
  JOIN public.live_exams    e ON e.id = s.live_exam_id
  WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
    AND lq.question_group_id IS NULL;

  SELECT count(*) INTO v_dupes
  FROM (
    SELECT s.live_exam_id, s.language, lq.question_group_id
    FROM public.live_questions lq
    JOIN public.live_sections s ON s.id = lq.live_section_id
    JOIN public.live_exams    e ON e.id = s.live_exam_id
    WHERE COALESCE(array_length(e.supported_languages, 1), 1) > 1
      AND lq.question_group_id IS NOT NULL
    GROUP BY s.live_exam_id, s.language, lq.question_group_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_live
  FROM public.live_exams WHERE status = 'live';

  RAISE NOTICE 'live name-tag backfill: % multi-language exam(s) considered', v_multi;

  IF v_untagged > 0 THEN
    RAISE NOTICE 'STILL UNTAGGED: % question(s). Causes, all legitimate: the exam has no questions in its primary language; the per-section split differs between languages so the same-section guard refused the link; a section has a NULL section_group_id; or the primary language reuses one tag twice. Run supabase/tests/verify_live_group_ids.sql — findings A, B, C, F and G between them identify which.', v_untagged;
  ELSE
    RAISE NOTICE 'every question in every multi-language exam now carries a name tag — this says NOTHING about whether the pairings are correct. Read the audit for that.';
  END IF;

  IF v_dupes > 0 THEN
    RAISE WARNING 'DUPLICATE TAGS: % (exam, language, tag) group(s) hold more than one question. A canonical lookup would be non-deterministic. Resolve before applying the group-id matching migration.', v_dupes;
  END IF;

  IF v_live > 0 THEN
    RAISE NOTICE '% exam(s) are mid-session. Safe here — nothing reads question_group_id at run time until the matching migration — but do NOT apply that one while a session is live.', v_live;
  END IF;
END $$;

-- ─── Intended consequence, recorded ───
-- Multi-language exams that were entirely untagged were previously skipped by
-- reorder_live_section_questions, whose group loop runs `WHERE
-- lq.question_group_id IS NOT NULL` (20260806000000:107-111) and whose comment
-- reads "A question with no group id is unlinked and is left alone". Those
-- exams now have tags, so a section reorder will start propagating order to
-- their language siblings. That is the function working as designed — it is
-- what keeps sibling questions at matching positions — but it is a real change
-- in what a reorder does to those specific exams, so it is written down here
-- rather than discovered later.
--
-- Deliberately NOT done: no DEFAULT on the column, and no NOT NULL.
-- A DEFAULT would mint a tag for any insert that forgot to pass one, turning an
-- orphan into something indistinguishable from a healthy link — the same
-- fail-open shape as createLiveSection's `sectionGroupId || undefined`. NULL
-- must keep meaning "unlinked", because three consumers already read it that
-- way. NOT NULL is deferred until the client has soaked, since the current
-- client sends nothing for single-language exams and adding it now would make a
-- client rollback impossible.
