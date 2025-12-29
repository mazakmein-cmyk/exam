import { Button } from "@/components/ui/button";
import { LogIn, Clock, CheckCircle2, TrendingUp, Store } from "lucide-react";
import heroImage from "@/assets/hero-exam.jpg";
import { useRef, useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CreateExamDialog from "./CreateExamDialog";

const Hero = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    checkAuth();

    // Check if returning from auth with a pending file
    const pendingFileName = sessionStorage.getItem('pendingPdfUpload');
    if (pendingFileName && isAuthenticated) {
      setDialogOpen(true);
      sessionStorage.removeItem('pendingPdfUpload');
    }
  }, [isAuthenticated]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);

      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Store file name and redirect to auth
        sessionStorage.setItem('pendingPdfUpload', file.name);
        toast({
          title: "Authentication required",
          description: "Please sign in or sign up to upload your exam PDF",
        });
        navigate('/auth');
      } else {
        // User is authenticated, open the dialog
        setDialogOpen(true);
      }
    }
  };

  return (
    <>
      <CreateExamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onExamCreated={() => {
          setDialogOpen(false);
          navigate('/dashboard');
        }}
      />

      <section className="relative overflow-hidden bg-gradient-hero py-24 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-3xl lg:text-4xl font-bold text-primary-foreground leading-tight">
                  Transform PDFs into
                  <span className="block mt-2 text-warning">Realistic Mock Exams</span>
                </h1>
                <p className="text-xl text-primary-foreground/90 max-w-lg">
                  Upload your JEE, NEET, or CAT exam papers and get an authentic exam simulator with timers, analytics, and detailed performance tracking.
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                className="hidden"
              />

              <div className="flex flex-wrap gap-4">
                <Button size="lg" variant="secondary" className="shadow-lg" onClick={() => navigate('/student-auth')}>
                  <LogIn className="mr-2 h-5 w-5" />
                  Sign In
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="shadow-lg bg-transparent border-white/20 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => navigate('/marketplace')}
                >
                  <Store className="mr-2 h-5 w-5" />
                  Marketplace
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-8">
                <div className="space-y-2">
                  <Clock className="h-8 w-8 text-warning" />
                  <div className="text-sm font-medium text-primary-foreground/90">Section Timers</div>
                </div>
                <div className="space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                  <div className="text-sm font-medium text-primary-foreground/90">Exact Questions</div>
                </div>
                <div className="space-y-2">
                  <TrendingUp className="h-8 w-8 text-primary-foreground" />
                  <div className="text-sm font-medium text-primary-foreground/90">Deep Analytics</div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-glow">
                <img
                  src={heroImage}
                  alt="ExamSim platform showing exam interface with timer and questions"
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Hero;
