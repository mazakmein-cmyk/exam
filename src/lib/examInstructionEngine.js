/**
 * examInstructionEngine.js — writes the "Exam Instruction" text from the exam
 * itself: sections, question counts, the timing model, the marking scheme, the
 * question types, the languages. The creator presses one button instead of
 * transcribing facts the database already holds — and then edits the result.
 *
 * Plain JS with JSDoc, like examNavigation.js, and dependency-free on purpose:
 * the tests import this file into Node and assert on real output, not on the
 * shape of the source.
 *
 * The one rule everything here follows: SAY NOTHING RATHER THAN GUESS. Every
 * fact can be unknown — the create dialog has no questions yet, a fetch can
 * fail, a section can have no clock set — and an instruction that states a
 * wrong number is worse than one that omits it, because candidates plan their
 * time by these lines. Unknown facts drop their sentence; they never become
 * placeholders or defaults.
 *
 * Wording is lifted from copy the app already shows (ExamIntro's start screen,
 * SectionNavigationControl's tooltip, the runner's toasts) so the instruction a
 * creator generates agrees with the screens a candidate then sees:
 *   locked — sections sat in order, each on its own clock, a submitted section
 *            cannot be reopened; a section auto-submits at zero.
 *   free   — one clock for the whole paper, move between sections in any
 *            order; the paper auto-submits at zero.
 *   both   — a warning appears when 5 minutes remain (ExamSimulator, 300s).
 *
 * Marking honesty has one trap worth naming: `marks_wrong` and `marks_skipped`
 * are stored as POSITIVE magnitudes (CHECK >= 0 in the marks-module migration)
 * and the engine negates at award time — so this file writes "deducts 0.5",
 * never "-0.5 marks awarded". And uniformity cannot be inferred from override
 * rows merely existing, because "Apply to All" materialises a row per question
 * even when the values equal the exam default — the caller value-compares and
 * hands us a boolean.
 *
 * Languages: the decisions (what to say when) live once, in the line builders;
 * the words live in COPY, one flat pack per language. Adding a language is
 * adding a pack — and until a pack exists, canGenerateFor() says no and the
 * button hides, because generating English into the Hindi field is the silent
 * wrong-language fill the template control already refuses to do.
 */

/**
 * @typedef {Object} SectionFact
 * @property {string} name
 * @property {number|null} minutes        Positive minutes, or null when unset.
 * @property {number|null} questionCount  Candidate-visible questions (is_excluded=false), or null when unknown.
 */

/**
 * @typedef {Object} MarkingFact
 * @property {number} correct   Marks for a correct answer.
 * @property {number} wrong     Deduction for a wrong answer — positive magnitude.
 * @property {number} skipped   Deduction for an unanswered question — positive magnitude.
 * @property {"partial"|"all_or_nothing"} mcqMode
 * @property {"flat"|"per_option"} mcqWrongPenalty
 * @property {boolean} uniform  False when any section/question override differs in value.
 */

/**
 * @typedef {Object} ExamFacts
 * @property {SectionFact[]} sections
 * @property {boolean|null} allowSectionSwitching  exams.allow_section_switching. null = the
 *   creator has not chosen yet (the create dialog) — a mode the DB will default, but
 *   defaults are settings, not promises: every mode-dependent sentence is dropped.
 * @property {number|null} totalMinutes       Whole-paper clock for free mode; null = unknown.
 * @property {MarkingFact|null} marking       null = no exam-level marking scheme.
 * @property {boolean} [scoredWithoutDefault] Override rows exist but no exam default does.
 * @property {Record<string, number>|null} answerTypes  Counts by answer_type; null = unknown.
 * @property {string[]|null} languageNames    Display names; a line appears only past one.
 */

/**
 * Same rendering as scoringEngine.formatMarks, duplicated so this file stays
 * importable by Node tests without a TS loader. Kept in lockstep by a test.
 * Digits stay Latin in both languages — that is how the app renders numbers
 * everywhere a candidate sees them.
 * @param {number} value
 */
