import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, FileText, Play, Search, Sparkles } from "lucide-react";
import type { PublishedExam } from "@/lib/publishedExams";
import { readExamYear } from "@/lib/publishedExams";
import { searchExams } from "@/lib/homeSearch";
import { rememberLastExam } from "@/lib/lastExamMemo";
import { PAPER_TYPE_PYQ, readPaperType } from "@/lib/paperType.js";
import { type HeroCopy } from "@/i18n/homeCopy";
import { HOME_COPY_EN } from "@/i18n/homeCopy.en";

/**
 * The student hero. Its whole job is the 15-second contract:
 *   1. "What is this?"        — the H1 (free mock tests + previous year papers)
 *   2. "Is my exam here?"     — the chips (Hick's law: 3 + More, never a wall)
 *   3. "What do I press?"     — ONE saturated CTA, pre-resolved to a real paper
 *
 * Everything here filters the same cached library list the marketplace uses,
 * so chip taps and search keystrokes never touch the network.
 */

type StudentHeroProps = {
    exams: PublishedExam[];
    loading: boolean;
    /** Ranked category chips (rankHomeCategories). */
    categories: string[];
    selectedCategory: string | null;
    onSelectCategory: (category: string) => void;
    /** The exam the big button starts. Null while loading / empty library. */
    primaryExam: PublishedExam | null;
    /** Language table — English by default, Hindi on /hindi. */
    copy?: HeroCopy;
};

/** How many chips before choices hide behind "More" (Hick's law). */
const VISIBLE_CHIPS = 4;

/** The breadth strip — says "every big exam lives here" in one glance. */
const TRUSTED_BY = ["SSC", "JEE", "NEET", "CAT", "GATE", "UPSC"];

const startExamPath = (exam: PublishedExam) => `/exam/${exam.id}/intro?from=home`;

/* ─────────────────────────────────────────────
   Predictive search: type "mts 2024" → live rows
   with the start action embedded in the row.
   ───────────────────────────────────────────── */
