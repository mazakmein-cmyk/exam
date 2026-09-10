import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SortableSectionItemProps {
    id: string;
    children: React.ReactNode;
    /**
     * Section structure is decided in the primary language only; a secondary
     * tab shows the same order read-only. Mirrors SortableQuestionItem, which
     * has had this since questions were locked the same way.
     */
    disabled?: boolean;
}

export function SortableSectionItem({ id, children, disabled = false }: SortableSectionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative flex items-start gap-2">
            {disabled ? (
                // Keep the grip's footprint so rows line up with the primary tab.
                <div className="mt-3 h-6 w-6 shrink-0" aria-hidden="true" />
            ) : (
                <div className="mt-3" {...attributes} {...listeners}>
                    <Button variant="ghost" size="icon" className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-muted h-6 w-6">
                        <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                    </Button>
                </div>
            )}
            <div className="flex-1 min-w-0">
                {children}
            </div>
        </div>
    );
}
