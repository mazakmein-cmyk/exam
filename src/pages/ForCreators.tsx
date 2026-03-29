import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  FileUp,
  Globe,
  Layers,
  Lock,
  Monitor,
  PenTool,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
   DATA
   ═══════════════════════════════════════════════ */

const PAIN_POINTS = [
  {
    icon: Clock,
    title: "Manual exam distribution is slow",
    desc: "You create great papers but end up sharing them as PDFs on WhatsApp groups. Students open them in random readers, lose track of time, and never get a real exam feel.",
  },
  {
    icon: BarChart3,
    title: "Zero visibility into student performance",
    desc: "Once a paper leaves your hands, you have no idea which questions students struggled with, how long they took, or where they need more coaching.",
  },
  {
    icon: Target,
    title: "No real exam simulation",
    desc: "A PDF is not an exam. There's no timer, no section navigation, no auto-submit — students practice casually instead of under real pressure.",
  },
];

const FEATURES = [
  {
    icon: Upload,
    title: "Upload Any PDF",
    desc: "Drop your question paper PDF and our AI extracts each question automatically. Or use the manual editor for full control.",
    accent: "#6C3EF4",
    bg: "from-violet-500/[0.07] to-transparent",
    border: "hover:border-violet-500/25",
    size: "lg",
  },
  {
    icon: PenTool,
    title: "Manual Fix Editor",
    desc: "AI parsing not perfect? The visual editor lets you adjust every question, option, and image in seconds.",
    accent: "#10B981",
    bg: "from-emerald-500/[0.07] to-transparent",
    border: "hover:border-emerald-500/25",
    size: "sm",
  },
  {
    icon: Layers,
    title: "Multi-Section Exams",
    desc: "Create JEE-style multi-section papers with per-section timers, question counts, and marking schemes.",
    accent: "#F59E0B",
    bg: "from-amber-500/[0.07] to-transparent",
    border: "hover:border-amber-500/25",
    size: "sm",
  },
  {
    icon: Monitor,
    title: "Real Exam Interface",
    desc: "Students see a full exam simulator — question palette, section navigation, mark-for-review, auto-submit — identical to JEE/NEET/CAT online format.",
    accent: "#3B82F6",
    bg: "from-blue-500/[0.07] to-transparent",
    border: "hover:border-blue-500/25",
    size: "sm",
  },
  {
    icon: TrendingUp,
    title: "Aggregated Analytics",
    desc: "See how your students perform — average scores, section-wise accuracy, completion rates, and time distribution. All anonymised.",
    accent: "#EC4899",
    bg: "from-pink-500/[0.07] to-transparent",
    border: "hover:border-pink-500/25",
    size: "lg",
  },
  {
    icon: Globe,
    title: "One-Click Publish",
    desc: "Publish to the Exam Library for all students, or share a private link with just your coaching class.",
    accent: "#06B6D4",
    bg: "from-cyan-500/[0.07] to-transparent",
    border: "hover:border-cyan-500/25",
    size: "sm",
  },
];

const STEPS = [
  {
    step: "01",
    icon: FileUp,
    title: "Upload Your Paper",
    desc: "Upload any exam PDF — JEE, NEET, CAT, GATE, or your own custom question paper. Our AI extracts questions, options, and images automatically.",
    color: "#6C3EF4",
  },
  {
    step: "02",
    icon: PenTool,
    title: "Review & Refine",
    desc: "Fine-tune parsed questions with the visual editor. Add answer keys, set marking schemes, configure sections and timers — exactly how the real exam works.",
    color: "#10B981",
  },
  {
    step: "03",
    icon: Sparkles,
    title: "Publish to Students",
    desc: "Publish to the Exam Library for all students, or generate a private link to share with your class. Students can start practising instantly.",
    color: "#F59E0B",
  },
  {
    step: "04",
    icon: BarChart3,
    title: "Track Performance",
    desc: "See aggregated analytics on how your students performed — topic-wise, section-wise, and over time. Identify weak areas across your entire class.",
    color: "#EC4899",
  },
];

