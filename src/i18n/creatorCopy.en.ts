/**
 * English copy for /for-creators. Own module so the Hindi table can be
 * split into the /hindi/for-creators chunk.
 */
import type { CreatorPageCopy } from "@/i18n/creatorCopy";

/* ─────────────────────────── English ─────────────────────────── */

export const CREATOR_COPY_EN: CreatorPageCopy = {
    heroBadge: "For Educators & Coaching Institutes",
    heroTitleA: "Stop sharing PDFs.",
    heroTitleB: "Start giving exams.",
    heroSub: "Turn any question paper PDF into a ",
    heroSubStrong: "timed, full-length exam simulator",
    heroSubTail: " that your students can take right in their browser. Get performance analytics you never had before.",
    ctaPrimary: "Start Creating Exams",
    ctaSecondary: "See How It Works",
    stats: [
        { value: "2 min", label: "Avg. Upload to Publish" },
        { value: "500+", label: "Exams Created" },
        { value: "10K+", label: "Student Attempts" },
    ],
    problemLabel: "The Problem",
    problemTitle: "Sound familiar?",
    problemSub: "You spend hours crafting the perfect paper. But the delivery kills the experience.",
    painPoints: [
        {
            title: "Manual exam distribution is slow",
            desc: "You create great papers but end up sharing them as PDFs on WhatsApp groups. Students open them in random readers, lose track of time, and never get a real exam feel.",
        },
        {
            title: "Zero visibility into student performance",
            desc: "Once a paper leaves your hands, you have no idea which questions students struggled with, how long they took, or where they need more coaching.",
        },
        {
            title: "No real exam simulation",
            desc: "A PDF is not an exam. There's no timer, no section navigation, no auto-submit — students practice casually instead of under real pressure.",
        },
    ],
    comparisonLabel: "PDF vs MockSetu",
    comparisonTitleA: "The ",
    comparisonTitleAccent: "upgrade",
    comparisonTitleB: " your students deserve.",
    comparisonFeature: "Feature",
    comparisonPdf: "PDF",
    comparisonRows: [
        "Timed exam simulation",
        "Section-wise navigation",
        "Auto-submit on timeout",
        "Instant answer key scoring",
        "Student performance analytics",
        "Question-level time tracking",
        "Mark-for-review / Question palette",
        "Shareable via link",
        "Works on any device",
    ],
    trust: [
        {
            title: "Student Privacy Protected",
            desc: "Creators see anonymised aggregates only — never individual student emails, names, or identifies.",
        },
        {
            title: "Built for Indian Exams",
            desc: "CAT, JEE, NEET, GATE, UPSC — purpose-built interfaces that match the real exam format.",
        },
        {
            title: "No Lock-In",
            desc: "Your content is yours. Download or delete it anytime. No surprise fees, no walled gardens.",
        },
    ],
    finalTitleA: "Your students deserve ",
    finalTitleAccent: "better practice.",
    finalSub:
        "Join the educators who've already upgraded from PDF sharing to real exam simulations. Your first exam takes less than 5 minutes.",
    finalCta: "Create Your First Exam",
    finalSecondary: "Student Experience",
    finalFinePrint: "No credit card · No downloads · Ready in 2 minutes",
    navLabel: "Student Home",
    journey: {
        sectionLabel: "One paper's journey",
        headingA: "Follow your paper from ",
        headingAccent: "PDF to phenomenon",
        sectionAria: "How MockSetu works for creators",
        goToAct: (eyebrow) => `Go to ${eyebrow}`,
        acts: [
            {
                eyebrow: "Act 1 · Import",
                title: "Any PDF becomes a question bank.",
                copy: "Drop the paper you already wrote. The MockSetu core reads it — questions, options, images — and hands back a clean, structured, fully editable database. Minutes, not evenings.",
                cta: { label: "Start with your first PDF", to: "/auth" },
            },
            {
                eyebrow: "Act 2 · Build",
                title: "Sections, timers, negative marking — switched on, not coded.",
                copy: "Slot questions into sections. Flip a switch for per-section timers, another for negative marking. Every rule of the real exam, one toggle away.",
                cta: { label: "See the exam builder", to: "/auth" },
            },
            {
                eyebrow: "Act 3 · Go Live",
                title: "Or run it live — the whole class, one room.",
                copy: "Put the question on the projector; students join from their phones with one code. Answers stream onto your screen the second they're locked, and the leaderboard reshuffles in real time. A test becomes an event.",
                cta: { label: "Host a live exam", to: "/auth" },
            },
            {
                eyebrow: "Act 4 · Understand",
                title: "Watch the class think.",
                copy: "When the room closes, the data stays. Every attempt feeds your dashboard: section-wise accuracy, time per question, where the whole class stumbled. Slide a filter and the picture redraws itself.",
                cta: { label: "Explore the analytics", to: "/auth" },
            },
            {
                eyebrow: "Act 5 · Brand",
                title: "Your name on every exam.",
                copy: "Papers carry your byline and verified badge, on a full-screen exam experience students open from one link. Your brand does the teaching — MockSetu just holds the clock.",
                cta: { label: "Publish under your name", to: "/auth" },
            },
            {
                eyebrow: "Act 6 · Grow",
                title: "Students find you.",
                copy: 'MockSetu\'s exam pages already rank for the searches your students make — "ssc mts previous year paper", "free mock test". Publish to the library and that traffic flows to your papers. No ad budget.',
                cta: { label: "Start creating — it's free", to: "/auth" },
            },
        ],
    },
};
