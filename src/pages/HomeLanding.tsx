import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import StudentHero from "@/components/home/StudentHero";
import CycleCluster from "@/components/home/CycleCluster";
import PapersCluster from "@/components/home/PapersCluster";
import CbtPreview from "@/components/home/CbtPreview";
import UpdatesCluster from "@/components/home/UpdatesCluster";
import {
  PUBLISHED_EXAMS_QUERY_KEY,
  fetchPublishedExams,
  type PublishedExam,
} from "@/lib/publishedExams";
import {
  EXAM_PARAM,
  matchCategoryBySlug,
  rankHomeCategories,
  readPreferredExam,
  rememberPreferredExam,
  slugifyCategory,
} from "@/lib/homeExamContext";
import { rememberLastExam } from "@/lib/lastExamMemo";
import { PAPER_TYPE_MOCK, readPaperType } from "@/lib/paperType.js";
import { type HomeCopy } from "@/i18n/homeCopy";

/**
 * HomeLanding — the student home page, once, for both languages.
 *
 * The home page is a STUDENT page — a doing page, not a brochure. Its DOM
 * order is the information architecture:
 *
 *   1. Hero        — find your exam, one saturated CTA (StudentHero)
 *   2. Cycle       — countdown + resume, the two open loops (CycleCluster)
 *   3. Papers      — previous-year rail for the chosen exam (PapersCluster)
 *   4. CBT demo    — the real exam screen, touchable inline (CbtPreview)
 *   5. Updates     — three tag-matched guides (UpdatesCluster)
 *
 * Four content clusters, no more (Miller's law). Everything below the hero
 * re-filters in place when the exam context changes — the context lives in
 * ?exam= (shareable) and localStorage (sticky), and the data is the same
 * cached list the marketplace uses, so a chip tap costs zero network. With
 * no context chosen the page stays generic: every exam's papers and guides.
 *
 * ENGLISH (/) and HINDI (/hindi) are two indexable URLs over ONE component:
 * only the copy table and the SEO block differ, so the pages can never drift
 * behaviourally. There is deliberately NO language switcher — the Hindi page
 * exists to win Hindi queries ("फ्री मॉक टेस्ट", "पिछले वर्ष के प्रश्न पत्र"),
 * and search engines pair the two through the bidirectional hreflang
 * alternates declared below. Google decides which one a reader sees.
 *
 * The body is all student; the creator platform's one home-page entry point
 * is the footer's Educators column, which routes to /for-creators.
 */

import { HOME_ALTERNATES, HOME_PATHS, HOME_SEO_BY_LANG, type HomeLang } from "@/i18n/pageSeo";

/**
 * Page-level structured data.
 *
 * Deliberately does NOT re-declare the site-wide WebSite node: index.html
 * already ships it (with both languages in inLanguage), and emitting a second
 * node under the same @id with different properties leaves the two URLs
 * describing the same entity in conflicting terms. This adds only what is
 * genuinely page-specific, tied back to the site node by isPartOf. The
 * WebPage node with the right inLanguage comes from SEO.tsx.
 */
const buildJsonLd = (lang: HomeLang) => {
  const seo = HOME_SEO_BY_LANG[lang];
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `https://mocksetu.in${HOME_PATHS[lang]}#collection`,
      name: seo.title,
      description: seo.description,
      inLanguage: seo.lang,
      url: `https://mocksetu.in${HOME_PATHS[lang]}`,
      isPartOf: { "@id": "https://mocksetu.in/#website" },
    },
  ];
};

/**
 * `copy` is INJECTED by the two page wrappers rather than looked up here, so
 * each language's table is only imported by the page that renders it. That
 * keeps the Hindi strings (including its CBT demo questions) out of the eager
 * main chunk that every English visitor downloads — the same discipline that
 * keeps sonner and katex off the shared critical path.
 */
