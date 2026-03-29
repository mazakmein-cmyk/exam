import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Arjun Mehta",
    handle: "@arjun_jee",
    exam: "JEE Advanced 2024",
    score: "AIR 847",
    avatar: "AM",
    color: "from-blue-500 to-indigo-600",
    stars: 5,
    quote: "Practised 30+ full papers here. The timed pressure and section navigation is identical to JEE. My rank jumped 3,000 places.",
    tag: "JEE",
  },
  {
    name: "Priya Sharma",
    handle: "@priya_neet",
    exam: "NEET 2024",
    score: "650 / 720",
    avatar: "PS",
    color: "from-emerald-500 to-teal-600",
    stars: 5,
    quote: "Analytics showed I was losing 8 minutes per Physics section. Fixing that one habit added 40 marks to my final score.",
    tag: "NEET",
  },
  {
    name: "Rohan Desai",
    handle: "@rohan_cat",
    exam: "CAT 2024",
    score: "99.2 Percentile",
    avatar: "RD",
    color: "from-violet-500 to-purple-600",
    stars: 5,
    quote: "CAT palette, mark-for-review, full mock format — best free prep tool I found. No credit card, no ads, no BS.",
    tag: "CAT",
  },
];

const TAG_COLORS: Record<string, string> = {
  JEE: "#3B82F6",
  NEET: "#10B981",
  CAT: "#8B5CF6",
};

const Testimonials = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.05 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-16 sm:py-28 px-5" ref={ref}>
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <div className="section-label justify-center mb-4">
            <span className="w-6 h-px bg-primary/40" />
            Student Stories
            <span className="w-6 h-px bg-primary/40" />
          </div>
          <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
            Real students.{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #6C3EF4, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Real results.
            </span>
          </h2>
          <p className="mt-4 text-[16px] text-muted-foreground max-w-sm mx-auto">
            Don't take our word for it.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`group relative flex flex-col rounded-2xl border border-border/60 bg-card p-6 hover:border-border transition-all duration-500 hover:shadow-lg ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{
                transitionDelay: `${i * 100 + 200}ms`,
                boxShadow: visible ? undefined : "none",
              }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                ))}
              </div>

              {/* Quote */}
              <p className="flex-1 text-[13.5px] text-foreground/75 leading-[1.75] mb-6">
                "{t.quote}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-[11px] font-black text-white flex-shrink-0`}>
                  {t.avatar}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-foreground truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{t.exam}</div>
                </div>

                {/* Score badge */}
                <div
                  className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: `${TAG_COLORS[t.tag]}12`,
                    color: TAG_COLORS[t.tag],
                    border: `1px solid ${TAG_COLORS[t.tag]}25`,
                  }}
                >
                  {t.score}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
