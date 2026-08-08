/**
 * GenerateExamInstruction.tsx — "Generate from exam" on the Exam Instruction
 * field. One click and the field describes the paper as it actually is:
 * sections and their question counts, the timing model, what happens at zero,
 * the marking scheme, the question types, the languages. The creator edits the
 * result instead of transcribing facts the database already holds.
 *
 * Sibling of InstructionTemplateAction, same family on the label row, same
 * undo contract (useUndoableFill) — but a generator, not a template, which
 * changes two things:
 *
 *  • The text is computed at click time, not shipped in a file. What it says
 *    comes from examInstructionEngine; what it reads comes from the caller's
 *    `collectFacts`, because only the caller knows where its facts live (the
 *    editor fetches counts and marking from Supabase; the create dialog reads
 *    its own form state).
 *  • Collecting facts is async, so there is a moment where the button has been
 *    pressed and the field must not yet change. Two consequences, both here:
 *    a busy state that refuses re-entry, and an epoch guard so a fill that
 *    resolves after the creator switched language tabs is dropped rather than
 *    written into a field it was never asked about. The epoch bumps in a
 *    LAYOUT effect: a passive effect flushes a beat after the commit that
 *    changed the tab, and a network callback landing in that beat would pass a
 *    stale guard and write into the old tab's field behind the new tab's back.
 *
 * Deliberately NO "up to date" state, unlike the template's "Template
 * applied": the template can verify itself against the field synchronously,
 * but verifying generated text would need the same fetch that generation
 * needs. A checkmark that might be lying about a stale count is worse than a
 * button that regenerates on request — so once the Undo offer withdraws (the
 * creator edited, or undid), the control simply returns to rest.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { FILL_ACTION_CLASS, useUndoableFill } from "@/components/exam/useUndoableFill";
import { canGenerateFor, generateExamInstruction } from "@/lib/examInstructionEngine.js";

/** What the caller must gather for the engine. Mirrors the engine's JSDoc. */
export type ExamFacts = {
  sections: { name: string; minutes: number | null; questionCount: number | null }[];
  /** null = the creator has not chosen a mode yet (create dialog) — the engine
   * then says nothing that depends on it, rather than describing a default. */
  allowSectionSwitching: boolean | null;
  totalMinutes: number | null;
  marking: {
    correct: number;
    wrong: number;
    skipped: number;
    mcqMode: "partial" | "all_or_nothing";
    mcqWrongPenalty: "flat" | "per_option";
    uniform: boolean;
  } | null;
  scoredWithoutDefault?: boolean;
  answerTypes: Record<string, number> | null;
  languageNames: string[] | null;
};

type Props = {
  /** Language whose copy gets filled — the active tab in a translated editor. */
  lang: string;
  /** The field's current text. Needed for the undo snapshot and to notice edits. */
  value: string;
  /** Write the whole field. The caller decides which translation key that is. */
  onFill: (text: string) => void;
  /**
   * Gather the exam's facts. May hit the network (the editor does); may be
   * plain state (the dialog is). Throwing is fine — it becomes onError.
   */
  collectFacts: () => Promise<ExamFacts> | ExamFacts;
  /** Something to tell the creator when there is nothing to write or the fetch fails. */
  onError?: (message: string) => void;
  /**
   * Tooltip overrides, for callers whose facts can't deliver the default
   * promise — the create dialog has no marking scheme to write about yet, and
   * a tooltip promising one would be the small print lying.
   */
  titles?: { fill: string; replace: string };
};

const DEFAULT_TITLES = {
  fill: "Write these instructions from the exam itself — sections, timing, marking. You can edit the result.",
  replace:
    "Replace this text with instructions written from the exam itself — sections, timing, marking. You can undo.",
};

export default function GenerateExamInstruction({
  lang,
  value,
  onFill,
  collectFacts,
  onError,
  titles = DEFAULT_TITLES,
}: Props) {
  const { canUndo, fill, undo } = useUndoableFill({ lang, value, onFill });
  const [busy, setBusy] = useState(false);

  // A generation belongs to the language tab it was clicked on. Bumping the
  // epoch on tab switch (or unmount) orphans any in-flight collect, so its
  // fill is dropped instead of landing in a field it was never asked about.
  // Layout effect, not passive: the bump must be visible before any network
  // callback can run against the newly-committed lang.
  const epochRef = useRef(0);
  useLayoutEffect(() => {
    epochRef.current += 1;
    setBusy(false);
    return () => {
      epochRef.current += 1;
    };
  }, [lang]);

  // No copy pack for this language: no button — same rule as the template.
  if (!canGenerateFor(lang)) return null;

  const generate = async () => {
    if (busy) return;
    const epoch = epochRef.current;
    setBusy(true);
    try {
      const facts = await collectFacts();
      if (epoch !== epochRef.current) return;
      const text = generateExamInstruction(facts, lang);
      if (text === null) {
        onError?.("Nothing to describe yet — add a section or two first.");
        return;
      }
      fill(text);
    } catch {
      if (epoch !== epochRef.current) return;
      onError?.("Couldn't read the exam's details just now. Try again in a moment.");
    } finally {
      if (epoch === epochRef.current) setBusy(false);
    }
  };

  if (busy) {
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Writing…
      </span>
    );
  }

  // Generating is the action; Undo is at most a companion to it. It used to
  // REPLACE this button after a fill, which took the only useful control away at
  // the one moment a creator wants it — they have just seen the text and want it
  // written again against a paper they have since changed. Now the action always
  // stands, named for what it will do to a field that already has text.
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={generate}
        className={FILL_ACTION_CLASS}
        title={value.trim() ? titles.replace : titles.fill}
      >
        <Sparkles className="h-3 w-3" />
        {value.trim() ? "Regenerate" : "Generate from exam"}
      </button>
      {canUndo && (
        <button
          type="button"
          onClick={undo}
          className={`${FILL_ACTION_CLASS} text-muted-foreground hover:bg-muted hover:text-foreground`}
          title="Put back what was here before"
        >
          <RotateCcw className="h-3 w-3" />
          Undo
        </button>
      )}
    </span>
  );
}
