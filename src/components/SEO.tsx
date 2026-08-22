import { useEffect } from "react";
// Every value here also feeds scripts/prerender.mjs, which writes the same
// tags into the static HTML at build time. Sharing the module is what keeps the
// prerendered head and the runtime head from drifting apart.
import {
  DEFAULT_OG_IMAGE,
  MANAGED_TAG_ATTR,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  SITE_URL,
  buildWebPageJsonLd,
  mergeKeywords,
} from "@/lib/seo/structuredData";

type SEOProps = {
  title: string;
  description: string;
  path: string;
  keywords?: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /**
   * BCP-47 language of the page ("en-IN" default, "hi-IN" for the Hindi
   * pages). Drives og:locale, the WebPage JSON-LD's inLanguage, and the
   * <html lang> attribute so screen readers pick the right voice.
   */
  lang?: string;
  /**
   * hreflang alternates for pages that exist in more than one language.
   * MUST be bidirectional — the English page lists the Hindi URL and vice
   * versa, each list including the page itself — or Google ignores the pair.
   * Paths are site-relative ("/hindi").
   */
  alternates?: Array<{ hrefLang: string; path: string }>;
  /**
   * OpenGraph object type — "website" for everything except articles.
   *
   * scripts/prerender.mjs writes this into the static HTML, which is what social
   * crawlers actually read. It is mirrored here so that a client-side navigation
   * cannot leave "article" behind on a non-article route, and so the live DOM
   * agrees with the first byte.
   */
  ogType?: "website" | "article";
  /** ISO dates, emitted as article:published_time / article:modified_time. */
  publishedTime?: string;
  modifiedTime?: string;
};

const upsertMeta = (selector: string, attr: "name" | "property", key: string, value: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED_TAG_ATTR, "1");
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
};

const upsertLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    el.setAttribute(MANAGED_TAG_ATTR, "1");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

const removeMeta = (selector: string) => {
  document.head.querySelector(selector)?.remove();
};

const removeLink = (rel: string) => {
  document.head.querySelector(`link[rel="${rel}"]`)?.remove();
};

const clearManagedJsonLd = () => {
  document.head
    .querySelectorAll(`script[type="application/ld+json"][${MANAGED_TAG_ATTR}="1"]`)
    .forEach((n) => n.parentNode?.removeChild(n));
};

const appendJsonLd = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute(MANAGED_TAG_ATTR, "1");
  script.text = JSON.stringify(payload);
  document.head.appendChild(script);
};

/**
 * Alternate links get their own upsert cycle: unlike canonical there can be
 * several, so the stale set is cleared and rebuilt rather than patched.
 *
 * It clears EVERY hreflang alternate, not only the ones this module wrote:
 * index.html ships a static homepage-scoped set for no-JS crawlers, and if
 * those survived onto another route the page would name two different URLs as
 * its English version — a conflicting cluster Google discards wholesale. The
 * `[hreflang]` part of the selector matters: the RSS <link rel="alternate">
 * carries no hreflang and must be left alone.
 */
const ALTERNATE_ATTR = "data-mocksetu-alternate";

const setAlternateLinks = (alternates: Array<{ hrefLang: string; path: string }>) => {
  document.head
    .querySelectorAll('link[rel="alternate"][hreflang]')
    .forEach((n) => n.parentNode?.removeChild(n));
  alternates.forEach(({ hrefLang, path }) => {
    const el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", hrefLang);
    el.setAttribute("href", `${SITE_URL}${path}`);
    el.setAttribute(ALTERNATE_ATTR, "1");
    document.head.appendChild(el);
  });
};

