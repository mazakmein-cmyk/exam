/**
 * instructionFreshness.js — "the paper moved and nobody looked at the
 * instructions", plus the one sentence that says so.
 *
 * What the audits cannot see
 * -------------------------
 * instructionTimingAudit contradicts timing prose; auditInstructionShape
 * contradicts the paper-shape line. Both work by reading a sentence the engine
 * provably wrote. Everything else the instructions promise has no such sentence
 * to catch it: a renamed section, a rewritten marking scheme, a language added,
 * an answer type that no longer appears. Those changes leave the text silently
 * wrong, and a creator who only ever hears about timing learns that the banner
 * means "timing".
 *
 * So this records the other half — whether the creator has looked at the
 * instructions since they last changed the exam. It is set when a save changes
 * the exam and leaves both instruction fields untouched, and cleared the moment
 * either is written, by hand or by Generate from exam. It says "worth a check",
 * never "wrong": unlike the audits it has read nothing, so it cannot claim a
 * contradiction, and the copy must not pretend otherwise.
 *
 * Why localStorage rather than a column
 * -------------------------------------
 * Columns in this project arrive by hand-pasted migration, and a reminder that
 * only appears after someone runs SQL is a reminder that does not appear. This
 * is advisory state about the creator's own reviewing, not exam data: losing it
 * on another machine costs a nudge, not correctness, and both content audits
 * still stand there. It is also dismissible, because a nag with no off switch
 * is how the next real warning gets ignored.
 *
 * Plain .js with no imports, like its pure siblings, so the tests can assert on
 * real sentences in bare Node instead of grepping a .tsx for a call that might
 * never run.
 */

const key = (examId) => `mocksetu.instruction-review.${examId}`;

/**
 * Every read and write is wrapped: Safari in private mode throws on setItem,
 * and a reminder about instructions is not worth taking the editor down with.
 * An absent `localStorage` (the test runner, SSR) reads as "reviewed", which is
 * the quiet answer.
 * @returns {"unreviewed"|"dismissed"|null} null = reviewed.
 */
function read(examId) {
  if (!examId || typeof localStorage === "undefined") return null;
  try {
    const value = localStorage.getItem(key(examId));
    return value === "unreviewed" || value === "dismissed" ? value : null;
  } catch {
    return null;
  }
}

function write(examId, value) {
  if (!examId || typeof localStorage === "undefined") return;
  try {
    if (value === null) localStorage.removeItem(key(examId));
    else localStorage.setItem(key(examId), value);
  } catch {
    /* Storage refused. The content audits are unaffected. */
  }
}

/**
 * The exam changed and the instructions did not.
 *
 * Deliberately does NOT overwrite a previous dismissal: the creator has already
 * answered this question once, and asking again on their next save is exactly
 * the nagging this is meant to avoid.
 */
export function markInstructionsUnreviewed(examId) {
  if (read(examId) === null) write(examId, "unreviewed");
}

/** The instructions were written — by hand or generated. Clears a dismissal too. */
export function markInstructionsReviewed(examId) {
  write(examId, null);
}

/** "I know, leave me alone." Holds until the instructions are next written. */
export function dismissInstructionReview(examId) {
  write(examId, "dismissed");
}

/** @returns {boolean} */
export function instructionsNeedReview(examId) {
  return read(examId) === "unreviewed";
}

/**
 * Is there actually an instruction here, or just something in the box?
 *
 * A blank check is not enough. Fields arrive holding "." or "-" — a character
 * typed to get past a required-field validation, or left behind by an import —
 * and that reads as "written" to every emptiness test while telling a candidate
 * exactly nothing. The audits then stay silent for the best of reasons: there
 * is no sentence in "." to contradict. So the emptiness question is asked about
 * CONTENT: strip whitespace, bullets and punctuation, and see if any word
 * survives.
 */
export function hasMeaningfulText(text) {
  if (typeof text !== "string") return false;
  return text.replace(/[\s.,;:!?·•*_\-–—()[\]{}'"“”]/g, "").length > 0;
}

/**
 * One notice from every signal, in descending order of how much we can prove.
 *
 * A contradiction outranks a suspicion: if the text says 30 min and students
 * get 90, that is the sentence to lead with, and "you saved without touching
 * the instructions" adds nothing the creator does not now know. Only the
 * unproven nudge may be waved away — a contradiction stands until it is fixed.
 *
 * @param {{
 *   timingDrift: {drift: string, autoCorrected: boolean}|null,
 *   shapeDrift: {stated: string, expected: string}|null,
 *   blank: {examInstruction: boolean, generalInstruction: boolean}|null,
 *   needsReview: boolean,
 *   hasText: boolean,
 * }} input
 * @returns {{headline: string, body: string, proven: boolean, dismissible: boolean}|null}
 */
export function describeInstructionNotice(input) {
  const timingDrift = input?.timingDrift ?? null;
  const shapeDrift = input?.shapeDrift ?? null;

  if (timingDrift) {
    // Both audits fired: the timing sentence is the specific one, but say the
    // counts are wrong too rather than letting a second banner appear the
    // moment the first is fixed.
    const alsoCounts = shapeDrift
      ? " The section and question counts in this text no longer match the paper either."
      : "";
    return {
      headline: "Out of date.",
      body:
        `${timingDrift.drift}${alsoCounts} ` +
        (timingDrift.autoCorrected
          ? "Candidates are shown the corrected sentence, but the counts and marking in this text may be stale too — Regenerate to refresh all of it."
          : "This wording is yours, so it is shown to candidates exactly as written. Edit it, or Regenerate."),
      proven: true,
      dismissible: false,
    };
  }

  if (shapeDrift) {
    return {
      headline: "Out of date.",
      body:
        `The sections and question counts in this text no longer match the paper — it says “${shapeDrift.stated}” ` +
        `but the paper is now “${shapeDrift.expected}”. Regenerate to refresh it.`,
      proven: true,
      dismissible: false,
    };
  }

  // Nothing was contradicted because there is nothing to contradict. Ranked
  // above the review nudge because it is a fact we checked, not an inference
  // about the creator's editing — and it is the state a paper with sections and
  // questions is least likely to want to ship in.
  const blankExam = input?.blank?.examInstruction === true;
  const blankGeneral = input?.blank?.generalInstruction === true;
  if (blankExam || blankGeneral) {
    const both = blankExam && blankGeneral;
    return {
      headline: "Nothing written yet.",
      body: both
        ? "This exam has sections and questions, but neither instruction has been written — candidates start with nothing in your words. Regenerate writes the Exam Instruction from the paper; Use template fills in the General Instruction."
        : blankExam
          ? "This exam has sections and questions, but no Exam Instruction has been written — candidates see the computed paper details and nothing else. Regenerate writes one from the paper: sections, timing, marking."
          : "This exam has no General Instruction — candidates are given no rules for the sitting. Use template fills one in.",
      proven: false,
      dismissible: true,
    };
  }

  if (input?.needsReview) {
    return {
      headline: "Worth a check.",
      body: input?.hasText
        ? "You saved changes to this exam without touching the instructions. Nothing here contradicts the paper, but the marking, section names and question types this text describes have not been checked — read it over, or Regenerate."
        : "You saved changes to this exam without writing any Exam Instruction. Candidates still see the computed paper details, but nothing states the marking or the question types in your own words.",
      proven: false,
      dismissible: true,
    };
  }

  return null;
}