const COMPARISON = [
  { feature: "Timed exam simulation", pdf: false, mock: true },
  { feature: "Section-wise navigation", pdf: false, mock: true },
  { feature: "Auto-submit on timeout", pdf: false, mock: true },
  { feature: "Instant answer key scoring", pdf: false, mock: true },
  { feature: "Student performance analytics", pdf: false, mock: true },
  { feature: "Question-level time tracking", pdf: false, mock: true },
  { feature: "Mark-for-review / Question palette", pdf: false, mock: true },
  { feature: "Shareable via link", pdf: true, mock: true },
  { feature: "Works on any device", pdf: true, mock: true },
];

/* ═══════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════ */

const ForCreators = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar navButtonLabel="Student Home" navButtonLink="/" />

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
            <Sparkles className="h-3.5 w-3.5" /> For Educators &amp; Coaching Institutes
          </div>

          {/* Headline */}
          <h1
            className={`transition-all duration-800 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            style={{ transitionDelay: "200ms" }}
          >
            <span className="block text-[32px] sm:text-[44px] md:text-[60px] lg:text-[76px] font-black text-white leading-[1.05] tracking-[-0.04em]">
              Stop sharing PDFs.
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
                Start giving exams.
              </span>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mt-7 text-[17px] sm:text-[19px] text-white/45 max-w-2xl mx-auto leading-[1.65] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "350ms" }}
          >
            Turn any question paper PDF into a{" "}
            <span className="text-white/75 font-medium">timed, full-length exam simulator</span>{" "}
            that your students can take right in their browser. Get performance analytics you never had before.
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
              <span className="relative">Start Creating Exams</span>
              <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>

            <button
              onClick={() => {
                const el = document.getElementById("how-it-works");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm transition-all duration-200"
            >
              See How It Works
            </button>
          </div>

          {/* Quick stats */}
          <div
            className={`mt-14 grid grid-cols-3 gap-8 sm:gap-16 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "600ms" }}
          >
            {[
              { value: "2 min", label: "Avg. Upload to Publish" },
              { value: "500+", label: "Exams Created" },
              { value: "10K+", label: "Student Attempts" },
            ].map(({ value, label }) => (
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
                <span className="text-red-500/80">The Problem</span>
                <span className="w-6 h-px bg-red-400/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                Sound familiar?
              </h2>
              <p className="mt-4 text-[16px] text-muted-foreground max-w-lg mx-auto">
                You spend hours crafting the perfect paper. But the delivery kills the experience.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {PAIN_POINTS.map((p, i) => {
              const Icon = p.icon;
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
                PDF vs MockSetu
                <span className="w-6 h-px bg-primary/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                The{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #10B981, #34D399)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  upgrade
                </span>{" "}
                your students deserve.
              </h2>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-2xl border border-border/60 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_140px_140px] bg-secondary/60 border-b border-border/40">
                <div className="px-5 py-3.5 text-[12px] font-bold tracking-widest text-muted-foreground/50 uppercase">Feature</div>
                <div className="px-4 py-3.5 text-[12px] font-bold tracking-widest text-muted-foreground/50 uppercase text-center">PDF</div>
                <div className="px-4 py-3.5 text-[12px] font-bold tracking-widest uppercase text-center" style={{ color: "#10B981" }}>MockSetu</div>
              </div>

              {/* Rows */}
              {COMPARISON.map((row, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_140px_140px] ${i < COMPARISON.length - 1 ? "border-b border-border/30" : ""} hover:bg-secondary/30 transition-colors`}
                >
                  <div className="px-3 sm:px-5 py-3 sm:py-3.5 text-[12px] sm:text-[13.5px] text-foreground/80">{row.feature}</div>
                  <div className="px-4 py-3.5 flex items-center justify-center">
                    {row.pdf ? (
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
          FEATURES BENTO GRID
      ════════════════════════════════════════ */}
      <section className="py-16 sm:py-28 px-5 bg-secondary/40">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-16">
              <div className="section-label justify-center mb-4">
                <span className="w-6 h-px bg-primary/40" />
                Creator Tools
                <span className="w-6 h-px bg-primary/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                Everything you need to{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #10B981, #34D399)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  deliver exams
                </span>
                .
              </h2>
              <p className="mt-4 text-[16px] text-muted-foreground max-w-md mx-auto">
                From PDF upload to student analytics — the complete exam delivery pipeline.
              </p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={i} delay={i * 80} className={f.size === "lg" ? "md:col-span-2" : ""}>
                  <div className={`bento-card group relative overflow-hidden bg-gradient-to-br ${f.bg} ${f.border} h-full`}>
                    <div
                      className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl"
                      style={{ background: f.accent }}
                    />
                    <div className="relative z-10">
                      <div
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-5"
                        style={{ background: `${f.accent}15`, border: `1px solid ${f.accent}25` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: f.accent }} />
                      </div>
                      <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">{f.title}</h3>
                      <p className="text-[13px] text-muted-foreground leading-[1.7]">{f.desc}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════ */}
      <section id="how-it-works" className="py-16 sm:py-28 px-5 scroll-mt-16">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-16">
              <div className="section-label justify-center mb-4">
                <span className="w-6 h-px bg-primary/40" />
                How It Works
                <span className="w-6 h-px bg-primary/40" />
              </div>
              <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                From PDF to{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #10B981, #34D399)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  live exam
                </span>
                {" "}in 4 steps.
              </h2>
              <p className="mt-4 text-[16px] text-muted-foreground max-w-md mx-auto">
                No tech skills required. If you can create a PDF, you can create an exam on MockSetu.
              </p>
            </div>
          </Reveal>

          <div className="relative">
            {/* Connector */}
            <div className="hidden lg:block absolute left-[39px] top-12 bottom-12 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

            <div className="flex flex-col gap-6">
              {STEPS.map(({ icon: Icon, step, title, desc, color }, i) => (
                <Reveal key={i} delay={i * 120}>
                  <div className="flex gap-5 items-start group">
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                        style={{ background: `${color}12`, border: `1.5px solid ${color}25` }}
                      >
                        <Icon className="h-5 w-5" style={{ color }} />
                      </div>
                      <div
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white z-20"
                        style={{ background: color }}
                      >
                        {i + 1}
                      </div>
                    </div>

                    <div className="flex-1 pt-1.5 pb-4">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-[16px] font-bold text-foreground tracking-tight">{title}</h3>
                        <span
                          className="hidden sm:block text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${color}12`, color }}
                        >
                          Step {step}
                        </span>
                      </div>
                      <p className="text-[14px] text-muted-foreground leading-[1.7]">{desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          TRUST SIGNALS
      ════════════════════════════════════════ */}
      <section className="py-20 px-5 bg-secondary/40">
        <div className="container mx-auto max-w-4xl">
          <Reveal>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  icon: Lock,
                  title: "Student Privacy Protected",
                  desc: "Creators see anonymised aggregates only — never individual student emails, names, or identifies.",
                  color: "#6C3EF4",
                },
                {
                  icon: Users,
                  title: "Built for Indian Exams",
                  desc: "CAT, JEE, NEET, GATE, UPSC — purpose-built interfaces that match the real exam format.",
                  color: "#10B981",
                },
                {
                  icon: Zap,
                  title: "No Lock-In",
                  desc: "Your content is yours. Download or delete it anytime. No surprise fees, no walled gardens.",
                  color: "#F59E0B",
                },
              ].map(({ icon: Icon, title, desc, color }, i) => (
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
              ))}
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
                  Your students deserve{" "}
                  <span
                    style={{
                      background: "linear-gradient(135deg, #34D399, #10B981, #059669)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    better practice.
                  </span>
                </h2>
                <p className="text-[16px] text-white/45 max-w-md leading-relaxed mb-10">
                  Join the educators who've already upgraded from PDF sharing to real exam simulations. Your first exam takes less than 5 minutes.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => navigate("/auth")}
                    className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white overflow-hidden bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_8px_40px_rgba(16,185,129,0.35)] hover:shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_16px_48px_rgba(16,185,129,0.5)] transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <span className="relative">Create Your First Exam</span>
                    <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>

                  <Link
                    to="/"
                    className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-200"
                  >
                    <BookOpen className="h-4 w-4" />
                    Student Experience
                  </Link>
                </div>

                <p className="mt-6 text-[12px] text-white/20 font-medium">
                  No credit card · No downloads · Ready in 2 minutes
                </p>
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
