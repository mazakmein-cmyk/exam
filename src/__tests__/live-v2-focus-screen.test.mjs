/**
 * LIVE EXAM v2 — THE FOCUS SCREEN: Q15, Q16 AND THE REDESIGN
 *
 * Run with: node src/__tests__/live-v2-focus-screen.test.mjs
 *
 * Two of these tests are load-bearing and the rest are ordinary.
 *
 * The first is [1]: an option rendered in display mode must not borrow a single
 * app token. `bg-card` is white in the app's light theme, the focus screen renders
 * white text on its own dark frame, and the two facts met — every projected option
 * came out as a white rectangle with white text inside it, in front of a room. A
 * grep is a crude guard against that class of bug, but the bug shipped, and it
 * shipped because nothing anywhere asserted that the projector's colours are the
 * projector's own.
 *
 * The second is [2]: hiding the choices must never hide them from the students. Q15
 * is a staging control for one screen. If it ever reached the student page it would
 * silently make a live exam unanswerable for everybody at once.
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

const SQL = readMigration("20260808000000_live_v2_focus_screen.sql");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");
const OPTION = readSrc("components/live/LiveOption.tsx");
const RIVER = readSrc("components/live/AnswerRiver.tsx");
const HUD = readSrc("components/live/PresenterHud.tsx");
const MOMENT = readSrc("components/live/MomentCard.tsx");
const COUNTDOWN = readSrc("components/live/ScheduledCountdown.tsx");
const CLOCK = readSrc("components/live/StageTimer.tsx");
const THEME = readSrc("lib/live/stageTheme.ts");
const SESSION = readSrc("hooks/useLiveSession.ts");
const MENU = readSrc("components/live/SessionSettingsMenu.tsx");
const CHANNEL = readSrc("lib/live/presentChannel.ts");
const FIT = readSrc("hooks/useFitText.ts");
const CSS = readSrc("index.css");

console.log("\n══ LIVE EXAM v2 — FOCUS SCREEN ══");

// ─── [1] Nothing on the stage reads an app token ─────────────────────────────
console.log("\n[1] The projector's colours are the projector's own");

test("display mode borrows no app colour token", () => {
  // The bug: SHELL.idle is `bg-card`, which is white in the app's light theme.
  // On the focus screen that produced a white box with white text in it.
  const display = OPTION.slice(OPTION.indexOf("const STAGE_SHELL"));
  assert(
    /background: "var\(--stage-surface\)"/.test(display),
    "the projected option's fill must come from the stage palette"
  );
  assert(
    /\$\{display \? "" : SHELL\[visual\]\}/.test(OPTION),
    "SHELL[visual] carries bg-card and must not reach display mode at all"
  );
  assert(
    /\$\{display \? "" : BADGE\[visual\]\}/.test(OPTION),
    "the letter badge borrows bg-muted, which is invisible on the dark frame"
  );
});

test("no stage surface hard-codes white or black", () => {
  // Hard-coded white was correct for exactly as long as the frame was always
  // dark. It is why the light theme could not simply be switched on.
  for (const [name, src] of [
    ["the wall", PRESENT],
    ["the answer bars", RIVER],
    ["the moment banner", MOMENT.slice(MOMENT.indexOf("MomentBanner"))],
    ["the countdown's display branch", COUNTDOWN.slice(COUNTDOWN.indexOf("if (display)"))],
  ]) {
    const code = stripComments(src);
    assert(
      !/text-white|bg-white\/|text-black|bg-black\//.test(code),
      `${name} still hard-codes a colour the theme cannot change`
    );
  }
});

test("the QR square stays on white in both themes", () => {
  // Not an oversight: a dark-themed QR fails to scan on a large number of phones,
  // so this one surface is deliberately theme-independent.
  assert(/rounded-xl bg-white/.test(HUD), "the projector QR must keep its white quiet zone");
});

test("the stage clock is drawn in stage variables, not app tones", () => {
  assert(/var\(--stage-accent\)/.test(CLOCK) && /var\(--stage-crit\)/.test(CLOCK), "tones must be themed");
  assert(
    !/stroke-primary|text-amber-500|stroke-muted-foreground/.test(CLOCK),
    "amber-400 on the light stage is around 1.8:1 — unreadable at the distance a timer works at"
  );
});

test("both themes stay inside the range a stream encoder handles", () => {
  assert(
    !/bg: "#000000"|bg: "#ffffff"/.test(THEME),
    "pure black crushes and pure white blooms on most encoders; both themes sit a few points inside"
  );
  assert(/#f5f6fa/.test(THEME) && /#08080f/.test(THEME), "the two frames must be the near-white / near-black pair");
});

// ─── [2] Q15 is a staging control, never a rule change ────────────────────────
console.log("\n[2] Q15 — hiding the choices hides them from ONE screen");

test("only the focus screen consults presentShowOptions", () => {
  assert(/presentShowOptions/.test(PRESENT), "the wall must read it");
  assert(
    !/presentShowOptions|present_show_options/.test(stripComments(STUDENT)),
    "a student's own phone must always show every choice — this setting is staging, not grading"
  );
});

test("the wall says what happened instead of leaving a gap", () => {
  // A blank space under a question reads as a projector that failed to render,
  // and a room that believes the screen is broken stops answering.
  assert(/ChoicesOnDeviceCard/.test(PRESENT), "there must be a designed empty state");
  const card = PRESENT.slice(PRESENT.indexOf("function ChoicesOnDeviceCard"));
  assert(/Answer on your device/.test(card), "it must point the room somewhere");
  assert(/\$\{count\} choices/.test(card), "and say how many choices they are looking for");
});

test("the choices are gated on the setting, not on the question", () => {
  const gate = PRESENT.slice(PRESENT.indexOf("optionCount > 0 &&"));
  assert(
    /showOptions \? \(/.test(gate),
    "the option grid must sit behind the toggle"
  );
  // This assertion used to read `visual={"idle" as OptionVisual}` — the option was
  // pinned neutral because the page had no key at all. Q15b gave it one, so the
  // invariant moved rather than went away: the ONLY thing that may un-pin an
  // option is a key the server has already agreed to hand over.
  assert(
    /answerKey !== undefined && isOptionInAnswer\(i, answerKey\)/.test(gate) &&
      /: "idle"/.test(gate),
    "an option may only leave the neutral visual because of a revealed key"
  );
});

// ─── [3] Q16 — the theme is a broadcast decision ──────────────────────────────
console.log("\n[3] Q16 — dark and light, chosen from the cockpit");

test("the theme is persisted on the exam row, not held in a window", () => {
  assert(/present_theme/.test(SQL), "the migration must add the column");
  assert(
    /CHECK \(present_theme IN \('dark', 'light'\)\)/.test(SQL),
    "an unconstrained text column eventually holds 'Dark'"
  );
  assert(
    /'present_theme',\s+v_exam\.present_theme/.test(SQL),
    "live_session_sync must carry it, or a reloaded projector loses the frame"
  );
  assert(
    /'present_show_options',\s+v_exam\.present_show_options/.test(SQL),
    "same for the options toggle"
  );
});

test("the last live_session_sync across the migrations carries every setting", () => {
  // Several migrations redefine live_session_sync, and whichever runs LAST is
  // the one the database keeps — CREATE OR REPLACE does not merge bodies. That
  // is the only ordering property that matters, and asserting "nothing redefines
  // it after this point" was a proxy for it that expired the moment another
  // setting was added.
  //
  // This used to read supabase/APPLY_REMAINING.sql, a consolidated paste-once
  // file. That file has been retired: its content stopped at 20260812000000, so
  // pasting it after 20260815000000 silently reverted two function bodies. The
  // migrations directory is now the deployment channel, and filename order IS
  // apply order — so the last definition here is the one that wins.
  const LATEST_SYNC = readdirSync(resolve(ROOT, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readMigration(f))
    .join("\n");

  const defs = [...LATEST_SYNC.matchAll(/CREATE OR REPLACE FUNCTION public\.live_session_sync/g)];
  assert(defs.length > 0, "the migrations must define live_session_sync at least once");
  const last = LATEST_SYNC.slice(defs[defs.length - 1].index);

  for (const key of [
    "present_show_leaderboard",
    "present_show_river",
    "present_show_options",
    "present_reveal_answer",
    "present_theme",
    "score_visible",
  ]) {
    assert(
      last.includes(key),
      `the final definition drops ${key} — the setting would silently stop reaching every client`
    );
  }
});

test("a client running ahead of the migration falls back, never throws", () => {
  // This used to assert `sync.present_show_options !== false`, which quietly
  // turned "the payload is silent" into "the setting is on". That guess is right
  // for a column defaulting true and wrong for one defaulting false, and a
  // Realtime payload built from a stale column list hits it either way.
  assert(
    /presentShowOptions: payloadBool\(sync, "present_show_options"\)/.test(SESSION),
    "a missing key must be undefined, so the merge can keep what it had"
  );
  assert(
    /presentShowOptions: next\.presentShowOptions \?\? cur\.presentShowOptions/.test(SESSION),
    "and the merge must actually keep it"
  );
  assert(
    /isStageTheme\(value\) \? value : "dark"/.test(SESSION),
    "a present-but-invalid theme string must still validate down to dark"
  );
});

test("the theme is remembered locally only to cover the first round trip", () => {
  assert(/readStageTheme/.test(PRESENT) && /writeStageTheme/.test(PRESENT), "both halves must be wired");
  assert(
    /session\.loading \? rememberedTheme : session\.presentTheme/.test(PRESENT),
    "the row must win the instant it lands — the cache is only for the flash before it"
  );
});

test("both new settings preview instantly over the peer channel", () => {
  assert(/showOptions\?: boolean/.test(CHANNEL) && /theme\?: StageTheme/.test(CHANNEL), "the intent must carry them");
  assert(
    /showOptions: intent\.showOptions \?\? cur\.showOptions/.test(PRESENT),
    "an omitted field means unchanged, so one switch cannot reset the others"
  );
  assert(
    /present_show_options: patch\.presentShowOptions/.test(CONTROL) &&
      /present_theme: patch\.presentTheme/.test(CONTROL),
    "the control room must persist them too — the broadcast is a preview, not the truth"
  );
});

test("the settings menu offers both, grouped by whose eyes they are about", () => {
  assert(
    /onChange\(\{ presentShowOptions: v \}\)/.test(MENU),
    "Q15 must be reachable mid-session"
  );
  assert(/STAGE_THEME_OPTIONS/.test(MENU), "Q16 must be reachable mid-session");
  // The headings' wording is not the property — their existence is. Six flat
  // switches stopped scanning, so the menu must still be split into labelled
  // groups, whatever those labels have since been reworded to.
  const headings = (MENU.match(/<SectionLabel>/g) || []).length;
  assert(headings >= 2, "the two audiences must stay labelled as separate groups");
});

// ─── [4] The redesign's own invariants ───────────────────────────────────────
console.log("\n[4] What the redesign must not lose");

test("the rescue controls sit in the footer flow, not on top of it", () => {
  // They used to be absolutely positioned over the bottom-left corner, where they
  // clipped the room count that lives there.
  assert(/<footer/.test(PRESENT), "there must be a real footer row");
  assert(
    !/absolute bottom-4 left-4/.test(PRESENT),
    "floating chrome overlapped the one row it shares a corner with"
  );
  assert(
    /chromeVisible \? "opacity-100" : "pointer-events-none opacity-0"/.test(PRESENT),
    "and must still fade, so a photograph of the wall does not contain them"
  );
});

test("time-up is stated once, with its consequence", () => {
  const stripped = stripComments(PRESENT);
  assert(
    (stripped.match(/Answers locked/g) || []).length >= 1,
    "the room's actual question is whether it can still change its answer"
  );
  assert(
    !/idleLabel=\{isEnded \? "Done"/.test(stripped),
    "the old ring/footer pair said 'Time up' twice and explained it neither time"
  );
});

test("the question keeps a reading measure", () => {
  assert(/QUESTION_MEASURE/.test(PRESENT), "full-frame lines on a 16:9 wall are ~90 characters");
  assert(
    /maxWidth: hasPassage \? undefined : QUESTION_MEASURE/.test(PRESENT),
    "but a passage renders its own two columns and must not be squeezed"
  );
});

test("the fit ceiling no longer does the shrinking", () => {
  assert(
    /maxPx: 88/.test(PRESENT),
    "at 64 a six-word question stopped growing with two thirds of a 4K frame empty"
  );
  assert(/useFitText/.test(PRESENT), "and the measurement itself must stay");
});

test("joining stays on screen for the whole session", () => {
  // A room fills up in the first minute. A livestream audience arrives for an hour.
  assert(/dense=\{isRunning\}/.test(PRESENT), "it must shrink while a question is open, not vanish");
  assert(/dense/.test(HUD), "and the hud must implement that size");
  assert(
    /typedUrl/.test(HUD),
    "a stream viewer cannot scan a QR off the screen they are watching it on"
  );
});

test("fullscreen is the only thing the wall drives itself", () => {
  assert(/requestFullscreen/.test(PRESENT), "browser chrome across the top of a stream is the common failure");
  assert(
    /!event\.metaKey/.test(PRESENT) && /!event\.ctrlKey/.test(PRESENT),
    "Ctrl+F must stay find-in-page"
  );
  const stripped = stripComments(PRESENT);
  assert(
    !/updateLiveExam/.test(stripped),
    "every persisted setting still belongs to the control room; the wall stays read-only"
  );
});

test("no notification surface, and the only key the wall can reach is a revealed one", () => {
  const stripped = stripComments(PRESENT);
  assert(!/useToast/.test(stripped), "there is nowhere on this route for one to render");
  assert(
    /fetchAllLiveQuestionsStudent/.test(stripped) && !/fetchAllLiveQuestions\(/.test(stripped),
    "the questions must come from the column-less student view, never the creator's"
  );
  // Q15b: this assertion used to be `no fetchRevealedAnswers at all`, which was the
  // right guard while the wall had nothing to draw a key for. What it was really
  // protecting is unchanged and stated directly here — the page may not touch a
  // correct_answer that has not been through the server's deadline gate.
  assert(
    !/correct_answer/.test(stripped),
    "the wall must never read the raw column; get_revealed_live_answers is the only path"
  );
  assert(
    /fetchRevealedAnswers/.test(stripped),
    "and that is the function it uses"
  );
});

// ─── [5] Every frame shape, not just the one it was designed on ──────────────
console.log("\n[5] Aspect ratios — a wall, an ultrawide window, a portrait stream");

test("the fit verifies what it chose instead of trusting its probes", () => {
  // The bug: a binary search believes every probe. Probe against content that is
  // still arriving — a font swapping, KaTeX rendering, an image decoding — and the
  // bracket is wrong, which on this screen means a question hanging out of its
  // frame with its options clipped off the bottom, permanently.
  assert(
    /while \(chosen > opts\.minPx && !fits\(chosen\)/.test(FIT),
    "there must be a verification pass after the search"
  );
  assert(
    /correctionsRef/.test(FIT) && /MAX_CORRECTIONS/.test(FIT),
    "and the corrections must be bounded, or a layout that cannot settle loops"
  );
});

test("overflow is self-healing, whatever caused it", () => {
  const observers = (FIT.match(/new ResizeObserver/g) || []).length;
  assert(observers >= 2, "the content needs an observer of its own, not just the frame");
  assert(
    /c\.scrollHeight <= b\.clientHeight && c\.scrollWidth <= b\.clientWidth\) return/.test(FIT),
    "only genuine overflow may trigger a re-fit — re-fitting on every shrink oscillates"
  );
  assert(/measuringRef\.current\) return/.test(FIT), "and our own probe writes must not re-enter");
});

test("nothing that changes the frame is sized from what the frame decided", () => {
  // THE PULSING BUG. The answer river is a sibling of the measured box in the same
  // flex column, so its height comes out of the space the fit search is choosing a
  // size to fit. It was sized with `fontSize: fit.fontSizePx`, which closed a loop:
  //   bigger font → taller river → shorter box → smaller font → shorter river →
  //   taller box → bigger font → …
  // Gain above 1, so it never converged. The wall visibly zoomed in and out once
  // per debounce for the whole of every question.
  const stripped = stripComments(PRESENT);
  const river = stripped.slice(stripped.indexOf("riverEnabled && riverCounts"));
  assert(
    /fontSize: RIVER_SIZE/.test(river),
    "the river must carry its own size, independent of the measurement"
  );
  assert(
    !/fontSize: fit\.fontSizePx/.test(river.slice(0, river.indexOf("</aside>") + 1)),
    "a sibling of the measured box may never be sized from fit.fontSizePx"
  );
  assert(
    /const RIVER_SIZE = "clamp\(/.test(PRESENT),
    "and that size must be a viewport clamp — an independent variable"
  );
});

test("the fit hook cannot be driven into a permanent oscillation", () => {
  // Defence in depth for the above: the caller fixed the coupling, but a hook that
  // any ordinary flex layout can put into a forever-loop is not finished. The frame
  // observer used to RESET the correction budget on every notification, so the one
  // bound that exists never applied to the one observer that echoes our own output.
  assert(/MAX_FRAME_REFITS/.test(FIT), "frame-driven re-fits must be budgeted");
  assert(
    /frameRefitsRef\.current >= MAX_FRAME_REFITS\) return/.test(FIT),
    "and the budget must actually stop the re-fit"
  );
  assert(
    !/new ResizeObserver\(reframe\)/.test(FIT),
    "the frame observer must not share a handler with the window — that handler resets the budget"
  );
  assert(
    /window\.addEventListener\("resize", external\)/.test(FIT),
    "only signals from outside the layout may restore it"
  );
  const frameObserver = FIT.slice(FIT.indexOf("const frame = new ResizeObserver"));
  assert(
    /measuringRef\.current\) return/.test(frameObserver.slice(0, 300)),
    "and it must ignore the resizes our own probes cause"
  );
  assert(
    /FRAME_EPSILON_PX/.test(frameObserver.slice(0, 600)),
    "fractional flex heights jitter; that must not spend the budget"
  );
});

test("the river holds one shape from the first paint", () => {
  // The tally lands up to 750ms after the question, and an empty counts array meant
  // the whole block appeared a beat late — resizing the box the question had already
  // been measured into, so it jumped once per question.
  assert(
    /new Array\(optionCount\)\.fill\(0\)/.test(PRESENT),
    "the rows must render at zero immediately, not when the first poll returns"
  );
  assert(
    /waiting for the first answer/.test(PRESENT),
    "and empty bars need to say they are listening, or they read as a broken widget"
  );
});

test("a frame with no height yet is retried, not abandoned", () => {
  // Returning silently here was the hole that let a stale size survive: `measured`
  // was already true from an earlier question, so the caller rendered the old size
  // into a differently-shaped frame and nothing ever asked again.
  const guard = FIT.slice(FIT.indexOf("available <= 0"));
  assert(/requestAnimationFrame/.test(guard.slice(0, 400)), "a zero-height box must be re-tried");
});

test("a late web font re-fits", () => {
  assert(/document\.fonts\?\.ready/.test(FIT), "the most common reason a first measurement is wrong");
  assert(
    /orientationchange/.test(FIT),
    "a rotated tablet or monitor changes the frame without changing the window's area"
  );
});

test("the structural breakpoint is width AND aspect ratio, never width alone", () => {
  // The frame that broke was wide and short: a width-only breakpoint gave it a
  // side rail and two option columns, when the scarce axis was vertical.
  assert(
    /@media \(min-width: 60rem\) and \(min-aspect-ratio: 1\/1\)/.test(CSS),
    "the rail-beside layout must be gated on shape, not size"
  );
  assert(/@media \(max-height: 46rem\)/.test(CSS), "and short frames need a density tier");
});

test("the page states intent and lets the stylesheet decide", () => {
  assert(/className="stage-rail"/.test(PRESENT), "no hard-coded rail width in the component");
  assert(
    !/w-\[clamp\(16rem,21vw,22rem\)\]/.test(PRESENT),
    "a fixed rail width is the same width-only assumption in another spelling"
  );
  assert(
    /data-multi=\{optionCount > 3\}/.test(PRESENT),
    "two columns is a request the frame may refuse"
  );
});

test("a long unbroken option wraps instead of widening the grid", () => {
  assert(
    /grid-template-columns: minmax\(0, 1fr\)/.test(CSS),
    "`1fr` floors at auto, so one long token pushes the grid past its frame"
  );
});

test("measurement freezes every descendant transition while it probes", () => {
  // The bug that survived the first responsive pass, found by reproducing it in
  // headless Edge: the option cards carried `transition-all`, and in display mode
  // their entire layout is in ems of an INHERITED font size. `all` includes
  // font-size, and a transition at t=0 still reports its STARTING layout — the
  // probes are synchronous, so no time ever passed. Every probe therefore saw the
  // options at the PREVIOUS question's size, concluded that 87px "fits", and the
  // options were clipped off the projector 150ms later when the transition landed.
  assert(
    /transition: none !important/.test(FIT),
    "probes are only honest if each probed size is assumed immediately"
  );
  assert(
    /animation-play-state: paused !important/.test(FIT),
    "paused, not none — `animation: none` restarts every entrance on class removal"
  );
  assert(
    /classList\.add\(FREEZE_CLASS\)/.test(FIT) &&
      /finally \{\s*content\.classList\.remove\(FREEZE_CLASS\)/.test(FIT),
    "the freeze must come off even if a probe throws"
  );
});

test("the projected option card transitions nothing", () => {
  // Defence in depth with the freeze above: the wall is never interactive, so the
  // transition bought nothing there to begin with.
  assert(
    /rounded-xl transition-all/.test(OPTION),
    "app modes keep their hover/selection transition"
  );
  assert(
    !/text-left transition-all/.test(OPTION) && !/\$\{display \? "[^"]*transition/.test(OPTION),
    "display mode must not put transition-all on an em-sized card"
  );
});

test("the frame is viewport height even where dvh is unsupported", () => {
  const frame = CSS.slice(CSS.indexOf(".stage-frame {"), CSS.indexOf(".stage-pad {"));
  assert(
    /height: 100vh;[\s\S]*height: 100dvh;/.test(frame),
    "an auto-height frame lets the question measure against infinity and overflow every screen"
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
