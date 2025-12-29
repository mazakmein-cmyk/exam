import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, LogOut, Plus, BarChart3, BookOpen, Trash2, MoreVertical, Share2 } from "lucide-react";
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

type Exam = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  is_published: boolean;
  exam_category: string | null;
};

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [examToDelete, setExamToDelete] = useState<{ id: string; name: string } | null>(null);
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
      setExams(data || []);
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

  const handleShare = (examName: string) => {
    toast({
      title: "Share Exam",
      description: `Sharing functionality for "${examName}" coming soon!`,
    });
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

  const handleTogglePublish = async (examId: string, isPublished: boolean) => {
    try {
      const { error } = await supabase
        .from("exams")
        .update({ is_published: isPublished })
        .eq("id", examId);

      if (error) throw error;

      setExams(exams.map(e => e.id === examId ? { ...e, is_published: isPublished } : e));
      toast({
        title: isPublished ? "Published" : "Unpublished",
        description: isPublished ? "Exam is now visible in Marketplace" : "Exam removed from Marketplace",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update publish status",
        variant: "destructive",
      });
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
              <Button variant="ghost" onClick={() => navigate("/analytics")}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Exams</h1>
            <p className="text-muted-foreground mt-2">Create and manage your exam simulations</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => (
              <Card key={exam.id} className="flex flex-col justify-between">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl font-bold">{exam.name}</CardTitle>
                    </div>
                    <CardDescription>{exam.description || "No description"}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {exam.is_published ? "Published" : "Unpublished"}
                      </span>
                      <Switch
                        checked={exam.is_published}
                        onCheckedChange={(checked) => handleTogglePublish(exam.id, checked)}
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
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => navigate(`/exam/${exam.id}`)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Edit Exam
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
                        <DropdownMenuItem onClick={() => handleShare(exam.name)}>
                          <Share2 className="mr-2 h-4 w-4" />
                          Share
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
    </div>
  );
};

export default Dashboard;