const SEO = ({
  title,
  description,
  path,
  keywords,
  ogImage,
  noindex,
  jsonLd,
  lang = "en-IN",
  alternates,
  ogType = "website",
  publishedTime,
  modifiedTime,
}: SEOProps) => {
  /**
   * Every caller passes `jsonLd` as an inline object/array literal, so the prop
   * is a brand-new reference on every render of the host page. With `jsonLd` in
   * the dependency array directly, the effect below re-ran on EVERY render —
   * tearing every managed JSON-LD script out of <head>, re-stringifying the
   * payload, and re-appending it. On the exam library that meant a full head
   * rewrite per keystroke in the search box.
   *
   * Serializing gives the effect a value-equal dependency (strings compare by
   * value), so it runs when the structured data actually changes and not when
   * the parent happens to re-render. The serialized string is what gets
   * injected anyway, so nothing extra is computed.
   */
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";
  const alternatesKey = alternates ? JSON.stringify(alternates) : "";

  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    const image = ogImage || DEFAULT_OG_IMAGE;

    document.title = title;
    document.documentElement.setAttribute("lang", lang);

    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[name="keywords"]', "name", "keywords", mergeKeywords(keywords));

    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX
    );

    /**
     * A noindexed page gets NO url-bearing tags.
     *
     * Two reasons, and both matter. A canonical on a page we are asking crawlers
     * to drop is a contradictory signal — it nominates the URL as the preferred
     * version of itself while the robots tag says forget it. And an OpenGraph
     * card on a private page is a share preview for something nobody should be
     * sharing. scripts/prerender.mjs strips exactly the same set for its
     * NOINDEX_ROUTES, so the static head and this one agree.
     *
     * Practical consequence: a noindexed page's `path` is never rendered
     * anywhere, which is what lets the admin console avoid putting its real URL
     * into the client bundle.
     */
    if (noindex) {
      removeLink("canonical");
      [
        "og:title",
        "og:description",
        "og:url",
        "og:image",
        "og:locale",
        "og:type",
        "article:published_time",
        "article:modified_time",
      ].forEach((p) => removeMeta(`meta[property="${p}"]`));
      ["twitter:title", "twitter:description", "twitter:image"].forEach((n) =>
        removeMeta(`meta[name="${n}"]`)
      );
      setAlternateLinks([]);
      clearManagedJsonLd();
      return () => {
        document.documentElement.setAttribute("lang", "en-IN");
      };
    }

    upsertLink("canonical", url);

    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:image"]', "property", "og:image", image);
    upsertMeta('meta[property="og:locale"]', "property", "og:locale", lang.replace("-", "_"));
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);

    // Article timestamps are meaningful only on articles, so they are written
    // when present and actively removed otherwise — left behind by a previous
    // route they would date an unrelated page.
    if (ogType === "article" && publishedTime) {
      upsertMeta(
        'meta[property="article:published_time"]',
        "property",
        "article:published_time",
        publishedTime
      );
      upsertMeta(
        'meta[property="article:modified_time"]',
        "property",
        "article:modified_time",
        modifiedTime || publishedTime
      );
    } else {
      removeMeta('meta[property="article:published_time"]');
      removeMeta('meta[property="article:modified_time"]');
    }

    setAlternateLinks(alternatesKey ? (JSON.parse(alternatesKey) as Array<{ hrefLang: string; path: string }>) : []);

    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);

    clearManagedJsonLd();
    // Always emit a WebPage node that ties this URL into the brand graph
    // (organization carries Mockset/MockSetu alternateNames declared in index.html).
    if (!noindex) {
      appendJsonLd(buildWebPageJsonLd(url, title, description, lang));
    }
    if (jsonLdKey) {
      // Read back from the serialized key rather than the prop, so the effect
      // depends on exactly the value it uses and can never inject a payload
      // from a stale closure.
      const parsed = JSON.parse(jsonLdKey) as Record<string, unknown> | Record<string, unknown>[];
      const payloads = Array.isArray(parsed) ? parsed : [parsed];
      payloads.forEach(appendJsonLd);
    }

    return () => {
      clearManagedJsonLd();
      // Alternates are page-specific in a way most head tags aren't — a page
      // WITHOUT alternates must not inherit the previous page's hreflang set.
      setAlternateLinks([]);
      // Most pages are English; a Hindi page unmounting must hand back the
      // default rather than leave hi-IN on, say, the exam simulator.
      document.documentElement.setAttribute("lang", "en-IN");
      // Same reasoning as lang: most routes are "website", and an article
      // unmounting must not leave its og:type on whatever renders next.
      upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
      removeMeta('meta[property="article:published_time"]');
      removeMeta('meta[property="article:modified_time"]');
    };
  }, [title, description, path, keywords, ogImage, noindex, jsonLdKey, lang, alternatesKey,
      ogType, publishedTime, modifiedTime]);

  return null;
};

export default SEO;
