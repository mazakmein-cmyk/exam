import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-run-a-free-scholarship-test-online",
  title: "How to Run a Free Scholarship Test Online for Admissions",
  metaTitle: "How to Run a Free Scholarship Test Online | MockSetu",
  metaDescription:
    "Run a scholarship test for a coaching institute online: design a paper that separates, control the window, and pick the format that gives you a ranked list.",
  keywords:
    "scholarship test for coaching institute, free scholarship test online, online scholarship exam, admission test for coaching, scholarship test paper design, online entrance test institute, conduct scholarship test online india",
  excerpt:
    "A scholarship test decides who gets money, and there is no proctoring here. Here is how to build a paper that separates, run the window, and end up with a list you can actually rank.",
  publishedAt: "2026-10-15",
  updatedAt: "2026-10-15",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Coaching Growth",
    "scholarship test",
    "admissions",
    "coaching institute",
  ],
  hero: {
    eyebrow: "Coaching Growth",
    h1: "How to Run a Free Scholarship Test Online for Admissions",
    lede: "A short paper, a window you open and close yourself, and a format whose output you can actually rank. Decide where the test is sat before you announce it, because the result hands out money.",
  },
  content: [
    {
      type: "p",
      text: "A scholarship test for a coaching institute is a short, sharply discriminating paper, run inside a window you open and close yourself, and ranked off a list you can read at the end. Decide where it is sat before you announce anything, because MockSetu has no proctoring of any kind and a published paper is public - anyone who finds it in the library can attempt it. If the result decides money, sit candidates in your own centre on your own devices, or run a live session where you unlock every question yourself. An open link attempted at home gives you a shortlist, not an award.",
    },
    {
      type: "p",
      text: "The design side of that problem has its own treatment in [how to reduce cheating in online tests without proctoring](/blog/how-to-reduce-cheating-in-online-tests-without-proctoring). This page is the scholarship sitting specifically: the paper, the window, the announcement, and the ranked list.",
    },
    {
      type: "h2",
      text: "Design the Paper to Separate, Not to Revise",
    },
    {
      type: "p",
      text: "A scholarship test has one job - sort a wide range of ability in a short sitting. A mock has a different job: mirror a real exam, syllabus and all, for a candidate already deep into preparation. Reuse a mock here and you mostly measure who has already been coached, the one thing a scholarship should be blind to. The candidates walking in finished different chapters at different schools, and some have not started your subject at all.",
    },
    {
      type: "p",
      text: "So the paper runs shorter than your standard mock, leans on reasoning, comprehension and arithmetic ability rather than syllabus depth, and is built from questions that split a crowd. A question almost everyone answers correctly contributes nothing to the ranking. Neither does one almost nobody gets. If most of the room clears the paper comfortably, you have not selected anybody - you have run a lap.",
    },
    {
      type: "p",
      text: "Which questions did the work is something you learn afterwards. The per-question breakdown on the analytics page reports how many attempted each question, how many got it right, how long they took and which wrong option drew the most picks. Read it after the first cycle and you know which items to keep.",
    },
    {
      type: "ul",
      items: [
        "Shorter than a mock. This is a selection instrument, not a rehearsal.",
        "Weighted towards ability a candidate carries in, not chapters they may not have reached.",
        "A deliberate spread of difficulty, so it separates at the top as well as in the middle.",
        "Marking scheme fixed before you publish. Marks are computed at submission and written onto that attempt; nothing re-scores a paper somebody already sat.",
        "The shape stated in the instructions. The intro page builds a table of it - one row per section with question count, maximum marks and sectional timing, plus a total.",
        "Previewed by you, end to end. A creator preview records nothing, so it cannot pollute your results.",
      ],
    },
    {
      type: "h2",
      text: "Say the Integrity Position Out Loud",
    },
    {
      type: "p",
      text: "This is the part most tools in this space will not write down. MockSetu has no proctoring: no webcam, no lockdown browser, no tab-switch detection. No question shuffling, no cap on attempts. No payments and no private delivery - publishing a paper puts it in the [public mock test library](/marketplace), where anyone can find and sit it. No setting releases a paper to one batch only.",
    },
    {
      type: "p",
      text: "What is enforced is narrower. The deadline lives in the database rather than in the browser tab: it is written onto the attempt row when the clock starts, so reopening the paper returns the same sitting with the elapsed time already gone. A refresh does not buy a fresh clock. That closes the loophole students find by accident. It does not make an unsupervised sitting a controlled one.",
    },
    {
      type: "quote",
      text: "A scholarship decides who gets money. Software nobody was watching cannot be the thing that decides it - the test can produce the shortlist, but the room produces the award.",
    },
    {
      type: "h2",
      text: "Three Ways to Run It, and What Each One Can Decide",
    },
    {
      type: "p",
      text: "The format is not a preference. It determines what the result is allowed to settle, and it determines what you are handed at the end.",
    },
    {
      type: "ul",
      items: [
        "In your centre, on your devices. Candidates sit the published paper on machines in front of you, and the supervision is yours rather than the software's. This is the only version that can decide an award on its own.",
        "As a live session. Everybody is on the same question at the same time because you unlock it, so nobody runs ahead and nobody sits it a day early. A live room needs a signed-in student account - an anonymous visitor is sent to sign in first - and is entered through an eight-character share code rather than by browsing, so it is listed nowhere public.",
        "As an open link attempted at home. Cheap, wide, and the right way to find candidates you would never otherwise meet. Treat what comes back as a shortlist, and call that shortlist in for a supervised round.",
      ],
    },
    {
      type: "p",
      text: "The mechanics of the second one - getting a batch into the room, pacing the unlocks, handling the student whose network drops - are in [how to run a live mock test for a whole batch](/blog/how-to-run-a-live-mock-test-for-a-whole-batch). One caution belongs here instead: a very large sitting is better run as a scheduled paper than as one live room.",
    },
    {
      type: "h2",
      text: "Only the Live Report Gives You a Full Ranked List",
    },
    {
      type: "p",
      text: "This decides more than it looks like it should. A scheduled paper's analytics page gives the aggregate picture - attempts, completion rate, repeaters, average score, average time per attempted question - and a per-question breakdown. The only candidates it names are the top three. There is no roster of everyone who sat it, no per-student report card, and no CSV or Excel export anywhere in the product.",
    },
    {
      type: "p",
      text: "A live session ends on a report generated for you, and its students tab is the roster: every participant by name, with rank, questions answered, questions right, accuracy, and a question-by-question grid. That tab is the creator's private view. The shareable report link renders only the recap, and with privacy mode on the names are masked at read time, so switching it on later re-masks an old report.",
    },
    {
      type: "p",
      text: "Now the catch, which should decide your format rather than be discovered after it. A live room has no marking scheme. Its questions carry a time limit, not marks, and the ranking is correct answers first with total time on correct answers as the tiebreaker. A live round cannot produce a negatively marked merit list. If your award rests on a scored paper that penalises wrong answers, that is a scheduled paper - and a scheduled paper names only your top three.",
    },
    {
      type: "h2",
      text: "The Window Is Publish and Unpublish",
    },
    {
      type: "p",
      text: "There is no availability schedule on a scheduled paper. No open-at, no close-at, no automatic expiry. The window is you: publish when it opens, unpublish when it shuts, both from the exam list. Put the real dates in the announcement and treat that toggle as what enforces them.",
    },
    {
      type: "p",
      text: "A live exam does carry a start time. Set a scheduled start and candidates land in a lobby with a countdown instead of an open-ended wait, which moves distribution - the most stressful part of the exercise - to the previous evening. Auto-start is off by default, and when on it begins the session on your own control room at the first sync past the scheduled time. Nothing starts unattended. A live exam must be published before the Go Live button appears, and a draft cannot be shared at all.",
    },
    {
      type: "ul",
      items: [
        "Fix the dates and the format before you build. Changing format after an announcement costs more than the paper did.",
        "Finish the answer key before you publish. A wrong key is only half-fixable: a correction changes what the next candidate scores, never what earlier ones scored.",
        "Publish when the window opens. For a live round, publish, then set the scheduled start, then share the link or read out the code.",
        "Unpublish when the window closes. That is the whole mechanism; nothing closes on its own.",
        "Keep it unpublished between cycles if you plan to reuse it, because a published paper stays browsable in the library.",
      ],
    },
    {
      type: "h2",
      text: "The Announcement Has to Do the Work the Product Will Not",
    },
    {
      type: "p",
      text: "MockSetu sends no notifications about tests. No email, no SMS, no WhatsApp reminder to a registered candidate. The product sends transactional account mail - signup, password reset - and nothing else. Every announcement, reminder and result message is yours to send on whatever channel your institute already uses.",
    },
    {
      type: "p",
      text: "Two things belong in that announcement that creators routinely leave out. First: tell candidates to sign in with a student account before they begin. An anonymous visitor can sit a published paper, but the finished submission is parked in that browser's own storage and only reaches you when they sign in - a candidate who never does, or who signs in later on a different phone, has sat a paper your ranking never sees. Second: the rules, in plain words, on the instructions page. [This online exam instructions template](/blog/online-exam-instructions-template-for-students) is a starting point to edit rather than write from scratch. The publish check warns when stored instructions stop describing the paper, and that notice warns rather than blocks. Marks are the one thing it will stop you on: a paper carrying marks on only some of its sections cannot be published until you either cover every section or remove marks everywhere.",
    },
    {
      type: "h2",
      text: "After the Test, and the Next Cycle",
    },
    {
      type: "p",
      text: "Be exact with candidates about what they receive. There are no certificates and no per-student report cards. A student can open their own review of their own attempt, and that is the whole of it. For a public result, a live report has a shareable link you can switch on, and the token is kept, so toggling it off and on again does not break a link already sent. A live session also lets you set the leaderboard to full, private or off - decide that before the room fills.",
    },
    {
      type: "p",
      text: "When the cycle ends, duplicate the paper instead of rebuilding it. The copy carries the questions, the marking scheme, the timing groups and the language links. It is best-effort, so open the duplicate and check a question in each section before publishing. Swap out the items that separated nobody, and the second cycle is an edit rather than a rebuild.",
    },
    {
      type: "h2",
      text: "Build the Paper Once",
    },
    {
      type: "p",
      text: "A scholarship test is a sales instrument and an assessment at once, and the assessment half earns the trust. Build it properly: a short paper that discriminates, a window you genuinely control, an announcement that says where and how it is sat, and a format whose output you can rank. [Everything a creator can build here](/for-creators) - sections with their own clocks, per-section marking, bilingual papers, live sessions, a listing in the public library - sits behind one free account and asks for no card. What it will not do is pretend an unwatched browser tab is an examination hall. Say that to a parent; it is worth more than any feature on the list.",
    },
  ],
  faqs: [
    {
      question: "How do I run a free scholarship test online for a coaching institute?",
      answer:
        "Build a short, discriminating paper rather than reusing a mock, fix the marking scheme and answer key before publishing, then publish it to open the window and unpublish it to close the window - there is no automatic availability schedule. Decide the format first: a supervised sitting in your own centre, a live session where you unlock each question, or an open link that you treat as a shortlist. Announce it yourself, because the platform sends no test notifications by email, SMS or WhatsApp.",
    },
    {
      question: "Can students cheat in an online scholarship test?",
      answer:
        "On an unsupervised sitting, yes. MockSetu has no proctoring at all - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or attempt limits. The deadline is written into the database when the clock starts, so refreshing the page returns the same sitting with the elapsed time gone rather than a fresh clock, but that is the limit of it. If the result decides money, sit the candidates in your centre or run the round live, and use any unsupervised round as a shortlist only.",
    },
    {
      question: "Should a scholarship test be a live exam or a scheduled paper?",
      answer:
        "It depends on what the result has to be. A live session keeps everyone on the same question at the same time, requires a signed-in student account to join, and ends on a report whose students tab names every participant with their rank - but it has no marking scheme, and it ranks on correct answers with time on correct answers as the tiebreaker. A scheduled paper applies your full marking scheme including negative marking, but its analytics page names only the top three candidates.",
    },
    {
      question: "Can I keep a scholarship paper private to my own batch?",
      answer:
        "No. Publishing a paper lists it in the public mock test library, where anyone can find and attempt it, and there is no paid, private or batch-restricted delivery. A live exam is closer to private in practice - it is entered through an eight-character share code and is not browsable anywhere - but anyone who is given that code can join. If a paper must not stay public after the window, unpublish it.",
    },
    {
      question: "How long should a scholarship test be?",
      answer:
        "Shorter than your standard mock. A scholarship paper is a selection instrument, not a rehearsal, and the candidates sitting it have covered different syllabus at different schools. Spend the length you do use on reasoning, comprehension and arithmetic ability, with a deliberate spread of difficulty so the paper separates at the top as well as in the middle. The exact count should follow from how long you can realistically supervise a room, not from the length of the exam you coach for.",
    },
  ],
};

export default post;
