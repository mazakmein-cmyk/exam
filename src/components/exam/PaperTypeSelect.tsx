import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAPER_TYPES, paperTypeLabel } from "@/lib/paperType.js";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Trigger classes — the create dialog and the editor sidebar size fields differently. */
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * The paper type picker: is this a mock, or a real previous-year paper?
 *
 * Just the control — each call site supplies its own <Label>, the same way the
 * category combobox is used, because the dialog and the editor sidebar label
 * their fields at different sizes.
 *
 * Rendering this component at all is a decision the CALLER makes from
 * usePaperTypeAccess(): a creator without the grant must not see the field
 * anywhere, so there is deliberately no "read-only" or "locked" mode here to
 * reach for by accident.
 *
 * There is no empty option. The field is optional in the sense that matters —
 * nothing to fill in, no validation to fail — because an untouched picker
 * already says "Mock Exam", which is what an untagged paper is.
 */
export default function PaperTypeSelect({ value, onChange, className, disabled, id }: Props) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        {/* The trigger says the choice and nothing else. A childless <SelectValue>
            mirrors the WHOLE selected item — description included — which stacks
            two lines inside a one-line-high control and spills the hint out of
            the field. Naming the label as children keeps the description where
            it is useful (the open list) and, because an unknown key normalises
            to the default's label, the trigger can never read blank. */}
        <SelectValue placeholder="Mock Exam">{paperTypeLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
        {PAPER_TYPES.map((type) => (
          /* items-start keeps the tick on the label's line rather than floating
             between the two lines. `group` + group-focus is how the rest of the
             app writes a described option (see the question format picker): the
             highlighted row paints itself accent-purple, so a hint left on
             text-muted-foreground would sit unreadable on top of it. */
          <SelectItem key={type.value} value={type.value} className="group items-start py-2">
            <span className="flex flex-col gap-0.5 text-left">
              <span className="text-foreground group-focus:text-white">{type.label}</span>
              <span className="text-xs text-muted-foreground group-focus:text-white/80">
                {type.description}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
