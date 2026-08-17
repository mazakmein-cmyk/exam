import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAPER_TYPES } from "@/lib/paperType.js";

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
        <SelectValue placeholder="Mock Exam" />
      </SelectTrigger>
      <SelectContent>
        {PAPER_TYPES.map((type) => (
          <SelectItem key={type.value} value={type.value}>
            <span className="flex flex-col text-left">
              <span>{type.label}</span>
              <span className="text-xs text-muted-foreground">{type.description}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
