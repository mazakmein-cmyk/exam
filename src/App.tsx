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
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
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
const LiveExamDetail = lazy(() => import("./pages/LiveExamDetail"));
const LiveExamControl = lazy(() => import("./pages/LiveExamControl"));
const LiveExamStudent = lazy(() => import("./pages/LiveExamStudent"));
const LiveExamPresent = lazy(() => import("./pages/LiveExamPresent"));

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

/**
 * Layout for the projector view — identical to Layout except that it mounts NO
 * toaster (E4).
 *
 * This is the structural half of "toasts stay creator-side". The present screen
 * is on a wall in front of a class, and the control room raises toasts for
 * routine events ("Q4 Unlocked!") as well as failures ("Error computing
 * analytics"). The second kind, projected, makes the product look broken and
 * makes students doubt whether their answer registered.
 *
 * A flag the present page had to remember to check would eventually be
 * forgotten, and the cost of forgetting lands in front of thirty people. With no
 * toaster in the tree there is nothing to forget: a stray toast() call from
 * shared code simply has nowhere to render.
 */
const PresentLayout = () => (
  <>
    <AuthStateListener />
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  </>
);

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Index /> },
      { path: "/auth", element: <Auth /> },
      { path: "/student-auth", element: <StudentAuth /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/marketplace", element: <Marketplace /> },
      { path: "/exam/:examId", element: <ExamDetail /> },
      { path: "/exam/:examId/section/:sectionId/edit", element: <ManualFixEditor /> },
      { path: "/exam/:examId/intro", element: <ExamIntro /> },
      { path: "/exam/:examId/section/:sectionId/simulator", element: <ExamSimulator /> },
      { path: "/exam/review/:attemptId", element: <ExamReview /> },
      { path: "/analytics", element: <Analytics /> },
      { path: "/barnwal3008/admin", element: <AdminDashboard /> },
      { path: "/privacy-policy", element: <PrivacyPolicy /> },
      { path: "/terms-of-service", element: <TermsOfService /> },
      { path: "/for-creators", element: <ForCreators /> },
      { path: "/json-upload-guide", element: <JsonUploadGuide /> },
      { path: "/mock-test/:examSlug", element: <ExamLandingPage /> },
      { path: "/blog", element: <Blog /> },
      { path: "/blog/:slug", element: <BlogPost /> },
      { path: "/live/:shareCode", element: <LiveExamStudent /> },
      { path: "/live-exam/:creatorId/:liveExamId", element: <LiveExamDetail /> },
      { path: "/live-exam/:creatorId/:liveExamId/control", element: <LiveExamControl /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    // Its own layout, so no toaster exists on this route at all. See PresentLayout.
    element: <PresentLayout />,
    children: [
      { path: "/live-exam/:creatorId/:liveExamId/present", element: <LiveExamPresent /> },
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
