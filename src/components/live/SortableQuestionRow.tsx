/**
 * SortableQuestionRow.tsx — C7. Drag to reorder, without touching numbers.
 *
 * Question order is a real teaching decision: an easy one first to build
 * confidence, the hardest in the middle while attention peaks, a satisfying one
 * last. Until now expressing that meant editing q_no by hand, so most creators
 * accepted whatever order the import produced.
 *
 * Kept as a thin wrapper on purpose. It provides the drag handle and the
 * transform, and renders the existing row untouched as its child — the editor's
 * question row is dense and already carries error states, expansion and inline
 * editing, and reaching into it would have been the risky way to add a handle.
 *
 * The handle is a handle, not the whole row. Dragging from anywhere would fight
 * text selection and make the row's own buttons unreliable on touch.
 */

import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type SortableQuestionRowProps = {
  id: string;
  /** Reordering is editor-only; a live session's index points at a POSITION. */
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

export default function SortableQuestionRow({
  id,
  disabled = false,
  className = "",
  children,
}: SortableQuestionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      id={id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lifted above its neighbours while moving, so it never disappears behind
        // the next card in a dense list.
        zIndex: isDragging ? 20 : undefined,
      }}
      className={`relative ${isDragging ? "opacity-80 shadow-lg" : ""} ${className}`}
    >
      {!disabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder this question"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 cursor-grab touch-none rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/qlist:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}
