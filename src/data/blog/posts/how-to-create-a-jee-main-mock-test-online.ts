import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-jee-main-mock-test-online",
  title: "How to Create a JEE Main Mock Test Online: Pattern, Marking, Sections",
  metaTitle: "Create a JEE Main Mock Test Online: Pattern, Marking | MockSetu",
  metaDescription:
    "Build a JEE Main Paper 1 mock: three subject sections of 25, 180 minutes for the whole paper, plus four minus one in both sections, and numerical answers that score.",
  keywords:
    "jee main mock test create, how to create jee main mock test online, jee main paper 1 pattern for paper setters, section b numerical questions online test, jee main marking scheme mock, free jee main test series platform, online mock test for jee coaching",
  excerpt:
    "Three subject sections of 25, 180 minutes for the paper as a whole, and the same plus four minus one everywhere. Here is how to build that, and why Section B carries the same penalty as Section A.",
  publishedAt: "2026-10-21",
  updatedAt: "2026-10-21",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "JEE Main" or "SSC MTS" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "JEE",
    "question paper setting",
    "mock test",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a JEE Main Mock Test Online: Pattern, Marking, Sections",
    lede: "Three subject sections of 25 questions, 180 minutes for the paper as a whole, and a single marking rule that covers all of it. Build it in that order and the paper is right before you type a question.",
  },
  content: [
    {
      type: "p",
      text: "A JEE Main Paper 1 mock is three subject sections of 25 questions each, 180 minutes for the paper as a whole rather than a time per subject, and plus four for a right answer and minus one for a wrong one on every question in it. That is 75 questions and 300 marks. Build it in that order - sections, clock, one marking default - and the structure is right before a single question goes in.",
    },
    {
      type: "p",
      text: "This is written for the person setting the paper. For the candidate's view, and for papers already published to practise on, send students to [JEE Main mock tests](/mock-test/jee-main) instead.",
    },
    {
      type: "h2",
      text: "The Paper You Are Reproducing",
    },
    {
      type: "p",
      text: "Paper 1 has a shape worth stating exactly, because almost every setter error below is a drift away from one of these lines.",
    },
    {
      type: "ul",
      items: [
        "Three subjects - Physics, Chemistry, Mathematics - 25 questions each, 75 in all.",
        "Section A in each subject: 20 multiple-choice questions.",
        "Section B in each subject: 5 numerical-answer questions.",
        "Every question compulsory. The old \"attempt any 5 of 10\" choice in Section B was discontinued from the 2025 cycle.",
        "Plus four for a correct answer and minus one for a wrong one, in Section A and Section B alike.",
        "300 marks, 180 minutes.",
      ],
    },
    {
      type: "p",
      text: "Read the current bulletin before you build anyway. Patterns move, and a mock faithful to last year is worse than none - the candidate rehearses an exam that no longer exists. Paper 2 is a different paper and nothing here describes it.",
    },
    {
      type: "h2",
      text: "Lay Out Three Sections, One per Subject",
    },
    {
      type: "p",
      text: "Create the exam, add a section and rename it Physics, then repeat for Chemistry and Mathematics. A new section arrives with 60 minutes on it. Leave that alone for now - the next step takes the clock off the sections entirely.",
    },
    {
      type: "p",
      text: "The real decision is where Section A and Section B go, and two layouts work. Three sections, one per subject, with the 20 multiple-choice questions first and the 5 numericals after, is fewer rows to maintain and fewer language twins to keep in step on a bilingual paper. Six sections - Physics A, Physics B and so on - makes the split visible, because the instructions table prints one row per section with its question count. Pick six only if you want candidates to see the split spelled out, and either way keep question order inside a subject matching the source paper.",
    },
    {
      type: "h2",
      text: "The Clock: One Paper, or One per Section",
    },
    {
      type: "p",
      text: "One setting decides how the whole mock is clocked, so take it from the bulletin rather than from habit. By default an exam is locked: a candidate sits one section at a time, each on its own clock, and a submitted section stays closed. Turn section switching on and the paper becomes one clock with free movement between sections. The pattern above gives a single 180-minute duration for all three subjects and no per-subject time, so one paper clock is the setting that reproduces it - confirm against your cycle's bulletin before you commit.",
    },
    {
      type: "p",
      text: "Turning it on when no paper total is set seeds that total from the sum of the section clocks. Three subject sections left at the 60-minute default sum to exactly 180 - but type 180 in deliberately rather than relying on the coincidence, because it stops being true the moment you add a section. Each section row then shows \"Timed as one paper\" where its minutes box was, and the stored minutes come back untouched if you switch back.",
    },
    {
      type: "p",
      text: "One consequence shows up on the student's instructions screen: the paper table drops its Sectional Timing column, because a paper on one clock has no sectional timings to print. It still lists each section with its question count, adds a Maximum Marks column once a marking scheme is set, and closes with a total row - all built from the live exam rather than from your prose, so it cannot go stale. How the countdown behaves when it runs out is covered in [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit).",
    },
    {
      type: "h2",
      text: "One Marking Default Covers All 75 Questions",
    },
    {
      type: "p",
      text: "Because both sections carry the same plus four and minus one, the marking needs one exam-level default and nothing else: no section overrides, no per-question overrides. The marks panel has a preset for exactly these numbers, labelled JEE / NEET style, which sets right, wrong and blank in one tap. Set it at exam level and stop there.",
    },
    {
      type: "p",
      text: "One error is worth naming on its own: Section B built as the free-guessing section, its wrong-answer value left at zero because typing a number feels different from ticking an option. It is not different. A paper where a candidate can fire a value at all 15 numericals at no cost rewards the guess the real paper charges for. Leave the blank value at zero - skipping costs nothing here - and the wrong value at one.",
    },
    {
      type: "p",
      text: "Resist per-question overrides. A question given its own rule is pinned and keeps that rule when you later change the exam default, which is a quiet way to end up with a paper that does not add to 300. The marks panel prints a projected total in its header; read it before you close the panel and confirm it says 300. The mechanics of overrides, part marks and rounding are in [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test).",
    },
    {
      type: "quote",
      text: "A mock that lets a candidate guess freely through Section B is not a JEE Main mock. It is an easier exam wearing the same name, and the candidate finds out in the hall.",
    },
    {
      type: "h2",
      text: "Entering the Section B Numericals",
    },
    {
      type: "p",
      text: "Set a Section B question's type to Numeric. The correct answer becomes a plain box you type the value into rather than an option picker, and the candidate gets a number field instead of radio buttons. Nothing else changes - text, figures and marks work the same way.",
    },
    {
      type: "p",
      text: "Three behaviours matter before you key in an answer. Answers are compared after a numeric clean-up, so 5.0, 05 and +5 all count as 5. The comparison is then exact - there is no tolerance band, so if the official key allows a range you must choose one value and state the expected rounding in the instructions. And typing into the box then clearing it stores a cleared answer, scored as a blank rather than a wrong attempt, which is the right default where a blank costs nothing and a wrong answer costs a mark.",
    },
    {
      type: "h2",
      text: "Equations and Figures, Which This Paper Is Full Of",
    },
    {
      type: "p",
      text: "A physics and maths paper typed as plain text is unreadable, so the editor has a maths button that takes LaTeX and renders it: a live preview before you insert, quick-insert buttons for the common shapes, and a searchable formula library grouped by topic you can copy from. Equations render the same way in the question, in the options and on the student's screen. The walk-through is in [how to add math equations to online test questions](/blog/how-to-add-math-equations-to-online-test-questions).",
    },
    {
      type: "p",
      text: "Diagrams are different: a ray diagram or an organic structure is not text and should not be retyped. Working from a PDF, upload it to the section and snip the figure straight off the page into the question. Building in bulk from JSON, the extraction records each figure's page and bounding box and the upload crops the picture out of your PDF for approval - the image is not inside the JSON file, so keep the PDF to hand. The format and the prompt are on the [JSON upload guide](/json-upload-guide).",
    },
    {
      type: "h2",
      text: "Three Mistakes Specific to JEE Main",
    },
    {
      type: "ul",
      items: [
        "Leaving section switching off without deciding to. The paper then runs as three locked sittings on three clocks, a candidate who finishes Physics early cannot bank the time, and a submitted section stays shut - a different paper from one of 180 minutes. It reads as a minor setting and it changes what you have built.",
        "Leaving Section B unpenalised. Both sections carry minus one, and a numerical section at zero penalty hides who is guessing.",
        "Rebuilding the old Section B choice - ten numericals with any five to attempt. All five are compulsory from the 2025 cycle, and offering a choice trains a habit the real paper punishes.",
      ],
    },
    {
      type: "h2",
      text: "Before You Publish",
    },
    {
      type: "p",
      text: "Five checks, in the order they catch things.",
    },
    {
      type: "ul",
      items: [
        "Read the paper table on the instructions page as a student would. The per-section counts and the total should match the paper you meant to build.",
        "Confirm the marking covers the whole paper. Marks on only part of it block publishing outright, and the dialog names the sections with holes - fix those rather than stripping marks off everything.",
        "Read the instruction-drift warning if one appears. It checks the timing claims in your instruction text against the live exam, and the section and question counts where that text came from Generate from exam. It warns without blocking, so instructions describing an older paper can still go out.",
        "Open the paper yourself and work through a few questions, including one Section B numerical. A creator opening their own exam gets a preview: fully browsable, but nothing is recorded or graded, so there is no score to read and no attempt left behind in the analytics.",
        "If you duplicated last month's mock, check the copy. A duplicate does carry the marking scheme, the timing groups and the language links, but it is best-effort by design.",
      ],
    },
    {
      type: "h2",
      text: "What This Cannot Do, Said Plainly",
    },
    {
      type: "p",
      text: "A published paper is public. Anyone with the link can attempt it, there is no private delivery to one batch and no paywall, so a JEE Main mock you publish is one the whole internet can sit. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - no question shuffling and no cap on attempts, and no CSV or Excel export of results. The importer handles multiple-choice questions only: numerical and match-the-column questions arrive as placeholders to fill in by hand, which here means the 15 Section B questions are manual work whichever route you take. Server-side extraction from a PDF is off by default and switched on per creator on request; the universal route is the published prompt plus a JSON upload, and it only extracts from a paper you supply - it will not write JEE questions from a syllabus.",
    },
    {
      type: "p",
      text: "None of that stops an accurate free mock from being worth publishing. It does mean building the paper to be honest rather than to be policed. [Everything a creator can build here](/for-creators) - sections, one paper clock, bilingual papers, a listing in the public library - sits behind one free account, and a correct JEE Main mock is a morning's work once the pattern above is in front of you.",
    },
  ],
  faqs: [
    {
      question: "How do I create a JEE Main mock test online?",
      answer:
        "Create an exam, add three sections named Physics, Chemistry and Mathematics with 25 questions each, turn section switching on so the whole paper runs on one 180-minute clock, and set a single exam-level marking default of plus four for a right answer and minus one for a wrong one. That gives you 75 questions and 300 marks. Enter the five numerical questions in each subject as Numeric type, where you type the answer value instead of picking an option.",
    },
    {
      question: "Should a JEE Main mock have sectional timing?",
      answer:
        "Take it from the bulletin for your cycle. The established pattern gives one duration for Paper 1 - 180 minutes for all three subjects - and no per-subject time, so a single paper clock is what reproduces it. In the product that is section switching on: it replaces the per-section clocks with one paper clock and lets students move across sections, and the instructions page then drops its Sectional Timing column. Leave switching off and you get the opposite - one section at a time, each on its own clock, a submitted section closed for good.",
    },
    {
      question: "Does Section B of JEE Main have negative marking?",
      answer:
        "Yes. Section A and Section B both carry plus four for a correct answer and minus one for a wrong one, and all questions are compulsory - the older arrangement where a candidate attempted any five of ten numericals was discontinued from the 2025 cycle. Set one marking default at exam level and let both sections inherit it. Leaving the numerical section at a zero penalty turns Section B into free guessing, which the real paper does not allow.",
    },
    {
      question: "How do I add numerical-answer questions to an online mock test?",
      answer:
        "Set the question type to Numeric. The correct answer becomes a box you type the value into, and the student gets a number field rather than options. Answers are matched after a numeric clean-up, so 5.0, 05 and +5 all read as 5, but the comparison is exact after that - there is no tolerance band, so if the official key allows a range you must pick one value and state the expected rounding in the instructions.",
    },
    {
      question: "Can I upload a JEE Main PDF and get a mock test automatically?",
      answer:
        "Partly. You can run the published extraction prompt on your own PDF in whatever AI tool you already use and upload the resulting JSON, which brings in the multiple-choice questions and crops figures out of your PDF for approval. Numerical, match-the-column and similar types arrive as placeholders for manual entry, so the Section B questions are hand work. Server-side extraction inside the product is off by default and enabled per creator on request, and nothing here generates questions from a syllabus - it only extracts from the paper you supply.",
    },
  ],
};

export default post;
