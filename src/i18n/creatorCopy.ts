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
