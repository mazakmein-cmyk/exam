import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Flag, ChevronLeft, ChevronRight, ArrowLeft, Menu, Info, Eye, LayoutList, ArrowLeftRight, Check, Eraser, Maximize2, Minimize2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import OptimizedImage from "@/components/OptimizedImage";
import { MarksQuestionBadge } from "@/components/marks/MarksQuestionBadge";
import type { ScoringConfig } from "@/services/scoringEngine";
import { toExamViewer, resolveExamAccess, type ExamAccessMode } from "@/lib/examAccess";
import CreatorExamBlocked from "@/components/CreatorExamBlocked";
import AllQuestionsDialog from "@/components/exam/AllQuestionsDialog";
import SectionTabs from "@/components/exam/SectionTabs";
import SectionPicker from "@/components/exam/SectionPicker";
import { getQuestionTypeInfo, renderQuestionHtml, splitPassageContent } from "@/lib/questionContent";
import { readNavigationSettings } from "@/lib/examSettings";
import {
  flattenPaper,
  hasAnswer,
  sectionProgress,
  sectionTimeSpentSeconds,
  staggeredTimestamps,
  stepThroughPaper,
  totalExamMinutes,
  totalExamSeconds,
} from "@/lib/examNavigation.js";
import { fetchTimingGroups } from "@/lib/timingGroupSettings";
import {
  groupDisplayName,
  groupPoolMinutes,
  resolveTimingGroupIds,
  timingUnits,
  unitContaining,
} from "@/lib/timingGroups.js";

/** Most sections that still read as tabs at desktop width; above it, a picker. */
const SECTION_TAB_LIMIT = 5;

type Question = {
  id: string;
  q_no: number;
  text: string;
  answer_type: string;
  options: any;
  section_label: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  /** Per-option images aligned with options (null = none). */
  option_image_urls?: (string | null)[] | null;
};

type Section = {
  id: string;
  name: string;
  time_minutes: number;
};

type QuestionState = {
  selectedAnswer: any;
  isMarkedForReview: boolean;
  timeSpentSeconds: number;
  status: "untouched" | "attempted" | "viewed";
};

import { saveExamAttempt } from "@/services/examService";

