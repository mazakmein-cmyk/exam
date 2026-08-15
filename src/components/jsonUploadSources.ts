/**
 * jsonUploadSources.ts — Data-source adapters for JsonUploadDialog.
 *
 * The dialog itself is exam-type agnostic; everything that touches a specific
 * set of tables (mock exams: `sections`/`parsed_questions`/`attempts`; live
 * exams: `live_sections`/`live_questions`/`live_responses`) lives here.
 */
import { supabase } from "@/integrations/supabase/client";

export type SectionMeta = { id: string; name: string; sort_order: number };

/** One section the user asked the mismatch flow to create. */
export type NewSectionSpec = {
  name: string;
  /** Required when the data source has `requiresSectionTime` (mock exams). */
  timeMinutes?: number;
};

/** One DB row of the creation plan (exam id is added by the adapter). */
export type SectionCreationRow = {
  name: string;
  sort_order: number;
  language: string;
  section_group_id: string;
  time_minutes?: number;
};

/**
 * Expand section specs into per-language rows, mirroring the editors'
 * "Add Section": every supported language gets a row and the language
 * variants of one section share a section_group_id — that shared id is what
 * lets the existing import code auto-fill the second language (placeholder
 * rows on mock, verbatim copies on live).
 *
 * sort_order continues after the current max across ALL languages (twins
 * share their sort_order, and max-based ordering survives deleted-section
 * gaps, unlike count-based).
 */
export function buildSectionCreationPlan(
  specs: NewSectionSpec[],
  sectionsByLang: Record<string, SectionMeta[]>,
  supportedLanguages: string[],
  genGroupId: () => string = () => crypto.randomUUID()
): SectionCreationRow[] {
  const maxSort = Math.max(
    -1,
    ...supportedLanguages.flatMap((l) => (sectionsByLang[l] ?? []).map((s) => s.sort_order))
  );
  const rows: SectionCreationRow[] = [];
  specs.forEach((spec, i) => {
    const groupId = genGroupId();
    for (const lang of supportedLanguages) {
      rows.push({
        name: spec.name,
        sort_order: maxSort + 1 + i,
        language: lang,
        section_group_id: groupId,
        ...(spec.timeMinutes !== undefined ? { time_minutes: spec.timeMinutes } : {}),
      });
    }
  });
  return rows;
}

export type LangStatus = {
  questionCount: number;
  sectionCount: number;
  /** > 0 disables the destructive "Replace" mode. */
  submittedAttemptCount: number;
};

export type JsonUploadDataSource = {
  /** Sections for the exam, grouped by language code. */
  loadSectionsByLang: (
    examId: string,
    supportedLanguages: string[]
  ) => Promise<Record<string, SectionMeta[]>>;

  /** Per-language counts, given the already-loaded sections. */
  loadLangStatus: (
    examId: string,
    supportedLanguages: string[],
    sectionsByLang: Record<string, SectionMeta[]>
  ) => Promise<Record<string, LangStatus>>;

  /** Persist a section rename (throws on failure). */
  renameSection: (sectionId: string, name: string) => Promise<void>;

  /**
   * Bulk-create sections from the mismatch flow (throws on failure).
   * Rows come from buildSectionCreationPlan; the adapter adds the exam FK.
   */
  createSections: (examId: string, rows: SectionCreationRow[]) => Promise<void>;

  /**
   * Whether new sections need a mandatory time (mock exams: time_minutes).
   * Live sections have no time column — timing is per-question time_seconds.
   */
  requiresSectionTime: boolean;

  /** Storage bucket for PDF + auto-snip uploads. */
  storageBucket: string;

  /** Show marks-related badges? Live exams have no marks (correct/wrong only). */
  showMarks: boolean;

  /** Reason text when Replace is blocked; receives submittedAttemptCount. */
  replaceBlockedReason: (count: number) => string;
};

