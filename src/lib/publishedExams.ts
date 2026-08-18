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

export type PublishedExam = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    is_published: boolean;
    exam_category: string | null;
    /** 'mock' | 'pyq'. Absent on a database without the migration — reads as mock. */
    paper_type?: string | null;
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
 * The year a paper is "about", read from its title ("SSC MTS 2024 Shift 1" →
 * 2024). Previous-year cards lead with this numeral — it is the token aspirants
 * actually scan for. Returns null when the title names no plausible exam year.
 */
export const readExamYear = (exam: Pick<PublishedExam, "name">): number | null => {
    const match = exam.name.match(/\b(20[0-9]{2})\b/);
    if (!match) return null;
    const year = Number(match[1]);
    // A creator typo like "2099" should not outrank every real paper.
    return year >= 2000 && year <= 2035 ? year : null;
};
