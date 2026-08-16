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

// The Hindi units carry no \b: JS word boundaries are ASCII-word-based, so a
// \b after Devanagari never matches and "90 मिनट" would silently escape the
// audit — every Hindi duration claim unchecked. मिनट as a bare token also
// matches its plural मिनटों, which is what we want.
const MINUTES_PATTERN = /(\d{1,4})\s*(?:min(?:ute)?s?\b|मिनट)/gi;
const HOURS_PATTERN = /(\d{1,3})\s*(?:h(?:ou)?rs?\b|घंट(?:े|ा|ों)|घण्ट(?:े|ा|ों))/gi;

/** Phrases only true of a paper on one shared clock. Both copy packs. */
const FREE_NAV_PHRASES =
  /share one clock|one clock for the|switch between sections|move between them|in any order|एक ही टाइमर|किसी भी क्रम/i;
/** Phrases only true of a paper sat one section at a time. Both copy packs. */
const LOCKED_NAV_PHRASES =
  /one section at a time|cannot be reopened|each on its own clock|sat in order|its own clock|एक समय में एक ही खंड|दोबारा नहीं खोला|का समय अलग-अलग/i;
/**
 * Phrases only true of a grouped paper (timing groups — "timed parts").
 * Mirrors the engine's grouped copy in both languages.
 */
const GROUPED_NAV_PHRASES = /timed parts|shared part|समयबद्ध भागों|साझा भाग/i;
/**
 * The locked phrases a GROUPED paper's own prose never contains. The full
 * LOCKED set cannot be used against a grouped paper: the engine's grouped
 * sentence legitimately says "a submitted part cannot be reopened" (दोबारा
 * नहीं खोला in the Hindi pack).
 */
const LOCKED_ONLY_PHRASES =
  /one section at a time|each on its own clock|timed separately|एक समय में एक ही खंड|का समय अलग-अलग/i;

/**
 * What the paper actually gives a candidate, by the same rule the runner uses.
 * `unitMinutes` is the grouped-paper shape (timing groups): the clock of each
 * timing unit in order — pools once per group, solo clocks as-is. When present
 * on a locked paper it IS the paper's arithmetic; grouped members' individual
 * time_minutes are shown to candidates nowhere and must not be summed twice.
 * @param {{ allowSectionSwitching: boolean, totalMinutes: number|null, sectionMinutes: number[], unitMinutes?: number[]|null }} facts
 */
export function effectivePaperMinutes(facts) {
  const positive = (list) =>
    (Array.isArray(list) ? list : []).reduce(
      (total, m) => total + (Number.isFinite(Number(m)) && Number(m) > 0 ? Math.floor(Number(m)) : 0),
      0
    );
  if (!facts?.allowSectionSwitching) {
    const units = Array.isArray(facts?.unitMinutes) ? facts.unitMinutes : null;
    return units && units.length > 0 ? positive(units) : positive(facts?.sectionMinutes);
  }
  const chosen = Number(facts?.totalMinutes);
  return Number.isFinite(chosen) && chosen > 0 ? Math.floor(chosen) : positive(facts?.sectionMinutes);
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
 * @param {{ allowSectionSwitching: boolean, totalMinutes: number|null, sectionMinutes: number[], unitMinutes?: number[]|null }} facts
 * @returns {Array<{kind: "duration", stated: number, expected: number} | {kind: "mode", stated: "free"|"locked"|"grouped", expected: "free"|"locked"|"grouped"}>}
 */
export function auditInstructionTiming(text, facts) {
  const findings = [];
  const body = typeof text === "string" ? text : "";
  if (!body.trim()) return findings;

  const grouped =
    !facts?.allowSectionSwitching &&
    Array.isArray(facts?.unitMinutes) &&
    facts.unitMinutes.length > 0;

  const expected = effectivePaperMinutes(facts);
  // What a number in the prose may legitimately be. Grouped: each unit's clock
  // (pools once per group, solo clocks as-is) — and deliberately NOT grouped
  // members' own time_minutes, which no candidate-facing surface states, so a
  // member figure in prose is stale by definition. Ungrouped: the section
  // clocks, as ever.
  const allowedClocks = (grouped ? facts.unitMinutes : facts?.sectionMinutes ?? [])
    .map((m) => Math.floor(Number(m)))
    .filter((m) => Number.isFinite(m) && m > 0);

  // A paper with no clock at all cannot be contradicted about its clock.
  if (expected > 0) {
    const allowed = new Set([expected, ...allowedClocks]);
    for (const stated of statedMinutes(body)) {
      if (stated < MIN_PAPER_MINUTES || allowed.has(stated)) continue;
      findings.push({ kind: "duration", stated, expected });
      break; // One is enough to send the creator back to the text.
    }
  }

  const allowSwitching = !!facts?.allowSectionSwitching;
  if (allowSwitching && LOCKED_NAV_PHRASES.test(body) && !FREE_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "locked", expected: "free" });
  } else if (grouped && FREE_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "free", expected: "grouped" });
  } else if (grouped && LOCKED_ONLY_PHRASES.test(body) && !GROUPED_NAV_PHRASES.test(body)) {
    // Per-section-clock prose on a paper that now pools sections. The narrow
    // phrase set matters: the grouped sentence itself says "cannot be
    // reopened", which the full LOCKED set would false-positive on.
    findings.push({ kind: "mode", stated: "locked", expected: "grouped" });
  } else if (!allowSwitching && !grouped && FREE_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "free", expected: "locked" });
  } else if (!allowSwitching && !grouped && GROUPED_NAV_PHRASES.test(body)) {
    findings.push({ kind: "mode", stated: "grouped", expected: "locked" });
  }

  return findings;
}

/** One sentence a creator can act on, or null when the text and the paper agree. */
export function describeTimingDrift(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const MODE_SENTENCES = {
    "free>locked": "it describes one shared clock, but sections are sat one at a time",
    "locked>free": "it describes one section at a time, but the paper shares one clock",
    "free>grouped": "it describes one shared clock for the paper, but this paper is sat in timed parts",
    "locked>grouped": "it describes per-section clocks, but this paper is sat in timed parts",
    "grouped>locked": "it describes shared timed parts, but each section has its own clock",
  };
  const parts = findings.map((f) =>
    f.kind === "duration"
      ? `it says ${f.stated} min, but students get ${f.expected} min`
      : MODE_SENTENCES[`${f.stated}>${f.expected}`] ??
        MODE_SENTENCES[f.stated === "free" ? "free>locked" : "locked>free"]
  );
  return `This text disagrees with the paper: ${parts.join("; ")}.`;
}
