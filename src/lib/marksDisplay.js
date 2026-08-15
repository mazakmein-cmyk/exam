/**
 * marksDisplay.js — what the marks panel is allowed to SAY about a scoring rule.
 *
 * Plain JS (no imports) on purpose, same as src/lib/examNavigation.js: every
 * rule here is exercised directly by node in
 * src/__tests__/marks-config-panel.test.mjs, with no bundler and no DOM.
 *
 * None of this scores anything. All scoring lives in services/scoringEngine.ts
 * and stays there. This module only answers presentation questions the panel
 * used to answer wrongly:
 *
 *   "Is this question actually customised?"
 *     The old panel asked `questionConfigs.has(id)` — the mere EXISTENCE of a
 *     row. But "Apply to all" writes a row for every question in the paper, so
 *     one click stamped a purple "custom" badge onto all 85 of them while every
 *     one of them held the exact same numbers. Customised means the numbers
 *     READ differently from what the question would have inherited, and that is
 *     a value comparison, not a lookup.
 *
 *   "Where did this question's marks come from?"
 *     Four honest answers, not two. A question with no row of its own follows
 *     its section or the exam. A question WITH a row that happens to match is
 *     pinned to those numbers — it will not move when the exam default moves
 *     later, so calling it "from exam" would be a lie the creator only
 *     discovers weeks afterwards.
 *
 *   "What will this paper be worth once I hit save?"
 *     The header total is read off saved configs, so a draft of +4 sitting on
 *     screen still showed the old total. Projecting the draft over the same
 *     inheritance chain is the difference between a number you trust and a
 *     number you re-check by hand.
 */

/**
 * @typedef {{
 *   marks_correct: number,
 *   marks_wrong: number,
 *   marks_skipped: number,
 *   mcq_mode: "partial"|"all_or_nothing",
 *   mcq_wrong_penalty: "flat"|"per_option",
 *   rounding_strategy: "floor"|"round"|"ceil"|"none"
 * }} ScoringConfigLike
 */

/** Every field that makes two rules the same rule. `show_marks_in_simulator` is not one of them. */
export const SCORING_KEYS = [
  "marks_correct",
  "marks_wrong",
  "marks_skipped",
  "mcq_mode",
  "mcq_wrong_penalty",
  "rounding_strategy",
];

/**
 * Round to two decimals — the same precision applyRounding() works at, so a
 * projected total never drifts from the total the engine will produce.
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Drop `show_marks_in_simulator` so an exam draft can be handed to a section-
 * or question-shaped write without smuggling a display flag into the row.
 * @param {ScoringConfigLike & { show_marks_in_simulator?: boolean }} config
 * @returns {ScoringConfigLike}
 */
export function toScoring(config) {
  return {
    marks_correct: config.marks_correct,
    marks_wrong: config.marks_wrong,
    marks_skipped: config.marks_skipped,
    mcq_mode: config.mcq_mode,
    mcq_wrong_penalty: config.mcq_wrong_penalty,
    rounding_strategy: config.rounding_strategy,
  };
}

/**
 * Do these two rules read the same to a student? Either side missing is "no" —
 * an unconfigured exam is not equal to anything, it is simply unknown.
 * @param {ScoringConfigLike|null|undefined} a
 * @param {ScoringConfigLike|null|undefined} b
 * @returns {boolean}
 */
export function scoringEqual(a, b) {
  if (!a || !b) return false;
  return SCORING_KEYS.every((k) => a[k] === b[k]);
}

/**
 * Are the multi-answer knobs still where they started? Drives the "changed"
 * dot on the collapsed section, so a creator never has to open it to find out.
 * @param {ScoringConfigLike} config
 * @returns {boolean}
 */
export function isDefaultMultiAnswer(config) {
  return (
    config.mcq_mode === "partial" &&
    config.mcq_wrong_penalty === "flat" &&
    config.rounding_strategy === "floor"
  );
}

