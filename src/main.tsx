// Imported first so it reads the recovery token from the URL before anything
// else (notably supabase-js) can strip it. See recoveryLanding.ts.
import "./lib/recoveryLanding";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