function fmt(value) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * One pack per language. Every entry is either a full sentence (terminator
 * included — "." here, "।" there) or a clause the builders compose with the
 * pack's own `stop`. Keys are identical across packs; a missing key is a bug,
 * not a fallback — there is deliberately no "use English for the gaps" path.
 */
const COPY = {
  en: {
    stop: ".",
    and: "and",
    marks: (/** @type {number} */ v) => `${fmt(v)} ${v === 1 ? "mark" : "marks"}`,

    shapeOneKnown: (name, c) =>
      `This paper has one section, ${name}, with ${c} ${c === 1 ? "question" : "questions"}.`,
    shapeOneUnknown: (name) => `This paper has one section, ${name}.`,
    shapeMany: (n, names) => `This paper has ${n} sections: ${names}.`,
    shapeManyKnown: (n, parts, total) =>
      `This paper has ${n} sections — ${parts} — ${total} ${total === 1 ? "question" : "questions"} in all.`,

    paperClock: (m) => `You have ${m} minutes for the paper.`,
    freeClock: (m) => `You have ${m} minutes for the whole paper.`,
    freeMove:
      "All sections share one clock — move between them in any order and change any answer until you submit.",
    lockedOrder: "Sections are sat in order, and a submitted section cannot be reopened.",
    lockedUnknown: "Each section has its own time limit, sat one at a time.",
    lockedKnown: (parts, total) => `Each section is timed separately: ${parts} (${total} minutes in all).`,
    sectionClock: (name, m) => `${name} — ${m} min`,

    expiryPaper:
      "The paper is submitted automatically when time runs out; a warning appears when 5 minutes remain.",
    expirySection:
      "When a section's time is up it is submitted automatically and you move on to the next one; a warning appears when 5 minutes remain in a section.",

    markingLead: "Marking: ",
    correctClause: (m) => `each correct answer earns +${m}`,
    wrongClause: (m) => `each wrong answer deducts ${m}`,
    noNegative: "there is no negative marking",
    skippedClause: (m) => `leaving a question unanswered deducts ${m}`,
    unansweredZero: "unanswered questions score 0",
    nonUniform:
      "Some sections or questions are marked differently — these are the paper's default marks.",
    overridesOnly: "Marks are set individually per section or question for this paper.",

    mcqAllOrNothing:
      "Multiple-answer questions earn their marks only when every correct option — and no wrong one — is selected.",
    // The scorer's partial mode gives shares ONLY on a clean selection: one
    // wrong pick forfeits every share and leaves just the penalty. Wording
    // that lets "share" and "deduction" coexist would misstate the scheme.
    mcqPartial:
      "Multiple-answer questions earn a share of the marks for each correct option picked, as long as no wrong option is chosen",
    mcqForfeit: "; picking any wrong option forfeits the question's marks",
    mcqFlat: (m) => `; picking any wrong option forfeits the shares and costs one flat deduction of ${m}`,
    mcqPerOption: (m) =>
      `; picking wrong options forfeits the shares and deducts ${m} per wrong option, capped at the question's full marks`,

    typesAllSingle: "Every question is multiple choice with a single correct answer.",
    typesLead: "Question types: ",
    typeLabels: {
      single: "multiple choice, one answer",
      multi: "multiple choice, several answers",
      numeric: "numeric answer",
      text: "typed answer",
    },

    languages: (names) => `The paper is available in ${names} — choose your language before you begin.`,
  },

  hi: {
    stop: "।",
    and: "और",
    // The noun अंक is invariant ("1 अंक", "2 अंक"), but a verb like कटेगा/कटेंगे
    // still inflects for number — with 1 the plural reads as an error. The
    // deduction clauses below use the कटौती construction instead, which is
    // grammatical for 1, for fractions, and for plurals alike.
    marks: (/** @type {number} */ v) => `${fmt(v)} अंक`,

    // The section name sits between em-dashes, not English-style commas —
    // Hindi is verb-final, and a post-verbal comma appositive reads as a
    // machine translation. Same bracket style shapeManyKnown already uses.
    shapeOneKnown: (name, c) =>
      `इस प्रश्नपत्र में एक ही खंड — ${name} — है, जिसमें ${c} प्रश्न ${c === 1 ? "है" : "हैं"}।`,
    shapeOneUnknown: (name) => `इस प्रश्नपत्र में एक ही खंड — ${name} — है।`,
    shapeMany: (n, names) => `इस प्रश्नपत्र में ${n} खंड हैं: ${names}।`,
    shapeManyKnown: (n, parts, total) => `इस प्रश्नपत्र में ${n} खंड हैं — ${parts} — कुल ${total} प्रश्न।`,

    paperClock: (m) => `पूरे प्रश्नपत्र के लिए आपके पास ${m} मिनट हैं।`,
    freeClock: (m) => `पूरे प्रश्नपत्र के लिए आपके पास ${m} मिनट हैं।`,
    // टाइमर, not घड़ी: घड़ी is a physical clock on a wall or wrist, and the
    // Hindi general-instruction template on the same screen already calls this
    // object काउंटडाउन टाइमर — one thing, one name.
    freeMove:
      "सभी खंडों के लिए एक ही टाइमर है — किसी भी क्रम में खंडों के बीच जाएँ और सबमिट करने तक कोई भी उत्तर बदलें।",
    lockedOrder: "खंड क्रम से हल करने होंगे, और सबमिट किया गया खंड दोबारा नहीं खोला जा सकता।",
    lockedUnknown: "प्रत्येक खंड की अपनी समय-सीमा है — एक समय में एक ही खंड।",
    lockedKnown: (parts, total) => `प्रत्येक खंड का समय अलग-अलग है: ${parts} (कुल ${total} मिनट)।`,
    sectionClock: (name, m) => `${name} — ${m} मिनट`,

    expiryPaper:
      "समय समाप्त होते ही प्रश्नपत्र अपने आप सबमिट हो जाएगा; 5 मिनट शेष रहने पर चेतावनी दिखाई देगी।",
    expirySection:
      "किसी खंड का समय समाप्त होते ही वह अपने आप सबमिट हो जाएगा और आप अगले खंड पर जाएँगे; खंड में 5 मिनट शेष रहने पर चेतावनी दिखाई देगी।",

    markingLead: "अंकन: ",
    correctClause: (m) => `प्रत्येक सही उत्तर पर +${m}`,
    wrongClause: (m) => `प्रत्येक गलत उत्तर पर ${m} की कटौती होगी`,
    noNegative: "नकारात्मक अंकन नहीं है",
    skippedClause: (m) => `प्रश्न अनुत्तरित छोड़ने पर ${m} की कटौती होगी`,
    unansweredZero: "अनुत्तरित प्रश्नों पर 0 अंक",
    // यहाँ दिए, not ऊपर दिए: this sentence is appended to the marking line
    // itself, so the defaults it points at are beside it, not up the list.
    nonUniform: "कुछ खंडों या प्रश्नों का अंकन अलग है — यहाँ दिए अंक प्रश्नपत्र के डिफ़ॉल्ट अंक हैं।",
    overridesOnly: "इस प्रश्नपत्र में अंक खंड या प्रश्न के अनुसार अलग-अलग निर्धारित हैं।",

    mcqAllOrNothing:
      "बहु-उत्तर प्रश्नों में अंक तभी मिलेंगे जब सभी सही विकल्प चुने जाएँ और कोई गलत विकल्प न चुना जाए।",
    mcqPartial:
      "बहु-उत्तर प्रश्नों में चुने गए प्रत्येक सही विकल्प के लिए अंकों का हिस्सा तभी मिलेगा जब कोई गलत विकल्प न चुना गया हो",
    mcqForfeit: "; कोई गलत विकल्प चुनने पर प्रश्न के अंक नहीं मिलेंगे",
    mcqFlat: (m) => `; गलत विकल्प चुनने पर हिस्सा नहीं मिलेगा और एक बार ${m} की कटौती होगी`,
    mcqPerOption: (m) =>
      `; गलत विकल्प चुनने पर हिस्सा नहीं मिलेगा और चुने गए प्रत्येक गलत विकल्प पर ${m} की कटौती होगी (कुल कटौती प्रश्न के पूर्ण अंकों तक सीमित)`,

    typesAllSingle: "सभी प्रश्न बहुविकल्पीय हैं, जिनमें एक ही उत्तर सही है।",
    typesLead: "प्रश्नों के प्रकार: ",
    typeLabels: {
      single: "बहुविकल्पीय, एक उत्तर",
      multi: "बहुविकल्पीय, कई उत्तर",
      numeric: "संख्यात्मक उत्तर",
      text: "लिखित उत्तर",
    },

    languages: (names) => `यह प्रश्नपत्र ${names} में उपलब्ध है — शुरू करने से पहले अपनी भाषा चुनें।`,
  },
};

