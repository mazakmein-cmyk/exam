import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import AuthStateListener from "./components/AuthStateListener";

// Eager: tiny + likely first hit
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy: every other route is a separate chunk, loaded on demand.
// Heavy libs (recharts, katex, react-pdf, react-image-crop) ship only with the
// routes that actually use them.
const Auth = lazy(() => import("./pages/Auth"));
const StudentAuth = lazy(() => import("./pages/StudentAuth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const ExamDetail = lazy(() => import("./pages/ExamDetail"));
const ManualFixEditor = lazy(() => import("./pages/ManualFixEditor"));
const ExamSimulator = lazy(() => import("./pages/ExamSimulator"));
const ExamReview = lazy(() => import("./pages/ExamReview"));
const Analytics = lazy(() => import("./pages/Analytics"));
const ExamIntro = lazy(() => import("./pages/ExamIntro"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const ForCreators = lazy(() => import("./pages/ForCreators"));
const JsonUploadGuide = lazy(() => import("./pages/JsonUploadGuide"));
const ExamLandingPage = lazy(() => import("./pages/ExamLandingPage"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
  </div>
);

const Layout = () => (
  <>
    <AuthStateListener />
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
    <Toaster />
    <Sonner />
  </>
);

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
      { path: "/barnwal3008-admin", element: <AdminDashboard /> },
      { path: "/privacy-policy", element: <PrivacyPolicy /> },
      { path: "/terms-of-service", element: <TermsOfService /> },
      { path: "/for-creators", element: <ForCreators /> },
      { path: "/json-upload-guide", element: <JsonUploadGuide /> },
      { path: "/mock-test/:examSlug", element: <ExamLandingPage /> },
      { path: "/blog", element: <Blog /> },
      { path: "/blog/:slug", element: <BlogPost /> },
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
