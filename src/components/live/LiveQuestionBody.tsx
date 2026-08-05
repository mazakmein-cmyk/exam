/**
 * LiveQuestionBody.tsx — shared renderer for live-exam question text.
 *
 * Passage-based questions are stored as a single HTML blob:
 *   <div class="passage-section">…<img class="passage-image">…</div>
 *   <div class="question-section">…</div>
 * Both the student screen and the creator control room need to split that back
 * into a two-pane passage/question layout, so the parsing lives here once.
 *
 * Why a passage needs its own design, not just a second column
 * ----------------------------------------------------------
 * A passage question is two kinds of text doing two different jobs. The passage
 * is reference material — read once, returned to. The question is the ask, and
 * on a live screen it is the only thing with a deadline attached. The first
 * version of this file drew them as equal halves with a hairline between, which
 * gets all three of the decisions that matter wrong:
 *
 *  - **Ratio.** Six hundred characters of prose and a one-line question do not
 *    want the same width. Half the frame was permanently empty on the question
 *    side while the passage — the thing actually constraining the type size —
 *    was squeezed into the other half, which drags the whole projector down with
 *    it (the focus screen measures one size for everything: see useFitText).
 *  - **Ground.** A 1px rule and a 10px caption is not enough to tell a room five
 *    metres back which block is which. The passage now sits on a surface of its
 *    own with an accent rule down its edge, so the distinction survives the
 *    distance, a 360p stream and a tired projector.
 *  - **Hierarchy without dimming.** The passage is set smaller than the ask, but
 *    in the SAME ink. Dimming body text is what a laptop can afford and a
 *    projector cannot — see the note on `.live-passage-text` in index.css for the
 *    bug that taught us this the hard way.
 *
 * The shape rules live in index.css (`.live-split`), not here, for the same
 * reason the stage layout does: they depend on the frame's aspect ratio, which no
 * component prop can know.
 */

import { memo, type ReactNode } from "react";

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

/**
 * Should the passage's own newlines be honoured as line breaks?
 *
 * Two authoring paths reach this renderer and they need opposite answers. A
 * JSON-imported passage is plain text with `\n` in it — the parser wraps it in
 * the passage-section div verbatim (see jsonImportParser) — and without
 * `pre-wrap` its stanzas and paragraph breaks collapse into one slab. A passage
 * authored in the editor is real markup, and WITH `pre-wrap` every newline
 * BETWEEN its tags becomes a blank line and every source-formatting break becomes
 * a hard one, which is what made a projected passage break mid-sentence at
 * apparently random points.
 *
 * So: markup governs when there is markup, and `pre-wrap` covers the plain-text
 * case it was added for in the first place.
 */
function keepsOwnLineBreaks(html: string): boolean {
  return !/<\s*(p|br|div|ul|ol|table|h[1-6]|blockquote)\b/i.test(html);
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
  /**
   * Rendered directly under the ask — the answer choices, on the focus screen.
   *
   * It matters that this is a slot rather than a sibling the caller draws below
   * the whole component. On a passage question the choices belong in the QUESTION
   * pane, beside the passage rather than under it: a room reads passage → ask →
   * choices as one path, and every printed comprehension paper in existence has
   * settled on the same arrangement. Drawn as a sibling they land under both
   * panes, which puts the full width of the frame between a question and the
   * answers to it, and leaves the ask alone at the top of an empty column.
   */
  children?: ReactNode;
  className?: string;
};

function LiveQuestionBody({
  text,
  compact = false,
  display = false,
  className = "",
  children,
}: Props) {
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
  const asideSize = display ? "text-[0.42em]" : "text-[10px]";
  /**
   * Display mode leaves the passage's size to CSS (`.live-stage
   * .live-passage-text`), which sets it as a fraction of the measured size. A
   * class here would be a second authority on the same number, and the one in CSS
   * is the one that can be expressed relative to what the frame decided.
   */
  const passageSize = display ? "" : compact ? "text-sm" : "text-[15px]";

  if (!parsed.hasPassage) {
    return (
      <div className={className}>
        <div
          className={`live-prose leading-relaxed ${bodySize}`}
          dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
        />
        {children}
      </div>
    );
  }

  return (
    <div className={`live-split ${compact ? "live-split-compact" : ""} ${className}`}>
      {/* Reference material: bounded, on its own ground, and never the hero. */}
      <div className="live-split-passage">
        <p className={`live-eyebrow ${asideSize}`}>Passage</p>
        {parsed.passageImageUrl && (
          <div className="live-passage-figure">
            <img
              src={parsed.passageImageUrl}
              alt="Passage"
              /* Em-based in display mode for the reason every other size in the
                 measured subtree is: a 380px figure beside 80px type is not a
                 figure the fit search can trade against anything. */
              className={`h-auto max-w-full rounded-lg object-contain ${
                display ? "max-h-[7em]" : compact ? "max-h-[200px]" : "max-h-[380px]"
              }`}
            />
          </div>
        )}
        {parsed.passageHtml && (
          <div
            className={`live-prose live-passage-text ${passageSize} ${
              keepsOwnLineBreaks(parsed.passageHtml) ? "whitespace-pre-wrap" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.passageHtml) }}
          />
        )}
      </div>

      {/* The ask, and whatever answers it. */}
      <div className="live-split-question">
        <p className={`live-eyebrow ${asideSize}`}>Question</p>
        <div
          className={`live-prose leading-relaxed ${bodySize}`}
          dangerouslySetInnerHTML={{ __html: renderMathInHtml(parsed.questionHtml) }}
        />
        {children}
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