/**
 * The languages this engine can write — exactly the COPY packs that exist.
 * Callers hide the button off this list.
 * @param {string} lang
 */
export function canGenerateFor(lang) {
  return Object.prototype.hasOwnProperty.call(COPY, lang);
}

/**
 * Localised list: "A", "A and B", "A, B and C" / "A, B और C".
 * @param {string[]} items
 * @param {string} and
 */
function joinNames(items, and) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/**
 * How raw answer_type values fold into candidate-facing buckets — exactly the
 * way the MOCK-EXAM runner folds them (scoringEngine treats multi/multiple as
 * multi-answer; ExamSimulator renders short_answer/essay as typed answers).
 * "multi-select" and "integer" are live-session aliases this runner scores as
 * single-choice, so folding them here would describe a paper the candidate
 * does not sit; they drop with the rest of the unrecognised types.
 */
const TYPE_BUCKETS = [
  { key: "single", aliases: ["single"] },
  { key: "multi", aliases: ["multi", "multiple"] },
  { key: "numeric", aliases: ["numeric"] },
  { key: "text", aliases: ["text", "short_answer", "essay"] },
];

/**
 * @param {Record<string, number>} raw
 * @returns {{key: string, count: number}[]}
 */
function bucketTypes(raw) {
  return TYPE_BUCKETS.map((bucket) => ({
    key: bucket.key,
    count: bucket.aliases.reduce((sum, alias) => sum + (raw[alias] || 0), 0),
  })).filter((b) => b.count > 0);
}

