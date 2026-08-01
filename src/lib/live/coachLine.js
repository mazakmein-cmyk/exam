/**
 * coachLine.js — A8. One sentence telling the creator what to SAY.
 *
 * The problem it solves
 * -------------------
 * The control deck shows four numbers: in the room, response rate, class
 * accuracy, fastest. All correct, all useful, and all requiring the creator to do
 * the thinking. In front of a class, with a timer running, nobody does statistics
 * in their head. They glance, feel vaguely informed, and move on.
 *
 * This is the difference between a dashboard and a co-pilot. Data that has
 * already been interpreted costs nothing to use.
 *
 * Design rules, all of which are load-bearing
 * -------------------------------------------
 * ONE LINE. The temptation is to surface three insights. Three sentences is a
 * paragraph, and a paragraph mid-lesson goes unread. First match on a priority
 * ladder wins, and returning nothing is a valid, common, good outcome.
 *
 * NEVER SCOLD. "Only 9 have answered" is information. "You're going too fast" is
 * a critique, and a creator who feels judged turns the feature off. Every string
 * here describes the room, never the teacher.
 *
 * A RULE ID, NOT A STRING, DRIVES RE-RENDERS. The numbers inside a line wiggle
 * constantly; the line itself should change only when the situation does. The
 * caller re-renders on `ruleId`, so a line that says "9 of 34" does not flicker
 * as the 9 climbs.
 *
 * RULES ENGINE, NOT A MODEL. Instant, offline, free, deterministic, and testable
 * against a fixture table. This is the one surface that must never stutter.
 */

/** Confusion signals worth interrupting for, as a share of the room. */
export const CONFUSED_SHARE = 0.15;

/** Below this share answered, with little time left, the room is still reading. */
export const STALLED_SHARE = 0.4;

/** "Little time left" — the last quarter of the question. */
export const STALLED_TIME_SHARE = 0.25;

/** A drop this large in the last 30s is infrastructure, not difficulty. */
export const OFFLINE_DROP_SHARE = 0.2;

/** Wrong answers this fast, as a share of responses, mean confident-wrong. */
export const IMPULSIVE_SHARE = 0.2;

/** Median under this share of the window means the class found it easy. */
export const CRUISING_MEDIAN_SHARE = 0.4;

/** Minutes over budget before pace is worth mentioning. */
export const PACE_OVERRUN_MIN = 5;

/**
 * @typedef {Object} CoachContext
 * @property {'lobby'|'open'|'revealed'|'ended'} phase
 * @property {number} remainingSeconds
 * @property {number} totalSeconds        allotted + granted
 * @property {number} answered
 * @property {number} onlineCount
 * @property {number} onlineDelta30s      negative when people dropped off
 * @property {number} confusionCount
 * @property {import('./classifyDistribution.js').Classification|null} classification
 * @property {{impulsiveWrong:number, medianMs:number|null}|null} timeProfile
 * @property {number} questionIndex
 * @property {number} totalQuestions
 * @property {number} elapsedMinutes
 * @property {number} plannedMinutes
 * @property {(index:number)=>string} [optionLabel]
 */

/**
 * @typedef {Object} CoachLine
 * @property {string} ruleId  stable across number changes; drives re-render
 * @property {string} text
 * @property {'calm'|'act'|'warn'} tone
 */

const letter = (i) => (i >= 0 && i < 26 ? String.fromCharCode(65 + i) : String(i));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {CoachContext} ctx
 * @returns {CoachLine|null}
 */
