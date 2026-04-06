import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Plus, BookOpen, Trash2, MoreVertical, Share2, Copy, User, BarChart, FileText } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import CreateExamDialog from "@/components/CreateExamDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  created_at: string;
  is_published: boolean;
  exam_category: string | null;
};

import { useUserRole } from "@/hooks/use-user-role";

const Dashboard = () => {
  const { role, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [examToDelete, setExamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Publish/Unpublish Confirmation State
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishAction, setPublishAction] = useState<{ examId: string; examName: string; isPublishing: boolean } | null>(null);
  
  // New States for precise Language Publishing
  const [publishLangErrors, setPublishLangErrors] = useState<Record<string, string[]>>({});
  const [supportedLangsToPublish, setSupportedLangsToPublish] = useState<string[]>([]);
  const [selectedLangsForPublish, setSelectedLangsForPublish] = useState<string[]>([]);

  const navigate = useNavigate();
  const { toast } = useToast();

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

  const handleTakeExam = async (examId: string) => {
    try {
      // Navigate to the exam intro
      navigate(`/exam/${examId}/intro`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start exam",
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

      // Create a copy of the exam
      const { data: newExam, error: examError } = await supabase
        .from("exams")
        .insert({
          name: `${exam.name} (Copy)`,
          description: exam.description,
          description_translations: exam.description_translations,
          instruction: exam.instruction,
          instruction_translations: exam.instruction_translations,
          exam_category: exam.exam_category,
          user_id: user.id,
          is_published: false,
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

      // Duplicate all sections and their questions
      for (const section of sectionsData || []) {
        const { data: newSection, error: sectionError } = await supabase
          .from("sections")
          .insert({
            exam_id: newExam.id,
            name: section.name,
            time_minutes: section.time_minutes,
          })
          .select()
          .single();

        if (sectionError) throw sectionError;

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

  const handleTogglePublishClick = async (examId: string, examName: string, isPublishing: boolean) => {
    // Reset publish states
    setPublishLangErrors({});
    setSupportedLangsToPublish([]);
    setSelectedLangsForPublish([]);

    // If publishing, evaluate errors for every supported language independently
    if (isPublishing) {
      try {
        // Fetch exam to check for supported languages and current published languages
        const { data: examData } = await supabase
          .from("exams")
          .select("supported_languages, published_languages")
          .eq("id", examId)
          .single();

        const supportedLangs = (examData as any)?.supported_languages || ["en"];
        setSupportedLangsToPublish(supportedLangs);

        // Fetch sections for this exam
        const { data: sections, error: sectionsError } = await supabase
          .from("sections")
          .select("id, name, language")
          .eq("exam_id", examId);

        if (sectionsError) throw sectionsError;

        if (!sections || sections.length === 0) {
          toast({
            title: "Cannot Publish Exam",
            description: "This exam has no sections. Please add at least one section with questions.",
            variant: "destructive",
          });
          return;
        }

        // Validate each language independently
        const errorsMap: Record<string, string[]> = {};
        const validLangs: string[] = [];

        for (const lang of supportedLangs) {
          const langErrors: string[] = [];
          const langSections = sections.filter((s: any) => (s as any).language === lang);
          
          if (langSections.length === 0) {
            langErrors.push(`No sections found.`);
          } else {
            for (const section of langSections) {
              const { count, error: countError } = await supabase
                .from("parsed_questions")
                .select("id", { count: "exact", head: true })
                .eq("section_id", section.id);

              if (countError) throw countError;
              if (count === 0) {
                langErrors.push(`Section "${section.name}" has no questions.`);
              }

              // Check for blank placeholder questions and get their numbers
              const { data: blankQs } = await supabase
                .from("parsed_questions")
                .select("q_no")
                .eq("section_id", section.id)
                .eq("text", "")
                .order("q_no", { ascending: true });

              if (blankQs && blankQs.length > 0) {
                const qNos = blankQs.map(q => q.q_no).join(", ");
                langErrors.push(`In Section "${section.name}", Question(s) [${qNos}] are blank/untranslated.`);
              }
            }
          }

          errorsMap[lang] = langErrors;
          if (langErrors.length === 0) {
             validLangs.push(lang);
          }
        }

        setPublishLangErrors(errorsMap);
        
        // Let the user start with the currently published languages, or all valid ones if none published yet
        const currentlyPublished = (examData as any)?.published_languages || [];
        setSelectedLangsForPublish(currentlyPublished.length > 0 ? currentlyPublished : []);

      } catch (error: any) {
        toast({
          title: "Validation Error",
          description: error.message || "Failed to validate exam",
          variant: "destructive",
        });
        return;
      }
    }

    setPublishAction({ examId, examName, isPublishing });
    setShowPublishDialog(true);
  };

  const executeTogglePublish = async () => {
    if (!publishAction) return;

    const { examId, isPublishing } = publishAction;
    
    if (isPublishing && selectedLangsForPublish.length === 0) {
      toast({
        title: "No Languages Selected",
        description: "Please select at least one language to publish.",
        variant: "destructive",
      });
      return;
    }

    try {
      const payloadLangs = isPublishing ? selectedLangsForPublish : [];

      const { error } = await supabase
        .from("exams")
        .update({
          is_published: isPublishing,
          published_languages: payloadLangs,
        })
        .eq("id", examId);

      if (error) throw error;

      setExams(exams.map(e => e.id === examId ? { ...e, is_published: isPublishing } : e));
      toast({
        title: isPublishing ? "Published" : "Unpublished",
        description: isPublishing
          ? `Exam is now visible in Marketplace${payloadLangs.length > 1 ? ` in ${payloadLangs.length} languages` : ""}`
          : "Exam removed from Marketplace",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update publish status",
        variant: "destructive",
      });
    } finally {
      setShowPublishDialog(false);
      setPublishAction(null);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex h-16 items-center justify-between">
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              onClick={() => navigate("/dashboard")}
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
              <Button variant="ghost" onClick={() => setShowProfile(true)}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </Button>
              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
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
            <p className="text-muted-foreground mt-1 text-sm">Create and manage your mock exam simulations</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="self-start md:self-auto bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-lg shadow-[#6C3EF4]/25 hover:shadow-[#6C3EF4]/35 hover:-translate-y-px transition-all duration-200">
            <Plus className="mr-2 h-4 w-4" />
            New Exam
          </Button>
        </div>

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
            <Button onClick={() => setShowCreateDialog(true)} className="bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-lg shadow-[#6C3EF4]/25 hover:-translate-y-px transition-all duration-200">
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Exam
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
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
                          <BookOpen className="mr-2 h-4 w-4" />
                          View Exam
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
      </main>

      <CreateExamDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onExamCreated={handleExamCreated}
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

      {/* Publish/Unpublish Confirmation Dialog */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishAction?.isPublishing ? "Publish Exam" : "Unpublish Exam"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="mt-2 outline-none">
                {publishAction?.isPublishing ? (
                  <div className="space-y-4 text-sm text-muted-foreground outline-none">
                    <p>Select the languages you want to publish for "{publishAction?.examName}".</p>
                    <div className="rounded-md border p-4 space-y-4">
                      <div className="flex items-center justify-between pb-4 border-b">
                        <span className="font-semibold text-foreground">Select All Valid</span>
                        <Switch 
                          checked={
                            selectedLangsForPublish.length > 0 && 
                            selectedLangsForPublish.length === supportedLangsToPublish.filter(l => publishLangErrors[l]?.length === 0).length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const validLangs = supportedLangsToPublish.filter(l => publishLangErrors[l]?.length === 0);
                              setSelectedLangsForPublish(validLangs);
                              const skipped = supportedLangsToPublish.filter(l => publishLangErrors[l]?.length > 0);
                              if (skipped.length > 0) {
                                toast({
                                  title: "Languages Skipped",
                                  description: "Some languages have errors and were not selected.",
                                });
                              }
                            } else {
                              setSelectedLangsForPublish([]);
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-3">
                        {supportedLangsToPublish.map((lang) => {
                          const hasErrors = publishLangErrors[lang] && publishLangErrors[lang].length > 0;
                          const getLangName = (code: string) => {
                            if (code === 'en') return 'English';
                            if (code === 'hi') return 'Hindi';
                            return code.toUpperCase();
                          };

                          return (
                            <div key={lang} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className={`${hasErrors ? 'text-destructive font-medium' : 'text-foreground'}`}>
                                  {getLangName(lang)} {hasErrors ? "(Errors)" : ""}
                                </span>
                                <Switch 
                                  checked={selectedLangsForPublish.includes(lang)}
                                  onCheckedChange={(checked) => {
                                    if (checked && hasErrors) {
                                      toast({
                                        title: `Cannot Publish ${getLangName(lang)}`,
                                        description: (
                                          <div className="mt-1 space-y-1">
                                            {publishLangErrors[lang].map((err, i) => (
                                              <p key={i} className="text-xs font-medium">• {err}</p>
                                            ))}
                                          </div>
                                        ),
                                        variant: "destructive"
                                      });
                                      return;
                                    }
                                    if (checked) {
                                      setSelectedLangsForPublish(prev => [...prev, lang]);
                                    } else {
                                      setSelectedLangsForPublish(prev => prev.filter(l => l !== lang));
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="block mt-2">Are you sure you want to unpublish "{publishAction?.examName}"? This will remove the exam from the Marketplace.</span>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowPublishDialog(false); setPublishAction(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeTogglePublish} className={publishAction?.isPublishing ? "bg-primary" : "bg-orange-500 hover:bg-orange-600"}>
              {publishAction?.isPublishing ? "Publish" : "Unpublish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