const HeroSearch = ({
    exams,
    onPick,
    copy,
}: {
    exams: PublishedExam[];
    onPick: (exam: PublishedExam) => void;
    copy: HeroCopy;
}) => {
    const navigate = useNavigate();
    const [value, setValue] = useState("");
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    // 150ms debounce keeps ranking off the critical path of each keystroke
    // while still feeling instant.
    useEffect(() => {
        const t = setTimeout(() => setQuery(value), 150);
        return () => clearTimeout(t);
    }, [value]);

    const hits = useMemo(() => (query.trim() ? searchExams(exams, query) : []), [exams, query]);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, []);

    const showPanel = open && value.trim().length > 0;

    return (
        <div ref={boxRef} className="relative w-full max-w-xl mx-auto">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/40" />
                <input
                    type="search"
                    inputMode="search"
                    enterKeyHint="go"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setOpen(false);
                        if (e.key === "Enter" && hits[0]) onPick(hits[0].exam);
                    }}
                    placeholder={copy.searchPlaceholder}
                    aria-label={copy.searchAria}
                    className="w-full h-[52px] pl-11 pr-4 rounded-2xl bg-white/[0.06] border border-white/[0.12] text-[15px] text-white placeholder:text-white/35 outline-none focus:border-[#6C3EF4]/60 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(108,62,244,0.15)] transition-all duration-200 backdrop-blur-sm"
                />
            </div>

            {showPanel && (
                <div
                    role="listbox"
                    aria-label="Matching papers"
                    className="absolute left-0 right-0 top-[60px] z-30 rounded-2xl border border-white/[0.1] bg-[#0D1022]/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden text-left"
                >
                    {hits.length > 0 ? (
                        <>
                            {hits.map(({ exam }) => {
                                const year = readExamYear(exam);
                                const isPyq = readPaperType(exam) === PAPER_TYPE_PYQ;
                                return (
                                    <button
                                        key={exam.id}
                                        role="option"
                                        aria-selected="false"
                                        onClick={() => onPick(exam)}
                                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.06] transition-colors text-left border-b border-white/[0.05] last:border-b-0"
                                    >
                                        <div className="shrink-0 w-9 h-9 rounded-xl bg-[#6C3EF4]/15 border border-[#6C3EF4]/25 flex items-center justify-center">
                                            <FileText className="h-4 w-4 text-[#A78BFA]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] font-semibold text-white truncate">{exam.name}</div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {exam.exam_category && (
                                                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-white/[0.08] text-white/55">
                                                        {exam.exam_category}
                                                    </span>
                                                )}
                                                {year && (
                                                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-white/[0.08] text-white/55">
                                                        {year}
                                                    </span>
                                                )}
                                                {isPyq && (
                                                    <span className="text-[10px] font-semibold px-1.5 py-px rounded bg-amber-400/15 text-amber-300">
                                                        {copy.pyqBadge}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6C3EF4] text-white text-[12px] font-bold">
                                            <Play className="h-3 w-3 fill-current" /> {copy.start}
                                        </span>
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => navigate("/marketplace")}
                                className="w-full px-4 py-2.5 text-[12px] font-semibold text-[#A78BFA] hover:bg-white/[0.05] transition-colors text-center"
                            >
                                {copy.browseFull}
                            </button>
                        </>
                    ) : (
                        <div className="px-4 py-4 text-[13px] text-white/50">
                            {copy.noMatchLead}{" "}
                            <button
                                className="font-semibold text-[#A78BFA]"
                                onClick={() => setValue("SSC MTS")}
                            >
                                SSC MTS
                            </button>
                            {" · "}
                            <button className="font-semibold text-[#A78BFA]" onClick={() => navigate("/marketplace")}>
                                {copy.noMatchBrowse}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const StudentHero = ({
    exams,
    loading,
    categories,
    selectedCategory,
    onSelectCategory,
    primaryExam,
    copy = HOME_COPY_EN.hero,
}: StudentHeroProps) => {
    const navigate = useNavigate();
    const [mounted, setMounted] = useState(false);
    const [chipsExpanded, setChipsExpanded] = useState(false);
    // 0 at the top of the page → 1 once the hero has scrolled away. Drives the
    // depth parallax: background layers trail the scroll at different speeds
    // so leaving the hero feels like pulling back from a scene, not sliding a
    // flat page. rAF-throttled, transform/opacity only, off under
    // prefers-reduced-motion.
    const [scrollAway, setScrollAway] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return () => clearTimeout(t);
        }
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                setScrollAway(Math.min(1, window.scrollY / 640));
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            clearTimeout(t);
            window.removeEventListener("scroll", onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    const startExam = (exam: PublishedExam) => {
        rememberLastExam({ id: exam.id, name: exam.name, category: exam.exam_category });
        navigate(startExamPath(exam));
    };

    const startPrimary = () => {
        if (primaryExam) startExam(primaryExam);
        else if (selectedCategory) navigate(`/marketplace?category=${encodeURIComponent(selectedCategory)}`);
        else navigate("/marketplace");
    };

    const visibleChips = chipsExpanded ? categories : categories.slice(0, VISIBLE_CHIPS);
    const hiddenCount = categories.length - VISIBLE_CHIPS;

    // Per-element stagger comes from an inline transitionDelay next to each use.
    const reveal = `transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`;

    return (
        <section aria-label="Find your exam" className="relative overflow-hidden bg-[#07091A]">
            {/* Same deep-navy visual language the old hero established — the
                navbar's transparent-on-home treatment depends on it. */}
            <div className="absolute inset-0" aria-hidden="true">
                {/* Each glow trails the scroll at its own speed — cheap depth. */}
                <div
                    className="absolute top-[-25%] left-1/2 -translate-x-1/2 w-[900px] h-[560px] rounded-full bg-[#6C3EF4] opacity-[0.13] blur-[120px]"
                    style={{ transform: `translate(-50%, ${scrollAway * 110}px)` }}
                />
                <div
                    className="absolute top-[15%] left-[12%] w-[420px] h-[360px] rounded-full bg-[#A855F7] opacity-[0.08] blur-[100px]"
                    style={{ transform: `translate(${scrollAway * -50}px, ${scrollAway * 70}px)` }}
                />
                <div
                    className="absolute top-[35%] right-[8%] w-[380px] h-[380px] rounded-full bg-[#3B82F6] opacity-[0.06] blur-[100px]"
                    style={{ transform: `translate(${scrollAway * 55}px, ${scrollAway * 45}px)` }}
                />
            </div>
            <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.1]"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                    maskImage: "radial-gradient(ellipse 80% 80% at 50% 40%, black 30%, transparent 100%)",
                    WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 40%, black 30%, transparent 100%)",
                    // The grid crawls slowest of all — the furthest layer back.
                    transform: `translateY(${scrollAway * 40}px)`,
                }}
            />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden="true" />

            {/* The foreground recedes slightly slower than the page scrolls and
                dims as it goes — the "pulling back from the scene" beat. */}
            <div
                className="relative z-10 container mx-auto max-w-4xl px-5 pt-24 pb-16 sm:pb-20 text-center"
                style={{ opacity: 1 - scrollAway * 0.5, transform: `translateY(${scrollAway * 48}px)` }}
            >
                {/* Breadth strip — MockSetu serves every major exam, and the
                    first thing on the page says so. */}
                <div className={`flex justify-center mb-8 ${reveal}`} style={{ transitionDelay: "50ms" }}>
                    <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-2">
                        <span className="text-[11px] font-semibold text-white/40 tracking-widest uppercase mr-3">{copy.forLabel}</span>
                        {TRUSTED_BY.map((exam, i) => (
                            <span key={exam} className="text-[12px] font-bold text-white/60">
                                {exam}
                                {i < TRUSTED_BY.length - 1 && <span className="text-white/20 mx-1.5">·</span>}
                            </span>
                        ))}
                    </div>
                </div>

                {/* H1 — mirrors the query cluster this page exists to win. */}
                <h1 className={reveal} style={{ transitionDelay: "100ms" }}>
                    <span className="block text-[34px] sm:text-[52px] md:text-[64px] font-black text-white leading-[1.05] tracking-[-0.04em]">
                        {copy.h1a}
                    </span>
                    <span
                        className="block text-[34px] sm:text-[52px] md:text-[64px] font-black leading-[1.05] tracking-[-0.04em] mt-1"
                        style={{
                            background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 40%, #C084FC 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                        }}
                    >
                        {copy.h1b}
                    </span>
                </h1>
                <p
                    className={`mt-5 text-[15.5px] sm:text-[17px] text-white/50 max-w-lg mx-auto leading-[1.6] ${reveal}`}
                    style={{ transitionDelay: "200ms" }}
                >
                    {copy.subA}
                    <span className="text-white/80 font-medium">{copy.subB}</span>
                </p>

                {/* Predictive search — looks like the search box they came from.
                    relative z-20: the reveal transforms below create sibling
                    stacking contexts, and without this the chips and CTA paint
                    over the open results panel. */}
                <div className={`mt-8 relative z-20 ${reveal}`} style={{ transitionDelay: "300ms" }}>
                    <HeroSearch exams={exams} onPick={startExam} copy={copy} />
                </div>

                {/* Exam context chips — a page-level switch, not a link. */}
                <div className={`mt-8 ${reveal}`} style={{ transitionDelay: "400ms" }}>
                    <p className="text-[13px] font-semibold text-white/45 mb-3">{copy.chipsQuestion}</p>
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto">
                        {loading && categories.length === 0 ? (
                            [0, 1, 2].map((i) => (
                                <span key={i} className="h-10 w-24 rounded-xl bg-white/[0.06] animate-pulse" aria-hidden="true" />
                            ))
                        ) : (
                            <>
                                {visibleChips.map((category) => {
                                    const active = category === selectedCategory;
                                    return (
                                        <button
                                            key={category}
                                            onClick={() => onSelectCategory(category)}
                                            aria-pressed={active}
                                            className={`h-10 px-4 rounded-xl text-[13.5px] font-bold tracking-tight transition-all duration-200 border ${
                                                active
                                                    ? "bg-[#6C3EF4] border-[#6C3EF4] text-white shadow-[0_4px_20px_rgba(108,62,244,0.4)]"
                                                    : "bg-white/[0.05] border-white/[0.12] text-white/70 hover:bg-white/[0.1] hover:text-white"
                                            }`}
                                        >
                                            {category}
                                        </button>
                                    );
                                })}
                                {hiddenCount > 0 && !chipsExpanded && (
                                    <button
                                        onClick={() => setChipsExpanded(true)}
                                        className="h-10 px-4 rounded-xl text-[13.5px] font-bold bg-white/[0.05] border border-white/[0.12] text-white/50 hover:bg-white/[0.1] hover:text-white transition-all duration-200 inline-flex items-center gap-1"
                                    >
                                        {copy.more} <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* THE button (Fitts's law: oversized, isolated contrast, zero
                    ambiguity about what it starts). Pre-resolved to a real paper
                    so the first tap of the visit already delivers value. */}
                <div className={`mt-10 ${reveal}`} style={{ transitionDelay: "500ms" }}>
                    <button
                        onClick={startPrimary}
                        disabled={loading && !primaryExam}
                        className="group relative w-full sm:w-auto sm:min-w-[340px] inline-flex flex-col items-center justify-center px-8 py-4 rounded-2xl bg-[#6C3EF4] hover:bg-[#5B2FE3] disabled:opacity-60 text-white overflow-hidden shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_12px_44px_rgba(108,62,244,0.45)] hover:shadow-[0_0_0_1px_rgba(108,62,244,0.6),0_16px_56px_rgba(108,62,244,0.55)] transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" aria-hidden="true" />
                        <span className="relative inline-flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight">
                            <Play className="h-[18px] w-[18px] fill-current" />
                            {copy.ctaTitle}
                        </span>
                        <span className="relative mt-0.5 text-[12px] font-medium text-white/70 truncate max-w-[300px]">
                            {primaryExam
                                ? primaryExam.name
                                : selectedCategory
                                  ? copy.browseCategory(selectedCategory)
                                  : copy.browseLibrary}
                        </span>
                    </button>
                    <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-white/35 font-medium">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        {copy.trustLine}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default StudentHero;
