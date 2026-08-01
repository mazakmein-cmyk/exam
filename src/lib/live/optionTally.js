/**
 * optionTally.js — normalising how many students picked each option.
 *
 * The key-shape problem
 * --------------------
 * Both `live_question_analytics.option_distribution` and the live tally's
 * `option_tally` are built in SQL with `selected_answer::text` as the key, and
 * `selected_answer` is JSONB. So the key's exact text depends on what the client
 * submitted, and three shapes occur in real data:
 *
 *     0            jsonb number   — a client that sent an integer index
 *     "0"          jsonb string   — a client that sent a string index, which is
 *                                   how imports store them (quotes included in
 *                                   the key text)
 *     ["0", "2"]   jsonb array    — multi-select
 *
 * The existing render code defended against the first two inline
 * (`dist[String(i)] ?? dist['"' + i + '"']`), which worked for the reveal panel
 * and would have quietly under-counted anywhere else. One normaliser now serves
 * the live river, the reveal breakdown and the misconception classifier, so they
 * cannot disagree about what the class picked.
 *
 * JSON.parse handles all three, because every one of them is valid JSON — which
 * is the whole reason `::text` on a JSONB column is a workable key.
 *
 * Multi-select counts per OPTION, not per combination: a student who chose A and
 * C adds one to each. That means the totals can exceed the number of responders,
 * which is why callers label them "selections" rather than "students".
 */

/**
 * @typedef {Object} OptionCounts
 * @property {number[]} counts        per-option totals, index-aligned
 * @property {number} totalSelections sum of counts (>= responders for multi)
 * @property {number} unparsed        keys that matched no option index
 */

/**
 * Turn one distribution key into the option indices it represents.
 *
 * @param {string} key
 * @returns {number[]} zero or more option indices
 */
export function keyToOptionIndices(key) {
  if (key === null || key === undefined) return [];

  // Try JSON first: covers "0", "\"0\"", "[\"0\",\"2\"]" and 0.
  let parsed = key;
  try {
    parsed = JSON.parse(key);
  } catch {
    // Not JSON — a bare key like `0` arrives already usable.
  }

  const toIndex = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  if (Array.isArray(parsed)) {
    return parsed.map(toIndex).filter((n) => n !== null);
  }
  const single = toIndex(parsed);
  return single === null ? [] : [single];
}

/**
 * Per-option counts from a raw distribution map.
 *
 * @param {Record<string, number|string>|null|undefined} dist
 * @param {number} optionCount how many options the question has
 * @returns {OptionCounts}
 */
export function tallyOptions(dist, optionCount) {
  const counts = new Array(Math.max(0, optionCount)).fill(0);
  let totalSelections = 0;
  let unparsed = 0;

  if (!dist || typeof dist !== "object") {
    return { counts, totalSelections, unparsed };
  }

  for (const [key, rawValue] of Object.entries(dist)) {
    const n = Number(rawValue) || 0;
    if (n <= 0) continue;

    const indices = keyToOptionIndices(key);
    const inRange = indices.filter((i) => i < counts.length);

    if (inRange.length === 0) {
      // A free-text or numeric answer, or an index beyond the option list.
      // Counted separately rather than dropped, so a caller can tell "nobody
      // picked B" from "we could not read the data".
      unparsed += n;
      continue;
    }

    inRange.forEach((i) => {
      counts[i] += n;
    });
    totalSelections += n * inRange.length;
  }

  return { counts, totalSelections, unparsed };
}

/**
 * Is this option index part of the stored correct answer?
 *
 * Mirrors the shapes `correct_answer` is stored in: a scalar index, a string
 * index, or an array for multi-select.
 *
 * @param {unknown} correctAnswer
 * @param {number} index
 * @returns {boolean}
 */
export function isCorrectIndex(correctAnswer, index) {
  if (correctAnswer === null || correctAnswer === undefined) return false;
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((c) => String(c) === String(index));
  }
  return String(correctAnswer) === String(index);
}

/**
 * Percentages of the responder count, rounded, index-aligned.
 *
 * Deliberately divided by RESPONDERS rather than by total selections: "48% of the
 * class picked C" is the sentence a creator says out loud, and on a multi-select
 * question the percentages then legitimately sum past 100.
 *
 * @param {number[]} counts
 * @param {number} responders
 * @returns {number[]}
 */
export function toPercentages(counts, responders) {
  if (!responders || responders <= 0) return counts.map(() => 0);
  return counts.map((c) => Math.round((c / responders) * 100));
}

/** A→Z label for an option index. */
export function optionLabel(index) {
  const n = Number(index);
  return Number.isFinite(n) && n >= 0 && n < 26 ? String.fromCharCode(65 + n) : String(index);
}
