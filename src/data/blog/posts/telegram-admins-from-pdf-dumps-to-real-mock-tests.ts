import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "telegram-admins-from-pdf-dumps-to-real-mock-tests",
  title: "For Telegram Channel Admins: From PDF Dumps to Real Mock Tests",
  metaTitle: "Telegram Channel Mock Test: Beyond PDF Dumps | MockSetu",
  metaDescription:
    "A forwarded PDF carries no clock, no score and no channel name. How a Telegram exam-prep admin turns the same papers into hosted mock tests that report back.",
  keywords:
    "telegram channel mock test, telegram exam prep channel, pdf to online mock test, telegram study channel monetisation, host mock test for telegram, convert pdf question paper, online test series telegram, telegram channel admin tools",
  excerpt:
    "A forwarded PDF is unattributable and unmeasurable. The archive is still good - it just needs to stop being a file and start being a paper that reports back.",
  publishedAt: "2026-10-14",
  updatedAt: "2026-10-14",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Coaching Growth",
    "telegram channel",
    "mock test platform",
    "question paper setting",
  ],
  hero: {
    eyebrow: "Coaching Growth",
    h1: "For Telegram Channel Admins: From PDF Dumps to Real Mock Tests",
    lede: "You already have the distribution most institutes would pay for. The file you are distributing is the weak part - it loses your name on the first re-forward and tells you nothing about the people who solved it.",
  },
  content: [
    {
      type: "p",
      text: "A forwarded PDF cannot be attributed and cannot be measured. That is the whole problem with running an exam-prep channel on file dumps: the moment a paper leaves your channel it travels without your name, and it comes back with nothing to tell you about who sat it. A hosted mock test fixes both at once. You post one link instead of a file, the paper runs on a clock with a question palette and a real marking scheme, and afterwards you get aggregate data on the batch that attempted it.",
    },
    {
      type: "p",
      text: "This is written for the admin, not the aspirant. Distribution is the hard half of this business and you already have it; what follows is how to put a real paper at the end of it. Two companion pieces sit either side: [a Telegram quiz bot versus a real exam simulator](/blog/telegram-quiz-bot-vs-exam-simulator) draws the line between the formats, and [how YouTube educators can add a test series](/blog/how-youtube-educators-can-add-a-test-series) is the same move for a video audience.",
    },
    {
      type: "h2",
      text: "What a Forwarded PDF Actually Costs You",
    },
    {
      type: "p",
      text: "A PDF is a photograph of a paper. No clock, so nobody discovers that they run out of road in the last section. No palette and no mark-for-review, so nobody practises parking a hard question. No marking scheme, so a wild guess feels free. And the file carries no identity: your channel name sits in the message, not inside the document, which is why the first re-forward hands your work to somebody else's subscribers.",
    },
    {
      type: "p",
      text: "A file also cannot enforce a pattern. SSC MTS runs 90 questions for 270 marks across two sessions of 45 minutes: Session I is qualifying only and carries no negative marking, Session II counts towards merit and deducts one mark for a wrong answer. On paper that is one sentence. As a mock it is two sections, two clocks and two marking rules, and no PDF can hold any of it.",
    },
    {
      type: "p",
      text: "The measurement loss is quieter and worse. A dump tells you how many people saw the message. It never tells you how many finished, which question emptied the room, or which wrong option the batch fell for. You cannot plan next week's class from a view count.",
    },
    {
      type: "h2",
      text: "The Build Route: Same PDFs, One Paper",
    },
    {
      type: "p",
      text: "Nothing in your archive is wasted. The route from a PDF to a hosted paper that works on every account is JSON. MockSetu publishes its own extraction prompt on the [JSON upload guide](/json-upload-guide): run that prompt in whatever AI assistant you already use, give it the paper, and upload the JSON it returns. There is also an Import from PDF button that runs the extraction server-side, but it is off by default and switched on per creator on request, so plan the workflow around the prompt.",
    },
    {
      type: "p",
      text: "Three details decide whether your first upload goes smoothly. The answer key is a zero-based index, so a printed Ans.(b) is the string \"1\" and not \"2\" - the off-by-one the extraction prompt itself warns about. Figures survive the trip: the JSON holds no picture, but the extraction records each figure's page and the box it occupies, and handing the upload the same source PDF crops them out for your approval before anything is saved. Numeric, TITA and match-the-column questions are not encoded as options at all - the prompt emits them as flagged placeholders carrying no answer key, and you finish those by hand before the paper will publish.",
    },
    {
      type: "ul",
      items: [
        "Create the exam and its sections first, each with the clock that section should carry, then import into them.",
        "Upload into the right section and language, and read the review screen before saving - question count, option labels, answer key, section boundaries.",
        "Set marks from the exam default downwards, overriding a section only where it genuinely differs.",
        "Clear every publish blocker: a blank question, a question with fewer than two filled options, a missing answer key, or a second language that does not mirror the primary. One more catches people out - marks set on only part of the paper disables the Publish button until every section is covered or none is.",
        "Know which notices are only notices. A paper with no marking scheme anywhere draws a banner but publishes, and the instruction-drift notice is advisory too.",
        "Publish, then share. The Share action refuses to hand you a link at all until the paper is published.",
      ],
    },
    {
      type: "h2",
      text: "Posting a Link That Survives Forwarding",
    },
    {
      type: "p",
      text: "Here is the honest mechanic, because it changes how you name things. Share on a published exam copies an address of the form /exam/<id>/intro to your clipboard, and that URL says nothing about you. The page it opens leads with the exam's name, then its description and the general instructions, with the paper's own instructions and its format on the second screen. Every scrap of attribution a re-forwarded link carries is attribution you typed into those fields. A paper titled only \"Mock Test\" is exactly as anonymous as the PDF was.",
    },
    {
      type: "ul",
      items: [
        "Put the channel name inside the exam name, not only in the Telegram message. The title is the one string that travels everywhere the link goes.",
        "Use the description for the single line a stranger needs: which exam, which pattern, who set it.",
        "Write the marking scheme into the general instructions in words, in the language your subscribers read.",
        "Tag the exam with its category - that is what the public library filters on, and how a stranger finds the paper without your link at all.",
        "Pin the link instead of reposting it. The address is the exam's own id and does not rotate, but unpublishing turns a signed-out visitor away, so leave it published once it is out there.",
      ],
    },
    {
      type: "p",
      text: "Publishing also lists the paper in the public [exam library](/marketplace), newest first, and that card does carry a byline: your username, with a verified badge beside it if you have one - the badge is granted on request, never automatically. The library is the one surface where your name travels with the paper on its own.",
    },
    {
      type: "quote",
      text: "A forwarded file loses your name on the first re-forward. A hosted paper keeps it on every screen it opens on - but only if you put it in the title.",
    },
    {
      type: "h2",
      text: "Keep the Daily Poll. Add the Weekly Paper.",
    },
    {
      type: "p",
      text: "Do not replace the quiz poll. A single question answered inside the chat, where your subscribers already are, is something no test link can replicate, and it keeps the channel alive between papers. The pairing that works is a rhythm: the poll daily in the channel, the full-length paper once a week behind a link, each feeding the other. Post the hardest question from last week's paper as today's poll, with the attempt link underneath it, and a link in the chat stops being something that dies when it scrolls.",
    },
    {
      type: "h2",
      text: "What Comes Back After the Paper",
    },
    {
      type: "p",
      text: "This is the part a PDF has no answer to. After a mock, creator analytics show Total Attempts and Completion, an average score, average time per attempted question, and a top-three leaderboard of usernames. Below that it goes question by question: Most Skipped, Most Reviewed, and which wrong option the batch chose most often. Per-question figures are counted over everyone whose sitting covered that question rather than over everyone who opened the paper, and a question somebody left blank still sits in that count - reported as unanswered, not dropped from it.",
    },
    {
      type: "p",
      text: "Know the limits before you promise anything. There is no CSV or Excel export and no per-student report card, so what you get is the shape of the batch, not a file to mail out. And one behaviour will confuse you on the first run: a visitor can tap your link and sit the entire paper without an account. Their answers are parked in their own browser until they sign in, and only then saved and scored. Close the tab without signing in and no attempt exists at all. Message views and attempt counts will never agree, and the attempt count is the honest one.",
    },
    {
      type: "h2",
      text: "The Copyright Question, Plainly",
    },
    {
      type: "p",
      text: "Digitising a paper does not create a licence to republish it. If the PDF in your archive is a coaching institute's test series, retyping it into a hosted mock is the same act as forwarding it - except your name is now attached, which makes it easier to trace, not harder. Previous-year papers set by a recruitment body sit on a different footing from a private publisher's booklet, and the terms differ by body, so read the official site rather than assuming. The archive safest to build from is the one you wrote yourself - and the only one that builds something you own.",
    },
    {
      type: "p",
      text: "One related thing is gated: the field that labels a paper Previous Year rather than Mock is a per-creator grant enforced on the server, and a creator without it never sees the field. If your channel serves one recruitment exam, send subscribers to a stable hub for it - the [SSC MTS page](/ssc-mts) is the single address for that cluster - instead of training them to wait for a new link every week.",
    },
    {
      type: "h2",
      text: "What This Will Not Do for Your Channel",
    },
    {
      type: "p",
      text: "Say this to yourself before you promise anything in a pinned message. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection. A published paper is public: anyone holding the link may attempt it, there is no private delivery to one batch, and there are no payments, paywalls or paid test series. No attempt limits, no question shuffling, no certificates, no white-labelling, no custom domain, no mobile app. And nothing here messages your subscribers when a paper goes up - MockSetu sends transactional account email for signup and password reset, nothing else - so announcing it stays your job. On a Telegram channel that is the one job you were always going to do better than a platform.",
    },
    {
      type: "h2",
      text: "The First Week",
    },
    {
      type: "ul",
      items: [
        "Pick one paper you have the right to publish and build it end to end, clocks and marking included, rather than importing a pile and finishing none.",
        "Name it so the title alone says which channel made it and which exam it mirrors.",
        "Publish, copy the link, pin it with a caption, and run that day's poll on a question from the same paper.",
        "Read the analytics the morning after, and post the Most Skipped question back into the channel as a worked solution.",
        "Build next week's paper around the gaps the first one exposed. That loop is the thing a PDF dump could never give you.",
      ],
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, negative marking, bilingual papers, a listing in the public library - sits behind one account. For the sharing side in full, including QR codes and what a student actually sees on tapping the link, read [how to share an online test with students](/blog/how-to-share-an-online-test-with-students).",
    },
  ],
  faqs: [
    {
      question: "How do I run a mock test for my Telegram channel instead of posting PDFs?",
      answer:
        "Build the paper on a hosting platform, publish it, and post the link in the channel instead of the file. On MockSetu you create the exam and its sections, import the questions - the universal route is the published extraction prompt from the JSON upload guide, run in whatever AI assistant you already use, followed by a JSON upload - set the marking scheme, publish, and copy the share link. Publishing also lists the paper in the public exam library under your username.",
    },
    {
      question: "Will my channel name stay on the test when the link is forwarded?",
      answer:
        "Only if you put it there. The share link is the exam's own address and carries nothing about the creator, and the page it opens leads with the exam name, the description and the instructions. So the title and description are your attribution, and a paper titled only Mock Test is as anonymous as a forwarded PDF. The public library card is the one place that shows your username automatically, with a verified badge beside it if you have been granted one on request.",
    },
    {
      question: "Can students take the test without creating an account?",
      answer:
        "Yes. A published paper is public, so anyone with the link can open it and sit the whole thing without signing in. Their answers are held in their own browser and are only saved and scored once they sign in afterwards. That means a student who closes the tab without signing in leaves no attempt behind, so your creator analytics count signed-in sittings only and will not line up with your message view count.",
    },
    {
      question: "Is it legal to turn someone else's PDF paper into an online mock test?",
      answer:
        "Digitising a paper does not create a licence to republish it. Re-hosting a coaching institute's test series is the same act as forwarding the file, with your name attached to it this time. Previous-year papers set by a recruitment body sit on a different footing from a private publisher's material, and the terms vary by body, so check the official site rather than assuming. Papers you set yourself carry no such risk and are the only ones that build an asset you own.",
    },
    {
      question: "Should I stop running the daily quiz poll once I have real mock tests?",
      answer:
        "No. The poll works as a daily format precisely because it lives where your subscribers already are, and a full-length paper is a weekly event rather than a daily one. Run both: the poll keeps the channel warm and advertises the paper, and the paper does the measuring the poll cannot. Posting the hardest question from last week's paper as today's poll, with the attempt link under it, makes each one feed the other.",
    },
  ],
};

export default post;
