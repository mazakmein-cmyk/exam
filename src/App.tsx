import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
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

const Layout = () => {
  return (
    <>
      <AuthStateListener />
      <Outlet />
      <Toaster />
      <Sonner />
    </>
  );
};

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Index /> },
      { path: "/auth", element: <Auth /> },
      { path: "/student-auth", element: <StudentAuth /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/marketplace", element: <Marketplace /> },
      { path: "/exam/:examId", element: <ExamDetail /> },
      { path: "/exam/:examId/section/:sectionId/edit", element: <ManualFixEditor /> },
      { path: "/exam/:examId/intro", element: <ExamIntro /> },
      { path: "/exam/:examId/section/:sectionId/simulator", element: <ExamSimulator /> },
      { path: "/exam/review/:attemptId", element: <ExamReview /> },
      { path: "/analytics", element: <Analytics /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
