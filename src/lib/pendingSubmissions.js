/**
 * pendingSubmissions.js — the guest's finished-exam queue (issue 18).
 *
 * A student who sits a paper WITHOUT signing in parks the finished sections
 * here; StudentAuth replays them into the account they create. Two rules this
 * module owns:
 *
 * DURABLE PARKING. The queue lives in localStorage. It used to live in
 * sessionStorage, which the browser destroys with the tab — so a guest who
 * finished a 90-minute paper and closed the tab ("I'll sign up tonight") lost
 * everything, silently, on exactly the students most worth converting. Reads
 * still DRAIN the old sessionStorage keys (and the legacy single-entry key),
 * so a guest who was mid-flow when this shipped loses nothing.
 *
 * CROSS-OFF, NOT CLEAR-AT-END. The replay rewrites the queue after each
 * section lands (see StudentAuth). Clearing only after the whole loop meant a
 * network hiccup on section 3 left all 3 parked — and the next sign-in
 * re-saved sections 1-2 as duplicate attempts.
 *
 * Plain JS with JSDoc on purpose: the app imports it as TypeScript (allowJs)
 * and the .mjs test harness imports this very file with storage shims, so the
 * tests exercise the real implementation.
 */

const KEY = "pendingExamSubmissions";
const LEGACY_SINGLE_KEY = "pendingExamSubmission";

/**
 * @param {string | null} raw
 * @returns {any[]}
 */
const parse = (raw) => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [v];
  } catch {
    return [];
  }
};

/** Everything parked, across both storages and the legacy key. @returns {any[]} */
export function readPendingSubmissions() {
  return [
    ...parse(localStorage.getItem(KEY)),
    ...parse(sessionStorage.getItem(KEY)),
    ...parse(localStorage.getItem(LEGACY_SINGLE_KEY)),
    ...parse(sessionStorage.getItem(LEGACY_SINGLE_KEY)),
  ];
}

/** @returns {boolean} */
export function hasPendingSubmissions() {
  return readPendingSubmissions().length > 0;
}

/**
 * Replace the queue with exactly `list`, in the ONE durable location. The old
 * locations are cleared in the same breath — a surviving sessionStorage copy
 * would be re-read and re-appended forever.
 * @param {any[]} list
 */
export function writePendingSubmissions(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  localStorage.removeItem(LEGACY_SINGLE_KEY);
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(LEGACY_SINGLE_KEY);
}

/** @param {any[]} entries */
export function appendPendingSubmissions(entries) {
  writePendingSubmissions([...readPendingSubmissions(), ...entries]);
}

export function clearPendingSubmissions() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_SINGLE_KEY);
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(LEGACY_SINGLE_KEY);
}
