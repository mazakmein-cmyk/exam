/**
 * jsonUploadSources.ts — Data-source adapters for JsonUploadDialog.
 *
 * The dialog itself is exam-type agnostic; everything that touches a specific
 * set of tables (mock exams: `sections`/`parsed_questions`/`attempts`; live
 * exams: `live_sections`/`live_questions`/`live_responses`) lives here.
 */
import { supabase } from "@/integrations/supabase/client";

export type SectionMeta = { id: string; name: string; sort_order: number };

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

  loadLangStatus: async (_examId, supportedLanguages, sectionsByLang) => {
    const nextStatus: Record<string, LangStatus> = {};
    for (const lang of supportedLanguages) {
      const sectionIds = sectionsByLang[lang]?.map((s) => s.id) ?? [];
      if (sectionIds.length === 0) {
        nextStatus[lang] = { questionCount: 0, sectionCount: 0, submittedAttemptCount: 0 };
        continue;
      }
      const [qRes, aRes] = await Promise.all([
        supabase
          .from("parsed_questions")
          .select("id", { count: "exact", head: true })
          .in("section_id", sectionIds),
        supabase
          .from("attempts")
          .select("id", { count: "exact", head: true })
          .in("section_id", sectionIds)
          .not("submitted_at", "is", null),
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
    // Responses aren't per-language (live_responses keys on the exam), so one
    // count covers every language: any recorded answer blocks Replace, since
    // deleting questions would orphan responses and their analytics.
    // Fails closed on purpose: if this count errored and defaulted to 0,
    // Replace would unblock and cascade-delete every recorded answer.
    const { count: responseCount, error: respErr } = await supabase
      .from("live_responses")
      .select("id", { count: "exact", head: true })
      .eq("live_exam_id", examId);
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

  // Same bucket as mock exams — RLS keys on the `user.id` path prefix, not the
  // exam type, so the existing policy already covers live-exam uploads.
  storageBucket: "exam-pdfs",

  showMarks: false,

  replaceBlockedReason: (count) =>
    `Cannot Replace — ${count} student answer${count > 1 ? "s" : ""} already recorded for this exam. Use Append.`,
};
