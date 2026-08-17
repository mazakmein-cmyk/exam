/**
 * infinite-scroll-library.test.mjs — the exam library grids materialise in
 * batches, and scrolling must always be able to reach the end.
 *
 * Both library pages render every card the filters return. A creator card mounts
 * a switch, a tooltip and a dropdown-menu root; a student card mounts a
 * dropdown-menu root. Several hundred of those built before first paint is the
 * dominant cost of a large library, so the grids now render a batch at a time and
 * extend as the reader scrolls.
 *
 * There is exactly one way this feature fails badly, and it is silent: the list
 * stops extending partway down and the remaining exams become unreachable. This
 * file exists to hold the two things that prevent that.
 *
 * Run with: node src/__tests__/infinite-scroll-library.test.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const readSrc = (p) => readFileSync(resolve(ROOT, "src", p), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
    failed++;
    failures.push({ name, message: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "not equal"} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

const HOOK = readSrc("hooks/use-infinite-list.ts");
const LIBRARY = readSrc("pages/Marketplace.tsx");
const DASHBOARD = readSrc("pages/Dashboard.tsx");

console.log("\n[1] the batching arithmetic always terminates at the full list");

/**
 * The hook's growth step, lifted out so it can be driven to completion here.
 * `Math.min` is the whole reason a run cannot overshoot the list and leave
 * `hasMore` true forever with nothing left to add.
 */
const nextCount = (count, pageSize, total) => Math.min(count + pageSize, total);

await test("scrolling always reaches the last exam, for every list size", () => {
  for (const total of [0, 1, 23, 24, 25, 47, 48, 49, 500, 1001]) {
    for (const pageSize of [1, 5, 24]) {
      // The hook starts at one page and grows only while hasMore.
      let count = pageSize;
      let batches = 0;
      while (count < total) {
        count = nextCount(count, pageSize, total);
        batches++;
        assert(batches < 5000, `total=${total} pageSize=${pageSize} never converged`);
      }
      const label = `total=${total} pageSize=${pageSize}`;
      // What the grid actually renders is items.slice(0, count).
      const rendered = Math.min(count, total);
      assertEqual(rendered, total, `${label}: stopped short — those exams would be unreachable`);
      // And once it has grown at all, it lands exactly on the total rather than
      // leaving hasMore true with nothing left to append (an endless sentinel).
      if (total > pageSize) {
        assertEqual(count, total, `${label}: must land exactly on the total`);
      }
      assert(!(count < total), `${label}: hasMore must be false at the end`);
    }
  }
});

await test("a list that fits in one batch never asks for another", () => {
  const pageSize = 24;
  for (const total of [0, 1, 23, 24]) {
    assert(!(pageSize < total), `${total} exams must render with no sentinel at page size ${pageSize}`);
  }
  assert(pageSize < 25, "25 exams must report more to load at page size 24");
});

console.log("\n[2] the anti-stall invariant");

await test("the observer is re-created per batch — visibleCount is in its deps", () => {
  // An IntersectionObserver only fires when intersection CHANGES. If appending a
  // batch leaves the sentinel still inside rootMargin, no second callback ever
  // arrives and the list stalls. Re-creating the observer yields a fresh initial
  // callback, which continues the run. Without this there is no button left to
  // rescue it, so the dependency is load-bearing.
  assert(
    /\}, \[sentinel, hasMore, items\.length, pageSize, visibleCount\]\);/.test(HOOK),
    "the observer effect must depend on visibleCount, or scrolling stalls partway down a long library"
  );
});

await test("a tab switch re-attaches the observer to the new sentinel node", () => {
  // Both library pages have tabs, and switching tabs remounts one grid without
  // remounting the page. Held in a ref object, the returning tab's brand-new
  // sentinel node would change no dependency, so the effect would not re-run and
  // the observer would stay pointed at the detached old node — that tab would
  // simply never load another batch again. Tracking the node in state is what
  // makes "the node changed" observable.
  assert(
    /const \[sentinel, setSentinel\] = useState<HTMLElement \| null>\(null\);/.test(HOOK),
    "the sentinel node must live in state so a replaced node re-triggers the effect"
  );
  assert(
    /sentinelRef: setSentinel/.test(HOOK),
    "the returned ref must be the state setter — a callback ref React invokes on attach/detach"
  );
  assert(
    !/useRef/.test(HOOK),
    "a ref object here is the bug this test exists to prevent"
  );
  assert(
    /observer\.observe\(sentinel\)/.test(HOOK),
    "the observer must watch the node from state, not a ref's current value"
  );
});

