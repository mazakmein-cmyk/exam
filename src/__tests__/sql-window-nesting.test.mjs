/**
 * EVERY MIGRATION — NO WINDOW FUNCTION NESTED WHERE POSTGRES REJECTS IT
 *
 * Run with: node src/__tests__/sql-window-nesting.test.mjs
 *
 * Why this file exists
 * --------------------
 * A creator opened a live session's report and got the whole page replaced by
 *
 *     aggregate function calls cannot contain window function calls
 *
 * build_live_exam_report had been passing ROW_NUMBER() OVER (...) as an argument
 * to jsonb_agg() since the day it shipped, and compute_live_moments had been
 * wrapping MAX(... ROW_NUMBER() OVER ...) in a second OVER (...) for a migration
 * longer than that. Neither had ever run successfully. Not once.
 *
 * Two things hid them, and both will hide the next one:
 *
 *   1. plpgsql does not parse a statement until control reaches it. CREATE OR
 *      REPLACE FUNCTION accepted both bodies without complaint, so the migration
 *      applied cleanly and `supabase/tests/verify_phase2.sql` saw a healthy
 *      function that existed and had the right signature.
 *   2. Both call sites swallow errors — end_live_session and
 *      compute_live_question_analytics each wrap the call in
 *      EXCEPTION WHEN OTHERS and only RAISE WARNING, on the reasonable grounds
 *      that a report or a confetti moment must never cost the class its
 *      rankings. So the failure was real, total, and completely silent.
 *
 * Every other test in this suite reads migrations as TEXT and asserts on the
 * words in them. That is the right shape for privacy and ordering properties,
 * but it cannot see a query that will not run. This one parses instead: it walks
 * parentheses, and fails on the two nestings Postgres refuses.
 *
 *   aggregate(... window() OVER ...)  →  "aggregate function calls cannot
 *                                         contain window function calls"
 *   window() OVER (...) containing
 *   another window() OVER (...)       →  "window function calls cannot be nested"
 *
 * A window function inside a SUBQUERY in either position is perfectly legal —
 * that is the fix for both bugs — so a SELECT between the two is not a finding.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, dirname, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SUPABASE = resolve(ROOT, "supabase");
const MIGRATIONS = resolve(SUPABASE, "migrations");

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

/**
 * True aggregates only. An ordinary function MAY take a window function —
 * ROUND(ROW_NUMBER() OVER (...)) is fine — so listing them would be noise.
 */
const AGGREGATES = new Set([
  "count", "sum", "avg", "min", "max",
  "jsonb_agg", "json_agg", "jsonb_object_agg", "json_object_agg",
  "array_agg", "string_agg", "bool_and", "bool_or", "every",
  "percentile_cont", "percentile_disc",
]);

/** Blank out -- comments, keeping length so reported line numbers stay true. */
const blankComments = (sql) =>
  sql.replace(/--[^\n]*/g, (m) => " ".repeat(m.length));

const lineOf = (sql, index) => sql.slice(0, index).split("\n").length;

/** Index of the ")" matching the "(" at `open`, or -1. */
function matchParen(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every `name(...)` call site in the file. */
function callSites(sql) {
  const sites = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(sql))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close !== -1) sites.push({ name: m[1].toLowerCase(), open, close });
  }
  return sites;
}

/** Is this call followed by OVER — optionally past a FILTER (...) clause? */
function hasOverClause(sql, close) {
  let i = close + 1;
  const filter = /^\s*FILTER\s*\(/i.exec(sql.slice(i, i + 200));
  if (filter) {
    const fOpen = i + filter[0].length - 1;
    const fClose = matchParen(sql, fOpen);
    if (fClose !== -1) i = fClose + 1;
  }
  return /^\s*OVER\s*[(A-Za-z_]/i.test(sql.slice(i, i + 24));
}

function findNestings(sql) {
  const src = blankComments(sql);
  const sites = callSites(src);
  const windows = sites.filter((s) => hasOverClause(src, s.close));
  const found = [];

  for (const outer of sites) {
    const outerIsWindow = hasOverClause(src, outer.close);
    if (!outerIsWindow && !AGGREGATES.has(outer.name)) continue;

    for (const inner of windows) {
      // Strictly inside the outer call's argument list.
      if (inner.open <= outer.open || inner.close >= outer.close) continue;
      // A subquery re-opens a scope, and that is exactly the legal form.
      if (/\bSELECT\b/i.test(src.slice(outer.open, inner.open))) continue;

      found.push({
        line: lineOf(sql, outer.open),
        outer: outer.name,
        inner: inner.name,
        error: outerIsWindow
          ? "window function calls cannot be nested"
          : "aggregate function calls cannot contain window function calls",
      });
      break; // one report per offending call is enough to fix it
    }
  }
  return found;
}

/**
 * Every .sql in supabase/, not only migrations/. APPLY_REMAINING.sql is a
 * hand-paste file that reproduces whole function bodies and advertises itself as
 * safe to re-run — so a stale copy of a broken body there would quietly reinstall
 * the bug over the top of a hotfix, and it carried both of these for weeks.
 */
function sqlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sqlFiles(full));
    else if (entry.endsWith(".sql")) out.push(full);
  }
  return out;
}

