/**
 * DELETING A SECTION NAMES ITS VICTIMS FIRST (issue 32, option A)
 *
 * Run with: node src/__tests__/section-delete-warning.test.mjs
 *
 * attempts.section_id is ON DELETE CASCADE, so the section delete button is
 * the one action on the platform that physically erases student results —
 * and its dialog said only "the section and all its questions". Option A
 * (owner's choice, 2026-08-23): count the attempts across every language twin
 * when the dialog opens, put the number in red in the dialog, and make the
 * confirm button say what it is about to do. Zero students → the quiet dialog
 * it always was. A failed count degrades to the old dialog, never to a
 * blocked delete.
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

const SRC = readFileSync(resolve(ROOT, "src/pages/ExamDetail.tsx"), "utf-8");

console.log("\nDELETING A SECTION NAMES ITS VICTIMS FIRST\n");

test("opening the dialog counts the attempts, across every language twin", () => {
  const open = SRC.slice(
    SRC.indexOf("const handleDeleteSectionClick"),
    SRC.indexOf("const handleConfirmDeleteSection")
  );
  assert(
    open.includes('{ count: "exact", head: true }'),
    "a head-count query — the cheapest possible ask"
  );
  assert(
    open.includes("s.section_group_id === target.section_group_id"),
    "the delete removes every language twin, so the count must cover them all"
  );
  assert(
    open.includes("setDeleteImpactCount(null)"),
    "each open must reset the count — a stale number from the last section is a lie"
  );
});

test("the warning names the number and the consequences", () => {
  assert(
    SRC.includes("student attempt{deleteImpactCount === 1 ?"),
    "the red banner must carry the real count"
  );
  assert(
    SRC.includes("permanently erases"),
    "the dialog must say ERASES — 'delete the section' hid what actually dies"
  );
  assert(
    SRC.includes("Delete anyway — erase ${deleteImpactCount} attempt"),
    "the confirm button itself must state what it is about to do"
  );
});

test("zero students, unknown count, and failure all degrade to the quiet dialog", () => {
  assert(
    SRC.includes("deleteImpactCount !== null && deleteImpactCount > 0 && ("),
    "the banner renders only when there is a real, positive count"
  );
  assert(
    SRC.includes("never block a delete on a failed count"),
    "the count is information, not a gate — a network blip must not brick the button"
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
