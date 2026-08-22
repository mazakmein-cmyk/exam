/**
 * pdfDownload.js — turning a stored PDF's URL into something a creator can save
 * to disk with a sensible name.
 *
 * Pure logic only (no supabase, no React) so it can be exercised directly in
 * node — same split as paperType.js / timingGroups.js.
 *
 * Two things make this less trivial than an `<a download>`:
 *
 *  1. THE FILE LIVES ON ANOTHER ORIGIN. Section PDFs are served from Supabase
 *     storage, and the HTML `download` attribute is ignored cross-origin — the
 *     browser navigates instead of saving. Supabase honours a `?download=`
 *     query parameter by answering with `Content-Disposition: attachment`, so
 *     the filename has to travel in the URL, not in the anchor.
 *
 *  2. THE STORED NAME IS A TIMESTAMP. Uploads are keyed `<exam>/<section>/
 *     <Date.now()>.pdf`, so the object's own name tells a creator nothing. We
 *     rebuild a readable one from the exam and section titles they typed.
 */

/** Used when the exam/section names sanitize down to nothing (e.g. emoji-only). */
const FALLBACK_PDF_NAME = "document";

/** Control characters (\p{Cc}) plus everything Windows and macOS reject. */
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\p{Cc}]/gu;

/**
 * Make one path segment safe to hand to a filesystem: drop the characters
 * Windows and macOS reject, collapse runs of whitespace into single hyphens,
 * and trim the leading/trailing punctuation that would look like a mistake.
 *
 * Non-ASCII is deliberately kept — a Hindi section deserves a Hindi filename,
 * and the value is percent-encoded before it reaches the URL.
 */
export function sanitizePdfNamePart(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(UNSAFE_NAME_CHARS, " ")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * The filename a creator sees in their downloads folder: exam, then section,
 * then `.pdf`. Either part may be missing (an unsaved title, a section with no
 * name) and the other still carries the file.
 */
export function pdfDownloadFileName(examName, sectionName) {
  const parts = [examName, sectionName]
    .map(sanitizePdfNamePart)
    .filter(Boolean);
  const base = parts.join("-") || FALLBACK_PDF_NAME;
  // 120 keeps us well clear of the 255-byte limit even after percent-encoding.
  return `${base.slice(0, 120)}.pdf`;
}

/**
 * Attach the download hint to a stored PDF URL.
 *
 * Returns null for a missing URL so callers can use it as the render guard.
 * A URL we cannot parse is handed back untouched rather than dropped — worst
 * case the creator gets the PDF under its timestamp name, which still beats a
 * dead button.
 */
export function pdfDownloadUrl(pdfUrl, fileName) {
  if (typeof pdfUrl !== "string" || pdfUrl.trim() === "") return null;
  const url = pdfUrl.trim();
  const name = typeof fileName === "string" && fileName ? fileName : `${FALLBACK_PDF_NAME}.pdf`;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("download", name);
    return parsed.toString();
  } catch {
    return url;
  }
}
