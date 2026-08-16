/**
 * examInstructionFacts.ts — gather the paper's facts for the instruction engine.
 *
 * Why this is not in the editor any more
 * --------------------------------------
 * It used to live in ExamDetail as `collectExamFacts`, closing over the page's
 * state. Then the publish dialog needed the same answer — it warns that the
 * stored instructions no longer describe the paper, and offers to rewrite them
 * on the spot — and that dialog also opens from the Dashboard, where there is
 * no editor state at all. Two screens deriving "what is this paper" separately
 * is how one of them ends up warning about a paper the other thinks is fine.
 *
 * The facts the engine wants are NOT all in any page's state: `questions` holds
 * only the selected section, and the marks maps cover only its question ids. So
 * the counts, the answer-type mix, and the full override picture are fetched
 * here, at call time — always current, never a second copy of state to keep
 * honest through every add/delete path.
 */
import { supabase } from "@/integrations/supabase/client";
import { type ExamFacts } from "@/components/exam/GenerateExamInstruction";
import { type ScoringConfig } from "@/services/scoringEngine";
import {
  getExamScoringDefault,
  getSectionScoringDefaults,
  getQuestionScoringConfigs,
} from "@/services/scoringService";
import { sumSectionMinutes } from "@/lib/examNavigation.js";

/** The two languages this app writes instructions in. Mirrors ExamDetail's list. */
const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी" },
];

export type CollectExamFactsInput = {
  examId: string | null;
  /** The sections a candidate sitting `lang` actually gets, in order. */
  sections: { id: string; name: string; time_minutes: number }[];
  /** Every section row on the exam — the override remap needs the primary ones. */
  allSections: { id: string; language?: string | null }[];
  primaryLanguage: string;
  allowSectionSwitching: boolean;
  totalTimeMinutes: number | null;
  /** Section id → timing group id, already resolved for this language. */
  resolvedGroupIds: Map<string, string>;
  /** Timing groups named in `lang`, or null when there are none. */
  groups: Record<string, { name: string; minutes: number | null }> | null;
  /** The language the text will be written in — decides how languages are named. */
  lang: string;
  supportedLanguages: string[];
  /**
   * What the intro will actually offer, when the caller knows better than the
   * stored row does. The publish dialog is holding the tick boxes, so it knows
   * that "publish English only" means the intro offers no chooser — passing
   * null falls back to the published-or-supported rule below, which is the best
   * an editor can do.
   */
  candidateLanguages?: string[] | null;
  /** The exam row's own publish state, for that fallback. */
  isPublished?: boolean;
  publishedLanguages?: string[] | null;
};

