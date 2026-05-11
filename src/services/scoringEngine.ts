/**
 * scoringEngine.ts — Pure scoring logic for the Marks Module
 *
 * Zero imports. Every function is deterministic (input → output).
 * This makes it trivially unit-testable.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type ScoringConfig = {
  marks_correct: number;
  marks_wrong: number;
  marks_skipped: number;
  mcq_mode: "partial" | "all_or_nothing";
  mcq_wrong_penalty: "flat" | "per_option";
  rounding_strategy: "floor" | "round" | "ceil" | "none";
};

export type QuestionResult = {
  question_id: string;
  marks_awarded: number;
  breakdown: {
    correct_selected: number;
    total_correct: number;
    wrong_selected: number;
    mode: string;
    raw_before_rounding?: number;
  };
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  marks_correct: 1,
  marks_wrong: 0,
  marks_skipped: 0,
  mcq_mode: "partial",
  mcq_wrong_penalty: "flat",
  rounding_strategy: "floor",
};

// ─── Utility ─────────────────────────────────────────────────────────

const normalize = (val: unknown): string =>
  String(val ?? "")
    .trim()
    .toLowerCase();

export function applyRounding(
  value: number,
  strategy: ScoringConfig["rounding_strategy"]
): number {
  switch (strategy) {
    case "floor":
      return Math.floor(value * 100) / 100;
    case "round":
      return Math.round(value * 100) / 100;
    case "ceil":
      return Math.ceil(value * 100) / 100;
    case "none":
    default:
      return Math.round(value * 100) / 100; // cap at 2 dp regardless
  }
}

/**
 * Format a marks value for display — integer if whole, 2dp if decimal.
 */
