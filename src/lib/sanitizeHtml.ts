/**
 * sanitizeHtml.ts — the render-time boundary for creator-authored HTML.
 *
 * One function, called from exactly one place (the tail of renderMathInHtml,
 * which every HTML-mode display path funnels through), with one config
 * (sanitizeConfig.js — see there for what is kept and why).
 *
 * The browser build uses DOMPurify's default instance, bound to the real
 * window. The node test suite constructs its own instance around jsdom with
 * the same imported config, so what the tests prove is what ships.
 */
import DOMPurify from "dompurify";
import { SANITIZE_CONFIG } from "./sanitizeConfig.js";

export function sanitizeStoredHtml(html: string): string {
  // DOMPurify.isSupported is false only in environments with no usable DOM.
  // The app only runs in browsers, but if that ever changes, failing CLOSED
  // (render nothing) is the only acceptable behavior for untrusted HTML —
  // returning it unsanitized would quietly reopen the hole everywhere.
  if (!DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, SANITIZE_CONFIG as never) as unknown as string;
}
