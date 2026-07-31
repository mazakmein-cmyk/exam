/**
 * LiveQuestionBody.tsx — shared renderer for live-exam question text.
 *
 * Passage-based questions are stored as a single HTML blob:
 *   <div class="passage-section">…<img class="passage-image">…</div>
 *   <div class="question-section">…</div>
 * Both the student screen and the creator control room need to split that back
 * into a two-pane passage/question layout, so the parsing lives here once.
 */

import { renderMathInHtml } from "@/lib/renderMath";

export type ParsedQuestionText = {
  hasPassage: boolean;
  passageHtml: string;
  passageImageUrl: string | null;
  questionHtml: string;
};

/** Split a stored question blob into passage / question parts. */
export function parseLiveQuestionText(text: string | null | undefined): ParsedQuestionText {
  const raw = text || "";
  if (!raw.includes('class="passage-section"')) {
    return { hasPassage: false, passageHtml: "", passageImageUrl: null, questionHtml: raw };
  }

  // The image may be authored with src before class, or class before src.
  const imageMatch =
    raw.match(/<img[^>]*src="([^"]*)"[^>]*class="[^"]*passage-image[^"]*"[^>]*>/) ||
    raw.match(/<img[^>]*class="[^"]*passage-image[^"]*"[^>]*src="([^"]*)"[^>]*>/);

  const passageMatch = raw.match(
    /<div class="passage-section"[^>]*>([\s\S]*?)<\/div><div class="question-section"/
  );
  const passageHtml = (passageMatch ? passageMatch[1] : "")
    .replace(/<img[^>]*class="[^"]*passage-image[^"]*"[^>]*>/g, "")
    .replace(/<img[^>]*src="[^"]*"[^>]*class="[^"]*passage-image[^"]*"[^>]*>/g, "")
    .trim();

  const questionMatch = raw.match(/<div class="question-section"[^>]*>([\s\S]*?)<\/div>$/);

  return {
    hasPassage: true,
    passageHtml,
    passageImageUrl: imageMatch ? imageMatch[1] : null,
    questionHtml: questionMatch ? questionMatch[1].trim() : "",
  };
}

/**
 * Plain-text preview of a question, for chips, tooltips and collapsed list
 * rows. Math delimiters are dropped along with the tags — a row reading
 * "If $x^2 - 5x + 6 = 0$" is noisier than "If x^2 - 5x + 6 = 0".
 */
export function questionPreviewText(text: string | null | undefined, max = 60): string {
  const stripped = (text || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\[()[\]]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

type Props = {
  text: string | null | undefined;
  /** Tighter spacing and a shorter passage image — for review and preview panes. */
  compact?: boolean;
  className?: string;
};

export default function LiveQuestionBody({ text, compact = false, className = "" }: Props) {
  const parsed = parseLiveQuestionText(text);

  if (!parsed.hasPassage) {
    return (
      <div
        className={`live-prose leading-relaxed ${compact ? "text-sm" : "text-[15px] sm:text-base"} ${className}`}
        dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
      />
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row ${compact ? "gap-4" : "gap-6"} ${className}`}>
      {/* Passage */}
      <div className={`lg:w-1/2 ${compact ? "space-y-2" : "space-y-3"} lg:border-r lg:border-border/60 lg:pr-6`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Passage</p>
        {parsed.passageImageUrl && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-2 flex justify-center">
            <img
              src={parsed.passageImageUrl}
              alt="Passage"
              className={`max-w-full h-auto rounded-lg object-contain ${compact ? "max-h-[200px]" : "max-h-[380px]"}`}
            />
          </div>
        )}
        {parsed.passageHtml && (
          <div
            className={`live-prose whitespace-pre-wrap text-foreground/90 ${compact ? "text-sm" : "text-[15px]"}`}
            dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.passageHtml) }}
          />
        )}
      </div>

      {/* Question */}
      <div className={`lg:w-1/2 ${compact ? "space-y-2" : "space-y-3"}`}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Question</p>
        <div
          className={`live-prose leading-relaxed ${compact ? "text-sm" : "text-[15px] sm:text-base"}`}
          dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
        />
      </div>
    </div>
  );
}
