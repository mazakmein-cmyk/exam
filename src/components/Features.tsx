import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Timer, BarChart3, FileCheck, Zap, BookMarked, Shield, ArrowRight } from "lucide-react";

const EXAM_QUICK_LINKS = [
  { slug: "jee-main", label: "JEE Main", accent: "#F59E0B" },
  { slug: "neet-ug", label: "NEET UG", accent: "#10B981" },
  { slug: "cat", label: "CAT", accent: "#6C3EF4" },
  { slug: "gate", label: "GATE", accent: "#3B82F6" },
  { slug: "upsc-prelims", label: "UPSC Prelims", accent: "#EC4899" },
];

const features = [
  {
    icon: Timer,
    title: "Real Exam Conditions",
    description: "Per-section countdown timers, auto-submit, and exact question navigation — just like being in the actual exam hall.",
    size: "lg", // spans 2 cols on desktop
    accent: "#F59E0B",
    bg: "from-amber-500/[0.07] to-transparent",
    border: "hover:border-amber-500/25",
  },
  {
    icon: BarChart3,
    title: "Deep Analytics",
    description: "Know exactly where you lose marks and time. Track trends across all attempts.",
    size: "sm",
    accent: "#6C3EF4",
    bg: "from-violet-500/[0.07] to-transparent",
    border: "hover:border-violet-500/25",
  },
  {
    icon: FileCheck,
    title: "Instant Answer Key",
    description: "Upload answer keys before, during, or after — instant scoring and feedback.",
    size: "sm",
    accent: "#10B981",
    bg: "from-emerald-500/[0.07] to-transparent",
    border: "hover:border-emerald-500/25",
  },
  {
    icon: BookMarked,
    title: "All Major Exams",
    description: "JEE, NEET, CAT, GATE, UPSC — any PDF becomes a full simulation instantly.",
    size: "sm",
    accent: "#EC4899",
    bg: "from-pink-500/[0.07] to-transparent",
    border: "hover:border-pink-500/25",
  },
  {
    icon: Zap,
    title: "CAT-Style Interface",
    description: "Question palette, mark-for-review, keyboard navigation — the exact format top exams use.",
    size: "lg",
    accent: "#3B82F6",
    bg: "from-blue-500/[0.07] to-transparent",
    border: "hover:border-blue-500/25",
  },
  {
    icon: Shield,
    title: "Safe Practice Zone",
    description: "Learn from your mistakes without pressure. Review every question post-exam.",
    size: "sm",
    accent: "#06B6D4",
    bg: "from-cyan-500/[0.07] to-transparent",
    border: "hover:border-cyan-500/25",
  },
];

const FeatureCard = ({ feature, index }: { feature: typeof features[0]; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const Icon = feature.icon;

  return (
    <div
      ref={ref}
      className={`bento-card group relative overflow-hidden bg-gradient-to-br ${feature.bg} ${feature.border} transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${feature.size === "lg" ? "md:col-span-2" : ""}`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Glow spot on hover */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl"
        style={{ background: feature.accent }}
      />

      <div className="relative z-10">
        {/* Icon */}
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-5"
          style={{ background: `${feature.accent}15`, border: `1px solid ${feature.accent}25` }}
        >
          <Icon className="h-5 w-5" style={{ color: feature.accent }} />
        </div>

        {/* Text */}
        <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">
          {feature.title}
        </h3>
        <p className="text-[13px] text-muted-foreground leading-[1.7]">
          {feature.description}
        </p>
      </div>
    </div>
  );
};

const Features = () => {
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerVisible, setHeaderVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHeaderVisible(true); },
      { threshold: 0.1 }
    );
    if (headerRef.current) observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-16 sm:py-28 px-5">
      <div className="container mx-auto max-w-5xl">
        {/* Section header */}
        <div
          ref={headerRef}
          className={`text-center mb-16 transition-all duration-700 ${headerVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <div className="section-label justify-center mb-4">
            <span className="w-6 h-px bg-primary/40" />
            Why MockSetu
            <span className="w-6 h-px bg-primary/40" />
          </div>
          <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
            Everything a{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #6C3EF4, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              serious student
            </span>
            {" "}needs.
          </h2>
          <p className="mt-4 text-[16px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            Not just another study tool — this is your exam simulator, performance coach, and test arena all in one.
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>

        {/* Exam quick-links — internal-link strip for SEO + topical authority */}
        <div className="mt-16 sm:mt-20">
          <p className="text-center text-[12px] font-bold tracking-widest text-foreground/40 uppercase mb-5">
            Free mocks by exam
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {EXAM_QUICK_LINKS.map(({ slug, label, accent }) => (
              <Link
                key={slug}
                to={`/mock-test/${slug}`}
                className="group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-card hover:border-primary/30 hover:shadow-sm transition-all text-[13px] font-semibold text-foreground/80 hover:text-foreground"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: accent }}
                  aria-hidden="true"
                />
                {label} Mock Test
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