export const mockExamJsonSource: JsonUploadDataSource = {
  loadSectionsByLang: async (examId, supportedLanguages) => {
    const { data: sectionsData, error: sectionsErr } = await supabase
      .from("sections")
      .select("id, name, language, sort_order")
      .eq("exam_id", examId);

    if (sectionsErr) throw sectionsErr;

    const byLang: Record<string, SectionMeta[]> = {};
    for (const lang of supportedLanguages) {
      byLang[lang] = (sectionsData || [])
        .filter((s: any) => s.language === lang)
        .map((s: any) => ({ id: s.id as string, name: s.name as string, sort_order: (s.sort_order as number) ?? 0 }))
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    return byLang;
  },

  loadLangStatus: async (examId, supportedLanguages, sectionsByLang) => {
    // Fetch exam creator so we can exclude their own attempts from the count
    const { data: examRow } = await supabase
      .from("exams")
      .select("user_id")
      .eq("id", examId)
      .single();
    const creatorId = examRow?.user_id;

    const nextStatus: Record<string, LangStatus> = {};
    for (const lang of supportedLanguages) {
      const sectionIds = sectionsByLang[lang]?.map((s) => s.id) ?? [];
      if (sectionIds.length === 0) {
        nextStatus[lang] = { questionCount: 0, sectionCount: 0, submittedAttemptCount: 0 };
        continue;
      }
      let attemptsQuery = supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .in("section_id", sectionIds)
        .not("submitted_at", "is", null);

      // Exclude the creator's own attempts — they shouldn't block Replace
      if (creatorId) {
        attemptsQuery = attemptsQuery.neq("user_id", creatorId);
      }

      const [qRes, aRes] = await Promise.all([
        supabase
          .from("parsed_questions")
          .select("id", { count: "exact", head: true })
          .in("section_id", sectionIds),
        attemptsQuery,
      ]);
      // Must fail closed: a swallowed error here would report 0 submissions and
      // enable the destructive Replace mode.
      if (qRes.error) throw qRes.error;
      if (aRes.error) throw aRes.error;
      nextStatus[lang] = {
        questionCount: qRes.count ?? 0,
        sectionCount: sectionIds.length,
        submittedAttemptCount: aRes.count ?? 0,
      };
    }
    return nextStatus;
  },

  renameSection: async (sectionId, name) => {
    const { error } = await supabase.from("sections").update({ name }).eq("id", sectionId);
    if (error) throw error;
  },

  createSections: async (examId, rows) => {
    const { error } = await supabase.from("sections").insert(
      rows.map((r) => ({
        exam_id: examId,
        name: r.name,
        sort_order: r.sort_order,
        language: r.language,
        section_group_id: r.section_group_id,
        // Mandatory in this flow; 60 is only a type-level safety net, the
        // dialog blocks Create until every section has a valid time.
        time_minutes: r.time_minutes ?? 60,
      }))
    );
    if (error) throw error;
  },

  requiresSectionTime: true,

  storageBucket: "exam-pdfs",

  showMarks: true,

  replaceBlockedReason: (count) =>
    `Cannot Replace — ${count} student submission${count > 1 ? "s" : ""} exist in this language. Use Append.`,
};

export const liveExamJsonSource: JsonUploadDataSource = {
  loadSectionsByLang: async (examId, supportedLanguages) => {
    const { data: sectionsData, error: sectionsErr } = await supabase
      .from("live_sections")
      .select("id, name, language, sort_order")
      .eq("live_exam_id", examId);

    if (sectionsErr) throw sectionsErr;

    const byLang: Record<string, SectionMeta[]> = {};
    for (const lang of supportedLanguages) {
      byLang[lang] = (sectionsData || [])
        .filter((s: any) => s.language === lang)
        .map((s: any) => ({ id: s.id as string, name: s.name as string, sort_order: (s.sort_order as number) ?? 0 }))
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    return byLang;
  },

  loadLangStatus: async (examId, supportedLanguages, sectionsByLang) => {
    // Fetch exam creator so we can exclude their own responses from the count
    const { data: examRow } = await supabase
      .from("live_exams")
      .select("user_id")
      .eq("id", examId)
      .single();
    const creatorId = examRow?.user_id;

    // Responses aren't per-language (live_responses keys on the exam), so one
    // count covers every language: any recorded answer blocks Replace, since
    // deleting questions would orphan responses and their analytics.
    // Fails closed on purpose: if this count errored and defaulted to 0,
    // Replace would unblock and cascade-delete every recorded answer.
    let responsesQuery = supabase
      .from("live_responses")
      .select("id", { count: "exact", head: true })
      .eq("live_exam_id", examId);

    // Exclude the creator's own responses — they shouldn't block Replace
    if (creatorId) {
      responsesQuery = responsesQuery.neq("user_id", creatorId);
    }

    const { count: responseCount, error: respErr } = await responsesQuery;
    if (respErr) throw respErr;

    const nextStatus: Record<string, LangStatus> = {};
    for (const lang of supportedLanguages) {
      const sectionIds = sectionsByLang[lang]?.map((s) => s.id) ?? [];
      if (sectionIds.length === 0) {
        nextStatus[lang] = { questionCount: 0, sectionCount: 0, submittedAttemptCount: 0 };
        continue;
      }
      const { count: qCount, error: qErr } = await supabase
        .from("live_questions")
        .select("id", { count: "exact", head: true })
        .in("live_section_id", sectionIds);
      if (qErr) throw qErr;
      nextStatus[lang] = {
        questionCount: qCount ?? 0,
        sectionCount: sectionIds.length,
        submittedAttemptCount: responseCount ?? 0,
      };
    }
    return nextStatus;
  },

  renameSection: async (sectionId, name) => {
    const { error } = await supabase.from("live_sections").update({ name }).eq("id", sectionId);
    if (error) throw error;
  },

  createSections: async (examId, rows) => {
    // No time here on purpose: live_sections has no time column. Question
    // timers come from each question's time_seconds at import.
    const { error } = await supabase.from("live_sections").insert(
      rows.map((r) => ({
        live_exam_id: examId,
        name: r.name,
        sort_order: r.sort_order,
        language: r.language,
        section_group_id: r.section_group_id,
      }))
    );
    if (error) throw error;
  },

  requiresSectionTime: false,

  // Same bucket as mock exams — RLS keys on the `user.id` path prefix, not the
  // exam type, so the existing policy already covers live-exam uploads.
  storageBucket: "exam-pdfs",

  showMarks: false,

  replaceBlockedReason: (count) =>
    `Cannot Replace — ${count} student answer${count > 1 ? "s" : ""} already recorded for this exam. Use Append.`,
};
