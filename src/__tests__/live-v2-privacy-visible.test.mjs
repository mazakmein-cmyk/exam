/**
 * LIVE EXAM v2 — PRIVACY MODE, THE VISIBILITY FIXES
 *
 * Run with: node src/__tests__/live-v2-privacy-visible.test.mjs
 *
 * "Hide student names is not working at all."
 *
 * It was working. Every masking path was intact, and probes against the live
 * database confirmed pseudonyms really were being stored and served. The feature
 * failed in three ways that all LOOK like inertness without being it, and this
 * suite exists because none of the three would ever throw:
 *
 *  [1] Every participant in a class of 48 or fewer got the SAME adjective,
 *      'Anonymous' — integer division advanced the adjective once per 48 joiners.
 *      The room read "Anonymous Aardvark / Anonymous Badger", which looks like a
 *      placeholder that failed to fill in rather than a working nickname.
 *  [2] get_live_moments ranked a subquery it had already filtered to one row, so
 *      its ordinal was always 0 and every moment in the session was attributed to
 *      one pseudonym — and not the one that student had on the leaderboard.
 *  [3] Nothing on any client refetched when the toggle flipped. No question index
 *      moved, no session ended, nothing celebrated, so every other session
 *      callback stayed silent and the wall kept the real names it already had.
 *
 * The mirror test below deliberately reads the NEWEST definition of
 * live_anon_name rather than the original migration. Phase 1's copy of this test
 * mirrors the old arithmetic against the old file and still passes, which is
 * exactly the trap: a test can go on guarding a definition that no longer ships.
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

const FIX_SQL = readMigration("20260809000000_live_v2_privacy_visible.sql");
const MOMENTS_SQL = readMigration("20260805000000_live_v2_moments.sql");
const SESSION = readSrc("hooks/useLiveSession.ts");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const SERVICE = readSrc("services/liveExamService.ts");
const BOARD = readSrc("components/live/LiveLeaderboard.tsx");

/**
 * The shipped pseudonym arithmetic, mirrored from the migration.
 *
 * Extracted from the SQL rather than hard-coded so the mirror cannot silently
 * drift from the function it is meant to be checking — the failure the phase 1
 * copy of this test now demonstrates.
 */
