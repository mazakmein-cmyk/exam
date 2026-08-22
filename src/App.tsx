import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from "react-router-dom";
import AuthStateListener from "./components/AuthStateListener";
import GoogleAnalytics from "./components/GoogleAnalytics";
import { isAdminPath } from "./lib/adminRoute";

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
// Hindi twins of the two landing pages. Separate indexable URLs for Hindi
// search demand, no language switcher — see HomeLanding.tsx for the reasoning.
const IndexHindi = lazy(() => import("./pages/IndexHindi"));
const ForCreatorsHindi = lazy(() => import("./pages/ForCreatorsHindi"));
const JsonUploadGuide = lazy(() => import("./pages/JsonUploadGuide"));
const ExamLandingPage = lazy(() => import("./pages/ExamLandingPage"));
const SscMtsLanding = lazy(() => import("./pages/SscMtsLanding"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const LiveExamDetail = lazy(() => import("./pages/LiveExamDetail"));
const LiveExamControl = lazy(() => import("./pages/LiveExamControl"));
const LiveExamStudent = lazy(() => import("./pages/LiveExamStudent"));
const LiveExamPresent = lazy(() => import("./pages/LiveExamPresent"));
const LiveExamReport = lazy(() => import("./pages/LiveExamReport"));

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

/**
 * Warm the two library chunks while the browser is idle on an entry page.
 *
 * Almost every session that starts on the landing or an auth page goes to
 * /marketplace or /dashboard next, so by the time the login redirect fires,
 * the route the user lands on is already in cache and renders without a
 * spinner. Dynamic import() uses the same specifiers as the lazy() routes
 * above, so this fetches the exact chunks the router will ask for — nothing
 * is downloaded twice.
 *
 * Deliberately narrow: only on the three pages that funnel into the
 * libraries (never mid-exam, where spare bandwidth isn't ours to spend),
 * only after the page has gone idle, and not at all when the user has
 * Data Saver on or is on 2G. Failures are ignored — this is a hint, and the
 * router will fetch on demand exactly as before if it didn't land.
 */
const ENTRY_PATHS = ["/", "/auth", "/student-auth"];

const PrefetchLikelyRoutes = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!ENTRY_PATHS.includes(pathname)) return;

    const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData) return;
    if (/(^|\b)(slow-)?2g$/.test(connection?.effectiveType ?? "")) return;

    const warm = () => {
      import("./pages/Marketplace").catch(() => {});
      import("./pages/Dashboard").catch(() => {});
    };

    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(id);
  }, [pathname]);

  return null;
};

/**
 * Terminal route: a 404, or the admin console.
 *
 * The console is reached by hashing the current pathname and comparing it to a
 * committed digest, rather than by declaring its path in the route table above.
 * That is the whole point — a declared path is a plaintext string in the bundle,
 * so the URL was discoverable by anything that could read `/assets/index-*.js`,
 * Googlebot included. Matching on a digest means the bundle contains no URL to
 * find, while robots.txt, the first-byte noindex and the X-Robots-Tag header
 * keep working as the outer layers.
 *
 * The check is async (crypto.subtle), so the first frame is the shared route
 * spinner rather than a 404 — otherwise a legitimate admin visit would flash
 * "page not found" before resolving.
 */
const UnmatchedRoute = () => {
  const { pathname } = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setIsAdmin(null);
    isAdminPath(pathname).then((match) => {
      if (active) setIsAdmin(match);
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  if (isAdmin === null) return <RouteFallback />;
  return isAdmin ? <AdminDashboard /> : <NotFound />;
};

const Layout = () => (
  <>
    <AuthStateListener />
    {/* Deliberately not on PresentLayout: that route is a projector on a wall,
        and counting it as a session would inflate every engagement metric. */}
    <GoogleAnalytics />
    <PrefetchLikelyRoutes />
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
    <Toaster />
    {/* The sonner toaster used to mount here too, but the only page that
        raises sonner toasts is the admin dashboard — so it mounts there, and
        the sonner library stays out of the chunk every visitor downloads. */}
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
      /* The admin console is deliberately NOT declared here — a path in this
         table is a plaintext string in the shipped bundle, which is how the URL
         used to be public despite robots.txt and noindex. It resolves through
         UnmatchedRoute below, which matches on a SHA-256 digest instead. See
         src/lib/adminRoute.ts. */
      { path: "/privacy-policy", element: <PrivacyPolicy /> },
      { path: "/terms-of-service", element: <TermsOfService /> },
      { path: "/for-creators", element: <ForCreators /> },
      { path: "/hindi", element: <IndexHindi /> },
      { path: "/hindi/for-creators", element: <ForCreatorsHindi /> },
      { path: "/json-upload-guide", element: <JsonUploadGuide /> },
      { path: "/mock-test/:examSlug", element: <ExamLandingPage /> },
      // Standalone campaign landing page, shared directly with SSC MTS aspirants.
      // Deliberately NOT under /mock-test/:examSlug — that route is the generic
      // data-driven template, and this page is hand-built for one audience.
      { path: "/ssc-mts", element: <SscMtsLanding /> },
      { path: "/blog", element: <Blog /> },
      { path: "/blog/:slug", element: <BlogPost /> },
      { path: "/live/:shareCode", element: <LiveExamStudent /> },
      { path: "/live-exam/:creatorId/:liveExamId", element: <LiveExamDetail /> },
      { path: "/live-exam/:creatorId/:liveExamId/control", element: <LiveExamControl /> },
      { path: "/live-exam/:creatorId/:liveExamId/report", element: <LiveExamReport /> },
      // D1's public link. Deliberately under the normal layout, not the present
      // one: a report is read on a laptop, and a copy-confirmation toast is
      // welcome there in a way it never is on a projector.
      { path: "/live-report/:token", element: <LiveExamReport /> },
      { path: "*", element: <UnmatchedRoute /> },
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
