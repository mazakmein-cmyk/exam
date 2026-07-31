/**
 * Helpers for fields that may hold EITHER plain text or editor-produced HTML.
 *
 * Question text has always been HTML — the WYSIWYG editor stores `innerHTML`.
 * Answer options were plain text until the option fields gained the same
 * rich-text toolbar, so both shapes now coexist in the `options` array of
 * existing rows, and nothing rewrites the old ones:
 *
 *   ["12", "<b>12</b>", "x<sup>2</sup>", "<span class=\"katex\">…</span>"]
 *
 * `looksLikeHtml` is the discriminator, and it is deliberately conservative:
 * a stored "a < b" or "5 > 3 is true" must keep rendering literally, so a
 * match requires a real tag from the set the editors actually emit. Anything
 * else is treated as plain text and stays on the HTML-escaping render path it
 * has always used.
 */

// Tags the WYSIWYG editors produce, plus the KaTeX/MathML they bake in.
const EDITOR_TAGS =
  "span|div|p|br|b|strong|i|em|u|s|strike|sub|sup|font|a|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|h[1-6]|blockquote|code|pre|img|hr|" +
  "math|semantics|annotation|mrow|mi|mn|mo|ms|msup|msub|msubsup|mfrac|msqrt|mroot|mstyle|mspace|mtext|mover|munder|munderover|mtable|mtr|mtd|mpadded|mphantom|menclose";

const HTML_TAG_RE = new RegExp(`<\\/?(?:${EDITOR_TAGS})\\b[^>]*>`, "i");

/** True when `value` carries markup a rich-text editor could have written. */
export function looksLikeHtml(value: unknown): boolean {
  return typeof value === "string" && HTML_TAG_RE.test(value);
}

const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&[a-z#0-9]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
}

/** Regex fallback for non-DOM environments (tests, any future SSR). */
function stripTagsWithRegex(s: string): string {
  return decodeEntities(
    s
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Plain-text form of a possibly-HTML field, for the places markup can't be
 * rendered: <select> item labels, checkbox labels, aria text, truncated
 * previews, CSV-ish output.
 *
 * KaTeX spans get collapsed to their source LaTeX (from the MathML
 * `<annotation>`) rather than the duplicated glyph layer, so an option reads
 * "x^2" instead of "x2x2".
 */
export function htmlToPlainText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (!looksLikeHtml(s)) return s;

  if (typeof DOMParser === "undefined") return stripTagsWithRegex(s);

  try {
    const doc = new DOMParser().parseFromString(s, "text/html");

    // Each .katex node renders the same math twice (MathML + styled glyphs).
    // Replace the whole node with its LaTeX source, falling back to the
    // visible glyph text when no annotation is present.
    doc.querySelectorAll(".katex").forEach((node) => {
      const latex = node.querySelector("annotation")?.textContent?.trim();
      const visible = node.querySelector(".katex-html")?.textContent?.trim();
      node.replaceWith(doc.createTextNode(latex || visible || ""));
    });

    doc.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode(" ")));
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return stripTagsWithRegex(s);
  }
}

/**
 * True when a rich-text field holds nothing a student would see.
 *
 * A contentEditable that the user typed into and cleared keeps scaffolding —
 * "<br>", "<div><br></div>", "<p>&nbsp;</p>" — none of which is empty by
 * `.trim()`. Emptiness checks on options MUST come through here, or a blank
 * option row gets saved as a real answer choice.
 */
export function isRichTextEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value);
  if (s.trim() === "") return true;
  // Markup that is visible without contributing any text
  if (/<(img|hr|table|iframe|video|svg)\b/i.test(s)) return false;
  return htmlToPlainText(s).trim() === "";
}

/**
 * Normalized key for comparing a stored answer value against option text.
 *
 * Answers are usually indexes, but JSON imports may store the option's TEXT.
 * Such an answer was written before the option carried markup, so matching has
 * to happen on the plain-text form — otherwise "12" would stop matching an
 * option the creator later bolded into "<b>12</b>".
 */
export function optionMatchKey(value: unknown): string {
  return htmlToPlainText(value).trim().toLowerCase();
}

/**
 * Render AI cloze-blank markers as readable fill-in-the-blank gaps.
 *
 * Gemini transcribes a PDF's "____1____" blanks as `***1***` in imported
 * passages and question text ("seem to feel ***1*** if they do not engage
 * ***2*** small talk"). Left alone they display as literal asterisks — and
 * on surfaces that run the markdown-lite bold/italic pass, `***1***` gets
 * half-consumed into broken <strong>/<em> nesting. This rewrites them into
 * the plain-text form students expect: `___(1)___`.
 *
 * Digits-only (1-2), so genuine ***bold-italic*** prose is never touched.
 * Plain-text output survives HTML escaping, markdown passes, and KaTeX
 * scanning unchanged, so it is safe as the FIRST step of any render chain.
 */
export function renderClozeBlanks(value: string): string {
  if (!value || value.indexOf("***") === -1) return value;
  return value.replace(/\*\*\*\s*\(?(\d{1,2})\)?\s*\*\*\*/g, "___($1)___");
}
