/**
 * LIVE EXAM v2 — JOINING BY CODE
 *
 * Run with: node src/__tests__/live-v2-join-by-code.test.mjs
 *
 * A live exam could only ever be entered through the link its creator shared.
 * "My Live Exams" listed rooms the student had already joined, so the very first
 * join — the one with a room waiting — was the one thing the library could not
 * do. This suite guards the box that fixes it.
 *
 * Four things here are load-bearing and none of them would throw if broken:
 *
 *  [1] The code a student supplies is rarely the bare code. It is the join LINK
 *      (that is what the Share button copies), or "Code: 4F2A9B01" out of a chat
 *      app, or typed with a space in the middle. A reader that only accepts eight
 *      clean characters rejects codes that are perfectly correct, and the student
 *      is told their teacher's code is wrong.
 *  [2] The lookup must treat "no such code" as an ANSWER, not an exception.
 *      `.single()` raises PGRST116 on zero rows, which is right for the join path
 *      (the URL is presumed good) and exactly wrong for a typed box, where a
 *      mistyped character is the most likely outcome of all.
 *  [3] Verification hangs off the VALUE, not input-otp's onComplete. onComplete
 *      fires on the transition into full length only, so replacing one full code
 *      with another full code (a second paste) never re-fires it — leaving one
 *      exam's name and confirmation above a different exam's code. That is the
 *      one failure mode here that walks a student into the wrong room.
 *  [4] A draft is invisible to everyone but its creator (RLS), so an unpublished
 *      code and a wrong code have to read identically. Distinguishing them turns
 *      the box into a probe for which codes exist.
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

const CODE_LIB = readSrc("lib/live/shareCode.ts");
const SERVICE = readSrc("services/liveExamService.ts");
const DIALOG = readSrc("components/live/JoinLiveExamDialog.tsx");
const LIBRARY = readSrc("pages/Marketplace.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const TABLES = readMigration("20260729000000_create_live_exam_tables.sql");

console.log("\n══ Join a live exam by code ══");

// ─── [1] The reader ─────────────────────────────────────────────────────────
console.log("\n[1] every shape a code arrives in lands on the same eight characters");

/**
 * Mirror of normalizeShareCode. Kept in step by the structural assertions
 * below — this exists to state the BEHAVIOUR the four shapes must share, which
 * no amount of reading the source proves on its own.
 */
