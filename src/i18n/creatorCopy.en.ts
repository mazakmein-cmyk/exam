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
    problemTitle: "Sound familiar? The WhatsApp-PDF problem",
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
    comparisonTitleA: "PDF vs online mock test: the ",
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
    featureLabel: "What it is",
    featureTitle: "A free online test maker built for Indian exams",
    featureLede:
        "Not a quiz tool with a timer bolted on. The rules your paper actually runs on — sectional clocks, negative marking, a question palette, Hindi and English — are settings, not workarounds.",
    features: [
        {
            title: "Your question paper PDF becomes a computer-based test",
            desc: "Import the paper you already wrote and it comes back as sections and questions you can edit — or snip a question straight off the page when the layout is worth keeping.",
            to: "/blog/convert-pdf-question-paper-to-online-test",
            linkLabel: "How to convert a PDF question paper",
        },
        {
            title: "Negative marking, sectional timing, auto-submit",
            desc: "Marks for right, wrong and unattempted, per question. Partial credit for multi-correct. A clock per section, or one clock shared across two subjects. Section switching locked or open.",
            to: "/blog/how-to-create-an-online-mock-test",
            linkLabel: "How to create an online mock test",
        },
        /**
         * Row three used to describe live classroom exams, which is the
         * product's sharpest differentiator — but it linked to a buyer's
         * checklist, because no guide covering live exams existed yet. Every
         * row in this band has to hand the reader down to a spoke that
         * genuinely proves it, so the row became the bilingual capability,
         * which is equally hard for a general-purpose quiz tool to match and
         * matters more to this audience than it does to most. Live exams are
         * still told on this page by Act 3 of the journey, and this row should
         * go back to them once the live-exam guide is written.
         */
        {
            title: "Hindi and English in one paper, the student chooses",
            desc: "Most government exams are bilingual, so an English-only mock is not really a mock. One paper carries both languages, and the instructions page, the paper table and the question screen all follow the choice.",
            to: "/blog/how-to-create-a-bilingual-hindi-english-online-test",
            linkLabel: "How to build a bilingual paper",
        },
    ],
    guidesLabel: "Guides for educators",
    guidesTitle: "How to set up your first test series",
    guidesLede:
        "Written for the person building the paper, not the person sitting it. No sign-in needed to read any of them.",
    guidesName: "MockSetu Guides for Educators and Coaching Institutes",
    guidesAll: "All guides for educators",
    faqLabel: "Questions educators ask",
    faqTitle: "Before you start",
    faqs: [
        {
            question: "Is MockSetu free for teachers and coaching institutes?",
            answer:
                "Yes. Creating exams, importing questions, publishing, running live classroom exams and reading the analytics are all free, with no card and no trial clock. Papers you publish go into the public library, where any student can attempt them — that visibility is the trade, and it is how students find your institute in the first place.",
        },
        {
            question: "How do I convert my PDF question paper into an online test?",
            answer:
                "Two routes. The one open to everybody: run MockSetu's extraction prompt on your PDF in whichever AI you already use, save the JSON it returns, and upload it — the full walkthrough is on the JSON upload guide. For questions whose layout matters, such as a diagram or a matrix-match, snip them straight out of the PDF as images instead of retyping. There is also an Import from PDF button that runs the extraction for you; that one is switched on per creator on request rather than being open to every account.",
        },
        {
            question: "Can I add negative marking and sectional timing?",
            answer:
                "Yes, and per question rather than per paper. You set marks for a correct answer, a wrong one and an unattempted one, so −1 on Session II and nothing on Session I is a setting, not a compromise. Multi-correct questions can award part marks with the penalty charged once or per wrong option. Each section carries its own clock, two sections can share one pooled clock, section switching can be locked or left open, and the paper auto-submits when time runs out.",
        },
        {
            question: "Can students take the test on a phone, without an account?",
            answer:
                "A published mock test can be started by a guest — no account, no app, just the link, on a phone or a laptop. A live classroom exam is the exception: students sign in once before joining, because the room needs to know who is answering and the leaderboard has to stay attached to a person.",
        },
        {
            question: "Can I run a live test in class with students' phones?",
            answer:
                "Yes. You create a live exam, students join with one code, and the question goes up on the projector while answers stream onto your screen as they lock. You control what the room sees — standings for everyone, only for you, or off entirely, and names hidden if you prefer. Students have a private button to say they are lost, which only you can see. When it ends you get a report with class accuracy, participation, drop-off and the median time spent per question, and a link you can share with it.",
        },
        {
            question: "Can I publish an exam in Hindi and English?",
            answer:
                "Yes. One paper can carry both languages, and the student picks. The instructions page, the paper table and the question screen all render in the language they chose. You can also publish in Hindi only or English only if that is what your batch needs.",
        },
        {
            question: "What analytics do I get, and can I see individual students?",
            answer:
                "You get the shape of the batch, not a file on each student. Section-wise accuracy, time spent per question, and which questions the class as a whole got wrong. Creators see anonymised aggregates — never a student's name, email or identity. Live exams add a session report with participation and pacing on top of that.",
        },
        {
            question: "Who owns the questions I upload, and can I delete them?",
            answer:
                "They stay yours. You can unpublish a paper at any time, which removes it from the library, or delete it outright — and deleting an exam deletes the attempts and responses recorded against it as well. There is no exit fee and nothing is locked behind a plan.",
        },
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
