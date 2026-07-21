import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SortableSectionItemProps {
    id: string;
    children: React.ReactNode;
}

export function SortableSectionItem({ id, children }: SortableSectionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative flex items-start gap-2">
            <div className="mt-3" {...attributes} {...listeners}>
                <Button variant="ghost" size="icon" className="cursor-grab active:cursor-grabbing rounded-lg hover:bg-muted h-6 w-6">
                    <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                </Button>
            </div>
            <div className="flex-1 min-w-0">
                {children}
            </div>
        </div>
    );
}
