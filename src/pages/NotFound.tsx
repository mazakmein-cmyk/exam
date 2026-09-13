import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import SEO from "@/components/SEO";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <SEO
        title="Page Not Found (404) | MockSetu (Mockset)"
        description="The page you're looking for doesn't exist on MockSetu (Mockset). Head back to the home page to start free mock tests for JEE, NEET, CAT, GATE, and UPSC."
        path={location.pathname}
        noindex
      />
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">Oops! Page not found</p>
        {/* Router links, not raw <a href>: these are internal routes, so a plain
            click should not throw away the loaded app and reload the whole
            bundle. They stay real anchors, so Cmd/Ctrl+click, middle-click and
            "Open link in new tab" keep working exactly as before. */}
        <Link to="/" className="text-blue-500 underline hover:text-blue-700">
          Return to MockSetu Home
        </Link>
        <p className="mt-6 text-sm text-gray-500">
          Looking for free mock tests on Mockset?{" "}
          <Link to="/marketplace" className="text-blue-500 underline hover:text-blue-700">
            Browse the MockSetu exam library
          </Link>
          .
        </p>
      </div>
    </div>
  );
};

export default NotFound;