function extractLists(sql) {
  const fn = sql.slice(sql.indexOf("FUNCTION public.live_anon_name"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  const adjEnd = body.indexOf("] AS adjectives");
  const aniEnd = body.indexOf("] AS animals");
  assert(adjEnd > 0 && aniEnd > adjEnd, "could not find both ARRAY literals in live_anon_name");

  // Each list is the quoted words between its own ARRAY[ and its label.
  const words = (block) => (block.match(/'([A-Za-z]+)'/g) || []).map((s) => s.slice(1, -1));
  const adjBlock = body.slice(0, adjEnd);
  const aniBlock = body.slice(adjEnd, aniEnd);
  return {
    adj: words(adjBlock.slice(adjBlock.lastIndexOf("ARRAY["))),
    ani: words(aniBlock.slice(aniBlock.lastIndexOf("ARRAY["))),
  };
}

const { adj: ADJ, ani: ANI } = extractLists(FIX_SQL);

/** The expression the migration ships: (ordinal / 48 + ordinal) % 48. */
const name = (n) => `${ADJ[(Math.floor(n / 48) + n) % 48]} ${ANI[n % 48]}`;

console.log("\n[1] live_anon_name — a class must read as different nicknames");

test("the two lists were extracted and are the full 48 x 48 space", () => {
  assert(ADJ.length === 48, `expected 48 adjectives, extracted ${ADJ.length}`);
  assert(ANI.length === 48, `expected 48 animals, extracted ${ANI.length}`);
  assert(new Set(ADJ).size === 48, "duplicate adjective shrinks the namespace");
  assert(new Set(ANI).size === 48, "duplicate animal shrinks the namespace");
});

test("a class of 30 gets 30 DIFFERENT adjectives, not 30 Anonymouses", () => {
  const adjectives = new Set(
    Array.from({ length: 30 }, (_, n) => name(n).split(" ")[0])
  );
  assert(
    adjectives.size === 30,
    `the reported bug: ${adjectives.size} distinct adjectives across 30 joiners (${[...adjectives].join(", ")})`
  );
});

test("the placeholder word exists at NO ordinal in the whole space", () => {
  /**
   * Bounded to 0..45 in the first draft, and it passed while ordinal 46 was still
   * "Anonymous Toucan" — the 47th joiner of an ordinary class. An index offset
   * only moves which ordinal lands on the placeholder, so a bounded check can
   * always be one short of it. The word is now absent from the list entirely,
   * which is a property the full range can assert.
   */
  const anon = [];
  for (let n = 0; n < 2304; n++) if (/anonymous/i.test(name(n))) anon.push(n);
  assert(
    anon.length === 0,
    `${anon.length} ordinals still render the placeholder (first: ${anon[0]} = "${name(anon[0] ?? 0)}")`
  );
  assert(
    !ADJ.some((a) => /anonymous/i.test(a)),
    "a name space for anonymising people should not contain the word 'Anonymous' at any index"
  );
});

test("every ordinal reads like a nickname, not a placeholder", () => {
  // The settings menu advertises "Brave Badger". Each name need not be that exact
  // pair, but all 2304 must be two capitalised words.
  for (const n of [0, 1, 46, 47, 48, 1000, 2303]) {
    assert(
      /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name(n)),
      `ordinal ${n} has unexpected shape: "${name(n)}"`
    );
  }
});

test("still collision-free across the whole 2304 name space", () => {
  const seen = new Set(Array.from({ length: 2304 }, (_, n) => name(n)));
  assert(
    seen.size === 2304,
    `only ${seen.size} of 2304 names are distinct — a collision means two students share a pseudonym, and this feature has no numeric suffixes to fall back on`
  );
});

test("the SQL still indexes modulo the real list length", () => {
  assert(
    (FIX_SQL.match(/% 48 \+ 1/g) || []).length === 2,
    "both indices must be modulo 48, or names wrap early and collide"
  );
  assert(/IMMUTABLE/.test(FIX_SQL.slice(0, FIX_SQL.indexOf("$$;"))), "must stay IMMUTABLE");
});

console.log("\n[2] get_live_moments — the ordinal must rank the room");

test("the pre-filtered LATERAL that forced every ordinal to 0 is gone", () => {
  const fn = FIX_SQL.slice(FIX_SQL.indexOf("FUNCTION public.get_live_moments"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    !/WHERE p\.live_exam_id = lm\.live_exam_id\s*\n\s*AND p\.user_id = lm\.user_id/.test(body),
    "filtering the participant set to one row before ROW_NUMBER() makes every ordinal 0"
  );
  assert(
    /ROW_NUMBER\(\) OVER \(ORDER BY p\.joined_at, p\.id\)/.test(body),
    "the ordinal must still be join order"
  );
  assert(
    /WHERE p\.live_exam_id = p_live_exam_id/.test(body),
    "the window must run over the whole exam's participants"
  );
});

test("the original bug is still present in the file this one supersedes", () => {
  // Guards the premise. If this ever fails, the two definitions have converged
  // and the fix migration may have become a no-op nobody noticed.
  const fn = MOMENTS_SQL.slice(MOMENTS_SQL.indexOf("FUNCTION public.get_live_moments"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    /AND p\.user_id = lm\.user_id/.test(body),
    "20260805 is expected to contain the pre-filtered LATERAL that 20260809 replaces"
  );
});

test("masking and the creator-only id are preserved through the redefinition", () => {
  const fn = FIX_SQL.slice(FIX_SQL.indexOf("FUNCTION public.get_live_moments"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    /WHEN v_exam\.privacy_mode THEN public\.live_anon_name/.test(body),
    "a redefinition that drops the masking branch is the classic way this leaks"
  );
  assert(
    /CASE WHEN v_exam\.user_id = auth\.uid\(\) THEN lm\.user_id ELSE NULL END/.test(body),
    "the join key back to a real person must stay creator-only"
  );
});

test("stored pseudonyms are re-derived, since the naming function changed", () => {
  assert(
    /live_refresh_fastest_names/.test(FIX_SQL),
    "fastest_user_name still holds names built by the old expression; reuse the one function that derives them"
  );
});

console.log("\n[3] The flip has to reach screens that already drew a name");

test("the session spine exposes a settings-changed callback", () => {
  assert(/onSettings\?: \(\) => void/.test(SESSION), "callback must exist on the type");
  assert(
    /next\.privacyMode !== prev\.privacy/.test(SESSION),
    "it must fire on a privacy_mode transition"
  );
  assert(
    /next\.leaderboardVisibility !== prev\.visibility/.test(SESSION),
    "E3 changes what the room may see too"
  );
});

test("it never fires on the first observation", () => {
  assert(
    /prev\.privacy !== null &&/.test(SESSION),
    "a baseline observation must fire nothing, or every page load refetches on mount"
  );
  assert(
    /privacy: null,\s*\n\s*visibility: null,/.test(SESSION),
    "the per-exam reset must clear the baseline to null, or switching exams compares one exam's settings against another's"
  );
});

test("the projector refetches the names on its wall", () => {
  const cb = PRESENT.slice(PRESENT.indexOf("onSettings:"), PRESENT.indexOf("onSettings:") + 240);
  assert(/loadStandings\(\)/.test(cb), "standings on the wall are name-bearing");
  assert(/loadMoments\(\)/.test(cb), "moment banners name a student");
});

test("the student device refetches EVERY name it holds, not just the leaderboard", () => {
  const cb = STUDENT.slice(STUDENT.indexOf("onSettings:"), STUDENT.indexOf("onSettings:") + 220);
  /**
   * refetchSessionData, not fetchPublicLeaderboard alone. The standings are not
   * the only name on the student's screen: each revealed question also renders
   * analytics.fastest_user_name, which the server rewrites when privacy flips.
   * A push-lane student gets that correction over realtime; a poll-lane student
   * has no other path to it, so refetching only the leaderboard would leave a real
   * name under "Fastest" for the rest of the session.
   */
  assert(
    /refetchSessionData\(\)/.test(cb),
    "a student goes on reading classmates' real names until something asks again"
  );
  const fn = STUDENT.slice(STUDENT.indexOf("const refetchSessionData"));
  const body = fn.slice(0, fn.indexOf("\n  };"));
  assert(
    /fetchPublicLeaderboard/.test(body) && /fetchAllAnalytics/.test(body),
    "refetchSessionData must cover both name-bearing caches (standings and analytics)"
  );
});

console.log("\n[4] The creator's own screen has to show that it worked");

test("the room's nicknames are fetched from the masked view, not re-derived", () => {
  assert(/export async function fetchRoomAliases/.test(SERVICE), "helper must exist");
  const fn = SERVICE.slice(SERVICE.indexOf("export async function fetchRoomAliases"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert(
    /live_participants_public/.test(body),
    "reimplementing the naming rule client-side gives the cockpit a second opinion about what the wall says"
  );
  assert(
    /\.select\("id, display_name"\)/.test(body),
    "keyed on id: privacy mode nulls everyone else's user_id"
  );
});

test("the leaderboard panel says so, next to the names it does not change", () => {
  assert(
    /Room sees nicknames/.test(CONTROL),
    "this panel shows real names by design; unlabelled, it is indistinguishable from a broken toggle"
  );
  assert(
    /aliasById=\{session\.privacyMode \? roomAliases : undefined\}/.test(CONTROL),
    "per-row nicknames only while privacy is on"
  );
});

test("the creator still sees real names — the annotation is additive", () => {
  assert(
    /fetchLeaderboard\(liveExamId, 20\)/.test(CONTROL),
    "the cockpit reads the base table; that is the whole point of the two-screen split"
  );
  assert(
    /aliasById\?: Map<string, string>/.test(BOARD),
    "the alias is an optional prop, so student screens are unaffected"
  );
});

test("a row never prints the same name twice", () => {
  assert(
    /aliasById\?\.get\(p\.id\) !== p\.display_name/.test(BOARD),
    "with privacy off the masked view returns the real name; printing it twice reads as a rendering fault"
  );
});

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\n🎉 Privacy mode is masked, distinct, and visibly on.");
