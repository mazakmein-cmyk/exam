/**
 * A REVOKE MUST NAME THE ROLES THAT ACTUALLY HOLD THE GRANT
 *
 * Run with: node src/__tests__/revokes-name-the-roles.test.mjs
 *
 * WHAT WAS BROKEN
 * 26 statements across this project's migrations read
 *
 *     REVOKE EXECUTE ON FUNCTION public.something(...) FROM PUBLIC;
 *
 * and removed nothing. A Supabase project ships with default privileges that
 * GRANT EXECUTE on every new function in `public` DIRECTLY to anon and
 * authenticated. PUBLIC was never the grant in use.
 *
 * It survived 26 repetitions because it looks verified — 20260833000000 checks
 * `has_function_privilege('public', ...)` and raises if PUBLIC can still
 * execute. That check passes. It tests a door nobody uses.
 *
 * WHY THE FIX IS NOT ONE BLANKET RULE
 * Most of these functions are SUPPOSED to be callable from a browser. Revoking
 * authenticated from all 20 would 403 the exam runner, the review screen and
 * the creator dashboard. 20260850000000 splits them by the GRANT that
 * accompanies each one, and leaves get_published_question_ids alone entirely
 * because it is granted to anon on purpose and referenced inside an RLS policy.
 *
 * THE ASSERTION THAT MATTERS MOST is the last one: no NEW migration may use the
 * FROM-PUBLIC-only form. The 26 are grandfathered by filename, because they are
 * already applied and 20260850000000 corrects their effect; anything newer has
 * no excuse.
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

const MIG_DIR = "supabase/migrations";
const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
const files = readdirSync(resolve(ROOT, MIG_DIR)).filter((f) => f.endsWith(".sql")).sort();

const FIX = "20260850000000_revokes_name_the_roles_that_matter.sql";
const MIG = read(`${MIG_DIR}/${FIX}`);
const CODE = MIG.replace(/--[^\n]*/g, "");

/** Names inside a declared TEXT[] literal in the fix migration. */
const listBetween = (from, to) => {
  const seg = CODE.slice(CODE.indexOf(from), CODE.indexOf(to));
  return new Set(seg.match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? []);
};
const INTERNAL = listBetween("v_internal TEXT[]", "v_authed   TEXT[]");
const AUTHED = listBetween("v_authed   TEXT[]", "v_has_anon");

console.log("\n══ Revokes name the roles that actually hold the grant ══");

// ─── [1] Coverage ───────────────────────────────────────────────────────────
console.log("\n[1] Every historical no-op is accounted for");

test("the two lists are disjoint and non-empty", () => {
  assert(INTERNAL.size > 0 && AUTHED.size > 0, "could not parse the function lists");
  const overlap = [...INTERNAL].filter((n) => AUTHED.has(n));
  assert(
    overlap.length === 0,
    `a function in both lists would be revoked from authenticated and then required to keep it: ${overlap.join(", ")}`
  );
});

test("every function with a FROM-PUBLIC-only revoke in history is covered", () => {
  const targets = new Set();
  for (const f of files) {
    if (f === FIX) continue;
    const src = read(`${MIG_DIR}/${f}`);
    for (const m of src.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? []) {
      const one = m.replace(/\s+/g, " ");
      const tail = one.split("FROM").pop() ?? "";
      if (/anon|authenticated/.test(tail)) continue;
      const name = (one.split("FROM")[0].match(/public\.(\w+)/) ?? [])[1];
      if (name) targets.add(name);
    }
  }
  const uncovered = [...targets].filter(
    (n) => !INTERNAL.has(n) && !AUTHED.has(n) && n !== "get_published_question_ids"
  );
  assert(
    uncovered.length === 0,
    `these still have only a no-op revoke and nothing re-issues it: ${uncovered.join(", ")}`
  );
});

// ─── [2] The app must keep working ──────────────────────────────────────────
console.log("\n[2] The app's own RPCs keep their grant");

test("nothing the client calls over rpc is in the internal list", () => {
  // The internal list loses `authenticated`. Anything the browser calls must
  // not be in it, or that feature 403s.
  const clientFiles = [];
  const walk = (dir) => {
    for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) clientFiles.push(rel);
    }
  };
  walk("src");
  const client = clientFiles.map((f) => read(f)).join("\n");

  const called = [...INTERNAL].filter(
    (n) => client.includes(`"${n}"`) || client.includes(`'${n}'`)
  );
  assert(
    called.length === 0,
    `the client references these by name and they are about to lose authenticated: ${called.join(", ")}`
  );
});

