/**
 * homeCopy.ts — every human-readable string on the student home page, in
 * English and Hindi, as one typed table per component.
 *
 * The Hindi landing page (/hindi) is a separate URL for SEO — "फ्री मॉक टेस्ट"
 * and "पिछले वर्ष के प्रश्न पत्र" are queries the English page can never win —
 * NOT a UI language toggle. Both pages render the same components with the
 * same logic; only this table changes hands, so the two can never drift
 * behaviourally.
 *
 * Conventions: brand ("MockSetu"), exam names ("SSC MTS"), and interface
 * proper nouns students meet in the real English CBT ("Save & Next" stays
 * translated here because SSC's own CBT is bilingual) follow common coaching
 * usage — Hinglish where aspirants actually speak Hinglish, shuddh Hindi
 * nowhere it would read like a government circular.
 */

export type HeroCopy = {
    forLabel: string;
    h1a: string;
    h1b: string;
    subA: string;
    subB: string;
    searchPlaceholder: string;
    searchAria: string;
    pyqBadge: string;
    start: string;
    browseFull: string;
    noMatchLead: string;
    noMatchBrowse: string;
    chipsQuestion: string;
    more: string;
    ctaTitle: string;
    browseCategory: (category: string) => string;
    browseLibrary: string;
    trustLine: string;
};

export type CycleCopy = {
    eyebrow: string;
    titleMts: string;
    titleGeneric: string;
    titleCategory: (category: string) => string;
    mtsBadge: string;
    opensIn: string;
    calendarNote: string;
    openNowTitleA: string;
    openNowTitleB: string;
    openNowNote: string;
    closedTitle: string;
    closedNote: string;
    cycleLink: string;
    countdown: { days: string; hrs: string; min: string; sec: string };
    shelfEyebrow: string;
    shelfTitle: (category: string) => string;
    shelfNote: string;
    shelfButton: (category: string) => string;
    resumeEyebrow: string;
    resumeNote: (category: string | null) => string;
    resumeButton: string;
    firstEyebrow: string;
    firstTitle: string;
    firstNote: string;
    firstLink: string;
};

export type PapersCopy = {
    eyebrowPyq: string;
    eyebrowFresh: string;
    titlePyq: (scope: string) => string;
    titleMock: (scope: string) => string;
    scopeAll: string;
    subtitlePyq: string;
    subtitleFallback: (category: string) => string;
    subtitleAll: string;
    practiceAsMock: string;
    viewAll: (category: string | null) => string;
};

export type CbtCopy = {
    eyebrow: string;
    title: string;
    subtitle: string;
    demoTitle: string;
    questionOf: (n: number, total: number) => string;
    optionsAria: string;
    markForReview: string;
    marked: string;
    saveNext: string;
    palette: string;
    goToQuestion: (n: number) => string;
    legendAnswered: string;
    legendMarked: string;
    legendVisited: string;
    legendNotVisited: string;
    answeredSuffix: string;
    cta: string;
    questions: Array<{ text: string; options: string[] }>;
};

export type UpdatesCopy = {
    eyebrow: string;
    titleGeneric: string;
    titleCategory: (category: string) => string;
    minRead: (minutes: number) => string;
    pillarLink: string;
    allGuides: string;
};

export type HomeCopy = {
    hero: HeroCopy;
    cycle: CycleCopy;
    papers: PapersCopy;
    cbt: CbtCopy;
    updates: UpdatesCopy;
};
