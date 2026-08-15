/**
 * LIVE EXAM v2 — Q15b: REVEAL THE ANSWER WHEN TIME IS UP
 *
 * Run with: node src/__tests__/live-v2-answer-reveal.test.mjs
 *
 * This feature puts an answer key on a projector, so most of what follows is
 * about the three ways that goes wrong rather than the one way it goes right:
 *
 *   [1] It shows the key EARLY. The room is still answering and the wall tells
 *       them what to pick. Guarded in the database, not here — the client asks and
 *       is refused — which is why section [1] tests the RPC and not the component.
 *   [2] It shows the key when the creator did not ask for it. Default false,
 *       gated on Q15, and forgotten when either switch goes off.
 *   [3] It shows the key correctly and wrecks the frame doing it. The wall is
 *       measured to fit; anything that appears at reveal changes what "fits" meant
 *       and zooms the whole question in front of the class.
 */

import { readFileSync, readdirSync } from "fs";
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
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SQL = readMigration("20260810000000_live_v2_present_reveal_answer.sql");
const SECURITY_SQL = readMigration("20260729020000_live_exam_security.sql");
const FOUNDATION_SQL = readMigration("20260802000000_live_v2_foundations.sql");
/**
 * Every migration, concatenated in filename order — which IS apply order.
 *
 * Replaces a read of supabase/APPLY_REMAINING.sql, a consolidated paste-once
 * file now retired: its content stopped at 20260812000000, so pasting it after
 * 20260815000000 re-ran two older function bodies and reverted that fix without
 * an error. The migrations directory cannot fall behind itself.
 */
