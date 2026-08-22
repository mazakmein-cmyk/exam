import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Monitor } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import Reveal from "@/components/home/Reveal";
import type { PublishedExam } from "@/lib/publishedExams";
import { rememberLastExam } from "@/lib/lastExamMemo";
import { type CbtCopy } from "@/i18n/homeCopy";
import { HOME_COPY_EN } from "@/i18n/homeCopy.en";

/**
 * Cluster C — a live, touchable miniature of the exam simulator, right on the
 * home page.
 *
 * The single highest-anxiety question for a first-time CBT candidate is "what
 * will the screen look like?" — so the home page answers it with the screen
 * itself, not a screenshot. Three real questions, a ticking clock, and the
 * exact palette colours the real simulator uses (see getQuestionColor in
 * ExamSimulator.tsx: green = answered, red = marked, purple = visited). By the
 * time a student opens a real paper, the interface holds zero surprises — and
 * having already answered a question here, starting the full mock feels like
 * CONTINUING rather than starting (the same open-loop pull the resume card
 * trades on).
 */

/** Decorative palette cells beyond the three live ones — a believable mid-exam spread. */
const DECOR_STATUSES = ["answered", "answered", "visited", "marked", "answered", "none", "visited", "answered", "none", "none", "none", "none"] as const;

const paletteColor = (status: string, isCurrent: boolean) => {
    const ring = isCurrent ? " ring-2 ring-offset-1 ring-[#6C3EF4]" : "";
    // Mirrors ExamSimulator.getQuestionColor exactly — this demo must never
    // teach a colour language the real screen then contradicts.
    if (status === "marked") return `bg-red-500 text-white${ring}`;
    if (status === "answered") return `bg-green-500 text-white${ring}`;
    if (status === "visited") return `bg-purple-500 text-white${ring}`;
    return `bg-background border border-border text-foreground/70${ring}`;
};