const ExamSimulator = () => {
  const { examId, sectionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const lang = searchParams.get("lang") || "en";

  const [allSections, setAllSections] = useState<Section[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // ── Section navigation mode ────────────────────────────────────────────────
  // Locked (default): this page shows exactly the section named in the URL, on
  // that section's own clock, and submitting closes it.
  // Free (exams.allow_section_switching): every section of the paper is loaded
  // at once, one clock covers all of them, and the student moves between them
  // with the tab strip until they submit. The URL never changes while they do
  // — remounting this page would restart the clock.
  const [isFreeNav, setIsFreeNav] = useState(false);
  /** Questions per section id. Locked mode holds a single entry. */
  const [questionsBySection, setQuestionsBySection] = useState<Record<string, Question[]>>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  /** Where the student was in each section, so a tab returns them to their place. */
  const [indexBySection, setIndexBySection] = useState<Record<string, number>>({});
  /** attempts.section_id is NOT NULL, so free mode carries one attempt per section. */
  const [attemptIdBySection, setAttemptIdBySection] = useState<Record<string, string>>({});
  /** Whole-paper limit in minutes — only meaningful in free mode. */
  const [totalPaperMinutes, setTotalPaperMinutes] = useState(0);

  // ── Timing groups (locked mode only) ───────────────────────────────────────
  // A "part": 2+ adjacent sections sharing one pool (sections.timing_group_id →
  // section_timing_groups). Within the part the student moves freely — the
  // free-mode machinery, scoped to the part's sections — on ONE clock, the
  // pool. Between parts, locked rules hold: sat in order, a submitted part
  // stays closed, time never carries over. Free mode ignores groups entirely
  // (one paper-wide clock makes a pool inside it meaningless), and a database
  // without the migration yields no groups at all — solo behavior, unchanged.
  const [groupNav, setGroupNav] = useState(false);
  const [unitInfo, setUnitInfo] = useState<{
    /** Display-language label ("Session I" / "सत्र I"). */
    name: string;
    /** The pool, in minutes — override or member sum. */
    minutes: number;
    /** Members with questions, in paper order. */
    sectionIds: string[];
    /** First section after this part — the next part's door, or null at the end. */
    nextSectionId: string | null;
  } | null>(null);
  /** Free mode and a timing part share the multi-section machinery. */
  const multiNav = isFreeNav || groupNav;
  /* What the standing Submit is called. Free mode ends the paper; a locked
     section and a timing part both end the section in front of you. One
     constant so the palette, the sheet and the intro copy cannot drift — and
     it is declared up here because the intro screen returns before the
     run-time state below exists. */
  const submitLabel = isFreeNav ? "Submit Exam" : "Submit Section";

  const section = useMemo(
    () => allSections.find((s) => s.id === activeSectionId) ?? null,
    [allSections, activeSectionId]
  );
  /**
   * The sections the student can reach without leaving this page: the whole
   * paper in free mode, the part's members in group mode, just the URL's
   * section otherwise. Every multi-section surface below (tabs, flat walk,
   * submit scope, summaries) reads THIS, never allSections — allSections keeps
   * the whole paper so the between-parts hand-off knows what comes next.
   */
  const scopeSections = useMemo<Section[]>(() => {
    if (isFreeNav) return allSections;
    if (groupNav && unitInfo) {
      return unitInfo.sectionIds
        .map((id) => allSections.find((s) => s.id === id))
        .filter(Boolean) as Section[];
    }
    return section ? [section] : [];
  }, [isFreeNav, groupNav, unitInfo, allSections, section]);
  /** The active section's questions. Every render path below reads this. */
  const questions = useMemo<Question[]>(
    () => (activeSectionId ? questionsBySection[activeSectionId] ?? [] : []),
    [questionsBySection, activeSectionId]
  );
  /** The reachable scope as one ordered walk, so Previous/Next can cross a section edge. */
  const flatPaper = useMemo(
    () => (multiNav ? flattenPaper(scopeSections, questionsBySection) : []),
    [multiNav, scopeSections, questionsBySection]
  );
  const [hasStarted, setHasStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [timeWarningCountdown, setTimeWarningCountdown] = useState(5);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showSectionCompleteDialog, setShowSectionCompleteDialog] = useState(false);
  const questionStartTimeRef = useRef(Date.now());
  // Re-entrancy latch for submitExam. The timer's auto-submit and a manual
  // Submit can fire in the same second (the confirm dialog stays mounted while
  // the auto-submit save is in flight), and responses has no
  // (attempt_id, question_id) unique constraint — two concurrent saves would
  // insert a full duplicate set and double every score computed from them.
  const submittingRef = useRef(false);
  // Absolute wall-clock end time, shared with the Web Worker
  const examEndTimeRef = useRef(0);
  // The 5-minute warning fires ONCE per clock. The worker ticks every second
  // and every tick under 300s would otherwise reopen the dialog the moment its
  // auto-dismiss closed it — a modal on a 6-second loop for the final five
  // minutes. Re-armed in handleStartSection alongside the clock itself.
  const timeWarningShownRef = useRef(false);
  // Web Worker for background-accurate countdown (not throttled by browser)
  const timerWorkerRef = useRef<Worker | null>(null);
  // Always-current ref to handleAutoSubmit so the worker callback isn't stale
  const handleAutoSubmitRef = useRef<() => void>(() => {});
  // The question column scrolls, the action bar under it does not. Navigating
  // has to reset this: with Next pinned to the bottom of the screen a candidate
  // can leave a long question half-scrolled, and the next one would otherwise
  // open at that same offset — somewhere in the middle of its own text.
  const questionScrollRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // "All Questions" overview — the whole section on one scroll, read-only
  const [isAllQuestionsOpen, setIsAllQuestionsOpen] = useState(false);
  const [scoringConfigs, setScoringConfigs] = useState<Map<string, ScoringConfig>>(new Map());
  const [showMarksInSim, setShowMarksInSim] = useState(true);
  /**
   * Expanded mode: the reading-width caps come off and the browser goes
   * fullscreen, in one gesture.
   *
   * Both halves matter, and neither is enough alone. The caps (max-w-7xl on the
   * header, max-w-6xl on the question column) are what make a 27" monitor render
   * a 1280px column with grey either side — deliberate for prose, wasteful for a
   * passage-plus-question split that wants two real columns. Fullscreen is what
   * removes the tab strip and bookmarks bar above it, which is the other half of
   * the wasted screen and cannot be done with CSS.
   *
   * Kept as our own flag rather than read off `document.fullscreenElement`,
   * because requestFullscreen can be refused (iframes without allow-fullscreen,
   * some kiosk setups) and the width change should still happen when it is.
   *
   * Starting the exam turns this on by itself — see handleStartSection. The
   * header button is then how a candidate gets back out, alongside Esc.
   */
  const [isExpanded, setIsExpanded] = useState(false);
  // Derived from the signed-in account, never from the URL: "take" for
  // students/guests, "preview" for the exam's own creator (nothing is
  // persisted), "blocked" for a creator on someone else's exam.
  const [access, setAccess] = useState<ExamAccessMode>("take");
  const isPreview = access === "preview";

  const enterExpanded = useCallback(() => {
    // Flag first, browser second: the width has to change even where fullscreen
    // is refused, so it must not be conditional on the browser saying yes.
    setIsExpanded(true);
    // documentElement, not the exam frame: every dialog, sheet and popover here
    // is portalled to document.body, and fullscreening an inner element would
    // leave all of them rendering outside the fullscreen subtree — invisible.
    void document.documentElement.requestFullscreen?.()?.catch(() => {});
  }, []);

  const collapseExpanded = useCallback(() => {
    setIsExpanded(false);
    if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
  }, []);

  const toggleExpanded = useCallback(() => {
    if (isExpanded) collapseExpanded();
    else enterExpanded();
  }, [isExpanded, enterExpanded, collapseExpanded]);

  /**
   * Leaving fullscreen by any route the page does not control — Esc, F11, the
   * browser's own "exit" pill — has to bring the width back with it. Otherwise
   * the exam is left in a half-state: windowed, but still edge-to-edge, with a
   * Minimize button that looks like it did nothing.
   */
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setIsExpanded(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      // Submitting navigates away. A fullscreen results page, which has no exit
      // control of its own, is a trap — hand the browser chrome back on the way out.
      if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
    };
  }, []);

  /**
   * Esc as the way out, for the case the handler above cannot see: fullscreen was
   * refused, so the layout is expanded with no fullscreenchange event coming.
   *
   * Esc is the top layer's key, though. A dialog, the palette sheet or the
   * section popover all use it to close, and collapsing the exam underneath them
   * at the same time would take two visible actions from one keypress.
   */
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        isAllQuestionsOpen ||
        isPaletteOpen ||
        showSubmitDialog ||
        showTimeWarning ||
        showSectionCompleteDialog
      ) {
        return;
      }
      // Popovers and tooltips are not in the state above; ask the DOM.
      if (document.querySelector('[data-state="open"][role="dialog"], [data-radix-popper-content-wrapper]')) {
        return;
      }
      collapseExpanded();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isExpanded,
    collapseExpanded,
    isAllQuestionsOpen,
    isPaletteOpen,
    showSubmitDialog,
    showTimeWarning,
    showSectionCompleteDialog,
  ]);

  // Spin up the Web Worker once on mount and tear it down on unmount
  useEffect(() => {
    const workerCode = `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data.type === 'START') {
          if (intervalId) clearInterval(intervalId);
          var endTime = e.data.endTime;
          intervalId = setInterval(function() {
            var remaining = Math.ceil((endTime - Date.now()) / 1000);
            if (remaining <= 0) {
              clearInterval(intervalId);
              intervalId = null;
              self.postMessage({ type: 'EXPIRED' });
            } else {
              self.postMessage({ type: 'TICK', remaining: remaining });
            }
          }, 1000);
        } else if (e.data.type === 'STOP') {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);

    worker.onmessage = (e) => {
      if (e.data.type === "TICK") {
        const remaining: number = e.data.remaining;
        setTimeRemaining(remaining);
        if (remaining <= 300 && !timeWarningShownRef.current) {
          timeWarningShownRef.current = true;
          setShowTimeWarning(true);
        }
      } else if (e.data.type === "EXPIRED") {
        setTimeRemaining(0);
        handleAutoSubmitRef.current();
      }
    };

    timerWorkerRef.current = worker;
    return () => { worker.terminate(); };
  }, []);

  useEffect(() => {
    fetchSectionAndQuestions();
  }, [sectionId, examId]);

  useEffect(() => {
    questionStartTimeRef.current = Date.now();
  }, [currentQuestionIndex]);

  // A new question always starts at its own first line. Instant, not smooth:
  // this is a jump between two documents, not movement within one, and a
  // candidate clicking Next four times should not be watching four animations.
  useEffect(() => {
    questionScrollRef.current?.scrollTo({ top: 0 });
  }, [currentQuestionIndex, activeSectionId]);

  // Auto-dismiss the 5-minute warning after 5 seconds
  useEffect(() => {
    if (!showTimeWarning) return;
    setTimeWarningCountdown(5);
    const interval = setInterval(() => {
      setTimeWarningCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowTimeWarning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showTimeWarning]);

  // Preload all question images into browser cache when questions load
  const preloadImages = useCallback((questionsList: Question[]) => {
    const urls = new Set<string>();
    for (const q of questionsList) {
      if (q.image_url) urls.add(q.image_url);
      if (q.image_urls) q.image_urls.forEach(u => urls.add(u));
      // Also extract passage images embedded in question text
      const passageMatch = q.text?.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*passage-image/);
      if (passageMatch?.[1]) urls.add(passageMatch[1]);
    }
    urls.forEach(url => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  // Preload across the WHOLE paper, not just the section on screen: in free
  // mode a tab switch has to be instant, and the student's own clock is running
  // while an image loads.
  useEffect(() => {
    const all = Object.values(questionsBySection).flat();
    if (all.length > 0) {
      preloadImages(all);
    }
  }, [questionsBySection, preloadImages]);

  const fetchSectionAndQuestions = async () => {
    if (!sectionId || !examId) return;

    setIsLoading(true);
    try {
      // Parallelize all independent fetches — none depend on each other's results.
      // Auth check, exam-published gate, sections, and questions all keyed by examId/sectionId.
      // `select("*")` on exams rather than a column list: the navigation-mode
      // columns arrive by hand-pasted migration, and naming a column the live
      // schema has not got yet fails the whole query — which would leave the
      // student unable to open the paper at all.
      const [
        { data: { user } },
        { data: examData },
        { data: allSectionsData },
        { data: sectionData },
        { data: questionsData },
        timingGroupRows,
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("exams").select("*").eq("id", examId).single(),
        supabase
          .from("sections")
          .select("*")
          .eq("exam_id", examId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("sections").select("*").eq("id", sectionId).single(),
        supabase
          .from("parsed_questions")
          .select("*")
          .eq("section_id", sectionId)
          .eq("is_excluded", false)
          .order("q_no", { ascending: true }),
        // Timing groups. [] on a database without the migration — solo behavior.
        fetchTimingGroups(examId),
      ]);

      const isPublicExam = examData?.is_published === true;

      // If not logged in and exam is not public, deny access
      if (!user && !isPublicExam) {
        toast({
          title: "Access Denied",
          description: "Please sign in to take this exam",
          variant: "destructive",
        });
        return;
      }

      // Creator accounts never sit an exam. Their own exam runs in preview
      // (browsable, but nothing recorded); anyone else's is blocked outright.
      const mode = resolveExamAccess(toExamViewer(user), (examData as any)?.user_id);
      setAccess(mode);
      if (mode === "blocked") return;

      // Filter to only sections matching the language, or all if single-lang (legacy)
      const allSecs = allSectionsData || [];
      const langSections = allSecs.filter(s => (s as any).language === lang);
      // The sections this sitting can reach. Normally the language-filtered set
      // (or all of them for legacy single-language exams) — but the section the
      // URL names must always be in it, so a hand-edited or cross-exam link
      // degrades to that one section rather than to a paper it is not part of.
      const candidateSections = langSections.length > 0 ? langSections : allSecs;
      const scopedSections: Section[] = (
        sectionData && !candidateSections.some((s) => s.id === (sectionData as any).id)
          ? [sectionData]
          : candidateSections
      ) as unknown as Section[];

      // Sort questions: use final_order if available, otherwise fallback to q_no
      const sortQuestions = (rows: any[]) =>
        [...rows].sort((a, b) => {
          if (a.final_order !== null && b.final_order !== null) {
            return a.final_order - b.final_order;
          }
          return a.q_no - b.q_no;
        });
      const sortedQuestions = sortQuestions(questionsData || []);

      // Free navigation is a property of the exam, read defensively: an absent
      // column (migration not applied) means locked, never free.
      const navSettings = readNavigationSettings(examData);
      const freeNav = navSettings.allow_section_switching && scopedSections.length > 0;

      if (sectionData) {
        let bySection: Record<string, Question[]> = {
          [sectionData.id]: sortedQuestions as unknown as Question[],
        };
        let sittableSections = scopedSections;

        // The timing part the URL's section sits in, if any. Locked mode only:
        // free mode's one paper-wide clock makes a pool inside it meaningless,
        // so groups are ignored there (kept in the DB, like section minutes).
        const urlUnit = (() => {
          if (freeNav || timingGroupRows.length === 0) return null;
          const resolved = resolveTimingGroupIds(allSecs, (examData as any)?.primary_language ?? null);
          const units = timingUnits(scopedSections, timingGroupRows, resolved);
          const candidate = unitContaining(units, sectionData.id);
          return candidate && candidate.kind === "group" ? candidate : null;
        })();

        const fetchQuestionsFor = async (ids: string[]) => {
          if (ids.length === 0) return;
          const { data: restData, error: restError } = await supabase
            .from("parsed_questions")
            .select("*")
            .in("section_id", ids)
            .eq("is_excluded", false)
            .order("q_no", { ascending: true });

          if (restError) throw restError;

          const grouped: Record<string, any[]> = {};
          for (const row of restData || []) {
            const key = (row as any).section_id as string;
            (grouped[key] ||= []).push(row);
          }
          for (const id of ids) {
            bySection[id] = sortQuestions(grouped[id] || []) as unknown as Question[];
          }
        };

        if (freeNav) {
          // One clock for the paper means every section has to be in hand
          // before the clock starts — a fetch mid-exam would spend the
          // student's own time.
          await fetchQuestionsFor(
            scopedSections.map((s) => s.id).filter((id) => id !== sectionData.id)
          );

          // A section with no questions is a dead end in the tab strip — no
          // question to show, and nothing to grade. Drop it from the paper
          // (unless that would leave nothing at all).
          const withQuestions = scopedSections.filter((s) => (bySection[s.id] || []).length > 0);
          if (withQuestions.length > 0) sittableSections = withQuestions;
        } else if (urlUnit) {
          // Same rule scoped to the part: its whole pool starts at once, so
          // every member's questions must be in hand before the clock does.
          await fetchQuestionsFor(urlUnit.sectionIds.filter((id) => id !== sectionData.id));
        }

        // The part's members that actually have questions — the reachable
        // scope. One survivor (or none) degrades to solo: a "part" of one
        // section is just that section on its own clock.
        const memberSections = urlUnit
          ? (urlUnit.sectionIds
              .map((id) => scopedSections.find((s) => s.id === id))
              .filter((s) => s && (bySection[s.id] || []).length > 0) as Section[])
          : [];
        const partNav = memberSections.length > 1;

        setIsFreeNav(freeNav);
        setGroupNav(partNav);
        if (partNav && urlUnit) {
          const lastMemberIndex = Math.max(
            ...urlUnit.sectionIds.map((id) => scopedSections.findIndex((s) => s.id === id))
          );
          setUnitInfo({
            name: groupDisplayName(urlUnit.group, lang) || "This part",
            // The pool over the members actually sat: a question-less member
            // is dropped from the walk, and its minutes go with it — the same
            // rule free mode applies to sections it drops. An explicit pool
            // override survives the drop, because explicit is explicit.
            minutes: groupPoolMinutes(urlUnit.group, memberSections),
            sectionIds: memberSections.map((s) => s.id),
            nextSectionId: (scopedSections[lastMemberIndex + 1] as Section | undefined)?.id ?? null,
          });
        } else {
          setUnitInfo(null);
        }
        setQuestionsBySection(bySection);
        setAllSections(sittableSections);
        // Free mode opens on the URL's section when it survived the filter, so
        // a link to a specific section still lands there. A part opens the same
        // way — and a link to its one question-less member lands on the first
        // member that has anything to show.
        setActiveSectionId(
          partNav
            ? memberSections.some((s) => s.id === sectionData.id)
              ? sectionData.id
              : memberSections[0].id
            : sittableSections.some((s) => s.id === sectionData.id)
              ? sectionData.id
              : sittableSections[0]?.id ?? sectionData.id
        );

        const paperMinutes = totalExamMinutes(navSettings, sittableSections);
        setTotalPaperMinutes(paperMinutes);
        // Only set time — do NOT create attempt yet (wait for user to click "Start Section")
        // This prevents orphan attempt records from page loads, previews, and bot visits
        setTimeRemaining(
          freeNav
            ? totalExamSeconds(navSettings, sittableSections)
            : partNav && urlUnit
              ? groupPoolMinutes(urlUnit.group, memberSections) * 60
              : sectionData.time_minutes * 60
        );

        // Fetch scoring configs for marks badges.
        // Scoring config lives on PRIMARY-language sections/questions only.
        // For secondary-language attempts, resolve each current question_id to its
        // primary sibling via question_group_id, fetch configs by primary IDs,
        // then rekey the result map back to current IDs so the badge lookup
        // `scoringConfigs.get(currentQuestion.id)` resolves.
        try {
          const { getQuestionScoringConfigs, getExamScoringDefault } = await import('@/services/scoringService');
          const examDefault = await getExamScoringDefault(examId!);
          setShowMarksInSim(examDefault?.show_marks_in_simulator ?? true);
          if (examDefault?.show_marks_in_simulator !== false) {
            const primaryLang = (examData as any)?.primary_language as string | null;

            // Map: current question ID → ID to use for config lookup (primary or self).
            // Walks every section on the paper: in locked mode only the URL's
            // section has questions loaded, so this is the same single-section
            // set as before; in free mode it covers all of them, because every
            // section's badges are on screen from the first minute.
            const currentIdToConfigId = new Map<string, string>();
            for (const sec of sittableSections) {
              (bySection[sec.id] || []).forEach((q: any) => currentIdToConfigId.set(q.id, q.id));
            }

            for (const sec of sittableSections) {
              const currentLang = (sec as any)?.language as string | null;
              const groupId = (sec as any)?.section_group_id as string | null;
              const secQuestions = (bySection[sec.id] || []) as any[];
              if (secQuestions.length === 0) continue;
              if (!primaryLang || !currentLang || currentLang === primaryLang || !groupId) continue;

              const { data: primarySection } = await supabase
                .from("sections")
                .select("id")
                .eq("section_group_id", groupId)
                .eq("language", primaryLang)
                .maybeSingle();

              if (!primarySection) continue;

              const groupIds = secQuestions
                .map((q: any) => q.question_group_id)
                .filter(Boolean) as string[];
              if (groupIds.length === 0) continue;

              const { data: primaryQuestions } = await supabase
                .from("parsed_questions")
                .select("id, question_group_id")
                .eq("section_id", primarySection.id)
                .in("question_group_id", groupIds);

              if (!primaryQuestions || primaryQuestions.length === 0) continue;

              const groupToPrimary = new Map(
                primaryQuestions.map((pq: any) => [pq.question_group_id, pq.id])
              );
              secQuestions.forEach((q: any) => {
                const primaryId = q.question_group_id
                  ? groupToPrimary.get(q.question_group_id)
                  : undefined;
                if (primaryId) currentIdToConfigId.set(q.id, primaryId as string);
              });
            }

            const configIds = Array.from(new Set(currentIdToConfigId.values()));
            const primaryConfigs = await getQuestionScoringConfigs(configIds);

            // Rekey by current question IDs so the badge lookup resolves.
            const configsByCurrentId = new Map<string, ScoringConfig>();
            currentIdToConfigId.forEach((configId, currentId) => {
              const cfg = primaryConfigs.get(configId);
              if (cfg) configsByCurrentId.set(currentId, cfg);
            });
            setScoringConfigs(configsByCurrentId);
          }
        } catch (e) {
          // Non-fatal: badges just won't show
        }
      }
    } catch (error) {
      console.error("Error fetching section:", error);
      toast({
        title: "Error",
        description: "Failed to load section",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Create attempt and start exam only when user explicitly clicks "Start Section"
  const handleStartSection = async () => {
    /**
     * Sitting down to the paper is the one moment that needs no asking: from here
     * until Submit there is nothing else on this screen to do, so it takes the
     * whole screen.
     *
     * Asked for here, at the top, and not after the awaits below. Fullscreen is
     * granted on *transient* user activation — the click that ran this handler,
     * good for a few seconds — and an auth round trip plus an attempt insert can
     * outlive that on a slow connection. Past it the request is refused and the
     * exam starts windowed, intermittently, on exactly the connections least
     * likely to be reproducible.
     *
     * fullscreenEnabled first, rather than trying and catching: where the browser
     * will never grant it (iOS Safari fullscreens video and nothing else) the
     * width caps do not bind at phone width either, so expanding would change
     * nothing on screen except to put a Minimize button in the header that
     * visibly does nothing.
     */
    if (document.fullscreenEnabled) enterExpanded();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Initialize question states. Free mode initializes the whole paper up
      // front, a part its whole scope — a state row missing when the student
      // lands on a later section is a crash, not a blank answer. (In group
      // mode questionsBySection holds exactly the part's questions.)
      const questionsToInit = multiNav
        ? Object.values(questionsBySection).flat()
        : questions;
      setQuestionStates(
        questionsToInit.reduce((acc, q) => ({
          ...acc,
          [q.id]: {
            selectedAnswer: null,
            isMarkedForReview: false,
            timeSpentSeconds: 0,
            status: "untouched",
          },
        }), {})
      );

      // Create attempt record only now (not on page load).
      // A creator preview deliberately skips this: with no attempt row there is
      // nothing to grade, nothing to submit, and nothing in the creator's own
      // analytics. (The DB blocks creator attempts too — this keeps the UI from
      // ever asking for one.)
      if (user && !isPreview) {
        // Free mode needs one attempt row per section (attempts.section_id is
        // NOT NULL), and ExamReview stitches a sitting back together by walking
        // attempts in created_at order — so any multi-section start hands the
        // timestamps out explicitly, one millisecond apart in section order.
        // One multi-row insert would otherwise stamp them all identically and
        // let the walk split a single sitting in two. A timing part opens its
        // members the same way, for the same reason.
        //
        // Locked solo mode keeps the exact single-row insert it has always
        // used: there is nothing to disambiguate, and the write every student
        // already depends on is not worth reshaping for a mode it never enters.
        const sectionsToOpen = isFreeNav
          ? allSections.filter((s) => (questionsBySection[s.id] || []).length > 0)
          : groupNav && unitInfo
            ? scopeSections.filter((s) => (questionsBySection[s.id] || []).length > 0)
            : [{ id: sectionId! } as Section];
        const startedAt = new Date().toISOString();
        const stamps = staggeredTimestamps(Date.now(), sectionsToOpen.length);

        const { data, error } = await supabase
          .from("attempts")
          .insert(
            sectionsToOpen.map((s, i) => ({
              user_id: user.id,
              section_id: s.id,
              started_at: startedAt,
              language: lang,
              ...(multiNav ? { created_at: stamps[i] } : {}),
            }))
          )
          .select();

        if (error || !data || data.length === 0) {
          // The exam did not start, so give the screen back: a fullscreen start
          // card with an error toast is a dead end — no browser chrome, and the
          // Back button it wants is behind the fullscreen the click just took.
          collapseExpanded();
          toast({
            title: "Error",
            description: "Failed to start exam attempt",
            variant: "destructive",
          });
          return;
        }

        const bySection: Record<string, string> = {};
        for (const row of data) bySection[(row as any).section_id] = (row as any).id;
        setAttemptIdBySection(bySection);
        // The first section's attempt is the sitting's handle: it is what the
        // review link opens, and what `!attemptId` tests for anonymity.
        setAttemptId(bySection[sectionsToOpen[0].id] ?? (data[0] as any).id);
      }

      // A fresh clock re-arms the per-clock guards: the submit latch (held
      // after the previous scope's successful save — the same component
      // instance serves every section of the sitting, so a stale latch would
      // dead-end every submit after the first) and the one-shot 5-minute
      // warning.
      submittingRef.current = false;
      timeWarningShownRef.current = false;

      // Set absolute end time and start the Web Worker countdown. Free mode
      // runs one clock for the paper; a timing part runs its pool; locked
      // mode runs this section's own.
      const clockMinutes = isFreeNav
        ? totalPaperMinutes
        : groupNav && unitInfo
          ? unitInfo.minutes
          : (section?.time_minutes || 0);
      examEndTimeRef.current = Date.now() + clockMinutes * 60 * 1000;
      questionStartTimeRef.current = Date.now();
      timerWorkerRef.current?.postMessage({ type: "START", endTime: examEndTimeRef.current });
      setHasStarted(true);
    } catch (error) {
      collapseExpanded();
      console.error("Error starting section:", error);
      toast({
        title: "Error",
        description: "Failed to start section",
        variant: "destructive",
      });
    }
  };

  const updateQuestionTime = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const timeSpent = Math.floor((Date.now() - questionStartTimeRef.current) / 1000);

    // Reset so repeated calls before navigation don't double-count
    questionStartTimeRef.current = Date.now();

    if (timeSpent <= 0) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        timeSpentSeconds: (prev[currentQuestion.id]?.timeSpentSeconds || 0) + timeSpent,
      },
    }));
  };

  /** Mark the question being left as seen, so the palette stops calling it untouched. */
  const markCurrentViewed = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;
    if (questionStates[currentQuestion.id]?.status !== "untouched") return;
    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        status: "viewed",
      },
    }));
  };

  /**
   * Move to another section without touching the URL. Re-navigating would
   * remount this page and restart the clock — the one thing free navigation
   * cannot afford. The student is returned to wherever they left that section.
   */
  const handleSectionSwitch = (nextSectionId: string, indexOverride?: number) => {
    if (!nextSectionId || nextSectionId === activeSectionId) {
      if (indexOverride !== undefined) setCurrentQuestionIndex(indexOverride);
      return;
    }

    updateQuestionTime();
    markCurrentViewed();

    // Remember the place being left, and restore the place being entered.
    const leaving = activeSectionId;
    setIndexBySection((prev) => ({
      ...prev,
      ...(leaving ? { [leaving]: currentQuestionIndex } : {}),
    }));

    const nextCount = (questionsBySection[nextSectionId] || []).length;
    const remembered = indexOverride ?? indexBySection[nextSectionId] ?? 0;
    setActiveSectionId(nextSectionId);
    setCurrentQuestionIndex(Math.min(Math.max(0, remembered), Math.max(0, nextCount - 1)));
    // updateQuestionTime already reset this, but a section with no questions
    // returns early from it — so the clock on the next question starts here.
    questionStartTimeRef.current = Date.now();
    setIsPaletteOpen(false);
  };

  const handleAnswerChange = (value: any) => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        selectedAnswer: value,
        status: "attempted",
      },
    }));
  };

  // Shared with the section tabs' answered counts and the submit confirmation,
  // so "answered" means one thing everywhere on the page — a cleared answer
  // must stop counting on the tab as well as on the Clear Response button.
  const isAnswerPresent = (value: any): boolean => hasAnswer(value);

  const handleClearResponse = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        selectedAnswer: undefined,
        status: "viewed",
      },
    }));
  };

  const handleMarkForReview = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    setQuestionStates((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        isMarkedForReview: !prev[currentQuestion.id].isMarkedForReview,
      },
    }));
  };

  const handleNavigation = (direction: "next" | "prev") => {
    // Free mode walks the paper as one list (a part walks its scope), so Next
    // off the end of a section lands on the first question of the following
    // one instead of doing nothing.
    if (multiNav) {
      const step = stepThroughPaper(
        flatPaper,
        activeSectionId,
        currentQuestionIndex,
        direction
      );
      if (!step) return;
      if (step.sectionId !== activeSectionId) {
        handleSectionSwitch(step.sectionId, step.indexInSection);
        return;
      }
      updateQuestionTime();
      markCurrentViewed();
      setCurrentQuestionIndex(step.indexInSection);
      return;
    }

    updateQuestionTime();
    markCurrentViewed();

    if (direction === "next" && currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else if (direction === "prev" && currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleQuestionSelect = (index: number) => {
    updateQuestionTime();
    markCurrentViewed();
    setCurrentQuestionIndex(index);
  };

  const handleAutoSubmit = async () => {
    timerWorkerRef.current?.postMessage({ type: "STOP" });
    // Close the confirm dialog first: left open it stays clickable for the whole
    // network duration of the save below, which is exactly how a manual Submit
    // ends up racing this one.
    setShowSubmitDialog(false);
    // Deliberately NO updateQuestionTime() here: it resets questionStartTimeRef
    // and banks the stint into a QUEUED state update that the submitExam call
    // below cannot see (it reads this render's questionStates), so the final
    // stint on the open question would be lost. submitExam banks that stint
    // itself, from the untouched ref — the same way a manual Submit does.
    await submitExam();
    toast({
      title: "Time's up!",
      description: isFreeNav
        ? "Your paper has been automatically submitted."
        : groupNav
          ? `${unitInfo?.name || "This part"} has been automatically submitted.`
          : "Your section has been automatically submitted.",
    });
  };

  // Keep the ref in sync so the worker's onmessage callback always calls the latest version
  useEffect(() => {
    handleAutoSubmitRef.current = handleAutoSubmit;
  });

  const submitExam = async () => {
    // One submission at a time — see submittingRef.
    if (submittingRef.current) return;
    submittingRef.current = true;

    // Creator preview: nothing is graded, stored, or queued for a later sign-in.
    if (isPreview) {
      submittingRef.current = false;
      // No toast at all. The student's toast here says their answers were
      // saved, which would be false, and any creator-only replacement would be
      // one more thing to read that they were already told on the intro screen.
      // The section-complete dialog below is the student's, unchanged.
      setShowSectionCompleteDialog(true);
      return;
    }

    // Calculate time for current question synchronously (state updates are async)
    const currentQuestion = questions[currentQuestionIndex];
    // Clamped at 0, matching updateQuestionTime's `timeSpent <= 0` guard: a
    // device clock stepping backwards mid-question would otherwise persist a
    // negative time_spent_seconds, which every downstream time average sums raw.
    const currentQuestionTimeSpent = currentQuestion
      ? Math.max(0, Math.floor((Date.now() - questionStartTimeRef.current) / 1000))
      : 0;

    // Create updated questionStates with current question's time included
    const updatedQuestionStates = currentQuestion
      ? {
        ...questionStates,
        [currentQuestion.id]: {
          ...questionStates[currentQuestion.id],
          // `|| 0`, not a bare read: a missing state row here would throw on the
          // one action that must never throw — the submit itself.
          timeSpentSeconds:
            (questionStates[currentQuestion.id]?.timeSpentSeconds || 0) + currentQuestionTimeSpent,
        },
      }
      : questionStates;

    const totalTimeSpent = (section?.time_minutes || 0) * 60 - timeRemaining;

    // Free mode submits every section of the paper at once; a timing part
    // submits every member of the part. Each section still becomes its own
    // attempt row (one per section is the only shape the schema allows), and
    // its `time_spent_seconds` is the time actually spent on its questions —
    // with free movement there is no wall-clock slice that belongs to a
    // section. Marks stay per-section for the same reason: nothing about the
    // scoring write changes shape.
    const sectionsToSubmit: { id: string; questions: Question[]; timeSpent: number }[] = multiNav
      ? scopeSections
          .map((s) => {
            const secQuestions = questionsBySection[s.id] || [];
            return {
              id: s.id,
              questions: secQuestions,
              timeSpent: sectionTimeSpentSeconds(secQuestions, updatedQuestionStates),
            };
          })
          .filter((entry) => entry.questions.length > 0)
      : [{ id: sectionId!, questions, timeSpent: totalTimeSpent }];

    // For anonymous users, store state and show dialog
    if (!attemptId) {
      const existingSubmissionsStr = sessionStorage.getItem('pendingExamSubmissions');
      const existingSubmissions = existingSubmissionsStr ? JSON.parse(existingSubmissionsStr) : [];

      // One entry per section, in section order. StudentAuth replays them
      // sequentially after sign-in, which is also what keeps the attempts'
      // created_at order — and so the sitting — intact.
      const pending = sectionsToSubmit.map((entry) => ({
        sectionId: entry.id,
        timeSpentSeconds: entry.timeSpent,
        questions: entry.questions.map((q) => ({ id: q.id })),
        questionStates: updatedQuestionStates,
      }));

      sessionStorage.setItem('pendingExamSubmissions', JSON.stringify([...existingSubmissions, ...pending]));

      toast({
        title: isFreeNav ? "Paper Completed" : groupNav ? "Part Completed" : "Section Completed",
        description: "Your progress has been saved locally.",
      });

      setShowSectionCompleteDialog(true);
      return;
    }

    try {
      const userId = (await supabase.auth.getUser()).data.user?.id!;

      // Sequential, not parallel: each call also writes the marks log and
      // updates the attempt, and a half-written paper is worse than a slow one.
      for (const entry of sectionsToSubmit) {
        await saveExamAttempt({
          userId,
          sectionId: entry.id,
          attemptId: attemptIdBySection[entry.id] ?? (isFreeNav ? undefined : attemptId),
          timeSpentSeconds: entry.timeSpent,
          questions: entry.questions,
          questionStates: updatedQuestionStates,
        });
      }

      toast({
        title: isFreeNav
          ? "Exam Submitted"
          : groupNav
            ? `${unitInfo?.name || "Part"} Submitted`
            : "Section Submitted",
        description: multiNav
          ? `All ${sectionsToSubmit.length} section${sectionsToSubmit.length === 1 ? "" : "s"} saved successfully.`
          : `Your responses have been saved successfully (Last Q: ${currentQuestionTimeSpent}s)`,
      });

      setShowSectionCompleteDialog(true);
    } catch (error) {
      console.error("Error submitting exam:", error);
      // Release the latch only on failure, so the student can retry. On success
      // it stays held: the section-complete dialog is terminal, and a second
      // save would duplicate every response row.
      submittingRef.current = false;
      toast({
        title: "Error",
        description: "Failed to submit exam",
        variant: "destructive",
      });
    }
  };

  const handleProceedToNextSection = () => {
    // A part hands over to the first section AFTER its last member; solo mode
    // hands over to the next section in paper order. The navigation does NOT
    // remount this page — the route is the same, only :sectionId changes, so
    // the same component instance survives; the [sectionId] effect refetches
    // and the next Start click seeds a fresh clock. Time never carries over
    // between parts or sections. (If the next section is a member of a part,
    // the refetch loads that whole part.)
    const currentIndex = allSections.findIndex(s => s.id === sectionId);
    const nextSection = groupNav && unitInfo
      ? allSections.find((s) => s.id === unitInfo.nextSectionId) ?? null
      : allSections[currentIndex + 1];
    if (nextSection) {
      // Reset state for next section. The submit latch is part of that state:
      // it is deliberately held after a successful save (the completion dialog
      // is terminal for THIS scope), but the same component instance goes on
      // to serve the next section/part — leave it held and every submit after
      // the first silently no-ops.
      submittingRef.current = false;
      setHasStarted(false);
      setShowSectionCompleteDialog(false);
      setCurrentQuestionIndex(0);
      setQuestionStates({});
      // Navigate to next section, preserving language
      navigate(`/exam/${examId}/section/${nextSection.id}/simulator?lang=${lang}`);
    }
  };

  const handleFinishExam = () => {
    if (isPreview) {
      // No attempt to review — send the creator back to their exam editor.
      navigate(`/exam/${examId}`);
    } else if (attemptId) {
      navigate(`/exam/review/${attemptId}`);
    } else {
      // Anonymous users - redirect to auth to save progress
      toast({
        title: "Almost there!",
        description: "Please sign in to save your results.",
      });
      navigate("/student-auth?mode=signin&trigger=exam_submit");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getQuestionColor = (questionId: string) => {
    const state = questionStates[questionId];
    if (!state) return "bg-background";
    if (state.isMarkedForReview) return "bg-red-500 text-white";
    if (state.status === "attempted") return "bg-green-500 text-white";
    if (state.status === "viewed") return "bg-purple-500 text-white";
    return "bg-background";
  };

  const renderAnswerInput = () => {
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return null;

    const state = questionStates[currentQuestion.id];
    if (!state) return null; // Safety check

    // Prioritize showing options if they exist, regardless of answer_type
    // This ensures manually added options are always visible
    const hasOptions = currentQuestion.options && Array.isArray(currentQuestion.options) && currentQuestion.options.length > 0;

    if (hasOptions) {
      // Check for multiple selection types
      if (currentQuestion.answer_type === "multi" || currentQuestion.answer_type === "multiple") {
        const selectedValues: string[] = state.selectedAnswer || [];
        return (
          <div className="space-y-3">
            {currentQuestion.options?.map((option: any, idx: number) => {
              const idxStr = String(idx);
              return (
                <label key={idx} htmlFor={`option-${idx}`} className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  {/*
                    Squared off explicitly: `rounded-sm` resolves off --radius
                    (0.875rem), which on a 16px control is a full circle, so this
                    multi-select question looked exactly like a pick-one radio.

                    The square carries the "pick as many as apply" meaning; the
                    marker inside is a dot rather than a tick, because a tick on
                    the option a student just chose reads as "correct" and the
                    key is not revealed mid-attempt.
                  */}
                  <Checkbox
                    id={`option-${idx}`}
                    indicator="dot"
                    className="h-[18px] w-[18px] rounded-[4px]"
                    checked={selectedValues.includes(idxStr)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        handleAnswerChange([...selectedValues, idxStr]);
                      } else {
                        handleAnswerChange(selectedValues.filter((v: any) => v !== idxStr));
                      }
                    }}
                  />
                  <div className="flex-1 font-normal min-w-0">
                    {String(option ?? "").trim() !== "" && (
                      <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                    )}
                    {currentQuestion.option_image_urls?.[idx] && (
                      <img
                        src={currentQuestion.option_image_urls[idx]!}
                        alt={`Option ${String.fromCharCode(65 + idx)}`}
                        className="max-h-32 max-w-full rounded-md border border-border/60 mt-1"
                      />
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        );
      }

      // Default to Single Choice (Radio) for all other types with options
      return (
        <RadioGroup
          value={state.selectedAnswer != null ? String(state.selectedAnswer) : ""}
          onValueChange={(value) => handleAnswerChange(value)}
        >
          {currentQuestion.options?.map((option: any, idx: number) => (
            <label key={idx} htmlFor={`option-${idx}`} className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
              <RadioGroupItem value={String(idx)} id={`option-${idx}`} />
              <div className="flex-1 font-normal min-w-0">
                {String(option ?? "").trim() !== "" && (
                  <span dangerouslySetInnerHTML={{ __html: renderMathInRichText(option) }} />
                )}
                {currentQuestion.option_image_urls?.[idx] && (
                  <img
                    src={currentQuestion.option_image_urls[idx]!}
                    alt={`Option ${String.fromCharCode(65 + idx)}`}
                    className="max-h-32 max-w-full rounded-md border border-border/60 mt-1"
                  />
                )}
              </div>
            </label>
          ))}
        </RadioGroup>
      );
    }

    switch (currentQuestion.answer_type) {
      case "numeric":
        return (
          <Input
            type="number"
            value={state.selectedAnswer || ""}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Enter number"
            className="max-w-md"
          />
        );

      case "text":
      case "short_answer":
      case "essay":
      default:
        // Fallback for text or unknown types without options
        return (
          <div className="space-y-2">
            {currentQuestion.answer_type !== "text" && currentQuestion.answer_type !== "short_answer" && (
              <p className="text-sm text-muted-foreground italic">
                Options are missing for this question. Please enter your answer below.
              </p>
            )}
            {currentQuestion.answer_type === "essay" ? (
              <Textarea
                value={state.selectedAnswer || ""}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Enter your answer"
                rows={6}
              />
            ) : (
              <Input
                type="text"
                value={state.selectedAnswer || ""}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Enter your answer"
                className="max-w-md"
              />
            )}
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading section...</p>
        </div>
      </div>
    );
  }

  if (access === "blocked") {
    return <CreatorExamBlocked />;
  }

  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="absolute top-6 left-6">
          <Button variant="ghost" onClick={() => navigate(isPreview ? `/exam/${examId}` : "/analytics")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isPreview ? "Back to editing" : "Back to Dashboard"}
          </Button>
        </div>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-6">
            {multiNav ? (
              // One clock, every section in scope reachable — so the start
              // screen is about the paper (or the part), not about the section
              // the link happened to point at.
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-bold text-foreground">
                    {isFreeNav
                      ? allSections.length === 1
                        ? section?.name
                        : "Full Paper"
                      : unitInfo?.name}
                  </h1>
                  <p className="text-muted-foreground">
                    Time Limit: {isFreeNav ? totalPaperMinutes : unitInfo?.minutes} minutes
                  </p>
                  <p className="text-muted-foreground">
                    Total Questions: {Object.values(questionsBySection).flat().length}
                  </p>
                  {groupNav && unitInfo?.nextSectionId && (
                    <p className="text-xs text-muted-foreground/80">
                      This part is timed on one shared clock. The rest of the paper follows,
                      each part on its own clock — unused time does not carry over.
                    </p>
                  )}
                </div>

                {scopeSections.length > 1 && (
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3 space-y-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                      {isFreeNav
                        ? "You can move between sections freely"
                        : "These sections share one clock — move between them freely"}
                    </p>
                    <ul className="space-y-1">
                      {scopeSections.map((s, i) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-semibold text-foreground/80 tabular-nums mr-1.5">
                              {i + 1}.
                            </span>
                            {s.name}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {(questionsBySection[s.id] || []).length} Q
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                      Nothing is submitted until you press {submitLabel} — or
                      the {isFreeNav ? totalPaperMinutes : unitInfo?.minutes}-minute clock runs out.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground">{section?.name}</h1>
                <p className="text-muted-foreground">
                  Time Limit: {section?.time_minutes} minutes
                </p>
                <p className="text-muted-foreground">
                  Total Questions: {questions.length}
                </p>
              </div>
            )}
            {/* No creator notice here, and no creator wording on the button.
                The mode is explained once, on the intro screen, and from that
                point on the creator reads the student's screens word for word —
                which is the only way a preview can tell them how the paper
                actually lands. The one exception is an exit that would
                otherwise lie: see "Back to editing" above and at the end. */}
            {/* A timing part says "Start Section" like a locked one does — the
                part is a clock the sections share, not a thing a student
                starts. Pairs with Submit Section at the other end. */}
            <Button onClick={handleStartSection} className="w-full" size="lg">
              {isFreeNav && allSections.length > 1 ? "Start Exam" : "Start Section"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Multi-section reading of the reachable scope (the paper in free mode, the
  // part in group mode): which sections still have unanswered questions, and
  // whether Next has anywhere left to go.
  const showSectionTabs = multiNav && scopeSections.length > 1;
  // Past the limit a tab strip stops being navigation and becomes a scrub bar:
  // truncated names, the tab you want off-screen behind a fade. The picker is
  // the same width whether the paper has six sections or sixty.
  const useSectionPicker = showSectionTabs && scopeSections.length > SECTION_TAB_LIMIT;
  const perSectionSummary = multiNav
    ? scopeSections
        .map((s) => ({
          id: s.id,
          name: s.name,
          ...sectionProgress(questionsBySection[s.id] || [], questionStates),
        }))
        .filter((entry) => entry.total > 0)
    : [];
  const paperAnswered = perSectionSummary.reduce((sum, s) => sum + s.answered, 0);
  const paperTotal = perSectionSummary.reduce((sum, s) => sum + s.total, 0);
  const activeSectionNumber = scopeSections.findIndex((s) => s.id === activeSectionId) + 1;
  const atEndOfPaper = multiNav
    ? !stepThroughPaper(flatPaper, activeSectionId, currentQuestionIndex, "next")
    : currentQuestionIndex === questions.length - 1;
  /** Free mode keeps Submit reachable from anywhere — a candidate may finish early. */
  const showSubmitInline = multiNav ? atEndOfPaper : currentQuestionIndex === questions.length - 1;

  /* The two width caps expanded mode lifts. Dropping `container` with them is
     deliberate: it carries its own max-width at 2xl, so leaving it on would cap
     the "full width" layout at 1400px on exactly the screens wide enough to
     notice. Both rows use the same cap so the tab strip stays flush under the
     header, and both stay a plain class string — a candidate mid-exam should not
     see the header re-flow through an animation. */
  const chromeWidth = isExpanded ? "max-w-none" : "container max-w-7xl";
  const columnWidth = isExpanded ? "max-w-none" : "max-w-6xl";

  return (
    <div className="exam-frame bg-background flex flex-col">
      {/* Header. shrink-0 because the frame now has a definite height: without
          it a flex column will happily squash its own header to make room. */}
      <div className="shrink-0 border-b border-border bg-card sticky top-0 z-10">
        <div className={`${chromeWidth} mx-auto px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate max-w-[150px] sm:max-w-md">{section?.name}</h1>
            {showSectionTabs && (
              <span className="shrink-0 hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <ArrowLeftRight className="h-3 w-3" />
                {groupNav && unitInfo
                  ? `${unitInfo.name} · ${activeSectionNumber} of ${scopeSections.length}`
                  : `Section ${activeSectionNumber} of ${scopeSections.length}`}
              </span>
            )}
            {isPreview && (
              // Amber, still: this badge's job is to say "you are not in the
              // normal mode", and brand purple would read as ordinary chrome.
              // Only the word changes — from what the mode isn't to whose eyes
              // the creator is borrowing.
              <span
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400"
                title="You're seeing your students' screen"
              >
                <Eye className="h-3 w-3" />
                Student view
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4 text-foreground">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className={`text-lg font-mono ${timeRemaining < 300 ? 'text-red-500 animate-pulse' : ''}`}>
                {formatTime(timeRemaining)}
              </span>
            </div>

            {/* Whole-section overview — available in both preview and a real
                attempt. Below lg only: from lg up this lives at the foot of the
                palette, which is where it belongs, but there is no palette
                column at phone and tablet width to put it in. */}
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setIsAllQuestionsOpen(true)}
              title="See every question in this section"
            >
              <LayoutList className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">All Questions</span>
              <span className="sr-only sm:hidden">All Questions</span>
            </Button>

            {/* Expand / collapse. Icon-only and last in the row: it is a view
                preference, not part of answering, so it should be the least
                shouty control here.

                Asymmetric on small screens, deliberately. Collapsed, it is hidden
                below sm: neither width cap binds at phone width, so there is
                nothing to gain and the row has no pixels to spare. Expanded, it
                shows at every size — starting the exam enters this mode on its own,
                and a phone in fullscreen has no Esc key to press. The way out
                cannot be narrower than the way in. */}
            <Button
              variant="outline"
              size="sm"
              onClick={toggleExpanded}
              className={isExpanded ? "px-2" : "hidden sm:inline-flex px-2"}
              aria-pressed={isExpanded}
              aria-label={isExpanded ? "Exit full screen" : "Expand to full screen"}
              title={isExpanded ? "Exit full screen (Esc)" : "Expand to full screen"}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            {/* Mobile Menu Trigger */}
            <Sheet open={isPaletteOpen} onOpenChange={setIsPaletteOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              {/* Below lg the sheet IS the palette, so it is built like the
                  desktop one: a scrolling body and a foot that does not move.
                  gap-0 p-0 because the padding now belongs to those two
                  children — the foot has to reach the sheet's own edges. */}
              <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col gap-0 p-0">
                <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <SheetHeader className="mb-4">
                  <SheetTitle>Question Palette</SheetTitle>
                </SheetHeader>
                {showSectionTabs && (
                  <div className="mb-5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {groupNav && unitInfo ? unitInfo.name : "Sections"}
                    </p>
                    <SectionTabs
                      variant="stacked"
                      sections={scopeSections}
                      activeSectionId={activeSectionId}
                      questionsBySection={questionsBySection}
                      questionStates={questionStates}
                      onSelect={handleSectionSwitch}
                    />
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => {
                        handleQuestionSelect(idx);
                        setIsPaletteOpen(false);
                      }}
                      className={`aspect-square rounded-md text-sm transition-all ${idx === currentQuestionIndex
                        ? "border-4 border-primary font-bold text-lg shadow-lg scale-110"
                        : "border-2 border-border font-medium"
                        } ${getQuestionColor(q.id)}`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
                {/* Legend */}
                <div className="space-y-2 text-xs mt-6">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-green-500"></div>
                    <span>Attempted</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-red-500"></div>
                    <span>Marked for Review</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-purple-500"></div>
                    <span>Viewed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded bg-background border border-border"></div>
                    <span>Untouched</span>
                  </div>
                </div>
                </div>

                {/* The same pinned foot as the desktop palette, so Submit is in
                    the same place on a phone as it is on a laptop. All Questions
                    is not repeated here — below lg it sits in the header row,
                    one tap away without opening this sheet. */}
                <div className="shrink-0 border-t border-border bg-foreground/[0.03] p-3">
                  <Button
                    variant="outline"
                    className="w-full justify-center gap-2 border-primary/40 font-semibold text-primary shadow-sm hover:bg-primary/10 hover:text-primary active:scale-[0.99]"
                    onClick={() => {
                      setIsPaletteOpen(false);
                      setShowSubmitDialog(true);
                    }}
                  >
                    <Check className="h-4 w-4" />
                    {submitLabel}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Section tab strip — the whole point of free navigation. Sits inside
            the sticky header so it never scrolls out of reach, and carries the
            paper-wide Submit, because a candidate who is done should not have to
            walk to the last question to say so. */}
        {showSectionTabs && (
          <div className="border-t border-border/60 bg-card">
            <div className={`${chromeWidth} mx-auto flex items-stretch justify-between gap-2`}>
              <div className="min-w-0 flex-1 hidden lg:block">
                {useSectionPicker ? (
                  <div className="flex h-11 items-center px-3">
                    <SectionPicker
                      sections={scopeSections}
                      activeSectionId={activeSectionId}
                      questionsBySection={questionsBySection}
                      questionStates={questionStates}
                      onSelect={handleSectionSwitch}
                      className="w-[22rem]"
                    />
                  </div>
                ) : (
                  <SectionTabs
                    sections={scopeSections}
                    activeSectionId={activeSectionId}
                    questionsBySection={questionsBySection}
                    questionStates={questionStates}
                    onSelect={handleSectionSwitch}
                  />
                )}
              </div>

              {/* Mobile/tablet: no room for a strip at any section count, so the
                  picker is the switcher here — one tap to a full list, instead
                  of the old "open the palette sheet and look for it" detour. */}
              <div className="lg:hidden flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                <SectionPicker
                  sections={scopeSections}
                  activeSectionId={activeSectionId}
                  questionsBySection={questionsBySection}
                  questionStates={questionStates}
                  onSelect={handleSectionSwitch}
                  className="min-w-0 flex-1"
                />
                <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground sm:inline">
                  {paperAnswered}/{paperTotal}
                </span>
              </div>

              {/* Progress only. Submit used to sit here, but a control that
                  ends the attempt does not belong in the row you tap to change
                  section — and here it existed only where the strip did. It
                  lives at the foot of the palette now, on every screen. */}
              <div className="hidden lg:flex items-center px-3 py-1.5 shrink-0">
                <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                  {paperAnswered}/{paperTotal} answered
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Question Area — scrolls; the action bar below it does not. */}
        <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
        <div ref={questionScrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 sm:px-6 sm:py-4">
          {/* space-y-3, not 6: a question and its own metadata are one object,
              and the gap between them was costing a line of options. */}
          <div className={`${columnWidth} mx-auto space-y-3`}>
            {/* Question metadata: what this question is on the left, what you can
                do about it on the right, both on the one line directly above the
                card. It replaced a heading-plus-button bar that cost ~70px of the
                single screen a question gets — the button here is h-7 rather than
                the default h-9 so the row stays chip-height. The question number
                it used to carry is in the palette. */}
            <div className="flex flex-wrap items-center gap-2">
              {currentQuestion && (() => {
                const hasOptions = !!(
                  currentQuestion.options &&
                  Array.isArray(currentQuestion.options) &&
                  currentQuestion.options.length > 0
                );
                const info = getQuestionTypeInfo(currentQuestion.answer_type, hasOptions);
                return (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary cursor-help select-none"
                          aria-label={`Question type: ${info.label}`}
                        >
                          {info.label}
                          <Info className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                        {info.description}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })()}
              {showMarksInSim && currentQuestion && (
                <MarksQuestionBadge config={scoringConfigs.get(currentQuestion.id) ?? null} />
              )}

              {/* ml-auto: hard right, level with the type chip, on the same line
                  the eye already reads before dropping into the question. */}
              <Button
                variant={questionStates[currentQuestion?.id]?.isMarkedForReview ? "destructive" : "outline"}
                size="sm"
                onClick={handleMarkForReview}
                title="Flag this question to come back to"
                className="ml-auto h-7 shrink-0 gap-1.5 px-2.5 text-xs"
              >
                <Flag className="h-3.5 w-3.5" />
                {questionStates[currentQuestion?.id]?.isMarkedForReview ? "Marked" : "Mark for Review"}
              </Button>
            </div>

            <Card className="border-t-4 border-t-primary">
              <CardContent className="pt-4 space-y-4">
                {(() => {
                  // Passage/question split and the markdown+math pipeline are shared
                  // with the All Questions overview (see @/lib/questionContent).
                  const {
                    hasPassage: hasPassageSection,
                    passageHtml: passageContent,
                    passageImageUrl,
                    questionHtml: questionContent,
                  } = splitPassageContent(currentQuestion?.text);

                  if (hasPassageSection) {
                    return (
                      <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left: Passage Section */}
                        <div className="lg:w-1/2 space-y-4 border-r-0 lg:border-r lg:pr-6">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Passage</h3>
                          {passageImageUrl && (
                            <div className="border rounded-lg p-4 bg-slate-50 flex justify-center">
                              <OptimizedImage
                                src={passageImageUrl}
                                alt="Passage"
                                className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                              />
                            </div>
                          )}
                          {passageContent && (
                            <div
                              className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                              dangerouslySetInnerHTML={{ __html: renderMathInHtml(passageContent) }}
                            />
                          )}
                        </div>

                        {/* Right: Question Section */}
                        <div className="lg:w-1/2 space-y-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Question</h3>
                          {/* Question Images */}
                          {(currentQuestion?.image_urls && currentQuestion.image_urls.length > 0) ? (
                            <div className="flex flex-col gap-4">
                              {currentQuestion.image_urls.map((url, idx) => (
                                <div key={idx} className="border rounded-lg p-4 bg-slate-50 flex justify-center">
                                  <OptimizedImage
                                    src={url}
                                    alt={`Question ${idx + 1}`}
                                    className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : currentQuestion?.image_url ? (
                            <div className="border rounded-lg p-4 bg-slate-50 flex justify-center">
                              <OptimizedImage
                                src={currentQuestion.image_url}
                                alt="Question"
                                className="max-w-full max-h-[300px] h-auto rounded-md object-contain"
                              />
                            </div>
                          ) : null}
                          {/* Question Text */}
                          {questionContent && (
                            <div
                              className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                              dangerouslySetInnerHTML={{ __html: renderQuestionHtml(questionContent) }}
                            />
                          )}
                          {/* Answer Options. Clear Response lives in the locked
                              action bar, not here — a button that scrolls out of
                              reach is one a candidate stops using. */}
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {renderAnswerInput()}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Non-passage question: Original vertical layout
                  return (
                    <>
                      {(currentQuestion?.image_urls && currentQuestion.image_urls.length > 0) ? (
                        <div className="mb-4 flex flex-col gap-4">
                          {currentQuestion.image_urls.map((url, idx) => (
                            <div key={idx} className="border rounded-lg p-4 bg-slate-50 flex justify-center">
                              <OptimizedImage
                                src={url}
                                alt={`Question ${idx + 1}`}
                                className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                              />
                            </div>
                          ))}
                        </div>
                      ) : currentQuestion?.image_url ? (
                        <div className="border rounded-lg p-4 bg-slate-50 flex justify-center">
                          <OptimizedImage
                            src={currentQuestion.image_url}
                            alt="Question"
                            className="max-w-full max-h-[400px] h-auto rounded-md object-contain"
                          />
                        </div>
                      ) : null}
                      {currentQuestion?.text && (
                        <div
                          className="text-foreground whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: renderQuestionHtml(currentQuestion.text) }}
                        />
                      )}
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {renderAnswerInput()}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
        {/* /scrolling question column */}

        {/* Locked action bar. Everything a candidate does *to* the question they
            are on — clear it, leave it, move on — sits here at a fixed height,
            reachable without scrolling however long the passage above runs.
            Outside the scroll container rather than sticky inside it, so it can
            never overlap the last option of a question. */}
        <div className="shrink-0 border-t border-border bg-card">
          {/* Back on the left, forward on the right, and the one destructive
              action in the middle where neither thumb lands by accident. */}
          <div className={`${columnWidth} mx-auto flex items-center gap-2 px-3 py-2.5 sm:px-6`}>
            <Button
              variant="outline"
              onClick={() => handleNavigation("prev")}
              // Free mode: Previous keeps working off the top of a section,
              // stepping back into the one before it. Only the paper's very
              // first question has nowhere to go.
              disabled={
                isFreeNav
                  ? !stepThroughPaper(flatPaper, activeSectionId, currentQuestionIndex, "prev")
                  : currentQuestionIndex === 0
              }
              className="shrink-0"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Previous</span>
              <span className="sr-only sm:hidden">Previous</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!isAnswerPresent(questionStates[currentQuestion?.id]?.selectedAnswer)}
              onClick={handleClearResponse}
              className="mx-auto shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Eraser className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Clear Response</span>
              <span className="sr-only sm:hidden">Clear Response</span>
            </Button>

            {showSubmitInline ? (
              <Button onClick={() => setShowSubmitDialog(true)} className="shrink-0">
                <Check className="h-4 w-4 mr-2" />
                Submit
              </Button>
            ) : (
              <Button onClick={() => handleNavigation("next")} className="shrink-0">
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
        </div>{/* /question column + its action bar */}

        {/* Desktop Question Palette - Hidden on mobile. A column, not a block:
            the grid and legend scroll, and All Questions is pinned to the foot
            of it — the bottom-right corner of the screen, level with the action
            bar, and beside the palette it belongs with rather than up in the
            timer's row. */}
        <div className="hidden lg:flex w-80 shrink-0 flex-col border-l border-border bg-card">
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm font-semibold text-foreground">Question Palette</h3>
            {/* With several sections in play, the palette needs to say which
                one it is numbering — "12" means nothing on its own. */}
            {showSectionTabs && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Section {activeSectionNumber}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2 mb-6">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => handleQuestionSelect(idx)}
                className={`aspect-square rounded-md text-sm transition-all ${idx === currentQuestionIndex
                  ? "border-4 border-primary font-bold text-lg shadow-lg scale-110"
                  : "border-2 border-border font-medium"
                  } ${getQuestionColor(q.id)}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span>Attempted</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span>Marked for Review</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-purple-500"></div>
              <span>Viewed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-background border border-border"></div>
              <span>Untouched</span>
            </div>
          </div>
          </div>

          {/* Pinned foot of the palette: the whole-section view, one click from
              the bottom-right corner however far the grid has scrolled.

              Three surfaces, each a few shades down from the one behind it: the
              palette is card-white, this strip is a step darker, the button a
              step darker again with a border of its own. An outline button here
              was white on white — a label, not a control.

              Tinted with foreground rather than a fixed grey so it inverts with
              the theme: 8% of the text colour is darker than a white panel and
              lighter than a dark one, which is the right direction in both. */}
          <div className="shrink-0 border-t border-border bg-foreground/[0.03] p-3 space-y-2">
            {/* Submit rides above All Questions, and is not conditional: a
                locked single section, a timing part and free mode all end the
                same way, so the way to end it is in the same corner in all
                three. Purple against the neutral button below it — one of
                these two is irreversible. */}
            <Button
              variant="outline"
              className="w-full justify-center gap-2 border-primary/40 font-semibold text-primary shadow-sm hover:bg-primary/10 hover:text-primary active:scale-[0.99]"
              onClick={() => setShowSubmitDialog(true)}
              title={submitLabel}
            >
              <Check className="h-4 w-4" />
              {submitLabel}
            </Button>
            <Button
              variant="outline"
              // Resting state only — the hover left alone on purpose, so this
              // still lights up accent-purple like every other outline button
              // in the app. It was never the hover that failed to read.
              className="w-full justify-center gap-2 border-foreground/20 bg-foreground/[0.07] font-semibold text-foreground shadow-sm hover:border-accent active:scale-[0.99]"
              onClick={() => setIsAllQuestionsOpen(true)}
              title="See every question in this section"
            >
              <LayoutList className="h-4 w-4" />
              All Questions
            </Button>
          </div>
        </div>
      </div>

      {/* Every question in the section, on one scroll */}
      <AllQuestionsDialog
        open={isAllQuestionsOpen}
        onOpenChange={setIsAllQuestionsOpen}
        questions={questions}
        states={questionStates}
        currentIndex={currentQuestionIndex}
        sectionName={section?.name}
        onJumpToQuestion={handleQuestionSelect}
        renderMarksBadge={
          showMarksInSim
            ? (q) => <MarksQuestionBadge config={scoringConfigs.get(q.id) ?? null} size="sm" />
            : undefined
        }
      />

      {/* Time Warning Dialog */}
      <AlertDialog open={showTimeWarning} onOpenChange={setShowTimeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>5 Minutes Remaining!</AlertDialogTitle>
            <AlertDialogDescription>
              {isFreeNav && allSections.length > 1
                ? "You have only 5 minutes left to complete this paper — across all sections."
                : groupNav
                  ? `You have only 5 minutes left to complete ${unitInfo?.name || "this part"} — across its sections.`
                  : "You have only 5 minutes left to complete this section."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowTimeWarning(false)}>
              Continue ({timeWarningCountdown}s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFreeNav && allSections.length > 1
                ? "Submit the whole paper?"
                : groupNav
                  ? `Submit ${unitInfo?.name || "this part"}?`
                  : "Submit Section?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isFreeNav && allSections.length > 1
                ? "This submits every section at once. You cannot change your answers afterwards."
                : groupNav
                  ? "This submits every section of this part together. A submitted part cannot be reopened."
                  : "Are you sure you want to submit this section? You cannot change your answers after submission."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* With free movement, a candidate can reach Submit while a whole
              section is still untouched. Say so, per section, before they do. */}
          {multiNav && scopeSections.length > 1 && (
            <div className="rounded-lg border border-border/70 divide-y divide-border/60 text-sm">
              {perSectionSummary.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-foreground">{s.name}</span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${
                      s.unanswered === 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {s.unanswered === 0
                      ? `all ${s.total} answered`
                      : `${s.unanswered} of ${s.total} left`}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Time left
                </span>
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>
              {multiNav && scopeSections.length > 1 ? "Keep working" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { timerWorkerRef.current?.postMessage({ type: "STOP" }); submitExam(); }}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Section Completed Dialog */}
      <AlertDialog open={showSectionCompleteDialog} onOpenChange={setShowSectionCompleteDialog}>
        <AlertDialogContent>
          {isFreeNav ? (
            // Free mode submitted the whole paper, so there is no next section
            // to hand over to — the only way on is the results.
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Exam Submitted!</AlertDialogTitle>
                <AlertDialogDescription>
                  All {perSectionSummary.length} section
                  {perSectionSummary.length === 1 ? "" : "s"} submitted —{" "}
                  <strong className="tabular-nums">{paperAnswered} of {paperTotal}</strong>{" "}
                  questions answered.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={handleFinishExam}>
                  {isPreview ? "Back to editing" : "View Results"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : groupNav ? (
            // A timing part submitted every one of its sections together. If
            // the paper continues, the next stop is the section after the
            // part; its remount brings a fresh clock — time never carries over.
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{unitInfo?.name || "Part"} Completed!</AlertDialogTitle>
                <AlertDialogDescription>
                  <>
                    All {perSectionSummary.length} section
                    {perSectionSummary.length === 1 ? "" : "s"} of{" "}
                    <strong>{unitInfo?.name || "this part"}</strong> submitted —{" "}
                    <strong className="tabular-nums">{paperAnswered} of {paperTotal}</strong>{" "}
                    questions answered.
                  </>
                  {unitInfo?.nextSectionId ? (
                    <p className="mt-2">
                      A submitted part cannot be reopened, and its unused time does not
                      carry over. Click below to continue.
                    </p>
                  ) : (
                    <p className="mt-2">You have completed all parts of the exam.</p>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {unitInfo?.nextSectionId ? (
                  <AlertDialogAction onClick={handleProceedToNextSection}>
                    Continue
                  </AlertDialogAction>
                ) : (
                  <AlertDialogAction onClick={handleFinishExam}>
                    {isPreview ? "Back to editing" : "Finish Exam"}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Section Completed!</AlertDialogTitle>
                <AlertDialogDescription>
                  <>You have successfully completed <strong>{section?.name}</strong>.</>
                  {allSections.find(s => s.id === sectionId)?.id !== allSections[allSections.length - 1]?.id ? (
                    <p className="mt-2">
                      Click below to proceed.
                    </p>
                  ) : (
                    <p className="mt-2">
                      You have completed all sections of the exam.
                    </p>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                {allSections.find(s => s.id === sectionId)?.id !== allSections[allSections.length - 1]?.id ? (
                  <AlertDialogAction onClick={handleProceedToNextSection}>
                    Start Next Section
                  </AlertDialogAction>
                ) : (
                  <AlertDialogAction onClick={handleFinishExam}>
                    {isPreview ? "Back to editing" : "Finish Exam"}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExamSimulator;