export function formatMarks(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

// ─── Scorers ─────────────────────────────────────────────────────────

/**
 * Score a Single Correct Question (SCQ) or Numeric / Short Answer.
 */
export function scoreSCQ(
  questionId: string,
  selectedAnswer: unknown,
  correctAnswer: unknown,
  isSkipped: boolean,
  config: ScoringConfig
): QuestionResult {
  const base: QuestionResult = {
    question_id: questionId,
    marks_awarded: 0,
    breakdown: {
      correct_selected: 0,
      total_correct: 1,
      wrong_selected: 0,
      mode: "scq",
    },
  };

  if (isSkipped || selectedAnswer === null || selectedAnswer === undefined) {
    base.marks_awarded = -config.marks_skipped;
    base.breakdown.mode = "skipped";
    return base;
  }

  // Normalize and compare
  let isCorrect = false;
  if (correctAnswer !== null && correctAnswer !== undefined) {
    if (
      typeof correctAnswer === "object" &&
      correctAnswer !== null &&
      !Array.isArray(correctAnswer)
    ) {
      // Handle { answer: "A" } or { value: "A" }
      const val =
        (correctAnswer as Record<string, unknown>).answer ??
        (correctAnswer as Record<string, unknown>).value;
      isCorrect = normalize(val) === normalize(selectedAnswer);
    } else {
      isCorrect = normalize(selectedAnswer) === normalize(correctAnswer);
    }
  }

  if (isCorrect) {
    base.marks_awarded = config.marks_correct;
    base.breakdown.correct_selected = 1;
  } else {
    base.marks_awarded = -config.marks_wrong;
    base.breakdown.wrong_selected = 1;
  }

  return base;
}

/**
 * Score a Multi Correct Question (MCQ).
 */
export function scoreMCQ(
  questionId: string,
  selectedOptions: unknown[],
  correctOptions: unknown[],
  isSkipped: boolean,
  config: ScoringConfig
): QuestionResult {
  // Deduplicate and normalize correct options to determine true max possible
  const uniqueCorrect = Array.from(new Set(correctOptions.map(normalize)));
  const totalCorrect = uniqueCorrect.length;
  
  const base: QuestionResult = {
    question_id: questionId,
    marks_awarded: 0,
    breakdown: {
      correct_selected: 0,
      total_correct: totalCorrect,
      wrong_selected: 0,
      mode: config.mcq_mode,
    },
  };

  if (
    isSkipped ||
    !selectedOptions ||
    !Array.isArray(selectedOptions) ||
    selectedOptions.length === 0
  ) {
    base.marks_awarded = -config.marks_skipped;
    base.breakdown.mode = "skipped";
    return base;
  }

  // Deduplicate selected options to prevent inflation vulnerabilities
  const uniqueSelected = Array.from(new Set(selectedOptions.map(normalize)));

  let correctCount = 0;
  let wrongCount = 0;

  for (const sel of uniqueSelected) {
    if (uniqueCorrect.includes(sel)) {
      correctCount++;
    } else {
      wrongCount++;
    }
  }

  base.breakdown.correct_selected = correctCount;
  base.breakdown.wrong_selected = wrongCount;

  // ── All-or-Nothing Mode ──
  if (config.mcq_mode === "all_or_nothing") {
    if (wrongCount > 0) {
      base.marks_awarded = -config.marks_wrong;
      return base;
    }
    if (correctCount === totalCorrect) {
      base.marks_awarded = config.marks_correct;
      return base;
    }
    // Partial correct, no wrong → 0
    base.marks_awarded = 0;
    return base;
  }

  // ── Partial Credit Mode ──
  if (wrongCount > 0) {
    if (config.mcq_wrong_penalty === "flat") {
      base.marks_awarded = -config.marks_wrong;
    } else {
      // per_option: -y × wrong_count, capped at -marks_correct
      const rawPenalty = -config.marks_wrong * wrongCount;
      base.marks_awarded = Math.max(rawPenalty, -config.marks_correct);
    }
    return base;
  }

  // No wrong selected, k correct selected
  if (correctCount > 0 && totalCorrect > 0) {
    const raw = correctCount * (config.marks_correct / totalCorrect);
    base.breakdown.raw_before_rounding = raw;
    base.marks_awarded = applyRounding(raw, config.rounding_strategy);
  }

  return base;
}

// ─── Config Resolution ───────────────────────────────────────────────

/**
 * Resolve the effective scoring config for a question, following the
 * inheritance chain: question → section → exam → null (unscored).
 */
export function resolveConfig(
  questionId: string,
  sectionId: string,
  questionConfigs: Map<string, ScoringConfig>,
  sectionConfigs: Map<string, ScoringConfig>,
  examConfig: ScoringConfig | null
): ScoringConfig | null {
  return (
    questionConfigs.get(questionId) ??
    sectionConfigs.get(sectionId) ??
    examConfig ??
    null
  );
}

// ─── Section-Level Calculation ───────────────────────────────────────

export type QuestionInput = {
  id: string;
  section_id: string;
  answer_type: string;
  correct_answer: unknown;
};

export type QuestionStateInput = {
  selectedAnswer: unknown;
  status: "untouched" | "attempted" | "viewed";
};

/**
 * Calculate marks for all questions in a section (or across sections).
 */
export function calculateMarks(
  questions: QuestionInput[],
  questionStates: Record<string, QuestionStateInput>,
  questionConfigs: Map<string, ScoringConfig>,
  sectionConfigs: Map<string, ScoringConfig>,
  examConfig: ScoringConfig | null
): { total: number; max: number; perQuestion: QuestionResult[] } {
  const perQuestion: QuestionResult[] = [];
  let total = 0;
  let max = 0;

  for (const q of questions) {
    const config = resolveConfig(
      q.id,
      q.section_id,
      questionConfigs,
      sectionConfigs,
      examConfig
    );

    // No config at any level → unscored question, 0 marks
    if (!config) {
      perQuestion.push({
        question_id: q.id,
        marks_awarded: 0,
        breakdown: {
          correct_selected: 0,
          total_correct: 0,
          wrong_selected: 0,
          mode: "unscored",
        },
      });
      continue;
    }

    max += config.marks_correct;

    const state = questionStates[q.id];
    const isSkipped =
      !state ||
      state.status === "untouched" ||
      state.selectedAnswer === null ||
      state.selectedAnswer === undefined;

    const isMulti =
      q.answer_type === "multi" || q.answer_type === "multiple";

    let result: QuestionResult;

    if (isMulti && Array.isArray(q.correct_answer)) {
      const selectedArr =
        !isSkipped && Array.isArray(state?.selectedAnswer)
          ? state.selectedAnswer
          : !isSkipped && state?.selectedAnswer
            ? [state.selectedAnswer]
            : [];

      result = scoreMCQ(
        q.id,
        selectedArr,
        q.correct_answer,
        isSkipped,
        config
      );
    } else {
      result = scoreSCQ(
        q.id,
        isSkipped ? null : state?.selectedAnswer,
        q.correct_answer,
        isSkipped,
        config
      );
    }

    total += result.marks_awarded;
    perQuestion.push(result);
  }

  return {
    total: Math.round(total * 100) / 100,
    max: Math.round(max * 100) / 100,
    perQuestion,
  };
}
