import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import Reveal from "@/components/home/Reveal";
import { BLOG_META } from "@/data/blog";
import { slugifyCategory } from "@/lib/homeExamContext";
import { type UpdatesCopy } from "@/i18n/homeCopy";
import { HOME_COPY_EN } from "@/i18n/homeCopy.en";

/**
 * Cluster D — three guides for the chosen exam, straight from the blog
 * cluster. This is where the home page's freshness lives (the evergreen
 * clusters above it barely change), and it funnels the same way the SEO
 * pillar does: tag-matched posts → article → /ssc-mts → the library.
 */

const UpdatesCluster = ({
    selectedCategory,
    copy = HOME_COPY_EN.updates,
}: {
    selectedCategory: string | null;
    copy?: UpdatesCopy;
}) => {
    const posts = useMemo(() => {
        // No context → the newest guides across every exam; a chosen exam →
        // its tagged guides, padded with the newest overall when it has
        // fewer than three.
        if (!selectedCategory) return BLOG_META.slice(0, 3);
        const wanted = slugifyCategory(selectedCategory);
        const tagged = BLOG_META.filter((post) =>
            post.tags?.some((tag) => slugifyCategory(tag) === wanted)
        );
        const chosen = tagged.slice(0, 3);
        if (chosen.length < 3) {
            const fillers = BLOG_META.filter((p) => !chosen.includes(p)).slice(0, 3 - chosen.length);
            chosen.push(...fillers);
        }
        return chosen;
    }, [selectedCategory]);

    const isMts = selectedCategory !== null && slugifyCategory(selectedCategory) === "ssc-mts";

    if (posts.length === 0) return null;

    return (
        <section aria-label="Latest updates and guides" className="bg-secondary/40 border-y border-border/40">
            <div className="container mx-auto max-w-6xl px-5 py-14 sm:py-16">
                <Reveal>
                    <SectionHeader
                        icon={BookOpen}
                        eyebrow={copy.eyebrow}
                        title={selectedCategory ? copy.titleCategory(selectedCategory) : copy.titleGeneric}
                        accent="#3B82F6"
                    />
                </Reveal>

                <div className="grid md:grid-cols-3 gap-4">
                    {posts.map((post, i) => (
                        <Reveal key={post.slug} delay={i * 100} className="h-full">
                        <Link
                            to={`/blog/${post.slug}`}
                            className="group h-full flex flex-col rounded-2xl border border-border/60 bg-card p-5 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 transition-all duration-200"
                        >
                            <span className="text-[10.5px] font-bold tracking-widest uppercase text-[#3B82F6] mb-2">
                                {post.category}
                            </span>
                            <span className="text-[15px] font-bold text-foreground leading-snug line-clamp-2 mb-2 group-hover:text-[#6C3EF4] transition-colors">
                                {post.title}
                            </span>
                            <span className="text-[12.5px] text-muted-foreground leading-[1.6] line-clamp-2 mb-4">
                                {post.excerpt}
                            </span>
                            <span className="mt-auto text-[12px] font-semibold text-muted-foreground">
                                {copy.minRead(post.readingMinutes)}
                            </span>
                        </Link>
                        </Reveal>
                    ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
                    {isMts && (
                        <Link
                            to="/ssc-mts"
                            className="inline-flex items-center gap-2 text-[13.5px] font-bold text-[#6C3EF4] hover:text-[#5B2FE3] transition-colors"
                        >
                            {copy.pillarLink} <ArrowRight className="h-4 w-4" />
                        </Link>
                    )}
                    <Link
                        to="/blog"
                        className="inline-flex items-center gap-2 text-[13.5px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copy.allGuides} <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default UpdatesCluster;
