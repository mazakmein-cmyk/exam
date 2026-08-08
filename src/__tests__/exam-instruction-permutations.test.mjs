/**
 * EXAM INSTRUCTION — THE FULL PERMUTATION SWEEP
 *
 * Run with: node src/__tests__/exam-instruction-permutations.test.mjs
 *
 * The engine's unit tests each pin one interesting cell (free mode, no
 * marking, unknown counts…). This file is the other kind of assurance: it
 * generates the FULL cross-product of facts — every mode × section shape ×
 * clock knowledge × count knowledge × marking configuration × answer-type mix
 * × language list, in both languages — and holds every single output to the
 * invariants that make generated text trustworthy:
 *
 *   truthful   — mode phrases never leak across modes; a fresh generation is
 *                never flagged by the timing-drift auditor that polices stale
 *                text (if it were, the intro would "correct" text the engine
 *                just wrote);
 *   complete   — numbered 1..n with no gaps, no line left unterminated;
 *   clean      — no undefined/NaN/null artifacts from an unhandled hole;
 *   equal      — Hindi says exactly as many things as English for the same
 *                facts, in Hindi;
 *   composable — dropShapeLine removes precisely the engine's shape line and
 *                renumbers; reconcileTimingLine is a no-op on text that
 *                already matches the paper.
 *
 * ~29k fact combinations × 2 languages. If a future line builder mishandles
 * one weird cell — an overrides-only paper with junk answer types and one
 * unclocked section — this is the net it lands in.
 */

import { generateExamInstruction, dropShapeLine, reconcileTimingLine } from "../lib/examInstructionEngine.js";
import { auditInstructionTiming } from "../lib/instructionTimingAudit.js";

let checked = 0;
let failed = 0;
const failures = [];
const byClass = new Map();

/** Collect at most a handful of failures — 29k identical stack traces help nobody. */
function violation(name, facts, lang, detail) {
  failed++;
  byClass.set(name, (byClass.get(name) || 0) + 1);
  if (failures.length < 8 && (byClass.get(name) || 0) <= 2) {
    failures.push({ name, lang, detail, facts: JSON.stringify(facts) });
  }
}

// ─── The dimensions ──────────────────────────────────────────────────────────

const SECTION_SETS = [
  [{ name: "General Awareness" }],
  [{ name: "General Awareness" }, { name: "Reasoning" }, { name: "Mathematics" }],
];
const MINUTE_VARIANTS = ["all-known", "one-missing"];
const COUNT_VARIANTS = ["known", "unknown"];
const MODES = [null, false, true];
const TOTALS = [90, null];
const TYPES = [null, { single: 10 }, { single: 8, multi: 2 }, { "multi-select": 3, garbage_type: 1 }];
const LANG_LISTS = [null, ["English"], ["English", "Hindi"]];

function markingVariants() {
  const out = [{ marking: null, scoredWithoutDefault: false }];
  out.push({ marking: null, scoredWithoutDefault: true });
  for (const wrong of [0, 0.5, 1])
    for (const skipped of [0, 0.25])
      for (const mcqMode of ["partial", "all_or_nothing"])
        for (const mcqWrongPenalty of ["flat", "per_option"])
          for (const uniform of [true, false])
            out.push({
              marking: { correct: 2, wrong, skipped, mcqMode, mcqWrongPenalty, uniform },
              scoredWithoutDefault: false,
            });
  return out;
}

function* allFacts() {
  for (const baseSections of SECTION_SETS)
    for (const minuteVariant of MINUTE_VARIANTS)
      for (const countVariant of COUNT_VARIANTS)
        for (const allowSectionSwitching of MODES)
          for (const totalMinutes of TOTALS)
            for (const { marking, scoredWithoutDefault } of markingVariants())
              for (const answerTypes of TYPES)
                for (const languageNames of LANG_LISTS) {
                  const sections = baseSections.map((s, i) => ({
                    name: s.name,
                    minutes: minuteVariant === "one-missing" && i === baseSections.length - 1 ? null : 15 + i * 5,
                    questionCount: countVariant === "known" ? 10 + i * 5 : null,
                  }));
                  yield {
                    sections,
                    allowSectionSwitching,
                    totalMinutes,
                    marking: marking === null ? null : { ...marking },
                    scoredWithoutDefault,
                    answerTypes: answerTypes === null ? null : { ...answerTypes },
                    languageNames: languageNames === null ? null : [...languageNames],
                  };
                }
}

// Phrase sets mirrored from instructionTimingAudit — a free paper must never
// carry a locked sentence and vice versa. (hi mirrors, hand-listed.)
const LOCKED_EN = /one section at a time|cannot be reopened|its own clock|sat in order|timed separately/i;
const FREE_EN = /share one clock|in any order|move between them/i;
// NOT bare "एक ही खंड" — the one-section SHAPE line says that legitimately in
// any mode; the locked phrase is "one section AT A TIME".
const LOCKED_HI = /एक समय में एक ही खंड|दोबारा नहीं खोला|का समय अलग-अलग है/;
const FREE_HI = /एक ही टाइमर|किसी भी क्रम/;

// ─── The sweep ───────────────────────────────────────────────────────────────

