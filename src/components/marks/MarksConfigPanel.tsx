/**
 * MarksConfigPanel.tsx — Creator scoring configuration.
 *
 * Design philosophy:
 * - Inline helper text (visible, no hover needed) to reduce cognitive load
 * - Radix tooltips for advanced options (portals out of Sheet)
 * - Progressive disclosure: MCQ settings hidden behind collapsible
 * - Clean, airy layout with consistent rounded-xl surfaces
 */

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMarksModule } from "@/hooks/useMarksModule";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type ScoringConfig, formatMarks, DEFAULT_SCORING_CONFIG } from "@/services/scoringEngine";
import { MarksQuestionBadge } from "./MarksQuestionBadge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Zap,
  Settings2,
  Eye,
  EyeOff,
  Info,
  X,
} from "lucide-react";

// ─── Radix-based tooltip on a (?) icon ───────────────────────────────

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[#6C3EF4]/70 hover:text-[#6C3EF4] hover:bg-[#6C3EF4]/10 transition-all duration-150 ml-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6C3EF4]/40"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-[240px] px-3 py-2.5 text-xs leading-relaxed bg-[#1e1433] text-white border-none shadow-xl rounded-xl"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Segmented control ───────────────────────────────────────────────

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-muted/50 p-0.5 gap-px">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
            value === opt.value
              ? "bg-[#6C3EF4] text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Scoring Form ────────────────────────────────────────────────────

interface MarksConfigPanelProps {
  examId: string;
  onClose: () => void;
  initialQuestionId?: string;
  initialSectionId?: string;
  onConfigChange?: () => void;
}

type Tab = "exam" | "section" | "question";

function ScoringForm({
  config,
  onChange,
  showMcq = true,
  compact = false,
}: {
  config: ScoringConfig;
  onChange: (config: ScoringConfig) => void;
  showMcq?: boolean;
  compact?: boolean;
}) {
  const [mcqOpen, setMcqOpen] = useState(false);

  const update = (field: keyof ScoringConfig, value: unknown) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {/* ── Marks inputs ── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Correct */}
        <div>
          <label className="text-[11px] font-medium text-emerald-600 mb-1 block">
            Correct
          </label>
          <input
            type="number"
            min={0}
            step={0.25}
            value={config.marks_correct}
            onChange={(e) => update("marks_correct", Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-foreground text-sm tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
          />
          {!compact && (
            <p className="text-[10px] text-muted-foreground/70 mt-1">Marks if answered right</p>
          )}
        </div>

        {/* Wrong */}
        <div>
          <label className="text-[11px] font-medium text-red-500 mb-1 block">
            Wrong
          </label>
          <input
            type="number"
            min={0}
            step={0.25}
            value={config.marks_wrong}
            onChange={(e) =>
              update("marks_wrong", Math.max(0, Math.min(Number(e.target.value), config.marks_correct)))
            }
            className="w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-foreground text-sm tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/40 transition-all"
          />
          {!compact && (
            <p className="text-[10px] text-muted-foreground/70 mt-1">Deducted if wrong · 0 = no penalty</p>
          )}
        </div>

        {/* Skipped */}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
            Skipped
          </label>
          <input
            type="number"
            min={0}
            step={0.25}
            value={config.marks_skipped}
            onChange={(e) =>
              update("marks_skipped", Math.max(0, Math.min(Number(e.target.value), config.marks_correct)))
            }
            className="w-full px-3 py-2 rounded-xl border border-border/70 bg-background text-foreground text-sm tabular-nums font-semibold focus:outline-none focus:ring-2 focus:ring-gray-400/20 focus:border-gray-400/40 transition-all"
          />
          {!compact && (
            <p className="text-[10px] text-muted-foreground/70 mt-1">Penalty for unanswered</p>
          )}
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
        <span>Students see</span>
        <MarksQuestionBadge config={config} />
      </div>

      {/* ── MCQ settings (collapsible) ── */}
      {showMcq && (
        <div className="rounded-xl border border-border/40 overflow-hidden bg-muted/5">
          <button
            onClick={() => setMcqOpen(!mcqOpen)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
          >
            <span className="text-xs font-medium text-muted-foreground">
              Multi-Correct (MCQ) Settings
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200 ${
                mcqOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <div
            className={`grid transition-all duration-200 ease-in-out ${
              mcqOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="px-4 pb-4 space-y-3.5 border-t border-border/20 pt-3">
                {/* Mode */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground flex items-center">
                    Mode
                    <Hint>
                      <p className="font-semibold text-white/90 mb-1">Scoring Mode</p>
                      <p><span className="text-purple-300 font-medium">Partial</span> — proportional marks per correct pick.</p>
                      <p className="mt-0.5"><span className="text-purple-300 font-medium">All-or-Nothing</span> — full marks only when every correct option is selected.</p>
                    </Hint>
                  </span>
                  <Segment
                    options={[
                      { value: "partial" as const, label: "Partial" },
                      { value: "all_or_nothing" as const, label: "All-or-Nothing" },
                    ]}
                    value={config.mcq_mode}
                    onChange={(v) => update("mcq_mode", v)}
                  />
                </div>

                {config.mcq_mode === "partial" && (
                  <>
                    {/* Penalty */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground flex items-center">
                        Penalty
                        <Hint>
                          <p className="font-semibold text-white/90 mb-1">Wrong-Answer Penalty</p>
                          <p><span className="text-purple-300 font-medium">Flat</span> — one fixed deduction, no matter how many wrong options are picked.</p>
                          <p className="mt-0.5"><span className="text-purple-300 font-medium">Per Option</span> — deduction × number of wrong options chosen.</p>
                        </Hint>
                      </span>
                      <Segment
                        options={[
                          { value: "flat" as const, label: "Flat" },
                          { value: "per_option" as const, label: "Per Option" },
                        ]}
                        value={config.mcq_wrong_penalty}
                        onChange={(v) => update("mcq_wrong_penalty", v)}
                      />
                    </div>

                    {/* Rounding */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground flex items-center">
                        Rounding
                        <Hint>
                          <p className="font-semibold text-white/90 mb-1">Partial Mark Rounding</p>
                          <p><span className="text-purple-300 font-medium">⌊ Floor</span> — 2.7 → 2</p>
                          <p className="mt-0.5"><span className="text-purple-300 font-medium">≈ Round</span> — 2.5 → 3</p>
                          <p className="mt-0.5"><span className="text-purple-300 font-medium">⌈ Ceil</span> — 2.1 → 3</p>
                          <p className="mt-0.5"><span className="text-purple-300 font-medium">Exact</span> — no rounding</p>
                        </Hint>
                      </span>
                      <Segment
                        options={[
                          { value: "floor" as const, label: "⌊ Floor" },
                          { value: "round" as const, label: "≈ Round" },
                          { value: "ceil" as const, label: "⌈ Ceil" },
                          { value: "none" as const, label: "Exact" },
                        ]}
                        value={config.rounding_strategy}
                        onChange={(v) => update("rounding_strategy", v)}
                      />
                    </div>

                    {/* Mini example */}
                    {config.marks_correct > 0 && (
                      <PartialPreview correct={config.marks_correct} rounding={config.rounding_strategy} />
                    )}
                  </>
                )}

                {config.mcq_mode === "all_or_nothing" && (
                  <div className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2.5 space-y-0.5">
                    <p>✓ All correct, 0 wrong → <span className="text-emerald-600 font-semibold">+{formatMarks(config.marks_correct)}</span></p>
                    <p>✗ Any wrong selected → <span className="text-red-500 font-semibold">−{formatMarks(config.marks_wrong)}</span></p>
                    <p>△ Some correct, 0 wrong → <span className="font-semibold">0</span></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Partial Credit Preview ──────────────────────────────────────────

function PartialPreview({ correct, rounding }: { correct: number; rounding: string }) {
  const n = 4;
  const rows = [];
  for (let k = 1; k <= n; k++) {
    const raw = k * (correct / n);
    let val = raw;
    if (rounding === "floor") val = Math.floor(raw * 100) / 100;
    else if (rounding === "round") val = Math.round(raw * 100) / 100;
    else if (rounding === "ceil") val = Math.ceil(raw * 100) / 100;
    rows.push({ k, marks: formatMarks(val) });
  }
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground/70 mb-2 flex items-center gap-1">
        <Info className="h-3 w-3" />
        Example: 4 correct options
      </p>
      <div className="flex gap-1.5">
        {rows.map(({ k, marks }) => (
          <div key={k} className="flex-1 text-center py-1.5 bg-background/80 rounded-lg">
            <div className="text-[10px] text-muted-foreground/60">{k}/{n}</div>
            <div className="text-xs font-bold text-emerald-600">+{marks}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export default function MarksConfigPanel({ examId, onClose, initialQuestionId, initialSectionId, onConfigChange }: MarksConfigPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialQuestionId ? "question" : "exam");
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [questionsList, setQuestionsList] = useState<
    { id: string; section_id: string; q_no: number; answer_type: string }[]
  >([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isMultiLang, setIsMultiLang] = useState(false);
  const [examDraft, setExamDraft] = useState<ScoringConfig & { show_marks_in_simulator: boolean }>({
    ...DEFAULT_SCORING_CONFIG,
    show_marks_in_simulator: true,
  });
  const [sectionDraft, setSectionDraft] = useState<ScoringConfig>({ ...DEFAULT_SCORING_CONFIG });
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set(initialQuestionId ? [initialQuestionId] : []));

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const questionIds = useMemo(() => questionsList.map((q) => q.id), [questionsList]);
  const questionSectionMap = useMemo(() => {
    const m = new Map<string, string>();
    questionsList.forEach((q) => m.set(q.id, q.section_id));
    return m;
  }, [questionsList]);

  const marks = useMarksModule(examId, sectionIds, questionIds, questionSectionMap);

  useEffect(() => {
    (async () => {
      // Fetch exam language info first so we only load primary-language sections
      const { data: examData } = await supabase
        .from("exams")
        .select("primary_language, supported_languages")
        .eq("id", examId)
        .single();

      const primaryLang: string = (examData as any)?.primary_language || "en";
      const supportedLangs: string[] = (examData as any)?.supported_languages || ["en"];
      const multi = supportedLangs.length > 1;
      setIsMultiLang(multi);

      // Only load primary-language sections for multi-lang exams
      let secQuery = supabase
        .from("sections")
        .select("id, name")
        .eq("exam_id", examId)
        .order("sort_order", { ascending: true });
      if (multi) {
        secQuery = (secQuery as any).eq("language", primaryLang);
      }

      const { data: secs } = await secQuery;
      if (secs) {
        setSections(secs);
        if (secs.length > 0 && !selectedSectionId) {
          // If a specific section was requested (deep-link), select it; otherwise select the first
          const targetSectionId = initialSectionId && secs.some(s => s.id === initialSectionId) ? initialSectionId : secs[0].id;
          setSelectedSectionId(targetSectionId);
        }
      }

      const { data: qs } = await supabase
        .from("parsed_questions").select("id, section_id, q_no, answer_type")
        .in("section_id", (secs || []).map((s) => s.id))
        .order("q_no", { ascending: true });
      if (qs) setQuestionsList(qs as any);
    })();
  }, [examId]);

  useEffect(() => {
    if (marks.examConfig) {
      setExamDraft({
        marks_correct: marks.examConfig.marks_correct,
        marks_wrong: marks.examConfig.marks_wrong,
        marks_skipped: marks.examConfig.marks_skipped,
        mcq_mode: marks.examConfig.mcq_mode,
        mcq_wrong_penalty: marks.examConfig.mcq_wrong_penalty,
        rounding_strategy: marks.examConfig.rounding_strategy,
        show_marks_in_simulator: marks.examConfig.show_marks_in_simulator,
      });
    }
  }, [marks.examConfig]);

  useEffect(() => {
    if (selectedSectionId && marks.sectionConfigs.has(selectedSectionId)) {
      setSectionDraft({ ...marks.sectionConfigs.get(selectedSectionId)! });
    } else if (marks.examConfig) {
      const { show_marks_in_simulator: _, ...rest } = marks.examConfig;
      setSectionDraft({ ...rest });
    } else {
      setSectionDraft({ ...DEFAULT_SCORING_CONFIG });
    }
  }, [selectedSectionId, marks.sectionConfigs, marks.examConfig]);

  // ── Actions ──

  const withSaving = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      onConfigChange?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveExamConfig = () => withSaving(async () => {
    await marks.updateExamConfig(examDraft);
    toast({ title: "✓ Saved", description: "Exam defaults updated." });
  });

  const saveSectionConfig = () => withSaving(async () => {
    await marks.updateSectionConfig(selectedSectionId, sectionDraft);
    toast({ title: "✓ Saved", description: "Section defaults updated." });
  });

  const handleApplyExamToAll = () => withSaving(async () => {
    // Auto-save exam defaults first
    await marks.updateExamConfig(examDraft);
    // Then apply the current draft to all questions
    const { show_marks_in_simulator: _, ...config } = examDraft;
    await marks.applyExamDefaultToAll(config as any);
    toast({ title: "✓ Applied", description: `Applied to all ${questionIds.length} questions.` });
  });

  const handleApplySectionToAll = () => withSaving(async () => {
    // Auto-save section defaults first
    await marks.updateSectionConfig(selectedSectionId, sectionDraft);
    // Then apply the current draft to all questions in section
    await marks.applySectionDefaultToAll(selectedSectionId, sectionDraft);
    const count = questionsList.filter((q) => q.section_id === selectedSectionId).length;
    toast({ title: "✓ Applied", description: `Applied to ${count} questions.` });
  });

  const handleSaveQuestionOverride = (questionId: string, config: ScoringConfig) =>
    withSaving(async () => {
      await marks.updateQuestionConfig(questionId, config);
      toast({ title: "✓ Saved", description: "Question override saved." });
    });

  const handleResetQuestion = (questionId: string) =>
    withSaving(async () => {
      await marks.removeQuestionConfig(questionId);
      toast({ title: "✓ Reset", description: "Now uses inherited defaults." });
    });

  const sectionQuestions = useMemo(
    () => questionsList.filter((q) => q.section_id === selectedSectionId),
    [questionsList, selectedSectionId]
  );

  if (marks.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm animate-pulse">
        Loading…
      </div>
    );
  }

  // Custom select style
  const selectClass = "w-full px-3.5 py-2.5 rounded-xl border border-border/70 bg-background text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#6C3EF4]/25 focus:border-[#6C3EF4]/50 transition-all appearance-none cursor-pointer";
  const selectBg = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" } as React.CSSProperties;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6C3EF4] to-[#A855F7] flex items-center justify-center shadow-sm">
          <Settings2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-foreground leading-tight">Marks & Scoring</h2>
          <p className="text-[11px] text-muted-foreground">
            {marks.totalMaxMarks > 0 ? `${formatMarks(marks.totalMaxMarks)} marks total` : "Configure scoring rules"}
          </p>
        </div>
      </div>

      {/* ── Global: Show during exam toggle ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/20">
        {examDraft.show_marks_in_simulator
          ? <Eye className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          : <EyeOff className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-tight flex items-center">
            Show marks during exam
            <Hint>When ON, students see +x/−y scoring badges next to each question while taking the exam. When OFF, marks are hidden during the exam but still shown in the review after submission.</Hint>
          </p>
        </div>
        <Switch
          checked={examDraft.show_marks_in_simulator}
          onCheckedChange={(v) => {
            setExamDraft((d) => ({ ...d, show_marks_in_simulator: v }));
            // Auto-save this toggle immediately
            marks.updateExamConfig({ ...examDraft, show_marks_in_simulator: v })
              .then(() => onConfigChange?.())
              .catch(() => {});
          }}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="px-5 pt-3 pb-0">
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-muted/40">
          {([
            { key: "exam" as Tab, label: "Exam" },
            { key: "section" as Tab, label: "Section" },
            { key: "question" as Tab, label: "Questions" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-semibold rounded-[10px] transition-all duration-200 ${
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6 space-y-5">

        {/* ═══ EXAM TAB ═══ */}
        {tab === "exam" && (
          <>
            {/* Contextual intro */}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Set the default scoring rules for your exam. These apply to all questions unless you override at section or question level.
            </p>

            {isMultiLang && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                  Marks are configured on the primary language and applied to all languages automatically during scoring.
                </p>
              </div>
            )}

            <ScoringForm
              config={examDraft}
              onChange={(c) => setExamDraft({ ...c, show_marks_in_simulator: examDraft.show_marks_in_simulator })}
            />

            {/* Actions */}
            <div className="flex gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleApplyExamToAll}
                      disabled={saving}
                      className="bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white gap-1.5 rounded-xl h-10 flex-1"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {saving
                        ? "Applying…"
                        : isMultiLang
                          ? `Apply to All Languages (${questionIds.length})`
                          : `Apply to All (${questionIds.length})`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {isMultiLang
                      ? "Save defaults & apply to all questions across every language"
                      : "Save defaults & apply to every question"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}

        {/* ═══ SECTION TAB ═══ */}
        {tab === "section" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Override scoring for a specific section. Useful when different sections have different difficulty levels.
            </p>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Section</label>
              <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} className={selectClass} style={selectBg}>
                {sections.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>

            <ScoringForm config={sectionDraft} onChange={setSectionDraft} />

            <div className="flex gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleApplySectionToAll}
                      disabled={saving}
                      className="bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white gap-1.5 rounded-xl h-10 flex-1"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {saving ? "Applying…" : `Apply to Section (${sectionQuestions.length})`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Save & apply to all questions in this section
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </>
        )}

        {/* ═══ QUESTION TAB ═══ */}
        {tab === "question" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Override scoring for individual questions. Tap a question to expand and configure.
            </p>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">Section</label>
              <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)} className={selectClass} style={selectBg}>
                {sections.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>

            <div className="space-y-1.5">
              {sectionQuestions.map((q) => {
                const hasOverride = marks.questionConfigs.has(q.id);
                const resolved = marks.resolveQuestionConfig(q.id, q.section_id);
                const isExpanded = expandedQuestions.has(q.id);

                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border transition-all duration-200 ${
                      isExpanded
                        ? "border-[#6C3EF4]/25 bg-[#6C3EF4]/[0.02] shadow-sm"
                        : "border-border/40 hover:border-border/70"
                    }`}
                  >
                    {/* Row */}
                    <div
                      className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer"
                      onClick={() => {
                        setExpandedQuestions((prev) => {
                          const next = new Set(prev);
                          next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="text-sm font-semibold text-foreground tabular-nums">Q{q.q_no}</span>
                        <span className="text-[10px] text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded font-medium">
                          {q.answer_type}
                        </span>
                        {hasOverride && (
                          <span className="text-[10px] text-[#6C3EF4] bg-[#6C3EF4]/10 px-1.5 py-0.5 rounded font-semibold">
                            custom
                          </span>
                        )}
                      </div>
                      <MarksQuestionBadge config={resolved} size="sm" />
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-border/20 space-y-4">
                        <QuestionOverrideForm
                          questionId={q.id}
                          answerType={q.answer_type}
                          currentConfig={marks.questionConfigs.get(q.id) ?? resolved ?? DEFAULT_SCORING_CONFIG}
                          hasOverride={hasOverride}
                          onSave={(c) => handleSaveQuestionOverride(q.id, c)}
                          onReset={() => handleResetQuestion(q.id)}
                          saving={saving}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {sectionQuestions.length === 0 && (
                <p className="text-sm text-muted-foreground/60 text-center py-10">No questions in this section</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-2.5 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Priority: Question → Section → Exam default
        </p>
      </div>
    </div>
  );
}

// ─── Per-Question Override Form ──────────────────────────────────────

function QuestionOverrideForm({
  questionId,
  answerType,
  currentConfig,
  hasOverride,
  onSave,
  onReset,
  saving,
}: {
  questionId: string;
  answerType: string;
  currentConfig: ScoringConfig;
  hasOverride: boolean;
  onSave: (config: ScoringConfig) => void;
  onReset: () => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<ScoringConfig>({ ...currentConfig });

  useEffect(() => {
    setDraft({ ...currentConfig });
  }, [currentConfig, questionId]);

  const isMcq = answerType === "multiple" || answerType === "multi";

  return (
    <>
      <ScoringForm config={draft} onChange={setDraft} compact showMcq={isMcq} />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onSave(draft)}
          disabled={saving}
          className="bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white text-xs rounded-xl gap-1.5 h-8"
        >
          <CheckCircle2 className="h-3 w-3" />
          {saving ? "Saving…" : "Save Override"}
        </Button>
        {hasOverride && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground h-8"
          >
            Reset to Default
          </Button>
        )}
      </div>
    </>
  );
}
