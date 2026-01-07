import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import StudentAuth from "./pages/StudentAuth";
import Dashboard from "./pages/Dashboard";
import Marketplace from "./pages/Marketplace";
import ExamDetail from "./pages/ExamDetail";
import ManualFixEditor from "./pages/ManualFixEditor";
import ExamSimulator from "./pages/ExamSimulator";
import ExamReview from "./pages/ExamReview";
import Analytics from "./pages/Analytics";
import ExamIntro from "./pages/ExamIntro";
import NotFound from "./pages/NotFound";
import AuthStateListener from "./components/AuthStateListener";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthStateListener />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/student-auth" element={<StudentAuth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/exam/:examId" element={<ExamDetail />} />
          <Route path="/exam/:examId/section/:sectionId/edit" element={<ManualFixEditor />} />
          <Route path="/exam/:examId/intro" element={<ExamIntro />} />
          <Route path="/exam/:examId/section/:sectionId/simulator" element={<ExamSimulator />} />
          <Route path="/exam/review/:attemptId" element={<ExamReview />} />
          <Route path="/analytics" element={<Analytics />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
