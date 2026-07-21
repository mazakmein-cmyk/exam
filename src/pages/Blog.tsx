import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { BLOG_META, BLOG_CATEGORIES } from "@/data/blog";

const Blog = () => {
  const [category, setCategory] = useState<string | null>(null);
  const visible = category ? BLOG_META.filter((p) => p.category === category) : BLOG_META;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="MockSetu (Mockset) Blog — Mock Test Strategy, Exam Guides & Study Plans"
        description="In-depth MockSetu (Mockset) guides on mock test strategy, exam preparation, and study plans for JEE, NEET, CAT, GATE, and UPSC aspirants. Written for serious students who want to actually rank."
        path="/blog"
        keywords="mockset blog, MockSetu blog, exam preparation blog, mock test strategy blog, JEE preparation, NEET preparation, CAT preparation, GATE preparation, UPSC preparation, study plan, mockset study plan, SSC CGL preparation, bank PO preparation, CUET preparation, CLAT preparation, study techniques, placement preparation blog"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "MockSetu Blog",
            alternateName: "Mockset Blog",
            url: "https://mocksetu.in/blog",
            description:
              "In-depth MockSetu (Mockset) guides on mock test strategy, exam preparation, and study plans for JEE, NEET, CAT, GATE, and UPSC aspirants.",
            inLanguage: "en-IN",
            publisher: { "@id": "https://mocksetu.in/#organization" },
            isPartOf: { "@id": "https://mocksetu.in/#website" },
            blogPost: BLOG_META.map((p) => ({
              "@type": "BlogPosting",
              headline: p.title,
              description: p.excerpt,
              url: `https://mocksetu.in/blog/${p.slug}`,
              datePublished: p.publishedAt,
              dateModified: p.updatedAt,
              author: { "@type": "Organization", name: "MockSetu", alternateName: "Mockset" },
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://mocksetu.in/" },
              { "@type": "ListItem", position: 2, name: "Blog", item: "https://mocksetu.in/blog" },
            ],
          },
        ]}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#07091A] pt-28 pb-20 px-5">
        <div className="absolute inset-0">
          <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full bg-[#6C3EF4] opacity-[0.13] blur-[120px]" />
        </div>
        <div className="relative z-10 container mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm px-4 py-2 mb-8">
            <BookOpen className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[12px] font-semibold text-white/70 tracking-wide">MockSetu Blog</span>
          </div>
          <h1 className="text-[36px] sm:text-[52px] md:text-[64px] font-black text-white leading-[1.05] tracking-[-0.035em] mb-6">
            Mock test strategy.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #A78BFA 0%, #7C3AED 60%, #C084FC 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Honest exam guides.
            </span>
          </h1>
          <p className="text-[16px] sm:text-[18px] text-white/55 max-w-2xl mx-auto leading-[1.7]">
            In-depth, no-fluff guides for serious JEE, NEET, CAT, GATE, and UPSC aspirants. Written
            by the team that built MockSetu (also known as Mockset) — India&rsquo;s free exam simulator.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-4xl">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-10">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                category === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({BLOG_META.length})
            </button>
            {BLOG_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c === category ? null : c)}
                className={`px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                  category === c
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-5">
            {visible.map((p) => (
              <Link
                key={p.slug}
                to={`/blog/${p.slug}`}
                className="group rounded-2xl border border-border/60 bg-card p-6 sm:p-8 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 text-[12px] text-muted-foreground mb-3">
                  <span className="font-semibold tracking-wide uppercase text-primary/80">{p.category}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {p.readingMinutes} min read
                  </span>
                  <span>·</span>
                  <time dateTime={p.publishedAt}>{new Date(p.publishedAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</time>
                </div>
                <h2 className="text-[20px] sm:text-[24px] font-black text-foreground tracking-[-0.02em] mb-3 group-hover:text-primary transition-colors">
                  {p.title}
                </h2>
                <p className="text-[14.5px] text-muted-foreground leading-[1.7] mb-4">{p.excerpt}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                  Read article
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
