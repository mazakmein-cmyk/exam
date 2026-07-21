import { BLOG_LIST, type BlogPost } from "@/data/blogPosts";
import { NEW_BLOG_META, type BlogMeta } from "./blogIndex";

export type { BlogMeta };

const LEGACY_META: BlogMeta[] = BLOG_LIST.map(
  ({ slug, title, excerpt, category, publishedAt, updatedAt, readingMinutes, tags }) => ({
    slug,
    title,
    excerpt,
    category,
    publishedAt,
    updatedAt,
    readingMinutes,
    tags,
  })
);

/** All posts (new + legacy), newest first. Metadata only — full content is code-split per post. */
export const BLOG_META: BlogMeta[] = [...NEW_BLOG_META, ...LEGACY_META].sort((a, b) =>
  a.publishedAt < b.publishedAt ? 1 : -1
);

export const BLOG_CATEGORIES: BlogMeta["category"][] = Array.from(
  new Set(BLOG_META.map((m) => m.category))
);

// Each post file becomes its own lazy chunk — the article route loads only the one it needs.
const postModules = import.meta.glob<{ default: BlogPost }>("./posts/*.ts");

export async function loadPost(slug: string): Promise<BlogPost | null> {
  const loader = postModules[`./posts/${slug}.ts`];
  if (loader) return (await loader()).default;
  // Legacy posts still live in the original blogPosts.ts module.
  const { BLOG_POSTS } = await import("@/data/blogPosts");
  return BLOG_POSTS[slug] ?? null;
}

export function relatedPosts(slug: string, category: BlogMeta["category"], count = 3): BlogMeta[] {
  const sameCategory = BLOG_META.filter((m) => m.slug !== slug && m.category === category);
  if (sameCategory.length >= count) return sameCategory.slice(0, count);
  const fillers = BLOG_META.filter((m) => m.slug !== slug && m.category !== category);
  return [...sameCategory, ...fillers].slice(0, count);
}
