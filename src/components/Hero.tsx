import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle, ChevronDown, Clock, Target, TrendingUp, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const TRUSTED_BY = ["JEE", "NEET", "CAT", "GATE", "UPSC"];

const PILL_STATS = [
  { icon: CheckCircle, label: "100% Free", color: "text-emerald-400" },
  { icon: Clock, label: "Timed Exams", color: "text-amber-400" },
  { icon: TrendingUp, label: "Deep Analytics", color: "text-violet-400" },
];

const Hero = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    supabase.auth.getSession().then(({ data: { session } }) => setIsAuthenticated(!!session));
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex flex-col overflow-hidden bg-[#07091A]"
    >
      {/* ── Deep layered background ── */}
      <div className="absolute inset-0">
        {/* Base radial glow — brand purple */}
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-[#6C3EF4] opacity-[0.12] blur-[120px]" />
        {/* Secondary glow — pink/magenta */}
        <div className="absolute top-[10%] left-[15%] w-[500px] h-[400px] rounded-full bg-[#A855F7] opacity-[0.08] blur-[100px] animate-pulse-glow" />
        {/* Tertiary — right side blue */}
        <div className="absolute top-[30%] right-[10%] w-[400px] h-[400px] rounded-full bg-[#3B82F6] opacity-[0.06] blur-[100px] animate-pulse-glow delay-700" />
      </div>

      {/* ── Dot grid ── */}
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
        }}
      />

      {/* ── Gradient border line at bottom ── */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ══════════════════════════════════════════
          CONTENT
      ══════════════════════════════════════════ */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pt-28 pb-16">

        {/* Trusted-by marquee strip */}
        <div
          className={`flex items-center gap-3 mb-10 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
          style={{ transitionDelay: "100ms" }}
        >
          <div className="flex items-center gap-0 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-2">
            <span className="text-[11px] font-semibold text-white/40 tracking-widest uppercase mr-3">For</span>
            {TRUSTED_BY.map((exam, i) => (
              <span key={exam} className="text-[12px] font-bold text-white/60">
                {exam}{i < TRUSTED_BY.length - 1 && <span className="text-white/20 mx-1.5">·</span>}
              </span>
            ))}
          </div>
        </div>

        {/* ── Main headline ── */}
        <div className="text-center max-w-4xl mx-auto">
          <h1
            className={`transition-all duration-800 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            style={{ transitionDelay: "200ms" }}
          >
            {/* Line 1 */}
            <span className="block text-[40px] sm:text-[56px] md:text-[72px] lg:text-[88px] font-black text-white leading-[1] tracking-[-0.04em] mb-3">
              The Bridge to
            </span>
            {/* Line 2 — gradient animated */}
            <span
              className="block text-[40px] sm:text-[56px] md:text-[72px] lg:text-[88px] font-black leading-[1] tracking-[-0.04em]"
              style={{
                background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 35%, #9333EA 60%, #C084FC 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Your Best Score.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`mt-7 text-[17px] sm:text-[19px] text-white/50 max-w-xl mx-auto leading-[1.65] font-normal tracking-[-0.01em] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "350ms" }}
          >
            Practice under real conditions, spot your weak areas, and{" "}
            <span className="text-white/80 font-medium">crack the exam you've been preparing for</span>.
          </p>

          {/* ── CTAs ── */}
          <div
            className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "480ms" }}
          >
            {/* Primary */}
            <button
              onClick={() => navigate("/student-auth")}
              className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white overflow-hidden bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_8px_32px_rgba(108,62,244,0.4)] hover:shadow-[0_0_0_1px_rgba(108,62,244,0.6),0_12px_40px_rgba(108,62,244,0.5)] transition-all duration-200 hover:-translate-y-0.5"
            >
              {/* Shimmer */}
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
              <span className="relative">Start Practising Free</span>
              <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>

            {/* Secondary */}
            <button
              onClick={() => navigate("/marketplace")}
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white/70 hover:text-white border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm transition-all duration-200"
            >
              <BookOpen className="h-4 w-4" />
              Browse Exam Library
            </button>
          </div>

          {/* Trust pills */}
          <div
            className={`mt-8 flex flex-wrap items-center justify-center gap-2 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "580ms" }}
          >
            {PILL_STATS.map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.08] text-[13px] font-medium text-white/60"
              >
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div
          className={`mt-16 grid grid-cols-3 gap-8 sm:gap-16 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ transitionDelay: "680ms" }}
        >
          {[
            { value: "50K+", label: "Questions Practised" },
            { value: "10K+", label: "Mock Tests Taken" },
            { value: "98%", label: "Student Satisfaction" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">{value}</div>
              <div className="mt-1 text-[12px] text-white/35 font-medium tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="relative z-10 flex justify-center pb-8">
        <div className="flex flex-col items-center gap-2 opacity-30 animate-bounce">
          <ChevronDown className="h-5 w-5 text-white" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