const files = sqlFiles(SUPABASE);

// ─── [1] The scanner detects what it claims to ───────────────────────────────
console.log("\n[1] The scanner works");

test("it catches an aggregate wrapped around a window function", () => {
  const hits = findNestings(
    "SELECT jsonb_agg(jsonb_build_object('n', ROW_NUMBER() OVER (ORDER BY a))) FROM t;"
  );
  assert(hits.length === 1, `expected 1 finding, got ${hits.length}`);
  assert(/aggregate function calls/.test(hits[0].error));
});

test("it catches one window function inside another", () => {
  const hits = findNestings(
    "SELECT MAX(x - ROW_NUMBER() OVER (ORDER BY x)) OVER (PARTITION BY u) FROM t;"
  );
  assert(hits.length === 1, `expected 1 finding, got ${hits.length}`);
  assert(/cannot be nested/.test(hits[0].error));
});

test("it allows the legal form — the window numbered in a subquery", () => {
  const hits = findNestings(
    `SELECT jsonb_agg(jsonb_build_object('n', s.rn))
     FROM (SELECT ROW_NUMBER() OVER (ORDER BY a) AS rn FROM t) s;`
  );
  assert(hits.length === 0, `expected no findings, got ${JSON.stringify(hits)}`);
});

test("it allows an ordinary function around a window function", () => {
  // Only aggregates and window functions are constrained; ROUND is neither.
  const hits = findNestings("SELECT ROUND(ROW_NUMBER() OVER (ORDER BY a)) FROM t;");
  assert(hits.length === 0, `expected no findings, got ${JSON.stringify(hits)}`);
});

test("a nesting hidden inside a comment is not a finding", () => {
  const hits = findNestings("-- SELECT jsonb_agg(ROW_NUMBER() OVER (ORDER BY a))\nSELECT 1;");
  assert(hits.length === 0, `expected no findings, got ${JSON.stringify(hits)}`);
});

// ─── [2] No migration ships a query that cannot run ─────────────────────────
console.log("\n[2] Every migration parses as legal Postgres nesting");

test(`there is SQL to scan (found ${files.length} files)`, () => {
  assert(files.length > 0, "the scan silently passing on zero files would be worthless");
  assert(
    files.some((f) => f.endsWith("APPLY_REMAINING.sql")),
    "the hand-paste file must be in scope — it reproduces whole function bodies"
  );
});

for (const file of files) {
  test(relative(SUPABASE, file).replace(/\\/g, "/"), () => {
    const hits = findNestings(readFileSync(file, "utf-8"));
    assert(
      hits.length === 0,
      hits
        .map(
          (h) =>
            `line ${h.line}: ${h.outer}(...) contains ${h.inner}() OVER — Postgres will raise ` +
            `"${h.error}" the first time this statement is reached. ` +
            `Number the rows in a subquery and aggregate the resulting column.`
        )
        .join("; ")
    );
  });
}

// ─── [3] The two functions that were broken stay fixed ──────────────────────
console.log("\n[3] The report and the moments keep their fix");

const FIX = readFileSync(
  resolve(MIGRATIONS, "20260815000000_live_v2_fix_window_in_aggregate.sql"),
  "utf-8"
);

test("the hotfix redefines both functions, not just the one that threw", () => {
  assert(
    /CREATE OR REPLACE FUNCTION public\.build_live_exam_report/.test(FIX),
    "the report is what the creator saw fail"
  );
  assert(
    /CREATE OR REPLACE FUNCTION public\.compute_live_moments/.test(FIX),
    "moments failed the same way, and silently — nothing surfaced it"
  );
});

test("the stored payload still holds ids, never names", () => {
  // The whole point of the subquery alias being `lp`: the privacy property that
  // Phase 6 asserts must read identically in the rewritten body.
  assert(/'user_id',\s*lp\.user_id/.test(FIX), "attendance stores an id");
  assert(
    !/'display_name',\s*lp\.display_name/.test(FIX),
    "baking a name in is exactly the bug that produced the fastest_user_name leak in Phase 1"
  );
});