const APPLY_ORDER = readdirSync(resolve(ROOT, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readMigration(f))
  .join("\n");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const OPTION = readSrc("components/live/LiveOption.tsx");
const MENU = readSrc("components/live/SessionSettingsMenu.tsx");
const SESSION = readSrc("hooks/useLiveSession.ts");
const CHANNEL = readSrc("lib/live/presentChannel.ts");
const SERVICE = readSrc("services/liveExamService.ts");

const PRESENT_CODE = stripComments(PRESENT);

console.log("\n══ LIVE EXAM v2 — Q15b ANSWER REVEAL ══");

// ─── [1] The server decides when, and it is the only thing that does ─────────
console.log("\n[1] Early is the failure that matters — and the client cannot cause it");

test("the reveal RPC is gated on the deadline, not on the question having been unlocked", () => {
  // The whole feature rests on this function. If it ever degrades to a status
  // check, every wall with the setting on starts showing the key mid-question.
  const fn = FOUNDATION_SQL.slice(
    FOUNDATION_SQL.indexOf("FUNCTION public.get_revealed_live_answers")
  );
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(
    /live_question_deadline\(/.test(body),
    "the release time must come from the shared deadline helper"
  );
  assert(
    /v_exam\.current_question_extra_seconds/.test(body),
    "A3 extra time must move the reveal with it, or added time reveals the answer early"
  );
  assert(
    /t\.ordinal < v_exam\.current_question_index/.test(body),
    "questions already passed stay revealed"
  );
});

test("the deadline helper the reveal depends on includes the grace window", () => {
  const helper = FOUNDATION_SQL.slice(FOUNDATION_SQL.indexOf("FUNCTION public.live_question_deadline"));
  assert(
    /p_time_seconds \+ COALESCE\(p_extra_seconds, 0\) \+ 2/.test(helper.slice(0, 600)),
    "the two-second grace is what makes a late submission still count — the key must wait for it too"
  );
});

test("the original security migration already ties the two together", () => {
  // Sanity that we are extending an existing gate rather than inventing one.
  assert(
    /get_revealed_live_answers/.test(SECURITY_SQL),
    "the reveal RPC predates this feature; Q15b only decides whether to draw its output"
  );
});

test("the migration refuses to apply if that gate has gone missing", () => {
  assert(
    /get_revealed_live_answers no longer honours live_question_deadline/.test(SQL),
    "the self-check must fail loudly rather than ship a wall that reveals early"
  );
});

test("the wall withholds the key locally too, on top of the server's refusal", () => {
  assert(
    /revealAnswer && question && \(isRevealing \|\| isEnded\)/.test(PRESENT_CODE),
    "a running question must resolve to no key even if one were somehow in memory"
  );
  assert(
    /const isRevealing = isLive && index >= 0 && timerReady && !timerPhase\.running/.test(PRESENT_CODE),
    "and isRevealing must remain 'the timer has run out', not 'a question exists'"
  );
});

test("an undone unlock drops the key the wall had already fetched", () => {
  // A10 lets the creator reopen a question. The server re-hides its answer; the
  // copy in this page's memory is the one that would still be on the wall.
  const rewind = PRESENT_CODE.slice(PRESENT_CODE.indexOf("onRewind:"));
  assert(/setRevealedAnswers/.test(rewind.slice(0, 500)), "onRewind must clear what it holds");
  assert(
    /if \(i >= index\) next\.delete\(q\.id\)/.test(rewind.slice(0, 600)),
    "everything at or after the reopened question, not just the current one"
  );
});

// ─── [2] It only appears when the creator asked for it ───────────────────────
console.log("\n[2] Off by default, and bound to the choices being on");

test("the column defaults to false", () => {
  assert(
    /present_reveal_answer BOOLEAN NOT NULL DEFAULT false/.test(SQL),
    "an answer key on a projector is never a default"
  );
});

test("a payload that omits the setting must not turn it off — THE SHIPPED BUG", () => {
  /*
    What happened, because it is not guessable from the code:

    The creator flips the switch. updateLiveExam writes it. The row in the
    database is correct and stays correct. A beat later Supabase Realtime pushes
    the UPDATE back — and Realtime builds that payload from a column list it
    caches, which had not yet caught up with the freshly added column. So the
    echo of the creator's own write arrived WITHOUT present_reveal_answer.

    `exam.present_reveal_answer === true` read that absence as false, the push
    lane always applies, and the switch turned itself back off. Nothing threw,
    no request failed, and the database was right the entire time — which is why
    it read as "the toggle doesn't work" rather than as an error.

    The rule that fixes it: undefined means "this payload says nothing about that
    setting", never "that setting is off".
  */
  assert(/function payloadBool/.test(SESSION), "there must be one reader for these keys");
  assert(
    /if \(!row \|\| !\(key in row\)\) return undefined/.test(SESSION),
    "`key in row` — present-and-false and not-present-at-all are different answers"
  );
  assert(
    /presentRevealAnswer: payloadBool\(exam, "present_reveal_answer"\)/.test(SESSION),
    "the push lane must go through it — this is the lane that broke"
  );
  assert(
    /presentRevealAnswer: payloadBool\(sync, "present_reveal_answer"\)/.test(SESSION),
    "and so must the poll lane, for a live_session_sync that predates the column"
  );
  assert(
    /presentRevealAnswer: next\.presentRevealAnswer \?\? cur\.presentRevealAnswer/.test(SESSION),
    "and the merge must keep the previous value rather than defaulting"
  );
  assert(
    !/present_reveal_answer === true|present_reveal_answer !== false/.test(SESSION),
    "no lane may collapse a missing key into a concrete answer again"
  );
  assert(
    /present_reveal_answer\?: boolean/.test(SERVICE),
    "and the wire type must allow the key to be absent"
  );
});

test("every projector setting gets the same treatment, not just the new one", () => {
  // The same hole existed for Q15 and Q16 the whole time. It was invisible
  // because `!== false` happens to guess right for a column that defaults true —
  // so a stale payload silently forced those settings ON instead of OFF.
  for (const key of [
    "present_show_leaderboard",
    "present_show_river",
    "present_show_options",
    "present_reveal_answer",
  ]) {
    assert(
      SESSION.includes(`payloadBool(exam, "${key}")`) &&
        SESSION.includes(`payloadBool(sync, "${key}")`),
      `${key} must be read the same way on both lanes`
    );
  }
  assert(
    /presentTheme: payloadTheme\(exam, "present_theme"\)/.test(SESSION),
    "and the theme, whose absence would flash the wrong frame in front of a room"
  );
});

test("the wall requires BOTH switches", () => {
  assert(
    /\(configPreview\.revealAnswer \?\? session\.presentRevealAnswer\) && showOptions/.test(PRESENT_CODE),
    "there is nothing to mark when the choices are not drawn"
  );
});

test("the menu only offers it while the choices are on", () => {
  // Deliberately not asserting the label text. Copy on this menu is rewritten
  // freely and should be; what must not drift is that the control exists, is
  // reachable mid-session, and cannot be reached when its parent is off.
  assert(
    /settings\.presentShowOptions && \(\s*<SubRow/.test(MENU),
    "the sub-toggle must be gated on its parent"
  );
  const sub = MENU.slice(MENU.indexOf("settings.presentShowOptions && ("));
  assert(
    /onChange\(\{ presentRevealAnswer: v \}\)/.test(sub.slice(0, 900)),
    "and the switch inside that gate must be the one that writes the setting"
  );
});

test("turning either switch off makes the wall forget the key it holds", () => {
  const effect = PRESENT_CODE.slice(PRESENT_CODE.indexOf("if (!revealAnswer) {"));
  assert(
    /setRevealedAnswers\(\(prev\) => \(prev\.size === 0 \? prev : new Map\(\)\)\)/.test(
      effect.slice(0, 300)
    ),
    "a fetched key must not survive the setting that justified fetching it"
  );
  assert(
    /if \(!liveExamId \|\| !wantsKeyRef\.current\) return/.test(PRESENT_CODE),
    "and no trigger may re-fetch one while the setting is off"
  );
});

test("the two settings are stored independently, with no CHECK tying them", () => {
  // Forcing present_reveal_answer to false whenever the choices are hidden would
  // lose the creator's choice every time they hide the options to discuss a
  // question — the exact workflow Q15 exists to support.
  assert(
    !/CHECK[^;]*present_reveal_answer/.test(SQL),
    "the dependency is a UI rule, not a data constraint"
  );
});

test("it never reaches a student's own screen", () => {
  assert(
    !/presentRevealAnswer|present_reveal_answer/.test(stripComments(STUDENT)),
    "this is staging for one screen; a student's reveal is their own timer's business"
  );
});

// ─── [3] Reaching the wall at all ────────────────────────────────────────────
console.log("\n[3] The plumbing, including the projector's own fallback");

test("the setting is persisted by the control room and previewed over the channel", () => {
  assert(
    /present_reveal_answer: patch\.presentRevealAnswer/.test(CONTROL),
    "the row is the source of truth"
  );
  assert(
    /revealAnswer: patch\.presentRevealAnswer/.test(CONTROL),
    "and the broadcast skips the round trip so the wall reacts on the keystroke"
  );
  assert(/revealAnswer\?: boolean/.test(CHANNEL), "the intent must carry it");
  assert(
    /revealAnswer: intent\.revealAnswer \?\? cur\.revealAnswer/.test(PRESENT),
    "an omitted field means unchanged, so one switch cannot reset the others"
  );
});

test("live_session_sync carries it, or a reloaded projector loses the setting", () => {
  assert(/'present_reveal_answer',\s+v_exam\.present_reveal_answer/.test(SQL), "the RPC must return it");
  // Was: "and the paste-once file must contain this migration", against
  // supabase/APPLY_REMAINING.sql. That file is retired — its content stopped at
  // 20260812000000, so re-pasting it after 20260815000000 silently reverted two
  // function bodies. What actually has to hold is that the LAST definition of
  // live_session_sync still returns this key, since CREATE OR REPLACE does not
  // merge and only the final one survives.
  const lastSyncDef = APPLY_ORDER.slice(
    APPLY_ORDER.lastIndexOf("CREATE OR REPLACE FUNCTION public.live_session_sync")
  );
  assert(
    lastSyncDef.includes("present_reveal_answer"),
    "the final live_session_sync drops it — the projector would silently lose the setting"
  );
});

test("the redefinition did not quietly drop what it inherited", () => {
  // This migration rewrites live_session_sync whole. Everything Q15, Q16 and the
  // privacy hardening put in it has to still be there afterwards.
  const fn = SQL.slice(SQL.indexOf("FUNCTION public.live_session_sync"));
  const body = fn.slice(0, fn.indexOf("$$;"));
  for (const key of [
    "present_show_options",
    "present_theme",
    "present_show_leaderboard",
    "present_show_river",
    "score_visible",
  ]) {
    assert(body.includes(key), `the rewritten sync lost ${key}`);
  }
  assert(
    /v_score_visible := \(/.test(body),
    "the mid-question score gate must survive the rewrite — it has nearly been lost once already"
  );
});

test("the analytics push is the fast path", () => {
  // The analytics row is computed when the question closes, which is the same
  // instant the server starts handing out the answer.
  const cb = PRESENT_CODE.slice(PRESENT_CODE.indexOf("onAnalytics:"));
  assert(/loadRevealedAnswers\(\)/.test(cb.slice(0, 300)), "a closed question must pull its key at once");
});

test("and a dead realtime channel is not allowed to cost the reveal", () => {
  assert(
    /REVEAL_FETCH_DELAY_MS/.test(PRESENT) && /REVEAL_FETCH_ATTEMPTS/.test(PRESENT),
    "the projector must ask on its own clock when the push never arrives"
  );
  assert(
    /attempts\.n >= REVEAL_FETCH_ATTEMPTS\) return/.test(PRESENT_CODE),
    "bounded, or a question whose key never resolves polls for the rest of its life"
  );
  assert(
    /REVEAL_FETCH_DELAY_MS \* \(attempts\.n \+ 1\)/.test(PRESENT_CODE),
    "with backoff between attempts"
  );
  const delay = PRESENT.match(/const REVEAL_FETCH_DELAY_MS = (\d+)/);
  assert(delay && Number(delay[1]) > 2000, "the first ask must clear the server's two-second grace");
});

// ─── [4] Saying it, on a wall, to a room ─────────────────────────────────────
console.log("\n[4] What the room actually sees");

test("the answer is named in words, not only coloured", () => {
  // A stream at 360p, a drifting projector and a red-green deficiency all reduce
  // "the green one" to "one of these is slightly different".
  assert(/function AnswerKeyLine/.test(PRESENT), "there must be a written statement of the key");
  const line = PRESENT.slice(PRESENT.indexOf("function AnswerKeyLine"));
  assert(/letters\.length > 1 \? "Answers: " : "Answer: "/.test(line), "multi-select needs the plural");
  assert(/letters\.join\(", "\)/.test(line), "and must name every correct option, not the first");
});

test("the correct card is drawn in stage variables, like everything else on the wall", () => {
  const stage = OPTION.slice(OPTION.indexOf("STAGE_SHELL_CORRECT"));
  assert(
    /var\(--stage-good\)/.test(stage.slice(0, 700)),
    "emerald-500 is a mid-tone on the light frame and vanishes at five metres"
  );
  assert(
    !/emerald|text-white/.test(stage.slice(0, 700)),
    "no app token may reach the projector's palette"
  );
  assert(
    /\$\{display \? "" : SHELL\[visual\]\}/.test(OPTION) &&
      /\$\{display \? "" : BADGE\[visual\]\}/.test(OPTION),
    "and the app's className maps must still be kept off the stage entirely"
  );
});

test("the wall's visual describes the key, not somebody's answer", () => {
  assert(
    /\| "correct"/.test(OPTION),
    "a room has no pick, so correct-picked / correct-missed are the wrong frame for it"
  );
  assert(
    /function isCorrectVisual/.test(OPTION),
    "and the three correct-ish visuals need one definition, not three call sites"
  );
});

// ─── [5] The frame must not move ─────────────────────────────────────────────
console.log("\n[5] Revealing without zooming the wall");

test("the tick's width is spent before the reveal, not at it", () => {
  assert(/reserveMark/.test(OPTION) && /reserveMark=\{revealAnswer\}/.test(PRESENT_CODE),
    "the option must hold the mark's space from the first paint");
  const mark = OPTION.slice(OPTION.indexOf("display && (reserveMark || correct)"));
  assert(
    /visibility: correct \? "visible" : "hidden"/.test(mark.slice(0, 500)),
    "hidden, not unmounted — hidden still occupies its box, which is the entire point"
  );
});

test("the written answer line holds its row while it waits", () => {
  const line = PRESENT.slice(PRESENT.indexOf("function AnswerKeyLine"));
  assert(
    /visibility: known \? "visible" : "hidden"/.test(line),
    "appearing at reveal would change the height the question was measured into"
  );
});

test("the correct card is the same size as the neutral one", () => {
  // A wider border shrinks the content box, which can rewrap an option, which
  // overflows the measured box, which re-fits the whole question mid-reveal.
  const correct = OPTION.slice(OPTION.indexOf("const STAGE_SHELL_CORRECT"), OPTION.indexOf("const STAGE_BADGE_CORRECT"));
  assert(
    /borderWidth: "max\(1px, 0\.03em\)"/.test(correct),
    "the border width must match STAGE_SHELL exactly"
  );
  assert(/boxShadow: "inset/.test(correct), "extra weight must come from a shadow, which has no layout");
});

test("the mark is em-sized, like everything else in the measured subtree", () => {
  const mark = OPTION.slice(OPTION.indexOf("display && (reserveMark || correct)"));
  assert(
    /width: "1\.15em"/.test(mark.slice(0, 500)),
    "an h-4 tick beside a 70px option is a speck on a projector"
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
