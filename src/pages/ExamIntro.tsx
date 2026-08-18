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
import { rememberLastExam } from "@/lib/lastExamMemo";
import CreatorExamBlocked from "@/components/CreatorExamBlocked";
import InstructionText from "@/components/exam/InstructionText";
import { readNavigationSettings } from "@/lib/examSettings";
import { dropShapeLine, reconcileTimingLine } from "@/lib/examInstructionEngine.js";
import { sumSectionMinutes, totalExamMinutes } from "@/lib/examNavigation.js";
import { fetchTimingGroups, type TimingGroupRow } from "@/lib/timingGroupSettings";
import {
  groupDisplayName,
  hasGroupUnits,
  resolveTimingGroupIds,
  sumUnitMinutes,
  timingUnits,
} from "@/lib/timingGroups.js";

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
    /** Sum of resolved marks_correct over the section's questions — the paper table's Marks column. */
    maxMarks: number;
};

/**
 * The paper at a glance — the table every big platform opens its exam
 * instructions with: one row per section, questions, maximum marks, and (for
 * papers sat one section at a time) each section's clock. Built from LIVE exam
 * data at view time, never parsed out of the stored instruction text, so it
 * cannot go stale the way prose does; the engine-written sentence repeating
 * these numbers is dropped from display while the table is present
 * (dropShapeLine), leaving the prose to say what a table cannot.
 *
 * Columns appear only when they have something true to show: Maximum Marks
 * needs a marking scheme somewhere on the paper, Sectional Timing is only a
 * fact in locked mode (a free paper's sections share one clock, stated in
 * prose), and a section with no clock set shows — rather than a number the
 * runner would not enforce.
 */
type PaperTableRow = {
    name: string;
    questions: number;
    maxMarks: number;
    minutes: number | null;
    /**
     * Shared-pool annotation (timing groups). Present on every member of a
     * group; the FIRST member renders one pooled timing cell spanning the
     * whole group, because per-member minutes are clocks the runner does not
     * enforce — the pool is the only true number.
     */
    group?: { key: string; name: string; minutes: number; size: number; indexInGroup: number } | null;
};

const PAPER_TABLE_LABELS: Record<string, { sl: string; section: string; questions: string; marks: string; time: string; total: string; min: string; shared: string }> = {
    en: { sl: "Sl No.", section: "Section Name", questions: "No. of Questions", marks: "Maximum Marks", time: "Sectional Timing", total: "Total", min: "min", shared: "shared" },
    hi: { sl: "क्रम", section: "खंड का नाम", questions: "प्रश्नों की संख्या", marks: "अधिकतम अंक", time: "खंड का समय", total: "कुल", min: "मिनट", shared: "साझा" },
};

