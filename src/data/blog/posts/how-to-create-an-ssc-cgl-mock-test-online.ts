import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-ssc-cgl-mock-test-online",
  title: "How to Create an SSC CGL Mock Test Online",
  metaTitle: "How to Create an SSC CGL Mock Test Online | MockSetu",
  metaDescription:
    "Build an SSC CGL mock online: one exam per tier, a section per subject, sectional or single clock, Hindi and English parity, and marking set before you publish.",
  keywords:
    "ssc cgl mock test create, how to create ssc cgl mock test online, ssc cgl online test series, make ssc cgl practice test, sectional timing online test, bilingual hindi english mock test, ssc cgl tier 1 mock test creator",
  excerpt:
    "SSC CGL is not SSC MTS, and copying the MTS shape is the fastest way to ship a wrong paper. Here is how to build a CGL mock from the bulletin outwards - tiers, sections, clocks, two languages and marking.",
  publishedAt: "2026-10-23",
  updatedAt: "2026-10-23",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "SSC",
    "sectional timing",
    "bilingual papers",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create an SSC CGL Mock Test Online",
    lede: "Five decisions, and typing the questions is none of them. One exam per tier, one section per subject, sectional clocks or one, Hindi alongside English, and the marking scheme - those decide whether your mock rehearses the real paper or quietly teaches the wrong habits.",
  },
  content: [
    {
      type: "p",
      text: "Building an SSC CGL mock online is five decisions. Create one exam per tier, add one section for each subject the current bulletin names, decide whether each section carries its own clock or the whole paper shares one, put the paper up in Hindi as well as English, and set the marking scheme before a single candidate sits it. Everything after that is data entry. This is written for the person building the paper - a candidate who landed here wants the [SSC CGL preparation strategy](/blog/ssc-cgl-preparation-strategy) instead.",
    },
    {
      type: "h2",
      text: "Take the Pattern From the Bulletin. SSC CGL Is Not SSC MTS.",
    },
    {
      type: "p",
      text: "The expensive mistake here is assuming one staff-selection paper looks like another. SSC MTS runs 90 questions for 270 marks across two sessions of 45 minutes each, where Session I is qualifying only and carries no negative marking and Session II counts towards merit with minus one. That two-session shape belongs to MTS. It is not the CGL shape, and nothing about it transfers.",
    },
    {
      type: "p",
      text: "So before the editor is open, have the current SSC notice in front of you and write down six things: how many tiers there are, what sections each tier contains, how many questions per section, what a question is worth, how long the paper runs and on what kind of clock, and what a wrong answer costs. Those six facts are the whole specification. MockSetu reproduces whatever you type and has no way of telling you it is last year's pattern. For the mechanics of a session-based paper, [how to create an SSC MTS mock test online](/blog/how-to-create-an-ssc-mts-mock-test-online) walks one end to end - read it for the method and take none of its numbers.",
    },
    {
      type: "h2",
      text: "Build One Exam per Tier, Not One Exam With Tier Sections",
    },
    {
      type: "p",
      text: "Each tier the notice describes is a separate sitting, with whatever duration and penalty the notice gives it. Model it as a separate exam. Folding two tiers into one exam as sections forces them to share one timing mode, one instructions page and one results view, and hands the candidate a sitting that exists nowhere in the real calendar.",
    },
    {
      type: "p",
      text: "Separate exams also keep the analytics honest: section-wise performance is reported per section within an exam, so a tier of its own gets its own cohort and its own weak-section list. When you need the next tier or the next set in a series, duplicate rather than rebuild - a duplicate carries the marking scheme, the timing groups and the language links across. That copy is deliberately fail-soft, so open it and check its marks and clocks first.",
    },
    {
      type: "h2",
      text: "One Section per Subject, Named the Way the Notice Names It",
    },
    {
      type: "p",
      text: "Inside the exam, each subject the bulletin lists becomes one section with its own name and minutes box, and the rows drag to reorder so the paper runs in the printed order. Section names are not an internal label. The candidate's instructions run two screens, and the second opens with a table of the paper - serial number, section name, number of questions, and, where they apply, maximum marks and sectional timing, with a total row under them - built from exactly these rows.",
    },
    {
      type: "p",
      text: "Which means a section still called \"New Section 2\" is published copy. Use the bulletin's own wording, subject by subject. The count and marks columns fill themselves from what you built, so the table doubles as a proofreading tool: a section showing a count you did not intend is short of questions, not short of a label.",
    },
    {
      type: "h2",
      text: "Sectional Clocks or One Clock: the Decision That Changes the Paper",
    },
    {
      type: "p",
      text: "At the top of the Sections card sits the switch that decides what every row beneath it means. It has exactly two positions. Left off - the default - each section runs on its own clock, the candidate sits one section at a time, and submitting a section closes it for good with no time carried forward. Turned on, the entire paper runs on one clock, the candidate sees a tab per section and may move between them in any order until they submit or time expires. Turning it on offers the sum of the section clocks as the whole-paper total, so four sections of fifteen minutes each proposes sixty, and you can type a different number over it.",
    },
    {
      type: "p",
      text: "Pick the one the bulletin describes, not the one that feels generous. The two modes train opposite instincts. Under sectional locks a candidate must abandon a question that is going well, because the minutes do not travel. Under one paper clock the whole skill is deciding where to spend the surplus. Getting this backwards is worse than no mock at all.",
    },
    {
      type: "p",
      text: "There is a middle shape for papers that lock at the group level rather than per subject: pick two or more sections and group them to share one pooled clock, and they are reordered to sit together. They then behave freely among themselves while the boundary with the rest of the paper stays locked. Grouping is edited on the primary-language tab, does not apply while whole-paper switching is on, and is marked as shared timing in the instructions table.",
    },
    {
      type: "quote",
      text: "A mock reproduces the clock as faithfully as it reproduces the questions - or it teaches a time strategy the real hall will refuse to honour.",
    },
    {
      type: "h2",
      text: "Hindi and English, Set Up Before You Start Typing",
    },
    {
      type: "p",
      text: "For this audience bilingual delivery is close to mandatory, and far easier set up at creation than bolted on later. A bilingual paper is one exam holding two linked sets of rows: each section has a twin in the other language, each question a twin in its twin section. The candidate picks a language on the instructions page and sits the whole paper in it; there is no mid-paper switch.",
    },
    {
      type: "p",
      text: "Publishing enforces that pairing. Before a language can be selected it must mirror the primary one: every section present, the same question count in each, no empty question text, the same number of options, the same answer type, and a live link to its primary twin. A language failing any of those - or carrying a question with no answer key at all - is listed with its issues and cannot be switched on, though you can publish the other language alone and come back. Each language row carries its own answer key, which is why every language needs one. The marking scheme is shared, resolved from the primary twin. [How to create a bilingual Hindi and English online test](/blog/how-to-create-a-bilingual-hindi-english-online-test) covers the build order that avoids all of it.",
    },
    {
      type: "h2",
      text: "Marking, and the One Setting That Actually Blocks a Publish",
    },
    {
      type: "p",
      text: "Marks are three numbers on a question - what a right answer earns, what a wrong one costs, what a blank costs - resolved down a chain from the question to its section to an exam-wide default. Set the exam default to whatever the bulletin gives for most of the paper, then override the sections that differ. [How to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) has the full panel.",
    },
    {
      type: "p",
      text: "One marking state blocks publishing outright: marks configured on part of the paper and absent from the rest. Either the whole paper carries marks or none of it does - the dialog names the sections with holes and keeps the Publish button disabled until they are filled or cleared. An exam with no marking anywhere publishes fine and ranks by correct count, behind a red advisory that no marking scheme is configured. The separate notice about instructions drifting from the paper only warns, so a stale instructions block will go out if you ignore it.",
    },
    {
      type: "h2",
      text: "Getting the Questions In Without Typing Them Twice",
    },
    {
      type: "p",
      text: "If the paper already exists as a PDF, the universal route is JSON. Run the published extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI tool you already use, then upload the result. Two things decide whether that upload lands cleanly. Sections are matched by exact name, so the section names in the JSON must be character-for-character the ones in your exam; and the answer key is a zero-based index, so the first option is 0 and a paper whose key printed \"(1)\" is off by one all the way down.",
    },
    {
      type: "p",
      text: "The importer handles single-correct and multiple-correct questions; numeric, TITA and match-the-column questions arrive as flagged placeholders for you to complete in the editor. Figures survive the trip - the picture is not inside the JSON, but each figure's page and position are recorded and the upload crops it out of your source PDF for approval. Server-side PDF import, where extraction runs for you instead of in your own AI tool, is off by default and switched on per creator on request. Either route only reads a PDF you supply; neither writes questions from a syllabus.",
    },
    {
      type: "h2",
      text: "What This Will Not Do, Stated Plainly",
    },
    {
      type: "p",
      text: "There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or cap on attempts, so a mock here is a rehearsal, never an invigilated selection test. Published papers are public: anyone with the link can attempt them, and there is no paid, private or batch-only delivery. Results stay on the platform - no CSV or Excel export, no per-student report cards, no certificates - and nothing emails or messages your students that a test is ready, though the product does send ordinary account email for signup and password reset. No white-labelling, custom domain, mobile app, LMS or Google Classroom integration, and no subjective grading. Tagging a paper as previous-year rather than mock is a per-creator grant given on request, so an account without it does not see that field at all.",
    },
    {
      type: "h2",
      text: "The Pre-Publish Checklist",
    },
    {
      type: "p",
      text: "Run this before the link leaves your hands. A published paper is public the moment it goes out, and a wrong answer key only ever scores the attempts that come after you fix it.",
    },
    {
      type: "ul",
      items: [
        "Every section is named and ordered as the bulletin does, and the instructions table's counts and marks match what you advertised.",
        "The clock mode matches the notice - sectional, one paper clock, or a pooled group - and the total reads the way you expect.",
        "The Hindi rows mirror the English ones section for section and question for question, and both languages are selectable in the publish dialog.",
        "Marks cover the whole paper or none of it, and the penalty is the bulletin's number rather than a plausible one.",
        "The general instructions say the marking scheme and the navigation rule out loud, in both languages.",
        "Preview the paper yourself and sit a few questions. A creator preview records nothing - no attempt, no score, no analytics row.",
        "Publish first, then share: the share action only copies a link once the exam is published.",
      ],
    },
    {
      type: "h2",
      text: "After the First Batch Sits It",
    },
    {
      type: "p",
      text: "Once attempts land, the analytics page gives section-wise accuracy and timing for the cohort, plus per-question figures averaged over everyone who attempted each question - including which wrong option was picked most often. A wrong option beating the right one points at a flawed question or an untaught topic, and both are fixable before the next set goes out.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build here](/for-creators) - sections with their own clocks, pooled timing groups, bilingual papers, a listing in the public library - sits behind one account, and the CGL paper described above uses nothing beyond it.",
    },
  ],
  faqs: [
    {
      question: "How do I create an SSC CGL mock test online?",
      answer:
        "Create an exam, add one section for each subject the current SSC notice lists, give each section its minutes and its questions, choose between sectional clocks and a single paper clock, build the Hindi rows alongside the English ones, set the marking scheme, then publish and share the link. Take every number - section list, question counts, duration, penalty - from the current bulletin rather than from another SSC paper.",
    },
    {
      question: "Can I use an SSC MTS mock as a template for SSC CGL?",
      answer:
        "No. SSC MTS has its own shape - 90 questions for 270 marks across two 45-minute sessions, with Session I qualifying and penalty-free and Session II counting for merit at minus one - and none of that carries to CGL. Build CGL from its own bulletin. You can duplicate an existing exam to reuse the platform setup, but replace the sections, counts, timing and marking rather than editing the names.",
    },
    {
      question: "Should an SSC CGL mock use sectional timing or one clock?",
      answer:
        "Whichever the current bulletin specifies, because the two train opposite habits. With sectional clocks the candidate sits one section at a time and a submitted section closes for good, with no minutes carried forward. With one paper clock they get a tab per section and can move freely until they submit or time runs out. There is also a middle option: group two or more sections so they share one pooled clock while staying locked off from the rest of the paper.",
    },
    {
      question: "Do I have to make the mock bilingual?",
      answer:
        "Not technically, but for this audience it is close to mandatory, and the platform makes the two languages one exam rather than two. Before a second language can be published it has to mirror the primary one - same sections, same question count, no blank question text, same option count and answer type, and a live link to the primary row - and the dialog lists anything that fails. Each language row carries its own answer key, so the Hindi questions need keys of their own; only the marking scheme is shared with the primary.",
    },
    {
      question: "Can I stop students from cheating on an online SSC CGL mock?",
      answer:
        "No, and it is better to say so. There is no webcam proctoring, no lockdown browser, no tab-switch detection, no question shuffling and no attempt limit, and a published paper is public to anyone with the link. A mock here is a rehearsal and a diagnostic. For anything where the result decides something, supervise the room yourself.",
    },
  ],
};

export default post;
