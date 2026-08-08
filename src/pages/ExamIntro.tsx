import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, ClipboardList, Globe, Eye, ArrowLeftRight, Lock, Hourglass, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatMarks, type ScoringConfig } from "@/services/scoringEngine";
import { getExamViewer, resolveExamAccess, type ExamAccessMode } from "@/lib/examAccess";
import CreatorExamBlocked from "@/components/CreatorExamBlocked";
import InstructionText from "@/components/exam/InstructionText";
import { readNavigationSettings } from "@/lib/examSettings";
import { reconcileTimingLine } from "@/lib/examInstructionEngine.js";
import { sumSectionMinutes, totalExamMinutes } from "@/lib/examNavigation.js";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳" },
];

type Exam = {
    id: string;
    name: string;
    description: string | null;
    description_translations?: Record<string, string> | null;
    instruction: string | null;
    instruction_translations?: Record<string, string> | null;
    exam_instruction?: string | null;
    exam_instruction_translations?: Record<string, string> | null;
    user_id: string;
    published_languages?: string[];
    supported_languages?: string[];
};

// Per-section marking display for exams that vary scoring across sections.
// `primarySectionId` is keyed against the PRIMARY language section because
// scoring config is stored on primary-language rows (secondary languages
// resolve via section_group_id at scoring time — see examService).
type SectionMarkingDisplay = {
    primarySectionId: string;
    namesByLanguage: Record<string, string>;
    questionCount: number;
    config: ScoringConfig | null;
};

