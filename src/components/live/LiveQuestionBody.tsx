/**
 * LiveQuestionBody.tsx — shared renderer for live-exam question text.
 *
 * Passage-based questions are stored as a single HTML blob:
 *   <div class="passage-section">…<img class="passage-image">…</div>
 *   <div class="question-section">…</div>
 * Both the student screen and the creator control room need to split that back
 * into a two-pane passage/question layout, so the parsing lives here once.
 */

import { memo } from "react";

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
  /**
   * Projector mode: emit no font-size of our own and inherit the container's.
   *
   * Required by the present screen, where the size comes from measuring the
   * available frame rather than from a breakpoint. Any hard-coded size here wins
   * over the inherited one, which is how a question destined for a wall ended up
   * rendering at fifteen pixels.
   */
  display?: boolean;
  className?: string;
};

function LiveQuestionBody({ text, compact = false, display = false, className = "" }: Props) {
  const parsed = parseLiveQuestionText(text);

  /**
   * On the projector the size is decided by measurement, not by a breakpoint, so
   * this variant emits NO font-size class and inherits from its container
   * instead. `.live-prose` and KaTeX are both em-based throughout, so one
   * inherited size scales the paragraphs, the lists, the sub/superscripts and
   * the rendered maths together.
   *
   * Without this the hard-coded `text-[15px]` won, and a question projected onto
   * a wall rendered at fifteen pixels.
   */
  const bodySize = display ? "" : compact ? "text-sm" : "text-[15px] sm:text-base";
  const asideSize = display ? "text-[0.4em]" : "text-[10px]";
  const passageSize = display ? "" : compact ? "text-sm" : "text-[15px]";

  if (!parsed.hasPassage) {
    return (
      <div
        className={`live-prose leading-relaxed ${bodySize} ${className}`}
        dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
      />
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row ${compact ? "gap-4" : "gap-6"} ${className}`}>
      {/* Passage */}
      <div className={`lg:w-1/2 ${compact ? "space-y-2" : "space-y-3"} lg:border-r lg:border-border/60 lg:pr-6`}>
        <p className={`${asideSize} font-bold uppercase tracking-[0.14em] text-muted-foreground`}>Passage</p>
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
            className={`live-prose whitespace-pre-wrap text-foreground/90 ${passageSize}`}
            dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.passageHtml) }}
          />
        )}
      </div>

      {/* Question */}
      <div className={`lg:w-1/2 ${compact ? "space-y-2" : "space-y-3"}`}>
        <p className={`${asideSize} font-bold uppercase tracking-[0.14em] text-muted-foreground`}>Question</p>
        <div
          className={`live-prose leading-relaxed ${bodySize}`}
          dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
        />
      </div>
    </div>
  );
}

/**
 * Memoised because the creator's control room re-renders roughly once a second
 * while a question is open (the answered count polls at 750ms). Without this,
 * every one of those ticks re-ran a full KaTeX pass over the question text — and the props that
 * decide its output only change when the question does.
 */
export default memo(LiveQuestionBody);
