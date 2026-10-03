import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "jee-main-numerical-value-questions",
  title: "JEE Main Section B: Numerical Value Questions Are Now Compulsory",
  metaTitle: "JEE Main Section B: 5 Compulsory Numericals, +4/-1 | MockSetu",
  metaDescription:
    "JEE Main Section B now has 5 compulsory numerical value questions per subject, marked +4 and -1. How to enter answers, avoid rounding traps, and when to leave one blank.",
  keywords:
    "JEE Main section B, JEE Main numerical value questions, JEE Main NVQ strategy, JEE Main section B compulsory, JEE Main numerical questions negative marking, JEE Main integer type questions, JEE Main 75 questions pattern",
  excerpt:
    "Section B used to be the one place in JEE Main where you could walk away from a hard question for free. That option is gone. Fifteen numericals, all compulsory, +4 for right and -1 for wrong.",
  publishedAt: "2026-08-19",
  updatedAt: "2026-10-03",
  readingMinutes: 10,
  category: "Exam Strategy",
  tags: ["JEE Main", "Section B", "Numerical Questions", "Exam Strategy", "Negative Marking"],
  hero: {
    eyebrow: "Exam Strategy",
    h1: "JEE Main Section B: Numerical Value Questions Are Now Compulsory",
    lede:
      "Sixty of the three hundred marks sit in a section with no options to work backwards from and no choice about which questions you face. Every numerical is yours, and every wrong entry costs a mark.",
  },
  content: [
    {
      type: "h2",
      text: "What Section B Is",
    },
    {
      type: "p",
      text: "JEE Main Paper 1 carries 75 questions — 25 in each of Physics, Chemistry and Mathematics. Each subject splits into Section A, which is 20 multiple-choice questions, and Section B, which is 5 numerical-value questions. All 75 are compulsory. Across three subjects that is 15 numericals worth four marks each: 60 marks, a fifth of the paper, in a format that behaves differently from everything else on the screen.",
    },
    {
      type: "p",
      text: "The structural difference that matters is the absence of options. You compute a value and type it on an on-screen keypad. There is no list of four to sanity-check your answer against, no working backwards from the choices, no eliminating two and picking between the rest, and no partial rescue from a lucky guess. Almost every rule in this guide follows from that single fact.",
    },
    {
      type: "h2",
      text: "The Optional Structure Was Discontinued From the 2025 Cycle",
    },
    {
      type: "p",
      text: "If you have been preparing from older material, you may have learnt a different Section B. For several cycles up to 2024, each subject offered 10 numerical-value questions of which you attempted any 5 — 90 questions on screen, 75 attempted, with the five you ignored costing nothing. Section B also carried no negative marking in that era. NTA removed both features from the 2025 cycle, and the paper has run on the current structure ever since.",
    },
    {
      type: "ul",
      items: [
        "Then: 10 numerical questions per subject, attempt any 5, no penalty for a wrong value.",
        "Now: 5 numerical questions per subject, all compulsory, +4 for correct and -1 for incorrect.",
        "Then: 90 questions printed, 75 attempted, 300 marks.",
        "Now: 75 questions printed, 75 compulsory, 300 marks.",
        "Unchanged: 180 minutes, four marks a question, no physical calculator, an on-screen keypad for numerical entry.",
      ],
    },
    {
      type: "p",
      text: "This is not a cosmetic change, and any coaching handout, PDF or senior's advice that still tells you to pick your best five numericals is describing an exam that no longer exists. The current marking scheme in full is set out in the [exam pattern guide](/blog/jee-main-exam-pattern-and-marking-scheme).",
    },
    {
      type: "h2",
      text: "Why the Old Advice Now Loses You Marks",
    },
    {
      type: "p",
      text: "Under the old rule, a doubtful numerical was free to abandon. There were ten on offer, you only needed five, and the five you never opened did nothing to your score. The whole skill was triage: scan all ten, rank them, solve the tractable ones, discard the rest. That skill is now worthless, because there is nothing to discard into. The five numericals in front of you are the five you get.",
    },
    {
      type: "p",
      text: "Worse, the old habit actively costs marks in two ways. A candidate who still believes Section B is penalty-free will enter a value on every numerical regardless of confidence, which under -1 marking converts wild guesses into deductions. A candidate who still believes the section is optional will walk away from a numerical at the first sign of difficulty, which now banks a clean zero on a question that was always going to be counted. Both behaviours were correct in 2024 and both are mistakes in 2027.",
    },
    {
      type: "h2",
      text: "The Expected-Value Call: Commit or Leave Blank",
    },
    {
      type: "p",
      text: "With no choice about which questions you face, the only decision left on a numerical is whether to enter the value you have or leave the response empty. That is a genuine expected-value call, and the arithmetic is simple enough to carry into the hall.",
    },
    {
      type: "p",
      text: "A blank response scores zero. An entered value scores +4 if it is right and -1 if it is wrong. So entering is worth it whenever your probability of being correct, p, satisfies 4p minus 1 times (1 minus p) being greater than zero — that is, whenever p is above 0.2. One chance in five is the break-even line.",
    },
    {
      type: "p",
      text: "The trap is that one in five sounds generous, and on a four-option MCQ it very nearly is. On an unbounded numerical it is not. There are no options, so a hunch about the magnitude is not a one-in-five shot; it is close to zero. The 0.2 line is only ever cleared by a question you actually solved. The real distinction is therefore not confident versus unsure — it is finished versus unfinished.",
    },
    {
      type: "ul",
      items: [
        "Enter it: you completed the computation and got a clean value, even if you are uneasy about one algebraic step.",
        "Enter it: you solved it twice by the same route and got the same number both times.",
        "Enter it: your value is physically sensible — the right order of magnitude, the right sign, a mass that is positive, a probability between 0 and 1.",
        "Leave it blank: you ran out of time mid-derivation and the value on your sheet is an intermediate result, not the answer.",
        "Leave it blank: you cannot resolve which of two values the question is asking for, and you have no basis for choosing.",
        "Leave it blank: the number you have is a guess at the magnitude rather than the output of a method.",
        "Never enter a placeholder like 0 or 1 just to avoid an empty box. Under -1, an unconsidered entry is strictly worse than silence.",
      ],
    },
    {
      type: "p",
      text: "One more case deserves its own rule. If you solved the question correctly but are unsure of the rounding convention, enter it anyway — a correct method with a doubtful last decimal clears 0.2 comfortably. The general logic for pricing a risky attempt is the same one that governs Section A, and it is worked through in the [negative marking strategy guide](/blog/negative-marking-strategy).",
    },
    {
      type: "h2",
      text: "Answer Format: The Errors That Turn Correct Solutions Into Minus One",
    },
    {
      type: "p",
      text: "A correct method entered incorrectly now scores minus one, exactly like a wrong method. Under the old penalty-free Section B these slips merely wasted a slot; today each one is a five-mark swing away from the answer you deserved. All of them are mechanical and all of them are avoidable.",
    },
    {
      type: "ul",
      items: [
        "Rounding: the paper states how the answer is to be entered — commonly to the nearest integer, or to a stated number of decimal places. Read that instruction on the day and follow it exactly rather than from habit.",
        "Integer versus decimal: when the answer is specified as an integer, 4 is the entry and 4.00 is not what was asked for. When two decimals are specified, 4 should be entered as 4.00.",
        "Units: the question states the unit the answer is expected in. Computing cleanly in SI and entering metres where centimetres were wanted is now a minus-one, not a zero.",
        "Scientific notation: where a question asks for the coefficient against a stated power of ten, enter only the coefficient. Typing the full value into a box that wanted 6.6 is a complete loss.",
        "Sign: negative values are entered with the keypad's own minus key. A dropped minus sign is the single most common numerically-correct failure in Physics.",
        "Transcription: read the entered value back off the screen against your rough work, digit by digit, once. This habit catches more errors than any other single check.",
        "Keypad slips: the on-screen keypad is not your phone and not a keyboard, and a mis-tapped digit has no option list to catch it.",
      ],
    },
    {
      type: "h2",
      text: "The On-Screen Keypad and How to Verify an Entry",
    },
    {
      type: "p",
      text: "Numerical answers are typed with a virtual keypad rendered beside the question: the digits, a decimal point, a minus sign, a backspace, and nothing else. There is no physical calculator and no scientific functions, so every value must be computed on your rough sheet and only the final number typed in. Candidates who practise exclusively on paper meet this interface for the first time in the hall and lose time to it.",
    },
    {
      type: "p",
      text: "Three interface habits are worth drilling until they are automatic. First, an entry is not recorded until you press Save and Next — typing a value and clicking away through the palette can leave the question unanswered. Second, Clear Response genuinely empties the box, which is how you convert a bad entry back into a zero rather than a minus one, so use it deliberately when you decide late that a value was a guess. Third, Mark for Review and Save still saves the answer; a question flagged for review with a value in it is counted, and the palette shows that state in its own colour.",
    },
    {
      type: "p",
      text: "None of this surfaces in PDF practice. It surfaces immediately in a simulator that reproduces the real keypad and palette behaviour, which is what the [free JEE Main mock test](/mock-test/jee-main) is for, and the full interface walkthrough sits in the [exam interface and CBT practice guide](/blog/jee-main-exam-interface-and-cbt-practice).",
    },
    {
      type: "h2",
      text: "Time Budget Now That You Cannot Walk Away",
    },
    {
      type: "p",
      text: "Section B questions are usually slower per question than Section A, because there is no option list to short-circuit the work and every answer must be carried through to a number. Budget around two minutes for a Section A question and closer to three for a Section B one, and you will have spent roughly 45 minutes of your 180 on the 15 numericals.",
    },
    {
      type: "p",
      text: "What changes is the abandonment rule. Under the old structure, a numerical that crossed four minutes could simply be dropped, because another question was waiting to take its place. Nothing is waiting now. So the rule becomes park, not drop: at four minutes, mark the question for review, move on, and return in your final pass with whatever time the rest of the paper left you. A question parked at four minutes and finished at minute 160 pays the same four marks as one solved immediately. A question abandoned outright pays nothing and cannot be swapped for anything. The surrounding pacing system is laid out in the [time management guide](/blog/jee-main-time-management-in-exam).",
    },
    {
      type: "h2",
      text: "You Can No Longer Dodge a Weak Chapter",
    },
    {
      type: "p",
      text: "Under the optional structure, a candidate weak in one area could reasonably hope to route around it — if the hard numerical came from Rotational Motion, there were nine others to choose from. With five compulsory questions per subject, a chapter you refuse to prepare is a chapter that can simply take four marks off you, and there is no selection step to protect you.",
    },
    {
      type: "p",
      text: "That makes coverage, not cleverness, the Section B strategy. In Physics the numericals cluster in Modern Physics and Semiconductors, Electrostatics and Current Electricity, Rotational Motion and Kinematics. In Chemistry they come overwhelmingly from Mole Concept, Solutions and colligative properties, Thermodynamics, Chemical Kinetics and Electrochemistry — the calculation-heavy physical chemistry that many candidates leave until last. In Mathematics, Matrices and Determinants, Vectors and 3D Geometry, Probability and Statistics give bounded numerical answers, with Calculus supplying the longer ones. None of this is a rule and all of it is a prior, but it tells you where an unprepared chapter will actually cost you. The weightage data behind it is in the [chapter-wise weightage guide](/blog/jee-main-chapter-wise-weightage).",
    },
    {
      type: "h2",
      text: "Practising Section B Specifically",
    },
    {
      type: "p",
      text: "Because the format differs from everything else in the paper, it needs its own practice rather than being absorbed incidentally. Three drills are worth building into your schedule.",
    },
    {
      type: "p",
      text: "The entry drill: solve to a final value and then actually enter it on a screen, with the rounding, sign and units the question specified, instead of stopping at a symbolic answer as one does on paper. The calibration drill: before checking a practice set of numericals, write down for each whether you expect it to be correct, then score yourself. Most candidates discover they are badly overconfident the first few times, and the point of the drill is to learn where your personal one-in-five line actually sits, so that the commit-or-blank decision in the hall is informed rather than emotional. The recovery drill: deliberately practise parking a question at four minutes and returning to it, because an unpractised return costs two minutes of re-reading that a practised one does not.",
    },
    {
      type: "p",
      text: "Run all three against genuine past papers rather than test-series constructions, since the real papers calibrate answer format and computational load correctly — though note that papers from the 2021 to 2024 cycles will show ten numericals per subject, so treat all ten as compulsory practice; 2020 papers already carried five, and papers from 2019 and earlier have no numerical-value section at all. How to source and sequence them is covered in the [previous year question papers guide](/blog/jee-main-previous-year-question-papers), and the review discipline that makes them pay off in the [mock test strategy guide](/blog/jee-main-mock-test-strategy).",
    },
  ],
  faqs: [
    {
      question: "Is JEE Main Section B still optional — can I attempt any 5 of 10?",
      answer:
        "No. NTA discontinued the optional structure from the 2025 cycle, and it has not returned for 2026 or 2027. Each subject now has exactly 5 numerical-value questions in Section B and all of them are compulsory, so the paper is 75 questions in total with nothing to choose between.",
    },
    {
      question: "Is there negative marking in JEE Main Section B?",
      answer:
        "Yes. Section B is marked +4 for a correct answer and -1 for an incorrect one, exactly like Section A. An unanswered numerical scores zero. Under the older optional structure Section B carried no penalty, which is why a lot of circulating advice is wrong on this point.",
    },
    {
      question: "How many numerical value questions are there in JEE Main?",
      answer:
        "Fifteen — 5 each in Physics, Chemistry and Mathematics. At four marks apiece that is 60 of the 300 marks on offer, and every one of them is compulsory.",
    },
    {
      question: "Should I guess a numerical answer I am not sure about?",
      answer:
        "Only if you actually solved it. Entering is worth it when your chance of being right is better than one in five, and a completed computation you feel shaky about usually clears that line. A guess at the magnitude does not, because an unbounded numerical gives you no one-in-four rescue the way an MCQ does. If the number on your sheet is an intermediate result rather than an answer, leave the box empty and take the zero.",
    },
    {
      question: "How do I enter answers in JEE Main Section B?",
      answer:
        "On an on-screen numerical keypad with digits, a decimal point and a minus sign, following the rounding and unit instructions stated in the question — commonly to the nearest integer or a specified number of decimal places. Press Save and Next to record the value, then read it back off the screen against your rough work once. Transcription and rounding errors now cost a mark each, not just the four you earned.",
    },
  ],
};

export default post;