for (const facts of allFacts()) {
  const en = generateExamInstruction(facts, "en");
  const hi = generateExamInstruction(facts, "hi");
  checked++;

  for (const [lang, out] of [["en", en], ["hi", hi]]) {
    if (out === null) {
      violation("non-null", facts, lang, "sections exist, so there is always at least the shape line");
      continue;
    }
    // Case-sensitive NaN with boundaries: /nan/i would flag "uNANswered".
    if (/undefined|\[object/i.test(out) || /\bNaN\b/.test(out) || /(?<![a-zA-Z])null(?![a-zA-Z])/.test(out)) {
      violation("clean", facts, lang, `artifact in output:\n${out}`);
    }
    const lines = out.split("\n");
    if (!lines.every((line, i) => line.startsWith(`${i + 1}. `) && line.length > `${i + 1}. `.length)) {
      violation("numbering", facts, lang, `not 1..n contiguous:\n${out}`);
    }
    const terminator = lang === "hi" ? /।$/ : /\.$/;
    if (!lines.every((line) => terminator.test(line.trim()))) {
      violation("terminators", facts, lang, `unterminated line:\n${out}`);
    }
  }

  if (en !== null && hi !== null && en.split("\n").length !== hi.split("\n").length) {
    violation("parity", facts, "en/hi", `en says ${en.split("\n").length}, hi says ${hi.split("\n").length}`);
  }

  if (en !== null && hi !== null) {
    // Mode phrases stay in their mode — and an unchosen mode uses neither.
    const mode = facts.allowSectionSwitching;
    if (mode === true && (LOCKED_EN.test(en) || LOCKED_HI.test(hi))) {
      violation("mode-leak", facts, "both", `locked phrase in a free paper:\n${en}\n${hi}`);
    }
    if (mode === false && (FREE_EN.test(en) || FREE_HI.test(hi))) {
      violation("mode-leak", facts, "both", `free phrase in a locked paper:\n${en}\n${hi}`);
    }
    if (mode === null && (LOCKED_EN.test(en) || FREE_EN.test(en) || LOCKED_HI.test(hi) || FREE_HI.test(hi))) {
      violation("mode-leak", facts, "both", `mode phrase before the mode was chosen:\n${en}\n${hi}`);
    }

    // A fresh generation must never trip the drift auditor the intro runs —
    // otherwise the intro would "correct" text the engine just wrote.
    const auditFacts = {
      allowSectionSwitching: mode === true,
      totalMinutes: facts.totalMinutes,
      sectionMinutes: facts.sections.map((s) => s.minutes),
    };
    const findings = auditInstructionTiming(en, auditFacts);
    if (mode !== null && findings.length > 0) {
      violation("self-audit", facts, "en", `fresh text flagged as drifted: ${JSON.stringify(findings)}\n${en}`);
    }

    // Unknown facts say nothing (spot-check the sweep's own dimensions).
    if (facts.sections.every((s) => s.questionCount === null) && /questions in all/.test(en)) {
      violation("say-nothing", facts, "en", `total claimed with unknown counts:\n${en}`);
    }
    if (facts.marking === null && !facts.scoredWithoutDefault && /Marking:|अंकन:/.test(en + hi)) {
      violation("say-nothing", facts, "both", `marking prose on an unscored paper`);
    }
    if (facts.answerTypes && !facts.answerTypes.single && !facts.answerTypes.multi && /Question types|प्रश्नों के प्रकार/.test(en + hi)) {
      violation("say-nothing", facts, "both", `junk-only answer types earned a types line`);
    }
    if ((facts.languageNames?.length ?? 0) <= 1 && /available in|में उपलब्ध है/.test(en + hi)) {
      violation("say-nothing", facts, "both", `language line with nothing to choose`);
    }

    // dropShapeLine: removes exactly the engine's own first line, renumbers
    // contiguously, and is idempotent.
    for (const [lang, out] of [["en", en], ["hi", hi]]) {
      const dropped = dropShapeLine(out, lang);
      if (!dropped.changed) {
        violation("drop-shape", facts, lang, `engine output must contain its own shape line:\n${out}`);
        continue;
      }
      const lines = dropped.text === "" ? [] : dropped.text.split("\n");
      if (!lines.every((line, i) => line.startsWith(`${i + 1}. `))) {
        violation("drop-renumber", facts, lang, `renumbering broke:\n${dropped.text}`);
      }
      if (lines.length !== out.split("\n").length - 1) {
        violation("drop-shape", facts, lang, `dropped more or less than one line`);
      }
      if (dropShapeLine(dropped.text, lang).changed) {
        violation("drop-idempotent", facts, lang, `a second drop found a second shape line:\n${dropped.text}`);
      }
    }

    // reconcileTimingLine agrees with the paper it just described.
    if (reconcileTimingLine(en, facts, "en").changed || reconcileTimingLine(hi, facts, "hi").changed) {
      violation("reconcile-fixpoint", facts, "both", "fresh output should already match its own facts");
    }
  }
}

// Creator-authored text is never touched by either rewriter.
const creator = "1. Please bring your own calculator.\n2. This paper has three parts, take them seriously.";
if (dropShapeLine(creator, "en").changed) {
  violation("authorship", {}, "en", "dropShapeLine deleted a creator's sentence");
}

console.log("\n══ Exam instruction — permutation sweep ══\n");
console.log(`  ${checked} fact combinations × 2 languages checked`);
if (failed > 0) {
  console.log(`  ❌ ${failed} invariant violations`);
  for (const [name, count] of byClass) console.log(`     ${name}: ${count}`);
  for (const f of failures) {
    console.log(`\n  • [${f.name}] (${f.lang})\n    ${f.detail}\n    facts: ${f.facts}`);
  }
  console.log("─".repeat(60));
  process.exit(1);
}
console.log("  ✅ every cell holds every invariant");
console.log("─".repeat(60) + "\n");