const PaperTable = ({ rows, lang, showTime }: { rows: PaperTableRow[]; lang: string; showTime: boolean }) => {
    const labels = PAPER_TABLE_LABELS[lang] ?? PAPER_TABLE_LABELS.en;
    const showMarks = rows.some((r) => r.maxMarks > 0);
    // The paper's time: pools count once per group, solo clocks as-is; any
    // unknown clock silences the total rather than understating it.
    const timeTotal = (() => {
        let total = 0;
        let known = true;
        const pooled = new Set<string>();
        for (const r of rows) {
            if (r.group) {
                if (pooled.has(r.group.key)) continue;
                pooled.add(r.group.key);
                if (r.group.minutes > 0) total += r.group.minutes;
                else known = false;
            } else if (r.minutes !== null) {
                total += r.minutes;
            } else {
                known = false;
            }
        }
        return known ? total : null;
    })();
    const cell = "border border-border/60 px-3 py-2";
    return (
        <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
                <thead>
                    <tr className="bg-[#6C3EF4]/10 text-left text-foreground">
                        <th className={`${cell} font-semibold`}>{labels.sl}</th>
                        <th className={`${cell} font-semibold`}>{labels.section}</th>
                        <th className={`${cell} font-semibold`}>{labels.questions}</th>
                        {showMarks && <th className={`${cell} font-semibold`}>{labels.marks}</th>}
                        {showTime && <th className={`${cell} font-semibold`}>{labels.time}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? "bg-muted/40" : "bg-card"}>
                            <td className={`${cell} tabular-nums`}>{i + 1}</td>
                            <td className={cell}>{r.name}</td>
                            <td className={`${cell} tabular-nums`}>{r.questions}</td>
                            {showMarks && <td className={`${cell} tabular-nums`}>{formatMarks(r.maxMarks)}</td>}
                            {showTime &&
                                (r.group ? (
                                    r.group.indexInGroup === 0 ? (
                                        // One pooled cell for the whole group — the only
                                        // clock the runner enforces over these rows.
                                        <td className={`${cell} tabular-nums align-middle`} rowSpan={r.group.size}>
                                            {r.group.minutes > 0 ? `${r.group.minutes} ${labels.min}` : "—"}
                                            <span className="block text-[11px] font-medium text-muted-foreground">
                                                {r.group.name} · {labels.shared}
                                            </span>
                                        </td>
                                    ) : null
                                ) : (
                                    <td className={`${cell} tabular-nums`}>
                                        {r.minutes !== null ? `${r.minutes} ${labels.min}` : "—"}
                                    </td>
                                ))}
                        </tr>
                    ))}
                    {rows.length > 1 && (
                        <tr className="bg-muted/60 font-semibold text-foreground">
                            <td className={cell} colSpan={2}>{labels.total}</td>
                            <td className={`${cell} tabular-nums`}>{rows.reduce((n, r) => n + r.questions, 0)}</td>
                            {showMarks && (
                                <td className={`${cell} tabular-nums`}>
                                    {formatMarks(Math.round(rows.reduce((n, r) => n + r.maxMarks, 0) * 100) / 100)}
                                </td>
                            )}
                            {showTime && (
                                <td className={`${cell} tabular-nums`}>
                                    {timeTotal !== null ? `${timeTotal} ${labels.min}` : "—"}
                                </td>
                            )}
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
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
    /** Timing groups (shared pools). [] on an un-migrated database — solo behavior. */
    const [timingGroups, setTimingGroups] = useState<TimingGroupRow[]>([]);
    /**
     * PRIMARY section ids that have at least one question. The runner drops
     * question-less members from a part (and a part down to one survivor runs
     * solo), so the format card must derive its units from the same picture —
     * or it promises a pool the runner will not enforce. null = counts unknown
     * (the marks fetch failed): derive from every section rather than guess.
     */
    const [questionedPrimaryIds, setQuestionedPrimaryIds] = useState<Set<string> | null>(null);
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

            // Breadcrumb for the home page's "pick up where you left off" card.
            // Written here — the one door every exam start walks through — and
            // only for students: a creator previewing their own paper is not a
            // visitor who wants to be pulled back into it.
            if (mode !== "preview") {
                rememberLastExam({
                    id: examRecord.id,
                    name: examRecord.name,
                    category: (examData as any).exam_category ?? null,
                });
            }

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

            // Fetch ALL Sections (select * so the hand-migrated timing_group_id
            // rides along when the live schema has it — naming it in a column
            // list would fail the whole query pre-migration) plus the exam's
            // timing groups, which resolve to [] on an un-migrated database.
            const [{ data: sections, error: sectionsError }, groupRows] = await Promise.all([
                supabase
                    .from("sections")
                    .select("*")
                    .eq("exam_id", examId)
                    .order("sort_order", { ascending: true })
                    .order("created_at", { ascending: true }),
                fetchTimingGroups(examId!),
            ]);

            if (sectionsError) throw sectionsError;

            setAllSections(sections || []);
            setTimingGroups(groupRows);

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
                setQuestionedPrimaryIds(new Set(allQuestionRows.map((q) => q.section_id)));
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
                            maxMarks: 0, // filled below, once per-question overrides are resolved
                        };
                    })
                    .filter((sm: SectionMarkingDisplay) => sm.questionCount > 0);

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
                // about partial coverage on the intro screen. Per-section subtotals
                // ride along for the paper table's Maximum Marks column.
                let computedTotalMax = 0;
                let computedUnscored = 0;
                const sectionMax = new Map<string, number>();
                for (const q of allQuestionRows) {
                    const effective =
                        questionConfigs.get(q.id) ??
                        sectionConfigs.get(q.section_id) ??
                        fallbackFromExam;
                    if (effective) {
                        computedTotalMax += effective.marks_correct;
                        sectionMax.set(
                            q.section_id,
                            (sectionMax.get(q.section_id) || 0) + effective.marks_correct
                        );
                    } else {
                        computedUnscored++;
                    }
                }
                setSectionMarking(
                    sectionMarkingArr.map((sm) => ({
                        ...sm,
                        maxMarks: Math.round((sectionMax.get(sm.primarySectionId) || 0) * 100) / 100,
                    }))
                );
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
    // ── Timing groups: the display language's view of the paper ─────────────
    // Structure comes from the PRIMARY language rows (resolveTimingGroupIds),
    // names from the display language — the same derivation the runner does,
    // so this screen promises exactly what the next one enforces.
    const introSectionRows = allSections.filter(
        (s: any) => !s.language || s.language === displayLanguage
    );
    const introSections = introSectionRows.length > 0 ? introSectionRows : allSections;
    const resolvedGroupIds = resolveTimingGroupIds(allSections, primaryLanguage);
    // Units derive from the sections the runner will actually sit: it drops
    // question-less members from a part, so this screen must too — a promised
    // pool over a section with nothing in it is a clock nobody gets.
    const primaryIdOfDisplay = (s: any): string | null => {
        if (!s.language || s.language === primaryLanguage) return s.id;
        if (!s.section_group_id) return null;
        return (
            allSections.find(
                (x: any) => x.section_group_id === s.section_group_id && x.language === primaryLanguage
            )?.id ?? null
        );
    };
    const unitSections = questionedPrimaryIds
        ? introSections.filter((s: any) => {
              const primaryId = primaryIdOfDisplay(s);
              return primaryId ? questionedPrimaryIds.has(primaryId) : true;
          })
        : introSections;
    const displayUnits =
        !allowSectionSwitching && timingGroups.length > 0
            ? timingUnits(unitSections, timingGroups, resolvedGroupIds)
            : [];
    const groupedPaper = hasGroupUnits(displayUnits);
    /** What the runner will actually enforce across the paper, pools counted once. */
    const effectivePaperMinutes = groupedPaper ? sumUnitMinutes(displayUnits) : paperMinutes;

    const displayedExamInstruction = reconcileTimingLine(
        displayExamInstruction || "",
        {
            // unitSections, not introSections: the healed sentence must state
            // the clocks the runner enforces, and the runner does not sit
            // question-less members of a part.
            sections: unitSections.map((s: any) => ({
                name: s.name,
                minutes: s.time_minutes,
                questionCount: null,
                groupId: resolvedGroupIds.get(s.id) ?? null,
            })),
            allowSectionSwitching,
            totalMinutes: paperMinutes,
            // Group facts ride along ALWAYS when groups exist: without them the
            // self-healing pass would "correct" a true grouped sentence into a
            // stale per-section one — the one lie this feature must never tell.
            groups:
                timingGroups.length > 0
                    ? Object.fromEntries(
                          timingGroups.map((g) => [
                              g.id,
                              { name: groupDisplayName(g, displayLanguage), minutes: g.time_minutes ?? null },
                          ])
                      )
                    : null,
            marking: null,
            answerTypes: null,
            languageNames: null,
        },
        displayLanguage
    ).text;

    // The paper table's rows, in the candidate's language. sectionMarking is
    // keyed by PRIMARY-language section ids (that is where counts and marks
    // live); the name and the clock come from the display language's own row,
    // because in locked mode the runner enforces THAT row's time_minutes.
    // Grouped sections then coalesce into one pooled timing cell per group —
    // the member clocks are numbers the runner does not enforce.
    const paperTableRows: PaperTableRow[] = (() => {
        const base = sectionMarking.map((sm) => {
            const primary = allSections.find((s: any) => s.id === sm.primarySectionId);
            const displayRow = primary?.section_group_id
                ? allSections.find(
                      (s: any) =>
                          s.section_group_id === primary.section_group_id &&
                          s.language === displayLanguage
                  ) ?? primary
                : primary;
            const minutes = Number(displayRow?.time_minutes);
            return {
                name:
                    sm.namesByLanguage[displayLanguage] ??
                    sm.namesByLanguage[primaryLanguage] ??
                    displayRow?.name ??
                    "",
                questions: sm.questionCount,
                maxMarks: sm.maxMarks,
                minutes: Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : null,
                rawGroupId: !allowSectionSwitching
                    ? resolvedGroupIds.get(sm.primarySectionId) ?? null
                    : null,
            };
        });
        const strip = ({ rawGroupId: _ignored, ...row }: (typeof base)[number]): PaperTableRow => row;
        if (!groupedPaper) return base.map(strip);

        const rows: PaperTableRow[] = [];
        for (let i = 0; i < base.length; ) {
            const gid = base[i].rawGroupId;
            const group = gid ? timingGroups.find((g) => g.id === gid) : undefined;
            if (!group) {
                rows.push(strip(base[i]));
                i += 1;
                continue;
            }
            let j = i;
            while (j < base.length && base[j].rawGroupId === gid) j += 1;
            const size = j - i;
            if (size === 1) {
                // A group with one rendered row behaves solo — same rule as the runner.
                rows.push(strip(base[i]));
                i = j;
                continue;
            }
            const memberMinutes = base.slice(i, j).map((r) => r.minutes);
            const pool =
                group.time_minutes && group.time_minutes > 0
                    ? group.time_minutes
                    : memberMinutes.every((m) => m !== null)
                        ? memberMinutes.reduce((n, m) => n + (m || 0), 0)
                        : 0;
            for (let k = i; k < j; k++) {
                rows.push({
                    ...strip(base[k]),
                    group: {
                        key: gid!,
                        name: groupDisplayName(group, displayLanguage),
                        minutes: pool,
                        size,
                        indexInGroup: k - i,
                    },
                });
            }
            i = j;
        }
        return rows;
    })();
    const showPaperTable = paperTableRows.length > 0;

    // With the table on screen, the engine's prose repetition of its numbers
    // comes out of the display (and only engine-written lines — dropShapeLine
    // proves authorship the same way reconcileTimingLine does).
    const shownExamInstruction = showPaperTable
        ? dropShapeLine(displayedExamInstruction, displayLanguage).text
        : displayedExamInstruction;

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
                                {isPreview ? "Student view" : "Exam"}
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
                        {/* Creator "student view" notice. The old copy led with the
                            disclaimer — what the mode is *not*. That answers a
                            question the creator never asked and leaves them with no
                            idea what to look for. Lead instead with the promise
                            (this is your students' screen, word for word), give
                            them three concrete things to judge, and demote the
                            not-scored fact to the reassurance it actually is. */}
                        {isPreview && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
                                <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                <div className="space-y-1.5">
                                    <h3 className="font-semibold text-foreground text-sm">
                                        This is exactly what your students will see
                                    </h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Read it the way they will — cold, with the clock running. Do the
                                        instructions answer their questions before question 1? Is the time
                                        fair? Does every language read right?
                                    </p>
                                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                                        Nothing here is scored or saved — answer freely and leave whenever you like.
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
                            <div className="lg:col-span-2 rounded-xl border border-[#6C3EF4]/20 bg-[#6C3EF4]/5 p-4 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <ClipboardList className="h-4 w-4 text-[#A855F7]" />
                                    Exam Instructions
                                </h3>
                                {/* Sections/questions/marks/timing as a table —
                                    live data, so it is right even when stored
                                    prose has gone stale — with the engine's own
                                    sentence repeating it dropped from the text. */}
                                {showPaperTable && (
                                    <PaperTable
                                        rows={paperTableRows}
                                        lang={displayLanguage}
                                        showTime={!allowSectionSwitching}
                                    />
                                )}
                                <InstructionText
                                    text={shownExamInstruction}
                                    className="max-w-4xl text-sm text-muted-foreground leading-relaxed"
                                />
                            </div>
                        ) : (
                            // No exam-specific instructions on this paper. The
                            // table still earns its place — its numbers come from
                            // the paper, not the missing prose.
                            <div className="lg:col-span-2 rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <ListChecks className="h-4 w-4 text-[#A855F7]" />
                                    You're ready to begin
                                </h3>
                                {showPaperTable && (
                                    <PaperTable
                                        rows={paperTableRows}
                                        lang={displayLanguage}
                                        showTime={!allowSectionSwitching}
                                    />
                                )}
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    This paper has no instructions of its own beyond the general ones on the
                                    previous screen. The clock starts when you press{" "}
                                    {isPreview ? "Start as a student" : "Start"}.
                                </p>
                            </div>
                        )}

                        {/* Exam format — how the clock works and whether sections
                            can be revisited. Both are decisions the candidate has
                            to make before question 1, not after. */}
                        {sectionCount > 0 && (
                            <div className={`rounded-xl border p-4 ${
                                allowSectionSwitching || groupedPaper
                                    ? "border-[#6C3EF4]/25 bg-[#6C3EF4]/[0.06]"
                                    : "border-border/60 bg-muted/30"
                            }`}>
                                <div className="flex items-start gap-3">
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                        allowSectionSwitching || groupedPaper
                                            ? "bg-[#6C3EF4]/15 text-[#6C3EF4]"
                                            : "bg-muted text-muted-foreground"
                                    }`}>
                                        {allowSectionSwitching || groupedPaper
                                            ? <ArrowLeftRight className="h-4 w-4" />
                                            : <Lock className="h-3.5 w-3.5" />}
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <h3 className="font-semibold text-foreground text-sm">
                                            {allowSectionSwitching
                                                ? "You can switch between sections"
                                                : groupedPaper
                                                    ? "The paper is sat in timed parts"
                                                    : "One section at a time"}
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            {allowSectionSwitching ? (
                                                <>
                                                    All {sectionCount} section{sectionCount === 1 ? "" : "s"} share one
                                                    clock. Move between them in any order and revisit any answer until
                                                    you submit.
                                                </>
                                            ) : groupedPaper ? (
                                                <>
                                                    {displayUnits
                                                        .map((u) =>
                                                            u.kind === "group"
                                                                ? `${groupDisplayName(u.group, displayLanguage)} (${u.sectionIds.length} sections${u.minutes > 0 ? `, ${u.minutes} min shared` : ""})`
                                                                : `${introSections.find((s: any) => s.id === u.sectionIds[0])?.name ?? "Section"}${u.minutes > 0 ? ` (${u.minutes} min)` : ""}`
                                                        )
                                                        .join(" · ")}
                                                    . Within a shared part, move freely between its sections. Parts are
                                                    sat in order — a submitted part cannot be reopened, and unused time
                                                    does not carry over.
                                                </>
                                            ) : (
                                                <>
                                                    {sectionCount} section{sectionCount === 1 ? "" : "s"}, each on its own
                                                    clock, sat in order. A section you submit cannot be reopened.
                                                </>
                                            )}
                                        </p>
                                        {effectivePaperMinutes > 0 && (
                                            <p className="flex items-center gap-1.5 text-xs text-foreground/80 pt-0.5">
                                                <Hourglass className="h-3 w-3 text-[#A855F7]" />
                                                <span className="font-bold tabular-nums">{effectivePaperMinutes} min</span>
                                                <span className="text-muted-foreground">
                                                    {allowSectionSwitching
                                                        ? "for the whole paper"
                                                        : groupedPaper
                                                            ? "total across all parts"
                                                            : "total across all sections"}
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
                                    {isPreview ? "Which language are you checking?" : "Choose Your Language"}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {isPreview
                                        // A translated paper is the thing most worth
                                        // sitting through, and the one a creator is
                                        // least likely to think of. Say so here.
                                        ? "Your students pick one of these and never see the others. Sit each one at least once — a translation that reads oddly only shows up under the clock."
                                        : "This exam is available in multiple languages. Select your preferred language to begin."}
                                </p>
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
                                        {isPreview ? "Start as a student" : "Start Exam"}
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