/**
 * The paper-shape line: sections, their question counts, the total.
 * @param {SectionFact[]} sections
 * @param {typeof COPY.en} t
 */
function shapeLine(sections, t) {
  const countsKnown = sections.every((s) => typeof s.questionCount === "number");
  if (sections.length === 1) {
    const only = sections[0];
    return countsKnown ? t.shapeOneKnown(only.name, only.questionCount) : t.shapeOneUnknown(only.name);
  }
  if (!countsKnown) {
    return t.shapeMany(sections.length, joinNames(sections.map((s) => s.name), t.and));
  }
  const total = sections.reduce((sum, s) => sum + (s.questionCount || 0), 0);
  const parts = sections.map((s) => `${s.name} (${s.questionCount})`).join(", ");
  return t.shapeManyKnown(sections.length, parts, total);
}

/**
 * The timing line. Locked mode sums its own clocks; free mode is handed the
 * effective whole-paper clock (exams.total_time_minutes, or the section sum
 * the runner falls back to).
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 * @returns {string|null}
 */
function timingLine(facts, t) {
  const { sections, allowSectionSwitching, totalMinutes } = facts;

  // Per-section numbers only when every clock is actually set: listing three
  // sections' times and silently omitting the fourth reads as "the fourth is
  // untimed", which is a claim, not an omission.
  const clocksKnown = sections.every(
    (s) => typeof s.minutes === "number" && Number.isFinite(s.minutes) && s.minutes > 0
  );

  // Mode not chosen yet (create time). One section is mode-proof — the paper
  // is its clock either way — but a multi-section paper's every timing
  // sentence (order, reopening, one clock vs many) depends on the choice, and
  // the DB default is a setting, not a promise. Say nothing.
  if (allowSectionSwitching === null) {
    if (sections.length === 1 && clocksKnown) return t.paperClock(sections[0].minutes);
    return null;
  }

  if (allowSectionSwitching) {
    const clock =
      typeof totalMinutes === "number" && Number.isFinite(totalMinutes) && totalMinutes > 0
        ? totalMinutes
        : null;
    if (sections.length === 1) {
      return clock === null ? null : t.paperClock(clock);
    }
    return clock === null ? t.freeMove : `${t.freeClock(clock)} ${t.freeMove}`;
  }

  // Locked.
  if (sections.length === 1) {
    return clocksKnown ? t.paperClock(sections[0].minutes) : null;
  }
  if (!clocksKnown) {
    return `${t.lockedUnknown} ${t.lockedOrder}`;
  }
  const total = sections.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const parts = sections.map((s) => t.sectionClock(s.name, s.minutes)).join("; ");
  return `${t.lockedKnown(parts, total)} ${t.lockedOrder}`;
}

