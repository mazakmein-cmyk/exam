/**
 * PRIVACY MODE ACTUALLY ANONYMISES (issue 7)
 *
 * Run with: node src/__tests__/live-privacy-anonymity.test.mjs
 *
 * Privacy mode masked names on screen while the data kept carrying real
 * identities three ways:
 *
 *   1. live_question_analytics stored the fastest student's real auth UUID
 *      beside the pseudonym, in a table broadcast whole over realtime and
 *      readable by ANY signed-in account (participant or not).
 *   2. The public report token returned a {real user_id -> name} map plus
 *      per-student rows keyed by real UUIDs, granted to anon.
 *   3. Pseudonyms are assigned by join order and the masked leaderboard
 *      published joined_at, so sorting by join time decoded every name.
 *
 * Migration 20260834000000 closes all three. These assertions pin the closure
 * and the client's two-generation resolution (participant row id on new rows,
 * user id on old ones) so neither side regresses alone.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260834000000_live_privacy_anonymity.sql"),
  "utf-8"
);
const SERVICE = readFileSync(resolve(ROOT, "src/services/liveExamService.ts"), "utf-8");
const CONTROL = readFileSync(resolve(ROOT, "src/pages/LiveExamControl.tsx"), "utf-8");
const TYPES = readFileSync(resolve(ROOT, "src/integrations/supabase/types.ts"), "utf-8");

console.log("\nPRIVACY MODE ACTUALLY ANONYMISES\n");

// ─── [1] The broadcast row carries no real identity ──────────────────────────

test("the analytics upsert writes NULL for fastest_user_id, forever", () => {
  const insert = MIGRATION.slice(
    MIGRATION.indexOf("INSERT INTO public.live_question_analytics"),
    MIGRATION.indexOf("RETURNING * INTO result")
  );
  assert(
    insert.includes("v_fastest_time, NULL, v_fastest_pid, v_fastest_name"),
    "the INSERT must write NULL where the real UUID used to go"
  );
  assert(
    insert.includes("fastest_user_id     = NULL"),
    "the ON CONFLICT arm must also null it, or an update resurrects the leak"
  );
  assert(
    insert.includes("fastest_participant_id = EXCLUDED.fastest_participant_id"),
    "the participant row id must be carried on update"
  );
});

test("history is scrubbed, not just future writes", () => {
  assert(
    /UPDATE public\.live_question_analytics\s+SET fastest_user_id = NULL\s+WHERE fastest_user_id IS NOT NULL/.test(
      MIGRATION
    ),
    "existing rows must lose their real UUIDs"
  );
  assert(
    MIGRATION.includes("SET fastest_participant_id = lp.id"),
    "existing rows must be backfilled with the participant id before the scrub"
  );
  assert(
    MIGRATION.includes("historical fastest_user_id values survived the scrub"),
    "the self-check must prove the scrub ran"
  );
});

test("analytics reads narrow from any-authenticated to the room", () => {
  assert(
    MIGRATION.includes(
      'DROP POLICY IF EXISTS "Anyone can view analytics of live exams"'
    ),
    "the open policy must be dropped"
  );
  const policy = MIGRATION.slice(
    MIGRATION.indexOf('CREATE POLICY "Room members can view analytics of live exams"'),
    MIGRATION.indexOf("-- ============================================================\n-- 2.")
  );
  assert(
    policy.includes("le.user_id = auth.uid()") &&
      policy.includes("lp.user_id = auth.uid()"),
    "the replacement must admit exactly the creator and the room's participants"
  );
});

// ─── [2] The shared report ships no real ids ─────────────────────────────────

test("the token path masks every id the way it already masked names", () => {
  const tokenFn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.get_live_exam_report_by_token")
  );
  assert(
    tokenFn.includes("live_report_masked_ids(v_exam.id, v_payload, NOT v_exam.privacy_mode)"),
    "the token read must go through the id-masking wrapper"
  );
  const masker = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.live_report_masked_ids"),
    MIGRATION.indexOf("REVOKE EXECUTE ON FUNCTION public.live_report_masked_ids")
  );
  assert(
    masker.includes("- 'user_id'"),
    "attendance and moments must lose their real user_id"
  );
  assert(
    masker.includes("t.e - 'joined_at'"),
    "join times must be stripped while privacy mode is on (they decode the pseudonyms)"
  );
  assert(
    masker.includes("jsonb_object_agg(t.key, t.name)"),
    "the names map must be re-keyed by the opaque key, not the auth UUID"
  );
});

test("the masking is proven on a synthetic payload at apply time", () => {
  assert(
    MIGRATION.includes("a real user_id survived masking"),
    "the self-check must feed a fake UUID through and assert it vanishes"
  );
  assert(
    MIGRATION.includes("joined_at survived the privacy-mode report"),
    "the self-check must prove joined_at is stripped"
  );
});

test("the creator's own report path is untouched", () => {
  assert(
    !MIGRATION.includes("FUNCTION public.get_live_exam_report(p_live_exam_id"),
    "get_live_exam_report must not be redefined — the owner's screen keeps real ids"
  );
});

// ─── [3] Join times no longer decode the pseudonyms ─────────────────────────

test("live_participants_public masks joined_at like it masks user_id", () => {
  const view = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE VIEW public.live_participants_public"),
    MIGRATION.indexOf("REVOKE ALL ON public.live_participants_public")
  );
  assert(
    /CASE\s+WHEN NOT le\.privacy_mode THEN r\.joined_at\s+WHEN r\.user_id = auth\.uid\(\) THEN r\.joined_at\s+ELSE NULL\s+END AS joined_at/.test(
      view
    ),
    "your own join time stays; everyone else's is NULL under privacy mode"
  );
  assert(
    view.includes("ORDER BY lp.joined_at, lp.id"),
    "the ordinal must STAY join-ordered (append-only) — pseudonyms must never reshuffle mid-session"
  );
});

// ─── [4] The creator's deck still resolves real names, both generations ─────

test("the service map answers to both the participant id and the user id", () => {
  assert(
    SERVICE.includes('select("id, user_id, display_name")'),
    "fetchParticipantNames must fetch the participant row id too"
  );
  assert(
    SERVICE.includes("map.set(r.user_id, r.display_name)") &&
      SERVICE.includes("map.set(r.id, r.display_name)"),
    "one map, keyed by both ids, so old and new analytics rows both resolve"
  );
});

test("the control room tries the participant id first, then falls back", () => {
  assert(
    CONTROL.includes("participantNames.get(a.fastest_participant_id)"),
    "the featured-fastest memo must resolve via the new id"
  );
  assert(
    /participantNames\.get\(a\.fastest_user_id\)/.test(CONTROL),
    "the old-row fallback must survive (rows written before the migration)"
  );
  assert(
    CONTROL.includes("participantNames.get(previewAnalytics.fastest_participant_id)"),
    "the preview panel must resolve via the new id too"
  );
});

test("the types make the new column optional — stale caches serve old shapes", () => {
  assert(
    SERVICE.includes("fastest_participant_id?: string | null"),
    "the service type must tolerate the column being absent until caches refresh"
  );
  assert(
    TYPES.includes("fastest_participant_id: string | null"),
    "the generated Row type must know the column"
  );
});

// ─── Results ────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  • ${f.name}\n    ${f.error}`);
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("─".repeat(60) + "\n");
