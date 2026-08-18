import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock,
  FileText,
  GraduationCap,
  History,
  IndianRupee,
  Languages,
  ListChecks,
  Minus,
  MonitorSmartphone,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { PAPER_TYPE_COLUMN, PAPER_TYPE_PYQ } from "@/lib/paperType.js";
import { hasPaperTypeColumn } from "@/lib/paperTypeSettings";

/* ────────────────────────────────────────────────────────────────────────────
 * EDIT ME FIRST
 *
 * Everything factual about the exam lives in this one block so a pattern change
 * in the next SSC notification is a two-minute edit, not a hunt through JSX.
 *
 * EXAM_CATEGORY is load-bearing: it must match `exams.exam_category` in the DB
 * exactly, because the whole page funnels into /marketplace?category=<this>.
 * Rename the category in the admin dashboard and you must rename it here too.
 * ──────────────────────────────────────────────────────────────────────────── */
const EXAM_CATEGORY = "SSC MTS";
const MARKETPLACE_LINK = `/marketplace?category=${encodeURIComponent(EXAM_CATEGORY)}`;
/**
 * The same library, narrowed to previous-year papers — `?type=` is what
 * Marketplace parses (parsePaperTypeParam). Only the papers shelf links here;
 * the page's other CTAs stay on the unfiltered category so "browse SSC MTS"
 * keeps meaning every SSC MTS paper.
 */
const PYQ_MARKETPLACE_LINK = `${MARKETPLACE_LINK}&type=${PAPER_TYPE_PYQ}`;
const OFFICIAL_SITE = "https://ssc.gov.in";

/**
 * Pattern as per the SSC MTS & Havaldar CBE structure used since the 2022 cycle.
 *
 * The load-bearing detail here is `role`. Session I is QUALIFYING ONLY — its 120
 * marks never enter the merit list. It decides one thing: whether your Session II
 * sheet gets evaluated at all. Merit is drawn on normalised Session II marks out
 * of 150. Getting this backwards (treating the paper as a combined 270-mark
 * score) inverts the advice you'd give an aspirant, so it is stated everywhere
 * the sessions appear rather than buried in a footnote.
 */
const SESSIONS = [
  {
    key: "I",
    label: "Session I",
    duration: "45 minutes",
    negative: false,
    negativeLabel: "No negative marking",
    negativeNote: "A wrong answer costs you nothing. Leaving a question blank does.",
    role: "Qualifying gate",
    roleNote:
      "These 120 marks do not enter the merit list. Clear the category minimum — 30% for UR/EWS, 25% for OBC, 20% for SC/ST/PwBD/ESM — or Session II is never evaluated.",
    tone: "emerald",
    subjects: [
      { name: "Numerical & Mathematical Ability", questions: 20, marks: 60 },
      { name: "Reasoning Ability & Problem Solving", questions: 20, marks: 60 },
    ],
  },
  {
    key: "II",
    label: "Session II",
    duration: "45 minutes",
    negative: true,
    negativeLabel: "−1 mark per wrong answer",
    negativeNote: "Each question is worth 3. A blind guess risks 1 to win 3 — only guess when you can cut two options.",
    role: "Your entire merit score",
    roleNote:
      "The merit list is drawn on your normalised Session II marks out of 150. Nothing from Session I is added to it.",
    tone: "amber",
    subjects: [
      { name: "General Awareness", questions: 25, marks: 75 },
      { name: "English Language & Comprehension", questions: 25, marks: 75 },
    ],
  },
] as const;

const QUICK_FACTS = [
  { icon: GraduationCap, label: "Qualification", value: "Matriculation (Class 10) pass" },
  { icon: CalendarDays, label: "Age limit", value: "18–25 yrs · Havaldar 18–27 yrs" },
  { icon: Wallet, label: "Pay", value: "Level-1 · ₹18,000 – ₹56,900" },
  { icon: ListChecks, label: "Selection", value: "CBE only · Havaldar adds PET/PST" },
];

const SYLLABUS = [
  {
    subject: "Numerical & Mathematical Ability",
    session: "Session I",
    topics: [
      "Number systems & simplification",
      "Percentage, ratio & proportion",
      "Profit, loss & discount",
      "Simple & compound interest",
      "Time, work, speed & distance",
      "Average & mixtures",
      "Mensuration",
      "Basic data interpretation",
    ],
  },
  {
    subject: "Reasoning Ability & Problem Solving",
    session: "Session I",
    topics: [
      "Analogies & classification",
      "Coding–decoding",
      "Series (number & alphabet)",
      "Blood relations & directions",
      "Non-verbal: mirror & paper folding",
      "Venn diagrams & syllogism",
      "Order, ranking & arrangement",
      "Odd one out",
    ],
  },
  {
    subject: "General Awareness",
    session: "Session II",
    topics: [
      "Indian history & freedom struggle",
      "Indian polity & Constitution",
      "Geography of India & world",
      "Economy & government schemes",
      "General science (Class 6–10 level)",
      "Static GK: awards, books, sports",
      "Current affairs (last 6–9 months)",
      "Everyday environment awareness",
    ],
  },
  {
    subject: "English Language & Comprehension",
    session: "Session II",
    topics: [
      "Spotting errors",
      "Fill in the blanks",
      "Synonyms & antonyms",
      "Spelling correction",
      "Idioms & phrases",
      "One word substitution",
      "Sentence improvement",
      "Reading comprehension",
    ],
  },
];

/** "20 questions · 60 marks" captions on the syllabus cards, derived from
    SESSIONS so the two sections can never quote different numbers. */
const SUBJECT_META = Object.fromEntries(
  SESSIONS.flatMap((s) => s.subjects.map((sub) => [sub.name, `${sub.questions} questions · ${sub.marks} marks`]))
) as Record<string, string>;

/** Recommended split of each 45-minute session. Widths are % of the session. */
const TIME_PLAN = [
  {
    session: "Session I · 45 min",
    tone: "emerald",
    blocks: [
      { label: "Reasoning", minutes: 18, hint: "Fastest marks on the paper — bank them first" },
      { label: "Maths", minutes: 24, hint: "Slower per question, so protect its time" },
      { label: "Sweep", minutes: 3, hint: "Fill every blank — there is no penalty" },
    ],
  },
  {
    session: "Session II · 45 min",
    tone: "amber",
    blocks: [
      { label: "General Awareness", minutes: 11, hint: "You know it or you don't — never linger" },
      { label: "English", minutes: 20, hint: "Comprehension last, grammar first" },
      { label: "Review", minutes: 14, hint: "Re-check risky guesses before the clock ends" },
    ],
  },
];

const FEATURES = [
  {
    icon: MonitorSmartphone,
    title: "The real CBE screen, not a PDF",
    desc: "Same question palette, same colour legend, same Save & Next flow you will face at the test centre. Exam day should feel like your hundredth attempt, not your first.",
  },
  {
    icon: Languages,
    title: "English and हिंदी, side by side",
    desc: "Switch the language of any question mid-paper, exactly like the real SSC interface. Practise in the language you will actually answer in.",
  },
  {
    icon: Timer,
    title: "Session timing that actually locks",
    desc: "45 minutes for Session I, 45 for Session II. The clock does not pause because you panicked — which is precisely the habit worth building now.",
  },
  {
    icon: BarChart3,
    title: "Where your marks leaked",
    desc: "Score is the least useful number after a mock. You get accuracy per subject, time spent per question, and the guesses that cost you more than they earned.",
  },
  {
    icon: ShieldCheck,
    title: "Negative marking, modelled correctly",
    desc: "Session I scores clean, Session II deducts 1 per wrong answer. Your mock score is the score you would actually have received.",
  },
  {
    icon: TrendingUp,
    title: "Unlimited attempts, zero rupees",
    desc: "No paywall at question 10, no card, no trial timer. Re-attempt any paper as many times as you like.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Pick an SSC MTS paper",
    desc: "The button below opens the library already filtered to SSC MTS — previous-year shifts included. Nothing else in the way.",
  },
  {
    n: "02",
    title: "Sit it properly — 90 minutes, one go",
    desc: "Phone face down, both sessions back to back. A mock taken in pieces measures nothing worth measuring.",
  },
  {
    n: "03",
    title: "Read the analytics, then fix one thing",
    desc: "Find your single biggest leak — a slow topic, a guessing habit — and attack only that before the next paper.",
  },
];

/*
 * FAQ order is a ranking decision, not an editorial one. The previous-year
 * and 2024-paper questions lead because that is the cluster this page
 * targets, and because FAQPage rich results are truncated — whatever sits at
 * the top is what gets a chance to show under the blue link.
 *
 * The 2024 questions live in THIS array on purpose: it is the single source
 * for the page's FAQPage JSON-LD, and a second FAQPage block on the same URL
 * reads as markup spam to Google, not as more coverage.
 */
