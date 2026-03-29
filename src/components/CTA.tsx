import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";

const CTA = () => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-16 sm:py-28 px-5">
      <div className="container mx-auto max-w-5xl">
        {/* Full-width card — dark, premium */}
        <div
          className={`relative overflow-hidden rounded-3xl bg-[#07091A] text-white transition-all duration-800 ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"}`}
        >
          {/* Background glows */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-[#6C3EF4] opacity-[0.15] blur-[100px]" />
            <div className="absolute bottom-[-30%] left-[-10%] w-[400px] h-[300px] rounded-full bg-[#A855F7] opacity-[0.08] blur-[80px]" />
          </div>

          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)`,
              backgroundSize: "28px 28px",
            }}
          />

          {/* Border */}
          <div className="absolute inset-0 rounded-3xl border border-white/[0.08]" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center px-5 sm:px-8 py-14 sm:py-20">
            <h2 className="text-[28px] sm:text-[36px] md:text-[52px] lg:text-[60px] font-black tracking-[-0.04em] leading-[1.05] mb-5">
              Your next exam is{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #A78BFA, #7C3AED, #C084FC)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                waiting.
              </span>
            </h2>
            <p className="text-[16px] text-white/50 max-w-md leading-relaxed mb-10">
              Join thousands of students who already practise smarter.
              Get started in under a minute.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate("/student-auth")}
                className="group relative inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white overflow-hidden bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_8px_40px_rgba(108,62,244,0.4)] hover:shadow-[0_0_0_1px_rgba(108,62,244,0.6),0_16px_48px_rgba(108,62,244,0.55)] transition-all duration-200 hover:-translate-y-0.5"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative">Create Free Account</span>
                <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => navigate("/marketplace")}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-[15px] font-semibold text-white/60 hover:text-white border border-white/10 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-200"
              >
                <BookOpen className="h-4 w-4" />
                Browse Exams First
              </button>
            </div>

            <p className="mt-6 text-[12px] text-white/25 font-medium">
              No credit card required · No downloads
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
