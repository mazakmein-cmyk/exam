import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, FileText, Play } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import Reveal from "@/components/home/Reveal";
import { readExamYear, type PublishedExam } from "@/lib/publishedExams";
import { rememberLastExam } from "@/lib/lastExamMemo";
import { PAPER_TYPE_PYQ, readPaperType } from "@/lib/paperType.js";

/**
 * Cluster B — the previous-year-paper rail for the chosen exam.
 *
 * Cards lead with the YEAR numeral, because "MTS 2024 paper" is how the search
 * arrives and the year is the one token every aspirant scans for. Four cards,
 * never more (Miller's law) — the full shelf is one honest link away, carrying
 * the same ?category&type params the library already understands.
 *
 * A category with no tagged previous-year papers falls back to its newest
 * mocks, and SAYS so — an empty rail teaches the visitor to stop scrolling.
 */

const PapersCluster = ({
    exams,
    selectedCategory,
}: {
    exams: PublishedExam[];
    selectedCategory: string | null;
}) => {
    const navigate = useNavigate();

    const { papers, showingPyq } = useMemo(() => {
        const inCategory = selectedCategory
            ? exams.filter((e) => e.exam_category === selectedCategory)
            : exams;
        const pyq = inCategory
            .filter((e) => readPaperType(e) === PAPER_TYPE_PYQ)
            .sort((a, b) => (readExamYear(b) ?? 0) - (readExamYear(a) ?? 0));
        if (pyq.length > 0) return { papers: pyq.slice(0, 4), showingPyq: true };
        // Newest-first is the fetch order, so a plain slice is already "latest".
        return { papers: inCategory.slice(0, 4), showingPyq: false };
    }, [exams, selectedCategory]);

    const libraryHref = selectedCategory
        ? `/marketplace?category=${encodeURIComponent(selectedCategory)}${showingPyq ? "&type=pyq" : ""}`
        : `/marketplace${showingPyq ? "?type=pyq" : ""}`;

    const start = (exam: PublishedExam) => {
        rememberLastExam({ id: exam.id, name: exam.name, category: exam.exam_category });
        navigate(`/exam/${exam.id}/intro?from=home`);
    };

    if (papers.length === 0) return null;

    const scopeLabel = selectedCategory ?? "every exam";

    return (
        <section aria-label="Previous year papers" className="bg-secondary/40 border-y border-border/40">
            <div className="container mx-auto max-w-6xl px-5 py-14 sm:py-16">
                <Reveal>
                <SectionHeader
                    icon={FileText}
                    eyebrow={showingPyq ? "With answer keys" : "Fresh papers"}
                    title={
                        showingPyq
                            ? `Previous year papers — ${scopeLabel}`
                            : `Latest mock tests — ${scopeLabel}`
                    }
                    subtitle={
                        showingPyq
                            ? "Real papers from past cycles, run under the real clock. Attempt first, then review against the key."
                            : selectedCategory
                              ? `No previous-year papers are tagged for ${selectedCategory} yet — these are its newest mocks.`
                              : "The newest papers in the library, ready to attempt."
                    }
                    accent="#F59E0B"
                />
                </Reveal>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {papers.map((exam, i) => {
                        const year = readExamYear(exam);
                        return (
                            <Reveal key={exam.id} delay={i * 90} className="h-full">
                            <button
                                onClick={() => start(exam)}
                                className="group h-full w-full flex flex-col text-left rounded-2xl border border-border/60 bg-card p-5 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 hover:border-[#6C3EF4]/30 transition-all duration-200"
                            >
                                <div className="flex items-baseline justify-between mb-3">
                                    <span className="text-[30px] font-black tracking-tight text-foreground leading-none">
                                        {year ?? <FileText className="h-7 w-7 text-[#6C3EF4]" aria-hidden="true" />}
                                    </span>
                                    {showingPyq && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                            PYQ
                                        </span>
                                    )}
                                </div>
                                <span className="text-[14px] font-bold text-foreground leading-snug line-clamp-2 mb-1">
                                    {exam.name}
                                </span>
                                {exam.exam_category && (
                                    <span className="text-[11.5px] text-muted-foreground">{exam.exam_category}</span>
                                )}
                                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#6C3EF4] group-hover:gap-2.5 transition-all duration-200">
                                    <Play className="h-3.5 w-3.5 fill-current" /> Practice as mock
                                </span>
                            </button>
                            </Reveal>
                        );
                    })}
                </div>

                <div className="mt-6">
                    <Link
                        to={libraryHref}
                        className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#6C3EF4] hover:text-[#5B2FE3] transition-colors"
                    >
                        View all {selectedCategory ? `${selectedCategory} ` : ""}papers in the library <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default PapersCluster;
