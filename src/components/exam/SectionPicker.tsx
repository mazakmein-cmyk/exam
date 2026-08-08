/**
 * SectionPicker.tsx — the section switcher for a paper with more sections than
 * a tab strip can honestly carry.
 *
 * Why this exists
 * ---------------
 * The strip works beautifully up to about five sections. Past that it fails in
 * a way that is worse than ugly: names truncate to "English Language and Comp…",
 * the strip scrolls sideways with the scrollbar hidden, and the tab you want is
 * off-screen behind a fade. A candidate with twelve sections and four minutes
 * left is then *hunting* — scrubbing a strip to find a section by a name they
 * can only half read. Horizontal scroll is a discovery mechanism, not a
 * navigation one.
 *
 * So above the threshold the strip is replaced by one trigger that always fits
 * — "3/12 · Reasoning Ability…" — opening the full list, every name in full,
 * every progress bar visible, searchable once the list is long enough to need
 * it. One control, fixed width, identical at 6 sections and at 60.
 *
 * The list inside is the same `stacked` row that the mobile palette sheet
 * already uses, rather than a second design for the same information: a student
 * who has met one has met both.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SectionTabs from "@/components/exam/SectionTabs";
import { sectionProgress } from "@/lib/examNavigation.js";

/** Below this many sections, scanning beats typing and the box is just noise. */
const SEARCH_THRESHOLD = 8;

type SectionLike = { id: string; name: string };

type Props = {
  sections: SectionLike[];
  activeSectionId: string | null;
  questionsBySection: Record<string, { id: string }[]>;
  questionStates: Record<string, { selectedAnswer?: any; isMarkedForReview?: boolean }>;
  onSelect: (sectionId: string) => void;
  /** Width control from the caller — the trigger never grows past what it gets. */
  className?: string;
};

export default function SectionPicker({
  sections,
  activeSectionId,
  questionsBySection,
  questionStates,
  onSelect,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = sections.findIndex((s) => s.id === activeSectionId);
  const active = activeIndex >= 0 ? sections[activeIndex] : null;
  const activeProgress = active
    ? sectionProgress(questionsBySection[active.id] || [], questionStates)
    : null;

  const paper = useMemo(
    () =>
      sections.reduce(
        (acc, s) => {
          const { answered, total } = sectionProgress(
            questionsBySection[s.id] || [],
            questionStates
          );
          return { answered: acc.answered + answered, total: acc.total + total };
        },
        { answered: 0, total: 0 }
      ),
    [sections, questionsBySection, questionStates]
  );

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) return sections;
    // Number as well as name: "7" is how a candidate refers to section 7.
    return sections.filter(
      (s, i) => s.name.toLowerCase().includes(trimmed) || String(i + 1) === trimmed
    );
  }, [sections, trimmed]);

  // Open on the section you are in, not on section 1 — with twelve of them the
  // list would otherwise open somewhere you are not.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (sections.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch section. Currently section ${activeIndex + 1} of ${
            sections.length
          }${active ? `, ${active.name}` : ""}`}
          className={`group inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-2 text-left outline-none transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
        >
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-primary px-1.5 text-[10px] font-bold tabular-nums text-primary-foreground">
            <ArrowLeftRight className="h-2.5 w-2.5" />
            {activeIndex + 1}/{sections.length}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {active?.name ?? "Choose a section"}
          </span>
          {activeProgress && activeProgress.total > 0 && (
            <span className="hidden shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-px text-[10px] font-bold tabular-nums text-muted-foreground sm:inline">
              {activeProgress.answered}/{activeProgress.total}
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(23rem,calc(100vw-1.5rem))] p-2"
      >
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Jump to section
          </p>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
            {paper.answered}/{paper.total} answered
          </span>
        </div>

        {sections.length >= SEARCH_THRESHOLD && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sections"
              aria-label="Search sections by name or number"
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-7 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Bounded by the viewport, so sixty sections scroll inside the sheet
            instead of running off the bottom of the screen. */}
        <div ref={listRef} className="max-h-[min(60vh,22rem)] overflow-y-auto pr-0.5">
          {filtered.length > 0 ? (
            <SectionTabs
              variant="stacked"
              sections={filtered}
              activeSectionId={activeSectionId}
              questionsBySection={questionsBySection}
              questionStates={questionStates}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          ) : (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No section matches “{query.trim()}”.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
