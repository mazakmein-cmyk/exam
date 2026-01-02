import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, LogOut, Plus, BookOpen, Trash2, MoreVertical, Share2, Copy } from "lucide-react";
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

type Exam = {
  id: string;
  name: string;
  description: string | null;
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

  // Publish/Unpublish Confirmation State
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishAction, setPublishAction] = useState<{ examId: string; examName: string; isPublishing: boolean } | null>(null);
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
      setExams((data || []) as Exam[]);
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

  const handleDeleteExam = (examId: string, examName: string) => {
    setExamToDelete({ id: examId, name: examName });
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

  const handleTogglePublishClick = (examId: string, examName: string, isPublishing: boolean) => {
    setPublishAction({ examId, examName, isPublishing });
    setShowPublishDialog(true);
  };

  const executeTogglePublish = async () => {
    if (!publishAction) return;

    const { examId, isPublishing } = publishAction;

    try {
      const { error } = await supabase
        .from("exams")
        .update({ is_published: isPublishing })
        .eq("id", examId);

      if (error) throw error;

      setExams(exams.map(e => e.id === examId ? { ...e, is_published: isPublishing } : e));
      toast({
        title: isPublishing ? "Published" : "Unpublished",
        description: isPublishing ? "Exam is now visible in Marketplace" : "Exam removed from Marketplace",
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
      <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="container mx-auto max-w-7xl px-6">
          <div className="flex h-16 items-center justify-between">
            <div
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => navigate("/dashboard")}
            >
              <FileText className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold text-foreground">ExamSim</span>
            </div>
            <div className="flex items-center gap-2">

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
            <h1 className="text-3xl font-bold text-foreground">My Exams</h1>
            <p className="text-muted-foreground mt-2">Create and manage your exam simulations</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} className="self-start md:self-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Exam
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading exams...</p>
          </div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No exams yet</h3>
              <p className="text-muted-foreground mb-4">Get started by creating your first exam</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Exam
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
              <Card key={exam.id} className="flex flex-col justify-between">
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
                      <Switch
                        checked={exam.is_published}
                        onCheckedChange={(checked) => handleTogglePublishClick(exam.id, exam.name, checked)}
                      />
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
                      onClick={() => handleTakeExam(exam.id)}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      View Exam
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
                        <DropdownMenuItem onClick={() => handleDuplicateExam(exam)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteExam(exam.id, exam.name)}
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
            <AlertDialogDescription>
              {publishAction?.isPublishing
                ? `Are you sure you want to publish "${publishAction?.examName}"? This will make the exam visible in the Marketplace for everyone.`
                : `Are you sure you want to unpublish "${publishAction?.examName}"? This will remove the exam from the Marketplace.`
              }
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
    </div >
  );
};

export default Dashboard;
