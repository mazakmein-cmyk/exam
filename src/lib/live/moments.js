/**
 * moments.js — B14. Choosing WHICH story to tell, and how to phrase it.
 *
 * The server finds every moment in a question. This picks the one to show, and
 * the picking is the whole feature.
 *
 * Rotation fairness
 * ----------------
 * Without it, B14 becomes the leaderboard again: the strongest student generates
 * a streak on nearly every question, so the same name appears fifteen times in a
 * row and the recognition stops meaning anything. Worse, it actively tells the
 * other twenty-nine students that the feature is not about them.
 *
 * So the ranking is: never-featured students first, then by moment priority. A
 * comeback still outranks a streak — but a comeback from someone already
 * celebrated twice loses to a first-time streak. That single rule is the
 * difference between a feature teachers love and one they switch off.
 *
 * Pure and dependency-free so the tests drive the real implementation.
 */

/**
 * @typedef {Object} Moment
 * @property {number} question_ordinal
 * @property {string} kind
 * @property {string|null} user_id
 * @property {string|null} display_name
 * @property {number} value
 * @property {number} priority   lower sorts first; set server-side
 */

/**
 * Pick the moment to feature for one question.
 *
 * @param {Moment[]} allMoments every moment in the session, any order
 * @param {number} ordinal      the question being revealed
 * @returns {Moment|null}
 */
export function selectMoment(allMoments, ordinal) {
  if (!Array.isArray(allMoments) || allMoments.length === 0) return null;

  const candidates = allMoments.filter((m) => m.question_ordinal === ordinal);
  if (candidates.length === 0) return null;

  // How often each student has ALREADY been featured, counting only questions
  // before this one — a student's own earlier moments in the same question must
  // not count against them.
  const featured = new Map();
  for (let i = 0; i < ordinal; i++) {
    const chosen = selectWithoutRotation(allMoments.filter((m) => m.question_ordinal === i));
    if (chosen?.user_id) {
      featured.set(chosen.user_id, (featured.get(chosen.user_id) || 0) + 1);
    }
  }

  return [...candidates].sort((a, b) => {
    const fa = a.user_id ? featured.get(a.user_id) || 0 : 0;
    const fb = b.user_id ? featured.get(b.user_id) || 0 : 0;
    if (fa !== fb) return fa - fb;      // fresh faces first
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.value - a.value;           // bigger streak, longer comeback
  })[0];
}

/** Priority order alone — used to reconstruct past picks without recursing. */
function selectWithoutRotation(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) => a.priority - b.priority || b.value - a.value
  )[0];
}

/**
 * Copy for a moment, phrased as something a creator can read out loud.
 *
 * Second person to the room, never third person about a student — "Sana turned it
 * around" is a teacher speaking, "Student 4 achieved a comeback" is a scoreboard.
 *
 * @param {Moment|null} moment
 * @returns {{ headline: string, detail: string, emoji: string }|null}
 */
export function momentCopy(moment) {
  if (!moment) return null;
  const who = moment.display_name || "Someone";

  switch (moment.kind) {
    case "comeback":
      return {
        emoji: "📈",
        headline: `${who} turned it around`,
        detail: `${moment.value} right in a row after a rough start.`,
      };
    case "lone_correct":
      return {
        emoji: "🎯",
        headline: `Only ${who} got that one`,
        detail: `Out of ${moment.value} answers.`,
      };
    case "streak":
      return {
        emoji: "🔥",
        headline: `${who} is on ${moment.value} in a row`,
        detail: "Unbeaten so far this run.",
      };
    case "perfect_run":
      return {
        emoji: "💎",
        headline: `${who} hasn't missed one`,
        detail: `${moment.value} for ${moment.value}.`,
      };
    case "class_first_perfect":
      return {
        emoji: "🎉",
        headline: "Everyone got that one",
        detail: `All ${moment.value} of you.`,
      };
    default:
      return null;
  }
}

/**
 * Swap in the creator's real names.
 *
 * get_live_moments returns the display-SAFE name, because under privacy mode that
 * row would otherwise carry a real one to a projector. The control room — the only
 * screen never cast — resolves the truth from the id.
 *
 * @param {Moment[]} moments
 * @param {Map<string,string>} names user_id → real display name
 * @returns {Moment[]}
 */
export function withRealNames(moments, names) {
  if (!names || names.size === 0) return moments;
  return moments.map((m) =>
    m.user_id && names.has(m.user_id)
      ? { ...m, display_name: names.get(m.user_id) }
      : m
  );
}
