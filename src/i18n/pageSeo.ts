/**
 * pageSeo.ts — head metadata and hreflang wiring for the bilingual page pairs.
 *
 * `/` ↔ `/hindi` and `/for-creators` ↔ `/hindi/for-creators` are separate
 * indexable URLs rather than a language toggle, bound only by bidirectional
 * hreflang. That makes the alternate sets below load-bearing: if either side
 * stops listing both URLs, Google treats the pairing as unconfirmed and may
 * index just one of them.
 *
 * These moved out of the page components for the same reason the other page
 * metadata did — scripts/prerender.mjs needs them at build time to write the
 * static <head>, and it cannot read a value out of a TSX literal. Crucially it
 * needs the ALTERNATES too: every other prerendered route has its inherited
 * hreflang stripped, and these four are the only ones that must instead emit a
 * correct set. One copy, consumed by both the component and the prerenderer.
 */

export type HomeLang = "en" | "hi";

/** Both languages' URLs, declared once — the hreflang set and the routes agree. */
export const HOME_PATHS: Record<HomeLang, string> = { en: "/", hi: "/hindi" };

/**
 * hreflang must be BIDIRECTIONAL and self-referential: each page lists both
 * URLs including itself, or Google treats the pair as unconfirmed and may
 * index only one. x-default points at English — the right landing for a
 * reader whose language we have no signal for.
 */
export const HOME_ALTERNATES = [
  { hrefLang: "en-IN", path: HOME_PATHS.en },
  { hrefLang: "en", path: HOME_PATHS.en },
  { hrefLang: "hi-IN", path: HOME_PATHS.hi },
  { hrefLang: "hi", path: HOME_PATHS.hi },
  { hrefLang: "x-default", path: HOME_PATHS.en },
];

export const HOME_SEO_BY_LANG: Record<
  HomeLang,
  { title: string; description: string; keywords: string; lang: string }
> = {
  en: {
    title: "Free Mock Tests & Previous Year Papers with Answer Keys | MockSetu (Mockset)",
    description:
      "MockSetu (Mockset) — free SSC MTS, SSC CGL, JEE, NEET & CAT mock tests and previous year papers with answer keys. Practice in the real CBT exam interface with a live timer, instant scoring, and deep analytics. SSC MTS September 2026 series is live.",
    keywords:
      "free mock test, previous year papers, SSC MTS mock test, SSC MTS previous year paper, SSC MTS September 2026, answer key, online mock test, exam simulator, CBT practice, SSC CGL mock test, JEE mock test, NEET mock test, live mock test",
    lang: "en-IN",
  },
  hi: {
    // Hindi-first title and description: these are what appear in a Devanagari
    // SERP, so the head terms sit at the front where they get read and clicked.
    title: "फ्री मॉक टेस्ट और पिछले वर्षों के पेपर (उत्तर कुंजी सहित) | MockSetu",
    description:
      "MockSetu पर SSC MTS, SSC CGL, JEE, NEET और CAT के फ्री मॉक टेस्ट और पिछले वर्षों के प्रश्न पत्र — उत्तर कुंजी के साथ। असली CBT परीक्षा इंटरफ़ेस, लाइव टाइमर, तुरंत स्कोर और विस्तृत एनालिटिक्स। SSC MTS सितंबर 2026 सीरीज़ अब लाइव है।",
    keywords:
      "फ्री मॉक टेस्ट, ऑनलाइन मॉक टेस्ट, पिछले वर्ष के प्रश्न पत्र, एसएससी एमटीएस मॉक टेस्ट, एसएससी एमटीएस पिछले वर्ष का पेपर, उत्तर कुंजी, मॉक टेस्ट हिंदी में, एसएससी सीजीएल मॉक टेस्ट, जेईई मॉक टेस्ट, नीट मॉक टेस्ट, परीक्षा सिम्युलेटर, सीबीटी प्रैक्टिस, mock test in hindi, ssc mts mock test hindi",
    lang: "hi-IN",
  },
};

export type CreatorLang = "en" | "hi";

/** Both languages' URLs, declared once — the hreflang set and the routes agree. */
export const CREATOR_PATHS: Record<CreatorLang, string> = {
  en: "/for-creators",
  hi: "/hindi/for-creators",
};

/** Self-referential and bidirectional, or Google ignores the pairing. */
export const CREATOR_ALTERNATES = [
  { hrefLang: "en-IN", path: CREATOR_PATHS.en },
  { hrefLang: "en", path: CREATOR_PATHS.en },
  { hrefLang: "hi-IN", path: CREATOR_PATHS.hi },
  { hrefLang: "hi", path: CREATOR_PATHS.hi },
  { hrefLang: "x-default", path: CREATOR_PATHS.en },
];

export const CREATOR_SEO_BY_LANG: Record<
  CreatorLang,
  { title: string; description: string; keywords: string; lang: string; breadcrumbHome: string; breadcrumbSelf: string }
> = {
  en: {
    title: "For Educators & Creators — Publish Mock Tests Free | MockSetu (Mockset)",
    description:
      "Turn any exam PDF into a full timed online mock test in minutes. MockSetu (Mockset) lets coaching institutes, educators, and creators publish JEE, NEET, CAT, GATE, and UPSC mocks free, with built-in analytics and instant scoring on the leading online assessment platform.",
    keywords:
      "mockset for creators, MockSetu creator, publish mock test on mockset, online test creator, exam authoring platform, mock test for coaching, online assessment platform, test maker, MCQ test creator, exam PDF to online test, live exam platform, coaching institute software",
    lang: "en-IN",
    breadcrumbHome: "Home",
    breadcrumbSelf: "For Educators & Creators",
  },
  hi: {
    title: "शिक्षकों और कोचिंग के लिए — फ्री में मॉक टेस्ट पब्लिश कीजिए | MockSetu",
    description:
      "किसी भी प्रश्न पत्र की PDF को मिनटों में पूरे टाइम्ड ऑनलाइन मॉक टेस्ट में बदलिए। MockSetu पर कोचिंग संस्थान और शिक्षक SSC, JEE, NEET, CAT, GATE और UPSC के मॉक टेस्ट फ्री में पब्लिश कर सकते हैं — बिल्ट-इन एनालिटिक्स, लाइव एग्ज़ाम और तुरंत स्कोरिंग के साथ।",
    keywords:
      "ऑनलाइन टेस्ट कैसे बनाएं, मॉक टेस्ट प्लेटफॉर्म, कोचिंग के लिए ऑनलाइन टेस्ट, पीडीएफ से ऑनलाइन टेस्ट, टेस्ट सीरीज़ कैसे बनाएं, ऑनलाइन परीक्षा सॉफ्टवेयर, शिक्षकों के लिए मॉक टेस्ट, लाइव एग्ज़ाम प्लेटफॉर्म, कोचिंग संस्थान सॉफ्टवेयर, online test kaise banaye, mock test platform hindi",
    lang: "hi-IN",
    breadcrumbHome: "होम",
    breadcrumbSelf: "शिक्षकों और क्रिएटर के लिए",
  },
};
