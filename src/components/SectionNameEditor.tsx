import { useLayoutEffect, useRef } from "react";
import { TransliterateTextarea } from "@/components/TransliterateTextarea";
import { cn } from "@/lib/utils";

interface SectionNameEditorProps {
    lang?: string;
    value: string;
    onValueChange: (value: string) => void;
    /** Fired on blur (Enter also blurs) with the final value. */
    onCommit: (value: string) => void;
    className?: string;
}

/**
 * Inline section-name editor for the sections sidebar. A single-line input
 * clips long names, so this renders an auto-growing textarea that wraps the
 * full name while keeping the borderless inline-edit look.
 */
export function SectionNameEditor({ lang, value, onValueChange, onCommit, className }: SectionNameEditorProps) {
    const wrapRef = useRef<HTMLDivElement>(null);

    // A textarea has a fixed height — re-derive it from content on every
    // value change so the whole name stays visible.
    useLayoutEffect(() => {
        const ta = wrapRef.current?.querySelector("textarea");
        if (!ta) return;
        ta.style.height = "0px";
        ta.style.height = `${ta.scrollHeight}px`;
    }, [value]);

    return (
        <div ref={wrapRef} className="flex-1 min-w-0">
            <TransliterateTextarea
                lang={lang}
                rows={1}
                value={value}
                onValueChange={(text) => onValueChange(text.replace(/\r?\n/g, " "))}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => onCommit((e.target as HTMLTextAreaElement).value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLTextAreaElement).blur();
                    }
                }}
                className={cn(
                    "min-h-0 w-full resize-none overflow-hidden text-sm font-semibold leading-snug",
                    "bg-transparent border-transparent hover:border-input focus:border-input rounded-md px-1 py-0.5 -ml-1",
                    className,
                )}
            />
        </div>
    );
}

export default SectionNameEditor;
