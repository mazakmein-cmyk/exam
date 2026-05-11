export type ExamFaq = { question: string; answer: string };

export type ExamSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type ExamLanding = {
  slug: string;
  examName: string;
  examShort: string;
  tagline: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  hero: {
    badge: string;
    h1: string;
    intro: string;
    stats: { value: string; label: string }[];
  };
  pattern: {
    heading: string;
    rows: { label: string; value: string }[];
  };
  sections: ExamSection[];
  syllabus: { subject: string; topics: string[] }[];
  whyMockSetu: { title: string; desc: string }[];
  faqs: ExamFaq[];
  related: { slug: string; label: string }[];
};

export const EXAM_LANDING_PAGES: Record<string, ExamLanding> = {
  "jee-main": {
    slug: "jee-main",
    examName: "JEE Main",
    examShort: "JEE Main",
    tagline: "Free JEE Main Mock Test 2026 — Practice in Real NTA Conditions",
    metaTitle: "Free JEE Main Mock Test 2026 — Online Exam Simulator | MockSetu",
    metaDescription:
      "Take free JEE Main mock tests with real NTA exam-day conditions. Timed, full-length online JEE simulator with question palette, mark-for-review, instant scoring & deep analytics.",
    keywords:
      "JEE Main mock test, free JEE Main mock test, JEE Main online mock test, JEE Main 2026 mock test, JEE Main exam simulator, NTA mock test, JEE mock test free, JEE Main practice paper",
    hero: {
      badge: "JEE Main 2026 · 300 Marks · 3 Hours",
      h1: "Free JEE Main Mock Test — Practice in NTA Exam-Day Conditions",
      intro:
        "Crack JEE Main with confidence by practising under the exact same conditions as the real National Testing Agency (NTA) exam. MockSetu's free JEE Main mock test simulator gives you a 3-hour, 300-mark, full-length paper with subject-wise timers, a CAT-style question palette, mark-for-review, and instant analytics that show you where you actually lose marks. No payment, no limits — just disciplined practice.",
      stats: [
        { value: "90", label: "Questions" },
        { value: "3 hrs", label: "Duration" },
        { value: "300", label: "Max Marks" },
      ],
    },
    pattern: {
      heading: "JEE Main 2026 Exam Pattern",
      rows: [
        { label: "Conducting body", value: "National Testing Agency (NTA)" },
        { label: "Mode", value: "Computer-Based Test (CBT)" },
        { label: "Sections", value: "Physics, Chemistry, Mathematics" },
        { label: "Total questions", value: "90 (75 attempted: 25 per subject)" },
        { label: "Section A (MCQ)", value: "20 per subject × 4 marks" },
        { label: "Section B (Numerical)", value: "10 questions per subject, attempt any 5" },
        { label: "Marking scheme", value: "+4 correct, −1 incorrect (Section A), 0 for unattempted in Section B" },
        { label: "Total marks", value: "300" },
        { label: "Duration", value: "3 hours (4 hours for PwD candidates)" },
        { label: "Languages", value: "13 languages including English, Hindi, Tamil, Telugu, Marathi" },
      ],
    },
    sections: [
      {
        heading: "Why JEE Main mock tests matter more than reading theory",
        body:
          "Most JEE aspirants fail not because they don't know the syllabus — they fail because they can't apply it under 3 hours of relentless pressure. Real JEE Main toppers consistently report that mock tests, not textbooks, were what moved their score from 200 to 270+. A serious mock test plan trains four things that no amount of theory can: question-selection instinct, time-per-question pacing, mental stamina across 180 minutes, and the ability to recover after a brutal Physics section. MockSetu's JEE simulator replicates every UI element of the real NTA portal so that on exam day, nothing surprises you.",
      },
      {
        heading: "How to use MockSetu for JEE Main preparation",
        body:
          "Start with one full-length mock per week from September onwards. From January, increase to two per week. From March (one month before the exam), take a full mock every alternate day under strict 9 AM or 3 PM exam-shift conditions. After each attempt, spend 90 minutes reviewing — not just wrong answers, but also the questions you got right but solved slowly. MockSetu's analytics flag both. The students who improve the most are the ones who treat every mock like a real exam, not a practice session.",
        bullets: [
          "Take mocks in the same shift slot as your actual exam shift (9 AM or 3 PM)",
          "Use the question palette to mark-for-review and revisit — exactly like NTA's interface",
          "Review every mock within 24 hours while the mistakes are still fresh",
          "Track your subject-wise score trend across attempts to spot weakening areas early",
          "Never skip a mock to study more theory — mocks ARE the study",
        ],
      },
    ],
    syllabus: [
      {
        subject: "Physics",
        topics: [
          "Mechanics (Kinematics, Laws of Motion, Work-Energy-Power, Rotational Motion)",
          "Thermodynamics & Kinetic Theory of Gases",
          "Electrostatics & Current Electricity",
          "Magnetism & Electromagnetic Induction",
          "Optics (Ray + Wave)",
          "Modern Physics (Atoms, Nuclei, Semiconductors)",
          "Oscillations & Waves",
        ],
      },
      {
        subject: "Chemistry",
        topics: [
          "Physical: Mole concept, Thermodynamics, Equilibrium, Electrochemistry, Chemical Kinetics",
          "Organic: GOC, Hydrocarbons, Alcohols/Phenols/Ethers, Aldehydes/Ketones, Amines, Biomolecules",
          "Inorganic: Periodic table, Chemical bonding, Coordination compounds, d & f block elements",
          "Surface chemistry & Solutions",
        ],
      },
      {
        subject: "Mathematics",
        topics: [
          "Algebra (Quadratic equations, Sequences, Permutations & Combinations, Binomial theorem)",
          "Calculus (Limits, Continuity, Differentiation, Application of Derivatives, Integration)",
          "Coordinate Geometry (Straight lines, Circles, Parabola, Ellipse, Hyperbola)",
          "Trigonometry & Inverse Trigonometric Functions",
          "Vectors & 3D Geometry",
          "Probability & Statistics",
          "Matrices & Determinants",
        ],
      },
    ],
    whyMockSetu: [
      {
        title: "Identical NTA interface",
        desc: "Question palette, colour-coded status, mark-for-review, section switcher — pixel-matched to the real CBT portal.",
      },
      {
        title: "Subject-wise timers",
        desc: "Practice managing Physics, Chemistry, and Maths within strict 60-minute mental budgets instead of just one overall clock.",
      },
      {
        title: "Deep analytics",
        desc: "See your accuracy per chapter, time-per-question trend, and ranks vs. previous attempts — not just a final score.",
      },
      {
        title: "100% free, unlimited attempts",
        desc: "Other platforms gate the good mocks behind paywalls. MockSetu's full JEE Main library is free forever.",
      },
    ],
    faqs: [
      {
        question: "Is the MockSetu JEE Main mock test really free?",
        answer:
          "Yes. Every JEE Main mock test on MockSetu is 100% free with unlimited attempts. There is no paid tier, no card required, and no daily limit.",
      },
      {
        question: "Does the MockSetu JEE simulator match the actual NTA interface?",
        answer:
          "Yes. We replicate the NTA Computer-Based Test interface — including the question palette, colour codes for answered/marked/visited questions, mark-for-review flag, section switcher, and forced-time-up auto-submit.",
      },
      {
        question: "How many JEE Main mock tests should I take before the exam?",
        answer:
          "Top NTA scorers typically take 25–40 full-length JEE Main mock tests in the 4 months before the exam. Start with one mock per week in September, double to two per week from January, and take one every alternate day in March.",
      },
      {
        question: "Will MockSetu show me my JEE Main rank?",
        answer:
          "MockSetu shows your percentile rank compared to other students who have taken the same mock, plus a detailed score breakdown by subject, chapter, and question type. The actual NTA rank only becomes available after the official JEE exam.",
      },
      {
        question: "Can I take a JEE Main mock test on mobile?",
        answer:
          "Yes — MockSetu's JEE simulator works fully on mobile browsers. That said, we strongly recommend taking timed mocks on a laptop or desktop to replicate the real exam-hall environment.",
      },
      {
        question: "Does MockSetu support Section B (numerical answer type) questions?",
        answer:
          "Yes. Both Section A (MCQ) and Section B (numerical answer) are fully supported, with the official NTA scheme of 'attempt any 5 of 10' enforced per subject.",
      },
    ],
    related: [
      { slug: "neet-ug", label: "NEET UG Mock Test" },
      { slug: "cat", label: "CAT Mock Test" },
      { slug: "gate", label: "GATE Mock Test" },
    ],
  },

  "neet-ug": {
    slug: "neet-ug",
    examName: "NEET UG",
    examShort: "NEET",
    tagline: "Free NEET Mock Test 2026 — 180 Questions, 200 Minutes, Real NTA Conditions",
    metaTitle: "Free NEET UG Mock Test 2026 — Online Exam Simulator | MockSetu",
    metaDescription:
      "Free NEET UG mock test with real exam-day conditions. 180-question, 200-minute online simulator for Physics, Chemistry, Botany & Zoology. Instant scoring + deep analytics.",
    keywords:
      "NEET mock test, NEET UG mock test, free NEET mock test, NEET 2026 mock test, NEET online mock test, NEET exam simulator, NEET previous year papers, NEET PYQ mock test",
    hero: {
      badge: "NEET UG 2026 · 720 Marks · 200 Minutes",
      h1: "Free NEET UG Mock Test — Practice the Full 180-Question NTA Pattern",
      intro:
        "MockSetu's free NEET UG mock test simulator runs the complete 180-question, 200-minute paper exactly the way NTA conducts it on exam day. Get Physics, Chemistry, Botany, and Zoology timed together, a CAT-style question palette to flag tough questions, instant +4/−1 scoring, and chapter-wise analytics so you know which topics actually need more rotation. Built for serious NEET aspirants targeting 650+.",
      stats: [
        { value: "180", label: "Questions" },
        { value: "200 min", label: "Duration" },
        { value: "720", label: "Max Marks" },
      ],
    },
    pattern: {
      heading: "NEET UG 2026 Exam Pattern",
      rows: [
        { label: "Conducting body", value: "National Testing Agency (NTA)" },
        { label: "Mode", value: "Offline (OMR-based, pen-and-paper)" },
        { label: "Sections", value: "Physics, Chemistry, Botany, Zoology" },
        { label: "Questions per section", value: "45 (35 in Section A + 10 in Section B, attempt any 10)" },
        { label: "Total questions", value: "180 (200 with optional Section B questions)" },
        { label: "Marking scheme", value: "+4 correct, −1 incorrect, 0 unattempted" },
        { label: "Total marks", value: "720" },
        { label: "Duration", value: "200 minutes (3 hours 20 minutes)" },
        { label: "Languages", value: "13 languages including English, Hindi, Tamil, Telugu, Bengali" },
        { label: "Qualifying threshold", value: "50th percentile (General) for MBBS/BDS counselling" },
      ],
    },
    sections: [
      {
        heading: "Why NEET mock tests decide who clears 650+",
        body:
          "NEET is a marathon of stamina, accuracy, and negative-mark management — not just biology revision. The candidates who score 650+ aren't smarter; they've simply taken 30+ full-length mocks and learnt to spot the 20 questions per section that drain time without yielding marks. MockSetu's NEET simulator forces you to develop that instinct under timed conditions. Practice enough mocks and the real NEET feels like just one more attempt, not the exam your career depends on.",
      },
      {
        heading: "How to use MockSetu for your NEET preparation",
        body:
          "From November onwards, take one full-length NEET mock per week. From February, switch to two per week, and always in the 2 PM slot — the same time NEET is conducted. The single biggest mistake aspirants make is taking mocks when they 'feel ready'. You'll never feel ready. Take them anyway, every week, and let the score graph drive your revision priorities instead of your subjective feelings.",
        bullets: [
          "Always start with Biology (90 questions) — protect your highest-confidence section",
          "Treat the 200-minute clock as 50 min Bio + 50 min Bio + 50 min Chem + 50 min Physics",
          "After every mock, log your top 5 'silly mistake' question types — these decide your final 30 marks",
          "Don't skip Physics in revision — it's the section that separates 600 from 680",
          "Review NCERT lines linked to every wrong question, not your coaching notes",
        ],
      },
    ],
    syllabus: [
      {
        subject: "Physics",
        topics: [
          "Mechanics & Properties of Solids/Liquids",
          "Thermodynamics & Kinetic Theory",
          "Electrostatics, Current Electricity, Magnetism",
          "Electromagnetic Induction & Alternating Current",
          "Ray Optics & Wave Optics",
          "Modern Physics & Electronic Devices",
        ],
      },
      {
        subject: "Chemistry",
        topics: [
          "Physical: Chemical Bonding, Thermodynamics, Equilibrium, Electrochemistry, Solutions",
          "Organic: GOC, Hydrocarbons, Haloalkanes, Alcohols, Aldehydes/Ketones, Amines, Biomolecules, Polymers",
          "Inorganic: Periodic Table, Coordination Compounds, p/d/f-block elements, Metallurgy",
        ],
      },
      {
        subject: "Botany",
        topics: [
          "Diversity in Living World, Plant Kingdom",
          "Morphology & Anatomy of Flowering Plants",
          "Cell Biology, Cell Cycle, Biomolecules",
          "Plant Physiology (Photosynthesis, Respiration, Growth)",
          "Reproduction in Plants",
          "Genetics, Evolution, Ecology",
        ],
      },
      {
        subject: "Zoology",
        topics: [
          "Animal Kingdom & Structural Organisation",
          "Human Physiology (Digestion, Breathing, Circulation, Excretion, Locomotion, Neural, Endocrine)",
          "Human Reproduction & Reproductive Health",
          "Genetics & Heredity, Molecular Basis of Inheritance",
          "Biotechnology Principles & Applications",
          "Biology in Human Welfare",
        ],
      },
    ],
    whyMockSetu: [
      {
        title: "Real NEET timing pressure",
        desc: "200-minute live countdown, OMR-style flow, and 4-subject section switcher — built so practice transfers directly to exam day.",
      },
      {
        title: "+4 / −1 instant scoring",
        desc: "See your raw score and percentile the second you submit. No waiting for results, no manual marking.",
      },
      {
        title: "Chapter-wise weakness map",
        desc: "MockSetu pinpoints exactly which chapter you keep losing marks in — Plant Physiology vs. Human Reproduction vs. Modern Physics — so revision becomes targeted.",
      },
      {
        title: "Mobile-friendly free practice",
        desc: "Quick chapter quizzes work fully on mobile; full-length 200-minute mocks recommended on laptop or desktop.",
      },
    ],
    faqs: [
      {
        question: "Is MockSetu's NEET mock test free?",
        answer:
          "Yes. Every NEET UG mock test on MockSetu is 100% free with unlimited attempts. No paywall, no daily limits, no credit card.",
      },
      {
        question: "How many NEET mocks should I take before the exam?",
        answer:
          "Aim for at least 30 full-length NEET mock tests in the 6 months before the exam. The top 1% of NEET scorers typically attempt 40–50. Quality of review matters more than raw count past 50.",
      },
      {
        question: "Does MockSetu cover all 4 NEET subjects?",
        answer:
          "Yes — Physics, Chemistry, Botany, and Zoology are all fully covered, with the official NEET 180-question pattern (45 per section, including Section A + Section B optional questions).",
      },
      {
        question: "How is NEET marking different from JEE?",
        answer:
          "NEET uses +4 for every correct answer, −1 for every incorrect answer, and 0 for unattempted — same as JEE Main. The difference is NEET has 180 questions in 200 minutes (vs JEE's 90 in 180), so negative marking pressure is higher.",
      },
      {
        question: "Can I take a NEET mock during my drop year?",
        answer:
          "Absolutely. MockSetu is widely used by NEET droppers — the unlimited free mocks help you build the volume that's hard to replicate with paid platforms.",
      },
      {
        question: "Does MockSetu have NEET previous year question papers (PYQs)?",
        answer:
          "Yes. NEET PYQs from the last 5 years are available as timed mocks, alongside full-length original mocks designed to match the latest NTA pattern.",
      },
    ],
    related: [
      { slug: "jee-main", label: "JEE Main Mock Test" },
      { slug: "gate", label: "GATE Mock Test" },
      { slug: "upsc-prelims", label: "UPSC Prelims Mock Test" },
    ],
  },

  cat: {
    slug: "cat",
    examName: "CAT",
    examShort: "CAT",
    tagline: "Free CAT Mock Test 2026 — Sectional Timers, Real IIM Pattern, Deep Analytics",
    metaTitle: "Free CAT Mock Test 2026 — IIM-Pattern Online Simulator | MockSetu",
    metaDescription:
      "Free CAT mock test with the official 2-hour IIM pattern. Sectional timers for VARC, DILR, QA, calculator, scratchpad, and instant percentile + deep analytics. Unlimited free attempts.",
    keywords:
      "CAT mock test, free CAT mock test, CAT 2026 mock test, CAT online mock test, IIM mock test, CAT exam simulator, CAT VARC mock, CAT DILR mock, CAT QA mock, CAT sectional test",
    hero: {
      badge: "CAT 2026 · 3 Sections · 2 Hours",
      h1: "Free CAT Mock Test — Practice the Official IIM Pattern with Sectional Timers",
      intro:
        "MockSetu gives you a fully-free CAT mock test that mirrors the IIM Computer-Based pattern: 3 sections (VARC, DILR, QA), 40 minutes per section, sectional auto-lock, on-screen calculator and scratchpad, and percentile-based scoring. Whether you're targeting IIM-ABC or the new IIMs, our analytics show you exactly where each percentile point is being lost — by section, by question type, by time-per-question.",
      stats: [
        { value: "66", label: "Questions" },
        { value: "120 min", label: "Duration" },
        { value: "198", label: "Max Marks" },
      ],
    },
    pattern: {
      heading: "CAT 2026 Exam Pattern",
      rows: [
        { label: "Conducting body", value: "Indian Institutes of Management (IIM, rotational)" },
        { label: "Mode", value: "Computer-Based Test (CBT)" },
        { label: "Sections", value: "VARC, DILR, QA" },
        { label: "Section duration", value: "40 minutes each (sectional auto-lock)" },
        { label: "Total questions", value: "66 (24 VARC + 20 DILR + 22 QA, varies by year)" },
        { label: "Question types", value: "MCQ (4 options) + TITA (Type-In-The-Answer / non-MCQ)" },
        { label: "Marking scheme", value: "+3 correct, −1 incorrect (MCQ only), 0 for TITA negative" },
        { label: "Total marks", value: "198" },
        { label: "Total duration", value: "2 hours (40 min × 3 sections)" },
        { label: "Output", value: "Sectional percentile + overall percentile (not raw score)" },
      ],
    },
    sections: [
      {
        heading: "Why CAT mock tests are non-negotiable for IIM-level percentile",
        body:
          "CAT is fundamentally a percentile exam — your raw score doesn't matter, only your rank relative to ~3 lakh other aspirants. That means the only way to genuinely prepare is to take mocks repeatedly and watch your percentile graph move. Every 99-plus percentile candidate has taken at least 25 full mocks; most have taken 40+. MockSetu's CAT simulator lets you take unlimited free full-length mocks with sectional locks, the official calculator and scratchpad, and a percentile estimate after every attempt.",
      },
      {
        heading: "How to use MockSetu for your CAT preparation",
        body:
          "From July to September: one mock per week, focus on building section accuracy, ignore percentile. October: switch to two mocks per week, start tracking percentile movement. November: three mocks per week in the 8:30 AM or 2:30 PM slot (whichever matches your real CAT shift). The week before CAT: take only 2 light mocks — rest matters more than reps. After every mock, the single most valuable hour you'll spend is reviewing the questions you skipped: were they actually un-solvable, or did you panic-skip them?",
        bullets: [
          "Always honour the 40-minute sectional lock — practising without it is worthless",
          "Use the on-screen calculator only in DILR and QA, never in VARC",
          "Track your section-wise percentile trend, not raw score",
          "Practise TITA questions specifically — they have no negative marking",
          "VARC is the most coachable section; if your VARC percentile is below 90, mock count is your fix",
        ],
      },
    ],
    syllabus: [
      {
        subject: "VARC (Verbal Ability & Reading Comprehension)",
        topics: [
          "Reading Comprehension (4 long passages, ~16 questions)",
          "Para Jumbles (4–5 sentence reordering)",
          "Para Summary (one-line summary MCQs)",
          "Odd-One-Out / Para Completion",
          "Critical Reasoning (sparingly tested)",
        ],
      },
      {
        subject: "DILR (Data Interpretation & Logical Reasoning)",
        topics: [
          "DI: Tables, Bar/Pie charts, Caselets, Mixed graphs",
          "LR: Arrangements (linear, circular), Puzzles, Distribution, Tournaments, Set theory",
          "Games & Tournaments, Routes & Networks",
          "Selection criteria & Decision making",
        ],
      },
      {
        subject: "QA (Quantitative Aptitude)",
        topics: [
          "Arithmetic (Percentages, Profit-Loss, Ratios, Averages, TSD, Time & Work)",
          "Algebra (Equations, Functions, Logarithms, Inequalities)",
          "Number System (Divisibility, Remainders, HCF/LCM)",
          "Geometry & Mensuration (Triangles, Circles, 3D)",
          "Modern Math (P&C, Probability, Set theory)",
        ],
      },
    ],
    whyMockSetu: [
      {
        title: "Sectional auto-lock",
        desc: "When 40 minutes runs out on a section, it locks — no jumping back. Practice the constraint that defines CAT.",
      },
      {
        title: "On-screen calculator & scratchpad",
        desc: "Same calculator UI as the official IIM portal. Build the muscle memory before exam day.",
      },
      {
        title: "Percentile-based output",
        desc: "Every mock gives you a sectional + overall percentile estimate, not just a raw score. Track what actually matters.",
      },
      {
        title: "TITA questions supported",
        desc: "Both MCQ and TITA (numerical answer) questions handled with the correct no-negative marking rule.",
      },
    ],
    faqs: [
      {
        question: "Is MockSetu's CAT mock test free?",
        answer:
          "Yes — every CAT mock test on MockSetu is completely free with unlimited attempts. No subscription, no card.",
      },
      {
        question: "Does MockSetu's CAT mock have sectional time-locks?",
        answer:
          "Yes. Each section has its own 40-minute timer that auto-locks at the end, exactly like the real IIM CAT. You cannot jump between sections.",
      },
      {
        question: "How many CAT mocks should I take?",
        answer:
          "99+ percentile candidates typically take 25–40 full-length CAT mock tests. The first 10 calibrate your baseline; the next 15 build percentile growth; the last 10 are about peaking on exam day.",
      },
      {
        question: "Does MockSetu show CAT percentile?",
        answer:
          "Yes. After each mock you get a sectional percentile estimate (VARC / DILR / QA) plus an overall percentile, benchmarked against other MockSetu users who took the same mock.",
      },
      {
        question: "Are TITA questions included in MockSetu CAT mocks?",
        answer:
          "Yes. Both MCQ and TITA (Type-In-The-Answer / non-MCQ) questions are included with the official scoring rule — TITA has no negative marking.",
      },
      {
        question: "Can MockSetu CAT mocks be taken on mobile?",
        answer:
          "Sectional mocks work on mobile, but we strongly recommend taking the full 2-hour CAT mock on a laptop with the on-screen calculator and scratchpad for realistic conditions.",
      },
    ],
    related: [
      { slug: "jee-main", label: "JEE Main Mock Test" },
      { slug: "gate", label: "GATE Mock Test" },
      { slug: "upsc-prelims", label: "UPSC Prelims Mock Test" },
    ],
  },

  gate: {
    slug: "gate",
    examName: "GATE",
    examShort: "GATE",
    tagline: "Free GATE Mock Test 2026 — All 30 Papers, IIT-Pattern Simulator",
    metaTitle: "Free GATE Mock Test 2026 — Online Exam Simulator (CS, ME, EE, ECE) | MockSetu",
    metaDescription:
      "Free GATE mock test for all 30 papers including CS, ME, EE, ECE, CE, IN. Real IIT-pattern simulator with virtual calculator, MCQ + MSQ + NAT scoring, instant analytics.",
    keywords:
      "GATE mock test, free GATE mock test, GATE 2026 mock test, GATE online mock test, GATE CS mock test, GATE ME mock test, GATE EE mock test, GATE ECE mock test, GATE exam simulator",
    hero: {
      badge: "GATE 2026 · 65 Questions · 3 Hours",
      h1: "Free GATE Mock Test — IIT-Pattern Simulator for All 30 Papers",
      intro:
        "MockSetu offers free GATE mock tests across all 30 papers including Computer Science (CS), Mechanical (ME), Electrical (EE), Electronics & Communication (ECE), Civil (CE), and Instrumentation (IN). Each mock follows the official IIT pattern — 65 questions, 100 marks, 3 hours, with MCQ + MSQ + NAT question types, a virtual calculator, and instant subject-wise analytics. Built for students targeting IIT M.Tech, IIT MS Research, PSU recruitment, and central university PhDs.",
      stats: [
        { value: "65", label: "Questions" },
        { value: "3 hrs", label: "Duration" },
        { value: "100", label: "Max Marks" },
      ],
    },
    pattern: {
      heading: "GATE 2026 Exam Pattern",
      rows: [
        { label: "Conducting body", value: "IIT (rotational across IITs and IISc)" },
        { label: "Mode", value: "Computer-Based Test (CBT)" },
        { label: "Papers", value: "30 specialisations (CS, ME, EE, ECE, CE, IN, MA, PH, CH, etc.)" },
        { label: "Total questions", value: "65 (10 General Aptitude + 55 core subject)" },
        { label: "Question types", value: "MCQ (1 or 2 marks) + MSQ (multiple-select) + NAT (numerical answer)" },
        { label: "Marking scheme", value: "+1 or +2 correct; −1/3 or −2/3 for wrong MCQ; 0 for wrong MSQ/NAT" },
        { label: "Total marks", value: "100" },
        { label: "Duration", value: "3 hours" },
        { label: "Allowed tool", value: "Virtual calculator (on-screen)" },
      ],
    },
    sections: [
      {
        heading: "Why GATE mock tests separate IIT M.Tech selects from the rest",
        body:
          "GATE is the only Indian PG entrance where a 5-mark swing changes your entire admission outcome — IIT Delhi M.Tech CSE cuts off around 750+ score, while many NITs select at 500+. That razor-thin gap is closed almost entirely through mock-test discipline. Top GATE rankers report taking 20+ full-length mocks plus 40+ topic-wise mini-tests in the final 4 months. MockSetu's free GATE simulator gives you the full-length 3-hour environment plus per-subject sectional tests, so you can target weak chapters without spending money on test series.",
      },
      {
        heading: "How to use MockSetu for your GATE preparation",
        body:
          "From August: one full-length mock per fortnight, plus 2–3 subject-wise sectional tests per week. From November: weekly full-length mock plus 4 sectional tests. From January (one month before GATE): full-length mock every 5 days, all in the morning shift (9:30 AM) to align with the actual GATE slot. The biggest GATE-specific advice: master the virtual calculator. Candidates lose 5–8 marks every mock just because they reach for a physical calculator (not allowed). Get fluent on the on-screen one early.",
        bullets: [
          "Start every mock with the General Aptitude section — easy 15 marks, builds momentum",
          "Use the virtual calculator on every single calculation, no shortcuts",
          "Mark NAT questions for review and revisit — they have zero negative marking",
          "Track your accuracy on 2-mark questions specifically — they decide your rank",
          "Don't skip MSQ practice — most students lose 6+ marks by guessing them like MCQs",
        ],
      },
    ],
    syllabus: [
      {
        subject: "General Aptitude (common to all 30 papers)",
        topics: [
          "Verbal Aptitude (grammar, vocabulary, reading)",
          "Quantitative Aptitude (numerical computation, estimation)",
          "Analytical Aptitude (logic, deduction, analogy)",
          "Spatial Aptitude (visualisation, pattern recognition)",
        ],
      },
      {
        subject: "Core Subjects (varies by paper — examples)",
        topics: [
          "CS: Engineering Mathematics, DSA, Algorithms, TOC, Compilers, OS, DBMS, Networks, COA",
          "ME: Engineering Mechanics, Strength of Materials, Thermodynamics, Fluid Mechanics, Manufacturing",
          "EE: Circuits, Signals, Electrical Machines, Power Systems, Control Systems, Power Electronics",
          "ECE: Networks, Signals, Analog/Digital Electronics, Communications, Electromagnetics, Control Systems",
          "CE: Structural Engg, Geotech, Transportation, Environmental, Water Resources, Surveying",
        ],
      },
    ],
    whyMockSetu: [
      {
        title: "All 30 GATE papers supported",
        desc: "From CS to Mining to Statistics — every GATE paper has dedicated mocks built to the latest IIT syllabus.",
      },
      {
        title: "Virtual calculator built-in",
        desc: "Practice every computation on the on-screen calculator, same as the real GATE portal. Develop fluency, not panic.",
      },
      {
        title: "MCQ + MSQ + NAT all handled",
        desc: "Correct marking for each question type, including no-negative-marking on NAT and the −1/3 / −2/3 split on MCQ.",
      },
      {
        title: "Subject-wise sectional tests",
        desc: "Target specific weak chapters with timed 15-minute sectional drills, in addition to full-length 3-hour mocks.",
      },
    ],
    faqs: [
      {
        question: "Is MockSetu's GATE mock test free?",
        answer:
          "Yes — every GATE mock on MockSetu is fully free with unlimited attempts. No subscription required for any of the 30 papers.",
      },
      {
        question: "Which GATE papers does MockSetu support?",
        answer:
          "MockSetu supports all 30 GATE papers including CS, ME, EE, ECE, CE, IN, MA, PH, CH, BT, MN, AG, AR, BM, CY, ES, EY, GG, GE, MT, NM, PE, PI, ST, TF, XE, XH, XL, DA, and the latest GE (Geomatics Engineering).",
      },
      {
        question: "Does MockSetu have a virtual calculator like the real GATE?",
        answer:
          "Yes. MockSetu includes the same on-screen virtual calculator that GATE provides during the actual exam. No external calculators are allowed in GATE, so practising with the virtual one is critical.",
      },
      {
        question: "How is GATE marking different from JEE / NEET?",
        answer:
          "GATE has three question types with different marking: MCQ has −1/3 negative for 1-mark and −2/3 for 2-mark questions, while MSQ (multiple-select) and NAT (numerical answer) have ZERO negative marking. This makes GATE strategy fundamentally different from JEE/NEET.",
      },
      {
        question: "How many GATE mocks should I take?",
        answer:
          "Top GATE rankers (AIR < 100) typically take 15–25 full-length mocks plus 40+ subject-wise sectional tests in the 4–6 months before GATE.",
      },
      {
        question: "Can MockSetu help with PSU recruitment exams through GATE?",
        answer:
          "Yes — many PSUs (ONGC, IOCL, BHEL, NTPC, GAIL) recruit through GATE scores. Practising on MockSetu's GATE mocks directly prepares you for both M.Tech admissions and PSU shortlisting cutoffs.",
      },
    ],
    related: [
      { slug: "jee-main", label: "JEE Main Mock Test" },
      { slug: "neet-ug", label: "NEET UG Mock Test" },
      { slug: "upsc-prelims", label: "UPSC Prelims Mock Test" },
    ],
  },

  "upsc-prelims": {
    slug: "upsc-prelims",
    examName: "UPSC Prelims",
    examShort: "UPSC",
    tagline: "Free UPSC Prelims Mock Test 2026 — GS Paper I + CSAT Simulator",
    metaTitle: "Free UPSC Prelims Mock Test 2026 — GS + CSAT Simulator | MockSetu",
    metaDescription:
      "Free UPSC Prelims mock test simulator covering GS Paper I + CSAT Paper II. 100 + 80 questions, 2 hours each, real UPSC OMR pattern, instant scoring and category-wise analytics.",
    keywords:
      "UPSC prelims mock test, free UPSC mock test, UPSC 2026 mock test, UPSC online mock test, UPSC CSE prelims, UPSC GS mock test, CSAT mock test, IAS prelims mock test, UPSC exam simulator",
    hero: {
      badge: "UPSC CSE Prelims 2026 · GS + CSAT · 200 + 200 Marks",
      h1: "Free UPSC Prelims Mock Test — GS Paper I and CSAT Paper II Simulator",
      intro:
        "Crack UPSC Prelims with MockSetu's free 2-paper mock test simulator. Take GS Paper I (100 questions, 200 marks, 2 hours) and CSAT Paper II (80 questions, 200 marks, 2 hours) under real OMR-based conditions. Get category-wise analytics across Polity, History, Geography, Economy, Environment, and Current Affairs — so revision becomes precise instead of overwhelming. Built for serious civil services aspirants targeting IAS, IPS, IFS, and IRS.",
      stats: [
        { value: "100 + 80", label: "Questions" },
        { value: "4 hrs", label: "Total Duration" },
        { value: "200 + 200", label: "Max Marks" },
      ],
    },
    pattern: {
      heading: "UPSC CSE Prelims 2026 Exam Pattern",
      rows: [
        { label: "Conducting body", value: "Union Public Service Commission (UPSC)" },
        { label: "Mode", value: "Offline (OMR-based)" },
        { label: "Papers", value: "Paper I: General Studies; Paper II: CSAT (qualifying)" },
        { label: "Paper I — Questions", value: "100 (General Studies)" },
        { label: "Paper II — Questions", value: "80 (CSAT — Aptitude & Comprehension)" },
        { label: "Marking", value: "Paper I: +2 / −0.66; Paper II: +2.5 / −0.83" },
        { label: "Duration", value: "2 hours per paper (4 hours total)" },
        { label: "CSAT qualifying mark", value: "33% (66 / 200) — qualifying only, not added to rank" },
        { label: "Cutoff (Paper I — General)", value: "~85–95 marks (varies year on year)" },
        { label: "Languages", value: "English & Hindi" },
      ],
    },
    sections: [
      {
        heading: "Why UPSC Prelims mocks decide who makes it to Mains",
        body:
          "UPSC Prelims eliminates ~95% of aspirants in a single morning. The line between selected and rejected is often just 4–6 questions — out of 100 — and those 4–6 questions are almost never answered correctly by reading more NCERT; they're answered correctly by candidates who've taken 50+ mock tests and learned to make calibrated guesses on the 30 'half-knowledge' questions every paper has. MockSetu's UPSC simulator forces you to develop that elimination-and-guess instinct under real OMR-style timing, which is the most undertrained skill in UPSC preparation.",
      },
      {
        heading: "How to use MockSetu for your UPSC preparation",
        body:
          "From September: one full-length GS + CSAT every two weeks. From January: weekly full-length mock. From April (one month before Prelims): two mocks per week, both in the 9:30 AM slot to match the real exam shift. Always attempt Paper I first, then take a 30-minute break, then Paper II — never separate them by days during the final two months. After every mock, the most valuable hour is reviewing only the questions you got wrong AND the questions you got right by guess. Both are unstable. Both will fail you in May.",
        bullets: [
          "Attempt 85–95 questions in GS Paper I — anything less leaves marks on the table",
          "Treat CSAT as binary: clear 66/200 with margin, then forget it. Don't over-prepare CSAT.",
          "Current Affairs accounts for 25–30 of your 100 GS questions — daily revision is non-negotiable",
          "Master elimination on confusing 'two of the above' / 'which of the following' formats",
          "Track your accuracy by GS subject (Polity / Econ / Env / History / Geo / CA) to drive revision priorities",
        ],
      },
    ],
    syllabus: [
      {
        subject: "Paper I — General Studies",
        topics: [
          "Current Affairs (last 12–18 months)",
          "Indian History (Ancient, Medieval, Modern, Freedom Struggle)",
          "Indian & World Geography (Physical, Social, Economic)",
          "Indian Polity & Governance (Constitution, Panchayati Raj, Rights, Policy)",
          "Economic & Social Development (Sustainability, Demographics, Inclusion, Poverty)",
          "Environment, Ecology, Biodiversity, Climate Change",
          "General Science (Basics, Tech, Health)",
        ],
      },
      {
        subject: "Paper II — CSAT (Civil Services Aptitude Test)",
        topics: [
          "Comprehension & Critical Reasoning",
          "Logical Reasoning & Analytical Ability",
          "Decision Making & Problem Solving",
          "General Mental Ability",
          "Basic Numeracy (Class X level — numbers, ratios, percentages)",
          "Data Interpretation (charts, graphs, tables)",
        ],
      },
    ],
    whyMockSetu: [
      {
        title: "Real OMR-style flow",
        desc: "Question-by-question MCQ flow with mark-for-review and elimination practice — exactly how UPSC OMR sheets are filled.",
      },
      {
        title: "Both papers simulated",
        desc: "Take GS Paper I and CSAT Paper II as a single session with realistic timing — the way UPSC actually conducts Prelims.",
      },
      {
        title: "Category-wise analytics",
        desc: "See your accuracy split across Polity, History, Geography, Economy, Environment, Current Affairs — drive revision precisely.",
      },
      {
        title: "Cutoff predictor",
        desc: "Every mock estimates your likely cutoff position based on the score distribution of other UPSC aspirants on the platform.",
      },
    ],
    faqs: [
      {
        question: "Is MockSetu's UPSC Prelims mock test free?",
        answer:
          "Yes. Every UPSC CSE Prelims mock test on MockSetu is 100% free with unlimited attempts. Both GS Paper I and CSAT Paper II are fully available.",
      },
      {
        question: "Does MockSetu cover both UPSC Prelims papers?",
        answer:
          "Yes. MockSetu offers full-length GS Paper I (100 questions, 200 marks, 2 hours) and CSAT Paper II (80 questions, 200 marks, 2 hours) — both with the official UPSC marking scheme (+2 / −0.66 for GS, +2.5 / −0.83 for CSAT).",
      },
      {
        question: "How many UPSC mocks should I take before Prelims?",
        answer:
          "Most UPSC selects report taking 30–50 full-length GS mocks plus 10–15 CSAT mocks in the 6 months before Prelims. The quality of post-mock review matters more than mock count beyond 50.",
      },
      {
        question: "Does MockSetu cover Current Affairs for UPSC?",
        answer:
          "Yes — every mock test includes a fresh set of Current Affairs questions from the last 12–18 months, in line with what UPSC actually asks.",
      },
      {
        question: "Is the MockSetu CSAT mock helpful even if I'm strong in CSAT?",
        answer:
          "Yes — CSAT cutoff is 33% (66/200), but it must be cleared. Even strong candidates should take 5–8 CSAT mocks to ensure they don't get blindsided on exam day. CSAT failures cost candidates the entire attempt.",
      },
      {
        question: "Can MockSetu help with state PCS exams too?",
        answer:
          "Yes — many state PCS exams (UPPSC, BPSC, MPPSC, RPSC) follow patterns very similar to UPSC Prelims. The same mocks transfer well, with minor adjustments for state-specific syllabus.",
      },
    ],
    related: [
      { slug: "jee-main", label: "JEE Main Mock Test" },
      { slug: "neet-ug", label: "NEET UG Mock Test" },
      { slug: "cat", label: "CAT Mock Test" },
    ],
  },
};

export const EXAM_SLUGS = Object.keys(EXAM_LANDING_PAGES);