const ExamIntro = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const [exam, setExam] = useState<Exam | null>(null);
    const [loading, setLoading] = useState(true);
    const [allSections, setAllSections] = useState<any[]>([]);
    const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
    const [publishedLanguages, setPublishedLanguages] = useState<string[]>([]);
    const [markingScheme, setMarkingScheme] = useState<{correct: number, wrong: number, skipped: number} | null>(null);
    const [sectionMarking, setSectionMarking] = useState<SectionMarkingDisplay[]>([]);
    const [hasSectionVariation, setHasSectionVariation] = useState(false);
    const [hasQuestionOverrides, setHasQuestionOverrides] = useState(false);
    const [primaryLanguage, setPrimaryLanguage] = useState<string>("en");
    const [totalMaxMarks, setTotalMaxMarks] = useState<number>(0);
    const [totalQuestionCount, setTotalQuestionCount] = useState<number>(0);
    const [unscoredQuestionCount, setUnscoredQuestionCount] = useState<number>(0);
    // "take" for students/guests, "preview" for the exam's own creator,
    // "blocked" for a creator on someone else's exam.
    const [access, setAccess] = useState<ExamAccessMode>("take");
    const isPreview = access === "preview";
    // How the paper is timed. A student is entitled to know whether they can
    // come back to a section BEFORE they start planning their first one.
    const [allowSectionSwitching, setAllowSectionSwitching] = useState(false);
    const [paperMinutes, setPaperMinutes] = useState(0);
    const [sectionCount, setSectionCount] = useState(0);
    /**
     * Two screens, not one scroll. A candidate about to sit a three-hour paper
     * reads the general rules once and the exam's own instructions once, and a
     * single column that runs past the fold turns both into something to flick
     * past on the way to the Start button. Splitting them puts a deliberate
     * beat between "how an exam works here" and "what THIS exam expects", and
     * makes the second screen the last thing read before question 1.
     */
    const [step, setStep] = useState(0);
    const bodyRef = useRef<HTMLDivElement | null>(null);
    /**
     * The declaration. Deliberately un-ticked on every arrival and never
     * remembered: its whole value is that the candidate read it *this* time, and
     * a box that arrives pre-ticked is a box nobody reads. It gates Start rather
     * than warning after the fact, because after the fact the clock is running.
     */
    const [accepted, setAccepted] = useState(false);

    // Screen 2 starts at its own first line — see the same reset in the runner.
    useEffect(() => {
        bodyRef.current?.scrollTo({ top: 0 });
    }, [step]);

    const fromPage = searchParams.get("from");

    useEffect(() => {
        if (examId) {
            fetchExamData();
        }
    }, [examId]);

    const fetchExamData = async () => {
        try {
            setLoading(true);
            // Fetch Exam (and who's asking — independent, so run them together)
            const [{ data: examData, error: examError }, viewer] = await Promise.all([
                supabase.from("exams").select("*").eq("id", examId).single(),
                getExamViewer(),
            ]);

            if (examError) throw examError;
            const examRecord = examData as unknown as Exam;

            // Creator accounts can only ever PREVIEW their own exam; anyone
            // else's is blocked before any of it is loaded or rendered.
            const mode = resolveExamAccess(viewer, (examData as any).user_id);
            setAccess(mode);
            if (mode === "blocked") return;

            setExam(examRecord);

            // A creator previewing their own exam should see every language they
            // authored, not just the published ones — same as the editor's
            // "Preview" button (?from=edit) has always done.
            const isEditPreview = searchParams.get("from") === "edit" || mode === "preview";
            const requestedLang = searchParams.get("lang");

            const pubLangs = isEditPreview 
                ? ((examData as any).supported_languages || ["en"]) 
                : ((examData as any).published_languages || ["en"]);
            
            setPublishedLanguages(pubLangs);

            // Auto-select language from URL if present and valid
            if (requestedLang && pubLangs.includes(requestedLang)) {
                setSelectedLanguage(requestedLang);
            } else if (pubLangs.length === 1) {
                // If only one language, auto-select it
                setSelectedLanguage(pubLangs[0]);
            }

            // Fetch ALL Sections (include name + section_group_id so the marking
            // scheme display below can show per-section breakdowns and resolve
            // localized section names for multi-language exams).
            const { data: sections, error: sectionsError } = await supabase
                .from("sections")
                .select("id, name, language, sort_order, section_group_id, time_minutes")
                .eq("exam_id", examId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });

            if (sectionsError) throw sectionsError;

            setAllSections(sections || []);

            // Timing summary, per language variant so the minutes shown are the
            // ones this student will actually get.
            const navSettings = readNavigationSettings(examData);
            const introLang = (requestedLang && pubLangs.includes(requestedLang))
                ? requestedLang
                : (pubLangs.length === 1 ? pubLangs[0] : ((examData as any).primary_language || "en"));
            const langSecs = (sections || []).filter((s: any) => s.language === introLang);
            const timedSecs = langSecs.length > 0 ? langSecs : (sections || []);
            setAllowSectionSwitching(navSettings.allow_section_switching);
            setSectionCount(timedSecs.length);
            setPaperMinutes(
                navSettings.allow_section_switching
                    ? totalExamMinutes(navSettings, timedSecs)
                    : sumSectionMinutes(timedSecs)
            );

            // Fetch marks config for marking scheme display.
            // Layered lookup: exam default + per-section overrides + per-question overrides.
            // If sections vary in their effective config, the intro renders a per-section
            // breakdown instead of a single +/-/skip card so students aren't surprised
            // mid-exam by a section with different marks.
            try {
                const { getExamScoringDefault, getSectionScoringDefaults, getQuestionScoringConfigs }
                    = await import('@/services/scoringService');

                // Scoring config lives on PRIMARY-language sections/questions; secondary
                // languages resolve via section_group_id at scoring time. So fetch primary.
                const primaryLang: string = (examData as any).primary_language || "en";
                const supportedLangs: string[] = (examData as any).supported_languages || ["en"];
                const isMultiLang = supportedLangs.length > 1;
                setPrimaryLanguage(primaryLang);

                const allSecs = sections || [];
                const primarySecs = isMultiLang
                    ? allSecs.filter((s: any) => s.language === primaryLang)
                    : allSecs;
                const primarySecIds = primarySecs.map((s: any) => s.id);

                // Question rows per primary section. Kept around (not just IDs) so the
                // total-marks loop below can resolve each question's effective config
                // (question override → section override → exam default → null).
                let allQuestionRows: { id: string; section_id: string }[] = [];
                const questionCounts = new Map<string, number>();
                if (primarySecIds.length > 0) {
                    const { data: qsData } = await supabase
                        .from("parsed_questions")
                        .select("id, section_id")
                        .in("section_id", primarySecIds);
                    allQuestionRows = ((qsData || []) as any[]).map((q) => ({
                        id: q.id as string,
                        section_id: q.section_id as string,
                    }));
                    allQuestionRows.forEach((q) => {
                        questionCounts.set(q.section_id, (questionCounts.get(q.section_id) || 0) + 1);
                    });
                }
                const allQuestionIds = allQuestionRows.map((q) => q.id);

                const [examDefault, sectionConfigs, questionConfigs] = await Promise.all([
                    getExamScoringDefault(examId!),
                    getSectionScoringDefaults(primarySecIds),
                    getQuestionScoringConfigs(allQuestionIds),
                ]);

                if (examDefault) {
                    setMarkingScheme({
                        correct: examDefault.marks_correct,
                        wrong: examDefault.marks_wrong,
                        skipped: examDefault.marks_skipped,
                    });
                }

                // Build per-section marking. Strip show_marks_in_simulator from the
                // exam default so the effective config matches ScoringConfig shape.
                const fallbackFromExam: ScoringConfig | null = examDefault ? {
                    marks_correct: examDefault.marks_correct,
                    marks_wrong: examDefault.marks_wrong,
                    marks_skipped: examDefault.marks_skipped,
                    mcq_mode: examDefault.mcq_mode,
                    mcq_wrong_penalty: examDefault.mcq_wrong_penalty,
                    rounding_strategy: examDefault.rounding_strategy,
                } : null;

                const sectionMarkingArr: SectionMarkingDisplay[] = primarySecs
                    .map((s: any) => {
                        const effective = sectionConfigs.get(s.id) ?? fallbackFromExam;

                        // Localized names: walk siblings via section_group_id
                        const namesByLang: Record<string, string> = { [primaryLang]: s.name };
                        if (isMultiLang && s.section_group_id) {
                            allSecs.forEach((other: any) => {
                                if (
                                    other.section_group_id === s.section_group_id
                                    && other.language
                                    && other.language !== primaryLang
                                ) {
                                    namesByLang[other.language] = other.name;
                                }
                            });
                        }

                        return {
                            primarySectionId: s.id,
                            namesByLanguage: namesByLang,
                            questionCount: questionCounts.get(s.id) || 0,
                            config: effective,
                        };
                    })
                    .filter((sm: SectionMarkingDisplay) => sm.questionCount > 0);

                setSectionMarking(sectionMarkingArr);

                // Section-level variation: do any two sections have different effective configs?
                const configsAreEqual = (a: ScoringConfig | null, b: ScoringConfig | null) => {
                    if (!a || !b) return a === b;
                    return a.marks_correct === b.marks_correct
                        && a.marks_wrong === b.marks_wrong
                        && a.marks_skipped === b.marks_skipped
                        && a.mcq_mode === b.mcq_mode
                        && a.mcq_wrong_penalty === b.mcq_wrong_penalty
                        && a.rounding_strategy === b.rounding_strategy;
                };
                if (sectionMarkingArr.length > 1) {
                    const first = sectionMarkingArr[0].config;
                    setHasSectionVariation(
                        !sectionMarkingArr.every((sm) => configsAreEqual(sm.config, first))
                    );
                }

                setHasQuestionOverrides(questionConfigs.size > 0);

                // Problem 5: total possible marks across all questions, using each
                // question's effective scoring config (question override → section
                // override → exam default). Questions with no config at any level
                // contribute 0 and are flagged as unscored so the student is warned
                // about partial coverage on the intro screen.
                let computedTotalMax = 0;
                let computedUnscored = 0;
                for (const q of allQuestionRows) {
                    const effective =
                        questionConfigs.get(q.id) ??
                        sectionConfigs.get(q.section_id) ??
                        fallbackFromExam;
                    if (effective) {
                        computedTotalMax += effective.marks_correct;
                    } else {
                        computedUnscored++;
                    }
                }
                setTotalMaxMarks(Math.round(computedTotalMax * 100) / 100);
                setTotalQuestionCount(allQuestionRows.length);
                setUnscoredQuestionCount(computedUnscored);
            } catch (e) {
                // Non-fatal — exam still loads without marking display
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to load exam details",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleStartExam = () => {
        const lang = selectedLanguage || "en";

        // Find the first section matching the selected language
        const langSections = allSections.filter(s => (s as any).language === lang);

        // Fallback: if no sections match (legacy data), use first section
        const firstSection = langSections.length > 0
            ? langSections[0]
            : allSections[0];

        if (firstSection) {
            // No "preview" flag travels in the URL: the simulator re-derives the
            // access mode from the signed-in account, so there is nothing to
            // hand-edit to turn a preview into a real attempt.
            navigate(`/exam/${examId}/section/${firstSection.id}/simulator?lang=${lang}`);
        } else {
            toast({
                title: "No sections",
                description: "This exam has no sections to start.",
                variant: "destructive",
            });
        }
    };

    const handleBack = () => {
        if (fromPage === "marketplace") {
            navigate("/marketplace");
        } else {
            navigate("/dashboard");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">Loading exam details...</div>
            </div>
        );
    }

    if (access === "blocked") return <CreatorExamBlocked />;

    if (!exam) return null;

    const isMultiLang = publishedLanguages.length > 1;
    const displayLanguage = selectedLanguage || publishedLanguages[0] || "en";

    const displayDescription = 
        (exam.description_translations && exam.description_translations[displayLanguage]) || 
        (exam.description_translations && exam.description_translations['en']) || 
        exam.description;

    const displayGeneralInstruction =
        (exam.instruction_translations && exam.instruction_translations[displayLanguage]) ||
        (exam.instruction_translations && exam.instruction_translations['en']) ||
        exam.instruction;

    const displayExamInstruction =
        (exam.exam_instruction_translations && exam.exam_instruction_translations[displayLanguage]) ||
        (exam.exam_instruction_translations && exam.exam_instruction_translations['en']) ||
        exam.exam_instruction;

    /**
     * The instructions, with any generated timing sentence brought back in line
     * with the paper as it stands right now.
     *
     * Stored instruction text is a snapshot of the exam at the moment someone
     * pressed "Generate from exam". Change the timing afterwards and the
     * sentence keeps promising the old number — 155 minutes on a paper that now
     * gives 120 — directly above the panel stating the real one. Correcting it
     * here means nobody is shown the wrong figure: not the candidate, and not
     * the creator previewing, who must see exactly what the candidate sees.
     *
     * Only sentences this app's own generator wrote are touched, and only in the
     * language they were written in; a creator's own wording is left alone and
     * flagged in the editor instead, which is the only place it can be fixed.
     */
    const displayedExamInstruction = reconcileTimingLine(
        displayExamInstruction || "",
        {
            sections: allSections
                .filter((s: any) => !s.language || s.language === displayLanguage)
                .map((s: any) => ({ name: s.name, minutes: s.time_minutes, questionCount: null })),
            allowSectionSwitching,
            totalMinutes: paperMinutes,
            marking: null,
            answerTypes: null,
            languageNames: null,
        },
        displayLanguage
    ).text;

    // Everything that has to be true before the clock can start, and — when one
    // of them is not — what to say about it. A disabled button with no stated
    // reason is the same as a broken one.
    const blockedReason =
        allSections.length === 0
            ? "This exam has no sections yet."
            : isMultiLang && !selectedLanguage
                ? "Choose a language to continue."
                : !accepted
                    ? "Tick the declaration to continue."
                    : null;
    const canStart = blockedReason === null;

    return (
        // exam-frame, the same viewport-height frame the runner uses: the card
        // below fills it, its body scrolls, and the step buttons stay put.
        <div className="exam-frame relative flex flex-col bg-background">
            {/* Subtle ambient orbs */}
            <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-[#6C3EF4]/6 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-[#A855F7]/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                {/* Brand bar — its own strip across the top of the screen now,
                    not a caption floating above a card. */}
                <div className="shrink-0 flex items-center justify-between border-b border-border/60 bg-card px-4 py-3 sm:px-6">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {fromPage === "marketplace" ? "Back to Exam Library" : "Back to Dashboard"}
                    </button>
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                            <defs>
                                <linearGradient id="intro-logo" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#6C3EF4" /><stop offset="100%" stopColor="#A855F7" />
                                </linearGradient>
                            </defs>
                            <path d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22" stroke="url(#intro-logo)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <path d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22" stroke="url(#intro-logo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
                        </svg>
                        <span className="text-sm font-bold text-foreground tracking-tight">
                            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
                        </span>
                    </div>
                </div>

                {/* The screen itself, not a card floating in it: header, scrolling
                    body and pinned step buttons all run edge to edge. The rails
                    inside cap the measure at max-w-7xl — the same cap the exam
                    runner uses, so the two screens line up — and the instruction
                    text below splits into columns rather than stretching to a
                    200-character line, which is the actual reason a narrow card
                    was there in the first place. */}
                <div className="flex w-full min-h-0 flex-1 flex-col bg-card">
                    {/* Header gradient bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-[#6C3EF4] via-[#8B5CF6] to-[#A855F7]" />

                    {/* Which exam, which screen. Stays put across both steps so
                        the paper's name is never scrolled away. */}
                    <div className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
                      <div className="mx-auto w-full max-w-7xl">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#A855F7] uppercase tracking-widest bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 px-2 py-0.5 rounded-full">
                                {isPreview ? "Preview" : "Exam"}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Step {step + 1} of 2 · {step === 0 ? "Before you begin" : "Exam instructions"}
                            </span>
                        </div>
                        <h1 className="mt-1.5 text-xl sm:text-2xl font-bold text-foreground leading-snug line-clamp-2">
                            {exam.name}
                        </h1>
                        <div className="mt-3 flex gap-1.5" aria-hidden>
                            {[0, 1].map((i) => (
                                <span
                                    key={i}
                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                        i <= step ? "bg-[#6C3EF4]" : "bg-border"
                                    }`}
                                />
                            ))}
                        </div>
                      </div>
                    </div>

                    <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                      <div className="mx-auto w-full max-w-7xl space-y-5">
                      {step === 0 ? (
                        <>
                        {/* Creator preview notice — a preview is never scored or saved */}
                        {isPreview && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                                <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                <div className="space-y-0.5">
                                    <h3 className="font-semibold text-foreground text-sm">Preview mode</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        You're viewing your own exam as a creator. Nothing you answer here is
                                        scored, saved, or counted in analytics.
                                    </p>
                                </div>
                            </div>
                        )}

                        {displayDescription && (
                            <p className="text-muted-foreground text-sm leading-relaxed">{displayDescription}</p>
                        )}

                        {/* General Instructions */}
                        {displayGeneralInstruction && (
                            <div className="rounded-xl border border-[#6C3EF4]/20 bg-[#6C3EF4]/5 p-4 space-y-2">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <BookOpen className="h-4 w-4 text-[#A855F7]" />
                                    General Instructions
                                </h3>
                                {/* One vertical flow. Columns were tried here and
                                    were wrong: a numbered list has an order, and
                                    CSS columns cut item 4 in half to balance the
                                    gap — "…any number of times" at the foot of
                                    one column, "before you submit." at the head
                                    of the next. max-w-4xl instead caps the line
                                    length, which was the only thing the columns
                                    were really buying. */}
                                {/* InstructionText, not a bare <p>: legend lines
                                    written as [green]/[red]/… tokens render as
                                    the palette's own colour tiles. */}
                                <InstructionText
                                    text={displayGeneralInstruction}
                                    className="max-w-4xl text-sm text-muted-foreground leading-relaxed"
                                />
                            </div>
                        )}

                        {/* This paper's own instructions, its format and its
                            marking are all screen 2 — see below. */}

                        </>
                      ) : (
                        <>
                        {/* Screen 2: everything specific to THIS paper — its own
                            instructions, how it is timed, what the questions are
                            worth — and the choice that gates starting. Screen 1
                            is how an exam works here; this is what this one asks
                            of you, and it is the last thing read before Start.

                            Two columns from lg: the paper's own instructions run
                            full width above, the format and marking cards sit
                            side by side under them. */}
                        <div className="grid items-start gap-5 lg:grid-cols-2">
                        {displayExamInstruction ? (
                            <div className="lg:col-span-2 rounded-xl border border-[#6C3EF4]/20 bg-[#6C3EF4]/5 p-4 space-y-2">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <ClipboardList className="h-4 w-4 text-[#A855F7]" />
                                    Exam Instructions
                                </h3>
                                <InstructionText
                                    text={displayedExamInstruction}
                                    className="max-w-4xl text-sm text-muted-foreground leading-relaxed"
                                />
                            </div>
                        ) : (
                            // No exam-specific instructions on this paper. Say so
                            // rather than opening screen 2 on the format card with
                            // no explanation of what happened to the instructions.
                            <div className="lg:col-span-2 rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <ListChecks className="h-4 w-4 text-[#A855F7]" />
                                    You're ready to begin
                                </h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    This paper has no instructions of its own beyond the general ones on the
                                    previous screen. The clock starts when you press {isPreview ? "Preview" : "Start"}.
                                </p>
                            </div>
                        )}

                        {/* Exam format — how the clock works and whether sections
                            can be revisited. Both are decisions the candidate has
                            to make before question 1, not after. */}
                        {sectionCount > 0 && (
                            <div className={`rounded-xl border p-4 ${
                                allowSectionSwitching
                                    ? "border-[#6C3EF4]/25 bg-[#6C3EF4]/[0.06]"
                                    : "border-border/60 bg-muted/30"
                            }`}>
                                <div className="flex items-start gap-3">
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        allowSectionSwitching
                                            ? "bg-[#6C3EF4]/15 text-[#6C3EF4]"
                                            : "bg-muted text-muted-foreground"
                                    }`}>
                                        {allowSectionSwitching
                                            ? <ArrowLeftRight className="h-4 w-4" />
                                            : <Lock className="h-3.5 w-3.5" />}
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <h3 className="font-semibold text-foreground text-sm">
                                            {allowSectionSwitching
                                                ? "You can switch between sections"
                                                : "One section at a time"}
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {allowSectionSwitching ? (
                                                <>
                                                    All {sectionCount} section{sectionCount === 1 ? "" : "s"} share one
                                                    clock. Move between them in any order and revisit any answer until
                                                    you submit.
                                                </>
                                            ) : (
                                                <>
                                                    {sectionCount} section{sectionCount === 1 ? "" : "s"}, each on its own
                                                    clock, sat in order. A section you submit cannot be reopened.
                                                </>
                                            )}
                                        </p>
                                        {paperMinutes > 0 && (
                                            <p className="flex items-center gap-1.5 text-xs text-foreground/80 pt-0.5">
                                                <Hourglass className="h-3 w-3 text-[#A855F7]" />
                                                <span className="font-bold tabular-nums">{paperMinutes} min</span>
                                                <span className="text-muted-foreground">
                                                    {allowSectionSwitching ? "for the whole paper" : "total across all sections"}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Marking Scheme */}
                        {(markingScheme || hasSectionVariation || hasQuestionOverrides) && (
                            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                                <div className="mb-3">
                                    <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                        <svg className="h-4 w-4 text-[#6C3EF4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 3v18m-6-6 6 6 6-6" />
                                        </svg>
                                        Marking Scheme
                                    </h3>
                                    {totalMaxMarks > 0 && (
                                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                                            <span className="font-bold text-foreground">{formatMarks(totalMaxMarks)}</span> marks total
                                            {totalQuestionCount > 0 && ` · ${totalQuestionCount} question${totalQuestionCount === 1 ? "" : "s"}`}
                                            {unscoredQuestionCount > 0 && (
                                                <span className="text-amber-700 dark:text-amber-400 ml-1">
                                                    · {unscoredQuestionCount} unscored
                                                </span>
                                            )}
                                        </p>
                                    )}
                                </div>

                                {hasSectionVariation ? (
                                    // Per-section breakdown: marking varies between sections,
                                    // so a single +/-/skip row would mislead the student.
                                    <div className="space-y-2">
                                        {sectionMarking.map((sm) => {
                                            const name =
                                                sm.namesByLanguage[displayLanguage]
                                                || sm.namesByLanguage[primaryLanguage]
                                                || Object.values(sm.namesByLanguage)[0]
                                                || "Section";
                                            return (
                                                <div key={sm.primarySectionId} className="flex items-center justify-between gap-3 text-sm">
                                                    <div className="text-foreground font-medium min-w-0 truncate">
                                                        {name}
                                                        <span className="text-muted-foreground font-normal ml-2 text-xs">({sm.questionCount} Q)</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {sm.config ? (
                                                            <>
                                                                <span className="font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 text-xs">+{formatMarks(sm.config.marks_correct)}</span>
                                                                {sm.config.marks_wrong > 0 && (
                                                                    <span className="font-bold text-white bg-red-600 rounded-full px-2 py-0.5 text-xs">−{formatMarks(sm.config.marks_wrong)}</span>
                                                                )}
                                                                {sm.config.marks_skipped > 0 && (
                                                                    <span className="font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">−{formatMarks(sm.config.marks_skipped)}</span>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">unscored</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : markingScheme ? (
                                    // Uniform scheme — preserved exactly as before.
                                    <div className="flex items-center gap-4 text-sm">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 text-xs">+{formatMarks(markingScheme.correct)}</span>
                                            <span className="text-muted-foreground">Correct</span>
                                        </div>
                                        {markingScheme.wrong > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-white bg-red-600 rounded-full px-2 py-0.5 text-xs">−{formatMarks(markingScheme.wrong)}</span>
                                                <span className="text-muted-foreground">Wrong</span>
                                            </div>
                                        )}
                                        {markingScheme.skipped > 0 && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">−{formatMarks(markingScheme.skipped)}</span>
                                                <span className="text-muted-foreground">Skipped</span>
                                            </div>
                                        )}
                                    </div>
                                ) : hasQuestionOverrides ? (
                                    // Only question-level overrides exist — no overall scheme to summarize.
                                    // Students still see per-question badges in the simulator.
                                    <p className="text-xs text-muted-foreground italic">
                                        Marks vary by question — check each question's badge during the exam.
                                    </p>
                                ) : null}

                                {hasQuestionOverrides && (markingScheme || hasSectionVariation) && (
                                    <p className="text-[11px] text-muted-foreground/70 mt-3 italic">
                                        * Some individual questions may have different marks from those shown above.
                                    </p>
                                )}
                            </div>
                        )}
                        {/* Language Selection for Multi-Language Exams */}
                        {isMultiLang && (
                            <div className="lg:col-span-2 rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <Globe className="h-4 w-4 text-[#6C3EF4]" />
                                    Choose Your Language
                                </h3>
                                <p className="text-xs text-muted-foreground">This exam is available in multiple languages. Select your preferred language to begin.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {publishedLanguages.map((langCode) => {
                                        const langInfo = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                                        const isSelected = selectedLanguage === langCode;
                                        return (
                                            <button
                                                key={langCode}
                                                onClick={() => setSelectedLanguage(langCode)}
                                                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                                                    isSelected
                                                        ? "border-[#6C3EF4] bg-[#6C3EF4]/8 shadow-sm shadow-[#6C3EF4]/15"
                                                        : "border-border/50 bg-card hover:border-[#6C3EF4]/40 hover:bg-secondary/50"
                                                }`}
                                            >
                                                <span className="text-xl">{langInfo?.flag || "🌐"}</span>
                                                <div className="flex-1">
                                                    <div className="font-semibold text-foreground text-sm">{langInfo?.label || langCode}</div>
                                                    {langInfo?.nativeLabel && langInfo.nativeLabel !== langInfo.label && (
                                                        <div className="text-xs text-muted-foreground">{langInfo.nativeLabel}</div>
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <div className="h-5 w-5 rounded-full bg-[#6C3EF4] flex items-center justify-center shrink-0">
                                                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Declaration — the last thing on the last screen, and
                            the gate on Start. */}
                        <div
                            className={`lg:col-span-2 rounded-xl border p-4 transition-colors ${
                                accepted
                                    ? "border-[#6C3EF4]/30 bg-[#6C3EF4]/[0.05]"
                                    : "border-border/60 bg-muted/30"
                            }`}
                        >
                            <label htmlFor="exam-declaration" className="flex items-start gap-3 cursor-pointer">
                                <Checkbox
                                    id="exam-declaration"
                                    checked={accepted}
                                    onCheckedChange={(next) => setAccepted(next === true)}
                                    className="mt-0.5 shrink-0"
                                />
                                <span className="text-sm leading-relaxed text-muted-foreground">
                                    <span className="font-semibold text-foreground">Declaration. </span>
                                    I have read and understood all the instructions above. I agree not to
                                    communicate with anyone, or use any unfair means, while this exam is in
                                    progress. I understand that using unfair means of any kind — for my own
                                    or anyone else's advantage — will lead to this attempt being
                                    disqualified, and that MockSetu's decision in such matters is final.
                                </span>
                            </label>
                        </div>

                        </div>
                        </>
                      )}
                      </div>
                    </div>

                    {/* Locked footer. Outside the scrolling body, so Next and Back
                        are on the screen at the same place on both steps however
                        long the instructions run. */}
                    <div className="shrink-0 border-t border-border/60 bg-foreground/[0.02] px-4 py-3 sm:px-6">
                      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
                        {step === 0 ? (
                            <>
                                <p className="min-w-0 text-xs text-muted-foreground">
                                    <span className="hidden sm:inline">Read the general instructions, then continue.</span>
                                    <span className="sm:hidden">Then continue.</span>
                                </p>
                                <Button
                                    onClick={() => setStep(1)}
                                    className="shrink-0 h-11 px-6 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold shadow-lg shadow-[#6C3EF4]/30"
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4 ml-1.5" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setStep(0)}
                                    className="shrink-0 h-11 rounded-xl"
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1.5" />
                                    Back
                                </Button>
                                <div className="flex min-w-0 items-center justify-end gap-3">
                                    {blockedReason && (
                                        <p className="hidden sm:block text-xs text-muted-foreground">
                                            {blockedReason}
                                        </p>
                                    )}
                                    <button
                                        onClick={handleStartExam}
                                        disabled={!canStart}
                                        className="shrink-0 h-11 px-6 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-base shadow-lg shadow-[#6C3EF4]/30 hover:shadow-xl hover:shadow-[#6C3EF4]/40 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                                    >
                                        {isPreview ? <Eye className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                                        {isPreview ? "Preview Exam" : "Start Exam"}
                                    </button>
                                </div>
                            </>
                        )}
                      </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamIntro;

