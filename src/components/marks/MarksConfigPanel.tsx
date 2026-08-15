/**
 * MarksConfigPanel.tsx — Creator scoring configuration.
 *
 * Design principles
 * - Presets first, numbers second, edge cases last. Most creators never scroll past row one.
 * - Say what happens, not what the field is called: "A wrong answer costs 1 mark".
 * - Every number carries its sign where it is shown, so +4 and −1 can never be confused.
 * - Provenance over jargon: a question tells you where its rule came from, instead of
 *   making you decode "Question → Section → Exam".
 * - Destructive actions name their blast radius and ask once.
 *
 * Nothing here changes how marks are stored or scored — same hook calls, same payloads,
 * same inheritance chain (question → section → exam).
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
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
import {
  PRESETS,
  isDefaultMultiAnswer,
  matchPresetIndex,
  projectTotalMarks,
  questionRuleSource,
  round2,
  scoringEqual,
  toScoring,
} from "@/lib/marksDisplay.js";
import { renderMathInRichText } from "@/lib/renderMath";
import { MarksQuestionBadge } from "./MarksQuestionBadge";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Info,
  Scale,
  RotateCcw,
  Search,
} from "lucide-react";

// ─── Radix-based tooltip on a (?) icon ───────────────────────────────

function Hint({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-primary/70 hover:text-primary hover:bg-primary/10 transition-all duration-150 ml-1.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Info className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="max-w-[260px] px-3 py-2.5 text-xs leading-relaxed bg-[#1e1433] text-white border-none shadow-xl rounded-xl"
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
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-xl bg-muted/60 p-0.5 gap-px">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-[10px] transition-all duration-200 ${
            value === opt.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── A single signed marks field ─────────────────────────────────────

function MarkField({
  id,
  label,
  help,
  sign,
  value,
  step,
  onCommit,
  compact = false,
}: {
  id: string;
  label: string;
  help?: string;
  sign: "+" | "−";
  value: number;
  step: number;
  onCommit: (n: number) => void;
  compact?: boolean;
}) {
  const [raw, setRaw] = useState(() => formatMarks(value));
  const [focused, setFocused] = useState(false);

  // While the field has focus the person typing owns it; otherwise mirror the
  // real (already clamped) value so presets and clamps stay visible.
  useEffect(() => {
    if (!focused) setRaw(formatMarks(value));
  }, [value, focused]);

  const active = sign === "+" || value > 0;
  const signColor = sign === "+" ? "text-success" : active ? "text-destructive" : "text-muted-foreground/50";
  const ringColor = sign === "+" ? "focus-within:ring-success/25" : "focus-within:ring-destructive/20";

  const field = (
    <div
      className={`flex items-stretch h-9 rounded-xl border border-border/70 bg-background overflow-hidden transition-all focus-within:ring-2 ${ringColor} ${
        compact ? "w-full" : "w-[104px] shrink-0"
      }`}
    >
      <span className={`pl-2.5 pr-0.5 flex items-center text-sm font-bold tabular-nums ${signColor}`} aria-hidden="true">
        {sign}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.25}
        value={raw}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setRaw(formatMarks(value));
        }}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          if (next.trim() === "") return;
          const n = Number(next);
          if (Number.isFinite(n)) onCommit(n);
        }}
        className="flex-1 min-w-0 w-full bg-transparent px-0.5 text-sm font-bold tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col border-l border-border/60">
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onCommit(round2(value + step))}
          className="flex-1 px-1.5 flex items-center text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ChevronUp className="h-3 w-3" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onCommit(Math.max(0, round2(value - step)))}
          className="flex-1 px-1.5 flex items-center border-t border-border/60 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-[10px] font-semibold text-muted-foreground mb-1 block truncate">
          {label}
        </label>
        {field}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="text-[13px] font-semibold text-foreground block">
          {label}
        </label>
        {help && <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{help}</p>}
      </div>
      {field}
    </div>
  );
}

// ─── Plain-English restatement of the rule ───────────────────────────

function SchemeSentence({ config }: { config: ScoringConfig }) {
  const c = formatMarks(config.marks_correct);
  const w = formatMarks(config.marks_wrong);
  const s = formatMarks(config.marks_skipped);

  return (
    <p className="text-[12px] leading-relaxed text-foreground/85">
      Each right answer earns <strong className="text-success font-bold">+{c}</strong>.{" "}
      {config.marks_wrong > 0 ? (
        <>
          A wrong answer costs <strong className="text-destructive font-bold">{w}</strong>.
        </>
      ) : (
        <>A wrong answer costs <strong className="font-bold">nothing</strong>.</>
      )}{" "}
      {config.marks_skipped > 0 ? (
        <>
          Leaving a question blank costs <strong className="text-destructive font-bold">{s}</strong>.
        </>
      ) : (
        <>Skipping costs <strong className="font-bold">nothing</strong>.</>
      )}
    </p>
  );
}

// ─── Preset chips ────────────────────────────────────────────────────

function PresetRow({
  config,
  onPick,
}: {
  config: ScoringConfig;
  onPick: (p: { correct: number; wrong: number; skipped: number }) => void;
}) {
  const activeIdx = matchPresetIndex(config);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Common schemes
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {activeIdx === -1 ? "Custom scheme" : PRESETS[activeIdx].caption}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((p, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={`${p.correct}-${p.wrong}`}
              type="button"
              aria-pressed={isActive}
              onClick={() => onPick(p)}
              className={`rounded-xl border px-1 py-2 transition-all duration-150 ${
                isActive
                  ? "border-primary bg-primary/[0.07] shadow-sm"
                  : "border-border/60 hover:border-border hover:bg-muted/40"
              }`}
            >
              <div className="text-[13px] font-bold tabular-nums text-success leading-tight">
                +{formatMarks(p.correct)}
              </div>
              <div
                className={`text-[11px] font-semibold tabular-nums leading-tight ${
                  p.wrong > 0 ? "text-destructive" : "text-muted-foreground/60"
                }`}
              >
                {p.wrong > 0 ? `−${formatMarks(p.wrong)}` : "no −"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Part-marks worked example ───────────────────────────────────────

function PartialPreview({
  correct,
  wrong,
  rounding,
}: {
  correct: number;
  wrong: number;
  rounding: ScoringConfig["rounding_strategy"];
}) {
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
    <div className="bg-muted/40 rounded-xl px-3 py-2.5 space-y-2">
      <p className="text-[10px] text-muted-foreground/80">
        If a question has 4 correct options and the student picks only correct ones:
      </p>
      <div className="flex gap-1.5">
        {rows.map(({ k, marks }) => (
          <div key={k} className="flex-1 text-center py-1.5 bg-background/80 rounded-lg">
            <div className="text-[10px] text-muted-foreground/70">
              {k} of {n}
            </div>
            <div className="text-xs font-bold text-success tabular-nums">+{marks}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/80 pt-0.5 border-t border-border/40">
        Pick even one wrong option and part marks are gone —{" "}
        <span className={wrong > 0 ? "text-destructive font-semibold" : "font-semibold"}>
          {wrong > 0 ? `−${formatMarks(wrong)}` : "0"}
        </span>{" "}
        instead.
      </p>
    </div>
  );
}

// ─── Multi-answer settings (progressive disclosure) ──────────────────

function MultiAnswerSettings({
  config,
  update,
  multiAnswerCount,
}: {
  config: ScoringConfig;
  update: (field: keyof ScoringConfig, value: unknown) => void;
  multiAnswerCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const changed = !isDefaultMultiAnswer(config);

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-muted/[0.15]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="min-w-0">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            Questions with more than one right answer
            {changed && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-label="changed" />}
          </span>
          {/* The jargon lives here on purpose: a creator hunting for "MCQ" or
              "partial credit" must land on this row, not conclude it is gone. */}
          <span className="text-[10px] text-muted-foreground/80 block mt-0.5">
            {multiAnswerCount === undefined
              ? "Multi-correct (MCQ) — partial credit, penalty and rounding"
              : multiAnswerCount > 0
                ? `Multi-correct (MCQ) · ${multiAnswerCount} question${
                    multiAnswerCount === 1 ? "" : "s"
                  } in this exam`
                : "Multi-correct (MCQ) · no such question in this exam yet"}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground/60 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 space-y-3.5 border-t border-border/30 pt-3">
            {/* Part marks vs all-or-nothing */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-foreground flex items-center">
                Scoring mode
                <Hint label="About the scoring mode">
                  <p className="font-semibold text-white/90 mb-1">Scoring mode</p>
                  <p>
                    <span className="text-purple-300 font-medium">Part marks</span> (partial credit) — a share of the
                    marks for each correct option found.
                  </p>
                  <p className="mt-0.5">
                    <span className="text-purple-300 font-medium">All or nothing</span> — full marks only when every
                    correct option is selected.
                  </p>
                </Hint>
              </span>
              <Segment
                ariaLabel="Scoring for partly right answers"
                options={[
                  { value: "partial" as const, label: "Part marks" },
                  { value: "all_or_nothing" as const, label: "All or nothing" },
                ]}
                value={config.mcq_mode}
                onChange={(v) => update("mcq_mode", v)}
              />
            </div>

            {config.mcq_mode === "partial" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-foreground flex items-center">
                    Penalty
                    <Hint label="About the wrong-answer penalty">
                      <p className="font-semibold text-white/90 mb-1">Wrong-answer penalty</p>
                      <p>
                        <span className="text-purple-300 font-medium">Once</span> (flat) — one deduction, no matter how
                        many wrong options were picked.
                      </p>
                      <p className="mt-0.5">
                        <span className="text-purple-300 font-medium">Per wrong option</span> — the deduction is
                        multiplied by the number of wrong picks (never more than the question is worth).
                      </p>
                    </Hint>
                  </span>
                  <Segment
                    ariaLabel="How the penalty is charged"
                    options={[
                      { value: "flat" as const, label: "Once" },
                      { value: "per_option" as const, label: "Per wrong option" },
                    ]}
                    value={config.mcq_wrong_penalty}
                    onChange={(v) => update("mcq_wrong_penalty", v)}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-foreground flex items-center">
                    Rounding
                    <Hint label="About rounding of part marks">
                      <p className="font-semibold text-white/90 mb-1">Rounding of part marks</p>
                      <p>
                        When a share does not divide evenly (say 1 mark across 3 options = 0.3333), this decides the
                        second decimal place.
                      </p>
                      <p className="mt-0.5 text-white/70">
                        <span className="text-purple-300 font-medium">Down</span> (floor) 0.33 ·{" "}
                        <span className="text-purple-300 font-medium">Nearest</span> (round) 0.33 ·{" "}
                        <span className="text-purple-300 font-medium">Up</span> (ceil) 0.34 ·{" "}
                        <span className="text-purple-300 font-medium">Exact</span> 0.3333…
                      </p>
                    </Hint>
                  </span>
                  <Segment
                    ariaLabel="Rounding for uneven part marks"
                    options={[
                      { value: "floor" as const, label: "Down" },
                      { value: "round" as const, label: "Nearest" },
                      { value: "ceil" as const, label: "Up" },
                      { value: "none" as const, label: "Exact" },
                    ]}
                    value={config.rounding_strategy}
                    onChange={(v) => update("rounding_strategy", v)}
                  />
                </div>

                {config.marks_correct > 0 && (
                  <PartialPreview
                    correct={config.marks_correct}
                    wrong={config.marks_wrong}
                    rounding={config.rounding_strategy}
                  />
                )}
              </>
            )}

            {config.mcq_mode === "all_or_nothing" && (
              <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5 space-y-1">
                <p>
                  Every correct option, nothing wrong →{" "}
                  <span className="text-success font-bold">+{formatMarks(config.marks_correct)}</span>
                </p>
                <p>
                  Any wrong option picked →{" "}
                  <span className={config.marks_wrong > 0 ? "text-destructive font-bold" : "font-bold"}>
                    {config.marks_wrong > 0 ? `−${formatMarks(config.marks_wrong)}` : "0"}
                  </span>
                </p>
                <p>
                  Some correct options missed, nothing wrong → <span className="font-bold">0</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scoring form ────────────────────────────────────────────────────

function ScoringForm({
  idPrefix,
  config,
  onChange,
  showMultiAnswer = true,
  multiAnswerCount,
  compact = false,
}: {
  idPrefix: string;
  config: ScoringConfig;
  onChange: (config: ScoringConfig) => void;
  showMultiAnswer?: boolean;
  multiAnswerCount?: number;
  compact?: boolean;
}) {
  const update = (field: keyof ScoringConfig, value: unknown) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <PresetRow
          config={config}
          onPick={(p) =>
            onChange({
              ...config,
              marks_correct: p.correct,
              marks_wrong: p.wrong,
              marks_skipped: p.skipped,
            })
          }
        />
      )}

      {/* ── The three numbers ── */}
      {compact ? (
        <div className="grid grid-cols-3 gap-2">
          <MarkField
            compact
            id={`${idPrefix}-correct`}
            label="Right"
            sign="+"
            step={1}
            value={config.marks_correct}
            onCommit={(n) => update("marks_correct", Math.max(0, n))}
          />
          <MarkField
            compact
            id={`${idPrefix}-wrong`}
            label="Wrong"
            sign="−"
            step={0.25}
            value={config.marks_wrong}
            onCommit={(n) => update("marks_wrong", Math.max(0, Math.min(n, config.marks_correct)))}
          />
          <MarkField
            compact
            id={`${idPrefix}-skipped`}
            label="Blank"
            sign="−"
            step={0.25}
            value={config.marks_skipped}
            onCommit={(n) => update("marks_skipped", Math.max(0, Math.min(n, config.marks_correct)))}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 divide-y divide-border/40">
          <div className="px-3.5 py-3">
            <MarkField
              id={`${idPrefix}-correct`}
              label="Right answer"
              help="What the question is worth"
              sign="+"
              step={1}
              value={config.marks_correct}
              onCommit={(n) => update("marks_correct", Math.max(0, n))}
            />
          </div>
          <div className="px-3.5 py-3">
            <MarkField
              id={`${idPrefix}-wrong`}
              label="Wrong answer"
              help="Taken away for a wrong pick · keep 0 for no negative marking"
              sign="−"
              step={0.25}
              value={config.marks_wrong}
              onCommit={(n) => update("marks_wrong", Math.max(0, Math.min(n, config.marks_correct)))}
            />
          </div>
          <div className="px-3.5 py-3">
            <MarkField
              id={`${idPrefix}-skipped`}
              label="Left blank"
              help="Taken away for skipping · almost always 0"
              sign="−"
              step={0.25}
              value={config.marks_skipped}
              onCommit={(n) => update("marks_skipped", Math.max(0, Math.min(n, config.marks_correct)))}
            />
          </div>
        </div>
      )}

      {/* ── Restate it in words, then show the exact badge a student sees ── */}
      {!compact && (
        <div className="rounded-xl bg-primary/[0.05] border border-primary/15 px-3.5 py-3 space-y-2.5">
          <SchemeSentence config={config} />
          <div className="flex items-center gap-2.5 pt-2 border-t border-primary/10">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
              Student sees
            </span>
            <MarksQuestionBadge config={config} />
          </div>
        </div>
      )}

      {compact && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="shrink-0">Student sees</span>
          <MarksQuestionBadge config={config} size="sm" />
        </div>
      )}

      {showMultiAnswer && (
        <MultiAnswerSettings config={config} update={update} multiAnswerCount={multiAnswerCount} />
      )}
    </div>
  );
}

