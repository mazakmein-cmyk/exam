/**
 * publishedExams.ts — the ONE fetch for "every published exam", shared by the
 * home page and the exam library.
 *
 * The home page's exam picker, previous-year-paper rail, and predictive search
 * all filter the same list the library renders. Giving both pages the same
 * query key means react-query serves them from one cache entry: picking a chip
 * on the home page is a client-side re-filter (zero network), and a visitor who
 * lands on / and then opens /marketplace finds the library already warm.
 */
import { supabase } from "@/integrations/supabase/client";
import { queryExamList } from "@/lib/examListQuery";
import { readPaperYear } from "@/lib/paperType.js";

export type PublishedExam = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    is_published: boolean;
    exam_category: string | null;
    /** 'mock' | 'pyq'. Absent on a database without the migration — reads as mock. */
    paper_type?: string | null;
    /**
     * Which year a previous-year paper is from. Absent on a database without
     * 20260917000000, null on a mock, and null on every paper tagged before
     * that field existed — it is never backfilled.
     */
    paper_year?: number | null;
    user_id: string;
};

/** Must stay in sync with nothing — this IS the key both pages use. */
export const PUBLISHED_EXAMS_QUERY_KEY = ["marketplace", "published-exams"] as const;

/** The published library, newest first. Column list: see examListQuery.ts. */
export const fetchPublishedExams = async (): Promise<PublishedExam[]> => {
    const { data, error } = await queryExamList((columns) =>
        supabase
            .from("exams")
            .select(columns as "*")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
    );
    if (error) throw error;
    return (data || []) as PublishedExam[];
};

/**
 * The year a paper is "about". Previous-year cards lead with this numeral — it
 * is the token aspirants actually scan for. Returns null when neither source
 * below names a plausible exam year.
 *
 * Two sources, in order of how much they can be trusted:
 *
 *   1. exams.paper_year, which a creator picked from a dropdown. A fact.
 *   2. the numeral in the title ("SSC MTS 2024 Shift 1"). A guess — and the
 *      only thing available for every paper tagged before the column existed,
 *      which is why it stays.
 *
 * readPaperYear supplies (1) and already refuses to read a year off a mock, so
 * a mock whose title names a year still falls through to (2) — which is the
 * behaviour this function has always had.
 */
export const readExamYear = (
    exam: Pick<PublishedExam, "name" | "paper_type" | "paper_year">
): number | null => {
    const stored = readPaperYear(exam);
    if (stored !== null) return stored;

    const match = exam.name.match(/\b(20[0-9]{2})\b/);
    if (!match) return null;
    const year = Number(match[1]);
    // A creator typo like "2099" should not outrank every real paper.
    return year >= 2000 && year <= 2035 ? year : null;
};