const CbtPreview = ({
    primaryExam,
    copy = HOME_COPY_EN.cbt,
}: {
    primaryExam: PublishedExam | null;
    copy?: CbtCopy;
}) => {
    const DEMO_QUESTIONS = copy.questions;
    const navigate = useNavigate();
    const [current, setCurrent] = useState(0);
    const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
    const [marked, setMarked] = useState<boolean[]>([false, false, false]);
    const [visited, setVisited] = useState<boolean[]>([true, false, false]);
    const [secondsLeft, setSecondsLeft] = useState(90 * 60 - 1);

    // The clock ticks for real — a frozen timer would break the illusion the
    // whole section exists to create. One interval, cleared on unmount.
    useEffect(() => {
        const id = window.setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : s)), 1000);
        return () => window.clearInterval(id);
    }, []);

    const clock = useMemo(() => {
        const h = Math.floor(secondsLeft / 3600);
        const m = Math.floor((secondsLeft % 3600) / 60);
        const s = secondsLeft % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }, [secondsLeft]);

    const goTo = (index: number) => {
        setCurrent(index);
        setVisited((v) => v.map((seen, i) => (i === index ? true : seen)));
    };

    const saveAndNext = () => goTo((current + 1) % DEMO_QUESTIONS.length);

    const toggleMark = () => setMarked((m) => m.map((flag, i) => (i === current ? !flag : flag)));

    const liveStatus = (i: number) => {
        if (marked[i]) return "marked";
        if (answers[i] !== null) return "answered";
        if (visited[i]) return "visited";
        return "none";
    };

    const question = DEMO_QUESTIONS[current];
    const answeredCount = answers.filter((a) => a !== null).length;

    const startFullMock = () => {
        if (primaryExam) {
            rememberLastExam({ id: primaryExam.id, name: primaryExam.name, category: primaryExam.exam_category });
            navigate(`/exam/${primaryExam.id}/intro?from=home`);
        } else {
            navigate("/marketplace");
        }
    };

    return (
        <section id="cbt-preview" aria-label="What the real exam screen looks like" className="container mx-auto max-w-6xl px-5 py-14 sm:py-16 scroll-mt-16">
            <Reveal>
                <SectionHeader
                    icon={Monitor}
                    eyebrow={copy.eyebrow}
                    title={copy.title}
                    subtitle={copy.subtitle}
                    accent="#10B981"
                />
            </Reveal>

            <Reveal delay={120}>
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
                {/* Exam-shell header bar */}
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-secondary/60 border-b border-border/50">
                    <span className="text-[12.5px] font-bold text-foreground truncate">
                        {copy.demoTitle}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold tabular-nums px-3 py-1 rounded-lg bg-background border border-border/60" aria-hidden="true">
                        ⏱ {clock}
                    </span>
                </div>

                <div className="grid lg:grid-cols-[1fr_280px]">
                    {/* Question area */}
                    <div className="p-5 sm:p-6 lg:border-r border-border/50">
                        <div className="text-[12px] font-bold text-muted-foreground mb-2">
                            {copy.questionOf(current + 1, DEMO_QUESTIONS.length)}
                        </div>
                        <p className="text-[15.5px] font-semibold text-foreground leading-[1.55] mb-5">{question.text}</p>

                        <div className="space-y-2.5" role="radiogroup" aria-label={copy.optionsAria}>
                            {question.options.map((option, idx) => {
                                const chosen = answers[current] === idx;
                                return (
                                    <button
                                        key={idx}
                                        role="radio"
                                        aria-checked={chosen}
                                        onClick={() =>
                                            setAnswers((a) => a.map((ans, i) => (i === current ? idx : ans)))
                                        }
                                        className={`w-full flex items-center gap-3 border p-3 rounded-lg text-left transition-colors ${
                                            chosen
                                                ? "border-[#6C3EF4] bg-[#6C3EF4]/[0.06]"
                                                : "border-border hover:bg-secondary/60"
                                        }`}
                                    >
                                        <span
                                            className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                chosen ? "border-[#6C3EF4]" : "border-muted-foreground/40"
                                            }`}
                                            aria-hidden="true"
                                        >
                                            {chosen && <span className="w-2 h-2 rounded-full bg-[#6C3EF4]" />}
                                        </span>
                                        <span className="text-[14px] text-foreground">{option}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-2.5">
                            <button
                                onClick={toggleMark}
                                className={`px-4 py-2.5 rounded-lg text-[13px] font-bold border transition-colors ${
                                    marked[current]
                                        ? "bg-red-500 border-red-500 text-white"
                                        : "border-border text-foreground hover:bg-secondary"
                                }`}
                            >
                                {marked[current] ? copy.marked : copy.markForReview}
                            </button>
                            <button
                                onClick={saveAndNext}
                                className="px-5 py-2.5 rounded-lg bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white text-[13px] font-bold shadow-md shadow-[#6C3EF4]/20 transition-all duration-200"
                            >
                                {copy.saveNext}
                            </button>
                        </div>
                    </div>

                    {/* Question palette — the piece first-timers have never seen. */}
                    <div className="p-5 sm:p-6 bg-secondary/30 border-t lg:border-t-0 border-border/50">
                        <div className="text-[12px] font-bold text-muted-foreground mb-3">{copy.palette}</div>
                        <div className="grid grid-cols-6 lg:grid-cols-5 gap-2 mb-5">
                            {DEMO_QUESTIONS.map((_, i) => (
                                <button
                                    key={`live-${i}`}
                                    onClick={() => goTo(i)}
                                    aria-label={copy.goToQuestion(i + 1)}
                                    className={`h-9 rounded-lg text-[12.5px] font-bold transition-all ${paletteColor(liveStatus(i), i === current)}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                            {DECOR_STATUSES.map((status, i) => (
                                <span
                                    key={`decor-${i}`}
                                    aria-hidden="true"
                                    className={`h-9 rounded-lg text-[12.5px] font-bold flex items-center justify-center opacity-55 ${paletteColor(status, false)}`}
                                >
                                    {i + 4}
                                </span>
                            ))}
                        </div>

                        <div className="space-y-2 text-[11.5px] text-muted-foreground">
                            {[
                                ["bg-green-500", copy.legendAnswered],
                                ["bg-red-500", copy.legendMarked],
                                ["bg-purple-500", copy.legendVisited],
                                ["bg-background border border-border", copy.legendNotVisited],
                            ].map(([swatch, label]) => (
                                <div key={label} className="flex items-center gap-2">
                                    <span className={`w-3.5 h-3.5 rounded ${swatch}`} aria-hidden="true" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 pt-4 border-t border-border/50 text-[12px] text-muted-foreground">
                            <strong className="text-foreground tabular-nums">
                                {answeredCount}/{DEMO_QUESTIONS.length}
                            </strong>{" "}
                            {copy.answeredSuffix}
                        </div>
                    </div>
                </div>
            </div>

            </Reveal>

            <Reveal delay={200}>
                <div className="mt-6 text-center">
                    <button
                        onClick={startFullMock}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[14.5px] font-bold shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 hover:-translate-y-px transition-all duration-200"
                    >
                        {copy.cta} <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </Reveal>
        </section>
    );
};

export default CbtPreview;
