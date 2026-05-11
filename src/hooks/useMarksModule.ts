/**
 * useMarksModule.ts — React hook for the Marks Module
 *
 * Provides scoring config data & actions for creator-facing panels.
 */

import { useState, useEffect, useCallback } from "react";
import type { ScoringConfig } from "@/services/scoringEngine";
import { resolveConfig as resolveConfigFn } from "@/services/scoringEngine";
import {
  getExamScoringDefault,
  getSectionScoringDefaults,
  getQuestionScoringConfigs,
  upsertExamDefault,
  upsertSectionDefault,
  upsertQuestionConfig,
  bulkUpsertQuestionConfigs,
  deleteQuestionConfig,
  type ExamScoringDefault,
} from "@/services/scoringService";

export type UseMarksModuleReturn = {
  // Data
  examConfig: ExamScoringDefault | null;
  sectionConfigs: Map<string, ScoringConfig>;
  questionConfigs: Map<string, ScoringConfig>;
  isScoringEnabled: boolean;
  isLoading: boolean;

  // Resolved config for a specific question
  resolveQuestionConfig: (
    questionId: string,
    sectionId: string
  ) => ScoringConfig | null;

  // Total max marks for current questions
  totalMaxMarks: number;

  // Actions
  updateExamConfig: (
    config: Partial<ScoringConfig> & { show_marks_in_simulator?: boolean }
  ) => Promise<void>;
  updateSectionConfig: (
    sectionId: string,
    config: Partial<ScoringConfig>
  ) => Promise<void>;
  updateQuestionConfig: (
    questionId: string,
    config: Partial<ScoringConfig>
  ) => Promise<void>;
  removeQuestionConfig: (questionId: string) => Promise<void>;
  applyExamDefaultToAll: (config: ScoringConfig) => Promise<void>;
  applySectionDefaultToAll: (sectionId: string, config: ScoringConfig) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
};

export function useMarksModule(
  examId: string | undefined,
  sectionIds: string[],
  questionIds: string[],
  questionSectionMap: Map<string, string> // questionId → sectionId
): UseMarksModuleReturn {
  const [examConfig, setExamConfig] = useState<ExamScoringDefault | null>(null);
  const [sectionConfigs, setSectionConfigs] = useState<Map<string, ScoringConfig>>(new Map());
  const [questionConfigs, setQuestionConfigs] = useState<Map<string, ScoringConfig>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const isScoringEnabled = examConfig !== null;

  // Calculate total max marks based on resolved configs
  const totalMaxMarks = (() => {
    let total = 0;
    for (const qid of questionIds) {
      const sid = questionSectionMap.get(qid) ?? "";
      const config = resolveConfigFn(qid, sid, questionConfigs, sectionConfigs, examConfig);
      if (config) total += config.marks_correct;
    }
    return Math.round(total * 100) / 100;
  })();

  const fetchAll = useCallback(async () => {
    if (!examId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [ec, sc, qc] = await Promise.all([
        getExamScoringDefault(examId),
        getSectionScoringDefaults(sectionIds),
        getQuestionScoringConfigs(questionIds),
      ]);
      setExamConfig(ec);
      setSectionConfigs(sc);
      setQuestionConfigs(qc);
    } catch (e) {
      console.error("[MarksModule] Failed to load scoring configs:", e);
    } finally {
      setIsLoading(false);
    }
  }, [examId, sectionIds.join(","), questionIds.join(",")]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const resolveQuestionConfig = useCallback(
    (questionId: string, sectionId: string): ScoringConfig | null =>
      resolveConfigFn(questionId, sectionId, questionConfigs, sectionConfigs, examConfig),
    [questionConfigs, sectionConfigs, examConfig]
  );

  // ── Actions ──

  const updateExamConfig = useCallback(
    async (
      config: Partial<ScoringConfig> & { show_marks_in_simulator?: boolean }
    ) => {
      if (!examId) return;
      await upsertExamDefault(examId, config);

      // Optimistic update
      setExamConfig((prev) => {
        const base = prev ?? {
          marks_correct: 1,
          marks_wrong: 0,
          marks_skipped: 0,
          mcq_mode: "partial" as const,
          mcq_wrong_penalty: "flat" as const,
          rounding_strategy: "floor" as const,
          show_marks_in_simulator: true,
        };
        return { ...base, ...config } as ExamScoringDefault;
      });
    },
    [examId]
  );

  const updateSectionConfig = useCallback(
    async (sectionId: string, config: Partial<ScoringConfig>) => {
      await upsertSectionDefault(sectionId, config);
      setSectionConfigs((prev) => {
        const next = new Map(prev);
        const existing = prev.get(sectionId);
        next.set(sectionId, {
          marks_correct: 1,
          marks_wrong: 0,
          marks_skipped: 0,
          mcq_mode: "partial",
          mcq_wrong_penalty: "flat",
          rounding_strategy: "floor",
          ...existing,
          ...config,
        } as ScoringConfig);
        return next;
      });
    },
    []
  );

  const updateQuestionConfigFn = useCallback(
    async (questionId: string, config: Partial<ScoringConfig>) => {
      await upsertQuestionConfig(questionId, config);
      setQuestionConfigs((prev) => {
        const next = new Map(prev);
        const existing = prev.get(questionId);
        next.set(questionId, {
          marks_correct: 1,
          marks_wrong: 0,
          marks_skipped: 0,
          mcq_mode: "partial",
          mcq_wrong_penalty: "flat",
          rounding_strategy: "floor",
          ...existing,
          ...config,
        } as ScoringConfig);
        return next;
      });
    },
    []
  );

  const removeQuestionConfig = useCallback(
    async (questionId: string) => {
      await deleteQuestionConfig(questionId);
      setQuestionConfigs((prev) => {
        const next = new Map(prev);
        next.delete(questionId);
        return next;
      });
    },
    []
  );

  const applyExamDefaultToAll = useCallback(async (config: ScoringConfig) => {
    if (questionIds.length === 0) return;
    await bulkUpsertQuestionConfigs(questionIds, config);
    // Optimistic: set all question configs
    setQuestionConfigs(() => {
      const next = new Map<string, ScoringConfig>();
      for (const qid of questionIds) {
        next.set(qid, { ...config });
      }
      return next;
    });
  }, [questionIds]);

  const applySectionDefaultToAll = useCallback(
    async (sectionId: string, config: ScoringConfig) => {
      const sectionQuestionIds = questionIds.filter(
        (qid) => questionSectionMap.get(qid) === sectionId
      );
      if (sectionQuestionIds.length === 0) return;

      await bulkUpsertQuestionConfigs(sectionQuestionIds, config);

      setQuestionConfigs((prev) => {
        const next = new Map(prev);
        for (const qid of sectionQuestionIds) {
          next.set(qid, { ...config });
        }
        return next;
      });
    },
    [questionIds, questionSectionMap]
  );

  return {
    examConfig,
    sectionConfigs,
    questionConfigs,
    isScoringEnabled,
    isLoading,
    resolveQuestionConfig,
    totalMaxMarks,
    updateExamConfig,
    updateSectionConfig,
    updateQuestionConfig: updateQuestionConfigFn,
    removeQuestionConfig,
    applyExamDefaultToAll,
    applySectionDefaultToAll,
    refresh: fetchAll,
  };
}
