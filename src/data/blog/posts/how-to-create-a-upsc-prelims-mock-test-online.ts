import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-upsc-prelims-mock-test-online",
  title: "How to Create a UPSC Prelims Mock Test Online",
  metaTitle: "How to Create a UPSC Prelims Mock Test Online | MockSetu",
  metaDescription:
    "Build a UPSC Prelims mock: the two papers as separate clocks, statement-based and assertion-reason questions, and why the marking scheme comes off the notification.",
  keywords:
    "upsc prelims mock test create, how to make a upsc prelims mock test, statement based questions upsc, assertion reason question format, upsc prelims paper setting, csat mock test online, online test for upsc aspirants, upsc prelims question paper online",
  excerpt:
    "The Prelims format is not four options and a stem. It is statement sets, assertion-reason pairs, and options built to be eliminated. Here is how to build that paper, and which numbers to take off the notification instead of from memory.",
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
    "UPSC",
    "question paper setting",
    "mock test",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a UPSC Prelims Mock Test Online",
    lede: "Four build moves, two papers, and the two question formats that make a Prelims paper hard to set. The hard part is not the software.",
  },
  content: [
    {
      type: "p",
      text: "A UPSC Prelims mock is built in four moves: create the exam, build each paper as its own sections with its own clock, take the marking scheme off the current notification rather than from memory, and publish the link. None of those takes an afternoon. The afternoon goes on writing statement-based and assertion-reason questions whose options can actually be eliminated - that, not the stem, is what makes a mock behave like Prelims.",
    },
    {
      type: "p",
      text: "This page prints no figure for UPSC's penalty, no per-question mark value and no duration. Those are set per cycle, and a number quietly one cycle out of date is worse than no number. The [negative marking schemes reference for paper setters](/blog/negative-marking-schemes-of-indian-exams-for-paper-setters) deliberately prints none for Prelims either, for the same reason. Everything else is below.",
    },
    {
      type: "h2",
      text: "Three Things to Take Off the Notification First",
    },
    {
      type: "p",
      text: "Open the current notification before you open the editor, and write down three things.",
    },
    {
      type: "ul",
      items: [
        "The penalty, exactly as the notification words it - including whether it is expressed as a fraction of the question's marks or as a flat deduction.",
        "The mark value of a single question in the paper you are rebuilding.",
        "Which of the two papers counts towards merit, and which is qualifying only.",
      ],
    },
    {
      type: "p",
      text: "Those three decide the arithmetic together, and none decides it alone. A penalty written as a fraction is a fraction of something, and the something is the mark value - so the fraction by itself is not a number you can type into a marks panel. The mark value by itself gives a total that looks right and scores wrong. Merit status decides whether any of it moves a rank: a penalty on a qualifying paper changes who clears a threshold, while on the merit paper it reorders everyone above it. Check one more thing while the notification is open - whether any question type is excepted.",
    },
    {
      type: "h2",
      text: "The Two Papers Are a Build Decision, Not a Formatting One",
    },
    {
      type: "p",
      text: "You can build the two papers as two separate exams, or as one exam with two sets of sections. Both work, and they are not equivalent.",
    },
    {
      type: "p",
      text: "One exam produces one score and one rank list. If the notification says one of the two papers is qualifying only, a single exam adds a qualifying score to a merit score and reports a total that corresponds to nothing. Two separate exams give two score reports, two rank lists and two clocks that cannot bleed into each other. Build them as two exams unless you have a reason not to.",
    },
    {
      type: "p",
      text: "Inside each exam, sections carry their own time. With section switching left off, the paper runs as a sequence of timing units sat in order: a submitted unit stays closed, and unused time never carries forward. Turn it on and the whole paper runs on one clock with free movement. Pick what the notification describes, not what feels generous. [How to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) covers what happens when the clock runs out mid-question.",
    },
    {
      type: "p",
      text: "Marks resolve down a chain - question, then section, then the exam default - so one exam can still carry two schemes. The instructions page shows candidates a table generated from what you actually built: section name, question count, maximum marks, sectional timing, total. It is the cheapest way to catch a section you mistyped.",
    },
    {
      type: "h2",
      text: "Statement-Based Questions: The Count Is Not the Fairness Lever",
    },
    {
      type: "p",
      text: "The format is a stem, a numbered list of statements, and an option set about which of them hold. Paper setters argue about how many statements is fair. The count is the wrong lever. Each statement is independently true or false, so three statements produce eight possible truth-combinations and four produce sixteen - but the candidate never faces eight or sixteen choices. They face whatever the option set offers. Fairness lives in the gap between those two numbers.",
    },
    {
      type: "p",
      text: "A statement set is fair when a candidate certain about one statement can eliminate at least one option with that certainty alone. Write the options against that test first, then decide how many statements you need to make it pass. If every option contains the second statement, knowing the second statement is worthless - a lottery dressed as a discriminator.",
    },
    {
      type: "ul",
      items: [
        "Each statement must be judgeable on its own. A statement you cannot evaluate without first settling another is one statement badly split into two.",
        "No statement should be true by definition or trivially false. Those occupy a slot and discriminate nobody.",
        "Vary which statements are correct across the paper. A set where the middle one is always false teaches a pattern, not a subject.",
        "Confirm at least one option falls away from each single statement. If none does, rewrite the options before the statements.",
      ],
    },
    {
      type: "p",
      text: "Two editor limits to plan around. The rich-text Lists control inserts a bullet list only - there is no numbered-list button - so statement numbers are typed into the stem rather than generated, and they need to stay consistent across the paper by hand. And a reading passage lives inside each question's own text, repeated for every question in the cluster; there is no shared-passage object to link them to.",
    },
    {
      type: "h2",
      text: "Assertion and Reason: The Format That Punishes a Lazy Option Set",
    },
    {
      type: "p",
      text: "An assertion-reason item gives two claims and asks about the relationship between them. The classic option set has four entries: both true and the reason explains the assertion; both true but the reason does not explain it; the assertion true and the reason false; the assertion false. Four options, four distinct logical outcomes.",
    },
    {
      type: "p",
      text: "The second one is where the format earns its keep. A false reason is easy to write and tests one fact. A reason that is independently, verifiably true and still does not explain the assertion is hard, and it is the only version of this format that tests reasoning rather than recall. If a paper's assertion-reason questions never use that option as the key, the format is decoration.",
    },
    {
      type: "p",
      text: "Mechanically it is an ordinary single-answer multiple choice question. The editor opens a new question with four empty option boxes, drops any left blank on save, and has an Add Option button for a fifth - so the count is yours. Here, resist trimming. The four outcomes are the point.",
    },
    {
      type: "quote",
      text: "A Prelims question is not a memory test with four boxes bolted on. It is a decision procedure, and the options are the procedure. Write them first.",
    },
    {
      type: "h2",
      text: "Options That Reward Elimination Rather Than Recall",
    },
    {
      type: "p",
      text: "The standard worth holding for a Prelims option is that every distractor matches a specific wrong belief a prepared candidate might plausibly hold. Not a random wrong year, not a name from a different century - a mistake someone would actually make. A distractor nobody picks is a wasted slot, and a four-option question where one option is never chosen is a three-option question you paid four options for. [How to write good multiple choice questions](/blog/how-to-write-good-multiple-choice-questions) goes through stems, distractors and the all-of-the-above trap.",
    },
    {
      type: "p",
      text: "You can check this afterwards instead of guessing. Per-question analytics report which wrong option was picked most often, counted across everyone who attempted that question, alongside the questions most often skipped and most often flagged for review. Together they say whether a distractor is doing any work. You never see who picked what - the counts are aggregate, and the only names on that page are the leaderboard usernames.",
    },
    {
      type: "h2",
      text: "Build Order and the Checks Before You Publish",
    },
    {
      type: "p",
      text: "Order matters more than the settings do, because some of these are expensive to undo.",
    },
    {
      type: "ul",
      items: [
        "Create the exam, then its sections with their own times, before any questions exist. Sections are what marks and clocks hang off.",
        "Get the questions in. If the paper exists as a PDF, the universal bulk route is JSON: run the published extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI you use, then upload the output. Server-side PDF import is off by default and switched on per creator on request, so do not plan around it.",
        "Expect to hand-enter anything that is not a straightforward choice question. The importer leaves numeric, TITA and match-the-column items as placeholders to complete in the editor.",
        "Set the exam-level marking default first, then override only the sections that genuinely differ. A question given its own rule keeps it after you change the default later.",
        "Write the scheme into the general instructions in words, in every language you publish in. The drift notice warns when the stored text stops matching the paper - it only warns, never blocks, and it does not check marks at all.",
        "Preview the paper yourself and sit a few questions. A creator preview records nothing: no attempt, no responses, no analytics, no leaderboard entry.",
      ],
    },
    {
      type: "p",
      text: "One publish rule is worth knowing before it surprises you. A paper with marks on only part of it is blocked outright, with the uncovered sections named - because a single attempt on an unscored question flips the whole exam's ranking to a correct-count basis, and your scheme silently stops deciding anything. A paper with no marking scheme anywhere goes through with a warning. Partial is the state that cannot ship.",
    },
    {
      type: "h2",
      text: "What This Will Not Do for a Prelims Mock",
    },
    {
      type: "p",
      text: "Say these out loud before you promise a batch anything. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. Published papers are public: anyone with the link may attempt them, and there is no private delivery, paywall or payments. No question shuffling and no cap on attempts. No CSV or Excel export of results, no per-student report cards, no certificates, and no email, SMS or WhatsApp notification telling a batch a test is up - the product sends transactional account mail for signup and password reset, nothing else. No white-labelling, no custom domain, no mobile app, no LMS or Google Classroom integration, no subjective grading.",
    },
    {
      type: "p",
      text: "The AI only extracts questions from a PDF you supply; it never writes them from a syllabus, so a Prelims mock is still a paper somebody wrote. Two things are granted rather than switched on: the Mock versus Previous Year label, a per-creator grant enforced on the server that a creator without it never even sees, and the Verified Creator badge, granted on request and never automatically.",
    },
    {
      type: "h2",
      text: "After the Paper Is Live",
    },
    {
      type: "p",
      text: "Duplicating an exam carries the marking scheme, the timing groups and the bilingual language links, which makes a year-on-year series cheap: build the shape once, duplicate it, swap the questions. The copy is best-effort, so open it and check the marking before publishing. And if a wrong key turns up after students have sat the paper, fix it at once - marks are computed at submission and stored on that attempt, so a correction changes the next score, not the last one.",
    },
    {
      type: "p",
      text: "If you have never sat a mock on this interface, sit a [UPSC Prelims mock test](/mock-test/upsc-prelims) yourself before building one. A few minutes on the candidate side will tell you more about your instructions page than any checklist. Then [see everything a creator can build](/for-creators) and start the paper. It is free and takes no card.",
    },
  ],
  faqs: [
    {
      question: "How do I create a UPSC Prelims mock test online?",
      answer:
        "Create the exam, build each paper as its own sections with its own time, set the marking scheme from the current notification, then publish and share the link. Build the two papers as two separate exams rather than one, so a qualifying score is never added to a merit score in a single total. The questions are the real work: statement sets and assertion-reason pairs whose options can be eliminated, not just recalled.",
    },
    {
      question: "What negative marking should I set on a UPSC Prelims mock?",
      answer:
        "Take it off the current notification - this site deliberately prints no figure for UPSC Prelims, because a penalty copied from a blog is exactly the kind of number that is quietly a cycle out of date. Read three things together: the penalty exactly as worded, the mark value of a single question in the paper you are rebuilding, and which of the two papers counts towards merit. The penalty alone is not enough, because a fractional penalty is a fraction of the mark value. Also check whether any question type is excepted.",
    },
    {
      question: "How many statements should a statement-based question have?",
      answer:
        "The count is the wrong question. Each statement is independently true or false, so three statements produce eight truth-combinations and four produce sixteen, while the candidate only ever sees the option set in front of them. A question is fair when certainty about any single statement eliminates at least one option. Write the options against that test first, then use however many statements make it pass, and make sure each statement can be judged without first settling another.",
    },
    {
      question: "Can I build the two Prelims papers as one test with two sections?",
      answer:
        "Yes, and the sections can carry different times and different marking rules, because marks resolve from the question to the section to the exam default. But one exam produces one score and one rank list, so if the notification says one paper is qualifying only, a single exam reports a combined total that means nothing. Two separate exams give two score reports and two clocks that cannot bleed into each other.",
    },
    {
      question: "Can I stop students from cheating on a published Prelims mock?",
      answer:
        "No, and it is better to know that before you promise a batch anything. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or cap on attempts. Published papers are public, so anyone with the link may attempt them and there is no private or paid delivery to one batch. Use a mock as a diagnostic the student runs honestly, and treat the score accordingly.",
    },
  ],
};

export default post;
