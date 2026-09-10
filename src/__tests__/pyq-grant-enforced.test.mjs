/**
 * THE PYQ BADGE REQUIRES ITS GRANT (issue 17)
 *
 * Run with: node src/__tests__/pyq-grant-enforced.test.mjs
 *
 * profiles.can_set_paper_type was an authorization boundary enforced only by
 * the UI hiding a selector — the database accepted paper_type='pyq' from any
 * creator via the API, handing out the gold badge, the ?type=pyq listing and
 * the SEO shelf on the honor system.
 *
 * Migration 20260840000000 adds the missing server-side rule: a browser role
 * CHANGING paper_type to 'pyq' must hold the grant. Server functions pass by
 * role (the attempts_lock_columns pattern), and — owner-confirmed design —
 * revoking a grant keeps existing marks: only the TRANSITION is gated, so a
 * revoked creator can still save unrelated edits on an already-PYQ exam.
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

const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260840000000_pyq_grant_enforced.sql"),
  "utf-8"
);

console.log("\nTHE PYQ BADGE REQUIRES ITS GRANT\n");

test("a browser setting paper_type='pyq' must hold the grant", () => {
  assert(
    MIGRATION.includes("BEFORE INSERT OR UPDATE ON public.exams"),
    "the gate must cover creating-as-pyq and flipping-to-pyq alike"
  );
  assert(
    MIGRATION.includes("p.id = auth.uid() AND p.can_set_paper_type = true"),
    "the trigger must consult the admin-granted flag for the caller"
  );
  assert(
    MIGRATION.includes("PAPER_TYPE_NOT_GRANTED"),
    "the refusal needs a recognisable error name"
  );
});

test("only the TRANSITION is gated — revoke keeps existing marks", () => {
  assert(
    MIGRATION.includes("TG_OP = 'INSERT' OR NEW.paper_type IS DISTINCT FROM OLD.paper_type"),
    "an update that leaves 'pyq' unchanged must pass, or revoking bricks saves on old PYQ exams"
  );
});

test("server functions pass by role — the admin console needs no rewrite", () => {
  assert(
    MIGRATION.includes("current_user NOT IN ('authenticated', 'anon')"),
    "SECURITY DEFINER functions (admin_set_paper_type_access) must pass"
  );
});

test("the migration guards its dependency and proves itself", () => {
  assert(
    MIGRATION.includes("apply 20260825000000_add_exam_paper_type.sql first"),
    "the grant column must exist before the trigger reads it"
  );
  assert(
    MIGRATION.includes("revoking a grant would brick saves on existing PYQ exams"),
    "the self-check must pin the transition-only rule"
  );
  assert(
    MIGRATION.includes("admin functions would be blocked"),
    "the self-check must pin the role passthrough"
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
