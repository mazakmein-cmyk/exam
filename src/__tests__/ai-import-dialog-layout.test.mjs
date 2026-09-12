/**
 * AI PDF IMPORT DIALOG — the panel cannot be widened by its own content.
 *
 * Run with: node src/__tests__/ai-import-dialog-layout.test.mjs
 *
 * On 2026-09-12 a creator chose a PDF with a 70-character name and every
 * element of the dialog — file card, second model card, note, the primary
 * button — was cut off at the panel's right edge. The primitive's
 * DialogContent is display:grid; a grid track grows to the widest nowrap
 * child, and the app's 6px transparent scrollbar made the resulting
 * horizontal overflow invisible. The rework changed the shell to a flex
 * column with a pinned header and footer and a scrolling body. These guards
 * pin the properties that make the fix hold:
 *
 *  1. THE SHELL IS A FLEX COLUMN, not the primitive's grid, and nothing in
 *     the scroll body may push it wider (min-w-0 + overflow-x-hidden).
 *  2. LONG STRINGS BREAK: the file name, section chips and error text carry
 *     overflow-wrap:anywhere; the step detail wraps on phones and truncates
 *     only on sm+ (never shrink-0 truncate, which cannot truncate at all).
 *  3. PICK-ONE CONTROLS ARE REAL RADIO GROUPS (Radix), one selected idiom,
 *     and the blocked "replace" shows — and stores — the mode that will run.
 *  4. THE DROP ZONE IS A BUTTON named by the chosen file, with the remove
 *     control beside it, and the whole card (X included) catches drops.
 *  5. A STOP IS ANNOUNCED AND FOCUSED; the write shield lives inside the
 *     panel (so it can hold focus and clicks), has progressbar semantics, and
 *     the close X is hidden while rows land.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf8").replace(/\r\n/g, "\n");

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
const has = (text, needle, msg) => {
  if (!text.includes(needle)) throw new Error(msg ?? `missing: ${needle}`);
};
const lacks = (text, needle, msg) => {
  if (text.includes(needle)) throw new Error(msg ?? `must not contain: ${needle}`);
};
const count = (text, needle) => text.split(needle).length - 1;

const dialog = read("src/components/AiPdfImportDialog.tsx");
const render = dialog.slice(dialog.indexOf("// ─── Render ───"));
const service = read("src/services/aiImportService.ts");

// ─── 1. Shell ─────────────────────────────────────────────────────────────────
test("the panel is a flex column with a pinned header and footer and a scrolling body", () => {
  has(
    render,
    "flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 supports-[height:1dvh]:max-h-[88dvh]",
    "shell must override the primitive's grid, with a vh fallback for engines without dvh"
  );
  has(dialog, 'const HEADER = "border-b px-6 pb-4 pr-12 pt-6 text-left"', "header pinned with room for the close X");
  has(dialog, "min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-6 py-5", "body scrolls and cannot widen");
  has(dialog, 'const FOOTER = "gap-2 border-t px-6 py-4', "footer pinned below the body");
  lacks(render, "max-h-[88vh] overflow-y-auto", "the old scroll-everything shell must be gone");
});

test("every phase uses the same shell pieces", () => {
  if (count(render, "<DialogHeader className={HEADER}>") !== 3) throw new Error("three phases, three pinned headers");
  if (count(render, "<div className={BODY}>") !== 3) throw new Error("three phases, three scroll bodies");
  if (count(render, "<DialogFooter className={FOOTER}>") !== 3) throw new Error("three phases, three pinned footers");
});

// ─── 2. Long strings ─────────────────────────────────────────────────────────
test("long strings break instead of widening the panel", () => {
  has(render, 'className="line-clamp-2 text-sm font-medium leading-5 [overflow-wrap:anywhere]"', "the PDF name wraps to two lines");
  has(render, "text-foreground/80 [overflow-wrap:anywhere]", "section chips wrap anywhere");
  has(render, "break-words text-xs leading-relaxed text-foreground/90 [overflow-wrap:anywhere]", "error text wraps anywhere");
  has(render, 'className="px-3 py-2.5 [overflow-wrap:anywhere]"', "section names in the summary wrap anywhere");
  lacks(render, "shrink-0 truncate", "a shrink-0 truncate item can never truncate and leaks its width");
  has(
    render,
    'className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:max-w-[55%] sm:truncate sm:text-right"',
    "the step detail wraps on phones and truncates only in a real column"
  );
});

// ─── 3. Radio groups ─────────────────────────────────────────────────────────
test("language, model and add/replace are Radix radio groups sharing one selected idiom", () => {
  has(dialog, 'import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";');
  if (count(render, "<RadioGroupPrimitive.Root") !== 3) throw new Error("expected three radio groups");
  lacks(render, 'role="radio"', "hand-rolled role=radio buttons must be gone");
  has(dialog, "data-[state=checked]:border-primary data-[state=checked]:bg-primary/5", "the shared PICK idiom");
  has(render, "value={effectiveMode}", "a blocked replace shows the mode that will run");
  has(render, 'const effectiveMode: "append" | "replace" = mode === "replace" && replaceBlockedReason ? "append" : mode;');
  has(dialog, 'if (mode === "replace" && replaceBlockedReason) setMode("append");', "and the state follows the chips");
});

test("radio groups and the drop zone are named by their visible labels", () => {
  for (const id of ["ai-import-paper-label", "ai-import-language-label", "ai-import-model-label", "ai-import-mode-label"]) {
    has(render, `id="${id}"`, `${id} must be rendered`);
  }
  for (const id of ["ai-import-language-label", "ai-import-model-label", "ai-import-mode-label"]) {
    has(render, `aria-labelledby="${id}"`, `${id} must be referenced`);
  }
  has(
    render,
    'aria-labelledby={pdfFile ? "ai-import-paper-label ai-import-paper-name" : "ai-import-paper-label ai-import-paper-cta"}',
    "the drop zone's name includes the chosen file"
  );
  has(render, 'id="ai-import-paper-name"');
  has(render, 'id="ai-import-paper-cta"');
  has(render, 'aria-describedby="ai-import-paper-hint"');
  has(render, 'id="ai-import-replace-blocked"');
});

// ─── 4. Drop zone ────────────────────────────────────────────────────────────
test("the drop zone is a real button and the whole card, remove X included, catches drops", () => {
  has(render, "onDrop={(e) => {", "drag-and-drop still handled");
  lacks(render, 'role="button"', "no div pretending to be a button");
  lacks(render, "e.stopPropagation()", "the remove button is a sibling, so no propagation games");
  has(
    render,
    "if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;",
    "moving between zone and X must not drop the highlight"
  );
  // The handlers are on the wrapper, so a drop on the X never reaches the browser default (open the PDF).
  const card = render.slice(render.indexOf('className="relative"'), render.indexOf("<button", render.indexOf('className="relative"')));
  has(card, "onDragOver", "onDragOver is on the wrapper, before the button");
  has(card, "onDrop", "onDrop is on the wrapper, before the button");
  has(render, "aria-label={`Remove ${pdfFile.name}`}", "the remove button names its file");
  has(render, "onClick={() => setPdfFile(null)}");
});

// ─── 5. Announcements, focus, shield ─────────────────────────────────────────
test("a stopped run is announced, says what was happening, and Retry takes focus", () => {
  has(render, 'role="alert"', "the failure card is an alert");
  has(render, '<Button ref={retryRef} size="sm" onClick={retryFailed}>');
  has(render, "if (failure) retryRef.current?.focus();");
  has(render, '<DialogDescription role="status">', "phase changes are read out");
  has(render, 'className="sr-only" aria-live="polite"', "step changes are read out, not the clock");
  has(render, "Stopped at step {STEP_ORDER.indexOf(failure.stepId) + 1}: {STEP_DOING[failure.stepId]}", "a stopped step is not described as done");
  has(render, 'step.status === "active" || step.status === "failed" ? STEP_DOING[step.id] : step.label');
});

test("the write shield lives inside the panel, takes focus, has progressbar semantics, and hides the close X", () => {
  lacks(dialog, "createPortal", "a body portal cannot hold focus inside Radix's trap");
  has(render, 'className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-background/80 backdrop-blur-sm"');
  has(render, "ref={shieldRef} tabIndex={-1}");
  has(render, "if (committing) shieldRef.current?.focus();");
  has(render, 'role="progressbar"');
  has(render, "aria-label={step.label}", "each step's bar is named by its step");
  has(render, '"[&>button:last-child]:invisible"', "the X leaves the tab order while saving");
  has(dialog, "if (!next && committing) return;", "closing mid-write is still refused (pinned by the gating test too)");
});

// ─── Copy that must stay honest ───────────────────────────────────────────────
test("the done screen only claims a PDF is attached when one is", () => {
  has(dialog, "pdfAttached: !!ctx.uploaded?.publicUrl,");
  has(render, 'summary.pdfAttached ? " · PDF attached to the sections" : ""');
});

test("the step clock runs from when the step went active, and the live engine's cap is named", () => {
  has(dialog, 'const starting = patch.status === "active" && s.status !== "active" && patch.startedAt === undefined;');
  has(dialog, 'patchStep("gemini", { startedAt: ctx.jobStartedAt, eta: opt.eta.toLowerCase(), engine: opt.engine });');
  has(render, "formatElapsed(elapsed)");
  has(service, "export const LIVE_WALL_CLOCK_MS = 150_000;");
  has(render, 'step.engine === "live" ? LIVE_WALL_CLOCK_MS : SLOW_GEMINI_MS');
  lacks(service, '"Usually 2–5 min"', "the live engine cannot promise a range that ends past its own cut-off");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
