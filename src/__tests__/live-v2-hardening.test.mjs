/**
 * LIVE EXAM v2 — SECURITY & CORRECTNESS HARDENING
 *
 * Run with: node src/__tests__/live-v2-hardening.test.mjs
 *
 * Everything here was found by an adversarial audit of ALREADY SHIPPED Phase 0
 * and Phase 1 code, and every one was verified against the live database rather
 * than inferred. They share one shape: a broadcast or a derivation was moved, and
 * a downstream consumer still assumed the old behaviour.
 *
 * That shape is why these are static assertions about things that must NOT be
 * true. None of the four blockers threw an error, failed a typecheck, or broke a
 * test — a leaked phone number and a defeated privacy mode both look exactly like
 * working software.
 *
 * Covers:
 *  [1] profiles was world-readable, including phone_number, to anonymous callers
 *  [2] privacy mode was defeated by the masked view projecting the join key
 *  [3] the running score leaked correctness mid-question
 *  [4] out-of-order sync replies wiped a student's answer
 *  [5] a socket dying mid-session left the client on the slow keep-alive
 *  [6] pull-lane students never received analytics at all
 *  [7] the creator saw pseudonyms on their own private deck
 *  [8] the projector never re-fitted after a display change
 *  [9] thundering herds the first fix missed
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

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");
const readMigration = (f) => readFileSync(resolve(ROOT, "supabase", "migrations", f), "utf-8");

const HARDENING_SQL = readMigration("20260803030000_live_v2_privacy_hardening.sql");
const SESSION = readSrc("hooks/useLiveSession.ts");
const REALTIME = readSrc("hooks/useLiveExamRealtime.ts");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const FITTEXT = readSrc("hooks/useFitText.ts");
const LEADERBOARD = readSrc("components/live/LiveLeaderboard.tsx");

// ─── [1] profiles ───────────────────────────────────────────────────────────
console.log("\n[1] profiles was readable by the anonymous internet");

test("the blanket public-read policy is dropped", () => {
  assert(
    /DROP POLICY IF EXISTS "Public profiles are viewable by everyone\." ON public\.profiles/.test(
      HARDENING_SQL
    ),
    "`for select using (true)` on a table holding full_name and phone_number"
  );
});

test("it is replaced by an own-row policy, not merely narrowed to authenticated", () => {
  assert(
    /CREATE POLICY "Users can view own profile"[\s\S]{0,200}USING \(auth\.uid\(\) = id\)/.test(
      HARDENING_SQL
    ),
    "restricting to `authenticated` would still expose every user to every other user"
  );
});

test("the only app read of profiles is own-row, so nothing depended on the wider grant", () => {
  const svc = readSrc("services/liveExamService.ts");
  const reads = (svc.match(/from\("profiles"\)/g) || []).length;
  assert(reads === 1, `expected exactly 1 read of profiles, found ${reads}`);
  const block = svc.slice(svc.indexOf('from("profiles")'), svc.indexOf('from("profiles")') + 220);
  assert(
    /\.eq\("id", user\.id\)/.test(block),
    "that read must be scoped to the caller's own row"
  );
});

// ─── [2] privacy mode ───────────────────────────────────────────────────────
console.log("\n[2] privacy mode was defeated by two requests");

test("the masked view no longer hands out other people's user_id", () => {
  const viewStart = HARDENING_SQL.indexOf("CREATE OR REPLACE VIEW public.live_participants_public");
  const view = HARDENING_SQL.slice(viewStart);
  assert(
    /WHEN NOT le\.privacy_mode THEN r\.user_id\s*\n\s*WHEN r\.user_id = auth\.uid\(\) THEN r\.user_id\s*\n\s*ELSE NULL/.test(
      view
    ),
    "user_id is the join key back to a real identity; masking the name without it achieved nothing"
  );
});

test("the caller still gets their OWN user_id, so 'you' can still be highlighted", () => {
  assert(
    /WHEN r\.user_id = auth\.uid\(\) THEN r\.user_id/.test(HARDENING_SQL),
    "masking every row would break the isMe check"
  );
});

test("anon loses access to the leaderboard view entirely", () => {
  assert(
    /REVOKE ALL ON public\.live_participants_public FROM anon/.test(HARDENING_SQL),
    "joining requires an account, so an anonymous caller has no business reading a leaderboard"
  );
  assert(
    /GRANT SELECT ON public\.live_participants_public TO authenticated/.test(HARDENING_SQL),
    "authenticated students must keep access"
  );
});

test("nothing keys a React list off the now-nullable user_id", () => {
  assert(/key=\{p\.id\}/.test(LEADERBOARD), "LiveLeaderboard must key on the participant row id");
  assert(!/key=\{p\.user_id\}/.test(LEADERBOARD), "user_id is NULL for other rows under privacy mode");
  assert(/key=\{p\.id\}/.test(PRESENT), "the present screen must too");
  assert(
    !/key=\{p\.user_id\}/.test(PRESENT),
    "the present screen authenticates as the creator, who is not a participant, so EVERY row's user_id is NULL there"
  );
});

// ─── [3] mid-question correctness ───────────────────────────────────────────
console.log("\n[3] the running score leaked correctness mid-question");

test("rank and score are withheld while a question is open", () => {
  assert(
    /v_score_visible := \(\s*\n\s*v_exam\.status = 'ended'/.test(HARDENING_SQL),
    "a score that moves is the same information as an is_correct flag"
  );
  assert(
    /IF v_score_visible THEN\s*\n\s*SELECT rank, total_correct/.test(HARDENING_SQL),
    "the read itself must be gated, not just the output"
  );
});

test("the client is told the difference between withheld and genuinely zero", () => {
  assert(/'score_visible'/.test(HARDENING_SQL), "the payload must carry the flag");
  assert(/score_visible: boolean/.test(readSrc("services/liveExamService.ts")), "typed");
  assert(
    /next\.scoreVisible === false \? cur\.myRank/.test(SESSION),
    "a withheld value must keep the previous one — blanking a score mid-question reads as 'you lost your points'"
  );
});

// ─── [4] out-of-order observations ──────────────────────────────────────────
console.log("\n[4] a stale sync reply wiped the student's answer");

test("observations carry a server-time watermark", () => {
  assert(/observedAtRef/.test(SESSION), "there must be a watermark");
  assert(
    /if \(lane === "poll" && stampMs > 0 && stampMs < observedAtRef\.current\) return;/.test(SESSION),
    "a poll reply older than one already applied must be dropped"
  );
});

test("the guard keys on time, not on index direction", () => {
  // Keying on direction would suppress a real A10 rewind, which is the whole
  // point of Phase 2.
  assert(
    /lane: ObservationLane, stampMs: number/.test(SESSION),
    "applyObservation must take the lane and the stamp"
  );
  // Comment prose wraps and carries backticks, so match on a normalised copy
  // rather than the raw source.
  const prose = SESSION.replace(/[`*]/g, "").replace(/\s+/g, " ");
  assert(
    /refresh\(\) deliberately bypasses the in-flight guard/.test(prose),
    "the reason several syncs are in flight should be documented where the guard is"
  );
  assert(
    /keys on TIME, not on direction/.test(prose),
    "the choice of watermark over direction should be justified, since direction is what A10 needs"
  );
});

test("push events are trusted rather than watermarked out", () => {
  assert(
    /\}, "push", clockRef\.current\.serverNow\(\)\)/.test(SESSION),
    "realtime is delivered in order on one channel and is current by definition"
  );
});

// ─── [5] transport death ────────────────────────────────────────────────────
console.log("\n[5] a socket dying mid-session stranded the client");

test("a drop is reported even after a successful subscribe", () => {
  assert(
    !/if \(!hadSubscribed\) \{\s*\n\s*consecutiveFailures/.test(REALTIME),
    "only reporting never-subscribed channels leaves a mid-session death undetected"
  );
  assert(
    /consecutiveFailures \+= 1;/.test(REALTIME),
    "the failure counter must advance on any drop"
  );
});

// ─── [6] pull-lane analytics ────────────────────────────────────────────────
console.log("\n[6] pull-lane students never received analytics");

test("there is a fallback fetch when no analytics arrive for a closed question", () => {
  assert(
    /analyticsRef\.current\.has\(expiredIndex\)/.test(STUDENT),
    "onAnalytics is push-lane only; Lane B exists for the students who cannot hold a socket"
  );
  assert(
    /fetchAllAnalytics\(ex\.id\)/.test(STUDENT),
    "the fallback must actually fetch them"
  );
});

test("the fallback is late and jittered, so push-lane students skip it", () => {
  assert(
    /\}, 4000 \+ Math\.random\(\) \* LEADERBOARD_SPREAD_MS\);/.test(STUDENT),
    "an unconditional immediate fetch would double the work for everyone who did not need it"
  );
});

// ─── [7] the creator's own deck ─────────────────────────────────────────────
console.log("\n[7] the creator saw pseudonyms on their own private deck");

test("the name map loads regardless of exam status", () => {
  const load = CONTROL.slice(CONTROL.indexOf("const loadData"), CONTROL.indexOf("const loadDataRef"));
  const namesAt = load.indexOf("fetchParticipantNames");
  const branchAt = load.indexOf('examData.status === "live"');
  assert(namesAt > 0, "the map must be fetched in loadData");
  assert(
    namesAt > branchAt,
    "it must sit OUTSIDE the live/ended branch — the normal route in is editor -> control room while status is still 'published'"
  );
});

test("it refreshes on unlock, so a late joiner is not stuck as a pseudonym", () => {
  assert(
    /onUnlock: \(\) => \{[\s\S]{0,220}fetchParticipantNames/.test(CONTROL),
    "the map is otherwise only fetched on mount"
  );
});

// ─── [8] the projector ─────────────────────────────────────────────────────
console.log("\n[8] the projector never re-fitted after a display change");

test("the resize observer re-attaches when the container appears", () => {
  assert(
    /\}, \[opts\.resizeDebounceMs, token\]\);/.test(FITTEXT),
    "the container is conditionally rendered, so a constant dep list ran the effect once against a null ref and never again"
  );
});

// ─── [9] remaining herds and memo defeats ──────────────────────────────────
console.log("\n[9] herds and memo defeats the first pass missed");

test("the reveal retry is jittered too, not just the leaderboard", () => {
  const fixed = (STUDENT.match(/setTimeout\(refreshReveal, 2500\)/g) || []).length;
  assert(fixed === 0, "a flat 2500ms retry is as synchronised as the burst it follows");
  assert(
    (STUDENT.match(/2500 \+ Math\.random\(\) \* LEADERBOARD_SPREAD_MS/g) || []).length >= 2,
    "both reveal retry sites must be scattered"
  );
});

test("the student's rail callback is stable", () => {
  assert(
    /const handleChipClick = useCallback\(/.test(STUDENT),
    "a plain function body is a new prop identity every render, defeating QuestionRail's memo"
  );
});

test("the projector's config intent is consumed", () => {
  assert(
    /intent\.t === "config"/.test(PRESENT),
    "the control room posts it and claims an instant preview; nothing was listening"
  );
  assert(
    /configPreview\.showLeaderboard \?\? session\.presentShowLeaderboard/.test(PRESENT),
    "the preview must actually affect what renders"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exitCode = 1;
}
console.log(`${"─".repeat(60)}\n`);
