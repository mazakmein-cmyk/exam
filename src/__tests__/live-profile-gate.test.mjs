/**
 * A NEW ACCOUNT MUST FINISH ONBOARDING BEFORE JOINING A LIVE EXAM
 *
 * Run with: node src/__tests__/live-profile-gate.test.mjs
 *
 * The share-link flow for a brand-new student is: open /live/<code> →
 * redirected to /student-auth?returnTo=… → create account → land back on
 * /live/<code>. Signup collects only email + password; the profile (full
 * name, unique user ID) comes from OnboardingModal. Before this gate,
 * LiveExamStudent joined immediately, so joinLiveExam's display-name
 * fallback burned the student's leaderboard name down to their email
 * local-part — and the onboarding modal never appeared on this path at all
 * (StudentAuth navigates away on SIGNED_IN before its own profile check,
 * and the email-confirmation link lands straight on /live/<code>).
 *
 * These assertions pin the gate: the profiles lookup must stop init()
 * before the participant row is written, and the gate screen must render
 * the non-dismissable OnboardingModal ahead of the not-found branch.
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

const SRC = readFileSync(
  resolve(ROOT, "src/pages/LiveExamStudent.tsx"),
  "utf-8"
);

console.log("\nLiveExamStudent profile gate:");

test("init() looks up the profiles row", () => {
  assert(
    /from\("profiles"\)[\s\S]{0,200}\.maybeSingle\(\)/.test(SRC),
    'expected a from("profiles") … .maybeSingle() lookup'
  );
});

test("the profiles lookup happens BEFORE joinLiveExam is called", () => {
  const lookup = SRC.indexOf('from("profiles")');
  const join = SRC.indexOf("await joinLiveExam(");
  assert(lookup !== -1, "profiles lookup not found");
  assert(join !== -1, "joinLiveExam call not found");
  assert(
    lookup < join,
    "the profile gate must run before the participant row is written"
  );
});

test("a missing profile stops init() (no participant row, no exam state)", () => {
  assert(
    /if \(!profileRow\) \{\s*setNeedsProfile\(true\);\s*return;/.test(SRC),
    "expected `if (!profileRow) { setNeedsProfile(true); return; }`"
  );
});

test("the gate only applies to students (mode === \"take\"), not creator preview", () => {
  const gate = SRC.indexOf('from("profiles")');
  const guard = SRC.lastIndexOf('if (mode === "take")', gate);
  assert(
    guard !== -1 && gate - guard < 300,
    'the profiles lookup must sit inside an `if (mode === "take")` guard'
  );
});

test("the gate screen renders OnboardingModal and re-runs init() on completion", () => {
  assert(
    SRC.includes('import OnboardingModal from "@/components/OnboardingModal"'),
    "OnboardingModal import missing"
  );
  assert(
    /<OnboardingModal[\s\S]{0,200}onComplete=\{\(\) => \{\s*setNeedsProfile\(false\);\s*init\(\);/.test(
      SRC
    ),
    "expected OnboardingModal with onComplete → setNeedsProfile(false); init()"
  );
});

test("the needsProfile branch renders before the not-found branch", () => {
  const gateBranch = SRC.indexOf("if (needsProfile) {");
  const notFound = SRC.indexOf("Live exam not found");
  assert(gateBranch !== -1, "needsProfile render branch not found");
  assert(notFound !== -1, "not-found branch not found");
  assert(
    gateBranch < notFound,
    "the gate stops init() before `exam` is set, so its branch must precede the !exam branch"
  );
});

console.log(
  `\n${passed} passed, ${failed} failed${failed ? "\n" + failures.map((f) => `  - ${f.name}: ${f.error}`).join("\n") : ""}`
);
if (failed) process.exit(1);
