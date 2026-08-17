import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Plus, BookOpen, Trash2, MoreVertical, Share2, Copy, User, Users, BarChart, FileText, Radio, Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import CreateExamDialog from "@/components/CreateExamDialog";
import ExamTypeDialog from "@/components/ExamTypeDialog";
import CreateLiveExamDialog from "@/components/CreateLiveExamDialog";
import { fetchMyLiveExams, deleteLiveExam, duplicateLiveExam, getParticipantCount, type LiveExam, type LiveExamStatus } from "@/services/liveExamService";
import PublishExamDialog from "@/components/PublishExamDialog";
import { navigationCopyPatch } from "@/lib/examSettings";
import { paperTypeCopyPatch } from "@/lib/paperTypeSettings";
import { copyTimingGroups } from "@/lib/timingGroupSettings";
import SEO from "@/components/SEO";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import OnboardingModal from "@/components/OnboardingModal";
import ProfileDialog from "@/components/ProfileDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Exam = {
  id: string;
  name: string;
  description: string | null;
  description_translations?: Record<string, string> | null;
  instruction: string | null;
  instruction_translations?: Record<string, string> | null;
  exam_instruction?: string | null;
  exam_instruction_translations?: Record<string, string> | null;
  created_at: string;
  is_published: boolean;
  exam_category: string | null;
  /** Section navigation mode — absent when the migration has not been applied. */
  allow_section_switching?: boolean;
  total_time_minutes?: number | null;
};

import { useUserRole } from "@/hooks/use-user-role";

