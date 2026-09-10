/**
 * A SECTION IS ITS ID, NOT ITS NAME
 *
 * Run with: node src/__tests__/section-identity-not-name.test.mjs
 *
 * Section Analytics grouped rows by section NAME, which broke in both
 * directions at once:
 *
 *   SPLIT  - names are translated per language. ExamIntro walks siblings via
 *            section_group_id to localise them, and handleUpdateSection mirrors
 *            only time_minutes on rename, so twins are MEANT to diverge. A
 *            creator who renders the Hindi section in Hindi split one section
 *            into two rows with half the cohort each.
 *   MERGE  - every section was born named "New Section", so two a creator never
 *            renamed became one row averaging two unrelated papers, hiding a
 *            weak section behind a strong one.
 *
 * It also made the snippet dialog unopenable on a translated section: rows were
 * labelled with that attempt's (possibly Hindi) name while questionStats always
 * carries the PRIMARY name, so the filter matched nothing.
 *
 * section_group_id is the real identity - one id per section across every
 * language, already load-bearing for scoring, grading, publish parity and the
 * localised names on ExamIntro.
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
    console.log(`  \u2705 ${name}`);
    passed++;
  } catch (e) {
    console.log(`  \u274c ${name}`);
    console.log(`     -> ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

const PAGE = readFileSync(resolve(ROOT, "src/pages/Analytics.tsx"), "utf-8");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ExamDetail.tsx"), "utf-8");

console.log("\nA SECTION IS ITS ID, NOT ITS NAME\n");

test("Section Analytics groups by identity, with a fallback", () => {
  assert(
    PAGE.includes("(attempt.section as any).section_group_id || attempt.section_id"),
    "rows must key on the group id, falling back to the section's own id"
  );
  assert(
    !/const sectionName = attempt\.section\.name/.test(PAGE),
    "the name must no longer decide which row an attempt lands in"
  );
});

test("the attempts fetch carries what identity needs", () => {
  const embed = /section:sections!inner\(\s*name,[\s\S]{0,300}?\)/.exec(PAGE)?.[0] ?? "";
  assert(embed.includes("section_group_id"), "the attempts embed must select section_group_id");
  // Language is resolved through sectionMeta (the section list, one row per
  // section), never read off attempts. This embed is paged over EVERY attempt of
  // every student, so a field nothing reads is pure weight on the hottest query.
  assert(
    !/\blanguage\b/.test(embed),
    "the attempts embed must not carry language — nothing reads it there, and the query is paged over every attempt"
  );
});

test("the row is labelled by the primary language, not by a race", () => {
  // time_minutes and sort_order are mirrored across twins, so those agree either
  // way - the NAME and the id behind the shared-pool badge do not.
  assert(
    /if \(!current \|\| \(primaryLanguage && sec\.language === primaryLanguage\)\)/.test(PAGE),
    "the primary row must win when building the label map"
  );
  for (const field of ["name", "time_minutes", "sort_order"]) {
    assert(
      PAGE.includes(`label?.${field}`),
      `${field} must come from the resolved primary row, not whichever attempt landed first`
    );
  }
});

test("question stats carry their section's identity", () => {
  assert(
    PAGE.includes("sectionKey: primary.section.section_group_id || primary.section.id"),
    "each pooled question must know its section by id"
  );
});

test("the snippet dialog matches on identity, so a translated row opens", () => {
  assert(
    !/selectedSectionName/.test(PAGE),
    "selecting a section by its display name is what left the dialog empty"
  );
  assert(
    PAGE.includes("q.sectionKey === selectedSectionKey"),
    "the dialog must filter questions by section identity"
  );
  assert(
    /const selectedSectionLabel =/.test(PAGE),
    "the dialog still needs a readable title, resolved from the identity"
  );
});

test("Question Analysis headings group by identity too", () => {
  assert(
    /const group = groups\[q\.sectionKey\] \|\| \[\]/.test(PAGE),
    "two sections sharing a default name must not share one heading"
  );
  assert(
    /collapsedSections\.has\(sectionKey\)/.test(PAGE),
    "collapse state must key on identity, or two sections toggle together"
  );
});

test("new sections are born with distinct names", () => {
  assert(
    DETAIL.includes("const newSectionName = `New Section ${nextNumber}`"),
    "the default name must be numbered"
  );
  assert(
    /while \(usedNumbers\.has\(nextNumber\)\) nextNumber\+\+/.test(DETAIL),
    "the lowest FREE number - sections.length + 1 reissues a name after a delete"
  );
  // Exam-level, not language-level. One name is written to every twin, so the
  // number must be free in EVERY language: scanning only the active tab restarts
  // at 1 once that tab's names are translated, and hands the other language a
  // duplicate.
  assert(
    /const usedNumbers = new Set\(\s*allSections/.test(DETAIL),
    "numbering must be scanned across all languages, not just the active one"
  );
  assert(
    !/name: "New Section",/.test(DETAIL),
    "the bare default must be gone"
  );
});

test("Add Section cannot run twice inside one round trip", () => {
  // The number and sort_order are read from state BEFORE the insert returns, so
  // two clicks in one round trip both minted "New Section N" with the same N.
  // A ref is the latch (synchronous), state only drives the disabled prop.
  assert(
    DETAIL.includes("if (addSectionInFlightRef.current) return;"),
    "the handler must refuse to start while a previous add is in flight"
  );
  assert(
    /finally \{\s*\n\s*addSectionInFlightRef\.current = false;/.test(DETAIL),
    "the latch must release on every path, or one failed insert disables the button for good"
  );
  // `\b`, not `}`: the prop has since grown a second clause (the secondary-tab
  // lock), and this pins that the in-flight state is still part of it on both.
  assert(
    (DETAIL.match(/disabled=\{addingSection\b/g) || []).length === 2,
    "both Add Section buttons must be disabled while an add is in flight"
  );
});

test("every language variant is still created with the same name", () => {
  // Twins start in sync deliberately; translating one is an explicit act.
  assert(
    /supportedLanguages\.map\(lang => \(\{[\s\S]{0,200}name: newSectionName,/.test(DETAIL),
    "one name for all languages at creation"
  );
});

console.log("\n" + "-".repeat(60));
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.name}\n    ${f.error}`);
  console.log("-".repeat(60));
  process.exit(1);
}
console.log("-".repeat(60) + "\n");
