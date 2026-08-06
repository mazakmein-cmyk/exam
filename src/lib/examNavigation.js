/**
 * examNavigation.js — the arithmetic behind section navigation mode.
 *
 * Plain JS (no imports) on purpose, same as src/lib/live/reportInsights.js:
 * every rule here is exercised directly by node in
 * src/__tests__/section-switching.test.mjs, with no bundler and no DOM.
 *
 * Two modes exist:
 *
 *   "locked" (default, and what every existing exam does)
 *     One section at a time. That section's own `time_minutes` is the clock.
 *     Submitting closes it for good.
 *
 *   "free"  (exams.allow_section_switching = true)
 *     One clock for the whole paper. The student sees a tab per section and
 *     may move between them in any order until they submit or time runs out.
 *
 * The single most important rule: an ABSENT `allow_section_switching` key
 * means "locked", never "free". The migration is applied by hand, so the app
 * routinely talks to a database that has not got the column yet — and a
 * PostgREST schema cache can keep serving the old column list for a while
 * after it does. Reading `undefined` as `true` there would silently hand
 * students a paper with no per-section timing at all.
 */

/** @typedef {{ id: string, name?: string, time_minutes?: number|null, language?: string|null, sort_order?: number|null }} SectionLike */
/** @typedef {{ allow_section_switching?: boolean|null, total_time_minutes?: number|null }} ExamLike */

/**
 * Is this exam in free-navigation mode?
 * Strictly `true` only — undefined/null (column missing from the response)
 * and any non-boolean value read as locked.
 * @param {ExamLike|null|undefined} exam
 * @returns {boolean}
 */
export function isFreeNavigation(exam) {
  return exam?.allow_section_switching === true;
}

/**
 * @param {ExamLike|null|undefined} exam
 * @returns {"free"|"locked"}
 */
export function navigationMode(exam) {
  return isFreeNavigation(exam) ? "free" : "locked";
}

/**
 * Sum of the per-section clocks — the natural default for a whole-paper limit,
 * and what the creator is offered the moment they turn switching on.
 * @param {SectionLike[]|null|undefined} sections
 * @returns {number} minutes, never negative
 */
