import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "should-you-allow-section-switching-in-your-mock-test",
  title: "Should You Allow Section Switching in Your Mock Test?",
  metaTitle: "Section Switching in an Online Exam: On or Off? | MockSetu",
  metaDescription:
    "Section switching gives one clock for the whole paper; off means one section at a time. How to choose, how pooled clocks fit, and what to check before publishing.",
  keywords:
    "section switching in online exam, allow section switching mock test, section wise timing online test, one clock for whole paper, sectional time limit mock test, timing groups online exam, exam navigation settings, mock test section lock",
  excerpt:
    "Two settings, two different skills. What the toggle actually changes - the clock, the submit button, the analytics column you read afterwards - and the third shape a paper sat in sessions needs.",
  publishedAt: "2026-10-27",
  updatedAt: "2026-10-27",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Marking & Timing",
    "section switching",
    "exam timing",
    "mock test design",
  ],
  hero: {
    eyebrow: "Marking & Timing",
    h1: "Should You Allow Section Switching in Your Mock Test?",
    lede: "One toggle, and it decides the clock, the submit button and what your analytics mean afterwards. Here is how to settle it before anyone sits the paper.",
  },
  content: [
    {
      type: "p",
      text: "Match the real exam. If your paper mirrors a published bulletin, the navigation rule is not yours to choose - look it up and reproduce it. Without a real exam to match, the two settings train different skills: locked sections teach sectional discipline, one shared clock teaches whole-paper allocation. Pick the one your batch is weak at. The default is locked, which is the safer start for a first paper.",
    },
    {
      type: "p",
      text: "The rest of this is what the toggle really changes, which is more than the name suggests. If the clock itself is unsettled, [how to set the right total time for a mock test](/blog/how-to-set-the-right-total-time-for-a-mock-test) comes first, and [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) covers what happens when it runs out.",
    },
    {
      type: "h2",
      text: "What the Switch Actually Changes",
    },
    {
      type: "p",
      text: "Section switching is one toggle at the top of the Sections card in the exam editor. Off - the default, and what every exam starts as - means per-section clocks: the student is shown one section, on that section's own minutes, and submits it. A submitted section stays closed, the next begins with its own full clock, and sections are sat in the order you arranged them. On means one clock for the whole paper: every section loads before the clock starts, the student gets a tab per section, and they move between them in any order until they submit or time runs out.",
    },
    {
      type: "ul",
      items: [
        "The clock. Off, each section runs its own minutes. On, you set one total - leave that box empty and students get the sum of the section times.",
        "The button. Off it reads Submit Section. On it reads Submit Exam, and submits every section at once.",
        "The confirmation. A candidate who moves freely can reach Submit with a whole section untouched, so the dialog lists each section's unanswered count and the time left.",
        "The way around. Up to five sections the tabs sit in a strip in the sticky header; past five that strip becomes a picker list.",
        "Timing groups. They apply only while switching is off. Turn it on and the pools stop applying - the group rows are kept, and come back.",
      ],
    },
    {
      type: "p",
      text: "Nothing is destroyed either way. Switching on leaves the per-section minute boxes filled and stops enforcing them; flipping back restores the paper as it was. The first time you turn it on, the whole-paper total is seeded from the sum of those section clocks.",
    },
    {
      type: "h2",
      text: "The Easy Case: There Is a Real Exam to Match",
    },
    {
      type: "p",
      text: "If the paper is a mock for a named exam, this stops being a design question. Interface rules change between cycles and differ between papers in the same family, so a coaching handout you remember is not evidence. Open the current information bulletin, find the part describing the test interface, and build that.",
    },
    {
      type: "p",
      text: "JEE Main Paper 1 shows why structure and navigation are separate questions. The structure is fixed and public: 75 questions, 25 per subject, Section A carrying 20 multiple-choice questions and Section B 5 numericals, all compulsory, plus 4 for a right answer and minus 1 for a wrong one in both sections, 300 marks in 180 minutes. The old choice of attempting any 5 of 10 in Section B was discontinued from the 2025 cycle. None of that tells you whether a candidate may move between subjects. That line is in the bulletin, and it is the line your toggle has to match - the same goes for a [CAT mock test](/mock-test/cat) or any other paper your students sit.",
    },
    {
      type: "quote",
      text: "If the exam you are mirroring has a rule about moving between sections, that rule is not a preference. Copy it; do not improve it.",
    },
    {
      type: "h2",
      text: "The Harder Case: No Exam to Match",
    },
    {
      type: "p",
      text: "A school unit test, a chapter test, a custom paper of your own - now the toggle is genuinely yours. Locked sections teach sectional discipline: the student has this long for this subject, and when it is gone it is gone. One shared clock teaches whole-paper allocation: triage, budgeting, abandoning a section that is not paying, returning to flagged questions at the end. Both are real skills, and neither is more realistic in the abstract.",
    },
    {
      type: "ul",
      items: [
        "Lock the sections when the weakness you are fixing is time management inside a subject, or when the sections are different subjects.",
        "Open the paper when you are rehearsing triage, when the sections are difficulty bands, or when the paper is short enough that a per-section clock is only an irritation.",
        "Lock it when you are undecided. A student who has practised under a lock is not disadvantaged by a paper that removes one.",
      ],
    },
    {
      type: "p",
      text: "There is a wider version of this argument in [what makes a mock test realistic](/blog/what-makes-a-mock-test-realistic): realism is fidelity to one specific paper, not strictness for its own sake.",
    },
    {
      type: "h2",
      text: "Pooled Clocks: What Two-Session Papers Actually Need",
    },
    {
      type: "p",
      text: "There is a third shape, and a paper sat in sessions needs it. Group two or more adjacent sections and they share one pool of minutes. Inside the group the student moves freely, as though switching were on. Between groups the locked rules hold: parts are sat in order, a submitted part cannot be reopened, and unused time does not carry over.",
    },
    {
      type: "p",
      text: "Three details decide whether this suits you. First, a group is always a contiguous run - the editor pulls the sections you pick into one, and a member you later drag away from that run leaves the group. Second, this is a locked-mode feature: turn switching on and the pools stop applying, because one paper-wide clock makes a pool inside it meaningless. Third, the instructions page then describes the paper in parts, naming each part and its shared minutes.",
    },
    {
      type: "p",
      text: "SSC MTS is the paper this shape was built for: 90 questions for 270 marks across two sessions of 45 minutes each, where Session I is qualifying only with no negative marking, and Session II counts towards merit and deducts one mark for a wrong answer. Built as two pooled parts, the student gets the two clocks the real paper gives them. Whether a candidate may return to Session I is a bulletin question, and pooled parts answer it one way only - a submitted part stays closed. None of that shape generalises to other staff-selection papers.",
    },
    {
      type: "ul",
      items: [
        "Arrange the sections in the order the paper is sat. A group is always one unbroken run, so that order decides which part comes first.",
        "Leave section switching off. The grouping control does not appear while it is on.",
        "On the primary-language tab, select two or more sections and group them - they are pulled together into one run. The editor shows the pool before you confirm; other language tabs mirror it and can translate the name.",
        "Set the pool to what the real paper states. A new group opens with the members' sum already filled in, and that number then stands on its own - edit a member's minutes afterwards and the pool does not follow.",
        "Read the part names and pooled minutes back on the instructions page. That is what the candidate will believe.",
      ],
    },
    {
      type: "h2",
      text: "What Each Mode Tells You Afterwards",
    },
    {
      type: "p",
      text: "The two modes do not record the same thing, and the Section Analytics table does not announce the difference. In a locked paper, a section's time spent is wall clock - its minutes less whatever the timer had left. In a free paper no wall-clock slice belongs to a section, so the stored figure is the time spent on that section's questions, added up one by one.",
    },
    {
      type: "p",
      text: "That column reads average time against the section's own minutes. In a free paper those minutes were never enforced - a budget you wrote, not a limit the paper applied - so a section running over them is information, not a violation. A pooled section is the one case handled explicitly: it shows the pool as its denominator.",
    },
    {
      type: "p",
      text: "One clock also concentrates a risk. The clock runs on the server, so a dead browser or a dropped connection spends the student's time whether they are there or not. Come back inside the return window - five minutes, measured by a heartbeat from the same device - and the sitting resumes with what is left; come back later and it is filed as it stands. In a locked paper that loss is confined to the section they were in, because the next section's clock has not started. In a free paper there is no next clock to insulate anything. On patchy home internet, that is a real argument for locking.",
    },
    {
      type: "h2",
      text: "Say It in the Instructions, Then Check It Again",
    },
    {
      type: "p",
      text: "The instructions page states the mode by itself. A free paper is headed \"You can switch between sections\", with the shared clock spelled out. A locked one says one section at a time, each on its own clock, sat in order, and that a submitted section cannot be reopened. A grouped one says the paper is sat in timed parts. That much is generated from the paper and always true.",
    },
    {
      type: "p",
      text: "Your own written Exam Instruction is not. Text composed for a locked paper goes on claiming sections are sat one at a time after you flip the switch, and MockSetu says so in those words - it compares the stored text against the paper and names the mismatch. Know the limit of that notice: it warns, and it does not block publishing. Flipping the toggle also prompts you to rewrite the text, which is the moment to do it.",
    },
    {
      type: "ul",
      items: [
        "Reopen the written instructions in every language you publish in and fix the navigation sentence by hand.",
        "Preview the paper and start it. The button reads Start Exam on a free paper with more than one section, and Start Section otherwise. A creator preview records nothing.",
        "On a free paper, press Submit once from the last section to see the per-section summary your students will see.",
        "On a grouped paper, confirm each part's pooled minutes on the instructions page.",
        "Duplicating carries the navigation mode, the whole-paper total, the timing groups and the marking scheme. It is best-effort, so open the copy and look.",
      ],
    },
    {
      type: "h2",
      text: "What This Setting Is Not",
    },
    {
      type: "p",
      text: "Section switching is a timing decision, and it is worth saying plainly what it is not. There is no proctoring of any kind here - no webcam, no lockdown browser, no tab-switch detection - no question shuffling, and no cap on attempts. Published papers are public: anyone with the link can sit them, and there is no private or paid delivery to one batch. Locking the sections only stops a student going back to an earlier section.",
    },
    {
      type: "h2",
      text: "The Default, and When to Leave It Alone",
    },
    {
      type: "p",
      text: "Leave it off unless you have a reason. Locked is what every exam starts as, and an absent setting is read as locked everywhere by design, so a paper you never touched behaves the way you expect. Turn it on when the bulletin says so, or when whole-paper allocation is the skill you are training. Reach for pooled parts when the real paper is sat in sessions.",
    },
    {
      type: "p",
      text: "[Everything a creator can build here](/for-creators) - sections with their own clocks, pooled timing parts, per-section marking, bilingual papers, a listing in the public library - is free and takes no card. The toggle sits at the top of the Sections card on every exam you make, and changing your mind before you publish costs one click.",
    },
  ],
  faqs: [
    {
      question: "Should I allow section switching in a mock test?",
      answer:
        "If you are mirroring a real exam, do whatever its current information bulletin says about moving between sections, and nothing else. If the paper is your own, the choice is between two skills: locked sections train time management inside a subject, while one shared clock trains whole-paper triage and budgeting. Locked is the default on MockSetu and the safer choice when you are undecided, because a student who has practised under a sectional lock is not disadvantaged by a paper that removes one.",
    },
    {
      question: "What happens to the clock when I turn section switching on?",
      answer:
        "The per-section clocks stop being enforced and the paper runs on one total instead. You set that total yourself; if you leave it empty, students get the sum of the section times. The per-section minutes are not deleted - they are kept exactly as you typed them, and turning switching off again restores the paper as it was. The first time you turn switching on, the total is seeded from the sum of those section clocks, so the paper is never handed out with a zero-length clock.",
    },
    {
      question: "Can students move between some sections but not others?",
      answer:
        "Yes, with timing groups. Group two or more adjacent sections and they share one pool of minutes: inside that part the student moves freely, and between parts the locked rules hold - parts are sat in order, a submitted part cannot be reopened, and unused time does not carry over. This is how a two-session paper is built. Timing groups only work while section switching is off; turn switching on and the pools stop applying, though the groups are kept and come back when you turn it off again.",
    },
    {
      question: "Does section switching change what I see in analytics?",
      answer:
        "It changes what the per-section time figure means. In a locked paper it is wall clock - the section's minutes less whatever was left on its timer. In a free paper no wall-clock slice belongs to a section, so the stored figure is the time actually spent on that section's questions. Both appear in the same Section Analytics column, measured against the section's stored minutes, and in a free paper those minutes were a budget you wrote rather than a limit the paper enforced.",
    },
    {
      question: "Does locking sections stop students from cheating?",
      answer:
        "No, and nothing on MockSetu does. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - no question shuffling and no attempt limit, and published papers are public, so anyone with the link can sit them. Locking sections only prevents a candidate returning to an earlier section. Choose the setting on how you want the time spent, not as an integrity control.",
    },
  ],
};

export default post;