export async function collectExamFacts(input: CollectExamFactsInput): Promise<ExamFacts> {
  const {
    examId,
    sections,
    allSections,
    primaryLanguage,
    allowSectionSwitching,
    totalTimeMinutes,
    resolvedGroupIds,
    groups,
    lang,
    supportedLanguages,
    candidateLanguages = null,
    isPublished = false,
    publishedLanguages = null,
  } = input;

  const sectionIds = sections.map((s) => s.id);
  if (sectionIds.length === 0) {
    // Nothing to count; the engine will answer null and the button will say so.
    return {
      sections: [],
      allowSectionSwitching,
      totalMinutes: null,
      marking: null,
      answerTypes: null,
      languageNames: null,
    };
  }

  // The same filter the runner uses to build the paper (ExamSimulator does
  // .eq("is_excluded", false)), so these counts are what a candidate sees.
  // Paged, because PostgREST caps a single response (1000 rows by default)
  // and a silently truncated page would undercount a big paper — the one
  // failure mode a counting query must not have.
  const fetchQuestionRows = async (ids: string[]) => {
    const PAGE = 1000;
    const rows: { id: string; section_id: string; answer_type: string }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("parsed_questions")
        .select("id, section_id, answer_type")
        .eq("is_excluded", false)
        .in("section_id", ids)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as typeof rows));
      if (!data || data.length < PAGE) return rows;
    }
  };
  const rows = await fetchQuestionRows(sectionIds);

  // Scoring override rows live on PRIMARY-language sections/questions only
  // (the marks panel edits primary rows; the runner maps a secondary sitting
  // back to them) — so on a secondary tab the overrides must be looked up by
  // the primary ids, or every paper reads as uniformly marked from Hindi.
  const primarySectionIds = allSections
    .filter((s) => (s.language || "en") === primaryLanguage)
    .map((s) => s.id);
  const overrideSectionIds = primarySectionIds.length > 0 ? primarySectionIds : sectionIds;
  const overrideQuestionIds =
    overrideSectionIds === sectionIds
      ? rows.map((r) => r.id)
      : (await fetchQuestionRows(overrideSectionIds)).map((r) => r.id);

  const [examDefault, sectionDefaults, questionOverrides] = await Promise.all([
    examId ? getExamScoringDefault(examId) : Promise.resolve(null),
    getSectionScoringDefaults(overrideSectionIds),
    getQuestionScoringConfigs(overrideQuestionIds),
  ]);

  const countBySection = new Map<string, number>();
  const answerTypes: Record<string, number> = {};
  for (const row of rows) {
    countBySection.set(row.section_id, (countBySection.get(row.section_id) || 0) + 1);
    answerTypes[row.answer_type] = (answerTypes[row.answer_type] || 0) + 1;
  }

  // "Apply to All" materialises override rows whose values EQUAL the exam
  // default, so uniformity is a value comparison, never a row count.
  const overrides = [...sectionDefaults.values(), ...questionOverrides.values()];
  const sameAsDefault = (c: ScoringConfig) =>
    examDefault !== null &&
    c.marks_correct === examDefault.marks_correct &&
    c.marks_wrong === examDefault.marks_wrong &&
    c.marks_skipped === examDefault.marks_skipped &&
    c.mcq_mode === examDefault.mcq_mode &&
    c.mcq_wrong_penalty === examDefault.mcq_wrong_penalty &&
    c.rounding_strategy === examDefault.rounding_strategy;

  return {
    sections: sections.map((s) => ({
      name: s.name,
      minutes: Number.isFinite(s.time_minutes) && s.time_minutes > 0 ? s.time_minutes : null,
      questionCount: countBySection.get(s.id) ?? 0,
      groupId: resolvedGroupIds.get(s.id) ?? null,
    })),
    allowSectionSwitching,
    // The runner's rule (totalExamMinutes): the explicit total wins, else the
    // section sum — and a sum of 0 is "unknown", not a zero-minute paper.
    totalMinutes: totalTimeMinutes ?? (sumSectionMinutes(sections) || null),
    // Timing groups, named in the active language — so the generated Hindi
    // instruction says सत्र I where the Hindi player screens say सत्र I.
    groups,
    marking:
      examDefault === null
        ? null
        : {
            correct: examDefault.marks_correct,
            wrong: examDefault.marks_wrong,
            skipped: examDefault.marks_skipped,
            mcqMode: examDefault.mcq_mode,
            mcqWrongPenalty: examDefault.mcq_wrong_penalty,
            uniform: overrides.every(sameAsDefault),
          },
    scoredWithoutDefault: examDefault === null && overrides.length > 0,
    answerTypes,
    // Candidates choose from published_languages, not supported_languages —
    // publishing can select a subset (a broken variant's switch is disabled),
    // and telling a candidate to "choose your language" on an intro page
    // that offers no chooser names a choice that does not exist. A caller
    // holding the actual selection overrides all of it; before publishing
    // there is nothing better than the supported list.
    languageNames: (() => {
      const chosen = Array.isArray(candidateLanguages) && candidateLanguages.length > 0
        ? candidateLanguages
        : null;
      const candidateLangs =
        chosen ??
        (isPublished && (publishedLanguages?.length ?? 0) > 0
          ? (publishedLanguages as string[])
          : supportedLanguages);
      if (candidateLangs.length <= 1) return null;
      return candidateLangs.map((code) => {
        const l = AVAILABLE_LANGUAGES.find((x) => x.code === code);
        // The Hindi instruction names the languages the Hindi way.
        return l ? (lang === "hi" ? l.nativeLabel : l.label) : code;
      });
    })(),
  };
}
