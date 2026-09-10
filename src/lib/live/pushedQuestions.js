/**
 * Filing a pushed question into a list that is addressed by position.
 *
 * WHY THIS EXISTS
 * A live exam's paper used to reach every browser at join — the whole thing, in
 * one request, from the moment the share link was opened, which is before the
 * session starts. The answer keys were withheld, so this read as safe; but in a
 * live exam the paper IS the secret, and "one question at a time" was a visual
 * effect rather than a rule.
 *
 * The server now releases only up to the question being played, and delivers
 * each newly unlocked one on the live_exams row — which both live pages already
 * receive, over Realtime and inside the sync poll. Fetching per unlock instead
 * would have cost one request per question per student, which a free-tier
 * project cannot spend.
 *
 * That leaves this: the list is addressed BY POSITION (`questions[index]`, with
 * the index coming from the host's cursor), so a question filed at the wrong
 * slot does not throw — it silently puts a different question on screen than the
 * host announced. Hence a pure function with its own tests, shared by the
 * student runner and the projector, rather than the same twenty lines written
 * twice and drifting.
 */

/**
 * The outcome of a merge, as a tagged union:
 *
 *   noop    nothing to do — no payload, already held, or nothing in this language
 *   merged  `questions` is the list with the question filed at its ordinal
 *   gap     unlocks were missed and the list would be left sparse. The caller
 *           must refetch rather than guess; the view is gated now, so refetching
 *           returns exactly what has been asked.
 *
 * @typedef {{ kind: "noop" }
 *          | { kind: "merged", questions: any[] }
 *          | { kind: "gap" }} MergeOutcome
 */

/**
 * Place the open question into `held` at `ordinal`, for `language`.
 *
 * `ordinal` is the host's cursor, and it is the payload's ordinal too: the
 * server writes both onto the same row version, so they cannot disagree.
 *
 * Ordinals are numbered per language — the same convention get_revealed_live_answers
 * uses — so a language's own list is dense from 0, and the position a question
 * belongs at is simply its ordinal.
 *
 * @param {any[]} held      the list as this page holds it, indexed by ordinal
 * @param {any[]|null|undefined} payload  every language's copy of the open question
 * @param {number} ordinal  the host's cursor
 * @param {string} language the language this page is showing
 * @returns {MergeOutcome}
 */
export function mergePushedQuestion(held, payload, ordinal, language) {
  if (!payload || payload.length === 0 || ordinal < 0) return { kind: "noop" };

  const mine = payload.find((q) => q.language === language);
  // No counterpart in this language. Not a gap and not an error: this list is
  // simply shorter than the paper, which the "not available in your language"
  // path already surfaces. Refetching would find nothing either.
  if (!mine) return { kind: "noop" };

  // Already have it. The common case — the same observation arrives on both
  // transport lanes, and again on every poll until the next unlock.
  if (held.some((q) => q.id === mine.id)) return { kind: "noop" };

  // A hole: two or more unlocks passed without this page seeing the ones in
  // between (a backgrounded tab, a dropped Realtime message). Filing this one
  // at its ordinal would leave the array sparse, and every position-based read
  // past the hole would then address the wrong question.
  if (ordinal > held.length) return { kind: "gap" };

  const next = held.slice();
  next[ordinal] = mine;
  return { kind: "merged", questions: next };
}
