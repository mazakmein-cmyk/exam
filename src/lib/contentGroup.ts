/**
 * contentGroup.ts — the GA4 `content_group` for the current route.
 *
 * WHY A DOM ATTRIBUTE RATHER THAN STATE OR CONTEXT
 * ------------------------------------------------
 * GoogleAnalytics sits ABOVE <Outlet/>, so its route effect flushes before the
 * routed page's effects have run. It already solves that for the page title by
 * deferring the page_view by one macrotask and then reading `document.title` —
 * whatever the page's <SEO/> wrote by then. The content group has exactly the
 * same ordering problem and therefore uses exactly the same channel: the page
 * writes an attribute, the deferred callback reads it.
 *
 * A context or a store would need the provider to sit above the analytics
 * component and every page to be a consumer, which is a lot of wiring to carry
 * one string that only one reader ever wants. The attribute also fails safe: a
 * page that never sets one simply reports no group rather than inheriting the
 * previous route's.
 *
 * The group is NOT the page title or the path — it is the editorial bucket a
 * page belongs to ("For Educators", "Exam Strategy"), so a whole content
 * cluster can be read in GA4 as one line instead of two hundred URLs.
 */
const ATTR = "data-content-group";

/** Set (or with `null`, clear) the content group for the route being rendered. */
export const setContentGroup = (group: string | null) => {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (group) el.setAttribute(ATTR, group);
  else el.removeAttribute(ATTR);
};

/** Read the current route's content group, or undefined when none was set. */
export const readContentGroup = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.getAttribute(ATTR) ?? undefined;
};
