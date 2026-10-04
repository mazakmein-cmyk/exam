import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-ibps-po-mock-test-online",
  title: "How to Create an IBPS PO Mock Test Online: Sectional Timing Done Right",
  metaTitle: "IBPS PO Mock Test: Build One With Sectional Timing | MockSetu",
  metaDescription:
    "Build an IBPS PO mock with per-section clocks and switching locked, so every section closes on time. Sections, shared pools, DI sets and the publish gate.",
  keywords:
    "ibps po mock test create, create bank po mock test online, sectional timing online test, per section clock mock test, banking mock test creator, data interpretation set online test, ibps po practice test setup, section switching online exam",
  excerpt:
    "Separate sections, a clock on each, switching off. That is the whole answer - and section switching is the setting that decides whether your banking mock rehearses the sitting the notification describes or quietly teaches the wrong habit.",
  publishedAt: "2026-10-24",
  updatedAt: "2026-10-24",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "banking exams",
    "sectional timing",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create an IBPS PO Mock Test Online: Sectional Timing Done Right",
    lede: "Separate sections, a clock on each, switching left off. Three decisions in the editor settle whether your mock rehearses a sectionally timed banking paper or something that only looks like one.",
  },
  content: [
    {
      type: "p",
      text: "Build it as separate sections - one per subject - put a clock in minutes on each, and leave section switching off. Where the notification times each section separately, that is the combination that reproduces it: a window that closes whether or not the section is finished, with nothing borrowed from the next one. The rest is ordinary question entry.",
    },
    {
      type: "p",
      text: "What follows will not tell you how many questions each section carries, how many minutes it gets, or what a wrong answer costs. Patterns get revised, and a figure copied out of a blog is how a mock ends up rehearsing an old paper. Take the counts, the per-section minutes and the penalty from the current notification. This is the other half - how to make the software behave the way the real sitting does.",
    },
    {
      type: "h2",
      text: "A Section Is Not a Label. It Is a Clock.",
    },
    {
      type: "p",
      text: "On MockSetu a section is the unit of timing, not a heading over a group of questions. Add the first one and it arrives called New Section 1 with 60 minutes on it - both placeholders. Rename it to the subject the notification names and type the notification's minutes into it. One subject, one section: three subjects in the notification means three sections, three names, three clocks. Questions go into the section they belong to, and their order inside it is the order the candidate walks.",
    },
    {
      type: "p",
      text: "Above the section list sits the setting everything here hinges on: section switching. Leave it off. Off is the default, and also what the app falls back to when it cannot read the setting at all - an absent value reads as locked, never as free, because handing a candidate the whole paper on one clock by accident is the worse failure. With switching off, the candidate sits one section at a time on that section's own clock, in the order you arranged them, and a submitted section cannot be reopened. The instructions screen says so before they start.",
    },
    {
      type: "ul",
      items: [
        "Add one section per subject, named the way the notification names it.",
        "Set each section's minutes from the notification. Do not divide a whole-paper figure yourself unless the notification divides it.",
        "Drag the sections into the order the real paper runs them in. That order is the order they are sat.",
        "Leave section switching off. The sections card labels itself when switching is on, so that label means the wrong mode.",
        "Open the instructions screen and read the format box back. It states the section count, the clocks and the no-reopening rule in plain words. If that paragraph is wrong, your settings are wrong.",
      ],
    },
    {
      type: "h2",
      text: "What Turning Switching On Would Do Instead",
    },
    {
      type: "p",
      text: "Know what you are declining. Switch it on and the paper collapses to one clock for everybody: a tab per section, movement in any order, every answer revisitable until they submit or time runs out. If you have not set a whole-paper total yourself, the editor seeds one from the sum of your section clocks, so the headline arithmetic looks unchanged. Your per-section minutes survive - they are kept, and they come back the moment you switch it off.",
    },
    {
      type: "p",
      text: "That unchanged arithmetic is the trap. A candidate on one pooled clock who finds one section hard simply spends longer on it, taking those minutes out of a section they find easy. On a sectionally timed paper that move does not exist, and the skill such a paper really tests - abandoning a question inside a window about to close - never gets rehearsed. The total looks similar, so nobody spots it, and the habit sets anyway. If the notification says the sections are separately timed, a pooled mock is not a looser version of it. It is a different exam.",
    },
    {
      type: "quote",
      text: "A pooled clock does not make a sectional mock gentler. It removes the only thing a sectional mock teaches.",
    },
    {
      type: "h2",
      text: "When Two Sections Genuinely Share One Clock",
    },
    {
      type: "p",
      text: "Some papers pool, but only in parts. A timing group is the tool: select two or more sections and they run on one shared clock with free movement between them, while the rest of the paper stays strictly one at a time. The pool is the figure you type on the group, or the sum of its members if you leave it blank. Three rules govern it. Members must be adjacent in the section order, because a group is a contiguous run and not a tag. The structure is edited on the primary language tab only, other tabs showing a read-only mirror whose group name you can translate. And it is hidden while section switching is on, because a pool inside a paper-wide clock means nothing.",
    },
    {
      type: "p",
      text: "Membership moves when you drag, so re-read the group boxes afterwards. Drop a section strictly inside a group - members on both sides - and it joins. Drag a member away until it touches none of its own group and it leaves. Land it at a group's edge, member on one side only, and nothing happens: an edge is ambiguous, and silently growing a shared clock is worse than making you drop one slot further in.",
    },
    {
      type: "h2",
      text: "Data Interpretation Sets: There Is No Shared Passage",
    },
    {
      type: "p",
      text: "A DI caselet feeding a run of questions looks like it ought to be one object you create once and point several questions at. It is not, and there is no such object to look for. A passage lives inside each question's own stored text, in a block above the stem, so a set carries one copy of the table per question. The student sees it rendered correctly either way; maintenance pays the bill. Fix a typo and you fix it once per question, and a set whose copies have drifted apart is a real way to lose a mark.",
    },
    {
      type: "p",
      text: "Three ways in, depending on where the caselet comes from, and one rule that holds whichever you pick.",
    },
    {
      type: "ul",
      items: [
        "Typing it: switch the question to the passage format, which takes passage text, a passage image, or both, and refuses a non-draft save when given neither.",
        "From a PDF you hold: upload it to the section and the snipping tool crops a region of the page straight into the passage slot - the sane route for a DI table you do not want to retype.",
        "From a JSON import: the extraction prompt in the [JSON upload guide](/json-upload-guide) has an optional passage field and tells the model to repeat the identical string on every question of the cluster. The importer wraps it into the same two-block text the editor writes, so imported and hand-typed sets end up identical.",
        "Whichever route, keep the set contiguous inside its section and number it the way the paper does. Nothing enforces that for you.",
      ],
    },
    {
      type: "h2",
      text: "Marking, and What Actually Blocks the Publish",
    },
    {
      type: "p",
      text: "Take the penalty from the notification and nowhere else. Marking is three numbers on a question - right, wrong, blank - set as an exam default and overridden per section where one genuinely differs; [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) covers that properly. Know before you start that partial coverage blocks publishing: the paper must be all-marks or no-marks, because a mix re-ranks the whole exam by correct count the moment an attempt lands on an unscored question. Five other things are refused outright.",
    },
    {
      type: "ul",
      items: [
        "An exam with no sections at all.",
        "Any section holding zero questions.",
        "A question with neither text nor an image - truly blank.",
        "A single-answer or multiple-answer question with fewer than two filled options.",
        "A missing answer key, checked in every language you publish and not only the primary one.",
      ],
    },
    {
      type: "p",
      text: "The instruction-drift notice only warns. It compares the minute figures in your written instructions against the paper's real clocks, flags a disagreement, and offers to rewrite the text from the exam. It is narrow on purpose - it reads the clocks, not the question counts and not the marking - so treat a clean run as silence, not approval.",
    },
    {
      type: "h2",
      text: "What the Report Shows Afterwards, and What It Never Will",
    },
    {
      type: "p",
      text: "Analytics is cohort-level. Section by section you get average accuracy and average time across the attempts - on a sectionally timed paper, the number that earns its place, because a section the cohort finishes well inside its clock is one you may have timed too generously or written too easily. Per question you get the attempt count, how many answered correctly, the average time of everyone who attempted it, and which wrong option was picked most often. The only names on the page are the usernames on the top-three leaderboard.",
    },
    {
      type: "p",
      text: "The absences deserve saying plainly, because this is where most tools go vague. No CSV or Excel export of results, and no per-student report card. No proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. No question shuffling and no cap on attempts. A published paper is public: anyone who reaches the link may attempt it, with no paywall and no private delivery to one batch. The product sends transactional account email for signup and password reset, but it will not notify your students that a test has opened. Sharing the link is your job.",
    },
    {
      type: "h2",
      text: "Sit It Yourself Before You Share the Link",
    },
    {
      type: "ul",
      items: [
        "Preview the paper and sit the first section to its end. A creator preview creates no attempt row, so it records nothing and skews no average.",
        "Let a clock expire once on purpose. A warning fires at five minutes remaining and the paper submits itself at zero with nothing for the candidate to click - [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) goes deeper into the clock.",
        "Close the tab mid-section and come back. A sitting resumed on the same device inside the five-minute return window gets the remainder of its clock, not a fresh one, and lands on the question it left.",
        "Check every DI set renders its caselet above the stem on each of its questions, and that the copies still match.",
        "Read the instructions screen's format box one last time against what you actually built.",
        "Duplicating this paper later builds fresh timing pools rather than pointing at this exam's, and carries the marking scheme and the language links - but it is best-effort, so open the copy's section list and verify.",
      ],
    },
    {
      type: "p",
      text: "Build one banking paper carefully and the next several are duplicates with new questions in them. [Everything a creator can build](/for-creators) - sections on their own clocks, shared timing pools, bilingual papers, a public library listing - is free and takes no card. For a topic-level drill rather than a full mock, [how to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online) is the shorter build. And before deciding how hard to make it, read what your candidates are up against in the [bank PO preparation strategy guide](/blog/bank-po-preparation-strategy).",
    },
  ],
  faqs: [
    {
      question: "How do I create an IBPS PO mock test online with sectional timing?",
      answer:
        "Create one section per subject, type each section's time limit in minutes onto that section, and leave section switching off. With switching off the candidate sits one section at a time on that section's own clock, in the order you arranged the sections, and a submitted section cannot be reopened. Take the question counts, the per-section minutes and the penalty from the current IBPS notification rather than from any article, because patterns get revised.",
    },
    {
      question: "Can a candidate go back to an earlier section in a MockSetu mock?",
      answer:
        "Not unless you allow it. Section switching is off by default, which means one section at a time and no return to a section already submitted. Turning it on replaces the per-section clocks with one clock for the whole paper, gives the candidate a tab per section and lets them move and revisit freely until they submit. Your per-section minutes are kept while switching is on and come back if you turn it off again.",
    },
    {
      question: "How do I add a data interpretation set with one caselet and several questions?",
      answer:
        "Put the caselet on each question of the set. There is no shared-passage object to create once and link to - a passage is stored inside each question's own text, in a block above the stem, so a set carries one copy per question. You can type the caselet, snip it as an image straight out of the source PDF, or let a JSON import carry it through the optional passage field, which the extraction prompt tells the model to repeat identically across the cluster. Keep the set contiguous inside its section.",
    },
    {
      question: "Can two sections of my mock share one clock?",
      answer:
        "Yes, with a timing group. Select two or more sections that are adjacent in the section order and they run on one shared pool - the minutes you type on the group, or the sum of the members if you leave it blank - with free movement between them, while the rest of the paper stays one section at a time. Timing groups are edited on the primary language tab only, and they are hidden while whole-paper section switching is on, because a pool inside a single paper-wide clock means nothing.",
    },
    {
      question: "What stops me from publishing a banking mock?",
      answer:
        "Publishing is refused if the exam has no sections, if any section holds no questions, if a question has neither text nor an image, if a single- or multiple-answer question has fewer than two filled options, or if an answer key is missing in any language you are publishing. Partial marking coverage also blocks: the paper must be all-marks or no-marks. The instruction-drift notice, which compares the minute figures in your written instructions against the paper's real clocks, only warns.",
    },
  ],
};

export default post;