const FAQS = [
  {
    question: "Where can I get SSC MTS previous year question papers?",
    answer:
      "You can attempt them right here, free. MockSetu hosts SSC MTS previous year question papers as fully playable mock tests rather than static files — the 2024 and 2023 shifts run on the same computer-based screen as the real exam, with both sessions timed and negative marking applied exactly as SSC applies it. There is no download step and no payment.",
  },
  {
    question: "Can I download the SSC MTS previous year paper PDF?",
    answer:
      "MockSetu serves previous year papers as attemptable mocks instead of PDFs, and that is a deliberate choice. A PDF tells you the questions; it cannot tell you that you spent nine minutes on one arithmetic question, or that four of your Session II guesses cost more marks than they earned. Attempting the same paper on a timed screen gives you the questions plus the diagnosis, which is the part that actually changes your score.",
  },
  {
    question: "Where can I attempt the 2024 SSC MTS paper?",
    answer:
      "Right here, free. The 2024 SSC MTS paper shifts run on MockSetu as fully attemptable mock tests — the same computer-based screen as the real exam, both 45-minute sessions timed separately, and Session II's −1 negative marking applied exactly as SSC applies it. Open the SSC MTS library, pick a 2024 shift, and you are in the paper in one tap, in English or हिंदी.",
  },
  {
    question: "Is the 2024 SSC MTS paper still relevant for the 2026 exam?",
    answer:
      "It is the single most relevant paper you can attempt. The 2024 shifts ran on exactly the structure the upcoming cycle uses — 90 questions, two locked 45-minute sessions, no penalty in Session I and −1 per wrong answer in Session II. SSC writes to a stable house style, so last year's arithmetic templates, reasoning families and General Awareness topic bands are the closest preview of your own paper that exists anywhere.",
  },
  {
    question: "How should I use last year's SSC MTS paper in the final weeks before the exam?",
    answer:
      "One full paper every three or four days, attempted in a single 90-minute sitting under real conditions, then reviewed for at least as long as you spent attempting it. Sort every mistake into one of three bins — didn't know it, knew it but ran out of time, knew it and still picked wrong — because each has a completely different fix. In the final fortnight, stop adding new material and spend that time re-attempting shifts and tightening your Session II guessing discipline.",
  },
  {
    question: "When is the SSC MTS 2026 exam?",
    answer:
      "The official SSC examination calendar places the MTS computer-based exam in a September–November 2026 window. Exact shift dates arrive with the admit card, and the notification on ssc.gov.in is the only authoritative source for the schedule — any precise date circulating before it appears there is speculation. Plan for the early end of the window: if your shift lands in September, the remaining weeks belong to full-length papers and review, not new material.",
  },
  {
    question: "What is the full form of SSC MTS?",
    answer:
      "Staff Selection Commission Multi Tasking Staff — a Group C, non-technical post in central government ministries and departments, recruited alongside Havaldar posts in CBIC and CBN through the same exam. Eligibility is a Class 10 pass, pay runs on Level-1 (₹18,000–₹56,900 basic), and selection is a single computer-based exam, with a physical test added for Havaldar applicants.",
  },
  {
    question: "How many SSC MTS previous year papers should I solve?",
    answer:
      "Every paper you can find, but solved properly rather than collected. One previous year paper attempted under full exam conditions and then reviewed question by question is worth more than five skimmed for question types. SSC repeats patterns heavily across MTS cycles — topic weightage, phrasing, and trap options recur — so the returns come from recognising those patterns, and recognition needs an honest attempt followed by a real review.",
  },
  {
    question: "Are SSC MTS previous year papers available in Hindi?",
    answer:
      "Yes. Questions can be switched between English and हिंदी while you attempt the paper, exactly as the real SSC computer-based exam allows. Practising previous year papers in the language you will actually answer in on exam day matters more than most aspirants assume, particularly for General Awareness and comprehension.",
  },
  {
    question: "Is this SSC MTS mock test really free?",
    answer:
      "Yes — completely, and with unlimited attempts. There is no card required, no trial window, and no paywall part-way through a paper. MockSetu is free for students; the papers are contributed by educators on the platform.",
  },
  {
    question: "Do Session I marks count towards the SSC MTS merit list?",
    answer:
      "No, and this surprises most aspirants. Session I is qualifying in nature — its 120 marks decide only whether your Session II answer sheet is evaluated at all. You need to clear the category minimum, which has been 30% for UR and EWS, 25% for OBC and 20% for SC, ST, PwBD and Ex-servicemen. The merit list itself is drawn on your normalised Session II score out of 150. So Session I is a gate to walk through, and Session II is the race.",
  },
  {
    question: "Does the mock have negative marking like the real SSC MTS exam?",
    answer:
      "It does, and it applies it the same way the real paper does. Session I (Maths and Reasoning) carries no negative marking, so every question is worth attempting. Session II (General Awareness and English) deducts 1 mark for each wrong answer out of the 3 the question carries. Bear in mind when reading your score that only Session II counts towards the real merit list — Session I is qualifying only.",
  },
  {
    question: "Can I attempt the paper in Hindi?",
    answer:
      "Yes. Questions can be switched between English and हिंदी while you are attempting the paper, exactly as the real SSC computer-based exam allows. Practising in the language you will answer in on exam day matters more than most aspirants assume.",
  },
  {
    question: "Are these previous year question papers?",
    answer:
      "The SSC MTS library includes previous-year shift papers alongside practice sets. Each paper shows its title and the educator who published it, so you always know what you are sitting down to attempt.",
  },
  {
    question: "How many mock tests should I take before the exam?",
    answer:
      "Consistency beats volume. Two full mocks a week in the last two months, each followed by a proper review of what went wrong, does more for your score than one mock a day left unanalysed. The review is the part that moves marks — the mock only diagnoses.",
  },
  {
    question: "Do I need to sign up to take a mock test?",
    answer:
      "You can browse the library freely. A free student account is needed to save attempts, which is what lets you compare papers over time and see your analytics — the part that actually improves your score.",
  },
  {
    question: "Does this work on a phone?",
    answer:
      "It does, and the interface adapts. That said, sit at least some of your mocks on a laptop or desktop: the real exam is a computer-based test with a mouse, and screen size changes how quickly you read a comprehension passage.",
  },
];

/* ── Sample questions powering the live interface preview ─────────────────── */
const SAMPLE_QUESTIONS = [
  {
    subject: "Reasoning Ability",
    en: {
      text: "Select the option that is related to the third term in the same way as the second term is related to the first term.\n\nDoctor : Hospital :: Teacher : ?",
      options: ["School", "Book", "Student", "Class"],
    },
    hi: {
      text: "उस विकल्प का चयन करें जो तीसरे पद से उसी प्रकार संबंधित है जैसे दूसरा पद पहले पद से संबंधित है।\n\nडॉक्टर : अस्पताल :: शिक्षक : ?",
      options: ["विद्यालय", "पुस्तक", "विद्यार्थी", "कक्षा"],
    },
    correct: 0,
  },
  {
    subject: "Numerical Ability",
    en: {
      text: "A shopkeeper marks an article 40% above its cost price and then allows a discount of 25% on the marked price. What is his profit percentage?",
      options: ["5%", "10%", "15%", "4%"],
    },
    hi: {
      text: "एक दुकानदार किसी वस्तु का अंकित मूल्य उसके लागत मूल्य से 40% अधिक रखता है और फिर अंकित मूल्य पर 25% की छूट देता है। उसका लाभ प्रतिशत क्या है?",
      options: ["5%", "10%", "15%", "4%"],
    },
    correct: 0,
  },
  {
    subject: "Numerical Ability",
    en: {
      text: "The average of 5 consecutive even numbers is 24. What is the largest of these numbers?",
      options: ["26", "28", "30", "32"],
    },
    hi: {
      text: "5 क्रमागत सम संख्याओं का औसत 24 है। इनमें से सबसे बड़ी संख्या कौन-सी है?",
      options: ["26", "28", "30", "32"],
    },
    correct: 1,
  },
] as const;

type PaletteState = "answered" | "not-answered" | "marked" | "not-visited";

/** Seeded states for palette squares 4–20, so the grid reads like a paper in progress. */
const SEEDED_PALETTE: PaletteState[] = [
  "answered", "answered", "not-answered", "answered", "marked",
  "answered", "not-visited", "not-visited", "answered", "not-answered",
  "not-visited", "not-visited", "answered", "not-visited", "not-visited",
  "not-visited", "not-visited",
];

const PALETTE_STYLES: Record<PaletteState, string> = {
  answered: "bg-emerald-500 text-white border-emerald-600",
  "not-answered": "bg-rose-500 text-white border-rose-600",
  marked: "bg-violet-500 text-white border-violet-600",
  "not-visited": "bg-slate-700/60 text-white/50 border-white/10",
};

const LEGEND: { state: PaletteState; label: string }[] = [
  { state: "answered", label: "Answered" },
  { state: "not-answered", label: "Not Answered" },
  { state: "marked", label: "Marked for Review" },
  { state: "not-visited", label: "Not Visited" },
];

/* ────────────────────────────────────────────────────────────────────────────
 * The interface preview.
 *
 * This is the page's whole argument compressed into one card: an SSC MTS
 * aspirant has usually never seen the CBE screen before walking into the
 * centre. Describing it in a paragraph does nothing. Letting them answer three
 * questions on a working replica — palette lighting up, clock falling, हिंदी
 * one tap away — is the entire pitch, and it costs them no signup to feel it.
 * ──────────────────────────────────────────────────────────────────────────── */