test("the internal list keeps authenticated out, the authed list keeps it in", () => {
  assert(
    /IF r\.internal AND v_has_auth THEN[\s\S]{0,200}FROM authenticated/.test(CODE),
    "only the internal group may lose authenticated"
  );
  assert(
    !/FROM PUBLIC, anon, authenticated/.test(CODE),
    "a single blanket revoke would take the grant from the app's own RPCs too"
  );
});

test("the deliberate exception is excluded and asserted", () => {
  assert(
    !INTERNAL.has("get_published_question_ids") && !AUTHED.has("get_published_question_ids"),
    "it is granted to anon on purpose and used inside an RLS policy; revoking anon silently strips per-question marks from signed-out browsing"
  );
  assert(
    /get_published_question_ids lost anon/.test(MIG),
    "and the self-check must fail if someone tidies it away later"
  );
});

// ─── [3] Robustness of the migration itself ─────────────────────────────────
console.log("\n[3] It survives a hand-pasted, partly-migrated database");

test("a function that does not exist yet is skipped, not fatal", () => {
  assert(
    /FROM pg_proc p[\s\S]{0,300}proname = ANY\(v_internal \|\| v_authed\)/.test(CODE),
    "driving the loop off pg_proc is what skips functions whose own migration has not been pasted; a bare REVOKE on a missing function aborts the whole script"
  );
  assert(
    /not installed yet/.test(MIG),
    "and the count should be reported, because silence would hide that a re-run is needed"
  );
});

test("absent roles are checked before being named", () => {
  assert(
    /rolname = 'anon'[\s\S]{0,120}INTO v_has_anon/.test(CODE),
    "a REVOKE naming a role that does not exist aborts the script"
  );
});

test("the privilege check is fed an oid, never a rendered signature", () => {
  // This failed on the first paste with
  //   invalid type name "p_attempt_id uuid"
  // has_function_privilege parses its second argument as a regprocedure, and
  // that parser takes argument TYPES and rejects argument NAMES — while
  // pg_get_function_identity_arguments includes the names. Because the SQL
  // editor runs the file in one transaction, the raise rolled the revokes back
  // with it, so the migration appeared to do nothing at all.
  assert(
    /has_function_privilege\('anon', r\.fnoid, 'EXECUTE'\)/.test(CODE),
    "pass the oid: it has no signature parser to upset"
  );
  assert(
    !/has_function_privilege\([^)]*v_sig/.test(CODE),
    "v_sig carries argument names and is for error messages only"
  );
  assert(
    /p\.oid AS fnoid/.test(CODE),
    "the loop has to select the oid for that to be possible"
  );
});

test("signatures come from the database, not from hand-typed argument lists", () => {
  assert(
    /pg_get_function_identity_arguments\(p\.oid\)/.test(CODE),
    "exact for overloads, and it cannot drift from what is installed"
  );
});

test("the self-check tests both directions", () => {
  assert(
    /lost their grant, which breaks the exam runner/.test(MIG),
    "an over-broad revoke does not look like a security fix; it looks like the runner 403ing at start"
  );
  assert(
    /still reachable from a browser/.test(MIG),
    "and the leak it exists to close"
  );
  assert(
    /has_function_privilege\('anon'/.test(CODE) &&
      /has_function_privilege\('authenticated'/.test(CODE),
    "the roles that matter — not has_function_privilege('public', ...), which is what made this invisible for 26 statements"
  );
});

// ─── [4] It cannot come back ────────────────────────────────────────────────
console.log("\n[4] No new migration may use the useless form");

test("any migration after the fix names anon and authenticated", () => {
  const offenders = [];
  for (const f of files) {
    if (f <= FIX) continue; // grandfathered: already applied, corrected by the fix
    const src = read(`${MIG_DIR}/${f}`);
    for (const m of src.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?;/g) ?? []) {
      const tail = m.replace(/\s+/g, " ").split("FROM").pop() ?? "";
      if (!/anon/.test(tail) || !/authenticated/.test(tail)) {
        offenders.push(`${f}: ${m.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
  }
  assert(
    offenders.length === 0,
    `FROM PUBLIC alone is a no-op on Supabase — name the roles:\n    ${offenders.join("\n    ")}`
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
  process.exit(1);
}
console.log("  The lock is on the door people actually use.\n");
