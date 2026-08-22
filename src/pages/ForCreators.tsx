import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  Lock,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import CreatorJourney from "@/components/creators/CreatorJourney";
import { type CreatorPageCopy } from "@/i18n/creatorCopy";
import { CREATOR_COPY_EN } from "@/i18n/creatorCopy.en";

/**
 * The creator landing page, once, for both languages.
 *
 * ENGLISH (/for-creators) and HINDI (/hindi/for-creators) are two indexable
 * URLs over ONE component: only the copy table and the SEO block differ. There
 * is deliberately no language switcher — the Hindi page exists to win Hindi
 * queries from Hindi-medium coaching owners, and the bidirectional hreflang
 * alternates below let Google serve the right one.
 */

import { CREATOR_ALTERNATES, CREATOR_PATHS, CREATOR_SEO_BY_LANG, type CreatorLang } from "@/i18n/pageSeo";

/* ═══════════════════════════════════════════════
   SECTION: Animated observe-on-scroll wrapper
   ═══════════════════════════════════════════════ */
const Reveal = ({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   DATA — icons and colours only; the words come
   from the language table (i18n/creatorCopy.ts).
   ═══════════════════════════════════════════════ */

const PAIN_ICONS = [Clock, BarChart3, Target];
const TRUST_ICONS = [Lock, Users, Zap];
const TRUST_COLORS = ["#6C3EF4", "#10B981", "#F59E0B"];

/** Which comparison rows a PDF can also do — indexes into copy.comparisonRows. */
const PDF_CAPABLE_ROWS = new Set([7, 8]);

/* ═══════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════ */

/**
 * `copy` defaults to English and is injected by the Hindi wrapper, so the
 * Hindi strings live in that route's own chunk rather than in this one.
 */
const ForCreators = ({
  lang = "en",
  copy = CREATOR_COPY_EN,
}: {
  lang?: CreatorLang;
  copy?: CreatorPageCopy;
}) => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const seo = CREATOR_SEO_BY_LANG[lang];
  // Cross-language links stay inside their own language where a translated
  // page exists: the Hindi page's "student experience" goes to /hindi.
  const studentHome = lang === "hi" ? "/hindi" : "/";

  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={seo.title}
        description={seo.description}
        path={CREATOR_PATHS[lang]}
        keywords={seo.keywords}
        lang={seo.lang}
        alternates={CREATOR_ALTERNATES}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "@id": `https://mocksetu.in${CREATOR_PATHS[lang]}#webpage`,
            "name": seo.title,
            "url": `https://mocksetu.in${CREATOR_PATHS[lang]}`,
            "description": seo.description,
            "inLanguage": seo.lang,
            "audience": { "@type": "EducationalAudience", "audienceType": "Educator" },
            "isPartOf": { "@id": "https://mocksetu.in/#website" },
            "about": { "@id": "https://mocksetu.in/#organization" }
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": seo.breadcrumbHome, "item": `https://mocksetu.in${studentHome}` },
              { "@type": "ListItem", "position": 2, "name": seo.breadcrumbSelf, "item": `https://mocksetu.in${CREATOR_PATHS[lang]}` }
            ]
          }
        ]}
      />
      <Navbar navButtonLabel={copy.navLabel} navButtonLink={studentHome} />

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#07091A] pt-28 pb-24 px-5">
        {/* Background */}
        <div className="absolute inset-0">
          <div className="absolute top-[-30%] left-[20%] w-[700px] h-[500px] rounded-full bg-[#10B981] opacity-[0.07] blur-[120px]" />
          <div className="absolute top-[10%] right-[10%] w-[500px] h-[500px] rounded-full bg-[#6C3EF4] opacity-[0.09] blur-[100px] animate-pulse-glow" />
          <div className="absolute bottom-[-20%] left-[40%] w-[400px] h-[300px] rounded-full bg-[#3B82F6] opacity-[0.06] blur-[100px]" />
        </div>

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.1]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.45) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 70% at 50% 40%, black 30%, transparent 100%)",
          }}
        />

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="relative z-10 container mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2 text-[12px] font-bold tracking-widest uppercase mb-8 px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
            style={{ transitionDelay: "100ms" }}
          >
            <Sparkles className="h-3.5 w-3.5" /> {copy.heroBadge}
          </div>

          {/* Headline */}
          <h1
            className={`transition-all duration-800 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            style={{ transitionDelay: "200ms" }}
          >
            <span className="block text-[32px] sm:text-[44px] md:text-[60px] lg:text-[76px] font-black text-white leading-[1.05] tracking-[-0.04em]">
              {copy.heroTitleA}
            </span>
            <span className="block text-[32px] sm:text-[44px] md:text-[60px] lg:text-[76px] font-black leading-[1.05] tracking-[-0.04em] mt-1">
              <span
                style={{
                  background: "linear-gradient(135deg, #34D399 0%, #10B981 40%, #059669 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {copy.heroTitleB}
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mt-7 text-[17px] sm:text-[19px] text-white/45 max-w-2xl mx-auto leading-[1.65] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "350ms" }}
          >
            {copy.heroSub}
            <span className="text-white/75 font-medium">{copy.heroSubStrong}</span>
            {copy.heroSubTail}
          </p>

          {/* CTAs */}
          <div
            className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "480ms" }}
          >
            <button
              onClick={() => navigate("/auth")}
              className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white overflow-hidden bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_8px_32px_rgba(16,185,129,0.35)] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_12px_40px_rgba(16,185,129,0.45)] transition-all duration-200 hover:-translate-y-0.5"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
              <span className="relative">{copy.ctaPrimary}</span>
              <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>

            <button
              onClick={() => {
                const el = document.getElementById("how-it-works");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm transition-all duration-200"
            >
              {copy.ctaSecondary}
            </button>
          </div>

          {/* Quick stats */}
          <div
            className={`mt-14 grid grid-cols-3 gap-8 sm:gap-16 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "600ms" }}
          >
            {copy.stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">{value}</div>
                <div className="mt-1 text-[12px] text-white/30 font-medium tracking-wide">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE PROBLEM
      ════════════════════════════════════════ */}
      <section className="py-16 sm:py-28 px-5 bg-secondary/40">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-16">
              <div className="section-label justify-center mb-4">
                <span className="w-6 h-px bg-red-400/40" />
                <span className="text-red-500/80">{copy.problemLabel}</span>
                <span className="w-6 h-px bg-red-400/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                {copy.problemTitle}
              </h2>
              <p className="mt-4 text-[16px] text-muted-foreground max-w-lg mx-auto">{copy.problemSub}</p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {copy.painPoints.map((p, i) => {
              const Icon = PAIN_ICONS[i];
              return (
                <Reveal key={i} delay={i * 100}>
                  <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.02] p-6 h-full">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/15 flex items-center justify-center mb-5">
                      <Icon className="h-5 w-5 text-red-500/70" />
                    </div>
                    <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">{p.title}</h3>
                    <p className="text-[13.5px] text-muted-foreground leading-[1.7]">{p.desc}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE SOLUTION — before/after comparison
      ════════════════════════════════════════ */}
      <section className="py-16 sm:py-28 px-5">
        <div className="container mx-auto max-w-4xl">
          <Reveal>
            <div className="text-center mb-14">
              <div className="section-label justify-center mb-4">
                <span className="w-6 h-px bg-primary/40" />
                {copy.comparisonLabel}
                <span className="w-6 h-px bg-primary/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                {copy.comparisonTitleA}
                <span
                  style={{
                    background: "linear-gradient(135deg, #10B981, #34D399)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {copy.comparisonTitleAccent}
                </span>
                {copy.comparisonTitleB}
              </h2>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_140px_140px] bg-secondary/60 border-b border-border/40">
                <div className="px-5 py-3.5 text-[12px] font-bold tracking-widest text-muted-foreground/50 uppercase">{copy.comparisonFeature}</div>
                <div className="px-4 py-3.5 text-[12px] font-bold tracking-widest text-muted-foreground/50 uppercase text-center">{copy.comparisonPdf}</div>
                <div className="px-4 py-3.5 text-[12px] font-bold tracking-widest uppercase text-center" style={{ color: "#10B981" }}>MockSetu</div>
              </div>

              {/* Rows */}
              {copy.comparisonRows.map((feature, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_140px_140px] ${i < copy.comparisonRows.length - 1 ? "border-b border-border/30" : ""} hover:bg-secondary/30 transition-colors`}
                >
                  <div className="px-3 sm:px-5 py-3 sm:py-3.5 text-[12px] sm:text-[13.5px] text-foreground/80">{feature}</div>
                  <div className="px-4 py-3.5 flex items-center justify-center">
                    {PDF_CAPABLE_ROWS.has(i) ? (
                      <CheckCircle className="h-4 w-4 text-muted-foreground/40" />
                    ) : (
                      <span className="w-4 h-0.5 rounded bg-muted-foreground/20" />
                    )}
                  </div>
                  <div className="px-4 py-3.5 flex items-center justify-center">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE JOURNEY — six acts, one paper
          (replaces the old features bento + steps list)
      ════════════════════════════════════════ */}
      <div id="how-it-works" className="scroll-mt-16 bg-secondary/40">
        <CreatorJourney copy={copy.journey} />
      </div>


      {/* ════════════════════════════════════════
          TRUST SIGNALS
      ════════════════════════════════════════ */}
      <section className="py-20 px-5 bg-secondary/40">
        <div className="container mx-auto max-w-4xl">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-6">
              {copy.trust.map(({ title, desc }, i) => {
                const Icon = TRUST_ICONS[i];
                const color = TRUST_COLORS[i];
                return (
                  <Reveal key={i} delay={i * 100}>
                    <div className="flex gap-4 items-start">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${color}12`, border: `1px solid ${color}20` }}
                      >
                        <Icon className="h-5 w-5" style={{ color }} />
                      </div>
                      <div>
                        <h3 className="text-[14px] font-bold text-foreground mb-1">{title}</h3>
                        <p className="text-[13px] text-muted-foreground leading-[1.65]">{desc}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════ */}
      <section className="py-28 px-5">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-[#07091A] text-white">
              {/* Glows */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-emerald-500 opacity-[0.12] blur-[100px]" />
                <div className="absolute bottom-[-30%] right-[-10%] w-[400px] h-[300px] rounded-full bg-[#6C3EF4] opacity-[0.08] blur-[80px]" />
              </div>

              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)`,
                  backgroundSize: "28px 28px",
                }}
              />

              <div className="absolute inset-0 rounded-3xl border border-white/[0.08]" />

              <div className="relative z-10 flex flex-col items-center text-center px-5 sm:px-8 py-14 sm:py-20">
                <h2 className="text-[28px] sm:text-[36px] md:text-[52px] lg:text-[60px] font-black tracking-[-0.04em] leading-[1.05] mb-5">
                  {copy.finalTitleA}
                  <span
                    style={{
                      background: "linear-gradient(135deg, #34D399, #10B981, #059669)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {copy.finalTitleAccent}
                  </span>
                </h2>
                <p className="text-[16px] text-white/45 max-w-md leading-relaxed mb-10">{copy.finalSub}</p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => navigate("/auth")}
                    className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white overflow-hidden bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_8px_40px_rgba(16,185,129,0.35)] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_16px_48px_rgba(16,185,129,0.5)] transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <span className="relative">{copy.finalCta}</span>
                    <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <Link
                    to={studentHome}
                    className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-200"
                  >
                    <BookOpen className="h-4 w-4" />
                    {copy.finalSecondary}
                  </Link>
                </div>

                <p className="mt-6 text-[12px] text-white/20 font-medium">{copy.finalFinePrint}</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ForCreators;
