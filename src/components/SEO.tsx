import { useEffect } from "react";

type SEOProps = {
  title: string;
  description: string;
  path: string;
  keywords?: string;
  ogImage?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const SITE_URL = "https://mocksetu.in";
const DEFAULT_OG_IMAGE = `${SITE_URL}/mocksetu-logo.png`;
const MANAGED_TAG_ATTR = "data-mocksetu-seo";

/**
 * Brand-alternate keyword tail appended to every page's <meta name="keywords">.
 * This reinforces "mockset" (a common misspelling / alternate query of MockSetu)
 * as a brand synonym across the entire site without polluting page-specific copy.
 * Pages can still pass their own topical keywords via the `keywords` prop.
 */
const BRAND_KEYWORD_TAIL =
  "MockSetu, Mockset, mockset, mock setu, mockset app, mockset login, mockset mock test, mockset exam simulator";

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
 * WebPage JSON-LD with isPartOf -> #website and about -> #organization (which
 * carries the MockSetu / Mockset alternateName chain). Appended on every page
 * so search engines see a consistent brand-disambiguation signal on every URL.
 */
const buildWebPageJsonLd = (url: string, title: string, description: string) => ({
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${url}#webpage`,
  url,
  name: title,
  description,
  inLanguage: "en-IN",
  isPartOf: { "@id": "https://mocksetu.in/#website" },
  about: { "@id": "https://mocksetu.in/#organization" },
  primaryImageOfPage: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE },
});

const mergeKeywords = (pageKeywords?: string) => {
  if (!pageKeywords) return BRAND_KEYWORD_TAIL;
  // De-dupe naively against the brand tail to avoid stuffing the same token twice.
  const lower = pageKeywords.toLowerCase();
  if (lower.includes("mockset") && lower.includes("mocksetu")) return pageKeywords;
  return `${pageKeywords}, ${BRAND_KEYWORD_TAIL}`;
};

const SEO = ({ title, description, path, keywords, ogImage, noindex, jsonLd }: SEOProps) => {
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

  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    const image = ogImage || DEFAULT_OG_IMAGE;

    document.title = title;

    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[name="keywords"]', "name", "keywords", mergeKeywords(keywords));

    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    );

    upsertLink("canonical", url);

    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:image"]', "property", "og:image", image);

    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);

    clearManagedJsonLd();
    // Always emit a WebPage node that ties this URL into the brand graph
    // (organization carries Mockset/MockSetu alternateNames declared in index.html).
    if (!noindex) {
      appendJsonLd(buildWebPageJsonLd(url, title, description));
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
    };
  }, [title, description, path, keywords, ogImage, noindex, jsonLdKey]);

  return null;
};

export default SEO;
