/**
 * LIVE EXAM v2 — E3: "OFF" MUST NOT BE A SECOND COPY OF "JUST ME"
 *
 * Run with: node src/__tests__/live-v2-leaderboard-off.test.mjs
 *
 * The Leaderboard control offers three choices — Everyone / Just me / Off — and
 * shipped with two behaviours. Every layer collapsed the last two into one:
 *
 *  [1] live_participants_public returns the caller's own row for both 'private'
 *      and 'off'. That part is right, deliberate, and already tested in
 *      live-v2-phase1 — it is the floor, not the whole setting.
 *  [2] live_session_sync returned my_rank to every participant without ever
 *      reading leaderboard_visibility, so the number reached the browser under
 *      all three settings.
 *  [3] LiveExamStudent.tsx never read the setting at all. It drew the standings
 *      card, the header rank chip, the climb/fall badge and two Rank tiles
 *      identically whichever option was selected.
 *
 * So a creator who chose "Off" — captioned "No ranking shown to anyone" — got
 * precisely what "Just me" gives, and the class kept a live "#14" pinned to the
 * top of every phone for the whole session.
 *
 * Why these assertions are worth having: not one of the three would ever throw,
 * and the two settings are indistinguishable in any screenshot of the control
 * room. The only way this regresses loudly is if something checks that 'off'
 * still means something 'private' does not.
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

const OFF_SQL = readMigration("20260812000000_live_v2_leaderboard_off.sql");
const SESSION = readSrc("hooks/useLiveSession.ts");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const MENU = readSrc("components/live/SessionSettingsMenu.tsx");

console.log("\n══ E3 — 'off' means off ══");

// ─── [1] The server ─────────────────────────────────────────────────────────
console.log("\n[1] live_session_sync withholds the rank");

test("the rank is gated on leaderboard_visibility", () => {
  assert(
    /leaderboard_visibility = 'off' THEN NULL/.test(OFF_SQL),
    "my_rank must not be computed for a student when the setting is 'off'"
  );
});

test("the gate sits on the student branch, never the creator's", () => {
  // The creator branch fills confusion/open-response counts and returns before
  // the rank lookup. If the gate had been applied to the whole function, the
  // control room would lose the standings it exists to show.
  const studentBranch = OFF_SQL.split("ELSE")[1] || "";
  assert(
    /leaderboard_visibility = 'off'/.test(studentBranch),
    "ranks are always computed and the creator always sees them — E3 is a display setting"
  );
});

test("the score survives — only the ranking goes", () => {
  assert(
    /lp\.total_correct\s*\n\s*INTO v_my_rank, v_my_correct/.test(OFF_SQL),
    "a score is this student's own result, not a position in a room; the menu promises scores are always recorded"
  );
});

test("the mid-question correctness gate was carried through the rewrite", () => {
  // live_session_sync is redefined wholesale by every feature that adds a
  // setting, and this clause has been nearly lost to a copy once already.
  assert(
    /v_score_visible := \(/.test(OFF_SQL) && /NOT v_open/.test(OFF_SQL),
    "dropping the score_visible gate reopens the two-account correctness probe"
  );
  for (const key of ["present_reveal_answer", "present_show_options", "present_theme"]) {
    assert(
      new RegExp(key).test(OFF_SQL),
      `the redefinition dropped ${key}, which a later migration had added`
    );
  }
});

test("the migration fails loudly rather than half-applying", () => {
  assert(
    /RAISE EXCEPTION 'E3 "off" migration incomplete/.test(OFF_SQL),
    "a self-check that only warns is a self-check nobody reads"
  );
});

// ─── [2] The spine ──────────────────────────────────────────────────────────
console.log("\n[2] useLiveSession drops the rank at one choke point");

test("myRank is nulled for the whole app when the setting is 'off'", () => {
  assert(
    /const rankHidden = next\.leaderboardVisibility === "off"/.test(SESSION),
    "four surfaces draw a position; gating them one by one is how one gets missed"
  );
  assert(
    /myRank: rankHidden\s*\n\s*\? null/.test(SESSION),
    "the null must win over the score_visible fallback below it"
  );
});

test("the flip mid-question does not leave the last rank pinned", () => {
  // scoreVisible === false deliberately KEEPS the previous rank so a student's
  // score never blanks mid-question. Correct for its own purpose, and exactly
  // wrong here — the E3 check has to be tested first.
  const merged = SESSION.slice(SESSION.indexOf("myRank: rankHidden"));
  const nullBranch = merged.indexOf("? null");
  const keepBranch = merged.indexOf("cur.myRank");
  assert(
    nullBranch !== -1 && nullBranch < keepBranch,
    "'off' must be checked before the keep-the-previous-value rule, or the rank survives until the question closes"
  );
});

// ─── [3] The student's screen ───────────────────────────────────────────────
console.log("\n[3] the student sees no position anywhere");

test("the page finally reads the setting", () => {
  assert(
    /const rankingHidden = session\.leaderboardVisibility === "off"/.test(STUDENT),
    "this is the entire difference between 'private' and 'off'; without it they are one setting"
  );
});

test("the standings card is removed, not emptied", () => {
  assert(
    /\{!rankingHidden && \(\s*\n\s*<div className="rounded-2xl border border-border\/60 bg-card">/.test(STUDENT),
    "a card headed 'Leaderboard · live' holding one crowned row is the thing the creator switched off, in a smaller box"
  );
});

test("neither Rank tile leaves a dash behind", () => {
  const tiles = STUDENT.match(/\{!rankingHidden && \(/g) || [];
  assert(
    tiles.length >= 3,
    `expected the standings card and both Rank tiles to be gated; found ${tiles.length} gates`
  );
  assert(
    /grid \$\{rankingHidden \? "grid-cols-2" : "grid-cols-3"\}/.test(STUDENT),
    "an empty tile in a three-across grid reads as a number that failed to load, not as a setting"
  );
});

test("the phone's tab stops promising ranks", () => {
  assert(
    /rankingHidden \? "Your run" : "Ranks"/.test(STUDENT),
    "the pane still holds the score card, so the tab stays — under the honest name"
  );
});

test("the header chip and its climb badge need no gate of their own", () => {
  // Both are already `myRank !== null` guarded, and the spine nulls it. Asserted
  // so a future edit that reaches past `myRank` for a rank gets caught here.
  assert(
    /\{myRank !== null && \(/.test(STUDENT),
    "the header chip must stay keyed on myRank, which is the value the spine controls"
  );
  assert(
    /if \(myRank === null\) return;/.test(STUDENT),
    "the rank-delta effect must bail on a null rank rather than computing a swing from it"
  );
});

// ─── [4] The room ───────────────────────────────────────────────────────────
console.log("\n[4] the wall and the copy still agree");

test("the projector shows standings only under 'full'", () => {
  assert(
    /session\.leaderboardVisibility === "full"/.test(PRESENT),
    "the wall is what the room sees; 'private' and 'off' both hide it there"
  );
});

test("the three options still describe what now happens", () => {
  assert(
    /value: "off".*hint: "No ranking shown to anyone"/s.test(MENU),
    "this caption is the promise the whole suite exists to keep"
  );
  assert(
    /value: "private".*Students see only their own result/s.test(MENU),
    "'private' keeps the student's own position — that is what distinguishes it from 'off'"
  );
});

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\n🎉 Off is off: no card, no chip, no tile, and no rank on the wire.");
