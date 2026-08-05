import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { htmlToPlainText, isRichTextEmpty } from "@/lib/richText";
import { Plus } from "lucide-react";

interface SnipOptionDialogProps {
    /** The snip awaiting a destination; the dialog is open while this is non-null. */
    blob: Blob | null;
    /** Current option texts (rich HTML), aligned by index with optionImages. */
    options: string[];
    optionImages: (string | null)[];
    /** Disables actions while an option image upload is already in flight. */
    busy?: boolean;
    onAttach: (idx: number) => void;
    onAttachToNew: () => void;
    onCancel: () => void;
}

/**
 * Shown after "Snip & Attach Option" in the PDF snipper: the user picks which
 * answer option the cropped image belongs to, or spawns a fresh option row
 * that starts out as an image-only choice.
 */
export default function SnipOptionDialog({
    blob,
    options,
    optionImages,
    busy,
    onAttach,
    onAttachToNew,
    onCancel,
}: SnipOptionDialogProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!blob) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [blob]);

    return (
        <Dialog open={!!blob} onOpenChange={(open) => { if (!open) onCancel(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Attach snip to an option</DialogTitle>
                    <DialogDescription>
                        Pick the option this image belongs to, or create a new option with it.
                    </DialogDescription>
                </DialogHeader>

                {previewUrl && (
                    <div className="border border-border/70 rounded-lg bg-muted/40 p-2 flex justify-center">
                        <img
                            src={previewUrl}
                            alt="Snipped option"
                            className="max-h-36 max-w-full object-contain rounded"
                        />
                    </div>
                )}

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {options.map((opt, idx) => {
                        const hasText = !isRichTextEmpty(opt);
                        const hasImage = !!optionImages?.[idx];
                        return (
                            <button
                                key={idx}
                                type="button"
                                disabled={busy}
                                onClick={() => onAttach(idx)}
                                className="w-full flex items-center gap-3 rounded-lg border border-border/70 p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.04] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                                    {String.fromCharCode(65 + idx)}
                                </span>
                                <span className="flex-1 min-w-0 text-sm truncate">
                                    {hasText ? (
                                        htmlToPlainText(opt)
                                    ) : hasImage ? (
                                        <span className="text-muted-foreground">(image option)</span>
                                    ) : (
                                        <span className="text-muted-foreground italic">Empty option</span>
                                    )}
                                </span>
                                {hasImage && (
                                    <span className="flex items-center gap-1.5 shrink-0">
                                        <img
                                            src={optionImages[idx]!}
                                            alt=""
                                            className="h-8 w-8 object-cover rounded border border-border/70"
                                        />
                                        <span className="text-[10px] font-medium text-amber-600">replaces</span>
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {options.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                            No options yet — create one below.
                        </p>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" disabled={busy} onClick={onAttachToNew}>
                        <Plus className="mr-2 h-4 w-4" /> New option with this image
                    </Button>
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
