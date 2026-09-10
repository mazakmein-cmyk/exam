/**
 * LIVE EXAMS — THE HIGHLIGHTS FEED OBEYS THE STANDINGS SETTING
 *
 * Run with: node src/__tests__/live-moments-respect-visibility.test.mjs
 *
 * WHAT WAS BROKEN (doc #30)
 * get_live_moments is granted to every authenticated user and, once inside,
 * asked exactly two questions: does this exam exist, and is it live or ended.
 * It never read leaderboard_visibility — the string did not appear in the
 * function at all — and never checked that the caller was in the room.
 *
 * So a creator who set standings to "Off" (labelled "No ranking shown to
 * anyone") still handed out, per question, who was on a streak, who came back
 * from a bad run, and who was first in the class to go perfect. By real name,
 * unless privacy mode also happened to be on — and hiding the standings does
 * NOT turn privacy mode on. Two settings that read as if they do the same job;
 * only one was consulted.
 *
 * No student PAGE renders moments, which is small comfort: every student's
 * browser holds the exam id and the publishable key, which is all it takes to
 * ask directly. Same argument 20260812000000 made about my_rank — "a ranking
 * hidden by a component is one devtools request away from being read".
 *
 * WHAT 'private' AND 'off' MEAN
 * Taken from 20260812000000, not invented here. Its floor, which
 * live_participants_public has always applied, is that BOTH collapse the room to
 * the caller's own row; 'off' then additionally strips the rank. A moment
 * carries no rank, so there is nothing extra for 'off' to remove and the two
 * behave identically. Keeping them identical is a consistency decision — making
 * 'off' mean "not even your own" would be a new behaviour invented in a bug fix.
 *
 * THE DIRECTION THAT MATTERS MOST
 * An over-tight gate here does not read as a privacy fix. It reads as "the
 * highlights panel is empty", on the creator's own projector, mid-session, with
 * nothing logged anywhere. Half of what follows guards that.
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

const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
const MIG = read("supabase/migrations/20260849000000_live_moments_respect_standings_visibility.sql");
/** Only executable text proves a gate exists; comments merely describe one. */
const CODE = MIG.replace(/--[^\n]*/g, "");
const CONTROL = read("src/pages/LiveExamControl.tsx");
const PRESENT = read("src/pages/LiveExamPresent.tsx");

console.log("\n══ Live exams: highlights follow the standings setting ══");

// ─── [1] The gate that was missing ──────────────────────────────────────────
console.log("\n[1] The setting is finally read");

test("leaderboard_visibility is consulted", () => {
  assert(
    /leaderboard_visibility/.test(CODE),
    "the string did not appear anywhere in this function before; that WAS the bug"
  );
});

test("'private' and 'off' both collapse to the caller's own moments", () => {
  assert(
    /IN \('private', 'off'\)/.test(CODE),
    "both settings share the floor live_participants_public has always applied"
  );
  assert(
    /v_own_only := true;/.test(CODE),
    "the decision should be made once, in a named flag, not repeated in the query"
  );
});

test("an unrecognised setting defaults to showing everything, not to hiding", () => {
  assert(
    /COALESCE\(v_exam\.leaderboard_visibility, 'full'\)/.test(CODE),
    "a NULL column must not silently blank the creator's projector; 'full' is the column's own default"
  );
});

test("the row filter matches the flag", () => {
  assert(
    /NOT v_own_only\s*OR lm\.user_id IS NULL\s*OR lm\.user_id = v_uid/.test(CODE),
    "the flag is decoration unless the query uses it"
  );
});

test("moments attached to nobody stay visible", () => {
  assert(
    /lm\.user_id IS NULL/.test(CODE),
    "there is no person in a class-level moment to expose, and dropping it would blank those highlights for no gain"
  );
});

// ─── [2] Being signed in is not being in the room ───────────────────────────
console.log("\n[2] Only the room can read the room");

test("there is a membership test", () => {
  assert(
    /FROM public\.live_participants\s*WHERE live_exam_id = p_live_exam_id AND user_id = v_uid/.test(CODE),
    "without it, anyone holding the exam id — a forwarded link, a screenshot of the URL — can read the room's highlights"
  );
});

test("an anonymous caller gets nothing", () => {
  assert(
    /IF v_uid IS NULL THEN\s*RETURN;/.test(CODE),
    "auth.uid() is null for an unauthenticated caller, and null compares to nothing — the membership test would silently pass no rows but the visibility flag would read as 'creator absent'"
  );
});

// ─── [3] The creator must lose nothing ──────────────────────────────────────
console.log("\n[3] The creator's own screens are untouched");

test("the creator bypasses both new gates", () => {
  assert(
    /IF NOT v_is_creator AND NOT EXISTS/.test(CODE),
    "the creator is not a participant in their own exam — joinLiveExam deliberately never inserts them — so a membership test without this exception blanks their projector"
  );
  assert(
    /IF NOT v_is_creator\s*AND COALESCE\(v_exam\.leaderboard_visibility/.test(CODE),
    "the standings setting is about what the ROOM sees, never about what the host sees"
  );
});

test("both creator surfaces still read this function", () => {
  assert(/fetchLiveMoments/.test(CONTROL), "the control room's highlights panel");
  assert(/fetchLiveMoments/.test(PRESENT), "the projector's highlights panel");
});

test("no client change was needed", () => {
  // Both callers authenticate as the creator, so the gates never fire for them.
  for (const [name, src] of [["control room", CONTROL], ["projector", PRESENT]]) {
    assert(/role: "creator"/.test(src), `${name} must authenticate as the creator`);
  }
});

// ─── [4] Everything that was already right ──────────────────────────────────
console.log("\n[4] The rewrite kept what worked");

test("privacy-mode pseudonyms survive", () => {
  assert(
    /WHEN v_exam\.privacy_mode THEN public\.live_anon_name\(o\.ord\)/.test(CODE),
    "this is a separate setting and it was already correct; losing it would expose real names again"
  );
  assert(
    /ROW_NUMBER\(\) OVER \(ORDER BY p\.joined_at, p\.id\) - 1/.test(CODE),
    "the pseudonym must stay the same string a student sees on the leaderboard"
  );
});

test("the user id is still withheld from everyone but the creator", () => {
  assert(
    /CASE WHEN v_is_creator THEN lm\.user_id ELSE NULL END/.test(CODE),
    "it maps back to a real person"
  );
});

test("the ordering survives", () => {
  assert(/ORDER BY lm\.question_ordinal, lm\.priority/.test(CODE), "the panel reads in question order");
});

// ─── [5] The migration's guard rails ────────────────────────────────────────
console.log("\n[5] It refuses to land half-applied");

test("the self-check covers both directions", () => {
  assert(
    /still ignores the standings setting/.test(MIG),
    "the leak it exists to close"
  );
  assert(
    /has no membership test/.test(MIG),
    "the other half of the leak"
  );
  assert(
    /would lose their highlights/.test(MIG),
    "and the failure that would show up on a projector in front of a room"
  );
  assert(
    /lost pseudonym masking/.test(MIG),
    "a large function retyped by hand needs its untouched parts asserted too"
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  Turning the standings off now turns them off everywhere.\n");
