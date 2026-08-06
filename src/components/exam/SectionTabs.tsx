/**
 * SectionTabs.tsx — the student's way around a paper that allows section
 * switching. Only ever rendered when the exam has `allow_section_switching`
 * on; a locked paper has exactly one reachable section and no tabs to draw.
 *
 * Each tab carries the one number that decides whether a candidate wants to go
 * back to a section: how many of its questions they have answered. A section
 * with everything answered gets a tick, a section holding a marked-for-review
 * question gets a flag dot — both so the last two minutes of the paper can be
 * spent on the right section without opening each one to look.
 *
 * The strip scrolls sideways rather than wrapping, because a wrapping tab bar
 * would change the header's height mid-paper. A raw scrollbar under the tabs
 * reads as a defect, so the bar is hidden and the overflowing side is faded
 * instead — a tab cut in half then looks like there is more to reach, not like
 * a broken layout. Switching section from the palette sheet also pulls that
 * tab into view, so the strip never disagrees with the question on screen.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Flag } from "lucide-react";
import { sectionProgress } from "@/lib/examNavigation.js";

type SectionLike = { id: string; name: string };

type Props = {
  sections: SectionLike[];
  activeSectionId: string | null;
  questionsBySection: Record<string, { id: string }[]>;
  questionStates: Record<string, { selectedAnswer?: any; isMarkedForReview?: boolean }>;
  onSelect: (sectionId: string) => void;
  /** "strip" = the sticky bar under the header; "stacked" = inside the mobile sheet. */
  variant?: "strip" | "stacked";
};

export default function SectionTabs({
  sections,
  activeSectionId,
  questionsBySection,
  questionStates,
  onSelect,
  variant = "strip",
}: Props) {
  const stacked = variant === "stacked";
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  /** Which side still has tabs off-screen — drives the fades. */
  const [overflow, setOverflow] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (stacked || !el) return;

    const sync = () => {
      const slack = el.scrollWidth - el.clientWidth;
      setOverflow({ left: el.scrollLeft > 4, right: el.scrollLeft < slack - 4 });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", sync);
    };
  }, [stacked, sections.length]);

  useEffect(() => {
    if (stacked) return;
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSectionId, stacked]);

  if (sections.length < 2) return null;

  const tabs = sections.map((s, index) => {
    const questions = questionsBySection[s.id] || [];
    const { answered, marked, total } = sectionProgress(questions, questionStates);
    const isActive = s.id === activeSectionId;
    const isComplete = total > 0 && answered === total;

    /** Badge, count and flag are tinted the same three ways in both variants. */
    const badgeTone = isActive
      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
      : isComplete
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground group-hover:bg-foreground/10";
    const countTone = isComplete
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : isActive
        ? "bg-primary/10 text-primary"
        : "bg-foreground/[0.06] text-muted-foreground";

    const badge = (
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums transition-colors ${badgeTone}`}
      >
        {isComplete && !isActive ? <Check className="h-3 w-3" /> : index + 1}
      </span>
    );

    const count = (
      <span
        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums transition-colors ${countTone}`}
      >
        {answered}/{total}
      </span>
    );

    const flag = marked > 0 && (
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-500/10 px-1 py-px text-[10px] font-bold tabular-nums text-red-600 dark:text-red-400"
        aria-label={`${marked} marked for review`}
        title={`${marked} marked for review`}
      >
        <Flag className="h-2.5 w-2.5" />
        {marked > 1 && marked}
      </span>
    );

    const common = {
      role: "tab",
      "aria-selected": isActive,
      "aria-label": `${s.name}, ${answered} of ${total} answered`,
      onClick: () => onSelect(s.id),
    } as const;

    if (stacked) {
      return (
        <button
          key={s.id}
          {...common}
          className={`group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
            isActive
              ? "border-primary/40 bg-primary/[0.06] shadow-sm"
              : "border-border/70 bg-card hover:border-border hover:bg-muted/50"
          }`}
        >
          {badge}
          <span className="min-w-0 flex-1 space-y-1.5">
            <span
              className={`block truncate text-[13px] ${
                isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
              }`}
            >
              {s.name}
            </span>
            {/* Sheet rows have the width for a progress rail the strip can't spare. */}
            <span className="block h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
              <span
                className={`block h-full rounded-full transition-all ${
                  isComplete ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: total > 0 ? `${(answered / total) * 100}%` : "0%" }}
              />
            </span>
          </span>
          {flag}
          {count}
        </button>
      );
    }

    return (
      <button
        key={s.id}
        {...common}
        ref={isActive ? activeTabRef : undefined}
        className={`group relative flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
          isActive ? "bg-primary/[0.06]" : "hover:bg-muted/60"
        }`}
      >
        {badge}
        <span
          className={`max-w-[9rem] truncate text-[13px] xl:max-w-[12rem] ${
            isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
          }`}
        >
          {s.name}
        </span>
        {count}
        {flag}
        {/* Drawn rather than bordered so it can sit flush with the strip's
            bottom edge with rounded ends and no effect on the tab's height. */}
        <span
          aria-hidden
          className={`absolute inset-x-1.5 bottom-0 h-[2px] rounded-full transition-colors ${
            isActive ? "bg-primary" : "bg-transparent group-hover:bg-border"
          }`}
        />
      </button>
    );
  });

  if (stacked) {
    return (
      <div role="tablist" aria-label="Exam sections" className="flex flex-col gap-1.5">
        {tabs}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="Exam sections"
        className="no-scrollbar flex items-stretch gap-0.5 overflow-x-auto px-2 sm:px-3"
      >
        {tabs}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent transition-opacity ${
          overflow.left ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent transition-opacity ${
          overflow.right ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
