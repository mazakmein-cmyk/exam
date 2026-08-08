/**
 * instructionTimingAudit.js — notice when written instructions have gone out of
 * date about the clock.
 *
 * The failure this exists for
 * ---------------------------
 * "Generate from exam" writes the Exam Instruction field from the paper as it
 * stands at click time: "You have 155 minutes for the whole paper. All sections
 * share one clock." That text is then stored. Turn section switching off a week
 * later and the paper becomes four sections of their own clocks totalling 120
 * minutes — but the sentence does not change, because prose does not know it is
 * describing something that moved.
 *
 * The intro screen then shows a student both, side by side: authored text
 * claiming 155 minutes and one clock, and a computed panel stating 120 minutes
 * and one section at a time. Only the computed one is true — the runner reads
 * the same settings it does — so the student has been misinformed by the thing
 * that reads most like a promise. Flipping the mode already fires a toast about
 * this, but a toast is gone in four seconds and the text stays wrong for months.
 *
 * Why only timing
 * ---------------
 * The generator writes question counts and marking too, and those can rot the
 * same way — but verifying them needs the same network round trip generation
 * needs, which is exactly why GenerateExamInstruction refuses to show an
 * "up to date" checkmark. Timing is different: how the paper is clocked lives in
 * the editor's own state, so this check is free and can never be a stale claim
 * of its own. A narrow check that is always right beats a broad one that needs a
 * fetch to be trusted.
 *
 * False positives are the thing to avoid
 * --------------------------------------
 * A creator who is warned about nothing stops reading warnings. So:
 *  • Numbers under MIN_PAPER_MINUTES are ignored — the standard instructions say
 *    "a warning appears when 5 minutes remain", and that 5 is not a claim about
 *    the paper's length.
 *  • Any number matching a section's own clock is allowed, because listing them
 *    ("Section 1 — 25 minutes") is a legitimate thing for instructions to do.
 *  • Silence when the paper has no timing at all: there is nothing to disagree
 *    with yet.
 */

/** Below this, a number in instruction prose is not claiming to be the paper's length. */
const MIN_PAPER_MINUTES = 20;

const MINUTES_PATTERN = /(\d{1,4})\s*(?:minutes|minute|mins|min)\b/gi;
const HOURS_PATTERN = /(\d{1,3})\s*(?:hours|hour|hrs|hr)\b/gi;

/** Phrases only true of a paper on one shared clock. */
const FREE_NAV_PHRASES =
  /share one clock|one clock for the|switch between sections|move between them|in any order/i;
/** Phrases only true of a paper sat one section at a time. */
const LOCKED_NAV_PHRASES =
  /one section at a time|cannot be reopened|each on its own clock|sat in order|its own clock/i;

/**
 * What the paper actually gives a candidate, by the same rule the runner uses.
 * @param {{ allowSectionSwitching: boolean, totalMinutes: number|null, sectionMinutes: number[] }} facts
 */
export function effectivePaperMinutes(facts) {
  const sections = Array.isArray(facts?.sectionMinutes) ? facts.sectionMinutes : [];
  const sum = sections.reduce(
    (total, m) => total + (Number.isFinite(Number(m)) && Number(m) > 0 ? Math.floor(Number(m)) : 0),
    0
  );
  if (!facts?.allowSectionSwitching) return sum;
  const chosen = Number(facts?.totalMinutes);
  return Number.isFinite(chosen) && chosen > 0 ? Math.floor(chosen) : sum;
}

/** Every duration the text claims, in minutes, deduped and in the order stated. */
function statedMinutes(text) {
  const found = [];
  const push = (value) => {
    if (Number.isFinite(value) && value > 0 && !found.includes(value)) found.push(value);
  };
  for (const match of String(text).matchAll(MINUTES_PATTERN)) push(parseInt(match[1], 10));
  for (const match of String(text).matchAll(HOURS_PATTERN)) push(parseInt(match[1], 10) * 60);
  return found;
}

/**
 * @param {string} text  The stored instruction copy.
 * @param {{ allowSectionSwitching: boolean, totalMinutes: number|null, sectionMinutes: number[] }} facts
 * @returns {Array<{kind: "duration", stated: number, expected: number} | {kind: "mode", stated: "free"|"locked", expected: "free"|"locked"}>}
 */
export function auditInstructionTiming(text, facts) {
  const findings = [];
  const body = typeof text === "string" ? text : "";
  if (!body.trim()) return findings;

  const expected = effectivePaperMinutes(facts);
  const sectionClocks = (Array.isArray(facts?.sectionMinutes) ? facts.sectionMinutes : [])
    .map((m) => Math.floor(Number(m)))
    .filter((m) => Number.isFinite(m) && m > 0);

  // A paper with no clock at all cannot be contradicted about its clock.
  if (expected > 0) {
    const allowed = new Set([expected, ...sectionClocks]);
    for (const stated of statedMinutes(body)) {
      if (stated < MIN_PAPER_MINUTES || allowed.has(stated)) continue;
      findings.push({ kind: "duration", stated, expected });
      break; // One is enough to send the creator back to the text.
    }
  }

  const allowSwitching = !!facts?.allowSectionSwitching;
  if (allowSwitching && LOCKED_NAV_PHRASES.test(body) && !FREE_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "locked", expected: "free" });
  } else if (!allowSwitching && FREE_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "free", expected: "locked" });
  }

  return findings;
}

/** One sentence a creator can act on, or null when the text and the paper agree. */
export function describeTimingDrift(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const parts = findings.map((f) =>
    f.kind === "duration"
      ? `it says ${f.stated} min, but students get ${f.expected} min`
      : f.stated === "free"
        ? "it describes one shared clock, but sections are sat one at a time"
        : "it describes one section at a time, but the paper shares one clock"
  );
  return `This text disagrees with the paper: ${parts.join("; ")}.`;
}
