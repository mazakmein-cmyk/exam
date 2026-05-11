/**
 * scoringService.ts — Supabase CRUD layer for the Marks Module
 *
 * Thin wrapper around Supabase queries. No business logic here;
 * all scoring math lives in scoringEngine.ts.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ScoringConfig, QuestionResult } from "./scoringEngine";

// ─── Helpers ─────────────────────────────────────────────────────────

function rowToConfig(row: Record<string, unknown>): ScoringConfig {
  return {
    marks_correct: Number(row.marks_correct ?? 1),
    marks_wrong: Number(row.marks_wrong ?? 0),
    marks_skipped: Number(row.marks_skipped ?? 0),
    mcq_mode: (row.mcq_mode as ScoringConfig["mcq_mode"]) ?? "partial",
    mcq_wrong_penalty:
      (row.mcq_wrong_penalty as ScoringConfig["mcq_wrong_penalty"]) ?? "flat",
    rounding_strategy:
      (row.rounding_strategy as ScoringConfig["rounding_strategy"]) ?? "floor",
  };
}

function configToRow(config: Partial<ScoringConfig>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (config.marks_correct !== undefined) row.marks_correct = config.marks_correct;
  if (config.marks_wrong !== undefined) row.marks_wrong = config.marks_wrong;
  if (config.marks_skipped !== undefined) row.marks_skipped = config.marks_skipped;
  if (config.mcq_mode !== undefined) row.mcq_mode = config.mcq_mode;
  if (config.mcq_wrong_penalty !== undefined) row.mcq_wrong_penalty = config.mcq_wrong_penalty;
  if (config.rounding_strategy !== undefined) row.rounding_strategy = config.rounding_strategy;
  return row;
}

// ─── Exam-Level ──────────────────────────────────────────────────────

export type ExamScoringDefault = ScoringConfig & {
  show_marks_in_simulator: boolean;
};

export async function getExamScoringDefault(
  examId: string
): Promise<ExamScoringDefault | null> {
  const { data, error } = await supabase
    .from("exam_scoring_defaults" as any)
    .select("*")
    .eq("exam_id", examId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ...rowToConfig(data as Record<string, unknown>),
    show_marks_in_simulator: (data as any).show_marks_in_simulator ?? true,
  };
}

export async function upsertExamDefault(
  examId: string,
  config: Partial<ScoringConfig> & { show_marks_in_simulator?: boolean }
): Promise<void> {
  const row: Record<string, unknown> = {
    exam_id: examId,
    ...configToRow(config),
  };
  if (config.show_marks_in_simulator !== undefined) {
    row.show_marks_in_simulator = config.show_marks_in_simulator;
  }

  const { error } = await supabase
    .from("exam_scoring_defaults" as any)
    .upsert(row as any, { onConflict: "exam_id" });

  if (error) throw error;
}

// ─── Section-Level ───────────────────────────────────────────────────

export async function getSectionScoringDefaults(
  sectionIds: string[]
): Promise<Map<string, ScoringConfig>> {
  const map = new Map<string, ScoringConfig>();
  if (sectionIds.length === 0) return map;

  const { data, error } = await supabase
    .from("section_scoring_defaults" as any)
    .select("*")
    .in("section_id", sectionIds);

  if (error || !data) return map;

  for (const row of data as Record<string, unknown>[]) {
    map.set(row.section_id as string, rowToConfig(row));
  }
  return map;
}

export async function upsertSectionDefault(
  sectionId: string,
  config: Partial<ScoringConfig>
): Promise<void> {
  const { error } = await supabase
    .from("section_scoring_defaults" as any)
    .upsert(
      { section_id: sectionId, ...configToRow(config) } as any,
      { onConflict: "section_id" }
    );

  if (error) throw error;
}

// ─── Question-Level ──────────────────────────────────────────────────

export async function getQuestionScoringConfigs(
  questionIds: string[]
): Promise<Map<string, ScoringConfig>> {
  const map = new Map<string, ScoringConfig>();
  if (questionIds.length === 0) return map;

  // Chunk to avoid URL length limits (same pattern used in Analytics)
  const CHUNK = 200;
  for (let i = 0; i < questionIds.length; i += CHUNK) {
    const chunk = questionIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("question_scoring_config" as any)
      .select("*")
      .in("question_id", chunk);

    if (error) continue;
    if (data) {
      for (const row of data as Record<string, unknown>[]) {
        map.set(row.question_id as string, rowToConfig(row));
      }
    }
  }
  return map;
}

export async function upsertQuestionConfig(
  questionId: string,
  config: Partial<ScoringConfig>
): Promise<void> {
  const { error } = await supabase
    .from("question_scoring_config" as any)
    .upsert(
      { question_id: questionId, ...configToRow(config) } as any,
      { onConflict: "question_id" }
    );

  if (error) throw error;
}

export async function bulkUpsertQuestionConfigs(
  questionIds: string[],
  config: Partial<ScoringConfig>
): Promise<void> {
  if (questionIds.length === 0) return;

  const rows = questionIds.map((qid) => ({
    question_id: qid,
    ...configToRow(config),
  }));

  // Chunk for safety
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("question_scoring_config" as any)
      .upsert(chunk as any, { onConflict: "question_id" });

    if (error) throw error;
  }
}

export async function deleteQuestionConfig(questionId: string): Promise<void> {
  const { error } = await supabase
    .from("question_scoring_config" as any)
    .delete()
    .eq("question_id", questionId);

  if (error) throw error;
}

// ─── Marks Log (Post-Submission) ─────────────────────────────────────

export async function saveMarksLog(
  attemptId: string,
  results: QuestionResult[]
): Promise<void> {
  if (results.length === 0) return;

  const rows = results.map((r) => ({
    attempt_id: attemptId,
    question_id: r.question_id,
    marks_awarded: r.marks_awarded,
    breakdown: r.breakdown,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("question_marks_log" as any)
      .upsert(chunk as any, { onConflict: "attempt_id,question_id" });

    if (error) {
      // Fallback to insert if upsert fails
      const { error: insertErr } = await supabase
        .from("question_marks_log" as any)
        .insert(chunk as any);
      if (insertErr) throw insertErr;
    }
  }
}

export async function updateAttemptMarks(
  attemptId: string,
  marksScore: number,
  marksMax: number
): Promise<void> {
  const { error } = await supabase
    .from("attempts")
    .update({
      marks_score: marksScore,
      marks_max: marksMax,
    } as any)
    .eq("id", attemptId);

  if (error) throw error;
}

// ─── Marks Log Read (For Review & Analytics) ─────────────────────────

export async function getAttemptMarksLog(
  attemptIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (attemptIds.length === 0) return map;

  const CHUNK = 200;
  for (let i = 0; i < attemptIds.length; i += CHUNK) {
    const chunk = attemptIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("question_marks_log" as any)
      .select("question_id, marks_awarded")
      .in("attempt_id", chunk);

    if (error) continue;
    if (data) {
      for (const row of data as { question_id: string; marks_awarded: number }[]) {
        // If same question appears in multiple attempts (multi-section session),
        // sum them (though typically it's 1:1 question:attempt)
        const existing = map.get(row.question_id) ?? 0;
        map.set(row.question_id, existing + Number(row.marks_awarded));
      }
    }
  }

  return map;
}

/**
 * Helper to look up the exam_id for a given section_id.
 * Used by examService to resolve exam-level scoring config.
 */
export async function getExamIdForSection(sectionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sections")
    .select("exam_id")
    .eq("id", sectionId)
    .single();

  if (error || !data) return null;
  return (data as any).exam_id;
}