/**
 * What happens at zero. True of every exam this app runs, so it is always
 * written — this is the one line candidates most need and creators most
 * forget. The 5-minute figure is ExamSimulator's warning threshold.
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 */
function expiryLine(facts, t) {
  if (facts.sections.length === 1) return t.expiryPaper;
  // Multi-section wording is mode-dependent (whole paper vs section-by-
  // section), so an unchosen mode gets no expiry sentence either.
  if (facts.allowSectionSwitching === null) return null;
  return facts.allowSectionSwitching ? t.expiryPaper : t.expirySection;
}

/**
 * The marking line, from the exam-level default.
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 * @returns {string|null}
 */
function markingLine(facts, t) {
  const m = facts.marking;
  if (m === null) {
    // No exam default. Stray section/question overrides can still score — the
    // one honest sentence is that marks are per-question, with no numbers.
    return facts.scoredWithoutDefault ? t.overridesOnly : null;
  }
  const clauses = [t.correctClause(t.marks(m.correct))];
  clauses.push(m.wrong > 0 ? t.wrongClause(t.marks(m.wrong)) : t.noNegative);
  clauses.push(m.skipped > 0 ? t.skippedClause(t.marks(m.skipped)) : t.unansweredZero);
  let line = `${t.markingLead}${clauses.join("; ")}${t.stop}`;
  if (!m.uniform) line += ` ${t.nonUniform}`;
  return line;
}

/**
 * How multiple-answer questions score. Only written when the paper actually
 * contains some and a marking scheme exists to describe.
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 * @returns {string|null}
 */
function mcqLine(facts, t) {
  const m = facts.marking;
  if (m === null || facts.answerTypes === null) return null;
  const multiCount = bucketTypes(facts.answerTypes).find((b) => b.key === "multi")?.count || 0;
  if (multiCount === 0) return null;

  if (m.mcqMode === "all_or_nothing") return t.mcqAllOrNothing;

  // Partial credit — but the scorer's shares survive only a clean selection.
  // With no penalty configured, a wrong pick still forfeits the shares; that
  // is a rule worth a clause of its own, not a silence.
  let line = t.mcqPartial;
  if (m.wrong > 0) {
    line += m.mcqWrongPenalty === "per_option" ? t.mcqPerOption(t.marks(m.wrong)) : t.mcqFlat(t.marks(m.wrong));
  } else {
    line += t.mcqForfeit;
  }
  return `${line}${t.stop}`;
}

/**
 * The question-type line.
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 * @returns {string|null}
 */
function typesLine(facts, t) {
  if (facts.answerTypes === null) return null;
  const buckets = bucketTypes(facts.answerTypes);
  if (buckets.length === 0) return null;
  if (buckets.length === 1 && buckets[0].key === "single") return t.typesAllSingle;
  return `${t.typesLead}${buckets.map((b) => `${t.typeLabels[b.key]} (${b.count})`).join("; ")}${t.stop}`;
}

/**
 * @param {ExamFacts} facts
 * @param {typeof COPY.en} t
 * @returns {string|null}
 */
function languagesLine(facts, t) {
  const names = facts.languageNames;
  if (!Array.isArray(names) || names.length <= 1) return null;
  return t.languages(joinNames(names, t.and));
}

/**
 * The engine. Returns numbered candidate-facing lines, or null when there is
 * nothing true to say — no sections yet, or a language with no COPY pack.
 * Callers treat null the way the template control treats a missing
 * translation: no fill, and ideally no button.
 *
 * Line numbers stay Latin ("1.") in every language — that is how the papers
 * this app hosts, and the general-instruction template above this field,
 * already number themselves.
 *
 * @param {ExamFacts} facts
 * @param {string} [lang]
 * @returns {string|null}
 */