const CbePreview = () => {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<(number | null)[]>([null, null, null]);
  const [states, setStates] = useState<PaletteState[]>(["not-answered", "not-visited", "not-visited"]);
  const [secondsLeft, setSecondsLeft] = useState(45 * 60 - 37);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const mmss = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  const q = SAMPLE_QUESTIONS[index];
  const content = lang === "en" ? q.en : q.hi;

  const visit = (next: number) => {
    setIndex(next);
    setStates((prev) => {
      const copy = [...prev];
      if (copy[next] === "not-visited") copy[next] = "not-answered";
      return copy;
    });
  };

  const choose = (optionIdx: number) => {
    setSelected((prev) => {
      const copy = [...prev];
      copy[index] = optionIdx;
      return copy;
    });
  };

  const saveAndNext = () => {
    setStates((prev) => {
      const copy = [...prev];
      copy[index] = selected[index] === null ? "not-answered" : "answered";
      return copy;
    });
    visit((index + 1) % SAMPLE_QUESTIONS.length);
  };

  const markForReview = () => {
    setStates((prev) => {
      const copy = [...prev];
      copy[index] = "marked";
      return copy;
    });
    visit((index + 1) % SAMPLE_QUESTIONS.length);
  };

  return (
    <div
      role="group"
      aria-label="Interactive preview of the SSC MTS computer-based exam interface"
      className="rounded-2xl border border-white/10 bg-[#0C1024] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/[0.04] border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span className="truncate text-[11px] font-semibold text-white/60 tracking-wide">
            SSC MTS · Session I
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* The language switch is the detail this audience notices first. */}
          <div className="flex items-center rounded-md border border-white/10 bg-white/[0.04] p-0.5">
            {(["en", "hi"] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  lang === code ? "bg-[#6C3EF4] text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                {code === "en" ? "EN" : "हिं"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-rose-500/15 border border-rose-500/25 px-2 py-1">
            <Clock className="h-3 w-3 text-rose-300" aria-hidden="true" />
            <span
              className="text-[12px] font-bold text-rose-200 tabular-nums"
              aria-hidden="true"
            >
              {mmss}
            </span>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto]">
        {/* Question pane */}
        <div className="p-4 sm:p-5 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-bold text-white/85 bg-white/10 rounded px-2 py-0.5">
              Q.{index + 1}
            </span>
            <span className="text-[11px] text-white/40 truncate">{q.subject}</span>
            <span className="ml-auto text-[10px] font-semibold text-emerald-300/80 whitespace-nowrap">
              +3 / −0
            </span>
          </div>

          <p className="text-[13.5px] sm:text-[14px] text-white/85 leading-[1.65] whitespace-pre-line min-h-[76px]">
            {content.text}
          </p>

          <div className="mt-4 space-y-2">
            {content.options.map((opt, i) => {
              const isPicked = selected[index] === i;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => choose(i)}
                  className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isPicked
                      ? "border-[#6C3EF4] bg-[#6C3EF4]/15"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-4 h-4 rounded-full border-2 grid place-items-center ${
                      isPicked ? "border-[#8B6BF7]" : "border-white/25"
                    }`}
                    aria-hidden="true"
                  >
                    {isPicked && <span className="w-2 h-2 rounded-full bg-[#8B6BF7]" />}
                  </span>
                  <span className="text-[13px] text-white/80">{opt}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveAndNext}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-[12px] font-bold text-white transition-colors"
            >
              Save &amp; Next
            </button>
            <button
              type="button"
              onClick={markForReview}
              className="rounded-lg border border-violet-400/30 bg-violet-500/10 hover:bg-violet-500/20 px-3.5 py-2 text-[12px] font-semibold text-violet-200 transition-colors"
            >
              Mark for Review
            </button>
          </div>
        </div>

        {/* Palette */}
        <div className="border-t sm:border-t-0 sm:border-l border-white/10 bg-white/[0.02] p-4 sm:w-[188px]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-3">
            Question Palette
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 20 }).map((_, i) => {
              const live = i < SAMPLE_QUESTIONS.length;
              const state = live ? states[i] : SEEDED_PALETTE[i - SAMPLE_QUESTIONS.length];
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!live}
                  onClick={() => live && visit(i)}
                  aria-label={`Question ${i + 1} — ${state.replace("-", " ")}`}
                  className={`h-7 w-7 rounded border text-[11px] font-bold grid place-items-center transition-transform ${
                    PALETTE_STYLES[state]
                  } ${live ? "hover:scale-105 cursor-pointer" : "cursor-default opacity-70"} ${
                    live && i === index ? "ring-2 ring-offset-1 ring-offset-[#0C1024] ring-white/70" : ""
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <ul className="mt-4 space-y-1.5">
            {LEGEND.map(({ state, label }) => (
              <li key={state} className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-sm border ${PALETTE_STYLES[state]}`}
                  aria-hidden="true"
                />
                <span className="text-[10.5px] text-white/45">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="px-4 py-2.5 text-[10.5px] text-white/30 bg-white/[0.02] border-t border-white/10">
        <span className="text-white/50 font-semibold">Interactive preview</span> — tap an option,
        everything works. The real paper runs 90 questions across two sessions.
      </p>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * Previous year papers.
 *
 * Read live rather than hard-coded, for two reasons. The names carry the
 * specificity that actually convinces an aspirant — "13th November 2024 Shift 2"
 * is a real paper in a way that "Practice Set 3" never is — and the shelf stays
 * honest on its own as papers are published, with nobody having to remember to
 * edit this file.
 *
 * A named paper opens that paper — going via the library would make someone
 * hunt for the exact title they just clicked. Only the "view all" affordances
 * lead to the filtered library.
 * ──────────────────────────────────────────────────────────────────────────── */
type PaperRow = { id: string; name: string };

/** How many papers the shelf shows — the grid is 3 across, plus a "view all" tile. */
const PAPER_SHELF_LIMIT = 5;

/**
 * `from=marketplace` is not cosmetic: it is the only value that points the
 * intro screen's Back button at the exam library. Without it students get sent
 * to /dashboard, which is the creator side of the app. See ExamIntro#handleBack.
 */
const examIntroLink = (examId: string) => `/exam/${examId}/intro?from=marketplace`;

/** Creator-entered titles are inconsistent: "SSC MTS -13th November 2024 Shift- 2". */
const formatPaperTitle = (name: string) => {
  const cleaned = name
    .replace(/\s+/g, " ")
    .replace(/^SSC\s*MTS\s*[-–—:]*\s*/i, "") // the page is already about SSC MTS
    .replace(/\s*[-–—]\s*/g, " ")
    .trim();
  return cleaned || name;
};

const paperYear = (name: string) => name.match(/\b(19|20)\d{2}\b/)?.[0] ?? null;

/**
 * One fetch, two consumers: the visible shelf and the ItemList structured data.
 *
 * Keeping them on the same source is not a tidiness point — schema.org markup
 * that lists papers the page does not actually show is exactly the mismatch
 * Google treats as spam, so the two must not be able to drift apart.
 * `null` means in flight.
 *
 * The shelf is published SSC MTS papers tagged as previous-year (exams.paper_type
 * = 'pyq'), so tagging a paper in the editor is all it takes to put it here.
 *
 * That column arrives by hand-pasted migration, and naming a column PostgREST
 * has not seen fails the WHOLE request — so it is probed before it is filtered
 * on. On a database without it there is no way to tell a PYQ from a mock, and a
 * shelf that quietly went dark would be worse than the pre-feature behaviour, so
 * that case falls back to every published SSC MTS paper. `typeFiltered` reports
 * which of the two happened, so the "view all" links can only send someone to a
 * filtered library when that filter is one the library can actually apply.
 */
const useSscMtsPapers = () => {
  const [papers, setPapers] = useState<PaperRow[] | null>(null);
  const [typeFiltered, setTypeFiltered] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // false on a transient failure too, which costs at most an unfiltered
      // shelf until the next reload — never an empty one.
      const canFilterByType = await hasPaperTypeColumn();
      if (!active) return;
      try {
        let query = supabase
          .from("exams")
          .select("id, name")
          .eq("is_published", true)
          .eq("exam_category", EXAM_CATEGORY);
        if (canFilterByType) query = query.eq(PAPER_TYPE_COLUMN, PAPER_TYPE_PYQ);

        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(PAPER_SHELF_LIMIT);
        if (error) throw error;
        if (active) {
          setPapers(data ?? []);
          setTypeFiltered(canFilterByType);
        }
      } catch {
        // A marketing shelf is not worth an error state — it just doesn't render.
        if (active) setPapers([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { papers, typeFiltered };
};

const PreviousYearPapers = ({
  papers,
  libraryLink,
}: {
  papers: PaperRow[] | null;
  libraryLink: string;
}) => {
  // null while in flight, so the shelf can render a skeleton instead of flashing
  // an empty state at the one moment the page is being judged.
  const loading = papers === null;

  // Never advertise an empty shelf. If nothing is published under this category,
  // the section removes itself rather than sending anyone to a dead library.
  if (!loading && papers.length === 0) return null;

  return (
    <div className="relative">
      {/* Breathing aura behind the panel. The animation is opacity-only on a
          blurred backdrop — nothing in the content itself moves, which is the
          difference between drawing the eye and nagging it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-3 sm:-inset-4 rounded-[28px] blur-2xl opacity-60 animate-pulse-glow"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.38), transparent 65%)",
        }}
      />

      {/* Gold, not violet. Violet is the page's "start a mock" colour, and this
          shelf is a different offer sitting inches away from it — a second
          violet block would read as one undifferentiated wall of buttons. */}
      <div className="relative rounded-2xl border border-amber-400/30 bg-gradient-to-b from-amber-400/[0.10] via-white/[0.05] to-white/[0.02] backdrop-blur-sm p-5 sm:p-6 shadow-[0_0_0_1px_rgba(251,191,36,0.10),0_28px_70px_-28px_rgba(251,191,36,0.45)]">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-amber-300/25 to-amber-500/10 border border-amber-400/35 flex-shrink-0 shadow-[0_0_20px_-6px_rgba(251,191,36,0.7)]">
              <History className="h-5 w-5 text-amber-200" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              {!loading && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 mb-1.5">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-200">
                    {papers.length} free {papers.length === 1 ? "paper" : "papers"}
                  </span>
                </span>
              )}
              <h2 className="text-[17px] sm:text-[19px] font-black text-white tracking-[-0.02em] leading-tight">
                SSC MTS previous year papers
              </h2>
              <p className="text-[12.5px] text-white/50 mt-1 leading-relaxed">
                Real shifts, timed exactly as they were. One tap and you are in the paper.
              </p>
            </div>
          </div>
          <Link
            to={libraryLink}
            className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white transition-colors whitespace-nowrap flex-shrink-0 mt-1"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/[0.14] bg-white/[0.06] p-4 animate-pulse"
                  aria-hidden="true"
                >
                  <div className="h-4 w-4 rounded bg-white/10 mb-3" />
                  <div className="h-4 w-3/4 rounded bg-white/10 mb-3.5" />
                  <div className="h-7 w-32 rounded-lg bg-white/[0.07]" />
                </div>
              ))
            : papers.map((p, i) => {
                const year = paperYear(p.name);
                return (
                  <Link
                    key={p.id}
                    to={examIntroLink(p.id)}
                    style={{ animationDelay: `${i * 90}ms` }}
                    className="group relative rounded-xl border border-white/[0.14] bg-white/[0.07] hover:bg-amber-400/[0.12] hover:border-amber-400/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-16px_rgba(251,191,36,0.55)] animate-fade-in"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <FileText className="h-4 w-4 text-amber-200/60" aria-hidden="true" />
                      {year && (
                        <span className="text-[10.5px] font-black text-amber-100 bg-amber-400/25 border border-amber-400/40 rounded px-1.5 py-0.5 tabular-nums">
                          {year}
                        </span>
                      )}
                    </div>
                    <div className="text-[14.5px] font-bold text-white leading-snug mb-3.5 line-clamp-2">
                      {formatPaperTitle(p.name)}
                    </div>
                    {/* Reads as a button, because it is the click target that
                        matters. The old muted-grey caption read as disabled. */}
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/15 border border-amber-400/30 px-2.5 py-1.5 text-[11.5px] font-bold text-amber-100 group-hover:bg-amber-300 group-hover:border-amber-300 group-hover:text-[#1A1200] transition-colors">
                      Take this paper
                      <ArrowRight
                        className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                );
              })}

          {!loading && (
            /* Violet on purpose: this one goes to the library, not into a paper.
               Colour carries the difference so nobody has to read to find it. */
            <Link
              to={libraryLink}
              className="group rounded-xl border border-dashed border-white/20 hover:border-[#8B6BF7]/70 hover:bg-[#6C3EF4]/[0.12] p-4 transition-all duration-200 grid place-items-center text-center min-h-[132px]"
            >
              <span>
                <span className="block text-[13.5px] font-bold text-white/85 group-hover:text-white transition-colors">
                  View all SSC MTS papers
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] text-white/45 group-hover:text-white/70 transition-colors">
                  Opens the library, already filtered
                  <ArrowRight
                    className="h-3 w-3 group-hover:translate-x-0.5 transition-transform"
                    aria-hidden="true"
                  />
                </span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

const FaqItem = ({ q, a, defaultOpen }: { q: string; a: string; defaultOpen: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-semibold text-foreground tracking-tight pr-4">{q}</span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="pb-5 text-[14.5px] text-muted-foreground leading-[1.75]">{a}</div>}
    </div>
  );
};

/* One header idiom for eight sections: an eyebrow chip gives the eye a landing
   point before each H2, and keeps a long page reading as a single system rather
   than eight stacked pages. */
const SectionHead = ({
  eyebrow,
  title,
  lede,
  align = "center",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) => (
  <div className={`${align === "center" ? "text-center" : ""} ${className}`}>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.07] px-3.5 py-1.5 text-[10.5px] font-black uppercase tracking-[0.16em] text-primary">
      {eyebrow}
    </span>
    <h2 className="mt-4 text-[26px] sm:text-[34px] font-black text-foreground tracking-[-0.028em]">
      {title}
    </h2>
    {lede && (
      <p
        className={`mt-3 text-[15px] text-muted-foreground leading-[1.7] ${
          align === "center" ? "max-w-2xl mx-auto" : "max-w-xl"
        }`}
      >
        {lede}
      </p>
    )}
  </div>
);

/** The primary action, used in the hero, mid-page and the sticky mobile bar. */
const TakeExamButton = ({ label = "Take a Free Mock Test", className = "" }: { label?: string; className?: string }) => (
  <Link
    to={MARKETPLACE_LINK}
    className={`group inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_0_0_1px_rgba(108,62,244,0.5),0_8px_32px_rgba(108,62,244,0.4)] transition-all duration-200 hover:-translate-y-0.5 ${className}`}
  >
    {label}
    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
  </Link>
);

const SscMtsLanding = () => {
  const [showSticky, setShowSticky] = useState(false);
  const { papers, typeFiltered } = useSscMtsPapers();
  // A `?type=pyq` library on a database that cannot tell the two apart lands on
  // "Nothing published under Previous Year Paper yet" — so the shelf only
  // pre-filters the link when its own rows were filtered the same way.
  const papersLibraryLink = typeFiltered ? PYQ_MARKETPLACE_LINK : MARKETPLACE_LINK;

  // The sticky bar is for the WhatsApp-forward crowd on a phone: by the time the
  // hero has scrolled away, the one action worth taking should still be a thumb
  // away rather than a scroll back up.
  useEffect(() => {
    const onScroll = () => setShowSticky(window.scrollY > 620);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jsonLd = useMemo(
    () => [
      {
        "@context": "https://schema.org",
        "@type": "Course",
        name: "SSC MTS Previous Year Question Papers — MockSetu (Mockset)",
        alternateName: "SSC MTS PYQ & Free Online Mock Test Series",
        description:
          "Free SSC MTS previous year question papers, attemptable on the real computer-based exam interface — two timed sessions, correct negative marking, bilingual questions and per-subject analytics.",
        provider: {
          "@type": "Organization",
          name: "MockSetu",
          alternateName: ["Mockset", "Mock Setu"],
          "@id": "https://mocksetu.in/#organization",
          sameAs: "https://mocksetu.in/",
        },
        url: "https://mocksetu.in/ssc-mts",
        educationalLevel: "Secondary",
        inLanguage: ["en-IN", "hi-IN"],
        isPartOf: { "@id": "https://mocksetu.in/#website" },
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "Online",
          courseWorkload: "PT1H30M",
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
          category: "Free",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://mocksetu.in/" },
          { "@type": "ListItem", position: 2, name: "Mock Tests", item: "https://mocksetu.in/marketplace" },
          {
            "@type": "ListItem",
            position: 3,
            name: "SSC MTS Previous Year Question Papers",
            item: "https://mocksetu.in/ssc-mts",
          },
        ],
      },
      // Only emitted once real papers are known, and built from the same rows the
      // shelf renders — markup describing papers the page doesn't show would be
      // a spam signal, not a ranking one.
      ...(papers && papers.length > 0
        ? [
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: "SSC MTS previous year question papers",
              description:
                "Free, attemptable SSC MTS previous year question papers on the MockSetu exam simulator.",
              numberOfItems: papers.length,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: papers.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: `SSC MTS ${formatPaperTitle(p.name)} question paper`,
                url: `https://mocksetu.in/exam/${p.id}/intro`,
              })),
            },
          ]
        : []),
    ],
    [papers]
  );

  return (
    <div className="min-h-screen bg-background">
      <SEO
        /* Title leads with the exact target phrase and stays under ~60 chars so
           it is not truncated in the SERP (53 chars). "2024" is in the title
           because "2024 ssc mts paper" is a target query in its own right, and
           the year is the CTR trigger — it reads as "the actual paper", not a
           practice set. "PYQ" stays because that is what aspirants actually
           type — it outranks "last year paper" in real Indian search volume. */
        title="SSC MTS Previous Year Paper 2024 — Free PYQ Mock Test"
        /* 150 chars — under the ~160 Google renders before truncating. "last
           year paper" carries that query cluster; "free" + "real shifts" +
           "actual exam screen" are the click triggers. */
        description="Attempt every SSC MTS last year paper free — real 2024 & 2023 shifts on the actual exam screen, timed, with correct negative marking. Hindi & English."
        path="/ssc-mts"
        keywords="SSC MTS previous year question paper, SSC MTS previous year paper, SSC MTS PYQ, SSC MTS last year paper, last year paper for SSC MTS, last year paper for SSC, 2024 SSC MTS paper, SSC MTS paper 2024, SSC MTS question paper, SSC MTS previous year paper in hindi, SSC MTS previous year paper pdf, SSC MTS 2024 question paper, SSC MTS 2023 question paper, SSC MTS mock test, SSC MTS mock test free, SSC MTS online test series, SSC MTS practice set, SSC MTS Havaldar previous year paper, SSC MTS exam pattern, SSC MTS syllabus, SSC MTS 2026, SSC MTS notification 2026, SSC MTS exam date 2026, SSC MTS vacancy 2026, SSC MTS apply online, SSC MTS full form, Multi Tasking Staff, SSC MTS salary, SSC MTS cut off, SSC MTS admit card, SSC MTS answer key, SSC MTS free online test"
        jsonLd={jsonLd}
      />
      <Navbar />

      {/* ══ Hero ══ */}
      <section className="relative overflow-hidden bg-[#07091A] pt-24 pb-16 sm:pt-28 sm:pb-20 px-5">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute top-[-20%] left-[15%] w-[700px] h-[480px] rounded-full bg-[#6C3EF4] opacity-[0.16] blur-[130px]" />
          <div className="absolute bottom-[-10%] right-[5%] w-[420px] h-[420px] rounded-full bg-[#A855F7] opacity-[0.09] blur-[110px]" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.09]"
          aria-hidden="true"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(ellipse 75% 75% at 40% 40%, black 25%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 75% 75% at 40% 40%, black 25%, transparent 100%)",
          }}
        />

        <div className="relative z-10 container mx-auto max-w-6xl">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-[12px] text-white/40">
            <Link to="/" className="hover:text-white/80 transition-colors">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/marketplace" className="hover:text-white/80 transition-colors">Mock Tests</Link>
            <span aria-hidden="true">/</span>
            <span className="text-white/60">SSC MTS</span>
          </nav>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] gap-10 lg:gap-12 lg:items-center">
            {/* Copy. min-w-0 on every hero grid item: below lg the implicit
                track has no minmax(0,…), so without it the track sizes to the
                preview's intrinsic width and the whole hero overflows a phone. */}
            <div className="order-1 min-w-0 motion-safe:animate-slide-up">
              {/* Amber on purpose: this chip and the papers shelf below are the
                  same "previous-year gold" offer, and colour ties them together
                  before a single word is read. Violet stays the action colour. */}
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.08] backdrop-blur-sm px-3.5 py-1.5 mb-6">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                <span className="text-[11.5px] font-semibold text-amber-100/90 tracking-wide">
                  Free forever · Previous year papers included
                </span>
              </div>

              {/* The H1 carries the target phrase verbatim; the gradient still
                  lands on the benefit half, so ranking and conversion are not
                  fighting over the same line. */}
              <h1 className="text-[32px] sm:text-[44px] lg:text-[52px] font-black text-white leading-[1.08] tracking-[-0.035em] mb-6">
                SSC MTS previous year papers on the{" "}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-[#A78BFA] via-[#C4B5FD] to-[#F0ABFC] bg-clip-text text-transparent">
                    real exam screen
                  </span>
                  {/* Hand-drawn underline — the one organic stroke on a page of
                      rectangles, so it lands on the words that matter most. */}
                  <svg
                    className="absolute -bottom-2 left-0 w-full h-[10px]"
                    viewBox="0 0 300 12"
                    fill="none"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 9 C 60 2.5, 240 2.5, 297 7.5"
                      stroke="url(#ssc-underline)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="ssc-underline" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#8B5CF6" stopOpacity="0.95" />
                        <stop offset="1" stopColor="#F0ABFC" stopOpacity="0.45" />
                      </linearGradient>
                    </defs>
                  </svg>
                </span>
              </h1>

              <p className="text-[16px] sm:text-[17px] text-white/60 leading-[1.7] mb-3 max-w-xl">
                Attempt real SSC MTS previous year question papers — 2024 and 2023 shifts — with two
                timed sessions, the exact negative marking of the real paper, and the same question
                palette you will see at the test centre.
              </p>
              <p className="flex items-start gap-2 text-[14.5px] text-white/45 leading-[1.75] mb-8 max-w-xl">
                <Languages className="h-4 w-4 text-white/35 flex-shrink-0 mt-1" aria-hidden="true" />
                असली परीक्षा जैसा इंटरफ़ेस — हिंदी और अंग्रेज़ी दोनों में। पूरी तरह मुफ़्त।
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                <TakeExamButton />
                <a
                  href="#exam-pattern"
                  className="inline-flex items-center justify-center gap-2.5 rounded-xl border border-white/10 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm px-7 py-3.5 text-[15px] font-semibold text-white/70 hover:text-white transition-all duration-200"
                >
                  <ListChecks className="h-4 w-4" aria-hidden="true" />
                  See the exam pattern
                </a>
              </div>

              <ul className="flex flex-wrap gap-x-5 gap-y-2.5 mb-7">
                {["No card needed", "Unlimited attempts", "English + हिंदी"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5 text-[12.5px] text-white/50">
                    <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>

              {/* The paper, quantified. Exact numbers are the trust currency of
                  this audience — "45+45" tells an aspirant we know the exam in a
                  way no adjective can. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-xl">
                {[
                  { v: "90", l: "questions" },
                  { v: "270", l: "marks" },
                  { v: "45+45", l: "minutes" },
                  { v: "₹0", l: "free forever" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-3 py-3 text-center"
                  >
                    <div className="font-display text-[19px] font-extrabold text-white tracking-tight tabular-nums">
                      {s.v}
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35 mt-0.5">
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interface preview, staged as the product shot: halo behind it,
                bevel around it, callouts floating off its corners. Ordered LAST
                on a phone deliberately: it is a tall panel, and stacking it above
                the papers shelf buried the shelf a full screen below the fold. */}
            <div className="order-3 lg:order-2 lg:pl-2 min-w-0 motion-safe:animate-scale-in motion-safe:delay-200">
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-5 rounded-[28px] bg-gradient-to-br from-[#6C3EF4]/30 via-transparent to-[#F0ABFC]/20 blur-2xl opacity-70"
                />
                <div className="relative rounded-[17px] bg-gradient-to-b from-white/[0.16] via-white/[0.05] to-transparent p-px">
                  <CbePreview />
                </div>

                {/* Callouts float outside the frame and never intercept a tap. */}
                <div className="pointer-events-none absolute -top-4 left-5 hidden lg:flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0C1024]/95 px-3 py-1.5 shadow-xl animate-float">
                  <MousePointerClick className="h-3.5 w-3.5 text-[#A78BFA]" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-white/80">Interactive — try a question</span>
                </div>
                <div className="pointer-events-none absolute -bottom-4 right-5 hidden lg:flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0C1024]/95 px-3 py-1.5 shadow-xl animate-float delay-700">
                  <Languages className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-white/80">हिंदी one tap away</span>
                </div>
              </div>
            </div>

            {/* Previous year papers — the proof that there is real content behind
                the pitch. Straight after the CTAs on mobile; a full-width row
                under both columns on desktop. */}
            <div className="order-2 lg:order-3 lg:col-span-2 min-w-0">
              <PreviousYearPapers papers={papers} libraryLink={papersLibraryLink} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ Quick facts ══ */}
      <section className="border-b border-border/50 bg-secondary/25 px-5 py-10">
        <div className="container mx-auto max-w-5xl">
          <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60 mb-5">
            The job, at a glance
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_FACTS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex-shrink-0">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    {label}
                  </div>
                  <div className="text-[13.5px] font-semibold text-foreground mt-0.5 leading-snug">
                    {value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SSC MTS 2026 — the cycle queries ══
          "ssc mts 2026", "notification", "exam date", "vacancy" are the
          highest-volume MTS queries in India — every #1-ranking competitor
          leads with them. This block earns that cluster WITHOUT lying: as of
          Aug 2026 the notification is NOT out, so the only honest facts are
          the calendar window, last cycle's vacancies, and where the real
          notification will appear. Update the tiles the day it drops. */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-5xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="SSC MTS 2026"
            title="SSC MTS 2026: notification, exam date & vacancies"
            lede={
              <>
                SSC MTS — full form <strong className="text-foreground/85">Multi Tasking Staff</strong> —
                runs on an annual cycle, and the 2026 one is here. What is confirmed, what is still
                awaited, and what it means for the weeks you have left.
              </>
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: CalendarDays,
                label: "Exam window",
                value: "Sept – Nov 2026",
                hint: "Per the official SSC exam calendar",
                hot: true,
              },
              {
                icon: FileText,
                label: "Notification 2026",
                value: "Awaited",
                hint: "Publishes on ssc.gov.in — the only authoritative source",
              },
              {
                icon: TrendingUp,
                label: "Vacancies last cycle",
                value: "7,948",
                hint: "2025 · MTS + Havaldar (CBIC & CBN) · 2026 TBA",
              },
              {
                icon: GraduationCap,
                label: "Post",
                value: "Multi Tasking Staff",
                hint: "Group C, non-technical · Class 10 pass",
              },
            ].map(({ icon: Icon, label, value, hint, hot }) => (
              <div
                key={label}
                className={`rounded-2xl border p-5 text-center ${
                  hot ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-card"
                }`}
              >
                <Icon
                  className={`h-4 w-4 mx-auto mb-2 ${hot ? "text-primary" : "text-muted-foreground/70"}`}
                  aria-hidden="true"
                />
                <div
                  className={`font-display text-[17px] sm:text-[19px] font-extrabold tracking-tight leading-tight ${
                    hot ? "text-primary" : "text-foreground"
                  }`}
                >
                  {value}
                </div>
                <div className="text-[10.5px] font-black uppercase tracking-widest text-muted-foreground/70 mt-1">
                  {label}
                </div>
                <div className="text-[11.5px] text-muted-foreground/80 mt-1 leading-snug">{hint}</div>
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-3xl mx-auto text-center text-[14.5px] text-muted-foreground leading-[1.8]">
            Read the window the way a ranker does: if your shift lands in September, the time for
            new material is already over — these weeks belong to full-length papers and review.
            Dates circulating before the notification appears on{" "}
            <a
              href={OFFICIAL_SITE}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-semibold text-primary hover:underline"
            >
              ssc.gov.in
            </a>{" "}
            are speculation; the syllabus, pattern and papers below are what you can act on today.
          </p>

          {/* Spoke links: the cycle queries this page can't fully answer get a
              dedicated article each — hub ranks, spokes support. */}
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              { to: "/blog/ssc-mts-notification-and-exam-dates", label: "Notification & exam dates, explained" },
              { to: "/blog/ssc-mts-vacancies-and-selection-process", label: "Vacancies & selection process" },
              { to: "/blog/ssc-mts-salary-and-job-profile", label: "SSC MTS salary & job profile" },
              { to: "/blog/ssc-mts-cutoff-analysis", label: "Cut-off analysis, state-wise logic" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 hover:border-primary/40 transition-colors"
              >
                <span className="text-[13px] font-medium text-foreground/85">{l.label}</span>
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Why PYQs — the page's topical body copy ══
          A landing page that only asserts "free mock tests" ranks on the title
          alone. This section is where the previous-year-paper intent actually
          gets answered, and where link equity flows out to the SSC articles. */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-3xl">
          <SectionHead
            align="left"
            className="mb-6"
            eyebrow="The case for PYQs"
            title="Why SSC MTS previous year papers beat any practice set"
          />
          <div className="space-y-5 text-[15px] sm:text-[16px] text-muted-foreground leading-[1.85]">
            <p className="text-[16px] sm:text-[17px] text-foreground/75">
              SSC writes its own papers, and it writes them to a house style. Across MTS cycles the
              same arithmetic templates reappear with different numbers, the same reasoning families
              rotate, and General Awareness returns to the same narrow band of static topics. A
              coaching practice set guesses at that style. A previous year question paper{" "}
              <em>is</em> that style. That single difference is why the highest-return hour in your
              preparation is almost always an honest attempt at a real past shift.
            </p>
            <p>
              What a previous year paper teaches you is not the answers — you will never see those
              exact questions again. It teaches you the shape of the exam: how long a Session I
              arithmetic question really takes when a clock is running, how many General Awareness
              questions you genuinely know cold, and how quickly the paper punishes hesitation. Those
              are calibration facts, and they cannot be read out of a book.
            </p>
            <p>
              The trap is collecting papers instead of solving them. Three papers attempted under
              full exam conditions and reviewed question by question will move your score further
              than thirty downloaded and skimmed. Review is where the marks are: every question you
              got wrong is either a gap in knowledge, a gap in speed, or a bad decision about when to
              guess — and each of those has a completely different fix.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-6">
            <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-4">
              How to review an SSC MTS previous year paper properly
            </h3>
            <ol className="space-y-3.5">
              {[
                {
                  t: "Separate the three failure types",
                  d: "Didn't know it, knew it but ran out of time, or knew it and still picked wrong. Only the first is a syllabus problem.",
                },
                {
                  t: "Audit your Session II guesses",
                  d: "Count how many blind guesses you made and what they netted after the −1. Most aspirants discover they lost marks by guessing.",
                },
                {
                  t: "Find the one topic that ate the clock",
                  d: "There is almost always a single topic quietly consuming a disproportionate share of your 45 minutes. Fix that before adding new topics.",
                },
                {
                  t: "Re-attempt the same paper a fortnight later",
                  d: "If your score jumps but your timing doesn't, you memorised answers instead of building speed. Attempt a different shift instead.",
                },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-3.5">
                  <span className="flex-shrink-0 grid place-items-center w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-black text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[14px] font-semibold text-foreground">{s.t}</div>
                    <div className="text-[13.5px] text-muted-foreground leading-[1.65] mt-0.5">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Outbound internal links: real topical depth for the crawler, and a
              genuine next step for anyone who just found their weak section. */}
          <div className="mt-8">
            <h3 className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-4">
              Go deeper on a weak section
            </h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {[
                { to: "/blog/quantitative-aptitude-for-government-exams", label: "Quantitative aptitude for government exams" },
                { to: "/blog/reasoning-preparation-for-competitive-exams", label: "Reasoning preparation strategy" },
                { to: "/blog/general-awareness-preparation-for-exams", label: "General awareness & static GK system" },
                { to: "/blog/english-preparation-for-competitive-exams", label: "English preparation for competitive exams" },
                { to: "/blog/negative-marking-strategy", label: "Negative marking: when to guess" },
                { to: "/blog/exam-day-strategy-and-checklist", label: "Exam day strategy & checklist" },
                { to: "/blog/ssc-chsl-preparation-strategy", label: "SSC CHSL preparation strategy" },
                { to: "/blog/ssc-cgl-preparation-strategy", label: "SSC CGL preparation strategy" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <span className="text-[13.5px] font-medium text-foreground/85">{l.label}</span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ The 2024 paper — the "last year paper" intent, answered ══
          "last year paper for ssc mts" and "2024 ssc mts paper" are queries
          this page targets verbatim, so the copy uses the searcher's own words.
          Deliberately MTS-only: CGL/CHSL get exactly one comparative paragraph,
          because those clusters belong to their own pages and drifting here is
          how this page starts cannibalising them. */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20 border-y border-border/50">
        <div className="container mx-auto max-w-3xl">
          <SectionHead
            align="left"
            className="mb-6"
            eyebrow="Last year's paper"
            title="The 2024 SSC MTS paper: your most honest rehearsal"
          />

          {/* PAS intro: the problem is not knowledge, it is calibration — and
              the agitation is the September 2026 clock, which is real. */}
          <div className="space-y-5 text-[15px] sm:text-[16px] text-muted-foreground leading-[1.85]">
            <p className="text-[16px] sm:text-[17px] text-foreground/75">
              You have the syllabus. You have the books, the one-shot videos, the Telegram notes.
              What none of them can give you is the one thing that will decide your rank this
              September: how <em>you</em> behave when a real SSC paper is on the screen and the
              clock is falling.
            </p>
            <p>
              That gap has a price, and it is paid every cycle. Aspirants who knew enough to clear
              the cut-off lose out — not to harder questions, but to a slow first ten minutes, a
              comprehension passage started too late, or four confident guesses that Session II's{" "}
              <strong className="text-foreground/85">−1 negative marking</strong> quietly turned
              into lost marks. The syllabus tells you what SSC <em>can</em> ask. Only the{" "}
              <strong className="text-foreground/85">last year paper for SSC MTS</strong> shows you
              what it actually asks — and how fast it expects an answer.
            </p>
            <p>
              Which is why the 2024 SSC MTS paper is the highest-return sitting available to you
              right now: real shifts from the most recent completed cycle, attempted on the same
              computer-based screen with the same two locked 45-minute clocks, and your score
              computed against the answer key the instant you submit — no waiting, no PDF hunt.
            </p>
          </div>

          <h3 className="mt-10 mb-3 text-[19px] font-black text-foreground tracking-[-0.02em]">
            What the 2024 SSC MTS paper actually tested
          </h3>
          <p className="text-[15px] text-muted-foreground leading-[1.85] mb-4">
            Individual questions across the 2024 shifts stayed within the matriculation band that
            defines MTS — very few were genuinely hard. What the paper tested was{" "}
            <strong className="text-foreground/85">throughput</strong>: whether you could convert
            knowledge you already had into marked answers before the session clock ran out.
            Candidates who struggled almost never lacked the knowledge; they lost the clock.
          </p>
          <ul className="space-y-2.5 mb-4">
            {[
              <>
                <strong className="text-foreground/85">Arithmetic allowed roughly 70 seconds a
                question.</strong>{" "}
                One three-minute struggle eats the budget of two other questions — recognising a
                question is going long, and abandoning it, was the skill 2024 punished hardest.
              </>,
              <>
                <strong className="text-foreground/85">Reasoning repeated shallow families</strong>{" "}
                — analogies, series, coding–decoding — the fastest marks on the paper, worth
                clearing first in Session I.
              </>,
              <>
                <strong className="text-foreground/85">General Awareness returned to the same
                bands</strong>{" "}
                — polity, modern history, Class 6–10 science — and rewarded answering in seconds
                or moving on. A fact is recalled instantly or not at all.
              </>,
              <>
                <strong className="text-foreground/85">English punished late starts on the
                passage.</strong>{" "}
                Aspirants who reached comprehension with under ten minutes left donated those
                marks to the clock.
              </>,
            ].map((item, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] text-muted-foreground leading-[1.75]">
                <span
                  className="mt-[9px] h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-muted-foreground leading-[1.75]">
            The shift-by-shift breakdown lives in the{" "}
            <Link
              to="/blog/ssc-mts-2024-question-paper-analysis"
              className="font-semibold text-primary hover:underline"
            >
              full 2024 question paper analysis
            </Link>
            , and the{" "}
            <Link
              to="/blog/ssc-mts-pyq-topic-wise-weightage"
              className="font-semibold text-primary hover:underline"
            >
              topic-wise weightage guide
            </Link>{" "}
            sets out which chapters those shifts kept returning to.
          </p>

          <h3 className="mt-10 mb-3 text-[19px] font-black text-foreground tracking-[-0.02em]">
            How to use last year's paper before the September 2026 exam
          </h3>
          <p className="text-[15px] text-muted-foreground leading-[1.85] mb-4">
            With the exam weeks away, the temptation is to hoard papers. Resist it — between now
            and your admit card, a handful of shifts attempted properly beats a folder of fifty.
            The working rhythm is{" "}
            <strong className="text-foreground/85">
              one full paper every three or four days, reviewed for as long as it took to attempt
            </strong>
            :
          </p>
          <ul className="space-y-2.5 mb-4">
            {[
              <>
                <strong className="text-foreground/85">First, diagnose.</strong> Attempt one 2024
                shift cold, both sessions back to back, phone face down. Your score does not
                matter yet; your per-subject timing and your guessing pattern do.
              </>,
              <>
                <strong className="text-foreground/85">Then fix the single biggest leak.</strong>{" "}
                One topic is quietly eating your 45 minutes, or blind guessing is bleeding your
                Session II total. Attack only that before the next paper — fixing everything at
                once fixes nothing.
              </>,
              <>
                <strong className="text-foreground/85">Final fortnight: rehearse, don't
                learn.</strong>{" "}
                Stop adding material. Re-attempt shifts until the 90-minute rhythm — reasoning
                first, sweep the blanks, passage last — runs without thinking.
              </>,
            ].map((item, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] text-muted-foreground leading-[1.75]">
                <span
                  className="mt-[9px] h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-[14px] text-muted-foreground leading-[1.75]">
            The full review method — the three failure types and what each one demands — is in{" "}
            <Link
              to="/blog/how-to-solve-ssc-mts-previous-year-papers"
              className="font-semibold text-primary hover:underline"
            >
              how to solve SSC MTS previous year papers
            </Link>
            .
          </p>

          <h3 className="mt-10 mb-3 text-[19px] font-black text-foreground tracking-[-0.02em]">
            Looking for a last year paper for SSC, beyond MTS?
          </h3>
          <p className="text-[15px] text-muted-foreground leading-[1.85]">
            One caution: SSC's exams share a house style but not a structure. A last year paper for
            SSC CGL or CHSL runs on a different pattern, different marking and a different clock —
            useful for its own exam, but it rehearses the wrong instincts for the MTS computer-based
            test. If MTS in September 2026 is your target, spend your remaining weeks inside MTS
            shifts, where every minute of practice transfers.
          </p>

          {/* Gold CTA — same "previous-year gold" idiom as the hero shelf, so
              the offer reads as one thing across the page. Links through
              papersLibraryLink, never the raw ?type= URL, for the same
              missing-column reason as the shelf. */}
          <div className="mt-10 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex-shrink-0">
                <History className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[16px] font-black text-foreground tracking-tight mb-1.5">
                  The 2024 paper is open. The clock is set. Free.
                </h3>
                <p className="text-[13.5px] text-muted-foreground leading-[1.7] mb-4">
                  Ninety minutes from now you will know exactly where you stand — which is more
                  than most aspirants will know on exam morning. No card, no trial, unlimited
                  re-attempts.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={papersLibraryLink}
                    className="group inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-[13.5px] font-bold text-[#1A1200] transition-colors"
                  >
                    Attempt the 2024 SSC MTS paper
                    <ArrowRight
                      className="h-4 w-4 group-hover:translate-x-0.5 transition-transform"
                      aria-hidden="true"
                    />
                  </Link>
                  <Link
                    to={MARKETPLACE_LINK}
                    className="text-[13px] font-semibold text-primary hover:underline"
                  >
                    or browse every SSC MTS mock →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Exam pattern ══ */}
      <section id="exam-pattern" className="scroll-mt-20 py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-5xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="Exam pattern"
            title="SSC MTS exam pattern"
            lede={
              <>
                90 questions, 270 marks, 90 minutes — but the two sessions do completely different
                jobs. Session I is a <strong className="text-foreground/85">qualifying gate</strong>;
                Session II is your <strong className="text-foreground/85">entire merit score</strong>.
                Understanding that is worth more marks than any chapter you revise.
              </>
            }
          />

          {/* The mechanic aspirants get wrong most often, drawn instead of
              footnoted. Three nodes, two arrows — the arrows rotate to point
              down when the flow stacks on a phone. */}
          <div className="mb-8 flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="flex-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
              <div className="text-[10.5px] font-black uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                Session I · 120 marks
              </div>
              <div className="text-[18px] font-black text-foreground tracking-tight mt-1">The gate</div>
              <p className="text-[12.5px] text-muted-foreground leading-[1.6] mt-1.5">
                Clear your category cutoff — 30% UR/EWS, 25% OBC, 20% SC/ST — and these marks are
                then discarded.
              </p>
            </div>
            <div className="grid place-items-center" aria-hidden="true">
              <span className="grid place-items-center w-9 h-9 rounded-full border border-border bg-card shadow-sm rotate-90 md:rotate-0">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </div>
            <div className="flex-1 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-5">
              <div className="text-[10.5px] font-black uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
                Session II · 150 marks
              </div>
              <div className="text-[18px] font-black text-foreground tracking-tight mt-1">The race</div>
              <p className="text-[12.5px] text-muted-foreground leading-[1.6] mt-1.5">
                Every mark counts, and every wrong answer costs 1. This is the score that ranks you.
              </p>
            </div>
            <div className="grid place-items-center" aria-hidden="true">
              <span className="grid place-items-center w-9 h-9 rounded-full border border-border bg-card shadow-sm rotate-90 md:rotate-0">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </div>
            <div className="flex-1 rounded-2xl bg-primary text-primary-foreground p-5 shadow-glow">
              <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-white/70">
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                The result
              </div>
              <div className="text-[18px] font-black tracking-tight mt-1">Merit list</div>
              <p className="text-[12.5px] text-white/75 leading-[1.6] mt-1.5">
                Drawn on your normalised Session II score out of 150 — nothing else.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {SESSIONS.map((s) => {
              const totalQ = s.subjects.reduce((a, b) => a + b.questions, 0);
              const totalM = s.subjects.reduce((a, b) => a + b.marks, 0);
              const isNeg = s.negative;
              return (
                <div
                  key={s.key}
                  className={`rounded-2xl border bg-card overflow-hidden ${
                    isNeg ? "border-amber-500/30" : "border-emerald-500/30"
                  }`}
                >
                  <div
                    className={`px-6 py-4 border-b flex items-center justify-between gap-3 ${
                      isNeg
                        ? "bg-amber-500/[0.07] border-amber-500/20"
                        : "bg-emerald-500/[0.07] border-emerald-500/20"
                    }`}
                  >
                    <div>
                      <h3 className="text-[17px] font-black text-foreground tracking-tight">{s.label}</h3>
                      <p className="text-[12.5px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {s.duration}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold whitespace-nowrap ${
                        isNeg
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                      }`}
                    >
                      {isNeg ? (
                        <Minus className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      )}
                      {s.negativeLabel}
                    </span>
                  </div>

                  <table className="w-full text-[13.5px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
                        <th className="text-left font-bold px-6 pt-4 pb-2">Subject</th>
                        <th className="text-right font-bold px-2 pt-4 pb-2 w-16">Qs</th>
                        <th className="text-right font-bold px-6 pt-4 pb-2 w-20">Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.subjects.map((sub) => (
                        <tr key={sub.name} className="border-t border-border/40">
                          <td className="px-6 py-3 text-foreground/85 font-medium">{sub.name}</td>
                          <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">
                            {sub.questions}
                          </td>
                          <td className="px-6 py-3 text-right text-muted-foreground tabular-nums">
                            {sub.marks}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-border/60 bg-secondary/40 font-bold">
                        <td className="px-6 py-3 text-foreground">Total</td>
                        <td className="px-2 py-3 text-right text-foreground tabular-nums">{totalQ}</td>
                        <td className="px-6 py-3 text-right text-foreground tabular-nums">{totalM}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div
                    className={`px-6 py-4 border-t space-y-2.5 ${
                      isNeg
                        ? "bg-amber-500/[0.06] border-amber-500/20"
                        : "bg-emerald-500/[0.06] border-emerald-500/20"
                    }`}
                  >
                    <p className="text-[12.5px] text-muted-foreground leading-[1.65]">
                      <strong
                        className={`text-[11px] font-black uppercase tracking-widest mr-1.5 ${
                          isNeg
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {s.role}.
                      </strong>
                      {s.roleNote}
                    </p>
                    <p className="text-[12.5px] text-muted-foreground leading-[1.65]">{s.negativeNote}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* The merit tile is the only tinted one, because "150" is the only
              number on this row an aspirant actually competes against. */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Questions", value: "90", hint: "45 + 45 across two sessions" },
              { label: "Paper total", value: "270", hint: "120 + 150 marks" },
              { label: "Counts for merit", value: "150", hint: "Session II only, normalised", hot: true },
              { label: "Total time", value: "90 min", hint: "Two locked 45-min clocks" },
            ].map((t) => (
              <div
                key={t.label}
                className={`rounded-2xl border p-5 text-center ${
                  t.hot ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-card"
                }`}
              >
                <div
                  className={`font-display text-[26px] font-extrabold tracking-tight tabular-nums ${
                    t.hot ? "text-primary" : "text-foreground"
                  }`}
                >
                  {t.value}
                </div>
                <div className="text-[10.5px] font-black uppercase tracking-widest text-muted-foreground/70 mt-1">
                  {t.label}
                </div>
                <div className="text-[11.5px] text-muted-foreground/80 mt-1">{t.hint}</div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-center text-[12.5px] text-muted-foreground/80">
            Pattern as per the current SSC MTS &amp; Havaldar CBE structure. Always confirm against the
            official notification at{" "}
            <a
              href={OFFICIAL_SITE}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-semibold text-primary hover:underline"
            >
              ssc.gov.in
            </a>
            .
          </p>
        </div>
      </section>

      {/* ══ Strategy: the asymmetry between the two sessions ══ */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20 border-y border-border/50">
        <div className="container mx-auto max-w-5xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="Time strategy"
            title="The 90 minutes, planned"
            lede="Most SSC MTS marks are lost to the clock, not to the syllabus. Here is a split worth rehearsing in your mocks until it needs no thinking on exam day."
          />

          <div className="space-y-5">
            {TIME_PLAN.map((plan) => {
              const total = plan.blocks.reduce((a, b) => a + b.minutes, 0);
              const isAmber = plan.tone === "amber";
              return (
                <div key={plan.session} className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-[15px] font-bold text-foreground tracking-tight">{plan.session}</h3>
                    <span
                      className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full ${
                        isAmber
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {isAmber ? "Guess carefully" : "Attempt everything"}
                    </span>
                  </div>

                  {/* Proportional time bar */}
                  <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-4" aria-hidden="true">
                    {plan.blocks.map((b, i) => (
                      <div
                        key={b.label}
                        style={{ width: `${(b.minutes / total) * 100}%` }}
                        className={
                          isAmber
                            ? ["bg-amber-500", "bg-amber-400", "bg-amber-300/60"][i]
                            : ["bg-emerald-500", "bg-emerald-400", "bg-emerald-300/60"][i]
                        }
                      />
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                    {plan.blocks.map((b, i) => (
                      <div key={b.label} className="flex items-start gap-2.5">
                        <span
                          className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                            isAmber
                              ? ["bg-amber-500", "bg-amber-400", "bg-amber-300/60"][i]
                              : ["bg-emerald-500", "bg-emerald-400", "bg-emerald-300/60"][i]
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-[13.5px] font-semibold text-foreground">
                            {b.label} · {b.minutes} min
                          </div>
                          <div className="text-[12.5px] text-muted-foreground leading-[1.6] mt-0.5">
                            {b.hint}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/[0.06] p-5 sm:p-6 flex items-start gap-4">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex-shrink-0">
              <IndianRupee className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-1.5">
                The one rule that decides SSC MTS scores
              </h3>
              <p className="text-[13.5px] text-muted-foreground leading-[1.75]">
                Session I is a gate, not a race. Its 120 marks never reach the merit list — they only
                decide whether your Session II sheet is opened at all, so clear the category minimum
                and move on. Since nothing there is penalised, a blank is strictly worse than a guess.
                Session II then carries your whole result, and the maths flips: risking 1 to win 3 only
                pays once you have eliminated options. Rehearse both instincts in a mock, because you
                will not have the calm to reason about them at the test centre.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Syllabus ══ */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-5xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="Syllabus"
            title="SSC MTS syllabus"
            lede="Four subjects, all pitched at Class 10 level. Every paper in the library maps to this."
          />

          <div className="grid sm:grid-cols-2 gap-5">
            {SYLLABUS.map((s) => (
              <div key={s.subject} className="rounded-2xl border border-border/60 bg-card p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-foreground tracking-tight leading-snug">
                      {s.subject}
                    </h3>
                    <p className="text-[11.5px] font-medium text-muted-foreground/80 mt-1">
                      {SUBJECT_META[s.subject]}
                    </p>
                  </div>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                      s.session === "Session I"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {s.session}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.topics.map((t) => (
                    <span
                      key={t}
                      className="text-[12px] text-muted-foreground bg-secondary/60 border border-border/50 rounded-lg px-2.5 py-1"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Why MockSetu ══ */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20 border-y border-border/50">
        <div className="container mx-auto max-w-5xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="Built for the CBE"
            title="What you actually get"
            lede="Built for the SSC computer-based test specifically — not a generic quiz with an SSC label."
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-border/60 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30"
              >
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 mb-4 transition-transform duration-300 group-hover:scale-105">
                  <Icon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
                </span>
                <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">{title}</h3>
                <p className="text-[13.5px] text-muted-foreground leading-[1.7]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ How it works ══ */}
      <section className="py-16 sm:py-20 px-5">
        <div className="container mx-auto max-w-4xl">
          <SectionHead className="mb-10 sm:mb-12" eyebrow="How it works" title="How to use this properly" />
          <div className="relative grid sm:grid-cols-3 gap-8 sm:gap-6">
            {/* The rail behind the step markers; it fades out at both ends so it
                reads as a path, not a border. */}
            <div
              className="hidden sm:block absolute top-5 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
              aria-hidden="true"
            />
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="relative z-10 grid place-items-center w-10 h-10 rounded-full bg-background border border-primary/30 shadow-sm mb-4">
                  <span className="text-[13px] font-black text-primary tabular-nums">{s.n}</span>
                </div>
                <h3 className="text-[15px] font-bold text-foreground tracking-tight mb-2">{s.title}</h3>
                <p className="text-[13.5px] text-muted-foreground leading-[1.7]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section className="py-16 sm:py-20 px-5 bg-secondary/20 border-t border-border/50">
        <div className="container mx-auto max-w-3xl">
          <SectionHead
            className="mb-8 sm:mb-10"
            eyebrow="FAQ"
            title="SSC MTS mock test — FAQs"
            lede="The questions aspirants ask before their first attempt."
          />
          <div className="rounded-2xl border border-border/60 bg-card px-6 sm:px-8 shadow-sm">
            {FAQS.map((f, i) => (
              <FaqItem key={f.question} q={f.question} a={f.answer} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ Final CTA ══ */}
      <section className="relative overflow-hidden bg-[#07091A] py-20 sm:py-24 px-5">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[400px] rounded-full bg-[#6C3EF4] opacity-[0.18] blur-[110px]" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "radial-gradient(ellipse 60% 70% at 50% 50%, black 30%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 50% 50%, black 30%, transparent 100%)",
            }}
          />
        </div>
        <div className="relative z-10 container mx-auto max-w-3xl">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-sm px-6 py-12 sm:px-14 sm:py-14 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-3.5 py-1.5 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-100/90">
                Free forever
              </span>
            </span>
            <h2 className="text-[28px] sm:text-[38px] font-black text-white tracking-[-0.03em] leading-[1.1] mb-4">
              Your first SSC MTS mock is 90 minutes away
            </h2>
            <p className="text-[15px] text-white/55 leading-[1.75] mb-2">
              Unlimited attempts, real exam conditions, honest analytics. Free, and staying that way.
            </p>
            <p className="text-[14px] text-white/40 leading-[1.75] mb-8">
              अभी शुरू करें — कोई शुल्क नहीं, कोई कार्ड नहीं।
            </p>
            <TakeExamButton label="Take a Free Mock Test" className="px-8 py-4" />
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {["No card needed", "Unlimited attempts", "English + हिंदी"].map((t) => (
                <li key={t} className="flex items-center gap-1.5 text-[12px] text-white/45">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Footer />

      {/* ══ Sticky mobile CTA ══ */}
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-lg px-4 py-3 transition-transform duration-300 ${
          showSticky ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-foreground truncate">SSC MTS mock test</div>
            <div className="text-[11.5px] text-muted-foreground truncate">Free · Unlimited attempts</div>
          </div>
          <Link
            to={MARKETPLACE_LINK}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-[#6C3EF4]/25 transition-colors"
          >
            Take Exam
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      {/* Spacer so the sticky bar never covers the footer's last line on mobile. */}
      <div className={`lg:hidden ${showSticky ? "h-[76px]" : "h-0"}`} aria-hidden="true" />
    </div>
  );
};

export default SscMtsLanding;
