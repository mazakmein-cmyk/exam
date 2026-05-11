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

const SEO = ({ title, description, path, keywords, ogImage, noindex, jsonLd }: SEOProps) => {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;
    const image = ogImage || DEFAULT_OG_IMAGE;

    document.title = title;

    upsertMeta('meta[name="description"]', "name", "description", description);
    if (keywords) upsertMeta('meta[name="keywords"]', "name", "keywords", keywords);

    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1"
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
    if (jsonLd) {
      const payloads = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      payloads.forEach(appendJsonLd);
    }

    return () => {
      clearManagedJsonLd();
    };
  }, [title, description, path, keywords, ogImage, noindex, jsonLd]);

  return null;
};

export default SEO;
