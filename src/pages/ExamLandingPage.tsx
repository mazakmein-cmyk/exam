import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle, ChevronDown, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { EXAM_LANDING_PAGES, ExamLanding } from "@/data/examLandingPages";

const buildJsonLd = (exam: ExamLanding) => {
  const url = `https://mocksetu.in/mock-test/${exam.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Course",
      name: `${exam.examName} Mock Test Series — MockSetu`,
      description: exam.metaDescription,
      provider: {
        "@type": "Organization",
        name: "MockSetu",
        "@id": "https://mocksetu.in/#organization",
        sameAs: "https://mocksetu.in/",
      },
      url,
      educationalLevel: "Higher Education",
      inLanguage: "en-IN",
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "Online",
        courseWorkload: "PT3H",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        category: "Free",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: exam.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://mocksetu.in/" },
        { "@type": "ListItem", position: 2, name: "Mock Tests", item: "https://mocksetu.in/marketplace" },
        { "@type": "ListItem", position: 3, name: `${exam.examName} Mock Test`, item: url },
      ],
    },
  ];
};

const FaqItem = ({ q, a, idx }: { q: string; a: string; idx: number }) => {
  const [open, setOpen] = useState(idx === 0);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="text-[15px] sm:text-[16px] font-semibold text-foreground tracking-tight pr-4">
          {q}
        </span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="pb-5 text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">
          {a}
        </div>
      )}
    </div>
  );
};

const ExamLandingPage = () => {
  const { examSlug } = useParams<{ examSlug: string }>();
  const navigate = useNavigate();
  const exam = examSlug ? EXAM_LANDING_PAGES[examSlug] : undefined;

  if (!exam) {
    return <Navigate to="/marketplace" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={exam.metaTitle}
        description={exam.metaDescription}
        path={`/mock-test/${exam.slug}`}
        keywords={exam.keywords}
        jsonLd={buildJsonLd(exam)}
      />
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#07091A] pt-28 pb-20 px-5">
        <div className="absolute inset-0">
          <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[#6C3EF4] opacity-[0.13] blur-[120px]" />
          <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-[#A855F7] opacity-[0.08] blur-[100px]" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          }}
        />

        <div className="relative z-10 container mx-auto max-w-4xl text-center">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center justify-center gap-2 text-[12px] text-white/40">
            <Link to="/" className="hover:text-white/80 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/marketplace" className="hover:text-white/80 transition-colors">Mock Tests</Link>
            <span>/</span>
            <span className="text-white/60">{exam.examName}</span>
          </nav>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-2 mb-8">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[12px] font-semibold text-white/70 tracking-wide">{exam.hero.badge}</span>
          </div>

          <h1 className="text-[34px] sm:text-[48px] md:text-[60px] font-black text-white leading-[1.05] tracking-[-0.035em] mb-6">
            {exam.hero.h1}
          </h1>

          <p className="text-[16px] sm:text-[18px] text-white/55 max-w-2xl mx-auto leading-[1.7] mb-10">
            {exam.hero.intro}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <button
              onClick={() => navigate("/student-auth")}
              className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_8px_32px_rgba(108,62,244,0.4)] transition-all duration-200 hover:-translate-y-0.5"
            >
              Start Free {exam.examShort} Mock
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm transition-all duration-200"
            >
              <BookOpen className="h-4 w-4" />
              Browse All Mocks
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6 sm:gap-12 max-w-xl mx-auto pt-6 border-t border-white/[0.08]">
            {exam.hero.stats.map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">{value}</div>
                <div className="mt-1 text-[12px] text-white/40 font-medium tracking-wide uppercase">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Exam Pattern ── */}
      <section className="py-16 sm:py-24 px-5 bg-background">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-[26px] sm:text-[34px] font-black text-foreground tracking-[-0.025em] mb-8 text-center">
            {exam.pattern.heading}
          </h2>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[14px]">
              <tbody>
                {exam.pattern.rows.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 0 ? "bg-secondary/30" : ""}>
                    <td className="px-5 py-3.5 font-semibold text-foreground/80 align-top w-[42%] border-b border-border/40">
                      {row.label}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground border-b border-border/40">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Content sections ── */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20">
        <div className="container mx-auto max-w-3xl space-y-14">
          {exam.sections.map((section) => (
            <article key={section.heading}>
              <h2 className="text-[24px] sm:text-[30px] font-black text-foreground tracking-[-0.025em] mb-5">
                {section.heading}
              </h2>
              <p className="text-[15px] sm:text-[16px] text-muted-foreground leading-[1.85]">
                {section.body}
              </p>
              {section.bullets && (
                <ul className="mt-5 space-y-2.5">
                  {section.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-1" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ── Syllabus ── */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-[26px] sm:text-[34px] font-black text-foreground tracking-[-0.025em] mb-3 text-center">
            {exam.examName} Syllabus 2026
          </h2>
          <p className="text-center text-[15px] text-muted-foreground mb-10 max-w-xl mx-auto">
            Every MockSetu {exam.examShort} mock test maps to the latest official syllabus below.
          </p>
          <div className="grid sm:grid-cols-2 gap-5">
            {exam.syllabus.map((s) => (
              <div key={s.subject} className="rounded-2xl border border-border/60 bg-card p-6">
                <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-3">{s.subject}</h3>
                <ul className="space-y-2">
                  {s.topics.map((t) => (
                    <li key={t} className="text-[13px] text-muted-foreground leading-[1.65] flex gap-2.5">
                      <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why MockSetu ── */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-[26px] sm:text-[34px] font-black text-foreground tracking-[-0.025em] mb-3 text-center">
            Why Use MockSetu for {exam.examShort}?
          </h2>
          <p className="text-center text-[15px] text-muted-foreground mb-10 max-w-xl mx-auto">
            Built specifically to mirror the real {exam.examName} exam interface — no generic templates.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {exam.whyMockSetu.map((w) => (
              <div key={w.title} className="rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/30 transition-colors">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 mb-4">
                  <CheckCircle className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">{w.title}</h3>
                <p className="text-[13.5px] text-muted-foreground leading-[1.7]">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQs ── */}
      <section className="py-16 sm:py-24 px-5">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-[26px] sm:text-[34px] font-black text-foreground tracking-[-0.025em] mb-3 text-center">
            {exam.examShort} Mock Test — FAQs
          </h2>
          <p className="text-center text-[15px] text-muted-foreground mb-10">
            Everything serious {exam.examShort} aspirants ask before starting practice.
          </p>
          <div className="rounded-2xl border border-border/60 bg-card px-6 sm:px-8">
            {exam.faqs.map((f, i) => (
              <FaqItem key={f.question} q={f.question} a={f.answer} idx={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Related exams cross-link ── */}
      <section className="py-16 px-5 bg-secondary/20">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-[22px] sm:text-[28px] font-black text-foreground tracking-[-0.025em] mb-8 text-center">
            More Free Mock Tests
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {exam.related.map((r) => (
              <Link
                key={r.slug}
                to={`/mock-test/${r.slug}`}
                className="group rounded-xl border border-border/60 bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-foreground tracking-tight">{r.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <span className="block mt-1 text-[12px] text-muted-foreground">Free · Unlimited attempts</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 px-5 bg-[#07091A] text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#6C3EF4] opacity-[0.15] blur-[100px]" />
        <div className="relative z-10 container mx-auto max-w-2xl">
          <h2 className="text-[28px] sm:text-[36px] font-black text-white tracking-[-0.03em] leading-[1.1] mb-5">
            Start your free {exam.examShort} mock test now
          </h2>
          <p className="text-[15px] text-white/55 mb-8 leading-[1.7]">
            Unlimited attempts. Real exam-day conditions. Deep analytics. 100% free, forever.
          </p>
          <button
            onClick={() => navigate("/student-auth")}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_8px_32px_rgba(108,62,244,0.4)] transition-all duration-200 hover:-translate-y-0.5"
          >
            Sign Up Free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ExamLandingPage;