/** The four schemes that cover almost every real paper. */
export const PRESETS = [
  { correct: 1, wrong: 0, skipped: 0, caption: "No penalty" },
  { correct: 1, wrong: 0.25, skipped: 0, caption: "Light penalty" },
  { correct: 2, wrong: 0.5, skipped: 0, caption: "Light penalty" },
  { correct: 4, wrong: 1, skipped: 0, caption: "JEE / NEET style" },
];

/**
 * Which preset chip should light up, if any. Compares only the three numbers —
 * the multi-answer knobs are orthogonal and a creator who tuned them has not
 * left the preset.
 * @param {ScoringConfigLike} config
 * @returns {number} index into PRESETS, or -1 for a hand-typed scheme
 */
export function matchPresetIndex(config) {
  return PRESETS.findIndex(
    (p) =>
      p.correct === config.marks_correct &&
      p.wrong === config.marks_wrong &&
      p.skipped === config.marks_skipped
  );
}

/**
 * Where a question's marks come from, in the creator's words.
 *
 *   "custom"  — has its own row AND the numbers differ from what it would inherit
 *   "own"     — has its own row that happens to match; pinned, so it will not
 *               follow the exam default when that changes
 *   "section" — no row of its own, follows the section rule
 *   "exam"    — no row of its own, follows the exam default
 *   "none"    — nothing is configured anywhere; this question is unscored
 *
 * @param {string} questionId
 * @param {string} sectionId
 * @param {Map<string, ScoringConfigLike>} questionConfigs
 * @param {Map<string, ScoringConfigLike>} sectionConfigs
 * @param {ScoringConfigLike|null} examConfig
 * @returns {"custom"|"own"|"section"|"exam"|"none"}
 */
export function questionRuleSource(questionId, sectionId, questionConfigs, sectionConfigs, examConfig) {
  const stored = questionConfigs.get(questionId);
  const hasSection = sectionConfigs.has(sectionId);
  const inherited = hasSection ? sectionConfigs.get(sectionId) : examConfig;

  if (stored) return scoringEqual(stored, inherited) ? "own" : "custom";
  if (hasSection) return "section";
  return examConfig ? "exam" : "none";
}

/**
 * Is this question customised in the only sense worth badging — its numbers
 * differ from the rule it would otherwise have inherited?
 * @param {string} questionId
 * @param {string} sectionId
 * @param {Map<string, ScoringConfigLike>} questionConfigs
 * @param {Map<string, ScoringConfigLike>} sectionConfigs
 * @param {ScoringConfigLike|null} examConfig
 * @returns {boolean}
 */
export function isCustomisedQuestion(questionId, sectionId, questionConfigs, sectionConfigs, examConfig) {
  return questionRuleSource(questionId, sectionId, questionConfigs, sectionConfigs, examConfig) === "custom";
}

/**
 * What the paper will be worth once the drafts on screen are saved.
 *
 * Walks the same chain resolveConfig() walks — question row, then section row,
 * then exam — but lets the caller swap in the section draft currently being
 * edited so the header total moves as the numbers are typed.
 *
 * @param {{ id: string, section_id: string }[]} questions
 * @param {Map<string, ScoringConfigLike>} questionConfigs
 * @param {Map<string, ScoringConfigLike>} sectionConfigs
 * @param {number} examDraftCorrect marks_correct from the exam draft on screen
 * @param {{ sectionId: string, config: ScoringConfigLike }|null} [sectionDraft]
 * @returns {number}
 */
export function projectTotalMarks(questions, questionConfigs, sectionConfigs, examDraftCorrect, sectionDraft) {
  let total = 0;
  for (const q of questions) {
    const own = questionConfigs.get(q.id);
    if (own) {
      total += own.marks_correct;
      continue;
    }
    const section =
      sectionDraft && sectionDraft.sectionId === q.section_id
        ? sectionDraft.config
        : sectionConfigs.get(q.section_id);
    total += section ? section.marks_correct : examDraftCorrect;
  }
  return round2(total);
}
