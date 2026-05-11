export type BlogParagraph = { type: "p"; text: string };
export type BlogHeading = { type: "h2"; text: string };
export type BlogList = { type: "ul"; items: string[] };
export type BlogQuote = { type: "quote"; text: string };
export type BlogBlock = BlogParagraph | BlogHeading | BlogList | BlogQuote;

export type BlogPost = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  category: "Exam Strategy" | "Study Plans" | "Mock Test Guide";
  tags: string[];
  hero: { eyebrow: string; h1: string; lede: string };
  content: BlogBlock[];
  faqs: { question: string; answer: string }[];
};

export const BLOG_POSTS: Record<string, BlogPost> = {
  "how-to-take-mock-tests": {
    slug: "how-to-take-mock-tests",
    title: "How to Take Mock Tests the Right Way (and Actually Improve)",
    metaTitle: "How to Take Mock Tests the Right Way — Complete Guide | MockSetu",
    metaDescription:
      "Stop wasting mock tests. The complete guide to taking JEE, NEET, CAT, GATE, and UPSC mock tests — when to start, how often, and the post-mock review system that actually improves your score.",
    keywords:
      "how to take mock tests, mock test strategy, mock test review, mock test analysis, JEE mock test strategy, NEET mock test plan, CAT mock test review",
    excerpt:
      "Most students take mocks wrong. They attempt 30 mocks, score the same, and blame the questions. Here is the system that actually moves your score — used by top JEE, NEET, CAT, GATE, and UPSC selects.",
    publishedAt: "2026-05-10",
    updatedAt: "2026-05-12",
    readingMinutes: 9,
    category: "Mock Test Guide",
    tags: ["mock tests", "exam strategy", "study plan", "JEE", "NEET", "CAT", "GATE", "UPSC"],
    hero: {
      eyebrow: "Mock Test Guide",
      h1: "How to Take Mock Tests the Right Way (and Actually Improve)",
      lede:
        "Most students take mocks wrong. They attempt 30 mocks, score the same as their first, and blame the question quality. Here is the system that actually moves your score — used by top JEE, NEET, CAT, GATE, and UPSC selects.",
    },
    content: [
      {
        type: "p",
        text: "Every serious aspirant takes mock tests. Very few take them in a way that actually moves the needle. The student who scores 240 on their first JEE Main mock and 240 on their fortieth is not unlucky — they're just running the wrong loop. What follows is the loop that works, distilled from interviews with All India Rank holders and ten years of pattern recognition.",
      },
      { type: "h2", text: "Rule 1: A mock test is not a study session" },
      {
        type: "p",
        text: "The single biggest mistake aspirants make is treating a mock as 'today's practice'. A mock is a measurement instrument. You wouldn't fix a thermometer mid-reading. Don't pause a mock to look up a formula, don't skip a section to come back later, and never extend the time. The score you produce under exact exam conditions is the only score that's diagnostic. Everything else is self-deception.",
      },
      { type: "h2", text: "Rule 2: Match the mock to the real exam slot" },
      {
        type: "p",
        text: "If your real JEE Main is in the 9 AM shift, take every mock at 9 AM. If your CAT is in the afternoon, take mocks at 2:30 PM. Mental performance varies by 15–25% across the day for most people, and exam-day morning fog or afternoon dip will hit you regardless of how prepared you are. The fix is conditioning — not caffeine.",
      },
      { type: "h2", text: "Rule 3: The 90-minute post-mock review is non-negotiable" },
      {
        type: "p",
        text: "The mock is the input. The review is the upgrade. After every full-length mock, block exactly 90 minutes within the next 24 hours and split your time into three categories:",
      },
      {
        type: "ul",
        items: [
          "Questions you got wrong AND knew were hard — 30 minutes. These are skill gaps. Note the chapter, mark it for spaced revision.",
          "Questions you got wrong but thought you'd nailed — 30 minutes. These are silent killers. Either a concept misunderstanding or a careless habit. Both compound across exams.",
          "Questions you got right by guessing or close-elimination — 30 minutes. These are unstable. They will fail you under pressure. Treat them as if you got them wrong.",
        ],
      },
      { type: "h2", text: "Rule 4: Stop chasing mock count. Track mock quality." },
      {
        type: "p",
        text: "Forty mocks reviewed properly beats one hundred mocks treated as score-generation factories. A common pattern in students who plateau: they take three mocks per week, glance at the score, file it away, and start the next one the same day. Reviewing one mock deeply is more valuable than attempting two superficially. If you can't review it, don't take it.",
      },
      { type: "h2", text: "Rule 5: Build a 'silly mistake log' from week one" },
      {
        type: "p",
        text: "Every wrong answer falls into one of three buckets: didn't know, knew but applied wrong, and knew + applied right but ticked wrong on OMR / clicked wrong on screen. The third bucket — silly mistakes — costs the average serious aspirant 20–40 marks per real exam. The only way to kill them is to log them, by name, every time. After ten mocks you'll see your top three repeat offenders. Those are what you fix.",
      },
      {
        type: "quote",
        text: "Toppers don't take more mocks. They take fewer mocks and listen harder to what each mock is telling them.",
      },
      { type: "h2", text: "Rule 6: Don't compare mock score with friends" },
      {
        type: "p",
        text: "Two aspirants who score 200 on the same mock might have completely different journeys to that score. Comparing peer scores is a distraction that adds anxiety without adding information. Compare your mock with your previous mock. Compare your section accuracy with your section accuracy. Compare your time-per-question with your time-per-question. Everything else is noise.",
      },
      { type: "h2", text: "Rule 7: Peak by tapering" },
      {
        type: "p",
        text: "In the last 7 days before the real exam, take only one or two light mocks. Most aspirants burn out by over-mocking the final week. Treat the last week like an athlete tapers before a race: less volume, more sleep, structured revision of your weak chapters identified across the mock cycle. The exam is decided by what you've already built, not by what you cram in the final 96 hours.",
      },
      { type: "h2", text: "How many mocks should you actually take?" },
      {
        type: "p",
        text: "Approximate ranges from top-rank holders across exams: JEE Main — 25 to 40 full-length mocks. NEET — 30 to 50. CAT — 25 to 40 (plus 20+ sectional). GATE — 15 to 25 (plus 40+ subject-wise). UPSC Prelims — 30 to 50 GS + 10 to 15 CSAT. If you're below the lower bound, take more. Above the upper bound, focus on review depth, not raw count.",
      },
      { type: "h2", text: "Where MockSetu fits" },
      {
        type: "p",
        text: "MockSetu was built so that mock-test access is never the bottleneck. Every mock — JEE, NEET, CAT, GATE, UPSC — is free with unlimited attempts. The exam interface mirrors the actual NTA / IIT / UPSC portal. Post-mock analytics show your accuracy by chapter, your time-per-question trend, and your percentile movement across attempts. The hard part isn't taking mocks. The hard part is taking them the right way — which is what this article was about.",
      },
    ],
    faqs: [
      {
        question: "When should I start taking mock tests?",
        answer:
          "Start at least 6 months before your exam. For exams with a syllabus you've already finished one revision of, you can start full-length mocks immediately. If syllabus completion is still in progress, start with chapter-wise / sectional mocks and graduate to full-length 3–4 months out.",
      },
      {
        question: "How often should I take a mock test?",
        answer:
          "6 months out: 1 mock per fortnight. 3 months out: 1 per week. 1 month out: 2 per week, always in the same shift slot as the real exam. The week of the exam: 1–2 light mocks max — taper for peak performance.",
      },
      {
        question: "Is taking the same mock twice useful?",
        answer:
          "Generally no — your second attempt gets contaminated by memory. The exception is sectional mocks under heavy time pressure, where re-attempting after 4–6 weeks can confirm whether your underlying skill improved or you'd just memorised the answer.",
      },
    ],
  },

  "jee-main-vs-jee-advanced": {
    slug: "jee-main-vs-jee-advanced",
    title: "JEE Main vs JEE Advanced — What's the Real Difference (2026)",
    metaTitle: "JEE Main vs JEE Advanced — Complete Comparison 2026 | MockSetu",
    metaDescription:
      "JEE Main vs JEE Advanced compared in full: exam pattern, syllabus, difficulty, marking, eligibility, and how to prepare. Includes 2026 dates and what changes between the two papers.",
    keywords:
      "JEE Main vs JEE Advanced, JEE Main vs Advanced difference, JEE Advanced syllabus, JEE Advanced 2026, JEE Main 2026, JEE Advanced eligibility, JEE comparison",
    excerpt:
      "JEE Main gets you into NITs and IIITs. JEE Advanced gets you into IITs. Same syllabus, completely different exams. Here's the full comparison — pattern, difficulty, prep strategy.",
    publishedAt: "2026-05-08",
    updatedAt: "2026-05-12",
    readingMinutes: 8,
    category: "Exam Strategy",
    tags: ["JEE Main", "JEE Advanced", "exam comparison", "IIT", "NIT"],
    hero: {
      eyebrow: "Exam Strategy",
      h1: "JEE Main vs JEE Advanced — What's the Real Difference (2026)",
      lede:
        "JEE Main gets you into NITs, IIITs, and central institutions. JEE Advanced is the only entry into IIT. Same syllabus, two completely different exams. Here's what every 2026 aspirant needs to know.",
    },
    content: [
      {
        type: "p",
        text: "Most students treat JEE Main and JEE Advanced as the same exam separated by a few weeks. They're not. The syllabus overlaps by ~90%, but the question-style, marking scheme, difficulty curve, and even the right preparation strategy are different enough that conflating them costs marks. This article breaks down exactly where they diverge and what that means for your study plan.",
      },
      { type: "h2", text: "Who conducts what" },
      {
        type: "p",
        text: "JEE Main is conducted twice a year by the National Testing Agency (NTA) — typically January and April. Your better attempt counts. JEE Advanced is conducted once a year by one of the seven zonal IITs on rotation, usually three to four weeks after JEE Main results. To appear for JEE Advanced, you must be among the top ~2.5 lakh JEE Main qualifiers.",
      },
      { type: "h2", text: "Exam pattern — the surface difference" },
      {
        type: "p",
        text: "JEE Main has a fixed pattern: 90 questions (75 to be attempted, 25 per subject), 3 hours, 300 marks. Section A is MCQ with +4 / −1. Section B is numerical answer type with no negative marking. Three subjects: Physics, Chemistry, Mathematics.",
      },
      {
        type: "p",
        text: "JEE Advanced has no fixed pattern. The conducting IIT changes the structure every year. Two papers (Paper 1 + Paper 2), three hours each, both compulsory on the same day. Each paper has unpredictable question types: single-correct MCQs, multiple-correct MCQs, integer answers, matrix-match, paragraph-based comprehensions. Marking schemes vary across question types in the same paper.",
      },
      { type: "h2", text: "Difficulty — the real difference" },
      {
        type: "p",
        text: "JEE Main rewards speed and accuracy on well-defined concepts. The math is standard, the physics is direct, and most chemistry is fact-recall. A well-prepared student can solve 70% of JEE Main on first reading. JEE Advanced rewards depth, multi-concept integration, and the ability to stay calm with a question that takes 15 minutes. A well-prepared student might be unsure about 50% of JEE Advanced even after first reading. The exam is designed to filter the top 1% of an already filtered pool.",
      },
      { type: "h2", text: "Marking scheme variations in Advanced" },
      {
        type: "p",
        text: "JEE Advanced uses ruthless and creative marking schemes. A 'multiple correct answers' question might give you +4 only if you mark all correct options, with partial marking like +1 for each correct option ticked and 0 for missing one. Some sections allow no partial credit at all. The exact scheme is announced on the day of the exam. JEE Main marking is predictable: +4 or −1. Advanced marking demands strategic risk assessment, which is itself a learned skill.",
      },
      { type: "h2", text: "What this means for preparation" },
      {
        type: "ul",
        items: [
          "If you're targeting NITs: laser-focus on JEE Main practice. Speed + accuracy + standard concept coverage.",
          "If you're targeting IITs: clear JEE Main with a comfortable margin (top 2 lakh), then immediately switch to deeper, integrated problem-solving for Advanced.",
          "Don't try to prepare for Advanced first and 'auto-clear' Main. Many top Advanced rankers under-perform in Main because Main's speed-test nature is its own skill.",
          "Take mocks for both — separately. JEE Main mocks build pacing. JEE Advanced mocks build endurance and pattern flexibility.",
          "From January–March: balance both prep tracks. April–May: lean heavily Main. June: full pivot to Advanced after Main result.",
        ],
      },
      { type: "h2", text: "Mock test strategy for both" },
      {
        type: "p",
        text: "For JEE Main: take 25–40 full-length mocks. Track time-per-question and section-wise accuracy. For JEE Advanced: take 10–15 dual-paper (P1 + P2 on the same day) mocks. The single biggest skill JEE Advanced demands is mental stamina across six hours of testing, which only same-day Paper-1-plus-Paper-2 mocks can build.",
      },
      {
        type: "quote",
        text: "JEE Main tests if you've prepared for JEE. JEE Advanced tests if you've prepared to be an engineer.",
      },
      { type: "h2", text: "Eligibility quick reference" },
      {
        type: "ul",
        items: [
          "JEE Main: passed Class 12 or appearing. No age limit (since 2017). 3 attempts allowed (across consecutive years' Jan + April sessions).",
          "JEE Advanced: must be in top ~2,50,000 JEE Main qualifiers. Maximum 2 attempts in consecutive years. Class 12 in the current or previous year only. Age limit ~25 years (relaxations for reserved categories).",
        ],
      },
      { type: "h2", text: "The bottom line" },
      {
        type: "p",
        text: "JEE Main and Advanced are not 'easy version' and 'hard version' of the same exam. They are two different exams that happen to share a syllabus. Treat them with separate strategies, separate mock pipelines, and separate timing rituals. Most students who clear Advanced will tell you the pivot from Main-prep to Advanced-prep — done in the 4 weeks after Main result — is what determined their AIR.",
      },
    ],
    faqs: [
      {
        question: "Is JEE Advanced syllabus the same as JEE Main?",
        answer:
          "Roughly 90% overlap. JEE Advanced excludes a few topics (e.g., Semiconductors, Communication Systems, Electronic Devices) and includes a few extras at deeper levels. Always check the latest year's official syllabus PDF from the conducting IIT.",
      },
      {
        question: "Can I clear JEE Advanced without coaching?",
        answer:
          "Yes, but it's significantly harder. Self-prep candidates clear Advanced regularly, especially those with strong school physics/math fundamentals plus disciplined mock-test practice. The mock-test loop matters more than the coaching brand.",
      },
      {
        question: "How many attempts do I get?",
        answer:
          "JEE Main: 3 attempts across consecutive years (counting Jan + April as separate). JEE Advanced: 2 attempts maximum, in consecutive years.",
      },
    ],
  },

  "best-mock-test-strategy-for-cat": {
    slug: "best-mock-test-strategy-for-cat",
    title: "The CAT Mock Test Strategy That Builds 99+ Percentile",
    metaTitle: "CAT Mock Test Strategy 2026 — How 99+ Percentilers Practise | MockSetu",
    metaDescription:
      "The CAT mock test strategy 99+ percentilers actually follow. How many mocks, when to start, sectional vs full-length, post-mock analysis, and the percentile plateau fix.",
    keywords:
      "CAT mock test strategy, CAT 99 percentile strategy, CAT mock test plan, how many CAT mocks, CAT mock analysis, CAT sectional mocks, CAT 2026 strategy",
    excerpt:
      "Most CAT aspirants take 20 mocks and stall at 85 percentile. The students who break into 99+ aren't smarter — they run a different mock-test loop. Here's the exact playbook.",
    publishedAt: "2026-05-05",
    updatedAt: "2026-05-12",
    readingMinutes: 10,
    category: "Study Plans",
    tags: ["CAT", "MBA", "mock test strategy", "IIM", "percentile"],
    hero: {
      eyebrow: "Study Plans",
      h1: "The CAT Mock Test Strategy That Builds 99+ Percentile",
      lede:
        "Most CAT aspirants take 20 mocks and plateau at 85 percentile. The ones who break into 99+ aren't smarter — they run a different mock-test loop. Here is that loop.",
    },
    content: [
      {
        type: "p",
        text: "CAT is a percentile exam. Your raw score is irrelevant — only your rank against 3 lakh other aspirants matters. That single fact changes how you should be preparing. Most CAT preparation guides talk about the syllabus. The syllabus is a footnote. The exam is decided by mock-test discipline, and specifically by what you do in the 90 minutes after each mock.",
      },
      { type: "h2", text: "When to start taking CAT mocks" },
      {
        type: "p",
        text: "If your CAT is in November, start full-length mocks in July at the latest. Aspirants who delay full mocks until October because 'I haven't finished the syllabus yet' are almost always the same aspirants who plateau at 85 percentile. Take the mock with a half-prepared syllabus — the mock itself will tell you which chapters need urgent attention. Waiting for syllabus completion is a procrastination disguised as strategy.",
      },
      { type: "h2", text: "Mock frequency by month" },
      {
        type: "ul",
        items: [
          "July–August: 1 full-length mock per fortnight. Goal — get used to the 40-minute sectional lock and the calculator/scratchpad UI.",
          "September: 1 mock per week. Goal — build a baseline sectional accuracy of 65–70%.",
          "October: 2 mocks per week. Goal — push sectional percentile, identify your weakest section.",
          "November (the month of CAT): 3 mocks per week, all in the same time slot as your CAT shift. Goal — peak.",
          "Final week: only 1–2 light mocks. Rest matters more than reps in the final 7 days.",
        ],
      },
      { type: "h2", text: "The sectional vs full-length question" },
      {
        type: "p",
        text: "Sectional mocks (40 min, single section) are where you build skill. Full-length mocks (2 hours, all three sections) are where you build performance. You need both. A reasonable split for a typical aspirant is 3 sectionals per full-length. If you're weak in VARC, do 5 VARC sectionals per full-length until your sectional percentile crosses 90. Then re-balance.",
      },
      { type: "h2", text: "The post-mock review loop that builds 99+" },
      {
        type: "p",
        text: "After every full-length CAT mock, block 90 minutes for review. Split the time as follows. The first 30 minutes goes to questions you skipped. For each one, ask: was it actually un-solvable, or did I panic-skip? Most aspirants discover that 30–40% of their skipped questions were solvable, and that finding alone can move them 5 percentile points within four mocks.",
      },
      {
        type: "p",
        text: "The next 30 minutes goes to questions you got wrong. For each one, write down a single sentence: 'I got this wrong because…' If your explanation is 'silly mistake' more than once per mock, your real problem isn't concepts — it's pacing. Slow down on questions you're confident about. Speed up on questions you have no idea about.",
      },
      {
        type: "p",
        text: "The final 30 minutes goes to questions you got right by guessing or by close-elimination between two options. These are unstable wins. Re-solve them properly. If you couldn't solve them under exam pressure, treat them as wrongs.",
      },
      { type: "h2", text: "Why most aspirants plateau at 85 percentile" },
      {
        type: "p",
        text: "The 85-percentile plateau is real and explainable. Aspirants who plateau there share three traits: they take mocks without sectional locks (or 'extend' the timer), they don't write down their thinking during review, and they comfort-attempt familiar question types instead of stretching toward unfamiliar ones. Fix any one of these three and you typically jump 4–6 percentile points within five mocks.",
      },
      {
        type: "quote",
        text: "CAT doesn't reward who solved the most questions. It rewards who left the right questions unsolved.",
      },
      { type: "h2", text: "Section-by-section strategy in brief" },
      {
        type: "ul",
        items: [
          "VARC: Read 4 long passages in 28–30 minutes. Use the remaining 10 minutes for non-RC questions. Skip nothing in non-RC. RC accuracy > RC quantity.",
          "DILR: Pick 2 out of the 4 sets within the first 6 minutes. Commit to your picks. Doing 2 sets at 95% accuracy beats doing 4 sets at 60%.",
          "QA: Attempt 22 questions in 40 minutes. Most questions are arithmetic and algebra. If you find yourself spending more than 90 seconds on a question, skip and revisit. Re-visit pile should be ~5–6 questions.",
        ],
      },
      { type: "h2", text: "Where MockSetu fits into your CAT prep" },
      {
        type: "p",
        text: "MockSetu's CAT mock test is free, full-length, and has the official 40-minute sectional auto-lock, on-screen calculator, and scratchpad. After every mock you get a sectional + overall percentile estimate, so your improvement curve is measurable rather than vibes-based. The discipline this article describes only works if you can take unlimited mocks without paywalls — that's the gap MockSetu fills.",
      },
    ],
    faqs: [
      {
        question: "How many CAT mocks should I take?",
        answer:
          "Aspirants targeting 99+ percentile typically take 25–40 full-length CAT mocks plus 60+ sectional mocks across 5 months. Below 20 full-length mocks is risky. Above 50 with weak review is wasted effort.",
      },
      {
        question: "Is the first CAT mock score a good predictor of my final percentile?",
        answer:
          "No. The first mock is a baseline, not a forecast. Most 99+ percentilers had a first-mock score of 60–80 percentile. What predicts the final percentile is the slope of your mock score graph across attempts 3 to 15.",
      },
      {
        question: "Should I take mocks from multiple platforms?",
        answer:
          "One core platform with consistent percentile benchmarking is more useful than rotating across five platforms with inconsistent difficulty. Use one for full-length mocks and at most one secondary for sectional variety.",
      },
    ],
  },
};

export const BLOG_SLUGS = Object.keys(BLOG_POSTS);
export const BLOG_LIST = BLOG_SLUGS.map((s) => BLOG_POSTS[s]);