test("past sessions are backfilled, moments before payloads", () => {
  // get_live_exam_report FREEZES what it builds. Rebuilding a payload before the
  // moments exist would store an empty moments list permanently.
  const build = FIX.indexOf("INSERT INTO public.live_exam_reports");
  const moments = FIX.indexOf("PERFORM public.compute_live_moments(v_exam_id");
  assert(moments !== -1, "live_moments is empty for every past session and nothing recomputes it");
  assert(build !== -1, "live_exam_reports is empty too — the INSERT always failed");
  assert(moments < build, "moments must be computed before the payload that snapshots them");
});

test("the backfill does not swallow the error it is there to prove absent", () => {
  // Comments stripped: the section's own prose explains why it does NOT catch,
  // and matching that would pass the test for the wrong reason.
  const block = FIX.slice(FIX.indexOf("3. Backfill"), FIX.indexOf("4. Verification"))
    .replace(/--[^\n]*/g, "");
  assert(
    !/EXCEPTION\s+WHEN\s+OTHERS/i.test(block),
    "a swallowed exception in this exact path is why two dead functions survived eight migrations"
  );
});

// ─── [4] The verification blocks themselves have to work ────────────────────
//
// Every live-v2 migration ends in a DO block that collects failures into a
// TEXT[] and raises. Those blocks are error-path code: on the happy path not one
// of their appends ever executes, so a bug in one ships and waits.
//
// The first one that ever fired revealed two:
//
//   v_missing := v_missing || 'some message';
//
// Postgres resolves an UNTYPED literal against `anyarray || anyarray` in
// preference to `anyarray || anyelement`, tries to read the message as an array
// literal, and dies with `malformed array literal` — throwing away the very
// diagnosis it was written to deliver. `format(...)` sites are fine; it returns a
// known TEXT.
//
// And a check written as `IF v_src LIKE '%display_name%'` matched the COMMENT in
// the body it was inspecting — pg_get_functiondef returns comments too — so the
// migration failed itself for explaining its own rule.
console.log("\n[4] The migration verification blocks are not themselves broken");

const APPEND = /v_missing\s*:=\s*v_missing\s*\|\|([\s\S]*?);/g;
const BARE_LITERAL = /^'(?:[^']|'')*'$/;

test("every v_missing append is cast, so a real failure reports its message", () => {
  const offenders = [];
  for (const file of files) {
    const sql = readFileSync(file, "utf-8");
    for (const m of sql.matchAll(APPEND)) {
      const body = m[1].trim();
      if (BARE_LITERAL.test(body)) {
        offenders.push(
          `${relative(SUPABASE, file).replace(/\\/g, "/")}:${lineOf(sql, m.index)}`
        );
      }
    }
  }
  assert(
    offenders.length === 0,
    `an untyped literal appended to TEXT[] raises "malformed array literal" instead of the message — ` +
      `add ::TEXT at: ${offenders.slice(0, 8).join(", ")}${offenders.length > 8 ? ` (+${offenders.length - 8} more)` : ""}`
  );
});

/** `CREATE OR REPLACE FUNCTION public.x(` … `$$;` for each function in a file. */
function functionBodies(sql) {
  const bodies = {};
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(/g)) {
    const end = sql.indexOf("$$;", m.index);
    bodies[m[1]] = sql.slice(m.index, end === -1 ? sql.length : end);
  }
  return bodies;
}

test("the hotfix's own LIKE checks agree with the bodies it installs", () => {
  // A must-NOT-contain check that matches the shipped body fails the migration on
  // sight. A must-contain check that does not match it fails just as surely — and
  // whitespace-sensitive patterns are how that happens. Both are decidable here,
  // before anyone pastes the file into a SQL editor.
  const bodies = functionBodies(FIX);
  const section = FIX.slice(FIX.indexOf("4. Verification"));
  const problems = [];
  let current = null;

  for (const line of section.split("\n")) {
    const target = /pg_get_functiondef\('public\.([a-z_]+)\(/.exec(line);
    if (target) {
      current = target[1];
      continue;
    }
    const check = /IF\s+v_src\s+(NOT\s+)?LIKE\s+'((?:[^']|'')*)'/i.exec(line);
    if (!check || !current) continue;

    const mustContain = !!check[1];
    const raw = check[2].replace(/''/g, "'");
    const inner = raw.replace(/^%/, "").replace(/%$/, "");
    if (inner.includes("%")) continue; // internal wildcard — not decidable by substring

    const body = bodies[current];
    if (!body) {
      problems.push(`${current} is checked but never defined in this migration`);
      continue;
    }
    const present = body.includes(inner);
    if (mustContain && !present) {
      problems.push(`${current}: NOT LIKE check requires "${inner}", which the shipped body does not contain`);
    }
    if (!mustContain && present) {
      problems.push(`${current}: LIKE check rejects "${inner}", which the shipped body DOES contain — self-inflicted failure`);
    }
  }

  assert(problems.length === 0, problems.join("; "));
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