const HomeLanding = ({ lang, copy }: { lang: HomeLang; copy: HomeCopy }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const seo = HOME_SEO_BY_LANG[lang];

  // Same cache entry the marketplace reads — see publishedExams.ts.
  const { data: exams = [], isPending: loading } = useQuery({
    queryKey: PUBLISHED_EXAMS_QUERY_KEY,
    queryFn: fetchPublishedExams,
  });

  const categories = useMemo(() => rankHomeCategories(exams), [exams]);

  // The context slug the visitor asked for: URL first (shareable links win),
  // then the sticky preference from a previous visit. Read once — after that,
  // chip taps drive the URL and the URL drives the page.
  const [storedPreference] = useState(() => readPreferredExam());
  const requestedSlug =
    searchParams.get(EXAM_PARAM) ?? (storedPreference ? slugifyCategory(storedPreference) : null);

  // Snap the slug onto a real category. No slug (or an unknown one) means NO
  // context: the page opens generic — every exam's papers, every guide —
  // until the visitor states a preference. MockSetu serves many exams; the
  // home page must never look like it serves one.
  const selectedCategory = useMemo(() => {
    if (!requestedSlug || categories.length === 0) return null;
    return matchCategoryBySlug(requestedSlug, categories);
  }, [categories, requestedSlug]);

  // Tapping the active chip deselects it — back to the generic view.
  const handleSelectCategory = useCallback(
    (category: string) => {
      const next = category === selectedCategory ? null : category;
      rememberPreferredExam(next);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(EXAM_PARAM, slugifyCategory(next));
          else params.delete(EXAM_PARAM);
          return params;
        },
        { replace: true }
      );
    },
    [selectedCategory, setSearchParams]
  );

  // The hero button's pre-resolved target: the newest MOCK in the chosen
  // category (a first tap should land in a practice paper, not burn a
  // previous-year attempt), falling back to the newest paper of any type.
  const primaryExam = useMemo<PublishedExam | null>(() => {
    const inCategory = selectedCategory
      ? exams.filter((e) => e.exam_category === selectedCategory)
      : exams;
    return (
      inCategory.find((e) => readPaperType(e) === PAPER_TYPE_MOCK) ?? inCategory[0] ?? null
    );
  }, [exams, selectedCategory]);

  // The fixed thumb-zone CTA is a RELAY, not a twin: it slides in only once
  // the hero (which carries the same button) has scrolled away, so the screen
  // never shows the action twice — and the arrival itself nudges the eye.
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroGone, setHeroGone] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroGone(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const startPrimary = () => {
    if (primaryExam) {
      rememberLastExam({
        id: primaryExam.id,
        name: primaryExam.name,
        category: primaryExam.exam_category,
      });
      navigate(`/exam/${primaryExam.id}/intro?from=home`);
    } else {
      navigate("/marketplace");
    }
  };

  return (
    // Bottom padding on mobile keeps the fixed thumb-zone CTA from covering
    // the footer's last rows.
    <div className="min-h-screen pb-20 md:pb-0">
      <SEO
        title={seo.title}
        description={seo.description}
        path={HOME_PATHS[lang]}
        keywords={seo.keywords}
        lang={seo.lang}
        alternates={HOME_ALTERNATES}
        jsonLd={buildJsonLd(lang)}
      />
      <Navbar />

      <div ref={heroRef}>
        <StudentHero
          exams={exams}
          loading={loading}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          primaryExam={primaryExam}
          copy={copy.hero}
        />
      </div>

      <main>
        <CycleCluster selectedCategory={selectedCategory} copy={copy.cycle} />
        <PapersCluster exams={exams} selectedCategory={selectedCategory} copy={copy.papers} />
        <CbtPreview primaryExam={primaryExam} copy={copy.cbt} />
        <UpdatesCluster selectedCategory={selectedCategory} copy={copy.updates} />
      </main>

      {/* Full footer, Educators column included — the creator funnel's home
          entry point lives here, below every student cluster. */}
      <Footer />

      {/* Mobile thumb-zone CTA (Fitts's law): the one action this page exists
          for, parked where the thumb already rests. Slides in only after the
          hero's copy of the button has scrolled away — see heroGone above. */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-background/90 backdrop-blur-xl border-t border-border/60 transition-transform duration-300 ease-out ${
          heroGone ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!heroGone}
      >
        <button
          onClick={startPrimary}
          className="w-full h-14 rounded-2xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white shadow-lg shadow-[#6C3EF4]/30 flex flex-col items-center justify-center transition-colors"
        >
          <span className="inline-flex items-center gap-2 text-[15.5px] font-extrabold tracking-tight">
            <Play className="h-4 w-4 fill-current" /> {copy.hero.ctaTitle}
          </span>
          <span className="text-[11px] font-medium text-white/70 truncate max-w-[85vw]">
            {primaryExam
              ? primaryExam.name
              : selectedCategory
                ? copy.hero.browseCategory(selectedCategory)
                : copy.hero.browseLibrary}
          </span>
        </button>
      </div>
    </div>
  );
};

export default HomeLanding;
