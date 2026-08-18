/**
 * homeSearch.ts — the home page's predictive search, as pure ranking logic.
 *
 * The bar has to survive how aspirants actually type: "mts 2024 paper with
 * answer key", "previous year cgl", "mock test maths". That tolerance comes
 * from a cheap token pipeline, not a model: strip filler words, expand the
 * handful of aliases this audience really uses, pull out a year, pull out a
 * paper-type intent — then score every published exam against what is left.
 * It runs over the already-cached library list, so results are instant.
 */
import { type PublishedExam, readExamYear } from "@/lib/publishedExams";
import { PAPER_TYPE_PYQ, PAPER_TYPE_MOCK, readPaperType } from "@/lib/paperType.js";

/** Words that carry intent we handle structurally, or no intent at all. */
const STOPWORDS = new Set([
    "paper", "papers", "test", "tests", "exam", "exams", "download", "pdf",
    "with", "and", "the", "for", "free", "online", "ka", "ki", "ke", "in",
    "answer", "answers", "key", "keys", "solution", "solutions", "series",
]);

/** Tokens that mean "previous year paper" to this audience. */
const PYQ_TOKENS = new Set(["pyq", "pyqs", "previous", "prev", "old", "last", "past"]);
const MOCK_TOKENS = new Set(["mock", "mocks", "practice"]);

/**
 * Community shorthand → the token the category/title actually uses. Kept to
 * abbreviations with one obvious expansion; anything ambiguous just stays as
 * typed and matches (or doesn't) on its own merits.
 */
const ALIASES: Record<string, string[]> = {
    mts: ["ssc", "mts"],
    cgl: ["ssc", "cgl"],
    chsl: ["ssc", "chsl"],
    gd: ["ssc", "gd"],
    multitasking: ["ssc", "mts"],
};

export type ParsedQuery = {
    /** Content tokens to match against title + category. */
    tokens: string[];
    /** A 4-digit year the query named, if any. */
    year: number | null;
    /** 'pyq' | 'mock' | null — what kind of paper the query asked for. */
    paperType: string | null;
};

export function parseQuery(raw: string): ParsedQuery {
    const words = raw
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);

    let year: number | null = null;
    let paperType: string | null = null;
    const tokens: string[] = [];

    for (const word of words) {
        if (/^20[0-9]{2}$/.test(word)) {
            year = Number(word);
            continue;
        }
        if (PYQ_TOKENS.has(word)) {
            paperType = PAPER_TYPE_PYQ;
            continue;
        }
        if (MOCK_TOKENS.has(word)) {
            paperType = PAPER_TYPE_MOCK;
            continue;
        }
        if (STOPWORDS.has(word)) continue;
        tokens.push(...(ALIASES[word] ?? [word]));
    }

    return { tokens: Array.from(new Set(tokens)), year, paperType };
}

export type SearchHit = {
    exam: PublishedExam;
    score: number;
};

/**
 * Rank the library against a query. Returns the top `limit` hits, best first,
 * or [] when the query has no usable signal (so the caller can show its
 * "pick your exam" fallback rather than the whole library).
 */
export function searchExams(exams: PublishedExam[], raw: string, limit = 5): SearchHit[] {
    const query = parseQuery(raw);
    if (query.tokens.length === 0 && query.year === null && query.paperType === null) return [];

    const hits: SearchHit[] = [];

    for (const exam of exams) {
        const name = exam.name.toLowerCase();
        const category = (exam.exam_category ?? "").toLowerCase();
        let score = 0;

        for (const token of query.tokens) {
            if (category.includes(token)) score += 3;
            if (name.includes(token)) score += 2;
        }

        if (query.year !== null) {
            if (readExamYear(exam) === query.year) score += 4;
            else if (name.includes(String(query.year))) score += 2;
        }

        if (query.paperType !== null && readPaperType(exam) === query.paperType) {
            // Type intent refines an otherwise-matched exam; a bare "previous
            // year" query should still surface the PYQ shelf, hence scored
            // even when it is the only signal.
            score += query.tokens.length === 0 && query.year === null ? 2 : 3;
        }

        if (score > 0) hits.push({ exam, score });
    }

    return hits
        .sort((a, b) => b.score - a.score || (a.exam.created_at < b.exam.created_at ? 1 : -1))
        .slice(0, limit);
}
