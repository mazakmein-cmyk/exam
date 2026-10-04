import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-start-an-online-test-series-for-your-coaching-institute",
  title: "How to Start an Online Test Series for Your Coaching Institute",
  metaTitle: "Start an Online Test Series for Your Coaching | MockSetu",
  metaDescription:
    "Launch a test series: pick one exam and one batch, build three papers before you announce, split writing from checking, and read the week-six numbers.",
  keywords:
    "how to start online test series, online test series for coaching institute, start a test series, test series launch, coaching institute mock tests, who checks the answer key, test series for one batch, online test series india",
  excerpt:
    "One exam, one batch, three papers nobody has seen yet. The first six weeks of a coaching test series, including the argument about the answer key you have not had yet.",
  publishedAt: "2026-10-12",
  updatedAt: "2026-10-12",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send an institute owner to a student pillar.
    "For Creators",
    "Coaching Growth",
    "test series",
    "coaching institute",
    "online exam platform",
  ],
  hero: {
    eyebrow: "Coaching Growth",
    h1: "How to Start an Online Test Series for Your Coaching Institute",
    lede: "Start with one exam and one batch. Build three papers before you announce anything. The launch that works is deliberately smaller than the one you want to promise.",
  },
  content: [
    {
      type: "p",
      text: "Start with one exam and one batch. Build three complete papers before you announce anything. Have a colleague sit all three on a student account, fix what they find, then tell the batch the series exists. That is the launch, and it is deliberately smaller than the one you want to promise. A twelve-paper series announced on Monday with paper two still unwritten on Sunday night spends a batch's trust before the series has earned any.",
    },
    {
      type: "p",
      text: "What follows is the first six weeks: the exam you pick, the papers you build before you speak, who writes and who checks when there are two of you, the first argument about an answer key, and how to read the numbers at the end. The shape of a full programme - paper count, and a calendar built backwards from the notification - is covered separately in [how to create an online test series](/blog/how-to-create-an-online-test-series).",
    },
    {
      type: "h2",
      text: "Pick One Exam and One Batch, Then Make It Smaller",
    },
    {
      type: "p",
      text: "Pick the exam your institute already teaches best, not the one with the biggest market. Your advantage over a national test-series brand is not production value. It is that you can walk into the room on Thursday and ask the students who all picked option C on Q22 what they were thinking. That advantage exists only for a batch you actually teach.",
    },
    {
      type: "p",
      text: "Then halve the plan. An owner with two staff and a full teaching load has no spare evenings, and the easy chapters get used first, so paper three costs more than paper one made it look. One paper a week for eight weeks, delivered, beats a heavier schedule you stop keeping. Write the last paper's date down before the first one's: a series with a stated end is a promise you can keep, and one described as ongoing is one you will quietly stop.",
    },
    {
      type: "h2",
      text: "Build Three Papers Before You Tell Anyone",
    },
    {
      type: "p",
      text: "Three finished papers, published to nobody, is the entry fee. The first teaches you the editor. The second tells you what a paper really costs in time. The third exposes the inconsistencies between the first two - drifting section names, a penalty in one and not the other, question counts that stop matching. Across three drafts that is housekeeping. Across three published papers it is a credibility problem.",
    },
    {
      type: "p",
      text: "If the questions already exist as a PDF or a typed bank, do not retype them. The universal bulk route is JSON: run MockSetu's published extraction prompt from the [JSON upload guide](/json-upload-guide) through whatever AI assistant you already use, then upload what it produces. Figures survive the trip - the extraction records each figure's page and bounding box, and the upload crops them from your source PDF for approval. Numeric, TITA and match-the-column questions are left for manual entry. A server-side Import from PDF also exists, but it is off by default and switched on per creator on request, so plan the launch around the prompt-and-upload route.",
    },
    {
      type: "ul",
      items: [
        "Build paper one end to end - sections, questions, answer key, marking scheme, instructions - and time yourself honestly while you do it.",
        "Duplicate it for paper two rather than starting blank. A duplicate carries the questions, the marking scheme, the timing groups and the bilingual language links, and arrives unpublished with \"(Copy)\" in its name. It is best-effort, so check the copy's marks before swapping questions out.",
        "Set the marking scheme once as the exam default and override only where a section genuinely differs.",
        "Walk each paper yourself in preview. A creator preview records nothing - no attempt, no score, no leaderboard entry - so you can read the whole thing without polluting your own data.",
        "Then have someone sit it properly on a student account. Creator accounts cannot take exams, only preview their own, so your checker needs a student login.",
      ],
    },
    {
      type: "quote",
      text: "Three papers in a drawer is not a delay. It is the only version of the launch where the first student's first impression is of a finished thing.",
    },
    {
      type: "h2",
      text: "Who Writes and Who Checks",
    },
    {
      type: "p",
      text: "With two staff the temptation is for both to write and nobody to check. Invert it. The errors that cost a test series its credibility are not hard questions. They are a wrong key, a question that appears twice, and a total on the screen that does not match the total on the notice. Each one is the kind a second pair of eyes catches and the author's own reads straight past.",
    },
    {
      type: "ul",
      items: [
        "One person owns the paper: questions, options, answer key, section split, marking scheme.",
        "The other owns the check, in a fixed order - every answer key first, then the totals, then the instructions read against the paper as it now stands.",
        "The checker sits the paper start to finish on a student account. Reading questions in the editor catches different things.",
        "The owner fixes, the checker signs off. Never the same person in one sitting.",
        "Whoever publishes reads the publish dialog instead of clicking past it.",
      ],
    },
    {
      type: "p",
      text: "That last line earns its place, because the dialog separates two kinds of problem. Some block the publish: a question with no correct answer marked, a section with no questions, a question with fewer than two options, and in a bilingual paper any language whose sections and questions do not line up with the primary. Marks set on only part of the paper also block, because partial coverage quietly re-ranks the whole exam by correct count. Others only warn - no marking scheme anywhere, and instructions that have drifted out of step with the paper. A warning is still a defect. It just will not stop you shipping it.",
    },
    {
      type: "h2",
      text: "What Publishing Actually Does, Before You Announce It",
    },
    {
      type: "p",
      text: "Publishing makes a paper public. It gets a share link, it appears in the public library, and anyone holding that link may attempt it - not only your batch. There is no paywall, no private delivery, no access list and no cap on attempts. Decide that on purpose rather than discovering it. For a free series it is an asset: pages like the [SSC MTS mock test library](/ssc-mts) are where students find papers nobody sent them. If the papers are the paid product, this is the wrong place to fence them.",
    },
    {
      type: "h2",
      text: "Day One: The Message, and What Not to Promise",
    },
    {
      type: "p",
      text: "Send one message, not a thread across four days. It carries which exam the series mirrors, how many papers and between which dates, when each opens, the marking scheme in plain words, and what a student should do if they think a key is wrong. That last item is the easiest to leave out and the only one that saves an argument later.",
    },
    {
      type: "p",
      text: "The instructions page does part of the work. It opens with a table built from the exam itself - section names, question counts, maximum marks, sectional timings, and a total row once the paper has more than one section - so a candidate knows the shape of the paper before the clock starts. Columns appear only when they have something true to show, so a paper with no marks configured shows no marks column at all. That absence is worth noticing during the check.",
    },
    {
      type: "p",
      text: "Be careful what you promise around it, because several things people assume are present are absent. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. There is no question shuffling and no attempt limit. There are no certificates. No email, SMS or WhatsApp goes out when a paper opens; the only automatic mail is account email such as signup and password reset, so announcing each paper stays your job in whatever group you already run. Promise the paper and the date. Do not promise invigilation.",
    },
    {
      type: "h2",
      text: "The First Answer Key Dispute",
    },
    {
      type: "p",
      text: "Assume it is coming, and assume the student may be right. Treat it as a process event, not an argument. Marks are calculated at the moment a paper is submitted and stored on that attempt, so correcting a key changes what the next student scores and not what the ones who already sat it scored. Nothing re-scores a completed attempt. A wrong key on a live paper is only ever half-fixable - the whole argument for having a checker.",
    },
    {
      type: "p",
      text: "So publish the policy on day one, inside the announcement: how a student reports a suspected wrong key, how long you take to rule, and that a correction applies to the key and to future attempts rather than to scores already issued. Announced in advance, that reads as an institute with a procedure. Announced the morning you need it, the same sentence reads as an excuse.",
    },
    {
      type: "h2",
      text: "Week Six: How to Tell Whether It Is Working",
    },
    {
      type: "p",
      text: "Six weeks in, the question is not whether students enjoyed the papers but whether the series tells you something your classes did not. Each paper has its own analytics page: a total attempt count, an accuracy and an average time on every question, and three ranked panels of up to five questions each - most skipped, most marked for review, and most got wrong, that last one naming the wrong option the largest group chose. Above them sits a top-three leaderboard by username. That is the instrument.",
    },
    {
      type: "ul",
      items: [
        "Attempts per paper across the series. Each paper's page carries its own total; write them in a row week by week and the trend is the first thing the series tells you.",
        "The most-got-wrong panel. When a whole batch converges on one distractor, Thursday's lesson has written itself.",
        "Questions with near-zero accuracy and a high average time. Before calling those hard, re-read the wording - a question nobody can parse looks exactly like one nobody can solve.",
        "Questions everyone answers correctly in seconds. Cut them; they occupy space that should be diagnosing something.",
        "Your own build time per paper. If it is still climbing by paper four, shorten the series now while it is a plan, not later while it is a promise.",
      ],
    },
    {
      type: "p",
      text: "Know what the instrument does not give you. There is no CSV or Excel export of results and no per-student report card to hand a parent. Beyond the usernames on that top-three leaderboard, the figures are counts and averages across everyone who sat the paper - never a list of who answered what. A per-student sheet means building it by hand off the screen, so decide that before promising one to anybody.",
    },
    {
      type: "h2",
      text: "What Comes After the First Series",
    },
    {
      type: "p",
      text: "Once a series has run its stated length the second one is a different job - scheduling rather than launching. Cadence is the whole of that second job, and the [weekly test schedule template for coaching batches](/blog/weekly-test-schedule-template-for-coaching-batches) covers it. [Free test series as a lead magnet for coaching institutes](/blog/free-test-series-as-a-lead-magnet-for-coaching-institutes) covers what the first paper has to do to earn a second visit.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, per-question marking, bilingual papers, JSON import, a listing in the public library - is on a first account, and nothing in this launch needs more. One exam, one batch, three papers nobody has seen yet.",
    },
  ],
  faqs: [
    {
      question: "How do I start an online test series for my coaching institute?",
      answer:
        "Pick one exam and one batch, build three complete papers before announcing anything, have a colleague sit all three on a student account, fix what they find, then publish and tell the batch. Announce a stated number of papers between stated dates rather than an open-ended series. The first paper being finished matters less than the third one existing, because the third is what proves you can keep the schedule.",
    },
    {
      question: "How many papers should be ready before I announce a test series?",
      answer:
        "Three, all checked and none published. The first teaches you the editor, the second tells you what a paper genuinely costs in time, and the third exposes the inconsistencies between the first two. Building paper two by duplicating paper one keeps the marking scheme, the timing groups and the bilingual links instead of making you set them again, though the copy is best-effort and worth checking.",
    },
    {
      question: "Can I restrict an online test series to only my own batch?",
      answer:
        "No. Publishing a paper on MockSetu makes it public: it gets a share link, it appears in the public library, and anyone with the link can attempt it. There is no paywall, no private delivery, no access list and no attempt limit. For a free series run as outreach that is an advantage, because papers carrying your institute's name reach students you never taught. If the papers are themselves the paid product, this is the wrong platform to fence them behind.",
    },
    {
      question: "What happens if I publish a paper with a wrong answer key?",
      answer:
        "Fix the key, and understand what the fix reaches. Marks are calculated when a paper is submitted and stored on that attempt, so a corrected key changes what later students score and leaves already-completed attempts exactly as they were. Nothing re-scores them. That is why a separate checker who sits the paper on a student account before publication is worth more than any amount of care from the person who wrote it.",
    },
    {
      question: "How do I know whether my test series is working?",
      answer:
        "Write down each paper's attempt count week by week; the trend across the series is the headline number. On any one paper, every question carries an accuracy and an average time, and three panels of up to five pick out the most skipped, the most marked for review and the most got wrong - the last naming the wrong option the largest group chose. Note the limits first: there is no CSV export and no per-student report card, and apart from the top-three leaderboard the figures are counts and averages, never a list of who answered what.",
    },
  ],
};

export default post;
