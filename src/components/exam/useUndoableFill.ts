/**
 * useUndoableFill.ts — the undo state machine behind every "fill this field
 * for me" button (the General Instruction template, the Exam Instruction
 * generator, whatever comes next).
 *
 * Extracted rather than duplicated because this is a safety mechanism: it is
 * what makes replacing a required field's text without a confirm dialog
 * defensible. Two buttons with two slightly-different copies of it would drift,
 * and the drift would be invisible until someone lost a paragraph.
 *
 * The contract, in full:
 *
 *  • fill(text) snapshots the field's value FIRST, then writes. The snapshot
 *    is read from a ref at write time, not from the closure that captured the
 *    click — a generator awaits the network between click and write, and
 *    anything typed during that flight belongs in the snapshot, not in the
 *    bin. Taken after the write, the "restore point" would be the new text
 *    and Undo would do nothing.
 *  • While the snapshot is held, the caller renders an Undo button; undo()
 *    writes the snapshot back and forgets it.
 *  • The offer withdraws itself on the first edit to the filled text. From
 *    then on Undo would discard the creator's words to restore ours — the same
 *    label doing the opposite thing.
 *  • There is deliberately NO timed expiry. The edit-withdrawal rule already
 *    guarantees a held offer can only ever restore into a field that still
 *    contains exactly the filled text — an old Undo is always correct, so a
 *    timer buys no safety. What it would buy is permanent loss: the replaced
 *    draft exists nowhere else, and a quiet 12-second fuse under the only way
 *    back is how "you can undo" becomes a lie.
 *  • Switching language tab forgets everything: a snapshot belongs to one
 *    translation, and restoring it into another field writes text that was
 *    never there.
 */
import { useEffect, useRef, useState } from "react";

/**
 * The one look shared by every fill-action trigger, so the label row reads as
 * a family: quiet text buttons that never fight the field below them.
 */
export const FILL_ACTION_CLASS =
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none";

type Args = {
  /** Which translation the field currently shows — the active language tab. */
  lang: string;
  /** The field's current text, live. Needed to notice the creator's edits. */
  value: string;
  /** Write the whole field. The caller decides which translation key that is. */
  onFill: (text: string) => void;
};

export function useUndoableFill({ lang, value, onFill }: Args) {
  // The text we put in the box, and what was there before it. Both null once
  // there is nothing to undo.
  const [filled, setFilled] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  // The field's value as of the latest render — what fill() snapshots. An
  // async caller's closure holds the value from the render it was created in;
  // by the time its await resolves, edits typed mid-flight have re-rendered
  // and this ref has them.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const forget = () => {
    setFilled(null);
    setPrevious(null);
  };

  // Their edit ends our offer — see the header note.
  useEffect(() => {
    if (filled !== null && value !== filled) forget();
  }, [value, filled]);

  // A snapshot never crosses a language tab.
  useEffect(forget, [lang]);

  const fill = (text: string) => {
    setPrevious(valueRef.current);
    setFilled(text);
    onFill(text);
  };

  const undo = () => {
    onFill(previous ?? "");
    forget();
  };

  return {
    /** True while Undo should be the button. */
    canUndo: filled !== null,
    fill,
    undo,
  };
}