const Dashboard = () => {
  const { role, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"mock" | "live">(
    searchParams.get("tab") === "live" ? "live" : "mock"
  );
  const [publishFilter, setPublishFilter] = useState<"all" | "published" | "unpublished">("all");
  const [liveStatusFilter, setLiveStatusFilter] = useState<"all" | LiveExamStatus>("all");
  const [liveExams, setLiveExams] = useState<LiveExam[]>([]);
  const [liveParticipantCounts, setLiveParticipantCounts] = useState<Record<string, number>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [duplicatingLiveId, setDuplicatingLiveId] = useState<string | null>(null);
  const [showExamTypeDialog, setShowExamTypeDialog] = useState(false);
  const [showCreateLiveDialog, setShowCreateLiveDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [examToDelete, setExamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Publish/Unpublish Confirmation State
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishAction, setPublishAction] = useState<{ examId: string; examName: string; isPublishing: boolean } | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  const publishedCount = exams.filter((e) => e.is_published).length;
  const unpublishedCount = exams.length - publishedCount;
  const filteredExams =
    publishFilter === "all"
      ? exams
      : exams.filter((e) => (publishFilter === "published" ? e.is_published : !e.is_published));

  const liveStatusCounts = liveExams.reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<LiveExamStatus, number>
  );
  const filteredLiveExams =
    liveStatusFilter === "all" ? liveExams : liveExams.filter((e) => e.status === liveStatusFilter);

  // Get user initial for avatar
  const getUserInitial = () => {
    const email = user?.email || "";
    return email.charAt(0).toUpperCase() || "U";
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      fetchExams(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        setShowOnboardingModal(true);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    checkAuth();
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Landing directly on the live tab (e.g. back from a live exam editor)
  // skips handleTabChange, so kick off the fetch here.
  useEffect(() => {
    if (activeTab === "live" && liveExams.length === 0) {
      fetchLiveExamsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExams = async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading exams",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setExams((data || []) as unknown as Exam[]);
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleExamCreated = () => {
    fetchExams();
    setShowCreateDialog(false);
  };

  // ─── Live Exam Handlers ───────────────────────────────────

  const fetchLiveExamsData = async () => {
    try {
      setLiveLoading(true);
      const data = await fetchMyLiveExams();
      setLiveExams(data);
      // Paint the list immediately; participant counts fill in as they arrive
      // (cards render `?? 0` in the meantime).
      setLiveLoading(false);
      Promise.all(data.map(e => getParticipantCount(e.id).catch(() => 0)))
        .then(counts => {
          const countMap: Record<string, number> = {};
          data.forEach((e, i) => { countMap[e.id] = counts[i]; });
          setLiveParticipantCounts(countMap);
        });
    } catch (error: any) {
      toast({
        title: "Error loading live exams",
        description: error.message,
        variant: "destructive",
      });
      setLiveLoading(false);
    }
  };

  const handleLiveExamCreated = () => {
    fetchLiveExamsData();
    setShowCreateLiveDialog(false);
  };

  const handleDeleteLiveExam = async (exam: LiveExam) => {
    if (exam.status === "live") {
      toast({
        title: "Cannot delete a live exam",
        description: "Please end the live session first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await deleteLiveExam(exam.id);
      setLiveExams(prev => prev.filter(e => e.id !== exam.id));
      toast({ title: "Deleted", description: "Live exam deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Duplicating is allowed from any status — copying an ended exam to re-run it
  // with a new batch is the common case. The copy always comes back as a draft
  // with its own share code and an empty leaderboard.
  const handleDuplicateLiveExam = async (exam: LiveExam) => {
    if (duplicatingLiveId) return;
    try {
      setDuplicatingLiveId(exam.id);
      const newExam = await duplicateLiveExam(exam.id);
      await fetchLiveExamsData();
      toast({
        title: "Duplicated",
        description: `"${newExam.name}" created as a draft — questions, timers and languages copied.`,
      });
    } catch (error: any) {
      console.error("Duplicate live exam error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate live exam",
        variant: "destructive",
      });
    } finally {
      setDuplicatingLiveId(null);
    }
  };

  const handleShareLiveExam = (exam: LiveExam) => {
    if (exam.status === "draft") {
      toast({
        title: "Cannot Share Exam",
        description: "Please publish the exam first to share it.",
        variant: "destructive",
      });
      return;
    }
    const url = `${window.location.origin}/live/${exam.share_code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "The live exam link has been copied to your clipboard." });
  };

  // Fetch live exams when tab switches
  const handleTabChange = (tab: "mock" | "live") => {
    setActiveTab(tab);
    setSearchParams(tab === "live" ? { tab: "live" } : {}, { replace: true });
    if (tab === "live" && liveExams.length === 0) {
      fetchLiveExamsData();
    }
  };

  // Creator accounts can't sit exams — the intro opens their own exam in
  // preview (nothing scored, nothing saved). See src/lib/examAccess.ts.
  const handleTakeExam = async (examId: string) => {
    try {
      // Navigate to the exam intro
      navigate(`/exam/${examId}/intro`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to open exam preview",
        variant: "destructive",
      });
    }
  };

  const handleShare = (exam: Exam) => {
    if (!exam.is_published) {
      toast({
        title: "Cannot Share Exam",
        description: "Please publish the exam first to share it with users.",
        variant: "destructive",
      });
      return;
    }

    const url = `${window.location.origin}/exam/${exam.id}/intro`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "The exam link has been copied to your clipboard.",
    });
  };

  const handleDuplicateExam = async (exam: Exam) => {
    try {
      setLoading(true);

      // Create a copy of the exam. Navigation mode travels with it via a gated
      // patch — absent (and so default-locked) on a database that has not had
      // the migration applied.
      // Paper type travels the same way, read off the source row — a copy of a
      // previous-year paper is still a previous-year paper.
      const [navPatch, paperPatch] = await Promise.all([
        navigationCopyPatch(exam),
        paperTypeCopyPatch(exam),
      ]);
      const { data: newExam, error: examError } = await supabase
        .from("exams")
        .insert({
          ...navPatch,
          ...paperPatch,
          name: `${exam.name} (Copy)`,
          description: exam.description,
          description_translations: exam.description_translations,
          instruction: exam.instruction,
          instruction_translations: exam.instruction_translations,
          exam_instruction: exam.exam_instruction ?? null,
          exam_instruction_translations: exam.exam_instruction_translations ?? {},
          exam_category: exam.exam_category,
          user_id: user.id,
          is_published: false,
          // The copied sections carry their language rows, so the exam row
          // must carry the language settings too — without these the copy
          // defaults to English-only and every non-English section (and the
          // timing groups resolved through the primary language) goes dark.
          supported_languages: (exam as any).supported_languages || ["en"],
          primary_language: (exam as any).primary_language || "en",
        })
        .select()
        .single();

      if (examError) throw examError;

      // Get all sections for this exam
      const { data: sectionsData, error: sectionsError } = await supabase
        .from("sections")
        .select("*")
        .eq("exam_id", exam.id);

      if (sectionsError) throw sectionsError;

      // Duplicate all sections and their questions. Carry sort_order, language
      // and a remapped section_group_id — dropping them (as this flow used to)
      // silently flattened multi-language exams and lost the paper's order.
      const sectionGroupIdMap = new Map<string, string>();
      const sectionIdMap = new Map<string, string>();
      for (const section of sectionsData || []) {
        let newGroupId: string | null = null;
        if ((section as any).section_group_id) {
          if (!sectionGroupIdMap.has((section as any).section_group_id)) {
            sectionGroupIdMap.set((section as any).section_group_id, crypto.randomUUID());
          }
          newGroupId = sectionGroupIdMap.get((section as any).section_group_id)!;
        }
        const { data: newSection, error: sectionError } = await supabase
          .from("sections")
          .insert({
            exam_id: newExam.id,
            name: section.name,
            time_minutes: section.time_minutes,
            sort_order: (section as any).sort_order ?? 0,
            language: (section as any).language || "en",
            section_group_id: newGroupId,
          })
          .select()
          .single();

        if (sectionError) throw sectionError;
        sectionIdMap.set(section.id, newSection.id);

        // Get questions for this section
        const { data: sectionQuestions, error: questionsError } = await supabase
          .from("parsed_questions")
          .select("*")
          .eq("section_id", section.id);

        if (questionsError) throw questionsError;

        // Duplicate questions to the new section
        if (sectionQuestions && sectionQuestions.length > 0) {
          const newQuestions = sectionQuestions.map((q: any) => ({
            section_id: newSection.id,
            q_no: q.q_no,
            text: q.text,
            options: q.options,
            answer_type: q.answer_type,
            image_url: q.image_url,
            // Carry every image-bearing field — dropping them silently made
            // duplicated figure questions lose their pictures and re-snip data.
            image_urls: q.image_urls ?? null,
            ...(q.option_image_urls !== undefined ? { option_image_urls: q.option_image_urls } : {}),
            ...(q.image_region !== undefined ? { image_region: q.image_region } : {}),
            correct_answer: q.correct_answer,
            requires_review: q.requires_review || false,
            is_excluded: q.is_excluded || false,
            is_finalized: q.is_finalized || true,
          }));

          const { error: insertError } = await supabase
            .from("parsed_questions")
            .insert(newQuestions);

          if (insertError) throw insertError;
        }
      }

      // Timing groups travel with the copy (pool, names, membership) — a
      // silent no-op on a database without the migration.
      await copyTimingGroups(exam.id, newExam.id, sectionIdMap, (sectionsData || []) as any);

      // Refresh the exams list
      fetchExams();

      toast({
        title: "Duplicated",
        description: `"${exam.name}" has been duplicated successfully!`,
      });
    } catch (error: any) {
      console.error("Duplicate error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate exam",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = (exam: Exam) => {
    if (exam.is_published) {
      toast({
        title: "Cannot Delete Published Exam",
        description: "Please unpublish the exam first to delete it.",
        variant: "destructive",
      });
      return;
    }
    setExamToDelete({ id: exam.id, name: exam.name });
    setShowDeleteDialog(true);
  };

  const executeDeleteExam = async () => {
    if (!examToDelete) return;

    const { id: examId } = examToDelete;

    try {
      // First, get exam_versions for this exam (if they exist)
      const { data: examVersions } = await supabase
        .from("exam_versions" as any)
        .select("id")
        .eq("exam_id", examId);

      if (examVersions && examVersions.length > 0) {
        const versionIds = examVersions.map((v: any) => v.id);

        // Delete all exam_attempts that reference these versions
        await supabase
          .from("exam_attempts" as any)
          .delete()
          .in("exam_version_id", versionIds);

        // Delete the exam_versions themselves
        await supabase
          .from("exam_versions" as any)
          .delete()
          .eq("exam_id", examId);
      }

      // Get all sections for this exam
      const { data: sections } = await supabase
        .from("sections")
        .select("id")
        .eq("exam_id", examId);

      if (sections && sections.length > 0) {
        const sectionIds = sections.map(s => s.id);

        // Delete all responses for attempts on these sections
        const { data: attempts } = await supabase
          .from("attempts")
          .select("id")
          .in("section_id", sectionIds);

        if (attempts && attempts.length > 0) {
          const attemptIds = attempts.map(a => a.id);
          await supabase
            .from("responses")
            .delete()
            .in("attempt_id", attemptIds);
        }

        // Delete all attempts for these sections
        await supabase
          .from("attempts")
          .delete()
          .in("section_id", sectionIds);

        // Delete all parsed_questions for these sections
        await supabase
          .from("parsed_questions")
          .delete()
          .in("section_id", sectionIds);

        // Delete all sections
        await supabase
          .from("sections")
          .delete()
          .eq("exam_id", examId);
      }

      // Now delete the exam itself
      const { error } = await supabase
        .from("exams")
        .delete()
        .eq("id", examId);

      if (error) throw error;

      setExams(exams.filter(e => e.id !== examId));
      toast({
        title: "Deleted",
        description: "Exam deleted successfully",
      });
      setShowDeleteDialog(false);
      setExamToDelete(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete exam",
        variant: "destructive",
      });
    }
  };

  // Open the shared publish dialog. All validation (blank/invalid questions,
  // cross-language parity, marking-scheme checks) lives in PublishExamDialog so
  // the dashboard toggle enforces the exact same gates as the edit-exam page.
  const handleTogglePublishClick = (examId: string, examName: string, isPublishing: boolean) => {
    setPublishAction({ examId, examName, isPublishing });
    setShowPublishDialog(true);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Creator Dashboard | MockSetu"
        description="Manage your published mock tests and exam content on MockSetu."
        path="/dashboard"
        noindex
      />
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex h-16 items-center justify-between">
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => navigate("/")}
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6C3EF4]/20 to-[#A855F7]/10 border border-[#6C3EF4]/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                  <defs>
                    <linearGradient id="dash-logo" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#6C3EF4" />
                      <stop offset="100%" stopColor="#A855F7" />
                    </linearGradient>
                  </defs>
                  <path d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22" stroke="url(#dash-logo)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22" stroke="url(#dash-logo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
                </svg>
              </div>
              <span className="text-[17px] font-bold tracking-[-0.02em] text-foreground">
                Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    id="dashboard-avatar-trigger"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold bg-gradient-to-br from-[#6C3EF4] to-[#A855F7] text-white ring-2 ring-[#6C3EF4]/30 ring-offset-2 ring-offset-transparent hover:ring-[#6C3EF4]/60 hover:shadow-lg hover:shadow-[#6C3EF4]/20 transition-all duration-200 focus:outline-none"
                    aria-label="User menu"
                  >
                    {getUserInitial()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl shadow-black/10 border-border/60">
                  <DropdownMenuItem
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2.5 py-2.5 cursor-pointer"
                  >
                    <User className="h-4 w-4 text-[#6C3EF4]" />
                    User Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2.5 py-2.5 text-red-500 focus:text-red-500 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 text-[11px] font-semibold text-[#A855F7] uppercase tracking-wider">Creator Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">My Exams</h1>
            <p className="text-muted-foreground mt-1 text-sm">Create and manage your exam simulations</p>
          </div>
          <Button onClick={() => setShowExamTypeDialog(true)} className="self-start md:self-auto bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-lg shadow-[#6C3EF4]/25 hover:shadow-[#6C3EF4]/35 hover:-translate-y-px transition-all duration-200">
            <Plus className="mr-2 h-4 w-4" />
            New Exam
          </Button>
        </div>

        {/* Tab Toggle: Mock Exams | Live Exams */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
          <button
            onClick={() => handleTabChange("mock")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "mock"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Mock Exams
          </button>
          <button
            onClick={() => handleTabChange("live")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "live"
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className="h-4 w-4" />
            Live Exams
          </button>
        </div>

        {/* Publish status filter (mock exams only) */}
        {activeTab === "mock" && exams.length > 0 && (
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
            {([
              { key: "all", label: "All", count: exams.length },
              { key: "published", label: "Published", count: publishedCount },
              { key: "unpublished", label: "Unpublished", count: unpublishedCount },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setPublishFilter(key)}
                aria-pressed={publishFilter === key}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  publishFilter === key
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Status filter (live exams only) */}
        {activeTab === "live" && liveExams.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
            {([
              { key: "all", label: "All", count: liveExams.length },
              { key: "draft", label: "Draft", count: liveStatusCounts.draft ?? 0 },
              { key: "published", label: "Published", count: liveStatusCounts.published ?? 0 },
              { key: "live", label: "Live", count: liveStatusCounts.live ?? 0 },
              { key: "ended", label: "Ended", count: liveStatusCounts.ended ?? 0 },
            ] as const).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setLiveStatusFilter(key)}
                aria-pressed={liveStatusFilter === key}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  liveStatusFilter === key
                    ? "bg-background text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )}
        </div>

        {/* ─── Mock Exams Tab ─── */}
        {activeTab === "mock" && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading exams...</p>
              </div>
            ) : exams.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/15 to-[#A855F7]/8 border border-[#6C3EF4]/15 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-[#A855F7]/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No exams yet</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs">Create your first mock exam and start building question banks for your students</p>
                <Button onClick={() => setShowExamTypeDialog(true)} className="bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-lg shadow-[#6C3EF4]/25 hover:-translate-y-px transition-all duration-200">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Exam
                </Button>
              </div>
            ) : filteredExams.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/15 to-[#A855F7]/8 border border-[#6C3EF4]/15 flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-[#A855F7]/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  No {publishFilter} exams
                </h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                  You have {exams.length} exam{exams.length === 1 ? "" : "s"}, but none are {publishFilter}.
                </p>
                <Button variant="outline" onClick={() => setPublishFilter("all")}>
                  Show all exams
                </Button>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredExams.map((exam) => (
                  <Card key={exam.id} className="flex flex-col justify-between group hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 transition-all duration-200 border-border/60">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl font-bold break-all">{exam.name}</CardTitle>
                        </div>
                        <CardDescription className="line-clamp-2">{exam.description || "No description"}</CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground hidden xs:inline">
                            {exam.is_published ? "Published" : "Unpublished"}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Switch
                                checked={exam.is_published}
                                onCheckedChange={(checked) => handleTogglePublishClick(exam.id, exam.name, checked)}
                                className="aria-checked:!bg-blue-600 aria-[checked=false]:!bg-gray-400"
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{exam.is_published ? "Unpublish" : "Publish"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {exam.exam_category && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {exam.exam_category}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <div className="flex flex-wrap gap-3">
                        <Button
                          className="flex-1 min-w-[100px] bg-blue-600 hover:bg-blue-700"
                          onClick={() => navigate(`/exam/${exam.id}`)}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          <span className="hidden sm:inline">Edit</span>
                          <span className="sm:hidden">Edit</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => navigate(`/analytics?examId=${exam.id}&from=dashboard`)}
                        >
                          <BarChart className="mr-2 h-4 w-4" />
                          Analytics
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleShare(exam)}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleTakeExam(exam.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Sit it as a student
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicateExam(exam)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteExam(exam)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── Live Exams Tab ─── */}
        {activeTab === "live" && (
          <>
            {liveLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading live exams...</p>
              </div>
            ) : liveExams.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/8 border border-emerald-500/15 flex items-center justify-center mb-4">
                  <Radio className="h-8 w-8 text-emerald-500/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">No live exams yet</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs">Create your first live exam and broadcast it to your students in real-time</p>
                <Button onClick={() => setShowCreateLiveDialog(true)} className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 hover:-translate-y-px transition-all duration-200">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Live Exam
                </Button>
              </div>
            ) : filteredLiveExams.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/40 py-20 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/8 border border-emerald-500/15 flex items-center justify-center mb-4">
                  <Radio className="h-8 w-8 text-emerald-500/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">
                  No {liveStatusFilter} live exams
                </h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs">
                  You have {liveExams.length} live exam{liveExams.length === 1 ? "" : "s"}, but none are {liveStatusFilter}.
                </p>
                <Button variant="outline" onClick={() => setLiveStatusFilter("all")}>
                  Show all live exams
                </Button>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLiveExams.map((exam) => (
                  <Card key={exam.id} className="flex flex-col justify-between group hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 transition-all duration-200 border-border/60">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl font-bold break-all">{exam.name}</CardTitle>
                        </div>
                        <CardDescription className="line-clamp-2">{exam.description || "No description"}</CardDescription>
                      </div>
                      <div className="flex flex-col items-end gap-2 pl-2">
                        <Badge
                          variant={exam.status === "live" ? "default" : "secondary"}
                          className={`text-xs font-medium ${
                            exam.status === "live" ? "bg-red-500 text-white animate-pulse" :
                            exam.status === "published" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" :
                            exam.status === "ended" ? "bg-gray-500/15 text-gray-600" :
                            ""
                          }`}
                        >
                          {exam.status === "live" && "🔴 "}
                          {exam.status.charAt(0).toUpperCase() + exam.status.slice(1)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-4">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                        <span>
                          Created {new Date(exam.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {liveParticipantCounts[exam.id] ?? 0} students
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {/* An ended session's most useful artifact is its report,
                            so it takes the primary slot and Edit steps back. */}
                        {exam.status === "ended" ? (
                          <>
                            <Button
                              className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => navigate(`/live-exam/${user.id}/${exam.id}/report`)}
                            >
                              <BarChart className="mr-2 h-4 w-4" />
                              Report
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 min-w-[100px]"
                              onClick={() => navigate(`/live-exam/${user.id}/${exam.id}`)}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                          </>
                        ) : (
                          <Button
                            className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => navigate(`/live-exam/${user.id}/${exam.id}`)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleShareLiveExam(exam)}>
                              <Share2 className="mr-2 h-4 w-4" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDuplicateLiveExam(exam)}
                              disabled={duplicatingLiveId !== null}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              {duplicatingLiveId === exam.id ? "Duplicating..." : "Duplicate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteLiveExam(exam)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <ExamTypeDialog
        open={showExamTypeDialog}
        onOpenChange={setShowExamTypeDialog}
        onSelectMock={() => setShowCreateDialog(true)}
        onSelectLive={() => setShowCreateLiveDialog(true)}
      />

      <CreateExamDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onExamCreated={handleExamCreated}
      />

      <CreateLiveExamDialog
        open={showCreateLiveDialog}
        onOpenChange={setShowCreateLiveDialog}
        onExamCreated={handleLiveExamCreated}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Exam</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{examToDelete?.name}"? This will permanently delete the exam and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteExam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Publish/Unpublish Confirmation Dialog — shares the exact validation
          used on the edit-exam page via the PublishExamDialog component. */}
      {publishAction && (
        <PublishExamDialog
          open={showPublishDialog}
          onOpenChange={(open) => {
            setShowPublishDialog(open);
            if (!open) setPublishAction(null);
          }}
          examId={publishAction.examId}
          examName={publishAction.examName}
          isPublishing={publishAction.isPublishing}
          onSuccess={(isPublishing) => {
            setExams(prev => prev.map(e => e.id === publishAction.examId ? { ...e, is_published: isPublishing } : e));
          }}
          onNavigateToQuestion={(sectionId, qNo) => {
            // The dashboard has no inline section editor, so send the creator to
            // the full editor to fix the flagged question.
            navigate(`/exam/${publishAction.examId}`);
          }}
        />
      )}

      <OnboardingModal
        isOpen={showOnboardingModal}
        onComplete={() => setShowOnboardingModal(false)}
      />

      <ProfileDialog
        isOpen={showProfile}
        onOpenChange={setShowProfile}
      />
    </div >
  );
};

export default Dashboard;
