/**
 * InstructionTemplateAction.tsx — "Use template" on the General Instruction
 * field: one click fills it with standard boilerplate the creator then edits.
 *
 * Why this is not a toggle
 * -----------------------
 * A switch was the obvious first idea and it is the wrong control, because a
 * switch promises a *lasting* binding and this cannot keep one:
 *
 *  • The whole point is that the text is editable after filling. The moment the
 *    creator changes a word, a switch still reading ON is describing something
 *    that is no longer true.
 *  • Switching it OFF has no honest meaning. Clear the field? Restore whatever
 *    was there before? Put the template back the way it was? Every answer
 *    surprises somebody, and this is a required field — a control that might
 *    silently empty it is a control people learn not to touch.
 *  • Two states implies the OFF state does something. It doesn't. There is one
 *    action here: put text in the box.
 *
 * So: a one-shot action, sitting on the label row where it costs no vertical
 * space and is unmistakably about the field below it. Three states, each of
 * which tells the truth about what a click will do:
 *
 *      empty field   →  [ Use template ]        fill it
 *      has text      →  [ Use template ]        replace it, then offer Undo
 *      is the template → [ ✓ Template applied ] nothing; not clickable
 *
 * Replacing without a confirm dialog is safe *because* of the Undo — the full
 * contract (snapshot-first, self-withdrawing offer, per-language) lives in
 * useUndoableFill, shared with the Exam Instruction generator.
 */
import { Check, FileText, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FILL_ACTION_CLASS, useUndoableFill } from "@/components/exam/useUndoableFill";
import {
  GENERAL_INSTRUCTION_TEMPLATES,
  matchesTemplate,
  templateText,
  templatesForLanguage,
  type InstructionTemplate,
} from "@/lib/instructionTemplates";

type Props = {
  /** Language whose copy gets filled — the active tab in a translated editor. */
  lang: string;
  /** The field's current text. Needed to tell fill from replace, and to notice edits. */
  value: string;
  /** Write the whole field. The caller decides which translation key that is. */
  onFill: (text: string) => void;
  /** Override for tests; defaults to the shipped list. */
  templates?: InstructionTemplate[];
};

export default function InstructionTemplateAction({
  lang,
  value,
  onFill,
  templates = GENERAL_INSTRUCTION_TEMPLATES,
}: Props) {
  const { canUndo, fill, undo } = useUndoableFill({ lang, value, onFill });

  const available = templatesForLanguage(templates, lang);

  const apply = (template: InstructionTemplate) => {
    const text = templateText(template, lang);
    if (text !== null) fill(text);
  };

  // No copy for this language: no button. Better than filling English text into
  // the Hindi field and leaving the creator to spot it.
  if (available.length === 0) return null;

  if (canUndo) {
    return (
      <button type="button" onClick={undo} className={FILL_ACTION_CLASS} title="Put back what was here before">
        <RotateCcw className="h-3 w-3" />
        Undo
      </button>
    );
  }

  if (matchesTemplate(available, lang, value)) {
    return (
      <span
        className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-muted-foreground"
        // Not a disabled button: there is no action here to be temporarily
        // unavailable, so it should not be reachable by tab or look pressable.
      >
        <Check className="h-3 w-3" />
        Template applied
      </span>
    );
  }

  // One template is the common case and deserves the shorter path — a menu of
  // one is a click spent on a decision nobody has.
  if (available.length === 1) {
    return (
      <button
        type="button"
        onClick={() => apply(available[0])}
        className={FILL_ACTION_CLASS}
        title={
          value.trim()
            ? "Replace this text with the standard instructions — you can undo"
            : "Fill in the standard instructions, then edit them"
        }
      >
        <FileText className="h-3 w-3" />
        Use template
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={FILL_ACTION_CLASS}>
          <FileText className="h-3 w-3" />
          Use template
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {available.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onSelect={() => apply(template)}
            className="flex-col items-start gap-0.5"
          >
            <span className="text-xs font-semibold">{template.label}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              {template.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
