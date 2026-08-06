import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { renderMathInHtml, renderMathInRichText } from "@/lib/renderMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Flag, ChevronLeft, ChevronRight, ArrowLeft, Menu, Info, Eye, LayoutList, ArrowLeftRight, Check } from "lucide-react";
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

  const section = useMemo(
    () => allSections.find((s) => s.id === activeSectionId) ?? null,
    [allSections, activeSectionId]
  );
  /** The active section's questions. Every render path below reads this. */
  const questions = useMemo<Question[]>(
    () => (activeSectionId ? questionsBySection[activeSectionId] ?? [] : []),
    [questionsBySection, activeSectionId]
  );
  /** The paper as one ordered walk, so Previous/Next can cross a section edge. */
  const flatPaper = useMemo(
    () => (isFreeNav ? flattenPaper(allSections, questionsBySection) : []),
    [isFreeNav, allSections, questionsBySection]
  );
  const [hasStarted, setHasStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [timeWarningCountdown, setTimeWarningCountdown] = useState(5);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showSectionCompleteDialog, setShowSectionCompleteDialog] = useState(false);
  const questionStartTimeRef = useRef(Date.now());
  // Absolute wall-clock end time, shared with the Web Worker
  const examEndTimeRef = useRef(0);
  // Web Worker for background-accurate countdown (not throttled by browser)
  const timerWorkerRef = useRef<Worker | null>(null);
  // Always-current ref to handleAutoSubmit so the worker callback isn't stale
  const handleAutoSubmitRef = useRef<() => void>(() => {});
  const [isLoading, setIsLoading] = useState(true);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // "All Questions" overview — the whole section on one scroll, read-only
  const [isAllQuestionsOpen, setIsAllQuestionsOpen] = useState(false);
  const [scoringConfigs, setScoringConfigs] = useState<Map<string, ScoringConfig>>(new Map());
  const [showMarksInSim, setShowMarksInSim] = useState(true);
  // Derived from the signed-in account, never from the URL: "take" for
  // students/guests, "preview" for the exam's own creator (nothing is
  // persisted), "blocked" for a creator on someone else's exam.
  const [access, setAccess] = useState<ExamAccessMode>("take");
  const isPreview = access === "preview";

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
        if (remaining <= 300) setShowTimeWarning(true);
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

        if (freeNav) {
          // One clock for the paper means every section has to be in hand
          // before the clock starts — a fetch mid-exam would spend the
          // student's own time.
          const otherIds = scopedSections
            .map((s) => s.id)
            .filter((id) => id !== sectionData.id);

          if (otherIds.length > 0) {
            const { data: restData, error: restError } = await supabase
              .from("parsed_questions")
              .select("*")
              .in("section_id", otherIds)
              .eq("is_excluded", false)
              .order("q_no", { ascending: true });

            if (restError) throw restError;

            const grouped: Record<string, any[]> = {};
            for (const row of restData || []) {
              const key = (row as any).section_id as string;
              (grouped[key] ||= []).push(row);
            }
            for (const id of otherIds) {
              bySection[id] = sortQuestions(grouped[id] || []) as unknown as Question[];
            }
          }

          // A section with no questions is a dead end in the tab strip — no
          // question to show, and nothing to grade. Drop it from the paper
          // (unless that would leave nothing at all).
          const withQuestions = scopedSections.filter((s) => (bySection[s.id] || []).length > 0);
          if (withQuestions.length > 0) sittableSections = withQuestions;
        }

        setIsFreeNav(freeNav);
        setQuestionsBySection(bySection);
        setAllSections(sittableSections);
        // Free mode opens on the URL's section when it survived the filter, so
        // a link to a specific section still lands there.
        setActiveSectionId(
          sittableSections.some((s) => s.id === sectionData.id)
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
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Initialize question states. Free mode initializes the whole paper up
      // front — a state row missing when the student lands on a later section
      // is a crash, not a blank answer.
      const questionsToInit = isFreeNav
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
        // attempts in created_at order — so free mode hands the timestamps out
        // explicitly, one millisecond apart in section order. One multi-row
        // insert would otherwise stamp them all identically and let the walk
        // split a single sitting in two.
        //
        // Locked mode keeps the exact single-row insert it has always used:
        // there is nothing to disambiguate, and the write every student already
        // depends on is not worth reshaping for a mode it never enters.
        const sectionsToOpen = isFreeNav
          ? allSections.filter((s) => (questionsBySection[s.id] || []).length > 0)
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
              ...(isFreeNav ? { created_at: stamps[i] } : {}),
            }))
          )
          .select();

        if (error || !data || data.length === 0) {
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

      // Set absolute end time and start the Web Worker countdown. Free mode
      // runs one clock for the paper; locked mode runs this section's own.
      const clockMinutes = isFreeNav ? totalPaperMinutes : (section?.time_minutes || 0);
      examEndTimeRef.current = Date.now() + clockMinutes * 60 * 1000;
      questionStartTimeRef.current = Date.now();
      timerWorkerRef.current?.postMessage({ type: "START", endTime: examEndTimeRef.current });
      setHasStarted(true);
    } catch (error) {
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
    // Free mode walks the paper as one list, so Next off the end of a section
    // lands on the first question of the following one instead of doing nothing.
    if (isFreeNav) {
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
    updateQuestionTime();
    await submitExam();
    toast({
      title: "Time's up!",
      description: isFreeNav
        ? "Your paper has been automatically submitted."
        : "Your section has been automatically submitted.",
    });
  };

  // Keep the ref in sync so the worker's onmessage callback always calls the latest version
  useEffect(() => {
    handleAutoSubmitRef.current = handleAutoSubmit;
  });

  const submitExam = async () => {
    // Creator preview: nothing is graded, stored, or queued for a later sign-in.
    if (isPreview) {
      toast({
        title: "Preview finished",
        description: "Previews aren't scored or saved.",
      });
      setShowSectionCompleteDialog(true);
      return;
    }

    // Calculate time for current question synchronously (state updates are async)
    const currentQuestion = questions[currentQuestionIndex];
    const currentQuestionTimeSpent = currentQuestion
      ? Math.floor((Date.now() - questionStartTimeRef.current) / 1000)
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

    // Free mode submits every section of the paper at once. Each section still
    // becomes its own attempt row (one per section is the only shape the schema
    // allows), and its `time_spent_seconds` is the time actually spent on its
    // questions — with free navigation there is no wall-clock slice that
    // belongs to a section.
    const sectionsToSubmit: { id: string; questions: Question[]; timeSpent: number }[] = isFreeNav
      ? allSections
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
        title: isFreeNav ? "Paper Completed" : "Section Completed",
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
        title: isFreeNav ? "Exam Submitted" : "Section Submitted",
        description: isFreeNav
          ? `All ${sectionsToSubmit.length} section${sectionsToSubmit.length === 1 ? "" : "s"} saved successfully.`
          : `Your responses have been saved successfully (Last Q: ${currentQuestionTimeSpent}s)`,
      });

      setShowSectionCompleteDialog(true);
    } catch (error) {
      console.error("Error submitting exam:", error);
      toast({
        title: "Error",
        description: "Failed to submit exam",
        variant: "destructive",
      });
    }
  };

  const handleProceedToNextSection = () => {
    const currentIndex = allSections.findIndex(s => s.id === sectionId);
    const nextSection = allSections[currentIndex + 1];
    if (nextSection) {
      // Reset state for next section
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
                  <Checkbox
                    id={`option-${idx}`}
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
            {isPreview ? "Back to Editor" : "Back to Dashboard"}
          </Button>
        </div>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-6">
            {isFreeNav ? (
              // One clock, every section reachable — so the start screen is
              // about the paper, not about the section the link happened to
              // point at.
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-bold text-foreground">
                    {allSections.length === 1 ? section?.name : "Full Paper"}
                  </h1>
                  <p className="text-muted-foreground">
                    Time Limit: {totalPaperMinutes} minutes
                  </p>
                  <p className="text-muted-foreground">
                    Total Questions: {Object.values(questionsBySection).flat().length}
                  </p>
                </div>

                {allSections.length > 1 && (
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3 space-y-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                      You can move between sections freely
                    </p>
                    <ul className="space-y-1">
                      {allSections.map((s, i) => (
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
                      Nothing is submitted until you press Submit Exam — or the {totalPaperMinutes}-minute
                      clock runs out.
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
            {isPreview && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Preview mode.</span>{" "}
                  This is your own exam — answers aren't scored or saved, and no attempt is recorded.
                </p>
              </div>
            )}
            <Button onClick={handleStartSection} className="w-full" size="lg">
              {isPreview
                ? "Start Preview"
                : isFreeNav && allSections.length > 1
                  ? "Start Exam"
                  : "Start Section"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  // Free-mode reading of the paper as a whole: which sections still have
  // unanswered questions, and whether Next has anywhere left to go.
  const showSectionTabs = isFreeNav && allSections.length > 1;
  const perSectionSummary = isFreeNav
    ? allSections
        .map((s) => ({
          id: s.id,
          name: s.name,
          ...sectionProgress(questionsBySection[s.id] || [], questionStates),
        }))
        .filter((entry) => entry.total > 0)
    : [];
  const paperAnswered = perSectionSummary.reduce((sum, s) => sum + s.answered, 0);
  const paperTotal = perSectionSummary.reduce((sum, s) => sum + s.total, 0);
  const activeSectionNumber = allSections.findIndex((s) => s.id === activeSectionId) + 1;
  const atEndOfPaper = isFreeNav
    ? !stepThroughPaper(flatPaper, activeSectionId, currentQuestionIndex, "next")
    : currentQuestionIndex === questions.length - 1;
  /** Free mode keeps Submit reachable from anywhere — a candidate may finish early. */
  const showSubmitInline = isFreeNav ? atEndOfPaper : currentQuestionIndex === questions.length - 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate max-w-[150px] sm:max-w-md">{section?.name}</h1>
            {showSectionTabs && (
              <span className="shrink-0 hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <ArrowLeftRight className="h-3 w-3" />
                Section {activeSectionNumber} of {allSections.length}
              </span>
            )}
            {isPreview && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Eye className="h-3 w-3" />
                Preview
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

            {/* Whole-section overview — available in both preview and a real attempt */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAllQuestionsOpen(true)}
              title="See every question in this section"
            >
              <LayoutList className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">All Questions</span>
              <span className="sr-only sm:hidden">All Questions</span>
            </Button>

            {/* Mobile Menu Trigger */}
            <Sheet open={isPaletteOpen} onOpenChange={setIsPaletteOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[350px] overflow-y-auto">
                <SheetHeader className="mb-4">
                  <SheetTitle>Question Palette</SheetTitle>
                </SheetHeader>
                {showSectionTabs && (
                  <div className="mb-5 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Sections
                    </p>
                    <SectionTabs
                      variant="stacked"
                      sections={allSections}
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
            <div className="container mx-auto max-w-7xl flex items-stretch justify-between gap-2">
              <div className="min-w-0 flex-1 hidden lg:block">
                <SectionTabs
                  sections={allSections}
                  activeSectionId={activeSectionId}
                  questionsBySection={questionsBySection}
                  questionStates={questionStates}
                  onSelect={handleSectionSwitch}
                />
              </div>

              {/* Mobile/tablet: the strip is in the palette sheet, so this row
                  just states where you are and how far along the paper is. */}
              <div className="lg:hidden flex items-center gap-2 px-4 py-2 min-w-0">
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <ArrowLeftRight className="h-3 w-3" />
                  {activeSectionNumber}/{allSections.length}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {paperAnswered}/{paperTotal} answered · tap
                  <Menu className="inline h-3 w-3 mx-0.5" />
                  to switch section
                </span>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 shrink-0">
                <span className="hidden lg:inline text-[11px] font-medium text-muted-foreground tabular-nums">
                  {paperAnswered}/{paperTotal} answered
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => setShowSubmitDialog(true)}
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  {isPreview ? "End Preview" : "Submit Exam"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Question Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 sm:pb-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Question {currentQuestionIndex + 1} of {questions.length}
                  {currentQuestion?.section_label && ` - ${currentQuestion.section_label}`}
                </h2>
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
              </div>
              <Button
                variant={questionStates[currentQuestion?.id]?.isMarkedForReview ? "destructive" : "outline"}
                size="sm"
                onClick={handleMarkForReview}
                className="self-start sm:self-auto"
              >
                <Flag className="h-4 w-4 mr-2" />
                {questionStates[currentQuestion?.id]?.isMarkedForReview ? "Marked" : "Mark for Review"}
              </Button>
              {showMarksInSim && currentQuestion && (
                <MarksQuestionBadge config={scoringConfigs.get(currentQuestion.id) ?? null} />
              )}
            </div>

            <Card className="border-t-4 border-t-primary">
              <CardContent className="pt-6 space-y-6">
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
                          {/* Answer Options */}
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {renderAnswerInput()}
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!isAnswerPresent(questionStates[currentQuestion?.id]?.selectedAnswer)}
                                onClick={handleClearResponse}
                              >
                                Clear Response
                              </Button>
                            </div>
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
                      <div className="mt-6 pt-6 border-t space-y-3">
                        {renderAnswerInput()}
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!isAnswerPresent(questionStates[currentQuestion?.id]?.selectedAnswer)}
                            onClick={handleClearResponse}
                          >
                            Clear Response
                          </Button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <div className="flex justify-between pb-8">
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
                className="w-1/3 sm:w-auto"
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </Button>

              {/* Mobile count indicator */}
              <span className="text-sm text-muted-foreground flex items-center sm:hidden">
                {currentQuestionIndex + 1} / {questions.length}
              </span>

              {showSubmitInline ? (
                <Button onClick={() => setShowSubmitDialog(true)} className="w-1/3 sm:w-auto">
                  Submit
                </Button>
              ) : (
                <Button onClick={() => handleNavigation("next")} className="w-1/3 sm:w-auto">
                  <span className="hidden sm:inline">Next</span>
                  <span className="sm:hidden">Next</span>
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Question Palette - Hidden on mobile */}
        <div className="hidden lg:block w-80 border-l border-border bg-card overflow-y-auto p-6">
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
              {isPreview
                ? "End Preview?"
                : isFreeNav && allSections.length > 1
                  ? "Submit the whole paper?"
                  : "Submit Section?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPreview
                ? "This ends the preview. Nothing is scored or saved."
                : isFreeNav && allSections.length > 1
                  ? "This submits every section at once. You cannot change your answers afterwards."
                  : "Are you sure you want to submit this section? You cannot change your answers after submission."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* With free navigation, a candidate can reach Submit while a whole
              section is still untouched. Say so, per section, before they do. */}
          {isFreeNav && allSections.length > 1 && (
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
              {isFreeNav && allSections.length > 1 ? "Keep working" : "Cancel"}
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
                <AlertDialogTitle>
                  {isPreview ? "Preview Finished" : "Exam Submitted!"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isPreview ? (
                    <>That's the whole paper. Nothing was scored or saved.</>
                  ) : (
                    <>
                      All {perSectionSummary.length} section
                      {perSectionSummary.length === 1 ? "" : "s"} submitted —{" "}
                      <strong className="tabular-nums">{paperAnswered} of {paperTotal}</strong>{" "}
                      questions answered.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={handleFinishExam}>
                  {isPreview ? "Back to Editor" : "View Results"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{isPreview ? "Preview Finished" : "Section Completed!"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {isPreview ? (
                    <>You've reached the end of <strong>{section?.name}</strong>. Nothing was scored or saved.</>
                  ) : (
                    <>You have successfully completed <strong>{section?.name}</strong>.</>
                  )}
                  {allSections.find(s => s.id === sectionId)?.id !== allSections[allSections.length - 1]?.id ? (
                    <p className="mt-2">
                      Click below to proceed.
                    </p>
                  ) : (
                    <p className="mt-2">
                      {isPreview
                        ? "That's every section of this exam."
                        : "You have completed all sections of the exam."}
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
                    {isPreview ? "Back to Editor" : "Finish Exam"}
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
