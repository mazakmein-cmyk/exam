import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "negative-marking-schemes-of-indian-exams-for-paper-setters",
  title: "Negative Marking Schemes of Indian Exams: What to Set, What to Look Up",
  metaTitle: "Negative Marking in Exams: List for Paper Setters | MockSetu",
  metaDescription:
    "Negative marking in exams, listed for paper setters: the JEE Main and SSC MTS schemes worth stating outright, and every exam you must read off the current official bulletin.",
  keywords:
    "negative marking in exams list, negative marking scheme, jee main negative marking, neet negative marking, ssc mts negative marking, upsc prelims negative marking, marking scheme for mock test, how much negative marking in competitive exams",
  excerpt:
    "The penalty is the first number you set on a paper and the last one anybody checks. Here are the schemes worth stating with confidence, and the ones no blog should be giving you a number for.",
  publishedAt: "2026-09-29",
  updatedAt: "2026-09-29",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. Never pair this with
    // "JEE Main" or "SSC MTS": those are student funnels and the first match
    // in CLUSTER_CTAS wins, which would send a paper setter to a mock library.
    "For Creators",
    "Marking & Timing",
    "negative marking",
    "exam patterns",
    "paper setting",
    "mock test design",
  ],
  hero: {
    eyebrow: "Paper Setter's Reference",
    h1: "Negative Marking Schemes of Indian Exams: What to Set, What to Look Up",
    lede: "Two marking schemes are worth stating outright, and a long list of exams where the honest answer is to open the bulletin. This page gives you both.",
  },
  content: [
    {
      type: "p",
      text: "Start with the two that can be stated outright. JEE Main Paper 1 awards +4 for a correct answer and deducts 1 for a wrong one, in both of its sections. SSC MTS deducts nothing in Session I and 1 mark per wrong answer in Session II. NEET UG's shape is settled - 180 compulsory questions, 720 marks, 180 minutes - but its deduction belongs with everybody else's, in the bulletin. Below is the detail behind those lines, plus a deliberately empty space where the other exams' numbers would go, because a mock built on a stale figure teaches the wrong risk appetite.",
    },
    {
      type: "ul",
      items: [
        "JEE Main Paper 1: +4 correct, -1 wrong, 0 unattempted, in Section A and Section B alike. 75 questions, 300 marks, 180 minutes.",
        "NEET UG: 180 compulsory questions, 720 marks, 180 minutes - so four marks a correct answer, by arithmetic. The deduction is not printed here; read it off the bulletin.",
        "SSC MTS: no penalty in the qualifying Session I, -1 per wrong answer in the merit-counting Session II. 90 questions, 270 marks, two sessions of 45 minutes.",
        "Every other exam, UPSC Prelims included: take the figure from the current official bulletin. This page does not print one.",
      ],
    },
    {
      type: "p",
      text: "This is written for the person building the paper, not the person sitting it. The marking scheme is the first thing you configure and the last thing anyone verifies, which is why it is the quietest error in a mock test: a wrong question count gets reported almost immediately, while a wrong penalty can run for a whole test series before anyone notices the ranks look odd. Keep the bulletin for the cycle your students are actually sitting open in a second tab. No platform, this one included, is the source of record for an exam body's own scheme.",
    },
    {
      type: "h2",
      text: "JEE Main Paper 1: +4 and -1, in Both Sections",
    },
    {
      type: "p",
      text: "The commonest mistake in a JEE Main mock is not the penalty itself - it is applying it to Section A only, or rebuilding a Section B that no longer exists in that shape.",
    },
    {
      type: "ul",
      items: [
        "75 questions in total: 25 each in Physics, Chemistry and Mathematics.",
        "Each subject splits into Section A with 20 MCQs and Section B with 5 numerical-answer questions.",
        "All 75 questions are compulsory. The old 'attempt any 5 of 10' choice in Section B was discontinued from the 2025 cycle - a paper that still offers that choice is a 2024 paper wearing a new date.",
        "The -1 applies in Section B exactly as it does in Section A.",
      ],
    },
    {
      type: "p",
      text: "The Section B penalty is worth being pedantic about. For years the numerical section was effectively a free-swing zone, and plenty of question banks still encode it that way. Leave Section B unpenalised and a student learns to type a half-remembered value into every numerical box - a habit that costs a mark per wrong numerical on the real paper, across all 15 of them if they do it everywhere. To see a +4/-1 paper behave on the student side, sit a [full-length JEE Main mock](/mock-test/jee-main) - but check the numbers against the bulletin, not against anybody's mock, this one included.",
    },
    {
      type: "h2",
      text: "NEET UG: 180 Compulsory Questions, and a Deduction You Look Up",
    },
    {
      type: "p",
      text: "NEET UG is the simplest of the three shapes to encode: 180 compulsory questions, 720 marks, 180 minutes, no sectional split to get wrong. The arithmetic pins down one half of the scheme on its own - 180 times 4 is 720, and there is nowhere else for the total to come from - but the deduction for a wrong answer is a separate clause, and this page will not print it for you. Get that clause right, because it is the number that decides whether a four-option guess is worth taking. A mock that punishes guessing harder than the real paper trains exactly the wrong instinct, and a mock that punishes it less trains the other wrong one. The candidate side of that sum is worked through in [negative marking strategy](/blog/negative-marking-strategy); your job is to make your numbers the ones it assumes.",
    },
    {
      type: "h2",
      text: "SSC MTS: Two Sessions, Two Different Rules in One Paper",
    },
    {
      type: "p",
      text: "SSC MTS breaks any platform where the marking scheme is a single paper-level setting, because the two halves of the paper do not share one.",
    },
    {
      type: "ul",
      items: [
        "Session I: 45 minutes, qualifying only, and NO negative marking.",
        "Session II: 45 minutes, counts towards merit, and carries -1 for every wrong answer.",
        "Because the sessions are timed separately, the clock belongs to each session, not to one 90-minute block.",
        "This shape is specific to MTS. Do not carry it over to SSC CGL, CHSL or anything else in the staff-selection family - read each one's own notice rather than assuming they share a structure.",
      ],
    },
    {
      type: "p",
      text: "One penalty for the whole paper is wrong in both directions at once: it either invents a penalty in the qualifying half or removes it from the half that decides the merit list. In MockSetu, marks for correct, wrong and unattempted are set once for the paper, overridden per section, and overridden again per question, with the narrowest setting winning. One paper can therefore carry two schemes without being split into two exams, and each section can carry its own clock in minutes.",
    },
    {
      type: "h2",
      text: "The Exams Where This Page Gives You No Number",
    },
    {
      type: "p",
      text: "UPSC Prelims, CAT, GATE, the banking exams, CUET, CLAT and the defence exams are deliberately absent above, and NEET UG's deduction is deliberately missing from its entry. Not because any of them lack a marking scheme, but because this page cannot verify the current one, and a figure that is quietly a cycle out of date is worse than no figure at all. Take these straight from the current bulletin, every cycle:",
    },
    {
      type: "ul",
      items: [
        "UPSC Prelims: do not copy a per-question deduction from memory or from a blog. Take three things off the notification - the penalty exactly as it is written there, the mark value of a question in the paper you are rebuilding, and which paper counts towards merit - and check whether any question type is excepted. A [UPSC Prelims mock](/mock-test/upsc-prelims) shows you the interface; the notification settles the arithmetic.",
        "NEET UG: the shape above is safe to copy, the deduction is not. Take the marking clause off the information bulletin for the cycle you are building for.",
        "CAT: the mix of question types in a paper, and whether every type carries a penalty, is set per cycle in the IIM bulletin.",
        "GATE: take the question types and the rule attached to each from that year's brochure, and check the specific paper you are rebuilding rather than assuming one rule covers them all.",
        "Banking exams such as IBPS and SBI: read the structure and the sectional timing off the notice for the exact stage and cycle you are rebuilding, and do not assume one stage carries over to another.",
        "CUET UG and PG: take the paper structure, the compulsory question count and the penalty from the current notice.",
        "CLAT, AILET, and the defence exams NDA, CDS and AFCAT: take section weights, per-question mark values and the penalty from each exam's own notice. There is no single 'defence exam penalty' to copy across them.",
      ],
    },
    {
      type: "p",
      text: "This is the part of the page worth more than the schemes above it. It is easy to find a page that prints a confident table of exams with no indication of when any row in it was last checked. Build from one and you get a mock that looks authoritative and scores wrongly, because nobody audits a number that looks confident.",
    },
    {
      type: "quote",
      text: "A mock with the wrong penalty does not just report a wrong score. It trains a student to guess at the wrong moment, and that habit turns up on the real paper.",
    },
    {
      type: "h2",
      text: "Why the Wrong Penalty Is Worse Than No Penalty At All",
    },
    {
      type: "p",
      text: "A student sitting your mock is not only checking what they know. They are calibrating one decision, repeated once per question: attempt or skip. That decision is a function of the penalty and almost nothing else. Set it too low and they rehearse marking everything, then walk into a paper that charges them for it. Set it too high and they leave attemptable questions blank under real pressure, because the instinct you trained says do not risk it.",
    },
    {
      type: "p",
      text: "A mock with no penalty is at least honest about being a knowledge check. A mock with a plausible but wrong penalty pretends to be the real thing. If you cannot verify the current scheme, say in the instructions that the paper uses a simplified one for practice - do not guess a fraction and let a student build a strategy on it.",
    },
    {
      type: "h2",
      text: "Setting the Scheme in the Paper You Are Building",
    },
    {
      type: "p",
      text: "Encoding a marking scheme is a handful of decisions best made before you type the first question, not after. The full walkthrough is in [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test); this is the short version.",
    },
    {
      type: "ul",
      items: [
        "Set marks for correct, wrong and unattempted at the narrowest level the paper actually needs - per section where a whole section differs, per question where one question does. SSC MTS alone needs two different rules inside one 90-question paper.",
        "For a multi-correct question, decide part marks or all-or-nothing before you write the options. The two produce very different score distributions from identical answers.",
        "If you allow part marks, decide whether a wrong option is charged once for the question or once per wrong option ticked, and pick a rounding rule - down, nearest, up, or exact, which does not round at all.",
        "Give each section its own clock in minutes, and pool sections under one shared clock only where the real exam does.",
        "Write the penalty into the instructions in the words the bulletin uses. If your paper says -1 and your instructions say one-third, students will believe the instructions.",
        "Check the arithmetic: questions times marks per correct should equal the total you claim. 180 x 4 = 720. 75 x 4 = 300. If it does not land, something in the section setup is wrong.",
      ],
    },
    {
      type: "p",
      text: "MockSetu warns you at publish time when the instructions no longer match the paper, but know what that check covers: it compares the timing and the section shape, not the penalty. A scheme you changed halfway through editing will not be flagged for you, so the instructions page is still yours to re-read. What the platform does enforce is coverage - if some questions carry marks and others do not, publishing is blocked outright, because a half-marked paper quietly ranks everyone by correct count instead.",
    },
    {
      type: "p",
      text: "One import caveat bites specifically on marking schemes. If you bulk-load a paper with MockSetu's extraction prompt from the [JSON upload guide](/json-upload-guide), numeric, TITA and match-the-column questions arrive as numbered placeholders rather than finished questions: the slot holds its place so the numbering still matches the PDF, but the options come through as two sentinel strings and the correct answer comes through unset. Where the source printed a key, the import preview lists it against the question so you need not reopen the PDF - the real options and the answer you type in by hand in the editor. On a JEE Main paper that is exactly the 15 Section B questions carrying -1, so budget for rebuilding those and setting their marks after the import rather than before it.",
    },
    {
      type: "h2",
      text: "A Pre-Publish Check Before the Paper Goes Out",
    },
    {
      type: "p",
      text: "Run this list before anyone attempts the paper. It catches the errors that get expensive once attempts exist.",
    },
    {
      type: "ul",
      items: [
        "Read the marking clause in the current bulletin word for word against your settings. Not last year's bulletin.",
        "Confirm the penalty on the question types that usually escape it: numericals, multi-correct, and any qualifying-only section.",
        "Confirm every section's time adds up to the official total and that auto-submit behaves as the real paper does - [building a timed test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) covers the clock side.",
        "Check the question count and marks total against the published pattern; [mock test format for competitive exams](/blog/mock-test-format-for-competitive-exams-reference) is the companion page for that half of the job.",
        "Open the first and last question of every section and read their marks off the question itself. Those two are where a bulk edit usually stopped short.",
        "Walk the paper in preview to see what a student sees - but note that a creator preview is not graded: nothing is scored or stored, so it will not hand you a total to check the arithmetic against.",
        "Read the instructions page as a student would. If the penalty is not stated there in plain words, it does not exist as far as the candidate is concerned.",
      ],
    },
    {
      type: "h2",
      text: "Fixing a Scheme, and Carrying One Into the Next Cycle",
    },
    {
      type: "p",
      text: "A wrong answer key is half-recoverable, and the half matters. The review page re-checks every answer against the key as it stands now, so the correct count and the accuracy on an attempt recorded last week follow your correction - but the marks total was computed and written at submission, and it stays where it was. A wrong marking scheme is the same story with none of the consolation: fix it, tell the batch, and re-run or reissue the paper rather than hoping old attempts reinterpret themselves. Two limits shape what you can promise afterwards: creator analytics are per-question aggregates plus a top-three leaderboard, with no CSV or Excel export and no per-student report card to hand out; and a published paper sits in the public library, so a mock built for one batch is not private to it.",
    },
    {
      type: "p",
      text: "When a pattern changes, the fastest repair is to duplicate last cycle's paper and edit it, which is also how a [previous year paper becomes a usable mock](/blog/how-to-create-a-previous-year-paper-mock-test) instead of a museum piece. A duplicate carries the questions, the sections, the instructions and the marking scheme with it - exam default, section overrides and per-question overrides alike - so you are editing a working paper rather than rebuilding one. That copy of the marks is deliberately fail-soft, though, which means it can come up short without stopping the duplicate, so spot-check the scheme on the copy before you trust it. While you are there, re-read the marking clause, the question count, and whether any section has become qualifying or stopped being so. Those three lines are where almost every pattern change lands.",
    },
    {
      type: "p",
      text: "If you set papers regularly, [what MockSetu gives a paper setter](/for-creators) is free and needs no card: marks for correct, wrong and unattempted set per paper, per section or per question, part-marks rules for multi-correct questions, a clock per section with pooled timing where you need it, a drift warning when the instructions stop matching the paper's timing or shape, and a preview that walks your own paper without recording anything. What it will not do - and what nothing should claim to do - is tell you this year's official penalty. Open the bulletin.",
    },
  ],
  faqs: [
    {
      question: "What is the negative marking in JEE Main and NEET?",
      answer:
        "JEE Main Paper 1 awards +4 for a correct answer and deducts 1 mark for a wrong one, with no penalty for leaving a question unattempted. That -1 applies in Section B's numerical questions as well as Section A's MCQs, and all 75 questions are compulsory since the 'attempt any 5 of 10' choice was discontinued from the 2025 cycle. NEET UG runs 180 compulsory questions for 720 marks in 180 minutes, which fixes a correct answer at four marks, but this page does not print its deduction - take that clause from the current information bulletin for the cycle your students are sitting, and confirm the JEE Main figures there too before you publish a paper to a batch.",
    },
    {
      question: "Does SSC MTS have negative marking?",
      answer:
        "In one half of the paper only. Session I is 45 minutes, qualifying in nature, and carries no negative marking. Session II is also 45 minutes, counts towards the merit list, and deducts 1 mark for each wrong answer. The paper runs to 90 questions and 270 marks overall. A mock that applies one penalty across both sessions misrepresents the exact decision a candidate is practising, so set the marks per section, or per question, rather than once for the whole paper.",
    },
    {
      question: "How much is deducted for a wrong answer in UPSC Prelims?",
      answer:
        "This page deliberately does not print a figure for it. UPSC Prelims sits outside the small set of patterns stated outright here, and a penalty copied from a blog is exactly the kind of number that is quietly a cycle out of date. Read it off the notification for the cycle your students are actually sitting, together with the mark value of a question in the paper you are rebuilding and which paper counts towards merit - those three decide the arithmetic between them. Check as well whether any question type in that paper is excepted from the penalty rather than assuming it applies to every question.",
    },
    {
      question: "Why does this article refuse to give the negative marking for CAT, GATE or the banking exams?",
      answer:
        "Because this page cannot verify the current figure for them, and an unverified number printed confidently is more harmful than no number at all. Question type mixes, sectional timing and per-question mark values are all set per cycle for CAT, GATE, IBPS and SBI, CUET, CLAT, UPSC Prelims and the defence exams, and each of those papers restates its own rule. Take the figure from the current official information bulletin for the cycle your students are sitting. A confident but stale table is the most dangerous thing a paper setter can build from, because nobody audits a number that looks authoritative.",
    },
    {
      question: "Should a mock use the official penalty even when it looks harsh for a weak batch?",
      answer:
        "Yes, if you are presenting the paper to students as a mock of that exam. The penalty is the one setting that trains the attempt-or-skip instinct, and a gentler mock rehearses a decision the real paper will punish. Building a softer paper for an early batch is a legitimate thing to do - just say so in the instructions, as a practice paper with a simplified scheme, instead of letting students assume it mirrors the exam. A paper that is honest about being easier teaches more than one that quietly is.",
    },
    {
      question: "What happens to scores already recorded if I correct the answer key?",
      answer:
        "Partly. The review page checks every stored answer against the key as it stands now, so correcting the key moves the correct count and the accuracy on attempts already recorded. The marks total does not move with it: that figure is computed and written when the student submits, and it stays as written. A marking scheme that was wrong from the outset is frozen the same way and should be handled openly - fix the scheme, tell the batch, and re-run or reissue the paper rather than assuming old attempts will reinterpret themselves under new rules.",
    },
  ],
};

export default post;
