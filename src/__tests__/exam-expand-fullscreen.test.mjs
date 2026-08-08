/**
 * EXAM RUNNER — EXPAND TO FULL SCREEN
 *
 * Run with: node src/__tests__/exam-expand-fullscreen.test.mjs
 *
 * One button in the top-right of the runner, doing two things that only make
 * sense together:
 *
 *  [1] It lifts the reading-width caps. max-w-7xl on the header and the section
 *      strip, max-w-6xl on the question column and its action bar: on a 1920 or
 *      2560px monitor those render a 1280px column with grey either side. For a
 *      passage-plus-question split that wants two real columns, that is most of
 *      the screen spent on nothing.
 *  [2] It asks the browser for fullscreen. The tab strip and bookmarks bar above
 *      the page are the other half of the wasted screen, and no amount of CSS
 *      reaches them.
 *
 * Four ways this breaks quietly, which is why the assertions exist at all:
 *
 *  • Keeping Tailwind's `container` alongside `max-w-none`. `container` carries
 *    its own max-width (1400px at 2xl in tailwind.config.ts), so "full width"
 *    would still stop at 1400px — on exactly the monitors wide enough to care,
 *    and nowhere else. The class has to come off, not be overridden.
 *  • Fullscreening the exam frame instead of documentElement. Every dialog,
 *    sheet and popover in this page is portalled to document.body: they would
 *    render outside the fullscreen subtree and simply not appear. Submit becomes
 *    a dead button, mid-exam.
 *  • Reading the state off `document.fullscreenElement` instead of keeping our
 *    own flag. requestFullscreen can be refused (an iframe without
 *    allow-fullscreen, kiosk policies) and the width change still has to happen.
 *  • Forgetting that Esc is the top layer's key. A dialog, the palette sheet and
 *    the section popover all close on it; collapsing the exam underneath at the
 *    same time turns one keypress into two visible actions.
 *
 * Nothing here throws when it regresses. It just looks like the button did
 * nothing, or did too much.
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

const SIM = readSrc("pages/ExamSimulator.tsx");
const TAILWIND = readFileSync(resolve(ROOT, "tailwind.config.ts"), "utf-8");

console.log("\n══ Exam runner — expand to full screen ══");

// ─── [1] The control ────────────────────────────────────────────────────────
console.log("\n[1] One button, in the header");

test("the toggle sits in the header, not in the scrolling column", () => {
  const header = SIM.slice(SIM.indexOf("{/* Header"), SIM.indexOf("{/* Section tab strip"));
  assert(header.length > 0, "the header block markers moved — this slice found nothing");
  assert(
    /onClick=\{toggleExpanded\}/.test(header),
    "a view control that scrolls away with a long passage is unreachable exactly when the screen is too small"
  );
});

test("the icon says which way the button goes", () => {
  assert(/Maximize2/.test(SIM) && /Minimize2/.test(SIM), "both icons must be imported");
  assert(
    /isExpanded \? <Minimize2[\s\S]{0,80}: <Maximize2/.test(SIM),
    "expanded shows Minimize, collapsed shows Maximize — the same glyph for both states reads as a no-op"
  );
});

test("the toggle is labelled for screen readers and names the way out", () => {
  assert(/aria-pressed=\{isExpanded\}/.test(SIM), "an icon-only toggle needs its state announced");
  assert(/aria-label=\{isExpanded \?/.test(SIM), "an icon-only button needs a name");
  assert(/Esc\)/.test(SIM), "the keyboard way out has to be discoverable from the button itself");
});

// ─── [2] Full width means full width ────────────────────────────────────────
console.log("\n[2] Both width caps come off together");

test("every cap in the frame flows through the two derived strings", () => {
  assert(/const chromeWidth = isExpanded \?/.test(SIM), "the header/strip cap must be derived");
  assert(/const columnWidth = isExpanded \?/.test(SIM), "the question-column cap must be derived");
  // A cap left hardcoded anywhere in the frame keeps its row narrow while the
  // rows around it widen — a broken-looking layout, not a smaller one.
  const strays = SIM.split("\n").filter(
    (line) =>
      /className=/.test(line) && /max-w-(6|7)xl/.test(line)
  );
  assert(
    strays.length === 0,
    `these rows still hardcode a width cap and would not expand:\n${strays.join("\n")}`
  );
});

test("`container` is dropped, not overridden", () => {
  assert(
    /"container max-w-7xl"/.test(SIM),
    "the collapsed branch should still carry container + max-w-7xl, exactly as before"
  );
  assert(
    !/container[^"'`]*max-w-none|max-w-none[^"'`]*container/.test(SIM),
    "container carries its own max-width, so keeping it would cap 'full width' at the 2xl screen size"
  );
  assert(
    /"2xl": "1400px"/.test(TAILWIND),
    "this test's reasoning depends on container having a max-width of its own; if that is gone, revisit it"
  );
});

// ─── [3] Fullscreen, without losing the dialogs ─────────────────────────────
console.log("\n[3] Fullscreen on documentElement");

test("fullscreen is requested on documentElement", () => {
  assert(
    /document\.documentElement\.requestFullscreen\?\.\(\)/.test(SIM),
    "portalled dialogs, sheets and popovers render outside a fullscreened inner element — including Submit"
  );
  assert(
    !/questionScrollRef\.current\??\.requestFullscreen|examFrameRef[\s\S]{0,40}requestFullscreen/.test(SIM),
    "fullscreening an inner node is the failure mode this asserts against"
  );
});

test("a refused request still widens the layout", () => {
  // Our own flag, set before/independently of the browser's answer.
  assert(
    /const \[isExpanded, setIsExpanded\] = useState\(false\)/.test(SIM),
    "the width has to be driven by our own state, not by document.fullscreenElement"
  );
  assert(
    /catch\(\(\) => \{\}\)/.test(SIM),
    "requestFullscreen rejects when policy forbids it; an unhandled rejection is not a reason to skip the resize"
  );
  const enter = SIM.slice(SIM.indexOf("const enterExpanded"), SIM.indexOf("const collapseExpanded"));
  assert(enter.length > 0, "enterExpanded moved — this slice found nothing");
  assert(
    enter.indexOf("setIsExpanded(true)") < enter.indexOf("requestFullscreen"),
    "set the flag first: the width change must not be conditional on the browser saying yes"
  );
});

// ─── [4] Every way back out ─────────────────────────────────────────────────
console.log("\n[4] Esc, F11, and the browser's own exit");

test("leaving fullscreen from outside the page collapses the width with it", () => {
  assert(
    /addEventListener\("fullscreenchange", sync\)/.test(SIM),
    "Esc in native fullscreen is swallowed by the browser — fullscreenchange is the only signal we get"
  );
  assert(
    /if \(!document\.fullscreenElement\) setIsExpanded\(false\)/.test(SIM),
    "windowed-but-still-edge-to-edge is a half-state, with a Minimize button that looks broken"
  );
  assert(
    /removeEventListener\("fullscreenchange", sync\)/.test(SIM),
    "the listener must be torn down with the page"
  );
});

test("Esc collapses when the exam is the top layer", () => {
  const esc = SIM.slice(SIM.indexOf("Esc as the way out"), SIM.indexOf("// Spin up the Web Worker"));
  assert(esc.length > 0, "the Esc handler's comment markers moved — this slice found nothing");
  assert(/event\.key !== "Escape"/.test(esc), "only Escape");
  assert(
    /window\.addEventListener\("keydown", onKeyDown\)/.test(esc) &&
      /removeEventListener\("keydown", onKeyDown\)/.test(esc),
    "the keydown listener must be added and removed"
  );
});

test("Esc yields to anything open on top of the exam", () => {
  const esc = SIM.slice(SIM.indexOf("Esc as the way out"), SIM.indexOf("// Spin up the Web Worker"));
  for (const flag of [
    "isAllQuestionsOpen",
    "isPaletteOpen",
    "showSubmitDialog",
    "showTimeWarning",
    "showSectionCompleteDialog",
  ]) {
    assert(
      esc.includes(flag),
      `Escape closes the ${flag} layer; collapsing the exam at the same time makes one keypress do two things`
    );
  }
  assert(
    /data-radix-popper-content-wrapper/.test(esc),
    "the section picker's popover is not in React state — the DOM is the only way to see it"
  );
});

test("navigating away hands the browser chrome back", () => {
  assert(
    /Submitting navigates away/.test(SIM) &&
      /if \(document\.fullscreenElement\) void document\.exitFullscreen/.test(SIM),
    "a fullscreen results page has no exit control of its own; leaving the runner has to release fullscreen"
  );
});

// ─── [5] Starting the exam takes the screen ─────────────────────────────────
console.log("\n[5] Start enters expanded mode by itself");

const START = SIM.slice(SIM.indexOf("const handleStartSection"), SIM.indexOf("const updateQuestionTime"));

test("Start expands, and does it before the awaits", () => {
  assert(START.length > 0, "handleStartSection moved — this slice found nothing");
  assert(/enterExpanded\(\)/.test(START), "starting the exam should take the whole screen without being asked");
  assert(
    START.indexOf("enterExpanded()") < START.indexOf("await supabase"),
    "fullscreen is granted on transient activation: after an auth round trip and an insert, the click's grant may be spent"
  );
});

test("Start does not expand where fullscreen will never be granted", () => {
  assert(
    /if \(document\.fullscreenEnabled\) enterExpanded\(\)/.test(START),
    "iOS Safari fullscreens video only, and no width cap binds at phone width — expanding there earns a Minimize button that does nothing"
  );
});

test("an exam that fails to start gives the screen back", () => {
  const undos = START.match(/collapseExpanded\(\)/g) || [];
  assert(
    undos.length >= 2,
    "both failure paths — the attempt insert returning nothing, and the catch — must undo it; " +
      "a fullscreen start card with an error toast has no browser chrome and no way back"
  );
});

test("the way out is never narrower than the way in", () => {
  // Auto-expand reaches phones (Android grants fullscreen), and a phone has no
  // Esc key. A collapse control hidden at that width would be a trap.
  assert(
    /className=\{isExpanded \? "px-2" : "hidden sm:inline-flex px-2"\}/.test(SIM),
    "the toggle must be visible at every size while expanded, whatever it does when collapsed"
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
