import { useEffect, useRef, useState } from "react";
import { BookOpen, Play, BarChart, CheckCircle } from "lucide-react";

const steps = [
  {
    icon: BookOpen,
    step: "01",
    title: "Find Your Exam",
    desc: "Browse our library of curated exams, or have your teacher share a direct link — you're in the right place in seconds.",
    color: "#6C3EF4",
  },
  {
    icon: Play,
    step: "02",
    title: "Start the Simulation",
    desc: "Launch a timed, full-length mock test right in your browser. Same format, same pressure — zero setup required.",
    color: "#10B981",
  },
  {
    icon: CheckCircle,
    step: "03",
    title: "Review Every Answer",
    desc: "Go question-by-question after submission. Understand what you got wrong and exactly why.",
    color: "#F59E0B",
  },
  {
    icon: BarChart,
    step: "04",
    title: "Track Your Growth",
    desc: "Your dashboard reveals score trends, time-per-question, and section accuracy. See yourself improve, attempt by attempt.",
    color: "#EC4899",
  },
];

const HowItWorks = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.05 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-16 sm:py-28 px-5 bg-secondary/40" ref={sectionRef}>
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="section-label justify-center mb-4">
            <span className="w-6 h-px bg-primary/40" />
            How It Works
            <span className="w-6 h-px bg-primary/40" />
          </div>
          <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
            From zero to{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #6C3EF4, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              mock exam
            </span>
            {" "}in 60 seconds.
          </h2>
          <p className="mt-4 text-[16px] text-muted-foreground max-w-md mx-auto">
            Four simple steps. No downloads, no setup, no confusion.
          </p>
        </div>

        {/* Steps — numbered list with connector lines */}
        <div className="relative">
          {/* Vertical connector line — desktop */}
          <div className="hidden lg:block absolute left-[39px] top-12 bottom-12 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

          <div className="flex flex-col gap-6">
            {steps.map(({ icon: Icon, step, title, desc, color }, i) => (
              <div
                key={i}
                className={`flex gap-5 items-start group transition-all duration-700 ${
                  visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"
                }`}
                style={{ transitionDelay: `${i * 120 + 200}ms` }}
              >
                {/* Icon bubble */}
                <div className="relative flex-shrink-0">
                  <div
                    className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{
                      background: `${color}12`,
                      border: `1.5px solid ${color}25`,
                    }}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>
                  {/* Step number */}
                  <div
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white z-20"
                    style={{ background: color }}
                  >
                    {i + 1}
                  </div>
                </div>

                {/* Text */}
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
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
