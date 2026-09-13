/**
 * answerKey.js — which options does a stored `correct_answer` actually mark?
 *
 * The column holds whatever the path that wrote it happened to use, and all of
 * these are live in the database today:
 *
 *   2            an option INDEX, as a number
 *   "2"          the same index, as a string
 *   "C"          an option LETTER
 *   "7/12"       the option's TEXT, from a JSON import written before options
 *                could carry markup
 *   [0, 2]       several of the above, for a multiple-correct question
 *
 * Resolution order matters and is not arbitrary: index, then letter, then text.
 * Text is LAST because an option whose text happens to be "2" would otherwise
 * capture a key that meant "the third option" — the exact collision ExamReview
 * documents in its matchesInSet.
 *
 * Scope: this is the CREATOR-side read — "show me what is marked correct".
 * Grading a student's response is a different job with different rules
 * (partial credit, NFC and numeric canon for typed answers) and lives in
 * ExamReview and lib/answerNormalize.js. Keep them apart: a change here is
 * about display, never about scoring.
 *
 * Plain JS, importing only plain JS, so the .mjs tests exercise the real
 * implementation rather than a copy of it.
 */
import { decodeEntities, unwrapBakedMath } from "./questionPreview.js";

/**
 * An option reduced to something two spellings of it can be compared by.
 *
 * The sibling of richText.ts's `optionMatchKey`, which does the same job with a
 * DOM where one is available. Same idea, same inputs, same answer for the
 * shapes that reach this path: markup off, entities decoded, rendered math back
 * to its LaTeX so a bolded "<b>12</b>" still matches a stored "12".
 */
function plainKey(value) {
  if (value === null || value === undefined) return "";
  return decodeEntities(
    unwrapBakedMath(String(value))
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s ]+/g, " ")
    .trim()
    .toLowerCase();
}

/** True for a value that can be read as an option index. */
function isIndexValue(value) {
  if (value === null || value === undefined || value === "") return false;
  const s = String(value).trim();
  return s !== "" && !Number.isNaN(Number(s));
}

/** One stored answer value → its option index, or null when nothing matches. */
function resolveOne(value, options) {
  if (value === null || value === undefined || value === "") return null;

  if (isIndexValue(value)) {
    const i = Number(value);
    if (Number.isInteger(i) && i >= 0 && i < options.length) return i;
  }

  const upper = String(value).trim().toUpperCase();
  if (upper.length === 1 && upper >= "A" && upper <= "Z") {
    const i = upper.charCodeAt(0) - 65;
    if (i < options.length) return i;
  }

  const key = plainKey(value);
  if (key !== "") {
    const i = options.findIndex((o) => plainKey(o) === key);
    if (i >= 0) return i;
  }

  return null;
}

/**
 * Every option index the key marks correct.
 *
 * A Set, so a caller can ask per option without re-resolving and so a
 * duplicated key ([0, "A"] — the same option twice) counts once.
 */
export function resolveAnswerIndexes(correctAnswer, options) {
  const opts = Array.isArray(options) ? options : [];
  const values = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
  const out = new Set();
  for (const value of values) {
    const i = resolveOne(value, opts);
    if (i !== null) out.add(i);
  }
  return out;
}

/**
 * True when a key is set at all — including one that resolves to no option.
 *
 * Deliberately NOT `resolveAnswerIndexes(...).size > 0`: a numeric question's
 * key is a typed value with no options to point at, and a choice question whose
 * key no longer matches any option is WRONG, not ABSENT. Reporting either as
 * "no answer marked" would send the creator looking for the wrong problem.
 */
export function hasAnswerKey(correctAnswer) {
  if (correctAnswer === null || correctAnswer === undefined) return false;
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((v) => v !== null && v !== undefined && String(v).trim() !== "");
  }
  return String(correctAnswer).trim() !== "";
}

/**
 * The key as a creator reads it: option letters for a choice question, the
 * typed value for a numeric or short answer, "—" when nothing is set.
 */
export function describeAnswerKey(correctAnswer, options) {
  if (!hasAnswerKey(correctAnswer)) return "—";
  const opts = Array.isArray(options) ? options : [];
  const values = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
  const parts = values
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => {
      const i = resolveOne(v, opts);
      // An unresolved value is shown AS STORED rather than hidden: that is the
      // creator's only clue that the key points at an option which no longer
      // exists.
      return i === null ? String(v) : String.fromCharCode(65 + i);
    });
  return parts.length > 0 ? parts.join(", ") : "—";
}