export function deriveCoachLine(ctx) {
  if (!ctx) return null;
  const {
    phase,
    remainingSeconds = 0,
    totalSeconds = 0,
    answered = 0,
    onlineCount = 0,
    onlineDelta30s = 0,
    confusionCount = 0,
    classification = null,
    timeProfile = null,
    questionIndex = -1,
    totalQuestions = 0,
    elapsedMinutes = 0,
    plannedMinutes = 0,
  } = ctx;

  // 1. Broken before confused, always. If a fifth of the room just vanished, the
  // low response rate is a network event and every reading below it is a lie.
  if (onlineDelta30s < 0 && onlineCount > 0) {
    const lost = Math.abs(onlineDelta30s);
    if (lost >= Math.max(3, onlineCount * OFFLINE_DROP_SHARE)) {
      return {
        ruleId: "offline-drop",
        tone: "warn",
        text: `${plural(lost, "student", "students")} went offline just now — likely wifi, not the question.`,
      };
    }
  }

  // 2. Confusion is the only signal that arrives while help is still useful.
  if (confusionCount > 0 && onlineCount > 0 && confusionCount >= onlineCount * CONFUSED_SHARE) {
    return {
      ruleId: "confused",
      tone: "act",
      text: `${plural(confusionCount, "student has", "students have")} flagged confusion — worth pausing here.`,
    };
  }

  // 3. Stalled. Only while the question is genuinely open, and only late enough
  // that it means something: at 5 seconds in, nobody has answered and that is fine.
  if (phase === "open" && onlineCount > 0 && totalSeconds > 0) {
    const timeLeftShare = remainingSeconds / totalSeconds;
    if (timeLeftShare <= STALLED_TIME_SHARE && answered < onlineCount * STALLED_SHARE) {
      return {
        ruleId: "stalled",
        tone: "act",
        text: `Only ${answered} of ${onlineCount} have answered with ${remainingSeconds}s left — most are still reading.`,
      };
    }
  }

  // Rules 4-8 read the reveal, so they need a classification.
  if (classification) {
    const label = ctx.optionLabel || letter;

    // 4. The money case: a wrong option beat the answer.
    if (classification.kind === "systematic" && classification.dominantIndex !== null) {
      const pct = classification.percentages[classification.dominantIndex] || 0;
      return {
        ruleId: "systematic",
        tone: "act",
        text: `${pct}% picked ${label(classification.dominantIndex)}. Ask someone to explain ${label(
          classification.dominantIndex
        )} before you move on.`,
      };
    }

    if (classification.kind === "split" && classification.dominantIndex !== null) {
      const [a, b] = classification.topTwo;
      return {
        ruleId: "split",
        tone: "act",
        text: `${label(a)} and ${label(b)} are neck and neck — a good one to discuss in pairs.`,
      };
    }

    if (classification.kind === "scattered") {
      return {
        ruleId: "scattered",
        tone: "warn",
        text: "Answers are spread evenly — this looks like guessing rather than a wrong idea.",
      };
    }

    // 7. Fast and wrong is a different student from slow and wrong, and the
    // distinction is invisible in an accuracy percentage.
    if (timeProfile && classification.responders > 0) {
      const impulsive = timeProfile.impulsiveWrong || 0;
      if (impulsive >= Math.max(3, classification.responders * IMPULSIVE_SHARE)) {
        return {
          ruleId: "impulsive",
          tone: "act",
          text: `${plural(impulsive, "student", "students")} answered wrong in a couple of seconds — they think they know it.`,
        };
      }
    }

    // 8. Permission to speed up is as useful as a warning to slow down.
    if (classification.kind === "solid") {
      const median = timeProfile?.medianMs ?? null;
      const quick = median !== null && totalSeconds > 0 && median < totalSeconds * 1000 * CRUISING_MEDIAN_SHARE;
      return {
        ruleId: quick ? "cruising" : "solid",
        tone: "calm",
        text: quick
          ? "Everyone got this, and quickly. Safe to pick up the pace."
          : "Most of the class got this one.",
      };
    }
  }

  // 9. Pace, last: useful but never more urgent than the room in front of you.
  if (
    phase !== "lobby" &&
    phase !== "ended" &&
    plannedMinutes > 0 &&
    questionIndex >= 0 &&
    totalQuestions > 0
  ) {
    const done = questionIndex + 1;
    if (done >= 3 && done < totalQuestions) {
      const projected = (elapsedMinutes / done) * totalQuestions;
      const overrun = Math.round(projected - plannedMinutes);
      if (overrun >= PACE_OVERRUN_MIN) {
        return {
          ruleId: "pace",
          tone: "warn",
          text: `About ${overrun} minutes over budget at this pace, with ${totalQuestions - done} to go.`,
        };
      }
    }
  }

  // Silence is a valid output, and the common one.
  return null;
}
