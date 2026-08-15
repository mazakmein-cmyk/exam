/**
 * LIVE EXAM — THE DISPLAY LANGUAGE SWITCHER
 *
 * Run with: node src/__tests__/live-display-language.test.mjs
 *
 * A creator running a Hindi room used to have no way to read the question in
 * Hindi off their own laptop, and no way to put Hindi on the projector at all:
 * both screens hard-coded `primary_language`. This adds one switch that moves
 * both.
 *
 * Three of these are load-bearing and the rest are ordinary.
 *
 * [2] is the one that matters most. The control room's `questions` array is the
 * session's spine — analytics rows are keyed by the primary-language question
 * id, unlock/undo address questions by it, and the compute-dedupe set holds it.
 * Re-pointing that array at a translated copy would re-key all three mid-session,
 * and the failure is silent and asymmetric: the class sees the right words while
 * the creator's analytics panel goes blank. So the spine stays primary and only
 * the rendered words move.
 *
 * [3] guards the same property from the other side: the correct answer is owned
 * by the primary language (the editor locks it there), so the preview's key must
 * keep coming from the primary row even when the words beside it do not.
 *
 * [5] is about a room, not a data model. The wall's language arrives only as a
 * BroadcastChannel intent, so if it were stored in `configPreview` — which is
 * cleared the moment the session row lands — the projector would snap back to
 * English about a second after the creator switched it, in front of everyone.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf-8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LANG = readSrc("lib/live/liveLanguage.ts");
const CHANNEL = readSrc("lib/live/presentChannel.ts");
const CONTROL = readSrc("pages/LiveExamControl.tsx");
const PRESENT = readSrc("pages/LiveExamPresent.tsx");
const STUDENT = readSrc("pages/LiveExamStudent.tsx");

const CONTROL_CODE = stripComments(CONTROL);
const PRESENT_CODE = stripComments(PRESENT);

console.log("\n══ LIVE EXAM — DISPLAY LANGUAGE ══");

// ─── [1] The resolver ────────────────────────────────────────────────────────
console.log("\n[1] An unsupported code can never reach a fetch");

test("resolveLiveLanguage falls back to primary, not to English", () => {
  // A Hindi-primary exam whose creator has never touched the switch must open in
  // Hindi. Defaulting to "en" here would have been invisible on every English
  // exam and wrong on every other one.
  const body = LANG.slice(LANG.indexOf("export function resolveLiveLanguage"));
  assert(/const fallback = primary \|\| "en"/.test(body), "primary must be the fallback");
  assert(
    /list\.includes\(wanted\) \? wanted : fallback/.test(body),
    "a code outside supported_languages must resolve to the fallback"
  );
});

test("readDisplayLanguage returns null rather than guessing", () => {
  const body = LANG.slice(LANG.indexOf("export function readDisplayLanguage"));
  assert(!/return "en"/.test(body), "guessing English here flashes the wrong language on reload");
  assert(/return null/.test(body), "an unknown answer must be null so the caller can resolve it");
});

test("localStorage access is guarded on both sides", () => {
  // A locked-down browser profile throws on access, not on write. Losing the
  // memory is a fallback to primary; an uncaught throw is a dead projector.
  const reads = LANG.match(/try \{/g) || [];
  assert(reads.length >= 2, "both read and write must be wrapped");
  assert(
    /typeof localStorage === "undefined"/.test(LANG),
    "SSR/no-storage environments must short-circuit before touching localStorage"
  );
});

test("both screens resolve through the same function", () => {
  for (const [name, code] of [["the control room", CONTROL], ["the wall", PRESENT]]) {
    assert(
      /resolveLiveLanguage\(/.test(code),
      `${name} must resolve the remembered code, not trust it`
    );
  }
});

// ─── [2] The control room's spine stays primary ──────────────────────────────
console.log("\n[2] Switching language must not re-key the session");

test("the questions array is still loaded in the primary language", () => {
  assert(
    /fetchAllLiveQuestions\(liveExamId, examData\.primary_language \|\| "en"\)/.test(CONTROL_CODE),
    "loadData must keep fetching the primary language for the spine"
  );
});

test("the translated copy lands in its own state, never in `questions`", () => {
  const effect = CONTROL_CODE.slice(
    CONTROL_CODE.indexOf("if (activeLanguage === primaryLanguage)")
  );
  const upTo = effect.slice(0, effect.indexOf("const inActiveLanguage"));
  assert(/setTranslations\(\{ byGroup, byIndex: qs \}\)/.test(upTo), "translations must be separate state");
  assert(
    !/setQuestions\(/.test(upTo),
    "the language fetch must never overwrite the primary-language spine"
  );
});

test("analytics are still read with the primary question id", () => {
  assert(
    /analytics\.get\(previewQuestion\.id\)/.test(CONTROL_CODE),
    "previewAnalytics must key off the primary row, not the translated one"
  );
  assert(
    !/analytics\.get\(previewDisplay/.test(CONTROL_CODE),
    "a translated id has no analytics row behind it"
  );
});

test("the group id is the primary link, position only the fallback", () => {
  const fn = CONTROL_CODE.slice(CONTROL_CODE.indexOf("const inActiveLanguage"));
  const body = fn.slice(0, fn.indexOf("[translations]"));
  assert(/translations\.byGroup\.get\(q\.question_group_id\)/.test(body), "must pair by question_group_id");
  assert(/translations\.byIndex\[index\]/.test(body), "must fall back by position");
  assert(
    body.indexOf("byGroup.get") < body.indexOf("byIndex["),
    "the group id must be tried first — position is only for pre-group-id rows"
  );
});

test("a missing translation falls back to the primary row", () => {
  const fn = CONTROL_CODE.slice(CONTROL_CODE.indexOf("const inActiveLanguage"));
  assert(
    /if \(!t\) return q;/.test(fn.slice(0, fn.indexOf("[translations]"))),
    "an untranslated question must render its primary text, not an empty preview"
  );
});

// ─── [3] The key stays the primary language's ────────────────────────────────
console.log("\n[3] The answer key is owned by the primary language");

test("the merge copies words and pictures only", () => {
  const fn = CONTROL_CODE.slice(CONTROL_CODE.indexOf("const inActiveLanguage"));
  const merge = fn.slice(fn.indexOf("return {"), fn.indexOf("[translations]"));
  for (const field of ["text:", "options:", "option_image_urls:", "image_url:", "image_urls:"]) {
    assert(merge.includes(field), `${field} should come from the translated row`);
  }
  for (const field of ["correct_answer", "id:", "answer_type", "time_seconds"]) {
    assert(
      !merge.includes(field),
      `${field} must stay the primary row's — it is what the rest of the page keys off`
    );
  }
});

test("the rendered key still reads previewQuestion", () => {
  assert(
    /isCorrectOption\(previewQuestion\.correct_answer, i\)/.test(CONTROL_CODE),
    "the option key must be compared against the primary answer"
  );
  assert(
    /previewQuestion\.answer_type === "numeric"/.test(CONTROL_CODE),
    "the numeric/text key panel must read the primary row"
  );
});

test("the question body and options render the translated copy", () => {
  assert(
    /LiveQuestionBody text=\{\(previewDisplay \?\? previewQuestion\)\.text\}/.test(CONTROL_CODE),
    "the preview body must render the chosen language"
  );
  assert(
    /\(previewDisplay \?\? previewQuestion\)\.options\.map/.test(CONTROL_CODE),
    "the options must render the chosen language"
  );
});

// ─── [4] The switcher itself ─────────────────────────────────────────────────
console.log("\n[4] The control, where the creator already is");

test("it is hidden on a single-language exam", () => {
  assert(
    /\{isMultiLang && \(\s*<Select value=\{activeLanguage\}/.test(CONTROL_CODE),
    "a one-option switcher promises a language that does not exist"
  );
});

test("the trigger shows the code, and cannot truncate", () => {
  // "English" in a fixed-width trigger came out as "Engl…" — a control that has
  // stopped naming its own state. The code fits every language at one width.
  const trigger = CONTROL_CODE.slice(CONTROL_CODE.indexOf("onValueChange={handleDisplayLanguageChange}"));
  const upTo = trigger.slice(0, trigger.indexOf("<SelectContent>"));
  assert(/activeLanguage\.toUpperCase\(\)/.test(upTo), "the trigger must show the two-letter code");
  assert(!/truncate/.test(upTo), "nothing in the trigger may ellipsize");
  assert(!/w-\[\d+px\]/.test(upTo), "a fixed width is what forced the truncation");
});

test("the full names are still one click away", () => {
  const menu = CONTROL_CODE.slice(CONTROL_CODE.indexOf("<SelectContent>"));
  const items = menu.slice(0, menu.indexOf("</SelectContent>"));
  assert(/info\?\.label \|\| code/.test(items), "the menu must name each language in full");
  assert(/info\.nativeLabel/.test(items), "and in its own script, for the reader who wants it");
});

test("the trigger still names the language to assistive tech", () => {
  const trigger = CONTROL_CODE.slice(CONTROL_CODE.indexOf("onValueChange={handleDisplayLanguageChange}"));
  const upTo = trigger.slice(0, trigger.indexOf("<SelectContent>"));
  assert(
    /aria-label=\{`Question language: \$\{liveLanguageInfo\(activeLanguage\)\?\.label/.test(upTo),
    "'EN' alone is not a label; the accessible name must carry the full language"
  );
  assert(
    /aria-hidden="true"/.test(upTo),
    "the flag is decoration — on Windows it renders as bare letters and would be read aloud"
  );
});

test("it sits on the preview header, beside the key toggle", () => {
  const header = CONTROL_CODE.slice(
    CONTROL_CODE.indexOf("Question preview · what students see")
  );
  const pane = header.slice(0, header.indexOf("min-h-0 flex-1 overflow-y-auto"));
  assert(/onValueChange=\{handleDisplayLanguageChange\}/.test(pane), "the switcher belongs on the preview");
  assert(/Show key/.test(pane), "it should sit with the other preview-scoped control");
});

test("changing it writes the memory and broadcasts, and writes no row", () => {
  const handler = CONTROL_CODE.slice(CONTROL_CODE.indexOf("const handleDisplayLanguageChange"));
  const body = handler.slice(0, handler.indexOf("[liveExamId, postToPresent]"));
  assert(/writeDisplayLanguage\(liveExamId, code\)/.test(body), "must survive a reload of the cockpit");
  assert(/postToPresent\(\{ t: "config", language: code \}\)/.test(body), "must reach the wall at once");
  assert(!/updateLiveExam/.test(body), "there is no column behind this, and there should not be");
});

test("the rail is labelled in the language being read", () => {
  assert(
    /questionPreviewText\(inActiveLanguage\(q, idx\)\?\.text \?\? q\.text, 48\)/.test(CONTROL_CODE),
    "a creator scanning the rail is scanning the words they said out loud"
  );
});

// ─── [5] It reaches the wall, and stays there ────────────────────────────────
console.log("\n[5] The projector follows, and does not snap back");

test("the channel carries a language field", () => {
  const config = CHANNEL.slice(CHANNEL.indexOf('t: "config"'));
  assert(/language\?: string;/.test(config.slice(0, config.indexOf("| { t: \"celebrate\""))),
    "the config intent must be able to carry a language");
});

test("the wall keeps language OUT of configPreview", () => {
  const preview = PRESENT_CODE.slice(PRESENT_CODE.indexOf("const [configPreview"));
  const shape = preview.slice(0, preview.indexOf("}>({});"));
  assert(
    !/language/.test(shape),
    "configPreview is cleared when the row lands; a language kept there reverts in front of the room"
  );
});

test("a received language is persisted, not just previewed", () => {
  const handler = PRESENT_CODE.slice(PRESENT_CODE.indexOf('if (intent.t === "config")'));
  assert(/setWallLanguage\(intent\.language\)/.test(handler), "the wall must adopt the language");
  assert(
    /writeDisplayLanguage\(liveExamId, intent\.language\)/.test(handler),
    "the projector must survive its own reload without the cockpit"
  );
});

test("the wall refetches its questions when the language changes", () => {
  assert(
    /fetchAllLiveQuestionsStudent\(liveExamId, language\)/.test(PRESENT_CODE),
    "the wall must load the chosen language, not primary_language"
  );
  assert(
    !/fetchAllLiveQuestionsStudent\(\s*liveExamId,\s*examData\.primary_language/.test(PRESENT_CODE),
    "the hard-coded primary fetch must be gone"
  );
});

test("the wall never blanks itself mid-switch", () => {
  const effect = PRESENT_CODE.slice(PRESENT_CODE.indexOf("fetchAllLiveQuestionsStudent(liveExamId, language)"));
  const body = effect.slice(0, effect.indexOf("[liveExamId, exam, language]"));
  assert(
    /if \(cancelled \|\| qs\.length === 0\) return;/.test(body),
    "an empty result must leave the previous language on screen"
  );
  assert(
    !/setQuestions\(\[\]\)/.test(body),
    "clearing first would put a blank frame in front of a room for the length of a request"
  );
});

test("the wall still uses the student view, in every language", () => {
  assert(
    !/fetchAllLiveQuestions\(/.test(PRESENT_CODE.replace(/fetchAllLiveQuestionsStudent\(/g, "")),
    "the projector must never touch the creator view — it carries correct_answer"
  );
});

// ─── [6] Students are untouched ──────────────────────────────────────────────
console.log("\n[6] A student's own choice is still their own");

test("the student page keeps its own independent switcher", () => {
  assert(
    /handleLanguageChange/.test(STUDENT),
    "students choose their own language on their own device"
  );
  assert(
    !/presentChannel|readDisplayLanguage|liveLanguage/.test(STUDENT),
    "the creator's broadcast choice must not reach into a student's device"
  );
});

console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
