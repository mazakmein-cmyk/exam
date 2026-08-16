/**
 * SECTION TIMING GROUPS — shared time pools over adjacent sections
 * ("Session I: Numerical + Reasoning, one 45-minute clock; marks stay
 * per-section").
 *
 * Run with: node src/__tests__/section-timing-groups.test.mjs
 *
 * Five properties carry the weight:
 *
 *  1. ABSENT MEANS UNGROUPED. The migration is hand-pasted; rows without
 *     timing_group_id and databases without the table must behave exactly like
 *     today — solo per-section clocks, byte-identical instruction text.
 *  2. ONE COPY OF THE STRUCTURE. Grouping lives on primary-language rows only;
 *     a Hindi sitting derives the SAME units through the language-twin link,
 *     so two languages can never disagree about the paper's timing shape.
 *  3. GROUPS ARE CONTIGUOUS RUNS. A group id split across non-adjacent runs
 *     coalesces per maximal run; a run of one behaves solo; drag repair keeps
 *     the invariant with one predictable membership change.
 *  4. THE POOL IS OVERRIDE-OR-SUM — the same rule totalExamMinutes follows.
 *  5. THE INSTRUCTIONS TELL THE TRUTH. The engine writes the grouped story in
 *     BOTH copy packs, the reconciler heals stale sentences across every mode
 *     transition, and fresh grouped text never trips the drift auditor.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  resolveTimingGroupIds,
  groupDisplayName,
  groupPoolMinutes,
  timingUnits,
  unitContaining,
  hasGroupUnits,
  sumUnitMinutes,
  membershipChangeAfterReorder,
} from "../lib/timingGroups.js";
import {
  generateExamInstruction,
  reconcileTimingLine,
} from "../lib/examInstructionEngine.js";
import {
  auditInstructionTiming,
  describeTimingDrift,
  effectivePaperMinutes,
} from "../lib/instructionTimingAudit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ─── Test runner ────────────────────────────────────────────────────────────
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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeep(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "Mismatch"}: expected ${b}, got ${a}`);
}

function assertContains(str, substring, message) {
  if (!str.includes(substring)) throw new Error(message || `Expected to contain: "${substring}"\nGot:\n${str}`);
}

function readSrc(relPath) {
  return readFileSync(resolve(ROOT, "src", relPath), "utf-8");
}

function readMigration(filename) {
  return readFileSync(resolve(ROOT, "supabase/migrations", filename), "utf-8");
}

// ─── Fixtures — the TSPSC shape, in two languages ───────────────────────────
// Primary (en): grouping lives here.       Secondary (hi): derives it.
const G1 = "grp-1";
const G2 = "grp-2";
const EN_SECTIONS = [
  { id: "en-1", name: "Numerical Ability", time_minutes: 25, language: "en", section_group_id: "twin-1", timing_group_id: G1 },
  { id: "en-2", name: "Reasoning", time_minutes: 20, language: "en", section_group_id: "twin-2", timing_group_id: G1 },
  { id: "en-3", name: "General Awareness", time_minutes: 20, language: "en", section_group_id: "twin-3", timing_group_id: G2 },
  { id: "en-4", name: "English", time_minutes: 25, language: "en", section_group_id: "twin-4", timing_group_id: G2 },
];
const HI_SECTIONS = [
  { id: "hi-1", name: "संख्यात्मक योग्यता", time_minutes: 25, language: "hi", section_group_id: "twin-1", timing_group_id: null },
  { id: "hi-2", name: "तर्कशक्ति", time_minutes: 20, language: "hi", section_group_id: "twin-2", timing_group_id: null },
  { id: "hi-3", name: "सामान्य ज्ञान", time_minutes: 20, language: "hi", section_group_id: "twin-3", timing_group_id: null },
  { id: "hi-4", name: "अंग्रेज़ी", time_minutes: 25, language: "hi", section_group_id: "twin-4", timing_group_id: null },
];
const ALL_SECTIONS = [...EN_SECTIONS, ...HI_SECTIONS];
const GROUPS = [
  { id: G1, name: "Session I", name_translations: { hi: "सत्र I" }, time_minutes: null },
  { id: G2, name: "Session II", name_translations: null, time_minutes: null },
];

// ─── [1] Language resolution — one copy of the structure ────────────────────
console.log("\n[1] resolveTimingGroupIds — primary owns, secondary derives");

test("primary rows read their own column", () => {
  const resolved = resolveTimingGroupIds(ALL_SECTIONS, "en");
  assertEqual(resolved.get("en-1"), G1);
  assertEqual(resolved.get("en-2"), G1);
  assertEqual(resolved.get("en-3"), G2);
  assertEqual(resolved.get("en-4"), G2);
});

test("secondary rows derive through the language twin", () => {
  const resolved = resolveTimingGroupIds(ALL_SECTIONS, "en");
  assertEqual(resolved.get("hi-1"), G1);
  assertEqual(resolved.get("hi-2"), G1);
  assertEqual(resolved.get("hi-3"), G2);
  assertEqual(resolved.get("hi-4"), G2);
});

test("a secondary sitting derives IDENTICAL units to the primary", () => {
  const resolved = resolveTimingGroupIds(ALL_SECTIONS, "en");
  const enUnits = timingUnits(EN_SECTIONS, GROUPS, resolved);
  const hiUnits = timingUnits(HI_SECTIONS, GROUPS, resolved);
  assertDeep(
    enUnits.map((u) => ({ kind: u.kind, groupId: u.groupId, minutes: u.minutes, count: u.sectionIds.length })),
    hiUnits.map((u) => ({ kind: u.kind, groupId: u.groupId, minutes: u.minutes, count: u.sectionIds.length })),
    "the two languages must sit the same paper"
  );
});

test("a secondary row with no twin link resolves ungrouped, never crashes", () => {
  const orphan = { id: "hi-x", name: "Orphan", time_minutes: 30, language: "hi", section_group_id: null, timing_group_id: null };
  const resolved = resolveTimingGroupIds([...ALL_SECTIONS, orphan], "en");
  assertEqual(resolved.has("hi-x"), false);
});

test("legacy rows with no language at all count as primary", () => {
  const legacy = [
    { id: "l-1", time_minutes: 30, timing_group_id: G1 },
    { id: "l-2", time_minutes: 30, timing_group_id: G1 },
  ];
  const resolved = resolveTimingGroupIds(legacy, "en");
  assertEqual(resolved.get("l-1"), G1);
  assertEqual(resolved.get("l-2"), G1);
});

test("rows without the column (pre-migration response) resolve to no grouping", () => {
  const preMigration = [
    { id: "p-1", name: "A", time_minutes: 30, language: "en", section_group_id: "t1" },
    { id: "p-2", name: "B", time_minutes: 30, language: "en", section_group_id: "t2" },
  ];
  const resolved = resolveTimingGroupIds(preMigration, "en");
  assertEqual(resolved.size, 0);
  assertDeep(timingUnits(preMigration, [], resolved).map((u) => u.kind), ["solo", "solo"]);
});

test("groupDisplayName: translation wins, primary name is the fallback", () => {
  assertEqual(groupDisplayName(GROUPS[0], "hi"), "सत्र I");
  assertEqual(groupDisplayName(GROUPS[0], "en"), "Session I");
  assertEqual(groupDisplayName(GROUPS[1], "hi"), "Session II", "no Hindi label → the primary name, never a placeholder");
  assertEqual(groupDisplayName(null, "en"), "");
});

// ─── [2] Units — coalescing, pools, edge cases ──────────────────────────────
console.log("\n[2] timingUnits — the paper as a sequence of timed units");

const EN_RESOLVED = resolveTimingGroupIds(EN_SECTIONS, "en");

test("the TSPSC shape: two group units, pooled 45 + 45", () => {
  const units = timingUnits(EN_SECTIONS, GROUPS, EN_RESOLVED);
  assertEqual(units.length, 2);
  assertDeep(units.map((u) => u.kind), ["group", "group"]);
  assertDeep(units.map((u) => u.minutes), [45, 45]);
  assertDeep(units[0].sectionIds, ["en-1", "en-2"]);
  assertEqual(sumUnitMinutes(units), 90);
  assertEqual(hasGroupUnits(units), true);
});

test("solo sections keep their own clock beside a group", () => {
  const mixed = [
    EN_SECTIONS[0],
    EN_SECTIONS[1],
    { id: "en-5", name: "Essay", time_minutes: 30, language: "en", timing_group_id: null },
  ];
  const units = timingUnits(mixed, GROUPS, resolveTimingGroupIds(mixed, "en"));
  assertDeep(units.map((u) => u.kind), ["group", "solo"]);
  assertDeep(units.map((u) => u.minutes), [45, 30]);
  assertEqual(sumUnitMinutes(units), 75);
});

test("an explicit pool override beats the member sum", () => {
  const groups = [{ ...GROUPS[0], time_minutes: 60 }, GROUPS[1]];
  const units = timingUnits(EN_SECTIONS, groups, EN_RESOLVED);
  assertEqual(units[0].minutes, 60, "the creator's 60 wins over 25+20");
  assertEqual(units[1].minutes, 45, "the untouched group still sums");
});

test("groupPoolMinutes tolerates junk the way sumSectionMinutes does", () => {
  assertEqual(groupPoolMinutes(null, [{ time_minutes: 20 }, { time_minutes: null }]), 20);
  assertEqual(groupPoolMinutes({ time_minutes: -5 }, [{ time_minutes: 20 }]), 20, "a junk override falls back to the sum");
  assertEqual(groupPoolMinutes({ time_minutes: 0 }, []), 0);
});

test("a group id split into two non-adjacent runs stays two units", () => {
  const broken = [
    { id: "b-1", time_minutes: 10, language: "en", timing_group_id: G1 },
    { id: "b-2", time_minutes: 10, language: "en", timing_group_id: G1 },
    { id: "b-3", time_minutes: 30, language: "en", timing_group_id: null },
    { id: "b-4", time_minutes: 10, language: "en", timing_group_id: G1 },
    { id: "b-5", time_minutes: 10, language: "en", timing_group_id: G1 },
  ];
  const units = timingUnits(broken, GROUPS, resolveTimingGroupIds(broken, "en"));
  assertDeep(units.map((u) => u.kind), ["group", "solo", "group"], "corrupt order never merges across the gap");
});

test("a run of ONE member behaves solo — no pool it no longer shares", () => {
  const lonely = [
    { id: "l-1", time_minutes: 25, language: "en", timing_group_id: G1 },
    { id: "l-2", time_minutes: 30, language: "en", timing_group_id: null },
  ];
  const units = timingUnits(lonely, GROUPS, resolveTimingGroupIds(lonely, "en"));
  assertDeep(units.map((u) => u.kind), ["solo", "solo"]);
  assertEqual(units[0].minutes, 25, "its own clock, not a 1-member pool");
  assertEqual(hasGroupUnits(units), false);
});

test("a membership pointing at an unknown group reads as ungrouped", () => {
  const stray = [
    { id: "s-1", time_minutes: 25, language: "en", timing_group_id: "deleted-group" },
    { id: "s-2", time_minutes: 30, language: "en", timing_group_id: "deleted-group" },
  ];
  const units = timingUnits(stray, GROUPS, resolveTimingGroupIds(stray, "en"));
  assertDeep(units.map((u) => u.kind), ["solo", "solo"]);
});

test("unitContaining finds a member's unit; junk finds nothing", () => {
  const units = timingUnits(EN_SECTIONS, GROUPS, EN_RESOLVED);
  assertEqual(unitContaining(units, "en-2"), units[0]);
  assertEqual(unitContaining(units, "en-3"), units[1]);
  assertEqual(unitContaining(units, "ghost"), null);
  assertEqual(unitContaining(null, "en-1"), null);
});

test("empty and junk inputs yield empty units, never a crash", () => {
  assertDeep(timingUnits(null, null, null), []);
  assertDeep(timingUnits([], GROUPS, EN_RESOLVED), []);
  assertEqual(sumUnitMinutes(null), 0);
  assertEqual(hasGroupUnits(undefined), false);
});

// ─── [3] Drag repair — the contiguity invariant ─────────────────────────────
console.log("\n[3] membershipChangeAfterReorder");

const DRAG_RESOLVED = new Map([
  ["a", G1],
  ["b", G1],
  ["c", G1],
]);

test("a member dragged clean away leaves its group", () => {
  // Order after drag: b, c, x, a — a touches no member of G1 any more.
  const order = [{ id: "b" }, { id: "c" }, { id: "x" }, { id: "a" }];
  assertDeep(membershipChangeAfterReorder(order, "a", DRAG_RESOLVED), {
    sectionId: "a",
    timingGroupId: null,
  });
});

test("an outsider dropped strictly inside a group joins it", () => {
  const order = [{ id: "a" }, { id: "x" }, { id: "b" }, { id: "c" }];
  assertDeep(membershipChangeAfterReorder(order, "x", DRAG_RESOLVED), {
    sectionId: "x",
    timingGroupId: G1,
  });
});

test("landing at the EDGE of a foreign group joins nothing", () => {
  const order = [{ id: "x" }, { id: "a" }, { id: "b" }, { id: "c" }];
  assertEqual(membershipChangeAfterReorder(order, "x", DRAG_RESOLVED), null, "before the run");
  const after = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "x" }];
  assertEqual(membershipChangeAfterReorder(after, "x", DRAG_RESOLVED), null, "after the run");
});

test("a member reordered WITHIN its group stays put", () => {
  const order = [{ id: "b" }, { id: "a" }, { id: "c" }, { id: "x" }];
  assertEqual(membershipChangeAfterReorder(order, "a", DRAG_RESOLVED), null);
});

test("a member dragged to its group's edge stays a member", () => {
  // a moved to sit after c — still touching the run.
  const order = [{ id: "b" }, { id: "c" }, { id: "a" }, { id: "x" }];
  assertEqual(membershipChangeAfterReorder(order, "a", DRAG_RESOLVED), null);
});

test("unknown dragged id changes nothing", () => {
  assertEqual(membershipChangeAfterReorder([{ id: "a" }], "ghost", DRAG_RESOLVED), null);
});

// ─── [4] The instruction engine tells the grouped story ─────────────────────
console.log("\n[4] Instruction engine — grouped timing in both languages");

const GROUP_FACTS_EN = {
  sections: [
    { name: "Numerical Ability", minutes: 25, questionCount: 20, groupId: G1 },
    { name: "Reasoning", minutes: 20, questionCount: 20, groupId: G1 },
    { name: "General Awareness", minutes: 20, questionCount: 25, groupId: G2 },
    { name: "English", minutes: 25, questionCount: 25, groupId: G2 },
  ],
  allowSectionSwitching: false,
  totalMinutes: null,
  groups: {
    [G1]: { name: "Session I", minutes: null },
    [G2]: { name: "Session II", minutes: null },
  },
  marking: null,
  answerTypes: null,
  languageNames: null,
};

const GROUP_FACTS_HI = {
  ...GROUP_FACTS_EN,
  sections: [
    { name: "संख्यात्मक योग्यता", minutes: 25, questionCount: 20, groupId: G1 },
    { name: "तर्कशक्ति", minutes: 20, questionCount: 20, groupId: G1 },
    { name: "सामान्य ज्ञान", minutes: 20, questionCount: 25, groupId: G2 },
    { name: "अंग्रेज़ी", minutes: 25, questionCount: 25, groupId: G2 },
  ],
  groups: {
    [G1]: { name: "सत्र I", minutes: null },
    [G2]: { name: "Session II", minutes: null },
  },
};

test("the TSPSC paper reads as two shared parts, 90 minutes in all", () => {
  const en = generateExamInstruction(GROUP_FACTS_EN, "en");
  assertContains(en, "The paper is sat in timed parts: Session I (Numerical Ability and Reasoning) — 45 min shared; Session II (General Awareness and English) — 45 min shared (90 minutes in all).");
  assertContains(en, "Within a shared part you may move freely between its sections");
  assertContains(en, "unused time does not carry over between parts");
  assertContains(en, "When a part's time is up it is submitted automatically");
  assert(!en.includes("timed separately"), "the per-section story must not survive grouping");
});

test("the Hindi pack tells the same story with the same shape", () => {
  const hi = generateExamInstruction(GROUP_FACTS_HI, "hi");
  assertContains(hi, "यह प्रश्नपत्र समयबद्ध भागों में बँटा है: सत्र I (संख्यात्मक योग्यता और तर्कशक्ति) — 45 मिनट साझा");
  assertContains(hi, "किसी भाग का समय समाप्त होते ही");
  const en = generateExamInstruction(GROUP_FACTS_EN, "en");
  assertEqual(en.split("\n").length, hi.split("\n").length, "en/hi line parity");
  assert(hi.split("\n").every((line) => /।$/.test(line.trim())), "every Hindi line ends with the danda");
});

test("a solo section beside a group keeps its own clock in the sentence", () => {
  const mixed = {
    ...GROUP_FACTS_EN,
    sections: [
      ...GROUP_FACTS_EN.sections.slice(0, 2),
      { name: "Essay", minutes: 30, questionCount: 5, groupId: null },
    ],
  };
  const en = generateExamInstruction(mixed, "en");
  assertContains(en, "Session I (Numerical Ability and Reasoning) — 45 min shared; Essay — 30 min (75 minutes in all)");
});

test("an explicit pool override is the number the student reads", () => {
  const overridden = {
    ...GROUP_FACTS_EN,
    groups: { [G1]: { name: "Session I", minutes: 60 }, [G2]: { name: "Session II", minutes: null } },
  };
  assertContains(generateExamInstruction(overridden, "en"), "Session I (Numerical Ability and Reasoning) — 60 min shared");
});

test("one unknown clock silences every number (say nothing rather than guess)", () => {
  const partial = {
    ...GROUP_FACTS_EN,
    sections: GROUP_FACTS_EN.sections.map((s, i) => (i === 3 ? { ...s, minutes: null } : s)),
  };
  const en = generateExamInstruction(partial, "en");
  assertContains(en, "The paper is sat in timed parts — some sections are timed together, others on their own.");
  assert(!en.includes("45 min"), "no partial number list");
});

test("groups: null and every-run-solo are byte-identical to the pre-grouping engine", () => {
  const noGroups = { ...GROUP_FACTS_EN, groups: null };
  const withoutField = { ...GROUP_FACTS_EN };
  delete withoutField.groups;
  const baseline = generateExamInstruction(withoutField, "en");
  assertEqual(generateExamInstruction(noGroups, "en"), baseline);
  assertContains(baseline, "Each section is timed separately");

  // Runs of one: grouping data present, but no run of 2+ survives.
  const scattered = {
    ...GROUP_FACTS_EN,
    sections: GROUP_FACTS_EN.sections.map((s, i) => ({ ...s, groupId: i % 2 === 0 ? G1 : G2 })),
  };
  assertEqual(generateExamInstruction(scattered, "en"), baseline, "alternating single-member runs behave solo");
});

test("free mode ignores groups entirely — one clock makes pools meaningless", () => {
  const free = { ...GROUP_FACTS_EN, allowSectionSwitching: true, totalMinutes: 90 };
  const out = generateExamInstruction(free, "en");
  assertContains(out, "You have 90 minutes for the whole paper.");
  assert(!out.includes("shared part") && !out.includes("timed parts"), "no grouped wording in free mode");
});

test("grouped output keeps the sweep's structural invariants", () => {
  for (const [lang, facts] of [["en", GROUP_FACTS_EN], ["hi", GROUP_FACTS_HI]]) {
    const out = generateExamInstruction(facts, lang);
    const lines = out.split("\n");
    assert(lines.every((line, i) => line.startsWith(`${i + 1}. `)), `numbering 1..n (${lang})`);
    const terminator = lang === "hi" ? /।$/ : /\.$/;
    assert(lines.every((line) => terminator.test(line.trim())), `terminators (${lang})`);
    assert(!/undefined|\[object|\bNaN\b/.test(out), `clean output (${lang})`);
  }
});

// ─── [5] Healing stale prose across every mode transition ───────────────────
console.log("\n[5] reconcileTimingLine — grouped shapes registered");

test("a stale LOCKED sentence on a now-grouped paper is replaced", () => {
  const stale = [
    "1. This paper has 4 sections.",
    "2. Each section is timed separately: Numerical Ability — 25 min; Reasoning — 20 min; General Awareness — 20 min; English — 25 min (90 minutes in all). Sections are sat in order, and a submitted section cannot be reopened.",
    "3. Every question is multiple choice with a single correct answer.",
  ].join("\n");
  const out = reconcileTimingLine(stale, GROUP_FACTS_EN, "en");
  assertEqual(out.changed, true);
  assertContains(out.text, "2. The paper is sat in timed parts: Session I");
  assertContains(out.text, "3. Every question is multiple choice", "other lines untouched");
});

test("a stale FREE sentence on a now-grouped paper is replaced", () => {
  const stale = "2. You have 90 minutes for the whole paper. All sections share one clock — move between them in any order and change any answer until you submit.";
  const out = reconcileTimingLine(stale, GROUP_FACTS_EN, "en");
  assertEqual(out.changed, true);
  assertContains(out.text, "timed parts: Session I");
});

test("a stale GROUPED sentence heals when the paper ungroups", () => {
  const generated = generateExamInstruction(GROUP_FACTS_EN, "en");
  const ungrouped = { ...GROUP_FACTS_EN, groups: null };
  const out = reconcileTimingLine(generated, ungrouped, "en");
  assertEqual(out.changed, true);
  assertContains(out.text, "Each section is timed separately");
  assert(!out.text.includes("timed parts"), "the grouped sentence must not survive");
});

test("a stale GROUPED sentence heals when the pool changes", () => {
  const generated = generateExamInstruction(GROUP_FACTS_EN, "en");
  const repooled = {
    ...GROUP_FACTS_EN,
    groups: { [G1]: { name: "Session I", minutes: 60 }, [G2]: { name: "Session II", minutes: null } },
  };
  const out = reconcileTimingLine(generated, repooled, "en");
  assertEqual(out.changed, true);
  assertContains(out.text, "60 min shared");
  assert(!out.text.includes("— 45 min shared; Session II"), "the old pool must not survive");
});

test("fresh grouped text reconciles to itself — a no-op", () => {
  const en = generateExamInstruction(GROUP_FACTS_EN, "en");
  assertEqual(reconcileTimingLine(en, GROUP_FACTS_EN, "en").changed, false);
  const hi = generateExamInstruction(GROUP_FACTS_HI, "hi");
  assertEqual(reconcileTimingLine(hi, GROUP_FACTS_HI, "hi").changed, false);
});

test("a creator's own grouped-sounding prose is never rewritten", () => {
  const theirs = "2. Session I gives you 45 minutes for two subjects, use them wisely.";
  assertEqual(reconcileTimingLine(theirs, GROUP_FACTS_EN, "en").changed, false);
});

test("the EXPIRY sentence heals with the timing line — no self-contradicting text", () => {
  // A stored locked-mode expiry sentence on a now-grouped paper: healing the
  // clock sentence but not this one would leave the corrected text promising
  // per-section auto-submit one line under a shared-part clock.
  const stale = [
    "1. This paper has 4 sections.",
    "2. Each section is timed separately: A — 25 min; B — 20 min (45 minutes in all). Sections are sat in order, and a submitted section cannot be reopened.",
    "3. When a section's time is up it is submitted automatically and you move on to the next one; a warning appears when 5 minutes remain in a section.",
  ].join("\n");
  const out = reconcileTimingLine(stale, GROUP_FACTS_EN, "en");
  assertEqual(out.changed, true);
  assertContains(out.text, "3. When a part's time is up it is submitted automatically");
  assert(!out.text.includes("in a section."), "the per-section expiry must not survive grouping");

  // And back: grouped expiry heals to per-section when the paper ungroups.
  const generated = generateExamInstruction(GROUP_FACTS_EN, "en");
  const back = reconcileTimingLine(generated, { ...GROUP_FACTS_EN, groups: null }, "en");
  assertContains(back.text, "5 minutes remain in a section");
  assert(!back.text.includes("in a part."), "the part expiry must not survive ungrouping");
});

// ─── [6] The drift auditor knows the third mode ─────────────────────────────
console.log("\n[6] instructionTimingAudit — pools, not member clocks");

const AUDIT_GROUPED = {
  allowSectionSwitching: false,
  totalMinutes: null,
  sectionMinutes: [25, 20, 20, 25],
  unitMinutes: [45, 45],
};

test("a grouped paper is worth the sum of its unit clocks", () => {
  assertEqual(effectivePaperMinutes(AUDIT_GROUPED), 90);
  assertEqual(effectivePaperMinutes({ ...AUDIT_GROUPED, unitMinutes: null }), 90, "no units → section sum, as ever");
  assertEqual(effectivePaperMinutes({ ...AUDIT_GROUPED, unitMinutes: [60, 45] }), 105, "overridden pools count once");
});

test("fresh grouped text passes its own audit", () => {
  const en = generateExamInstruction(GROUP_FACTS_EN, "en");
  assertDeep(auditInstructionTiming(en, AUDIT_GROUPED), []);
});

test("a grouped MEMBER's own minutes in prose is stale by definition", () => {
  // 25 is Numerical's clock — but no candidate-facing surface states it; the
  // pool (45) governs. Prose claiming it must be flagged.
  const findings = auditInstructionTiming("Numerical Ability gives you 25 minutes.", AUDIT_GROUPED);
  assertEqual(findings.length, 1);
  assertEqual(findings[0].kind, "duration");
  assertEqual(findings[0].stated, 25);
  assertEqual(findings[0].expected, 90);
});

test("pool values and the total are legitimate numbers", () => {
  assertEqual(auditInstructionTiming("Session I gives you 45 minutes; the paper is 90 minutes.", AUDIT_GROUPED).length, 0);
});

test("free prose on a grouped paper is a mode drift", () => {
  const findings = auditInstructionTiming(
    "All sections share one clock — move between them in any order.",
    AUDIT_GROUPED
  );
  assertEqual(findings.length, 1);
  assertDeep(findings[0], { kind: "mode", stated: "free", expected: "grouped" });
  assertContains(describeTimingDrift(findings), "sat in timed parts");
});

test("per-section-clock prose on a grouped paper is a mode drift", () => {
  const findings = auditInstructionTiming(
    "Each section is timed separately, one section at a time.",
    AUDIT_GROUPED
  );
  assertEqual(findings.length, 1);
  assertDeep(findings[0], { kind: "mode", stated: "locked", expected: "grouped" });
});

test("grouped prose on a paper that ungrouped is a mode drift", () => {
  const findings = auditInstructionTiming(
    "The paper is sat in timed parts — within a shared part you may move freely.",
    { allowSectionSwitching: false, totalMinutes: null, sectionMinutes: [30, 30] }
  );
  assertEqual(findings.length, 1);
  assertDeep(findings[0], { kind: "mode", stated: "grouped", expected: "locked" });
  assertContains(describeTimingDrift(findings), "each section has its own clock");
});

test("plain locked and free papers audit exactly as before", () => {
  const LOCKED = { allowSectionSwitching: false, totalMinutes: 155, sectionMinutes: [30, 30, 30, 30] };
  assertEqual(effectivePaperMinutes(LOCKED), 120);
  const findings = auditInstructionTiming("You have 155 minutes for the whole paper. All sections share one clock.", LOCKED);
  assertEqual(findings.length, 2);
});

test("the audit reads Hindi durations — a मिनट claim is a claim", () => {
  const findings = auditInstructionTiming("पूरे प्रश्नपत्र के लिए आपके पास 155 मिनट हैं।", AUDIT_GROUPED);
  assertEqual(findings.length, 1, "155 मिनट on a 90-minute grouped paper must be flagged");
  assertEqual(findings[0].stated, 155);
  assertEqual(findings[0].expected, 90);
  assertEqual(
    auditInstructionTiming("सत्र I के लिए 45 मिनट हैं; पूरा प्रश्नपत्र 90 मिनट का है।", AUDIT_GROUPED).length,
    0,
    "pool values and the total are legitimate in Hindi too"
  );
  assertEqual(
    auditInstructionTiming("आपके पास 3 घंटे हैं।", AUDIT_GROUPED)[0]?.stated,
    180,
    "Hindi hours are durations too"
  );
});

test("the audit reads Hindi mode phrases", () => {
  const freeOnGrouped = auditInstructionTiming(
    "सभी खंडों के लिए एक ही टाइमर है — किसी भी क्रम में जाएँ।",
    AUDIT_GROUPED
  );
  assertEqual(freeOnGrouped.length, 1);
  assertDeep(freeOnGrouped[0], { kind: "mode", stated: "free", expected: "grouped" });

  const lockedOnGrouped = auditInstructionTiming(
    "प्रत्येक खंड का समय अलग-अलग है — एक समय में एक ही खंड।",
    AUDIT_GROUPED
  );
  assertEqual(lockedOnGrouped.length, 1);
  assertDeep(lockedOnGrouped[0], { kind: "mode", stated: "locked", expected: "grouped" });

  // Fresh Hindi grouped text stays clean against its own paper.
  const hi = generateExamInstruction(GROUP_FACTS_HI, "hi");
  assertDeep(auditInstructionTiming(hi, AUDIT_GROUPED), []);
});

// ─── [7] Migration ──────────────────────────────────────────────────────────
console.log("\n[7] Migration");

const MIGRATION = "20260824000000_add_section_timing_groups.sql";

test("migration creates the table and the membership column, idempotently", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "CREATE TABLE IF NOT EXISTS public.section_timing_groups");
  assertContains(sql, "ADD COLUMN IF NOT EXISTS timing_group_id uuid");
});

test("deleting a group ungroups; deleting the exam cascades", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "REFERENCES public.section_timing_groups(id) ON DELETE SET NULL");
  assertContains(sql, "REFERENCES public.exams(id) ON DELETE CASCADE");
});

test("a pool of zero or less is rejected at the database", () => {
  assertContains(readMigration(MIGRATION), "time_minutes IS NULL OR time_minutes > 0");
});

test("RLS: creators manage their own, anyone reads published", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "ENABLE ROW LEVEL SECURITY");
  assertContains(sql, "Anyone can view timing groups of published exams");
  assertContains(sql, "exams.user_id = auth.uid()");
});

test("migration reloads the PostgREST schema cache and verifies its own paste", () => {
  const sql = readMigration(MIGRATION);
  assertContains(sql, "NOTIFY pgrst, 'reload schema'");
  assertContains(sql, "RAISE EXCEPTION");
  assertContains(sql, "information_schema.columns");
});

test("migration never touches sections.time_minutes or section_group_id", () => {
  const sql = readMigration(MIGRATION);
  assert(!/UPDATE\s+public\.sections/i.test(sql), "no data rewrite");
  assert(!/DROP\s+COLUMN/i.test(sql), "no column drops");
});

// ─── [8] Writes gate on the live schema ─────────────────────────────────────
console.log("\n[8] Writes gate on the live schema");

test("every write in timingGroupSettings probes before naming the column", () => {
  const src = readSrc("lib/timingGroupSettings.ts");
  assertContains(src, 'tableHasColumn("sections", TIMING_GROUP_COLUMN)');
  assertContains(src, '"missing-migration"');
});

test("reads resolve to [] on any failure — no groups is the safe reading", () => {
  const src = readSrc("lib/timingGroupSettings.ts");
  const fetchFn = src.slice(src.indexOf("export async function fetchTimingGroups"), src.indexOf("export async function createTimingGroup"));
  assertContains(fetchFn, "return [];");
  assertContains(fetchFn, "catch");
});

test("a half-made group is rolled back, not left orphaned", () => {
  const src = readSrc("lib/timingGroupSettings.ts");
  const createFn = src.slice(src.indexOf("export async function createTimingGroup"), src.indexOf("export async function updateTimingGroup"));
  assertContains(createFn, ".delete()", "membership failure must delete the orphan group row");
});

// ─── [9] Wiring — every page resolves grouping the same one way ─────────────
console.log("\n[9] Wiring");

test("the simulator derives units from primary rows and scopes the free machinery", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  assertContains(src, "fetchTimingGroups(examId)");
  assertContains(src, "resolveTimingGroupIds(allSecs");
  assertContains(src, "const multiNav = isFreeNav || groupNav");
  assertContains(src, "unitContaining(units, sectionData.id)");
  // The part's clock never comes from a member's own minutes.
  assertContains(src, "groupPoolMinutes(urlUnit.group, memberSections)");
  // Between parts the hand-off is a NAVIGATION — a fresh clock by construction,
  // which is exactly the "time does not carry over" promise.
  assertContains(src, "unitInfo.nextSectionId");
});

test("free mode ignores groups — one paper-wide clock makes pools meaningless", () => {
  assertContains(
    readSrc("pages/ExamSimulator.tsx"),
    "if (freeNav || timingGroupRows.length === 0) return null"
  );
});

test("the intro and the editor resolve groups exactly like the runner", () => {
  for (const page of ["pages/ExamIntro.tsx", "pages/ExamDetail.tsx"]) {
    const src = readSrc(page);
    assertContains(src, "resolveTimingGroupIds(", `${page} must resolve through primary rows`);
    assertContains(src, "fetchTimingGroups(", `${page} must fetch groups absent-tolerantly`);
  }
});

test("reconciliation always receives group facts — the anti-lie rule", () => {
  // Every fact-building call site hands groups to the engine; miss one and the
  // self-healer rewrites a TRUE grouped sentence into a stale per-section one.
  const intro = readSrc("pages/ExamIntro.tsx");
  const introReconcile = intro.slice(
    intro.indexOf("const displayedExamInstruction = reconcileTimingLine(")
  );
  assertContains(introReconcile.slice(0, 2200), "groups:");
  const editor = readSrc("pages/ExamDetail.tsx");
  assertContains(editor, "groups: instructionGroupFacts");
  // The audit itself moved to lib/instructionDrift.js so the publish dialog
  // derives drift the same way the editor does — the unit-clock rule follows it.
  const drift = readSrc("lib/instructionDrift.js");
  assertContains(drift, "unitMinutes: hasGroupUnits(units) ? units.map((u) => u.minutes) : null");
  assertContains(drift, "groups,", "the reconciler is handed group facts here too");
});

test("the builder edits structure on the primary tab only", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  assertContains(src, "isPrimaryLanguage && sections.length >= 2");
  assertContains(src, "const primaryTwinId");
  assertContains(src, "membershipChangeAfterReorder(updatedItems");
  assertContains(src, "pruneThinGroups(");
});

test("a grouped member carries no time chrome — the group header is the clock", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  // Inside a group the pool is the only clock the runner enforces, so the row
  // shows NOTHING where the minutes box was — not a pill repeating "shared
  // clock" N times; the container's head strip says it once.
  assertContains(src, ") : run.group ? (");
  const branchStart = src.indexOf(") : run.group ? (");
  // The grouped branch runs from the ternary's `?` to its `:` — that window
  // must be empty of controls (the else branch after it is the ungrouped
  // MinutesField, which is fine).
  const minutesSlot = src.slice(branchStart, src.indexOf(") : (", branchStart + 1));
  assertContains(minutesSlot, "null");
  assert(!minutesSlot.includes("<MinutesField"), "no editable minutes box inside a group");
  // The saved minutes are still promised back, on the Ungroup control.
  assertContains(src, "come back if you ungroup");
  assertContains(src, "Shared clock", "the head strip names the concept once");
  // And the pool starts as a visible, editable number: creation materializes
  // the member sum instead of leaving an invisible auto-fallback.
  assertContains(src, "sumSectionMinutes(members)");
});

test("both duplicate-exam flows copy timing groups", () => {
  assertContains(readSrc("pages/ExamDetail.tsx"), "copyTimingGroups(exam.id, newExam.id, sectionIdMap");
  assertContains(readSrc("pages/Dashboard.tsx"), "copyTimingGroups(exam.id, newExam.id, sectionIdMap");
});

test("the intro's paper table pools grouped rows into one timing cell", () => {
  const src = readSrc("pages/ExamIntro.tsx");
  assertContains(src, "rowSpan={r.group.size}");
  assertContains(src, "The paper is sat in timed parts");
});

test("review and analytics name the pool, never a member's own clock", () => {
  assertContains(readSrc("pages/ExamReview.tsx"), "m shared");
  assertContains(readSrc("pages/Analytics.tsx"), "m shared");
});

// ─── [10] Findings from the adversarial review, pinned so they stay fixed ───
console.log("\n[10] Review findings stay fixed");

test("the submit latch and 5-minute warning re-arm with every fresh clock", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  // The route has no key, so the SAME component instance serves every section
  // of a sitting — a latch held from the last save would dead-end every submit
  // after the first (critical finding: part 2 could never be submitted).
  const start = src.slice(src.indexOf("const handleStartSection"), src.indexOf("const updateQuestionTime"));
  assertContains(start, "submittingRef.current = false");
  assertContains(start, "timeWarningShownRef.current = false");
  const proceed = src.slice(src.indexOf("const handleProceedToNextSection"), src.indexOf("const handleFinishExam"));
  assertContains(proceed, "submittingRef.current = false");
  assert(
    !proceed.includes("remounts this page"),
    "the hand-off does NOT remount — a comment claiming it does is how the latch bug happened"
  );
});

test("the 5-minute warning fires once per clock, not once per tick", () => {
  assertContains(readSrc("pages/ExamSimulator.tsx"), "!timeWarningShownRef.current");
});

test("auto-submit banks the open question's stint exactly like a manual submit", () => {
  const src = readSrc("pages/ExamSimulator.tsx");
  const auto = src.slice(src.indexOf("const handleAutoSubmit = async"), src.indexOf("// Keep the ref in sync"));
  assertContains(auto, "Deliberately NO updateQuestionTime()");
  assert(
    !/^\s*updateQuestionTime\(\);/m.test(auto),
    "updateQuestionTime before submitExam resets the ref and loses the final stint to a queued state update"
  );
});

test("drags never touch dormant groups while whole-paper switching is on", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  const reorder = src.slice(src.indexOf("const processSectionReorder"), src.indexOf("const handleEditQuestion"));
  assertContains(
    reorder,
    "if (!allowSectionSwitching) {",
    "membership repair must be locked-mode only — dormant groups are invisible and must sleep untouched"
  );
});

test("every membership transfer prunes; donor groups dissolve on regroup", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  const reorder = src.slice(src.indexOf("const processSectionReorder"), src.indexOf("const handleEditQuestion"));
  assert(
    !/if \(!change\.timingGroupId\) \{/.test(reorder),
    "prune must run on JOIN drags too — the donor group can go thin"
  );
  const create = src.slice(src.indexOf("const handleCreateGroup"), src.indexOf("const handleUngroup"));
  assertContains(create, "donorIds", "regrouping members of an existing group must dissolve it, visibly");
  assertContains(
    create,
    "const orderSaved = await commitSectionOrder(reordered)",
    "membership must never be written over an order that did not persist"
  );
});

test("select mode dies with the tab or mode it was opened in", () => {
  const src = readSrc("pages/ExamDetail.tsx");
  const langSwitch = src.slice(src.indexOf("const handleLanguageSwitch"), src.indexOf("const handleLanguageSwitch") + 2000);
  assertContains(langSwitch, "setGroupSelectMode(false)");
  const toggle = src.slice(src.indexOf("const handleToggleSectionSwitching"), src.indexOf("const handleTotalTimeChange"));
  assertContains(toggle, "setGroupSelectMode(false)");
});

test("duplicates keep the language identity groups resolve through", () => {
  const src = readSrc("pages/Dashboard.tsx");
  const dup = src.slice(src.indexOf("const handleDuplicateExam"));
  assertContains(dup, "supported_languages", "a copy without the language fields hides every non-English section");
  assertContains(dup, "primary_language");
});

test("copyTimingGroups never recreates a thin group", () => {
  assertContains(readSrc("lib/timingGroupSettings.ts"), "memberNewIds.length < 2");
});

test("the intro derives units from the sections the runner will sit", () => {
  const src = readSrc("pages/ExamIntro.tsx");
  assertContains(src, "questionedPrimaryIds");
  assertContains(src, "timingUnits(unitSections");
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.error}`));
}
console.log(`${"─".repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
