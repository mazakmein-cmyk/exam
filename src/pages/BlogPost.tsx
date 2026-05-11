import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronDown, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { BLOG_LIST, BLOG_POSTS, BlogPost as BlogPostType } from "@/data/blogPosts";

const buildJsonLd = (p: BlogPostType) => {
  const url = `https://mocksetu.in/blog/${p.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      datePublished: p.publishedAt,
      dateModified: p.updatedAt,
      author: { "@type": "Organization", name: "MockSetu", url: "https://mocksetu.in/" },
      publisher: {
        "@type": "Organization",
        name: "MockSetu",
        logo: { "@type": "ImageObject", url: "https://mocksetu.in/mocksetu-logo.png" },
      },
      keywords: p.keywords,
      articleSection: p.category,
      wordCount: p.content.reduce((acc, b) => {
        if (b.type === "p" || b.type === "h2" || b.type === "quote") return acc + b.text.split(/\s+/).length;
        if (b.type === "ul") return acc + b.items.join(" ").split(/\s+/).length;
        return acc;
      }, 0),
      inLanguage: "en-IN",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faqs.map((f) => ({
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
        { "@type": "ListItem", position: 2, name: "Blog", item: "https://mocksetu.in/blog" },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
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
        className="w-full flex items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] sm:text-[16px] font-semibold text-foreground tracking-tight pr-4">
          {q}
        </span>
        <ChevronDown className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-5 text-[14px] sm:text-[15px] text-muted-foreground leading-[1.7]">{a}</div>
      )}
    </div>
  );
};

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? BLOG_POSTS[slug] : undefined;

  if (!post) return <Navigate to="/blog" replace />;

  const related = BLOG_LIST.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={post.metaTitle}
        description={post.metaDescription}
        path={`/blog/${post.slug}`}
        keywords={post.keywords}
        jsonLd={buildJsonLd(post)}
      />
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#07091A] pt-28 pb-16 px-5">
        <div className="absolute inset-0">
          <div className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-[#6C3EF4] opacity-[0.12] blur-[120px]" />
        </div>
        <div className="relative z-10 container mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-[12px] text-white/40">
            <Link to="/" className="hover:text-white/80 transition-colors">Home</Link>
            <span>/</span>
            <Link to="/blog" className="hover:text-white/80 transition-colors">Blog</Link>
            <span>/</span>
            <span className="text-white/60 truncate">{post.category}</span>
          </nav>

          <div className="text-[11px] font-bold tracking-widest text-amber-400/80 uppercase mb-4">
            {post.hero.eyebrow}
          </div>
          <h1 className="text-[30px] sm:text-[44px] md:text-[52px] font-black text-white leading-[1.1] tracking-[-0.03em] mb-5">
            {post.hero.h1}
          </h1>
          <p className="text-[16px] sm:text-[18px] text-white/55 leading-[1.7] mb-6">{post.hero.lede}</p>

          <div className="flex flex-wrap items-center gap-3 text-[12px] text-white/40">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {post.readingMinutes} min read
            </span>
            <span>·</span>
            <time dateTime={post.publishedAt}>
              Published {new Date(post.publishedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
            </time>
            <span>·</span>
            <time dateTime={post.updatedAt}>
              Updated {new Date(post.updatedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}
            </time>
          </div>
        </div>
      </section>

      {/* Body */}
      <section className="py-12 sm:py-16 px-5">
        <article className="container mx-auto max-w-3xl prose-mocksetu">
          {post.content.map((block, i) => {
            if (block.type === "h2") {
              return (
                <h2
                  key={i}
                  className="text-[22px] sm:text-[28px] font-black text-foreground tracking-[-0.025em] mt-10 mb-4 first:mt-0"
                >
                  {block.text}
                </h2>
              );
            }
            if (block.type === "p") {
              return (
                <p key={i} className="text-[15px] sm:text-[16.5px] text-foreground/85 leading-[1.85] mb-5">
                  {block.text}
                </p>
              );
            }
            if (block.type === "ul") {
              return (
                <ul key={i} className="space-y-2.5 mb-6 mt-2">
                  {block.items.map((item) => (
                    <li
                      key={item}
                      className="text-[14.5px] sm:text-[15.5px] text-foreground/80 leading-[1.75] pl-5 relative"
                    >
                      <span className="absolute left-0 top-[10px] w-1.5 h-1.5 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              );
            }
            if (block.type === "quote") {
              return (
                <blockquote
                  key={i}
                  className="my-8 border-l-4 border-primary/60 pl-5 py-1 italic text-[16px] sm:text-[18px] text-foreground/75 leading-[1.7]"
                >
                  {block.text}
                </blockquote>
              );
            }
            return null;
          })}

          {/* FAQs */}
          <div className="mt-14 pt-10 border-t border-border/50">
            <h2 className="text-[22px] sm:text-[28px] font-black text-foreground tracking-[-0.025em] mb-5">
              Frequently asked
            </h2>
            <div className="rounded-2xl border border-border/60 bg-card px-5 sm:px-7">
              {post.faqs.map((f, i) => (
                <FaqItem key={f.question} q={f.question} a={f.answer} idx={i} />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-12 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <span
                key={t}
                className="px-3 py-1 rounded-full bg-secondary text-[12px] font-medium text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#6C3EF4]/10 via-[#A855F7]/5 to-transparent border border-primary/20 p-6 sm:p-8 text-center">
            <p className="text-[15px] sm:text-[16px] text-foreground/80 mb-4">
              Want to actually apply what you just read? Start a free MockSetu mock test now.
            </p>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-semibold text-white bg-[#6C3EF4] hover:bg-[#5B2FE3] shadow-md transition-all"
            >
              Browse Free Mock Tests <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="py-16 px-5 bg-secondary/20">
          <div className="container mx-auto max-w-4xl">
            <h2 className="text-[22px] sm:text-[28px] font-black text-foreground tracking-[-0.025em] mb-6">
              Keep reading
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/blog/${r.slug}`}
                  className="group rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/40 transition-all"
                >
                  <span className="text-[11px] font-bold tracking-widest text-primary/70 uppercase">
                    {r.category}
                  </span>
                  <h3 className="mt-2 text-[16px] sm:text-[18px] font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-muted-foreground leading-[1.65] line-clamp-2">
                    {r.excerpt}
                  </p>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/blog"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to all articles
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
};

export default BlogPost;
