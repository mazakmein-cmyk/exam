import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "jee-main-numerical-value-questions",
  title: "JEE Main Section B: Playing the Numerical Value Questions Properly",
  metaTitle: "JEE Main Section B Numerical Value Questions Strategy | MockSetu",
  metaDescription:
    "How to use the attempt-any-5-of-10 rule in JEE Main Section B, avoid rounding and entry errors, and turn the optional section into 60 near-certain marks.",
  keywords:
    "JEE Main section B, JEE Main numerical value questions, JEE Main NVQ strategy, attempt any 5 of 10 JEE Main, JEE Main numerical questions negative marking, JEE Main integer type questions",
  excerpt:
    "Section B hands you a choice that nobody else in the exam hall is using well. Thirty seconds of triage across ten questions is worth more than an hour of extra study.",
  publishedAt: "2026-08-19",
  updatedAt: "2026-08-19",
  readingMinutes: 9,
  category: "Exam Strategy",
  tags: ["JEE Main", "Section B", "Numerical Questions", "Exam Strategy", "Attempt Strategy"],
  hero: {
    eyebrow: "Exam Strategy",
    h1: "JEE Main Section B: Playing the Numerical Value Questions Properly",
    lede:
      "Sixty of the three hundred marks sit in a section where you choose which questions to answer. Most candidates surrender that choice by starting at question one.",
  },
  content: [
    {
      type: "h2",
      text: "What Section B Is",
    },
    {
      type: "p",
      text: "Each subject in JEE Main Paper 1 contains a Section B of ten numerical-value questions, of which you attempt any five. Across three subjects that is fifteen attempted questions worth four marks each — sixty marks, a fifth of the paper, in a format that differs from everything else on the screen.",
    },
    {
      type: "p",
      text: "The difference that matters is the absence of options. You compute a value and enter it on an on-screen keypad. There is no list of four to sanity-check your answer against, no chance to work backwards from the choices, and no partial rescue from a lucky guess. Every property of good Section B strategy follows from that single structural fact.",
    },
    {
      type: "h2",
      text: "The Negative Marking Change Most Candidates Missed",
    },
    {
      type: "p",
      text: "In earlier cycles, Section B carried no penalty for a wrong answer, and the correct play was obvious: attempt all five slots regardless of confidence, because a wrong answer cost nothing. In recent cycles a one-mark penalty has applied to Section B as well.",
    },
    {
      type: "p",
      text: "A surprising number of candidates still prepare with the old rule in their heads, usually because they absorbed it from an older resource. The consequence is expensive. Under a penalty, a blind numerical guess is close to pure loss — unlike a four-option MCQ, where elimination gives you a real chance, an unbounded numerical answer entered on a hunch is essentially never right. Confirm the rule in the bulletin for your cycle, and in the meantime assume the penalty applies. The full marking scheme is in the [exam pattern guide](/blog/jee-main-exam-pattern-and-marking-scheme).",
    },
    {
      type: "h2",
      text: "The Triage Habit That Wins the Section",
    },
    {
      type: "p",
      text: "Here is the single highest-return habit in the entire paper, and it costs thirty seconds. Before solving anything in Section B, read all ten questions.",
    },
    {
      type: "p",
      text: "You are not solving them during that pass — you are sorting them. Ten questions on the same syllabus are never equally hard, and a quick scan reliably reveals two or three that are noticeably more tractable than the rest: a standard configuration you recognise, a single-step application, a formula you know cold. Those are your first attempts. The remaining slots go to the next most promising, and the five worst are simply discarded.",
    },
    {
      type: "p",
      text: "Candidates who skip this and start at question one routinely spend eleven minutes on a question they should never have opened, then attempt the genuinely easy question at position eight in the last ninety seconds of the paper, if at all. The section is designed to let you avoid the hardest material in the subject; refusing that gift is a strange way to sit an exam.",
    },
    {
      type: "h2",
      text: "You Are Not Locked Into Your First Five",
    },
    {
      type: "p",
      text: "A persistent misconception is that the first five Section B questions you touch become your final five. They do not. The interface counts the answers you have actually entered, and you can change them until you submit. If you enter an answer, later realise it was wrong, and clear it in favour of a different question, that is entirely permitted.",
    },
    {
      type: "p",
      text: "In practice this means you should enter answers as you get them and keep working. If you finish four confident answers and have two half-solved candidates for the fifth slot, take the one you can actually complete. What you must not do is leave a slot empty because you were saving it — an unused Section B slot is four marks you declined.",
    },
    {
      type: "h2",
      text: "Answer Format: The Errors That Cost Correct Solutions",
    },
    {
      type: "p",
      text: "A correct method entered incorrectly scores minus one, exactly like a wrong method. These are the recurring entry failures, all of them mechanical and all of them avoidable.",
    },
    {
      type: "ul",
      items: [
        "Rounding: the paper specifies how answers are to be entered — commonly rounded to the nearest integer or to a stated number of decimal places. Read that instruction on the day and follow it exactly.",
        "Units: the question states the unit in which the answer is expected. Computing in SI and entering a value the question wanted in centimetres is a complete loss.",
        "Scientific notation: when a question asks for the answer in the form of a coefficient with a stated power of ten, enter only what was asked for.",
        "Transcription: read your entered value back from the screen against your rough work once. This single habit catches more errors than any other check.",
        "Keypad slips: the on-screen keypad is not a keyboard, and a mis-tap has no option list to catch it.",
      ],
    },
    {
      type: "p",
      text: "These errors do not appear in paper practice, which is why candidates who prepare entirely on PDFs meet them for the first time in the hall. They surface immediately on a simulator that reproduces the actual keypad and palette behaviour, which is what the [free JEE Main mock test](/mock-test/jee-main) is for.",
    },
    {
      type: "h2",
      text: "Where the Easy Section B Questions Usually Are",
    },
    {
      type: "p",
      text: "Across recent papers, some regions of the syllabus produce tractable numerical questions far more consistently than others. Knowing which helps your thirty-second scan land on the right questions faster.",
    },
    {
      type: "p",
      text: "In Physics, Modern Physics and Semiconductors, basic Electrostatics and Current Electricity, and straightforward Kinematics tend to yield single-step numerical answers. In Chemistry, Mole Concept, Solutions and colligative properties, basic Thermodynamics and Electrochemistry produce clean computations. In Mathematics, Matrices and Determinants, Vectors and 3D Geometry, Probability and Statistics tend to give bounded answers, while Calculus-heavy Section B questions can be long.",
    },
    {
      type: "p",
      text: "None of this is a rule and all of it is a prior. The scan still decides. But going in knowing that a Statistics question is more likely to be quick than a definite-integral question makes the sort faster and more accurate. The underlying weightage patterns are set out in the [chapter-wise weightage guide](/blog/jee-main-chapter-wise-weightage).",
    },
    {
      type: "h2",
      text: "The Time Budget for Section B",
    },
    {
      type: "p",
      text: "Section B questions are usually slower per question than Section A, because there is no option list to short-circuit the work and every answer must be computed to a value. Budget accordingly rather than assuming a uniform rate across the paper.",
    },
    {
      type: "p",
      text: "A workable allocation is around two minutes per Section A question and closer to three for Section B, with a hard abandonment rule at four minutes. When a Section B question exceeds four minutes, leave it — the section is optional precisely so that you can. Candidates without an abandonment rule lose entire subjects to a single stubborn numerical, which is the failure mode described in the [time management guide](/blog/jee-main-time-management-in-exam).",
    },
    {
      type: "h2",
      text: "Practising Section B Specifically",
    },
    {
      type: "p",
      text: "Because the format differs, it needs its own practice rather than being absorbed incidentally. Two drills are worth building into your schedule.",
    },
    {
      type: "p",
      text: "The first is a triage drill: take ten past Section B questions from one subject, spend thirty seconds ranking them by expected difficulty, then solve them and check how good your ranking was. Most candidates are poor at this initially and improve quickly, and the skill transfers directly to the exam. The second is an entry drill: solve to a final value, and enter it on a screen with the rounding and units the question specifies, rather than stopping at a symbolic answer as one does on paper.",
    },
    {
      type: "p",
      text: "Both drills are best run against genuine past questions rather than test-series constructions, since the real papers calibrate answer format and computational load correctly. How to source and sequence those is covered in the [previous year question papers guide](/blog/jee-main-previous-year-question-papers), and the review discipline that makes them pay off in the [mock test strategy guide](/blog/jee-main-mock-test-strategy).",
    },
  ],
  faqs: [
    {
      question: "Is there negative marking in JEE Main Section B?",
      answer:
        "In recent cycles, yes — one mark is deducted for an incorrect numerical answer, unlike earlier years when Section B was penalty-free. Because there is no option list, a blind guess at a numerical value is close to pure loss. Confirm the rule in the bulletin for your cycle and assume the penalty applies when planning.",
    },
    {
      question: "Can I change which Section B questions I attempt?",
      answer:
        "Yes. Your attempted set is defined by the answers actually entered when you submit, not by the first five questions you opened. You can clear an entry and answer a different question instead. What you must never do is leave a slot unused — an empty Section B slot is four marks declined.",
    },
    {
      question: "How should I choose which 5 of 10 Section B questions to attempt?",
      answer:
        "Read all ten before solving any, spending about thirty seconds sorting them by expected difficulty. Two or three will usually be noticeably more tractable — a recognised configuration, a single-step application, a formula you know cold. Start with those. Starting at question one and solving until you have five answers is the most common and most expensive Section B mistake.",
    },
    {
      question: "How do I enter answers in JEE Main Section B?",
      answer:
        "On an on-screen numerical keypad, following the rounding and unit instructions stated in the paper — commonly to the nearest integer or a specified number of decimal places. Read the entered value back from the screen against your rough work once before moving on; transcription and rounding errors turn correct solutions into negative marks.",
    },
  ],
};

export default post;
