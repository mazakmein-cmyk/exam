import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-cat-mock-test-online",
  title: "How to Create a CAT Mock Test Online: Sectional Lock and Set-Based Questions",
  metaTitle: "Create a CAT Mock Test Online: Sectional Lock | MockSetu",
  metaDescription:
    "Build a CAT mock online: one section at a time on its own clock, switching locked off, passage sets repeated per question, and typed numeric answers that grade.",
  keywords:
    "cat mock test create, create cat mock test online, sectional timing online test, passage based questions online test, tita numeric answer online exam, cat mock test maker, mba entrance mock test creation, online test with locked sections",
  excerpt:
    "A CAT mock is three build problems: sections that lock, passages shared across a set, and typed numeric answers. Here is how each one works, and why the pattern itself has to come off the bulletin.",
  publishedAt: "2026-10-22",
  updatedAt: "2026-10-22",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "CAT",
    "sectional timing",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a CAT Mock Test Online: Sectional Lock and Set-Based Questions",
    lede: "Three build problems separate a CAT mock from a generic MCQ test: sections that lock, a passage shared across a set, and answers the candidate types rather than picks. None are hard once you know where they live.",
  },
  content: [
    {
      type: "p",
      text: "To create a CAT mock test online, make one exam, add one section for each section of the real paper, type that section's own time limit on its row, and leave section switching off. That toggle is the sectional lock: one section at a time, each on its own clock, and a submitted section cannot be reopened. Two more pieces turn it into a CAT paper rather than a generic MCQ test - passage sets, where several questions hang off one reading passage, and typed numeric answers with no options at all.",
    },
    {
      type: "p",
      text: "This article will not tell you how many questions a section carries, how long it runs, or what a wrong answer costs. CAT's shape is set by the convening IIM each cycle, and the only safe source is the current official bulletin. Write its numbers down, then spend your effort on the part you cannot look up: making the software behave the way the bulletin describes. For the questions themselves, [how to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions) covers stems and distractors; this is the paper built around them.",
    },
    {
      type: "h2",
      text: "Take the Pattern Off the Bulletin First",
    },
    {
      type: "p",
      text: "Copy six things out of the bulletin onto one sheet before you open the editor. Everything after this is mechanical, and none of it is safe without the sheet.",
    },
    {
      type: "ul",
      items: [
        "Section names, in the order the real paper runs them. Candidates read these on the instructions page, so use the bulletin's wording.",
        "Each section's own time limit in minutes.",
        "How many questions each section carries, and how many are typed-answer rather than multiple choice.",
        "Marks for a correct answer and the penalty for a wrong one, noted separately for MCQs and typed answers - do not assume the two carry the same scheme.",
        "Whether a candidate may move between sections, or is held in one at a time.",
        "Whether anything changed this cycle. A mock built from last year's shape rehearses last year's paper.",
      ],
    },
    {
      type: "h2",
      text: "Sectional Lock Is One Switch, and the Default Is Already Right",
    },
    {
      type: "p",
      text: "The Sections panel carries a Section switching control above the section rows. Left off - how every exam starts - the paper is locked: the candidate sits one section at a time on that section's own clock, and a submitted section stays closed. Turn it on and the shape inverts. They get a tab per section, one clock covers the whole paper, and they may leave a section and return to it until they submit.",
    },
    {
      type: "p",
      text: "The instructions page states that promise to the candidate in those words: one section at a time, each on its own clock, sat in order, and a section you submit cannot be reopened. It stops there - the blunter line about unused time not carrying over is reserved for papers sat in pooled parts, so if candidates should be told outright that leftover minutes are lost, write that sentence yourself. If the bulletin forbids returning to an earlier section, you have built that by doing nothing. Turning the switch on is the decision that needs justifying.",
    },
    {
      type: "p",
      text: "Two details save a rebuild. Switching the toggle on does not wipe your per-section minutes - they come back when you turn it off, so you can try both shapes without retyping. And if the bulletin pools two adjacent sections onto one shared clock, that is a timing group rather than this toggle: inside a group the candidate moves freely on the pooled time, while the parts around it stay locked and sat in order.",
    },
    {
      type: "quote",
      text: "A sectional lock is not a stricter clock. It is the promise that time spent in the first section is gone - and a mock that quietly hands it back is rehearsing a paper that does not exist.",
    },
    {
      type: "h2",
      text: "Build the Sections Before You Touch the Questions",
    },
    {
      type: "p",
      text: "Section structure is the one thing that is painful to change once questions exist. Settle it first.",
    },
    {
      type: "ul",
      items: [
        "Add one section per section of the real paper, named exactly as your sheet says.",
        "Drag the rows into paper order. In locked mode that is the order they are sat in.",
        "Type each section's minutes on its row, deliberately. A new section arrives at 60 minutes and the box can be cleared to nothing - and a section on a zero clock expires on its first tick and submits itself. [How to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) covers what the runner does as the time runs down.",
        "Leave section switching off unless the bulletin explicitly allows movement.",
        "Set the exam-level marking scheme, then override only the sections that genuinely differ.",
        "Preview the paper yourself. A creator preview records nothing: no attempt, no marks, no analytics row, no leaderboard entry.",
      ],
    },
    {
      type: "h2",
      text: "Passage Sets: the Same Passage on Every Question",
    },
    {
      type: "p",
      text: "A reading comprehension set is several questions hanging off one passage, and there is a format for exactly that. The Add Question card has a Format dropdown with two entries - Standard Question and Passage-based Question. Choose the second and a Passage Details block appears, taking passage text and optionally a passage image. On a wide screen the question then renders to the candidate in two columns - passage on the left under a Passage heading, question and options on the right - stacking to one column on a narrow one.",
    },
    {
      type: "p",
      text: "Now the part that decides how you work. There is no shared-passage object to create once and point a whole set at. The passage lives inside each question's own text, repeated in full on every question of the set. Good: a candidate who jumps to the last question of a set still sees the whole passage, so the palette can be worked in any order. Irritating: fixing a typo means fixing it on every question of that set, one at a time.",
    },
    {
      type: "p",
      text: "So proofread the passage properly before it goes near the question form. If you import a set as JSON, the published extraction prompt has an optional passage field and is explicit that the same verbatim string must be repeated on each question of the cluster - the parser stores it per question so every row stands alone. Paste that prompt from the [JSON upload guide](/json-upload-guide) into whatever AI you already use. Server-side extraction straight from a PDF exists, but it is off by default and switched on per creator on request.",
    },
    {
      type: "h2",
      text: "Typed Numeric Answers and the Rule That Decides a Match",
    },
    {
      type: "p",
      text: "The Question Type dropdown offers four types: Multiple Choice (Single), Multiple Choice (Multiple), Numeric and Text. Pick Numeric and the candidate gets a number box instead of options. There is nothing else to configure - the key is the answer, typed as you want it compared.",
    },
    {
      type: "p",
      text: "How that comparison works matters, because candidates type the same number several ways. The grader trims whitespace, normalises Unicode, then canonicalises plain decimal literals - so a key of 5 is matched by 5, 5.0, 05 and +5. The guard around that canon is deliberately narrow: a string with a comma or an exponent is excluded from it and compared as ordinary text. A candidate typing 1,000 against a key of 1000 is marked wrong, and so is one typing 1e3.",
    },
    {
      type: "p",
      text: "Two jobs follow. Write every numeric key as a plain decimal - no commas, no units, no symbols - and say in the instructions, in those words, that typed answers must be entered the same way. There is no tolerance band and no list of alternative accepted answers; the key is one string. One mercy is built in: a box typed into and then backspaced empty counts as blank, not wrong, so it takes the blank value rather than the penalty.",
    },
    {
      type: "p",
      text: "The importer will not do this part for you. Its JSON schema accepts single-correct and multi-correct questions only, so numeric and other typed-answer questions arrive as placeholder rows with sentinel options - enough to keep the numbering aligned with the source PDF - and the upload report flags each as needing manual entry. Match-the-column questions land in the same bucket.",
    },
    {
      type: "h2",
      text: "What Blocks the Publish, and What Only Warns",
    },
    {
      type: "p",
      text: "The publish dialog validates before it lets you through. Know which findings are gates and which are advice.",
    },
    {
      type: "ul",
      items: [
        "Blocks: any question missing an answer key, in any language you are publishing. The dialog names the section and the question numbers.",
        "Blocks: marks set on only part of the paper. Partial coverage silently flips the whole exam's ranking to correct count, so it is refused outright.",
        "Warns only: no marking scheme anywhere. The paper publishes and ranks by correct count - fine for a practice set, a disaster for a CAT mock.",
        "Warns only: instructions that have stopped describing the paper. It checks the timing claims and the section and question counts, but only inside a sentence the generator itself wrote - prose you typed yourself is never judged. Its fix button regenerates the whole instruction text, with an undo. It does not look at marks at all, so re-read your marking sentence by hand.",
      ],
    },
    {
      type: "p",
      text: "One thing to settle before you share the link: a published paper is public. Anyone with the link may attempt it. There is no private cohort, no paywall, no attempt limit, no question shuffling, and no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. For a mock that is usually fine, because the honest use of a mock is self-diagnosis against a clock. Never present it as a secure assessment.",
    },
    {
      type: "h2",
      text: "What You Can See After the Mock",
    },
    {
      type: "p",
      text: "Analytics gives section-wise average accuracy across every attempt, and per-question statistics averaged over everyone who attempted that question - how many got it right, how many wrong, which wrong option drew the most picks. On a sectionally locked paper the section is the right unit, because it is what the candidate actually sat: it shows which section the batch is losing, not only which questions were hard.",
    },
    {
      type: "p",
      text: "What is absent matters as much. There is no CSV or Excel export of results and no per-student report card, so anything handed to a student individually is read off the screen. No percentile, no certificates, and no email or WhatsApp notification telling a batch a new mock is up - you share the link yourself. [What a creator account can and cannot build](/for-creators) sets the whole boundary out in one place.",
    },
    {
      type: "h2",
      text: "Reuse the Build for the Next Mock",
    },
    {
      type: "p",
      text: "Sections, clocks and marking are the expensive part, and you build them once. Duplicating an exam carries the marking scheme, the timing groups and the language links to the copy, so the next mock starts as a working shell you swap questions into. It is best-effort and fail-soft by design, so open the copy and check its clocks and marking before writing into it.",
    },
    {
      type: "p",
      text: "If your batch reads in both languages, build Hindi and English as one paper rather than two: [how to create a bilingual Hindi-English online test](/blog/how-to-create-a-bilingual-hindi-english-online-test) covers how the twin rows are kept in parity, which the publish dialog enforces before either language goes out. And to see the candidate side first, the [CAT mock tests](/mock-test/cat) page is where a student lands - sitting one yourself, on a clock, is the fastest way to find what your instructions page fails to say.",
    },
  ],
  faqs: [
    {
      question: "How do I create a CAT mock test online?",
      answer:
        "Create an exam, add one section for each section of the real paper in the order the bulletin lists them, type each section's own time limit on its row, and leave section switching off so candidates sit one section at a time. Then add the questions - passage-based format for reading comprehension sets, the Numeric question type for typed answers - set the marking scheme at exam level with section overrides where the bulletin differs, and publish. Take the question counts, durations and penalties from the current official CAT bulletin rather than from any blog, including this one.",
    },
    {
      question: "How do I lock candidates into one section at a time?",
      answer:
        "Leave the Section switching control off. That is the default for every new exam, and it means the candidate sits one section at a time on that section's own clock, in the order you have arranged the section rows, and a section they submit cannot be reopened. Unused time in one section does not carry into the next. Turning switching on does the opposite: a tab per section and one clock for the whole paper, with free movement until they submit.",
    },
    {
      question: "How do I add a reading passage shared by several questions?",
      answer:
        "Set the question Format dropdown to Passage-based Question and fill the Passage Details block with the passage text, plus a passage image if the set needs one. Do this for every question in the set: there is no shared-passage object to link to, and the passage is stored inside each question's own text. A wide screen shows it in two columns, passage left and question right; a narrow one stacks them. Either way, someone opening the last question of the set still gets the full passage. Proofread the passage before you start, because a correction has to be repeated on every question of the cluster.",
    },
    {
      question: "Can I add typed numeric answers instead of options?",
      answer:
        "Yes. Choose Numeric in the Question Type dropdown and the candidate gets a number box with no options. The grader trims and normalises the typed value and treats plain decimal literals as numbers, so a key of 5 is matched by 5, 5.0, 05 and +5 - but strings with a comma or an exponent are compared as text, which means 1,000 does not match a key of 1000. Write keys as plain decimals with no commas or units, and say so in the instructions. A box typed into and then cleared counts as blank, not wrong.",
    },
    {
      question: "Can I import a CAT paper PDF straight into a mock test?",
      answer:
        "Not as a PDF in the general case. The universal route is to run the published extraction prompt from the JSON upload guide in whatever AI you already use, then upload the JSON it produces; server-side extraction from a PDF is off by default and switched on per creator on request. Either way the AI only extracts from a paper you supply - it never generates questions from a syllabus. Numeric, typed-answer and match-the-column questions arrive as placeholder rows flagged for manual entry, so plan to finish those by hand in the editor.",
    },
  ],
};

export default post;
