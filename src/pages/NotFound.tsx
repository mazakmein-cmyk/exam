import { useLocation } from "react-router-dom";
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
        title="Page Not Found (404) | MockSetu"
        description="The page you're looking for doesn't exist on MockSetu. Head back to the home page to start free mock tests for JEE, NEET, CAT, GATE, and UPSC."
        path={location.pathname}
        noindex
      />
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">Oops! Page not found</p>
        <a href="/" className="text-blue-500 underline hover:text-blue-700">
          Return to MockSetu Home
        </a>
        <p className="mt-6 text-sm text-gray-500">
          Looking for free mock tests?{" "}
          <a href="/marketplace" className="text-blue-500 underline hover:text-blue-700">
            Browse the exam library
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default NotFound;