function mirrorNormalize(raw) {
  if (!raw) return "";
  const text = String(raw).trim();
  const link = text.match(/\/live\/([^/?#\s]+)/i);
  const source = link ? link[1] : text;
  const labelled = source.match(/(?:^|[^a-zA-Z0-9])([a-zA-Z0-9]{8})(?![a-zA-Z0-9])/);
  const candidate = labelled ? labelled[1] : source;
  return candidate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
}

test("the link, the bare code, the labelled code and the typed code agree", () => {
  const shapes = [
    "4F2A9B01",
    "4f2a9b01",
    "  4f2a9b01  ",
    "4F2A 9B01",
    "4F2A-9B01",
    "https://mocksetu.in/live/4F2A9B01",
    "https://mocksetu.in/live/4f2a9b01?utm=x#top",
    "http://localhost:8080/live/4F2A9B01/",
    "Code: 4F2A9B01",
    "join code 4f2a9b01 now",
  ];
  for (const shape of shapes) {
    assert(
      mirrorNormalize(shape) === "4F2A9B01",
      `"${shape}" must read as 4F2A9B01, got "${mirrorNormalize(shape)}" — a student pasting what they were given is not making a mistake`
    );
  }
});

test("a labelled code is not flattened into its label", () => {
  // Strip-everything alone turns "Code: 4F2A9B01" into "CODE4F2A" — eight
  // characters, entirely wrong, and indistinguishable from a typo to the student.
  assert(
    /LABELLED_CODE/.test(CODE_LIB) && /\[a-zA-Z0-9\]\{\$\{SHARE_CODE_LENGTH\}\}/.test(CODE_LIB),
    "the whole-word pass must run before the strip-everything fallback"
  );
  assert(mirrorNormalize("Code: 4F2A9B01") === "4F2A9B01", "label must be dropped, not absorbed");
});

test("the link pass reads the segment after /live/ and stops at ? # /", () => {
  assert(/\/live\\\/\(\[\^\/\?#\\s\]\+\)/.test(CODE_LIB), "JOIN_LINK must bound the code segment");
  assert(
    mirrorNormalize("https://mocksetu.in/live/4F2A9B01?x=1") === "4F2A9B01",
    "a tracked link is still a link"
  );
});

test("nothing short of a full code is treated as one", () => {
  assert(mirrorNormalize("4F2") === "4F2", "a partial code stays partial rather than being padded");
  assert(mirrorNormalize("!!!") === "", "punctuation alone is not a code");
  assert(mirrorNormalize(null) === "" && mirrorNormalize(undefined) === "", "total function");
  assert(
    /export function isCompleteShareCode/.test(CODE_LIB),
    "length is the only shape the client asserts; existence is the database's answer"
  );
});

test("the reader does not know the code's alphabet", () => {
  // share_code is hex today because of a column default. A client-side hex
  // validator would start rejecting real codes the day that default changes.
  assert(
    !/0-9A-Fa-f\]|\[a-fA-F/.test(CODE_LIB),
    "codes are opaque identifiers — only their length is the client's business"
  );
});

test("SHARE_CODE_LENGTH still matches the column default", () => {
  assert(
    /export const SHARE_CODE_LENGTH = 8/.test(CODE_LIB),
    "the slot count, the paste truncation and the round-trip guard all read this constant"
  );
  assert(
    /md5\(gen_random_uuid\(\)::text\), 1, 8\)/.test(TABLES),
    "if the default's length changes, this constant and the dialog's two groups of four must change with it"
  );
});

// ─── [2] The lookup ─────────────────────────────────────────────────────────
console.log("\n[2] a wrong code is an answer, not an exception");

test("the typed-code lookup uses maybeSingle", () => {
  const fn = SERVICE.split("export async function lookupLiveExamByShareCode")[1] || "";
  assert(fn, "lookupLiveExamByShareCode must exist");
  assert(
    /\.maybeSingle\(\)/.test(fn.slice(0, 900)),
    "`.single()` raises PGRST116 on zero rows — the box would report a database string for a typo"
  );
});

test("it normalises before it queries, and never queries rubbish", () => {
  const fn = SERVICE.split("export async function lookupLiveExamByShareCode")[1] || "";
  assert(
    /normalizeShareCode\(shareCode\)/.test(fn) && /code\.length !== SHARE_CODE_LENGTH\) return null/.test(fn),
    "a partial code must cost nothing; a link must be accepted"
  );
  assert(/\.eq\("share_code", code\)/.test(fn), "the normalised code is what gets matched");
});

test("a genuine failure still throws — 'offline' must not read as 'wrong code'", () => {
  const fn = SERVICE.split("export async function lookupLiveExamByShareCode")[1] || "";
  assert(/if \(error\) throw error/.test(fn), "we could not check ≠ that code is wrong");
});

test("the join path's throwing lookup is left exactly as it was", () => {
  // LiveExamStudent presumes the code in its URL is good and reports failure as a
  // toast. Softening that function to return null would turn a bad share link
  // into a blank screen with no message at all.
  const fn = SERVICE.split("export async function fetchLiveExamByShareCode")[1] || "";
  assert(/\.single\(\)/.test(fn.slice(0, 400)), "the URL path keeps .single()");
  assert(
    /fetchLiveExamByShareCode/.test(STUDENT),
    "the student page still uses it — this is the function the dialog deliberately does not reuse"
  );
});

// ─── [3] The box ────────────────────────────────────────────────────────────
console.log("\n[3] what is confirmed on screen is what was typed");

test("verification hangs off the value, not onComplete", () => {
  // The prose above the component explains why onComplete is not used, so this
  // looks for the prop being wired, not for the word.
  assert(
    !/onComplete\s*=/.test(DIALOG),
    "onComplete misses a full code replaced by another full code — one paste over another"
  );
  assert(
    /useEffect\(\(\) => \{[\s\S]*?verify\(code\);[\s\S]*?\}, \[code, open, verify\]\)/.test(DIALOG),
    "the effect on `code` is what makes typing, pasting and replacing behave identically"
  );
});

test("a stale in-flight answer cannot win", () => {
  assert(
    /const token = \+\+requestRef\.current/.test(DIALOG) &&
      (DIALOG.match(/token !== requestRef\.current\) return/g) || []).length >= 2,
    "editing a full code fires a second lookup while the first is open; both the found and the failed branch must check"
  );
  assert(
    /requestRef\.current\+\+/.test(DIALOG),
    "closing the dialog and dropping below full length must cancel what is in flight"
  );
});

test("the confirmation card is pinned to the code on screen", () => {
  assert(
    /state\.exam\.share_code === code \? state\.exam : null/.test(DIALOG),
    "the invariant the whole card rests on: a student joins the room they asked for"
  );
});

test("an unpublished code reads exactly like a wrong one", () => {
  assert(
    /!exam \|\| exam\.status === "draft"/.test(DIALOG),
    "RLS already hides drafts from students; the creator's own draft must not become the one code that behaves differently"
  );
  assert(
    /No live exam with that code/.test(DIALOG),
    "one message for both, or the box becomes a probe for which codes exist"
  );
});

test("the three joinable states are three different invitations", () => {
  assert(/cta: "Join now"/.test(DIALOG), "live");
  assert(/cta: "Enter the waiting room"/.test(DIALOG), "published — a room that has not started is not a broken room");
  assert(/cta: "View results"/.test(DIALOG), "ended");
  assert(
    /pulse: true/.test(DIALOG) && /exam\.status === "live"/.test(DIALOG),
    "only a running room gets the live dot — it means 'right now', not 'soon'"
  );
});

test("a failed lookup is separated from a wrong code", () => {
  assert(
    /Couldn't check that code/.test(DIALOG),
    "telling a student their code is wrong when the network dropped sends them back to the host for nothing"
  );
});

test("the box is fed by the shared reader, at the shared length", () => {
  assert(
    /pasteTransformer=\{\(pasted\) => normalizeShareCode\(pasted\)\}/.test(DIALOG),
    "pasting the join link is the single most likely way a code arrives"
  );
  assert(
    /maxLength=\{SHARE_CODE_LENGTH\}/.test(DIALOG),
    "the slot count must follow the constant, not a literal 8"
  );
  assert(
    /\[0, 1, 2, 3\]/.test(DIALOG) && /\[4, 5, 6, 7\]/.test(DIALOG),
    "two groups of four: eight characters read as one run get miscounted, and a code is re-read a lot"
  );
  assert(
    /value={code}/.test(DIALOG) && /value\.toUpperCase\(\)/.test(DIALOG),
    "the slots must show what will actually be looked up"
  );
});

test("entering the room is one navigation to the existing join route", () => {
  assert(
    /navigate\(`\/live\/\$\{found\.share_code\}`\)/.test(DIALOG),
    "the code the DATABASE returned, not the string typed — and no second join mechanism"
  );
  assert(
    /onOpenChange\(false\);\s*\n\s*navigate\(/.test(DIALOG),
    "close then navigate, so Radix unwinds its scroll lock before the route changes"
  );
  assert(!/window\.open/.test(DIALOG), "a popup after an await is a popup a blocker eats");
});

test("the code box is reachable and legible without a mouse", () => {
  assert(/aria-label="Live exam code"/.test(DIALOG), "eight anonymous boxes need a name");
  assert(/aria-live="polite"/.test(DIALOG), "the answer to a code is announced, not just drawn");
  assert(/aria-invalid=\{state\.status === "missing"\}/.test(DIALOG), "red is not the only signal");
  assert(/min-h-\[74px\]/.test(DIALOG), "the footer must not jump under the cursor as an answer arrives");
});

// ─── [4] The library ────────────────────────────────────────────────────────
console.log("\n[4] the way in is where a student already is");

test("the join action sits beside the tabs, not inside one", () => {
  assert(
    /Join with code/.test(LIBRARY),
    "a student arriving while a room waits should not have to discover a tab first"
  );
  assert(
    /<JoinLiveExamDialog open={joinOpen} onOpenChange={setJoinOpen} \/>/.test(LIBRARY),
    "the dialog must actually be mounted"
  );
});

test("the empty state stopped being a dead end", () => {
  const empty = LIBRARY.split("No live exams yet")[1] || "";
  assert(empty, "the empty-state copy should say what to do, not only what is missing");
  assert(
    /setJoinOpen\(true\)/.test(empty.slice(0, 1400)),
    "every student sees this panel until their first join — which is exactly when they hold a code"
  );
});

test("creators are not offered a door they cannot walk through", () => {
  assert(
    /const canJoinLive = role !== "creator"/.test(LIBRARY),
    "creator accounts cannot sit an exam (examAccess.ts); a null role is a visitor, who can"
  );
  assert(
    (LIBRARY.match(/canJoinLive &&/g) || []).length >= 2,
    "both placements have to agree, or one of them offers the dead end"
  );
});

test("the rejoin path for rooms already joined is untouched", () => {
  assert(
    /window\.open\(`\/live\/\$\{exam\.share_code\}`, '_blank'\)/.test(LIBRARY),
    "the existing cards keep their own behaviour — this feature adds a door, it does not move one"
  );
  assert(
    /fetchMyParticipatedLiveExams/.test(LIBRARY),
    "the list itself is unchanged"
  );
});

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("\n🎟️  A code read off a screen is now a way in.");
