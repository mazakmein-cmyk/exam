/**
 * classifyDistribution.js — B4, naming the SHAPE of how a class answered.
 *
 * Why a shape and not a number
 * ---------------------------
 * The reveal already draws four bars with percentages. A creator standing in
 * front of a class, mid-sentence, with a timer running, does not compare four
 * bars — they glance, feel vaguely informed, and move on. The information is
 * there and it is not being used.
 *
 * What matters is not which bar is tallest but which of four situations this is,
 * because each has a different teaching response and the difference is not
 * obvious from the bars:
 *
 *   systematic  one wrong option beat the right one. A shared misconception, not
 *               guessing. Address that specific belief, now, in ninety seconds.
 *   split       two options are close. They are confusing two neighbouring ideas.
 *               Contrast them.
 *   scattered   answers are spread roughly evenly. This looks like guessing — go
 *               back further than you planned.
 *   solid       most got it. Move on, and consider speeding up.
 *
 * Everything here is a pure function of numbers the server already computed. No
 * request, no model, no latency: it runs during the reveal at zero cost.
 *
 * Thresholds are constants at the top rather than inline magic numbers, because
 * they are the part a real classroom will argue with.
 */

import { isCorrectIndex, tallyOptions, toPercentages } from "./optionTally.js";

/** Below this many responders, percentages are noise dressed as insight. */
export const MIN_RESPONSES = 10;

/** ...or below this share of the room, however many that is. */
export const MIN_RESPONSE_SHARE = 0.4;

/** At or above this share correct, the class has it. */
export const SOLID_PCT = 70;

/** A wrong option must reach this before it is a misconception rather than noise. */
export const DOMINANT_WRONG_PCT = 25;

/** Two options within this many points are "neck and neck". */
export const SPLIT_GAP_PCT = 10;

/** Scattered when nothing exceeds an even split by more than this. */
export const SCATTER_MARGIN_PCT = 15;

/**
 * @typedef {'insufficient'|'systematic'|'solid'|'split'|'scattered'|'inconclusive'|'combinations'} DistributionKind
 */

/**
 * @typedef {Object} Classification
 * @property {DistributionKind} kind
 * @property {number|null} dominantIndex   the wrong option that beat the answer
 * @property {number[]} topTwo             indices of the two most-picked options
 * @property {number} correctPct           share of responders who were right
 * @property {number[]} percentages        per-option, index-aligned
 * @property {number[]} counts             per-option, index-aligned
 * @property {number} responders
 */

/**
 * @param {{
 *   optionDistribution: Record<string, number>|null|undefined,
 *   correctAnswer: unknown,
 *   totalResponses: number,
 *   optionCount: number,
 *   answerType?: string|null,
 *   onlineCount?: number,
 * }} input
 * @returns {Classification}
 */
