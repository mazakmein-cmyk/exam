/**
 * homeExamContext.ts — the home page's "which exam are you preparing for?"
 * state, kept honest in the URL and sticky across visits.
 *
 * The chosen exam is a page-level context switch: every cluster below the hero
 * re-filters to it. It lives in `?exam=ssc-mts` (same URL-as-state contract the
 * library's ?category= filter follows, so a chosen context is a shareable
 * link), and is mirrored to localStorage so a returning aspirant's page opens
 * already tuned to their exam — they never re-state a choice they already made.
 *
 * The URL carries a SLUG, not the raw category string: categories are
 * creator-entered ("SSC MTS"), and a URL should not depend on their casing or
 * spacing. matchCategoryBySlug snaps a slug back onto the exact string the
 * exams use — the same canonicalization idea the library applies to ?category=.
 */

export const EXAM_PARAM = "exam";

const STORAGE_KEY = "mocksetu:preferred-exam";

/** "SSC MTS" → "ssc-mts". Stable for any creator-entered category string. */
export const slugifyCategory = (category: string): string =>
    category
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** Snap a URL slug back onto the exact category string the exams carry. */
export const matchCategoryBySlug = (slug: string, categories: string[]): string | null => {
    if (!slug) return null;
    const wanted = slugifyCategory(slug);
    return categories.find((c) => slugifyCategory(c) === wanted) ?? null;
};

export function readPreferredExam(): string | null {
    if (typeof localStorage === "undefined") return null;
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function rememberPreferredExam(category: string | null): void {
    if (typeof localStorage === "undefined") return;
    try {
        if (category) localStorage.setItem(STORAGE_KEY, category);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* privacy mode — stickiness is optional */
    }
}

/**
 * The exams the platform courts even before the library carries papers for
 * them. The chip rail must read as "every big exam lives here", not as a
 * mirror of whatever happens to be published this week — a NEET aspirant who
 * sees only SSC chips concludes this site is not for them and leaves.
 * Selecting one of these with no published papers degrades gracefully: the
 * CTA and the shelf card route into the library's own honest empty state.
 */
export const FLAGSHIP_CATEGORIES = [
    "SSC MTS",
    "SSC CGL",
    "JEE Main",
    "NEET",
    "CAT",
    "GATE",
    "UPSC",
];

/**
 * The categories the hero offers as chips, most-relevant first.
 *
 * Live categories (ones with published exams) rank first by volume, with
 * SSC MTS pinned to the front while its 2026 cycle is the site's season.
 * The flagship list fills in behind them, de-duplicated by slug, so the rail
 * always shows the breadth of the platform even on a young library.
 */
export function rankHomeCategories(
    exams: Array<{ exam_category: string | null }>
): string[] {
    const counts = new Map<string, number>();
    exams.forEach((e) => {
        if (!e.exam_category) return;
        counts.set(e.exam_category, (counts.get(e.exam_category) ?? 0) + 1);
    });
    const ranked = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([category]) => category);
    const mtsIndex = ranked.findIndex((c) => slugifyCategory(c) === "ssc-mts");
    if (mtsIndex > 0) {
        const [mts] = ranked.splice(mtsIndex, 1);
        ranked.unshift(mts);
    }
    const seen = new Set(ranked.map(slugifyCategory));
    for (const flagship of FLAGSHIP_CATEGORIES) {
        if (!seen.has(slugifyCategory(flagship))) {
            ranked.push(flagship);
            seen.add(slugifyCategory(flagship));
        }
    }
    return ranked;
}
