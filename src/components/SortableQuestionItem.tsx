import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SortableQuestionItemProps {
    id: string;
    children: React.ReactNode;
    disabled?: boolean;
}

export function SortableQuestionItem({ id, children, disabled = false }: SortableQuestionItemProps) {
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
            {!disabled && (
                <div className="mt-4" {...attributes} {...listeners}>
                    <Button variant="ghost" size="icon" className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-muted h-8 w-8">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                    </Button>
                </div>
            )}
            <div className="flex-1 min-w-0">
                {children}
            </div>
        </div>
    );
}