export function generateExamInstruction(facts, lang = "en") {
  if (!canGenerateFor(lang)) return null;
  if (!facts || !Array.isArray(facts.sections) || facts.sections.length === 0) return null;
  const t = COPY[lang];

  const lines = [
    shapeLine(facts.sections, t),
    timingLine(facts, t),
    expiryLine(facts, t),
    markingLine(facts, t),
    mcqLine(facts, t),
    typesLine(facts, t),
    languagesLine(facts, t),
  ].filter((line) => line !== null);

  return lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

/**
 * A regex matching whatever `build` produces, with its interpolated values
 * wild. Built from the copy pack itself rather than hand-written, so a reworded
 * sentence can never leave a matcher quietly checking for text that no longer
 * exists.
 * @param {(...args: string[]) => string} build
 * @param {number} arity
 */
function shapeMatcher(build, arity) {
  const SENTINEL = "\u0001";
  const literal = build(...Array.from({ length: arity }, () => SENTINEL));
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.split(SENTINEL).join("[\\s\\S]+?") + "$");
}

/** Every shape timingLine can emit, for one copy pack. */
function timingShapes(t) {
  return [
    shapeMatcher((m) => t.paperClock(m), 1),
    shapeMatcher((m) => `${t.freeClock(m)} ${t.freeMove}`, 1),
    shapeMatcher(() => t.freeMove, 0),
    shapeMatcher((parts, total) => `${t.lockedKnown(parts, total)} ${t.lockedOrder}`, 2),
    shapeMatcher(() => `${t.lockedUnknown} ${t.lockedOrder}`, 0),
  ];
}

/**
 * Bring a stored instruction's timing sentence back in line with the paper.
 *
 * Why this exists
 * ---------------
 * Generation is a snapshot. "You have 155 minutes for the whole paper. All
 * sections share one clock." is true when written and false the moment section
 * switching is turned off — but the sentence is now sitting in a column,
 * telling a candidate a number they will not get, directly above the panel that
 * states the real one. Warning the creator helps the next paper; it does not
 * help the candidate reading this one today.
 *
 * Why it is safe to rewrite someone's prose
 * -----------------------------------------
 * It only ever rewrites a line it can prove this engine wrote: the line has to
 * match one of the shapes timingLine emits, in the same language, with only the
 * numbers and section names wild. A creator's own sentence about timing matches
 * nothing here and is left exactly as typed — they are then told about it in the
 * editor instead, which is the only place it can actually be fixed.
 *
 * The line is replaced, never deleted, and keeps its "2. " numbering, so the
 * list a candidate reads is the same length and shape it always was.
 *
 * @param {string} text   The stored instruction copy.
 * @param {ExamFacts} facts  The paper as it is NOW.
 * @param {string} lang
 * @returns {{ text: string, changed: boolean }}
 */
export function reconcileTimingLine(text, facts, lang = "en") {
  const unchanged = { text, changed: false };
  if (typeof text !== "string" || !text.trim()) return unchanged;
  if (!canGenerateFor(lang)) return unchanged;
  if (!facts || !Array.isArray(facts.sections) || facts.sections.length === 0) return unchanged;

  const t = COPY[lang];
  const current = timingLine(facts, t);
  // Nothing to say about this paper's timing — leave what is there rather than
  // silently deleting a sentence we cannot replace.
  if (current === null) return unchanged;

  const shapes = timingShapes(t);
  let changed = false;

  const out = text.split("\n").map((line) => {
    // Keep the numbering prefix: this is one line of a numbered list.
    const parts = line.match(/^(\s*\d+[.)]\s*)?([\s\S]*)$/);
    const prefix = parts[1] || "";
    const body = parts[2].trim();
    if (!body || body === current) return line;
    if (!shapes.some((shape) => shape.test(body))) return line;
    changed = true;
    return `${prefix}${current}`;
  });

  return changed ? { text: out.join("\n"), changed: true } : unchanged;
}