// ─── Save-state pill ─────────────────────────────────────────────────

function StatusPill({ state }: { state: "saving" | "unsaved" | "saved" | "new" }) {
  const map = {
    saving: { text: "Saving…", cls: "bg-muted text-muted-foreground" },
    unsaved: { text: "Unsaved changes", cls: "bg-warning/15 text-warning" },
    saved: { text: "Saved", cls: "bg-success/12 text-success" },
    new: { text: "Not set up yet", cls: "bg-muted text-muted-foreground" },
  } as const;
  const { text, cls } = map[state];

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cls}`}
    >
      {state === "saved" && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      {text}
    </span>
  );
}

// ─── Two-step destructive confirm ────────────────────────────────────

function ConfirmBar({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  busy,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/[0.07] p-3 space-y-2.5">
      <div className="flex gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-px" />
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-foreground leading-snug">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{body}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex-1 h-9 rounded-xl text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {busy ? "Applying…" : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="h-9 rounded-xl text-xs text-muted-foreground"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────

interface MarksConfigPanelProps {
  examId: string;
  onClose: () => void;
  initialQuestionId?: string;
  initialSectionId?: string;
  onConfigChange?: () => void;
}

type Tab = "exam" | "section" | "question";

export default function MarksConfigPanel({
  examId,
  initialQuestionId,
  initialSectionId,
  onConfigChange,
}: MarksConfigPanelProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialQuestionId ? "question" : "exam");
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [questionsList, setQuestionsList] = useState<
    { id: string; section_id: string; q_no: number; answer_type: string; text: string }[]
  >([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isMultiLang, setIsMultiLang] = useState(false);
  const [examDraft, setExamDraft] = useState<ScoringConfig & { show_marks_in_simulator: boolean }>({
    ...DEFAULT_SCORING_CONFIG,
    show_marks_in_simulator: true,
  });
  const [sectionDraft, setSectionDraft] = useState<ScoringConfig>({ ...DEFAULT_SCORING_CONFIG });
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(
    new Set(initialQuestionId ? [initialQuestionId] : [])
  );
  const [confirming, setConfirming] = useState<null | "exam" | "section">(null);
  const [questionQuery, setQuestionQuery] = useState("");
  const [customOnly, setCustomOnly] = useState(false);
  const scrolledToDeepLink = useRef(false);

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
          const targetSectionId =
            initialSectionId && secs.some((s) => s.id === initialSectionId) ? initialSectionId : secs[0].id;
          setSelectedSectionId(targetSectionId);
        }
      }

      const { data: qs } = await supabase
        .from("parsed_questions")
        .select("id, section_id, q_no, answer_type, text")
        .in("section_id", (secs || []).map((s) => s.id))
        .order("q_no", { ascending: true });
      if (qs) setQuestionsList(qs as any);
    })();
  }, [examId]);

  useEffect(() => {
    if (marks.examConfig) {
      setExamDraft({
        ...toScoring(marks.examConfig),
        show_marks_in_simulator: marks.examConfig.show_marks_in_simulator,
      });
    }
  }, [marks.examConfig]);

  useEffect(() => {
    if (selectedSectionId && marks.sectionConfigs.has(selectedSectionId)) {
      setSectionDraft({ ...marks.sectionConfigs.get(selectedSectionId)! });
    } else if (marks.examConfig) {
      setSectionDraft(toScoring(marks.examConfig));
    } else {
      setSectionDraft({ ...DEFAULT_SCORING_CONFIG });
    }
  }, [selectedSectionId, marks.sectionConfigs, marks.examConfig]);

  // ── Derived state ──

  const examStored: ScoringConfig | null = useMemo(
    () => (marks.examConfig ? toScoring(marks.examConfig) : null),
    [marks.examConfig]
  );

  const sectionStored = selectedSectionId ? marks.sectionConfigs.get(selectedSectionId) ?? null : null;

  const examDirty =
    !marks.examConfig ||
    !scoringEqual(toScoring(examDraft), examStored) ||
    examDraft.show_marks_in_simulator !== marks.examConfig.show_marks_in_simulator;

  const sectionDirty = sectionStored
    ? !scoringEqual(sectionDraft, sectionStored)
    : !scoringEqual(sectionDraft, examStored ?? DEFAULT_SCORING_CONFIG);

  const sectionQuestions = useMemo(
    () => questionsList.filter((q) => q.section_id === selectedSectionId),
    [questionsList, selectedSectionId]
  );

  const sectionQuestionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of questionsList) m.set(q.section_id, (m.get(q.section_id) ?? 0) + 1);
    return m;
  }, [questionsList]);

  const multiAnswerCount = useMemo(
    () => questionsList.filter((q) => q.answer_type === "multiple" || q.answer_type === "multi").length,
    [questionsList]
  );

  /** A question is "custom" only when its stored rule actually differs from what it would inherit. */
  const ruleSource = useMemo(
    () => (questionId: string, sectionId: string) =>
      questionRuleSource(questionId, sectionId, marks.questionConfigs, marks.sectionConfigs, examStored),
    [marks.questionConfigs, marks.sectionConfigs, examStored]
  );

  const customQuestionCount = useMemo(
    () => questionsList.filter((q) => ruleSource(q.id, q.section_id) === "custom").length,
    [questionsList, ruleSource]
  );

  const customSectionCount = useMemo(
    () =>
      sections.filter((s) => {
        const sc = marks.sectionConfigs.get(s.id);
        return !!sc && !scoringEqual(sc, examStored);
      }).length,
    [sections, marks.sectionConfigs, examStored]
  );

  /** Total marks the exam would be worth if the drafts on screen were saved. */
  const projectedTotal = useMemo(() => {
    return projectTotalMarks(
      questionsList,
      marks.questionConfigs,
      marks.sectionConfigs,
      examDraft.marks_correct,
      tab === "section" && selectedSectionId ? { sectionId: selectedSectionId, config: sectionDraft } : null
    );
  }, [
    questionsList,
    marks.questionConfigs,
    marks.sectionConfigs,
    examDraft.marks_correct,
    sectionDraft,
    selectedSectionId,
    tab,
  ]);

  const visibleQuestions = useMemo(() => {
    const needle = questionQuery.trim().toLowerCase();
    return sectionQuestions.filter((q) => {
      if (customOnly && ruleSource(q.id, q.section_id) !== "custom") return false;
      if (!needle) return true;
      return `q${q.q_no}`.includes(needle) || String(q.q_no) === needle || (q.text || "").toLowerCase().includes(needle);
    });
  }, [sectionQuestions, questionQuery, customOnly, ruleSource]);

  const status: "saving" | "unsaved" | "saved" | "new" = saving
    ? "saving"
    : tab === "section"
      ? sectionDirty
        ? "unsaved"
        : "saved"
      : !marks.examConfig
        ? "new"
        : examDirty
          ? "unsaved"
          : "saved";

  // ── Actions (identical payloads to before) ──

  const withSaving = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      onConfigChange?.();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveExamConfig = () =>
    withSaving(async () => {
      await marks.updateExamConfig(examDraft);
      toast({ title: "✓ Saved", description: "Every question without its own rule now uses this." });
    });

  const saveSectionConfig = () =>
    withSaving(async () => {
      await marks.updateSectionConfig(selectedSectionId, sectionDraft);
      toast({ title: "✓ Saved", description: "This section's rule is set." });
    });

  const handleApplyExamToAll = () =>
    withSaving(async () => {
      // Auto-save exam defaults first
      await marks.updateExamConfig(examDraft);
      // Then apply the current draft to all questions
      await marks.applyExamDefaultToAll(toScoring(examDraft));
      setConfirming(null);
      toast({ title: "✓ Applied", description: `All ${questionIds.length} questions now use this rule.` });
    });

  const handleApplySectionToAll = () =>
    withSaving(async () => {
      // Auto-save section defaults first
      await marks.updateSectionConfig(selectedSectionId, sectionDraft);
      // Then apply the current draft to all questions in section
      await marks.applySectionDefaultToAll(selectedSectionId, sectionDraft);
      setConfirming(null);
      toast({
        title: "✓ Applied",
        description: `All ${sectionQuestions.length} questions in this section now use this rule.`,
      });
    });

  const handleSaveQuestionOverride = (questionId: string, config: ScoringConfig) =>
    withSaving(async () => {
      await marks.updateQuestionConfig(questionId, config);
      toast({ title: "✓ Saved", description: "This question has its own rule now." });
    });

  const handleResetQuestion = (questionId: string) =>
    withSaving(async () => {
      await marks.removeQuestionConfig(questionId);
      toast({ title: "✓ Reset", description: "Back to the inherited rule." });
    });

  if (marks.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm animate-pulse">
        Loading marks…
      </div>
    );
  }

  const selectClass =
    "w-full px-3.5 py-2.5 rounded-xl border border-border/70 bg-background text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all appearance-none cursor-pointer";
  const selectBg = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
  } as React.CSSProperties;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "exam", label: "Exam default" },
    { key: "section", label: "Sections", count: customSectionCount },
    { key: "question", label: "Questions", count: customQuestionCount },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Header: what the exam is worth, right now ── */}
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6C3EF4] to-[#A855F7] flex items-center justify-center shadow-sm shrink-0">
            <Scale className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-foreground leading-tight">Marks &amp; scoring</h2>
            <p className="text-[11px] text-muted-foreground">
              {questionsList.length} question{questionsList.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-foreground/80 tabular-nums">
                {formatMarks(projectedTotal)} marks
              </span>{" "}
              total
            </p>
          </div>
          <StatusPill state={status} />
        </div>
      </div>

      {/* ── Student visibility: exam-wide, so it stays put on every tab ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border/20">
        <Eye
          className={`h-4 w-4 shrink-0 ${
            examDraft.show_marks_in_simulator ? "text-success" : "text-muted-foreground/40"
          }`}
        />
        <label htmlFor="show-marks-toggle" className="flex-1 min-w-0 cursor-pointer">
          <span className="text-[12px] font-semibold text-foreground leading-tight block">
            Show marks to students during the exam
          </span>
          <span className="text-[11px] text-muted-foreground leading-snug block">
            {examDraft.show_marks_in_simulator
              ? "The +4 / −1 badge sits on every question as they attempt it."
              : "Hidden while attempting — still shown in the review after they submit."}
          </span>
        </label>
        <Switch
          id="show-marks-toggle"
          checked={examDraft.show_marks_in_simulator}
          onCheckedChange={(v) => {
            setExamDraft((d) => ({ ...d, show_marks_in_simulator: v }));
            // Auto-save this toggle immediately
            marks
              .updateExamConfig({ ...examDraft, show_marks_in_simulator: v })
              .then(() => onConfigChange?.())
              .catch(() => {});
          }}
        />
      </div>

      {/* ── Scope tabs ── */}
      <div className="px-5 pt-3 pb-0">
        <div role="tablist" aria-label="Scoring scope" className="flex gap-0.5 p-0.5 rounded-xl bg-muted/40">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setConfirming(null);
              }}
              className={`flex-1 py-2 text-[11px] font-semibold rounded-[10px] transition-all duration-200 flex items-center justify-center gap-1.5 ${
                tab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {!!count && (
                <span className="px-1.5 py-px rounded-full bg-primary/12 text-primary text-[9px] font-bold tabular-nums">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 space-y-4">
        {/* ═══ EXAM TAB ═══ */}
        {tab === "exam" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The base rule for the whole paper. Every question follows it unless its section or the question itself
              says otherwise.
            </p>

            {isMultiLang && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                  Set marks once, in the primary language. Every other language is scored with the same rule.
                </p>
              </div>
            )}

            <ScoringForm
              idPrefix="exam"
              config={examDraft}
              multiAnswerCount={multiAnswerCount}
              onChange={(c) => setExamDraft({ ...c, show_marks_in_simulator: examDraft.show_marks_in_simulator })}
            />

          </>
        )}

        {/* ═══ SECTION TAB ═══ */}
        {tab === "section" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Give one section a different rule — useful when a section is harder or carries more weight.
            </p>

            <div>
              <label htmlFor="section-picker" className="text-[11px] font-semibold text-muted-foreground mb-1.5 block">
                Section
              </label>
              <select
                id="section-picker"
                value={selectedSectionId}
                onChange={(e) => {
                  setSelectedSectionId(e.target.value);
                  setConfirming(null);
                }}
                className={selectClass}
                style={selectBg}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {sectionQuestionCounts.get(s.id) ?? 0} questions
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
                {sectionStored
                  ? "This section has its own rule."
                  : "This section currently follows the exam default. Change a number below to give it its own rule."}
              </p>
            </div>

            <ScoringForm
              idPrefix="section"
              config={sectionDraft}
              multiAnswerCount={multiAnswerCount}
              onChange={setSectionDraft}
            />
          </>
        )}

        {/* ═══ QUESTION TAB ═══ */}
        {tab === "question" && (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Fine-tune one question. A question's own rule beats its section and the exam default.
            </p>

            <div>
              <label
                htmlFor="section-picker-q"
                className="text-[11px] font-semibold text-muted-foreground mb-1.5 block"
              >
                Section
              </label>
              <select
                id="section-picker-q"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className={selectClass}
                style={selectBg}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {sectionQuestionCounts.get(s.id) ?? 0} questions
                  </option>
                ))}
              </select>
            </div>

            {/* Find a question fast */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <input
                  type="text"
                  value={questionQuery}
                  onChange={(e) => setQuestionQuery(e.target.value)}
                  placeholder="Find a question…"
                  aria-label="Find a question"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border/70 bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all"
                />
              </div>
              <button
                type="button"
                aria-pressed={customOnly}
                onClick={() => setCustomOnly((v) => !v)}
                className={`px-3 py-2 rounded-xl text-[11px] font-semibold border transition-all whitespace-nowrap ${
                  customOnly
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                Custom only
              </button>
            </div>

            <div className="space-y-1.5">
              {visibleQuestions.map((q) => {
                const stored = marks.questionConfigs.get(q.id);
                const hasOverride = !!stored;
                const resolved = marks.resolveQuestionConfig(q.id, q.section_id);
                const isExpanded = expandedQuestions.has(q.id);
                const source = ruleSource(q.id, q.section_id);

                return (
                  <div
                    key={q.id}
                    ref={(el) => {
                      if (el && !scrolledToDeepLink.current && q.id === initialQuestionId) {
                        scrolledToDeepLink.current = true;
                        el.scrollIntoView({ block: "center" });
                      }
                    }}
                    className={`rounded-xl border transition-all duration-200 ${
                      isExpanded
                        ? "border-primary/25 bg-primary/[0.02] shadow-sm"
                        : "border-border/40 hover:border-border/70"
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left"
                      onClick={() => {
                        setExpandedQuestions((prev) => {
                          const next = new Set(prev);
                          if (next.has(q.id)) next.delete(q.id);
                          else next.add(q.id);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-foreground tabular-nums">Q{q.q_no}</span>
                            {/* Every question shows its answer type — it is what decides
                                whether the multi-correct settings below even apply. */}
                            <span
                              className={`text-[9px] px-1.5 py-px rounded font-semibold ${
                                q.answer_type === "multiple" || q.answer_type === "multi"
                                  ? "text-primary bg-primary/10"
                                  : "text-muted-foreground/70 bg-muted/50"
                              }`}
                            >
                              {q.answer_type}
                            </span>
                            {/* "from exam" is the baseline and stays silent — a chip on
                                every row would be 85 labels carrying no signal. */}
                            {source === "custom" && (
                              <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-px rounded font-bold uppercase tracking-wide">
                                custom
                              </span>
                            )}
                            {source === "own" && (
                              <span className="text-[9px] text-muted-foreground/70 font-medium">own rule</span>
                            )}
                            {source === "section" && (
                              <span className="text-[9px] text-muted-foreground/70 font-medium">from section</span>
                            )}
                            {source === "none" && (
                              <span className="text-[9px] text-warning font-semibold">not scored</span>
                            )}
                          </div>
                          {/* Same renderer the rest of the app uses — this field holds
                              LaTeX and editor HTML, so printing it raw shows source.
                              Display math and images are flattened to keep the row one line. */}
                          {q.text && (
                            <p
                              className="text-[11px] text-muted-foreground/70 truncate max-w-[190px] mt-0.5 [&_.katex-display]:inline [&_.katex-display]:m-0 [&_img]:hidden"
                              dangerouslySetInnerHTML={{ __html: renderMathInRichText(q.text) }}
                            />
                          )}
                        </div>
                      </div>
                      <MarksQuestionBadge config={resolved} size="sm" />
                    </button>

                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-3 border-t border-border/20 space-y-3">
                        {/* The old panel hid this behind an eye toggle. You are editing
                            this question's marks — the question itself should be on screen. */}
                        {q.text && (
                          <div
                            className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40 line-clamp-3 [&_img]:max-h-16 [&_img]:inline"
                            dangerouslySetInnerHTML={{ __html: renderMathInRichText(q.text) }}
                          />
                        )}
                        <QuestionOverrideForm
                          questionId={q.id}
                          answerType={q.answer_type}
                          currentConfig={stored ?? resolved ?? DEFAULT_SCORING_CONFIG}
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

              {visibleQuestions.length === 0 && (
                <p className="text-xs text-muted-foreground/70 text-center py-10">
                  {sectionQuestions.length === 0
                    ? "No questions in this section yet."
                    : customOnly
                      ? "No question in this section has its own rule."
                      : "No question matches that search."}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Footer actions ── */}
      <div className="border-t border-border/20 px-5 py-3 space-y-2 bg-background">
        {tab === "exam" && (
          <>
            {confirming === "exam" ? (
              <ConfirmBar
                title={`Give all ${questionIds.length} questions this exact rule?`}
                body={
                  customQuestionCount > 0
                    ? `${customQuestionCount} question${
                        customQuestionCount === 1 ? " has its own rule and will be" : "s have their own rules and will be"
                      } overwritten. This cannot be undone.`
                    : `Every question gets pinned to this rule${
                        isMultiLang ? ", in every language," : ""
                      }, so section rules stop applying to them.`
                }
                confirmLabel={`Yes, apply to all ${questionIds.length}`}
                busy={saving}
                onCancel={() => setConfirming(null)}
                onConfirm={handleApplyExamToAll}
              />
            ) : (
              <>
                <Button
                  type="button"
                  onClick={saveExamConfig}
                  disabled={saving || !examDirty}
                  className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                >
                  {saving ? "Saving…" : examDirty ? "Save exam default" : "Saved"}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirming("exam")}
                  disabled={saving || questionIds.length === 0}
                  className="w-full text-center text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground/70 py-0.5"
                >
                  Overwrite all {questionIds.length} questions with this rule
                  {isMultiLang ? " (every language)" : ""}
                </button>
              </>
            )}
          </>
        )}

        {tab === "section" && (
          <>
            {confirming === "section" ? (
              <ConfirmBar
                title={`Give all ${sectionQuestions.length} questions in this section this exact rule?`}
                body="Any question in this section with its own rule will be overwritten. This cannot be undone."
                confirmLabel={`Yes, apply to ${sectionQuestions.length}`}
                busy={saving}
                onCancel={() => setConfirming(null)}
                onConfirm={handleApplySectionToAll}
              />
            ) : (
              <>
                <Button
                  type="button"
                  onClick={saveSectionConfig}
                  disabled={saving || !selectedSectionId || !sectionDirty}
                  className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                >
                  {saving ? "Saving…" : sectionDirty ? "Save section rule" : "Saved"}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirming("section")}
                  disabled={saving || sectionQuestions.length === 0}
                  className="w-full text-center text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground/70 py-0.5"
                >
                  Overwrite this section's {sectionQuestions.length} questions with this rule
                </button>
              </>
            )}
          </>
        )}

        {/* The inheritance chain the old footer spelled as "Question → Section → Exam",
            in words, and on every tab rather than only one. */}
        <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed pt-0.5">
          A question uses its own rule first, then its section's, then the exam default.
        </p>
      </div>
    </div>
  );
}

// ─── Per-question override form ──────────────────────────────────────

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

  const isMulti = answerType === "multiple" || answerType === "multi";
  const dirty = !scoringEqual(draft, currentConfig);

  return (
    <>
      <ScoringForm
        idPrefix={`q-${questionId}`}
        config={draft}
        onChange={setDraft}
        compact
        showMultiAnswer={isMulti}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(draft)}
          disabled={saving || (!dirty && hasOverride)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-xl gap-1.5 h-8"
        >
          <Check className="h-3 w-3" strokeWidth={3} />
          {saving ? "Saving…" : "Save for this question"}
        </Button>
        {hasOverride && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground h-8 gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            Use inherited rule
          </Button>
        )}
      </div>
    </>
  );
}