export function classifyDistribution(input) {
  const {
    optionDistribution,
    correctAnswer,
    totalResponses = 0,
    optionCount = 0,
    answerType = "single",
    onlineCount = 0,
  } = input || {};

  const { counts } = tallyOptions(optionDistribution, optionCount);
  const percentages = toPercentages(counts, totalResponses);

  const correctIdx = [];
  for (let i = 0; i < optionCount; i++) {
    if (isCorrectIndex(correctAnswer, i)) correctIdx.push(i);
  }
  const correctPct = correctIdx.reduce((sum, i) => sum + (percentages[i] || 0), 0);

  const ranked = counts
    .map((c, i) => ({ i, c }))
    .sort((a, b) => b.c - a.c || a.i - b.i);
  const topTwo = ranked.slice(0, 2).map((r) => r.i);

  const base = {
    dominantIndex: null,
    topTwo,
    correctPct,
    percentages,
    counts,
    responders: totalResponses,
  };

  // Rule 0 — not enough data. Checked first because every rule below is a
  // statement about a proportion, and a proportion of six is an anecdote.
  const enoughAbsolute = totalResponses >= MIN_RESPONSES;
  const enoughRelative = onlineCount > 0 && totalResponses >= onlineCount * MIN_RESPONSE_SHARE;
  if (!enoughAbsolute && !enoughRelative) {
    return { ...base, kind: "insufficient" };
  }

  // Multi-select is deliberately not classified. The distribution keys are
  // combinations, so "48% picked C" is not a claim these rules can make honestly.
  // Showing the tally without a label beats inventing a shape.
  if (answerType === "multi" || answerType === "multi-select") {
    return { ...base, kind: "combinations" };
  }

  if (optionCount <= 0 || correctIdx.length === 0) {
    return { ...base, kind: "inconclusive" };
  }

  // Rule 1 — scattered, checked FIRST among the shape rules.
  //
  // It has to come first because "nothing stands out" is a statement about the
  // whole distribution, and every rule below asks whether one particular option
  // stands out. On a four-option question an even 26/25/25/24 split has a wrong
  // option at 25% — enough to trip the misconception rule — while actually
  // meaning the opposite: no shared idea at all, just guessing.
  const evenSplit = optionCount > 0 ? 100 / optionCount : 0;
  const maxPct = Math.max(0, ...percentages);
  if (maxPct < evenSplit + SCATTER_MARGIN_PCT) {
    return { ...base, kind: "scattered" };
  }

  /** The biggest wrong option, whatever its size. */
  let dominantWrong = null;
  for (let i = 0; i < optionCount; i++) {
    if (correctIdx.includes(i)) continue;
    const pct = percentages[i] || 0;
    if (pct >= DOMINANT_WRONG_PCT) {
      if (dominantWrong === null || pct > (percentages[dominantWrong] || 0)) dominantWrong = i;
    }
  }

  // Rule 2 — systematic, strong form: a wrong option actually beat the answer.
  // The clearest possible evidence of a shared misconception.
  if (dominantWrong !== null && (percentages[dominantWrong] || 0) > correctPct) {
    return { ...base, kind: "systematic", dominantIndex: dominantWrong };
  }

  if (correctPct >= SOLID_PCT) {
    return { ...base, kind: "solid" };
  }

  // Rule 4 — split. Two options close together, one of them the answer: they are
  // discriminating between two neighbouring ideas and getting it wrong half the
  // time. Distinct from a misconception, and it wants a different response —
  // contrast the two rather than correct one.
  if (topTwo.length === 2) {
    const [a, b] = topTwo;
    const pa = percentages[a] || 0;
    const pb = percentages[b] || 0;
    const involvesCorrect = correctIdx.includes(a) || correctIdx.includes(b);
    if (
      involvesCorrect &&
      pa >= DOMINANT_WRONG_PCT &&
      pb >= DOMINANT_WRONG_PCT &&
      Math.abs(pa - pb) <= SPLIT_GAP_PCT
    ) {
      return { ...base, kind: "split", dominantIndex: correctIdx.includes(a) ? b : a };
    }
  }

  // Rule 5 — systematic, soft form. A quarter of the class on one wrong option is
  // a shared belief worth naming even when the answer still won: 60/40 is not a
  // class that has understood, and calling it "inconclusive" throws away the most
  // actionable fact on the screen. Same teaching response as the strong form —
  // ask someone to explain that option — so it carries the same label.
  if (dominantWrong !== null) {
    return { ...base, kind: "systematic", dominantIndex: dominantWrong };
  }

  return { ...base, kind: "inconclusive" };
}

/**
 * The most-chosen wrong VALUE for numeric and text questions.
 *
 * A shared wrong number is one of the strongest signals in the product — a sign
 * error or an off-by-one shows up as thirty students giving the same wrong
 * answer — and it is invisible to the option-index path above.
 *
 * @param {Record<string, number>|null|undefined} dist
 * @param {unknown} correctAnswer
 * @param {number} limit
 * @returns {{ value: string, count: number }[]}
 */
export function topWrongValues(dist, correctAnswer, limit = 3) {
  if (!dist || typeof dist !== "object") return [];
  const correct = String(correctAnswer ?? "").trim().toLowerCase();

  return Object.entries(dist)
    .map(([key, n]) => {
      let value = key;
      try {
        const parsed = JSON.parse(key);
        if (parsed !== null && typeof parsed !== "object") value = String(parsed);
      } catch {
        /* not JSON — the raw key is the value */
      }
      return { value, count: Number(n) || 0 };
    })
    .filter((e) => e.count > 0 && e.value.trim().toLowerCase() !== correct)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}