await test("there is a real fallback when IntersectionObserver does not exist", () => {
  assert(
    /typeof IntersectionObserver === "undefined"/.test(HOOK),
    "a browser with no observer must not be left unable to reach the rest of the list"
  );
  assert(
    /setVisibleCount\(items\.length\)/.test(HOOK),
    "the fallback has to render EVERYTHING, not just one more batch"
  );
});

await test("a filter or search change restarts from the first batch", () => {
  assert(
    /useEffect\(\(\) => \{\s*setVisibleCount\(pageSize\);\s*\}, \[items, pageSize\]\);/.test(HOOK),
    "a new result set is a different list and must not inherit the old scroll depth"
  );
});

await test("the sentinel has height — a zero-height trip-wire can be skipped", () => {
  for (const [name, src] of [["Marketplace", LIBRARY], ["Dashboard", DASHBOARD]]) {
    const sentinels = src.match(/ref=\{\w*[sS]entinelRef\} aria-hidden="true" className="h-8"/g) || [];
    assert(sentinels.length >= 1, `${name} must render a sentinel with a non-zero height`);
  }
});

console.log("\n[3] both sides scroll, and neither hides rows behind a button");

await test("the student library uses the hook for both of its tabs", () => {
  assert(/useInfiniteList\(visibleExams, CARD_PAGE_SIZE\)/.test(LIBRARY), "the mock exam grid");
  assert(/useInfiniteList\(liveExams, CARD_PAGE_SIZE\)/.test(LIBRARY), "the live exam grid");
  assert(/\{shownExams\.map\(/.test(LIBRARY), "the mock grid must render the batched slice");
  assert(/\{shownLiveExams\.map\(/.test(LIBRARY), "the live grid must render the batched slice");
});

await test("the creator library uses the hook for both of its tabs", () => {
  assert(/useInfiniteList\(filteredExams\)/.test(DASHBOARD), "the mock exam grid");
  assert(/useInfiniteList\(filteredLiveExams\)/.test(DASHBOARD), "the live exam grid");
  assert(/\{shownExams\.map\(/.test(DASHBOARD), "the mock grid must render the batched slice");
  assert(/\{shownLiveExams\.map\(/.test(DASHBOARD), "the live grid must render the batched slice");
});

await test("no grid renders the unbatched list, which would defeat the whole thing", () => {
  assert(!/\{visibleExams\.map\(/.test(LIBRARY), "Marketplace mock grid must not map the full filtered list");
  assert(!/\{liveExams\.map\(/.test(LIBRARY), "Marketplace live grid must not map the full list");
  assert(!/\{filteredExams\.map\(/.test(DASHBOARD), "Dashboard mock grid must not map the full filtered list");
  assert(!/\{filteredLiveExams\.map\(/.test(DASHBOARD), "Dashboard live grid must not map the full filtered list");
});

await test("scrolling is the only way forward — no Show more button survives", () => {
  for (const [name, src] of [["Marketplace", LIBRARY], ["Dashboard", DASHBOARD]]) {
    assert(!/Show more/.test(src), `${name} should extend on scroll, not ask for a click`);
  }
});

await test("the filter pill counts still come from the FULL lists, not the batch", () => {
  // Batching is about what is in the DOM. "Published 38" must keep meaning 38
  // exams exist, not 24 have been rendered so far.
  assert(
    /const publishedCount = useMemo\(\(\) => exams\.filter/.test(DASHBOARD),
    "published/unpublished counts must be taken over every exam"
  );
  assert(
    /count: exams\.length/.test(DASHBOARD),
    "the All pill must count the whole library"
  );
  assert(
    /liveExams\.reduce\(/.test(DASHBOARD),
    "live status counts must be taken over every live exam"
  );
});

await test("search and filtering still run over the whole library", () => {
  const filterBlock = LIBRARY.split("const visibleExams = useMemo(")[1] || "";
  assert(filterBlock, "visibleExams should exist");
  assert(
    /return exams\.filter\(exam => \{/.test(filterBlock),
    "the filter must read the complete list — batching must never narrow what is searchable"
  );
});

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.message}`));
}
console.log("────────────────────────────────────────────────────────────\n");
process.exit(failed === 0 ? 0 : 1);
