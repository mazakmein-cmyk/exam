/**
 * creatorCopy.ts — every string on /for-creators, in English and Hindi.
 *
 * Same contract as homeCopy.ts: /hindi/for-creators is a separate indexable
 * URL for Hindi queries ("ऑनलाइन टेस्ट कैसे बनाएं", "मॉक टेस्ट प्लेटफॉर्म"),
 * not a UI toggle. One component tree, two copy tables.
 *
 * Audience note: the Hindi here addresses a coaching-institute owner or
 * teacher, so it stays respectful (आप-form) and keeps the technical nouns
 * this reader already uses in English — PDF, CBT, analytics, live exam — the
 * way they are actually spoken in a Hindi-medium coaching staff room.
 */

export type CreatorAct = {
    eyebrow: string;
    title: string;
    copy: string;
    cta: { label: string; to: string };
};

/**
 * One row of the keyword-bearing capability band directly under the hero.
 *
 * The hero headline ("Stop sharing PDFs. Start giving exams.") is a hook, not a
 * query — it converts a reader who is already here and tells a search engine
 * nothing. This band is the page's first H2 and carries the terms the pillar
 * has to own, each row linking down to the spoke that covers it in full.
 */
export type CreatorFeature = {
    title: string;
    desc: string;
    /** Site-relative. MUST resolve — a dead link here is a soft 404 on the pillar. */
    to: string;
    linkLabel: string;
};

/** One Q/A pair, rendered on the page and emitted as the page's single FAQPage node. */
export type CreatorFaq = { question: string; answer: string };

export type CreatorJourneyCopy = {
    sectionLabel: string;
    headingA: string;
    headingAccent: string;
    sectionAria: string;
    goToAct: (eyebrow: string) => string;
    acts: CreatorAct[];
};

export type CreatorPageCopy = {
    heroBadge: string;
    heroTitleA: string;
    heroTitleB: string;
    heroSub: string;
    heroSubStrong: string;
    heroSubTail: string;
    ctaPrimary: string;
    ctaSecondary: string;
    stats: Array<{ value: string; label: string }>;
    problemLabel: string;
    problemTitle: string;
    problemSub: string;
    painPoints: Array<{ title: string; desc: string }>;
    comparisonLabel: string;
    comparisonTitleA: string;
    comparisonTitleAccent: string;
    comparisonTitleB: string;
    comparisonFeature: string;
    comparisonPdf: string;
    comparisonRows: string[];
    featureLabel: string;
    featureTitle: string;
    featureLede: string;
    features: CreatorFeature[];
    guidesLabel: string;
    guidesTitle: string;
    guidesLede: string;
    /** Localised name for the ItemList JSON-LD node wrapping the guides. */
    guidesName: string;
    guidesAll: string;
    faqLabel: string;
    faqTitle: string;
    /**
     * The page's FAQ. This array is the SINGLE source of the FAQPage JSON-LD —
     * never add a second FAQPage node anywhere on this route, since two
     * competing nodes on one URL means neither is trusted.
     */
    faqs: CreatorFaq[];
    trust: Array<{ title: string; desc: string }>;
    finalTitleA: string;
    finalTitleAccent: string;
    finalSub: string;
    finalCta: string;
    finalSecondary: string;
    finalFinePrint: string;
    navLabel: string;
    journey: CreatorJourneyCopy;
};
