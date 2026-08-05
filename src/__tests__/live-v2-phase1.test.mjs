/**
 * LIVE EXAM v2 — PHASE 1 REGRESSION SUITE
 *
 * Run with: node src/__tests__/live-v2-phase1.test.mjs
 *
 * Phase 1 is mostly a safety feature, and safety features fail silently: nothing
 * throws when an answer key reaches a projector or a real name reaches a
 * student. So most of these are structural assertions about paths that must NOT
 * exist, which is the only kind of test that can catch a leak before a class
 * does.
 *
 * Covers:
 *  [1] A2  present screen cannot render an answer, a toast, or a real name
 *  [2] E4  no toaster is mounted on the present route
 *  [3] E1  masking is enforced in the database, not the client
 *  [4] E3  leaderboard visibility is enforced in the view
 *  [5] A1  the join panel replaced the modal
 *  [6] Q2  both windows can restore the other
 *  [7] Deploy safety: the two-step privacy rollout
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

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(resolve(ROOT, "supabase", "migrations", filename), "utf-8");
}

/**
 * Assertions about paths that must not exist have to read code, not prose.
 * Several comments on these screens name the very identifiers the tests below
 * forbid — that is what a comment explaining a leak looks like.
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PRIVACY_SQL = readMigration("20260803000000_live_v2_privacy.sql");
const STEP2_SQL = readMigration("20260803010000_live_v2_privacy_step3.sql");
const REMASK_SQL = readMigration("20260803020000_live_v2_privacy_remask_trigger.sql");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const APP = readSrc("App.tsx");

// ─── [1] The present screen cannot leak ─────────────────────────────────────
console.log("\n[1] A2 — the projector view has no path to a secret");

test("it reads questions from the student view, which has no correct_answer column", () => {
  assert(
    /fetchAllLiveQuestionsStudent/.test(PRESENT),
    "must use the student question view"
  );
  assert(
    !/fetchAllLiveQuestions\(/.test(PRESENT),
    "the creator fetch includes correct_answer — a bug away from projecting the key"
  );
});

test("the only answer key it can reach is one the server has already released", () => {
  // Until Q15b this read "it never fetches revealed answers", because the wall had
  // no reason to hold a key at all. The creator can now ask for the answer to be
  // shown once time is up, so the property is stated where it actually lives: the
  // page may not touch the raw column, and the one function it may use is the one
  // that will not return a question's answer before that question's deadline.
  const code = stripComments(PRESENT);
  assert(
    !/correct_answer/.test(code),
    "the raw column must never be read here — it is not gated on anything"
  );
  assert(
    /fetchRevealedAnswers/.test(code),
    "get_revealed_live_answers is the only permitted path to a key"
  );
});

test("no option can be rendered as correct while its question is open", () => {
  const code = stripComments(PRESENT);
  assert(
    !/correct-picked|correct-missed|wrong-picked/.test(code),
    "those visuals describe a key against ONE person's answer; a wall has no answer of its own"
  );
  // The neutral pin is now conditional, so what matters is what can lift it.
  assert(
    /answerKey !== undefined && isOptionInAnswer\(i, answerKey\)/.test(code),
    "the only thing that may mark an option is the revealed key"
  );
  assert(
    /revealAnswer && question && \(isRevealing \|\| isEnded\)/.test(code),
    "and that key must be withheld locally too, unless the question is locked or the session is over"
  );
});

test("it reads the MASKED participant view, never the base table", () => {
  assert(
    /fetchPublicLeaderboard/.test(PRESENT),
    "standings must come from the masked view"
  );
  assert(
    !/fetchLeaderboard\(/.test(PRESENT),
    "the present window is authenticated as the creator; the base table would put real names on the wall"
  );
});

test("it shows no per-student private signal", () => {
  for (const forbidden of ["confusionCount", "coachLine", "participantNames"]) {
    assert(
      !new RegExp(forbidden).test(PRESENT),
      `${forbidden} is creator-only and must not reach the projector`
    );
  }
});

test("standings on the wall obey both the E3 setting and the present toggle", () => {
  assert(
    /session\.presentShowLeaderboard/.test(PRESENT) &&
      /session\.leaderboardVisibility === "full"/.test(PRESENT),
    "the projector is what the room sees, so 'private' must hide it there too"
  );
});

// ─── [2] E4 — toasts ────────────────────────────────────────────────────────
console.log("\n[2] E4 — no toaster exists on the present route");

test("the present route sits under its own layout", () => {
  assert(/const PresentLayout = \(\)/.test(APP), "PresentLayout must exist");
  assert(
    /element: <PresentLayout \/>/.test(APP),
    "the present route must be mounted under it"
  );
});

test("that layout mounts neither Toaster nor Sonner", () => {
  const start = APP.indexOf("const PresentLayout");
  const end = APP.indexOf(");", APP.indexOf("</>", start));
  const body = APP.slice(start, end);
  assert(!/<Toaster/.test(body), "a toast would render on the wall");
  assert(!/<Sonner/.test(body), "a sonner toast would render on the wall");
});

test("the present page raises no toasts of its own", () => {
  assert(
    !/useToast|toast\(/.test(PRESENT),
    "there is nowhere for them to render, so calling toast() would silently lose the error"
  );
});

// ─── [3] E1 — masking lives in the database ─────────────────────────────────
console.log("\n[3] E1 — privacy is enforced by the database, not the client");

test("pseudonyms come from join order, not a hash of user_id", () => {
  assert(
    /ROW_NUMBER\(\) OVER \(\s*PARTITION BY lp\.live_exam_id/.test(PRIVACY_SQL),
    "ordinal must come from join order"
  );
  assert(
    !/md5|hashtext/i.test(PRIVACY_SQL),
    "hashing into 2304 names collides constantly past ~60 students (birthday problem)"
  );
});

test("the name lists are 48 x 48, giving 2304 collision-free names", () => {
  // Sliced from each ARRAY[ to its own label, so the two blocks cannot overlap.
  const adjBlock = PRIVACY_SQL.slice(
    PRIVACY_SQL.indexOf("ARRAY["),
    PRIVACY_SQL.indexOf("] AS adjectives")
  );
  const aniBlock = PRIVACY_SQL.slice(
    PRIVACY_SQL.indexOf("ARRAY[", PRIVACY_SQL.indexOf("AS adjectives")),
    PRIVACY_SQL.indexOf("] AS animals")
  );
  const words = (s) => (s.match(/'[A-Za-z]+'/g) || []).map((w) => w.slice(1, -1));
  const adj = words(adjBlock);
  const ani = words(aniBlock);

  assert(adj.length === 48, `expected 48 adjectives, found ${adj.length}`);
  assert(ani.length === 48, `expected 48 animals, found ${ani.length}`);
  // Duplicates inside a list silently shrink the namespace, which is the failure
  // mode that produces two students sharing a pseudonym in one room.
  assert(new Set(adj).size === 48, "duplicate adjective shrinks the namespace");
  assert(new Set(ani).size === 48, "duplicate animal shrinks the namespace");
  // The index arithmetic must match the list length, or names wrap early and
  // collide long before 2304 participants.
  assert(
    (PRIVACY_SQL.match(/% 48 \+ 1/g) || []).length === 2,
    "both indices must be modulo the real list length"
  );
});

test("the pseudonym index produces 2304 distinct pairs, matching the SQL maths", () => {
  // Mirrors live_anon_name: adj[(n / 48) % 48], animal[n % 48].
  const seen = new Set();
  for (let n = 0; n < 2304; n++) {
    seen.add(`${Math.floor(n / 48) % 48}-${n % 48}`);
  }
  assert(seen.size === 2304, `expected 2304 distinct pairs, got ${seen.size}`);
});

test("masking applies to the creator too — the present window is creator-authed", () => {
  const viewStart = PRIVACY_SQL.indexOf("CREATE OR REPLACE VIEW public.live_participants_public");
  const viewEnd = PRIVACY_SQL.indexOf("GRANT SELECT ON public.live_participants_public");
  const view = PRIVACY_SQL.slice(viewStart, viewEnd);
  // A creator exemption in the CASE would put real names on the projector.
  const maskCase = view.slice(view.indexOf("CASE"), view.indexOf("END AS display_name"));
  assert(
    !/le\.user_id = auth\.uid\(\)/.test(maskCase),
    "a creator exemption inside the masking branch would project real names"
  );
});

test("the student page reads the masked view for every leaderboard fetch", () => {
  assert(
    !/[^c]fetchLeaderboard\(/.test(STUDENT),
    "the student page must never touch the base participant table"
  );
  assert(/fetchPublicLeaderboard\(/.test(STUDENT), "must use the masked view");
});

test("the realtime leak is closed at the stored value, the only place it can be", () => {
  const fn = PRIVACY_SQL.slice(
    PRIVACY_SQL.indexOf("FUNCTION public.compute_live_question_analytics")
  );
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    /IF v_privacy THEN/.test(body) && /live_anon_name/.test(body),
    "fastest_user_name is broadcast to every student; the stored value must already be safe"
  );
});

test("the creator still recovers real names, from the id rather than the name", () => {
  assert(
    /fetchParticipantNames/.test(CONTROL),
    "the control room needs a user_id → real name map"
  );
  assert(
    /participantNames\.get\(a\.fastest_user_id\)/.test(CONTROL),
    "the creator's deck must resolve the real name from fastest_user_id"
  );
});

test("existing rows are re-masked, not left leaking", () => {
  assert(
    /UPDATE public\.live_question_analytics/.test(PRIVACY_SQL),
    "a session that ran before this migration has real names in a student-readable row"
  );
});

test("re-masking is an invariant, not a one-time migration statement", () => {
  // The bug verify_phase1.sql check 11 caught in production: masking at compute
  // time plus a migration back-fill still leaves rows written BEFORE a creator
  // turned privacy on, and those are readable — and pushed — to every student.
  assert(
    /CREATE TRIGGER trg_live_privacy_mode_changed/.test(REMASK_SQL),
    "privacy_mode can be flipped from the control room, another client or the SQL editor; only a trigger covers all of them"
  );
  assert(
    /live_refresh_fastest_names/.test(REMASK_SQL),
    "the re-derivation must live in one reusable function"
  );
});

test("the re-mask trigger cannot fire on an ordinary unlock", () => {
  // live_exams is UPDATEd on every unlock (index, unlocked_at, extra seconds).
  assert(
    /AFTER UPDATE OF privacy_mode ON public\.live_exams/.test(REMASK_SQL),
    "must be column-scoped"
  );
  assert(
    /WHEN \(OLD\.privacy_mode IS DISTINCT FROM NEW\.privacy_mode\)/.test(REMASK_SQL),
    "must also guard on the value actually changing, or every unlock rescans the exam's analytics"
  );
});

test("re-masking works in both directions", () => {
  assert(
    /WHEN v_privacy THEN public\.live_anon_name\(o\.ord\)\s*\n\s*ELSE o\.display_name/.test(REMASK_SQL),
    "turning privacy OFF must restore real names, or past sessions stay pseudonymised forever"
  );
});

test("a no-op toggle does not broadcast to the whole room", () => {
  assert(
    /IS DISTINCT FROM \(/.test(REMASK_SQL),
    "live_question_analytics is in the realtime publication; rewriting unchanged rows would push one message per question to every student"
  );
});

test("an unresolvable participant is blanked rather than left named", () => {
  assert(
    /SET fastest_user_name = NULL/.test(REMASK_SQL),
    "if the participant row is gone we cannot prove the stored name is safe"
  );
});

// ─── [4] E3 ─────────────────────────────────────────────────────────────────
console.log("\n[4] E3 — leaderboard visibility");

test("'private' and 'off' collapse the view to the caller's own row", () => {
  assert(
    /le\.leaderboard_visibility = 'full'\s*\n\s*OR r\.user_id = auth\.uid\(\)/.test(PRIVACY_SQL),
    "hiding standings only in the UI leaves them one request away"
  );
});

test("ranks are still computed when the leaderboard is off", () => {
  // compute_live_rankings must not be gated on visibility anywhere.
  assert(
    !/leaderboard_visibility[^\n]*compute_live_rankings/.test(PRIVACY_SQL),
    "turning the display off must not cost the creator their data or the report"
  );
});

// ─── [5] A1 ─────────────────────────────────────────────────────────────────
console.log("\n[5] A1 — the join panel replaced the modal");

test("the blocking Share dialog is gone from the control room", () => {
  assert(
    !/showShareDialog/.test(CONTROL),
    "the modal covered the timer, the unlock button and the leaderboard"
  );
});

test("the HUD is pinnable and persists across late arrivals", () => {
  assert(/hudPinned/.test(CONTROL), "the panel must be pinnable");
  assert(/<PresenterHud/.test(CONTROL), "the HUD must be rendered");
});

test("the share code is typographically larger than the QR on the projector", () => {
  const hud = readSrc("components/live/PresenterHud.tsx");
  assert(
    /text-\[2\.5rem\]/.test(hud),
    "camera autofocus fails on a bright projected surface from the back row; the code is the fallback"
  );
  assert(/groupCode/.test(hud), "the code must be grouped so it can be read aloud");
});

// ─── [6] Q2 ─────────────────────────────────────────────────────────────────
console.log("\n[6] Q2 — either window can restore the other");

test("both windows expose a way back to the other", () => {
  assert(/openPeer/.test(CONTROL), "the control room must be able to open the wall");
  assert(/openPeer/.test(PRESENT), "the wall must be able to reopen the cockpit");
});

test("the present screen stands alone rather than mirroring the control room", () => {
  assert(
    /useLiveSession/.test(PRESENT) && /fetchLiveExam/.test(PRESENT),
    "it must read the session itself, or closing the cockpit blanks the projector"
  );
});

test("the channel carries intents only, never session state", () => {
  const chan = readSrc("lib/live/presentChannel.ts");
  for (const forbidden of ["currentQuestionIndex", "unlockedAt", "status"]) {
    assert(
      !new RegExp(`${forbidden}[?]?:`).test(chan),
      `${forbidden} over the channel lets the two windows disagree — and the projector would be the stale one`
    );
  }
});

test("peer presence expires, because a crashed window never says goodbye", () => {
  const peer = readSrc("hooks/usePeerWindow.ts");
  assert(/PEER_TTL_MS/.test(peer), "presence must time out");
  assert(/pagehide/.test(peer), "and say goodbye when it can");
});

test("the peer window is opened by name so a second click cannot duplicate it", () => {
  const peer = readSrc("hooks/usePeerWindow.ts");
  assert(
    /window\.open\(peerUrl, peerWindowName\)/.test(peer),
    "a duplicate projector window is the worst outcome — the creator cannot tell which is on the wall"
  );
});

// ─── [7] Deploy safety ──────────────────────────────────────────────────────
console.log("\n[7] Two-step privacy deploy");

test("step 1 does NOT drop the old policy", () => {
  assert(
    !/DROP POLICY[^\n]*Participants can view leaderboard/.test(PRIVACY_SQL),
    "dropping it in step 1 blanks the leaderboard of every student tab open at deploy time"
  );
});

test("step 2 drops it, and refuses if the creator policy is missing", () => {
  assert(
    /DROP POLICY IF EXISTS "Participants can view leaderboard"/.test(STEP2_SQL),
    "step 2 must close the old door"
  );
  assert(
    /RAISE EXCEPTION/.test(STEP2_SQL) && /Creator can view all participants/.test(STEP2_SQL),
    "it must refuse rather than leave the creator with no leaderboard at all"
  );
});

test("the projector never scrolls: question text is measured to fit", () => {
  assert(/useFitText/.test(PRESENT), "a projector audience has no scrollbar");
  const fit = readSrc("hooks/useFitText.ts");
  assert(
    /useLayoutEffect/.test(fit),
    "measuring after paint would flash every question at maximum size first"
  );
  assert(
    /\[token\]/.test(fit),
    "measurement must be keyed to the question, never run on a timer or a countdown tick"
  );
});

test("the measured size actually reaches the text", () => {
  // The bug this guards: LiveQuestionBody hard-coded `text-[15px] sm:text-base`,
  // which beats an inherited font-size. The fit hook computed a size, set it on
  // the wrapper, and the question still rendered at fifteen pixels on a wall.
  assert(
    /<LiveQuestionBody text=\{question\.text\} display \/>/.test(PRESENT),
    "the question body must be in display mode or it ignores the measured size"
  );
  assert(/display\s*\/?>/.test(PRESENT.slice(PRESENT.indexOf("<LiveOption"))), "options too");

  const body = readSrc("components/live/LiveQuestionBody.tsx");
  assert(
    /const bodySize = display \? "" :/.test(body),
    "display mode must emit NO font-size class, so the container's size is inherited"
  );

  const option = readSrc("components/live/LiveOption.tsx");
  assert(
    /display\s*\?\s*"h-\[1\.5em\]/.test(option),
    "option sizing must be em-based in display mode, or the row stays small while the question grows"
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
