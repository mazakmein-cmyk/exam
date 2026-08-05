/**
 * shareCode.ts — reading a live exam code the way a student actually supplies one.
 *
 * A live exam's `share_code` is eight uppercase hex characters (see the
 * live_exams table default). The creator hands it over in one of three ways, and
 * a student re-supplies it in a fourth:
 *
 *   1. the join link  — https://mocksetu.in/live/4F2A9B01   (Share button)
 *   2. the bare code  — 4F2A9B01                            (read off a screen)
 *   3. labelled       — "Code: 4F2A9B01"                    (WhatsApp / chat)
 *   4. typed by hand  — 4f2a9b01, 4F2A 9B01, 4F2A-9B01
 *
 * All four have to land on the same eight characters, because the student
 * pasting a link into a code box is not making a mistake — the link IS what they
 * were given. Normalising here (rather than in the dialog) keeps that contract in
 * one place: the join box, the lookup that validates it, and any future entry
 * point all read a code the same way.
 *
 * Deliberately NOT done here: rejecting non-hex characters. The column's default
 * is hex today, but codes are opaque identifiers — a validator that knows their
 * alphabet would start rejecting real codes the day that default changes. Length
 * is the only shape this module asserts, and the database is the only thing that
 * decides whether a code exists.
 */

/** Length of a `live_exams.share_code`. */
export const SHARE_CODE_LENGTH = 8;

/** Characters a code cannot contain — spaces, dashes, punctuation, everything. */
const NON_CODE_CHARS = /[^a-zA-Z0-9]/g;

/** `/live/<code>` inside a pasted join link, up to the next `/`, `?` or `#`. */
const JOIN_LINK = /\/live\/([^/?#\s]+)/i;

/**
 * A whole word of exactly SHARE_CODE_LENGTH alphanumerics.
 *
 * This is what saves "Code: 4F2A9B01" from becoming "CODE4F2A": strip-everything
 * is the fallback, not the first move.
 */
const LABELLED_CODE = new RegExp(
    `(?:^|[^a-zA-Z0-9])([a-zA-Z0-9]{${SHARE_CODE_LENGTH}})(?![a-zA-Z0-9])`,
);

/**
 * Reduce anything a student can hand us to a candidate code: uppercase,
 * alphanumerics only, never longer than a real code.
 *
 * Total (never throws, never null) so it can run on every keystroke and on paste.
 * A short or empty result is a perfectly good answer — it means "not a code yet".
 */
export function normalizeShareCode(raw: string | null | undefined): string {
    if (!raw) return "";

    const text = String(raw).trim();
    const link = text.match(JOIN_LINK);
    const source = link ? link[1] : text;

    const labelled = source.match(LABELLED_CODE);
    const candidate = labelled ? labelled[1] : source;

    return candidate.replace(NON_CODE_CHARS, "").toUpperCase().slice(0, SHARE_CODE_LENGTH);
}

/** True once `raw` carries a full-length code. Says nothing about it existing. */
export function isCompleteShareCode(raw: string | null | undefined): boolean {
    return normalizeShareCode(raw).length === SHARE_CODE_LENGTH;
}
