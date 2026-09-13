/**
 * navigation.ts — the house rules for "a click that goes somewhere".
 *
 * Ctrl/Cmd+click, middle-click, Shift+click and "Open link in new tab" are not
 * features a page implements; they are things the BROWSER does for free the
 * moment a destination is expressed as a real `<a href>`. Every one of them was
 * broken across this app for the same reason: the destination lived in a
 * `onClick={() => navigate(...)}` on a `<button>` or a `<div>`, where the
 * browser can see no URL to open, no URL to copy, and no URL to preview in the
 * status bar.
 *
 * So the rule is: if a click's whole job is to go to a URL, it renders as a
 * link. Concretely —
 *
 *   plain text / icon        <Link to="/x">                      (react-router)
 *   a shadcn <Button>        <Button asChild><Link to="/x">…</Link></Button>
 *   a radix menu row         <DropdownMenuItem asChild><Link to="/x">…</Link>
 *   opens a new tab today    <Link to="/x" target="_blank" rel="noopener noreferrer">
 *   bookkeeping + go         <Link to="/x" onClick={rememberThing}>
 *
 * react-router's <Link> already does the right thing with a modified click: it
 * only calls navigate() for a plain left-click on a `_self` target, and
 * otherwise stands aside and lets the browser open the tab. That is why the
 * bulk of this work is a rewrite into <Link>, not new machinery.
 *
 * What deliberately stays a <button>: a click that DOES something — start an
 * attempt, submit, publish, duplicate, sign out — even when it happens to end
 * in a redirect. Those have no shareable destination before they run, and
 * Cmd+clicking one into a background tab would either fire the action twice or
 * open a URL that is not ready yet.
 *
 * `isModifiedClick` is the escape hatch for the handful of places where an
 * anchor genuinely cannot be the element (a clickable `<tr>`, a control Radix
 * insists on owning). There, the handler opens the URL itself instead of
 * routing in place.
 */
import type { MouseEvent } from "react";

/**
 * Does this click mean "somewhere else", not "here"?
 *
 * Mirrors react-router's own test (`isModifiedEvent` + `event.button === 0`) so
 * a hand-rolled handler and a <Link> never disagree about what a Cmd+click is.
 * `button !== 0` covers the middle-click that some browsers report through
 * `click` rather than `auxclick`.
 */
export const isModifiedClick = (e: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "button">): boolean =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/**
 * For the escape-hatch case: run `inPlace` for a plain click, and let a modified
 * click open `href` in a new tab instead.
 *
 * Returns nothing and swallows nothing — callers still control preventDefault,
 * because the element this runs on is usually not an anchor and has no default
 * to prevent.
 */
export const openInNewTabOnModifiedClick = (
  e: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "button">,
  href: string,
): boolean => {
  if (!isModifiedClick(e)) return false;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
};
