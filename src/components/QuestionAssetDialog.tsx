/**
 * The popup behind a question row's "Table" and "Image" chips.
 *
 * A collapsed row can only carry prose. Everything else a question is made of —
 * a distribution table, a bar graph, a labelled figure — is reduced to a chip,
 * because flattening a table into the preview line is what made the list
 * unreadable in the first place (see lib/questionPreview.js). A chip that only
 * *names* what it hides trades one frustration for another, so the chips are
 * buttons: one click shows the thing itself, without expanding the row, leaving
 * the editor, or losing the creator's place in a long paper.
 *
 * Deliberately read-only. This is the "what is in question 18 again?" glance
 * during review; editing still happens in the row's own editor, where a change
 * can actually be saved.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { renderMathInHtml } from "@/lib/renderMath";
import { Table2, Image as ImageIcon } from "lucide-react";

export type QuestionAsset = {
  kind: "table" | "image";
  /** How the row names itself — "Question 18". */
  label: string;
  /** Table markup, outermost <table> intact. */
  tables: string[];
  /** Image URLs, from the image columns and from the question text alike. */
  images: string[];
};

export default function QuestionAssetDialog({
  asset,
  onClose,
}: {
  asset: QuestionAsset | null;
  onClose: () => void;
}) {
  const isTable = asset?.kind === "table";
  // Falsy entries and duplicates are filtered HERE rather than at each call
  // site: a figure is often both an image column and an inline <img>, and the
  // two pages that open this dialog assemble that list differently.
  const images = Array.from(new Set((asset?.images ?? []).filter(Boolean)));
  const tables = asset?.tables ?? [];
  const count = isTable ? tables.length : images.length;

  return (
    <Dialog open={!!asset} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isTable ? (
              <Table2 className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-5 w-5 text-primary" />
            )}
            {asset?.label}
          </DialogTitle>
          <DialogDescription>
            {isTable
              ? "The table as it appears inside this question. Edit it in the question editor."
              : "The images attached to this question."}
          </DialogDescription>
        </DialogHeader>

        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nothing to show — this question&rsquo;s {isTable ? "table" : "image"} could not be read.
          </p>
        ) : (
          <div className="space-y-4">
            {isTable
              ? tables.map((html, i) => (
                  <div key={i} className="space-y-1.5">
                    {tables.length > 1 && (
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Table {i + 1} of {tables.length}
                      </p>
                    )}
                    {/* A wide table scrolls inside its own box — the dialog must
                        never grow a horizontal scrollbar of its own. */}
                    <div className="overflow-x-auto rounded-xl border border-border/60 bg-card p-3">
                      <div
                        className="live-prose text-sm"
                        dangerouslySetInnerHTML={{ __html: renderMathInHtml(html) }}
                      />
                    </div>
                  </div>
                ))
              : images.map((url, i) => (
                  <div key={url} className="space-y-1.5">
                    {images.length > 1 && (
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Image {i + 1} of {images.length}
                      </p>
                    )}
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3 flex justify-center">
                      <img
                        src={url}
                        alt={`${asset?.label} image ${i + 1}`}
                        className="max-w-full h-auto rounded-lg"
                      />
                    </div>
                  </div>
                ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