export function sumSectionMinutes(sections) {
  if (!Array.isArray(sections)) return 0;
  return sections.reduce((total, s) => {
    const minutes = Number(s?.time_minutes);
    return total + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
}

/**
 * The clock the student actually gets, in minutes.
 *
 * Locked mode has no whole-paper clock at all (each section is timed on its
 * own), so this is only meaningful in free mode. `total_time_minutes` wins
 * when the creator has set a usable value; otherwise the section sum stands
 * in, so a paper is never handed out with a zero-length clock just because
 * the column has not been filled in yet.
 *
 * @param {ExamLike|null|undefined} exam
 * @param {SectionLike[]|null|undefined} sections
 * @returns {number} minutes
 */
export function totalExamMinutes(exam, sections) {
  const chosen = Number(exam?.total_time_minutes);
  if (Number.isFinite(chosen) && chosen > 0) return Math.floor(chosen);
  return sumSectionMinutes(sections);
}

/**
 * Same value in seconds — what the countdown worker wants.
 * @param {ExamLike|null|undefined} exam
 * @param {SectionLike[]|null|undefined} sections
 * @returns {number} seconds
 */
export function totalExamSeconds(exam, sections) {
  return totalExamMinutes(exam, sections) * 60;
}

/**
 * Flatten every section's questions into one ordered walk of the paper, so
 * Previous/Next can cross a section boundary without the caller doing index
 * arithmetic. Sections keep the order they were given (already sorted by
 * sort_order); questions keep the order inside each section.
 *
 * @param {SectionLike[]} sections
 * @param {Record<string, {id: string}[]>} questionsBySection
 * @returns {{sectionId: string, sectionIndex: number, questionId: string, indexInSection: number}[]}
 */
export function flattenPaper(sections, questionsBySection) {
  const flat = [];
  (Array.isArray(sections) ? sections : []).forEach((section, sectionIndex) => {
    const questions = questionsBySection?.[section.id] || [];
    questions.forEach((question, indexInSection) => {
      flat.push({
        sectionId: section.id,
        sectionIndex,
        questionId: question.id,
        indexInSection,
      });
    });
  });
  return flat;
}

/**
 * Where in the flat walk is (section, index-within-section)?
 * @param {{sectionId: string, indexInSection: number}[]} flat
 * @param {string} sectionId
 * @param {number} indexInSection
 * @returns {number} flat index, or -1
 */
export function flatIndexOf(flat, sectionId, indexInSection) {
  if (!Array.isArray(flat)) return -1;
  return flat.findIndex(
    (entry) => entry.sectionId === sectionId && entry.indexInSection === indexInSection
  );
}

/**
 * One step through the paper, crossing section boundaries.
 * Returns null at either end — the caller renders Submit instead of Next.
 *
 * @param {{sectionId: string, indexInSection: number}[]} flat
 * @param {string} sectionId
 * @param {number} indexInSection
 * @param {"next"|"prev"} direction
 * @returns {{sectionId: string, indexInSection: number}|null}
 */
export function stepThroughPaper(flat, sectionId, indexInSection, direction) {
  const at = flatIndexOf(flat, sectionId, indexInSection);
  if (at < 0) return null;
  const target = direction === "next" ? at + 1 : at - 1;
  if (target < 0 || target >= flat.length) return null;
  const entry = flat[target];
  return { sectionId: entry.sectionId, indexInSection: entry.indexInSection };
}

/**
 * Answered / marked / total for one section — the numbers on its tab, and the
 * ones the submit confirmation counts up. "Answered" here is the same test the
 * simulator's Clear Response button uses, so a cleared answer stops counting.
 *
 * @param {{id: string}[]|null|undefined} questions
 * @param {Record<string, {selectedAnswer?: any, isMarkedForReview?: boolean}>} states
 * @returns {{answered: number, marked: number, unanswered: number, total: number}}
 */
export function sectionProgress(questions, states) {
  const list = Array.isArray(questions) ? questions : [];
  let answered = 0;
  let marked = 0;
  for (const question of list) {
    const state = states?.[question.id];
    if (!state) continue;
    if (hasAnswer(state.selectedAnswer)) answered++;
    if (state.isMarkedForReview) marked++;
  }
  return {
    answered,
    marked,
    unanswered: list.length - answered,
    total: list.length,
  };
}

/**
 * Does this stored value count as an answer? Mirrors ExamSimulator's
 * isAnswerPresent: empty array (nothing ticked) and blank string do not.
 * @param {any} value
 * @returns {boolean}
 */
export function hasAnswer(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * Per-section time in free mode.
 *
 * Locked mode measures a section by wall clock (its slice of the paper IS the
 * section). Free mode has no such slice — the student can dip in and out — so
 * the honest number is the time actually spent on that section's questions,
 * which the simulator already tracks per question.
 *
 * @param {{id: string}[]|null|undefined} questions
 * @param {Record<string, {timeSpentSeconds?: number}>} states
 * @returns {number} seconds
 */
export function sectionTimeSpentSeconds(questions, states) {
  const list = Array.isArray(questions) ? questions : [];
  return list.reduce((total, question) => {
    const spent = Number(states?.[question.id]?.timeSpentSeconds);
    return total + (Number.isFinite(spent) && spent > 0 ? spent : 0);
  }, 0);
}

/**
 * Free mode creates one attempt row per section up front (attempts.section_id
 * is NOT NULL — one row per section is the only shape the schema allows), and
 * ExamReview groups a sitting by walking attempts in `created_at` order.
 *
 * A single multi-row insert stamps every row with the same transaction
 * timestamp, and ties order arbitrarily — which can drop the first section's
 * attempt into the middle of the walk and split one sitting into two. So the
 * timestamps are handed out explicitly, one millisecond apart, in section
 * order.
 *
 * @param {number} startedAtMs
 * @param {number} count
 * @returns {string[]} ISO timestamps, strictly increasing
 */
export function staggeredTimestamps(startedAtMs, count) {
  const stamps = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    stamps.push(new Date(startedAtMs + i).toISOString());
  }
  return stamps;
}
