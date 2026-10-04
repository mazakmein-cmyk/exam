import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-rrb-ntpc-mock-test-online",
  title: "How to Create an RRB NTPC Mock Test Online",
  metaTitle: "How to Create an RRB NTPC Mock Test Online | MockSetu",
  metaDescription:
    "Build an RRB NTPC mock the way the notification describes it: one exam per stage, Hindi and English from the start, and a clock you refuse to pad.",
  keywords:
    "rrb ntpc mock test create, create rrb ntpc mock test online, railway mock test maker, bilingual hindi english mock test, rrb ntpc cbt practice test for students, online test platform for railway coaching, make a railway exam mock test",
  excerpt:
    "Four decisions build an RRB NTPC mock: which stage you are mocking, which languages, what you copy off the notification, and when you publish. Here is how to make each one.",
  publishedAt: "2026-10-24",
  updatedAt: "2026-10-24",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here.
    "For Creators",
    "Exam Creation",
    "RRB NTPC",
    "Railway Exams",
    "Hindi Medium",
    "bilingual papers",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create an RRB NTPC Mock Test Online",
    lede: "Railway exams draw an enormous Hindi-medium audience, and an English-only mock is no use to it. Building a good one comes down to two things: the language the paper is sat in, and a clock that matches the notification rather than your convenience.",
  },
  content: [
    {
      type: "p",
      text: "Creating an RRB NTPC mock test online comes down to four decisions, and the current RRB notification settles three of them. Build the stage you are mocking as its own exam. Tick both Hindi and English at the moment you create it, because the language set cannot be added to later. Copy the section names, question counts, durations and marking straight out of the notification instead of from memory. Then publish and share the link.",
    },
    {
      type: "p",
      text: "What this article will not do is tell you how many questions the paper carries, how long it runs, or what a wrong answer costs. Those differ by stage and move between cycles, and a mock built on a half-remembered figure trains the wrong pace. Read them off the notification. For the candidate's side, send your batch to [the RRB NTPC preparation strategy guide](/blog/rrb-ntpc-preparation-strategy).",
    },
    {
      type: "h2",
      text: "Turn the Notification Into a Checklist Before You Open the Editor",
    },
    {
      type: "p",
      text: "Every setting in the editor maps to a line in the notification. Pull those lines out first, in the paper's own order, and the build becomes transcription rather than invention.",
    },
    {
      type: "ul",
      items: [
        "Which stage this paper is, in the notification's own words.",
        "The sections in the order the real paper presents them, with the question count for each.",
        "The clock: one deadline for the whole paper, or a separate clock per section.",
        "Marks for a correct answer, the deduction for a wrong one, and whether that deduction is the same in every section.",
        "Whether a candidate may move freely between sections or is locked into each in turn.",
        "The languages the real paper is offered in.",
      ],
    },
    {
      type: "h2",
      text: "One Exam Per Stage, Not One Exam With Two Halves",
    },
    {
      type: "p",
      text: "The stages of a railway recruitment are separate papers sat months apart, with different lengths and difficulty. Build them as separate exams and name them with the notification's own labels. If the notification calls a stage CBT 1, call your paper CBT 1 — \"Mock 1\" and \"Mock 2\" tell a candidate nothing about which paper they are sitting.",
    },
    {
      type: "p",
      text: "Build the first stage properly, then use Duplicate on its dashboard card to start the second. A duplicate carries the questions, the marking scheme, the timing groups and the language links, and it lands unpublished. It is deliberately fail-soft: if one part of the copy cannot be written, the rest still goes through — so open the copy and check a question in each section before you edit.",
    },
    {
      type: "h2",
      text: "Bilingual Is the Default Here, Not an Extra",
    },
    {
      type: "p",
      text: "For a student who will sit the real paper in Hindi, an English-only mock is a handicap dressed as practice: it measures reading speed rather than preparation. Decide it at the moment of creation. The create-exam dialog is where you tick the languages and nominate one as primary, and nothing later adds a language to an existing exam — a duplicate carries the same set, so it rescues nothing either.",
    },
    {
      type: "p",
      text: "Primary is not a label, it is ownership. The primary language decides which questions exist, what their answer keys are and how they are marked; the other carries translated text only. After that the structure keeps itself in step. Add a section and the editor creates it in every language, linked. Add a question and an empty twin appears in the Hindi section already holding the same option count and the same answer key — the key is a set of positions, so it means the same thing in either language. Change a section's duration and the change is written to its twin. You translate; you do not rebuild. The full mechanics are in [how to create a bilingual Hindi-English online test](/blog/how-to-create-a-bilingual-hindi-english-online-test).",
    },
    {
      type: "h2",
      text: "The Publish Gate Reads Both Papers, Question by Question",
    },
    {
      type: "p",
      text: "Publishing a two-language exam runs the translation against the primary first. It checks that every primary section has a partner in the other language; that the pair holds the same number of questions; that no translated question is blank, counting a figure as content; that option counts and answer types match question by question; that each pair is still linked; and that every question in both languages carries an answer key. A language that fails is locked out of the publish — its switch is disabled and the issues are listed under it, question number by question number.",
    },
    {
      type: "p",
      text: "The answer-key check is why the gate exists. Grading reads the key off the row the candidate actually sat, so a Hindi row with an empty key marks every Hindi candidate wrong on that question while its English twin scores perfectly, and nothing on screen says so. The trap runs the other way too: the primary can still go out alone while Hindi is held back, which ships an English-only paper to a Hindi-medium batch by default rather than by decision. Note what the gate does not do — the notice that fires when your stored instructions stop describing the paper is a warning, not a block. You can publish straight past it.",
    },
    {
      type: "quote",
      text: "A mock that gets the shape right and the language wrong is not a mock for a Hindi-medium candidate. It is a reading test with a railway syllabus.",
    },
    {
      type: "h2",
      text: "Set the Clock the Way the Notification Sets It, Then Refuse to Pad It",
    },
    {
      type: "p",
      text: "The temptation is to pad the clock so the batch finishes and feels good. Resist it. Build a paper faithful on time and honest on difficulty — not harder, tighter. A few spare minutes teach a pace the real screen will not allow, and the student finds that out on exam day.",
    },
    {
      type: "p",
      text: "The student screen enforces whatever you set. The paper auto-submits at zero, a question palette shows what is answered, seen and marked for review, and the countdown runs off the database rather than the tab, so a refresh resumes the same deadline instead of minting a fresh full-length one. Leave the paper on the same device for more than five minutes and that sitting is sealed and filed with the answers already saved, as a normal ranked attempt. Nobody returns to a paused clock, which is right for a rehearsal.",
    },
    {
      type: "p",
      text: "If the notification gives a stage one clock across several subjects, make each subject its own section and join them into a timing group: the group runs one pooled clock — the pool you set, or the sum of its members — and a candidate moves freely inside it. If each section has its own clock, leave them ungrouped. Then set section switching, which decides whether the grouping means anything. The default is locked: a submitted section stays closed, time never carries over, and the groups you drew are the units the candidate sits. Switch it to free and the whole paper runs on one clock, groups and all.",
    },
    {
      type: "h2",
      text: "What Your Mock Cannot Reproduce, and Should Not Pretend To",
    },
    {
      type: "p",
      text: "A railway CBT that runs in multiple shifts raises something your mock cannot answer. Whatever the notification says about how scores from different shifts are compared, your mock does not do it and cannot. MockSetu scores a raw total against the marking scheme you set — no normalisation, no percentile, no projected rank, no safe-score estimate. Write that into the instructions in both languages: this is a raw score on this paper, and the real result is a different arithmetic. Better they learn it from you than from a result sheet.",
    },
    {
      type: "p",
      text: "Be straight about the rest of it too. There is no proctoring of any kind — no webcam, no lockdown browser, no tab-switch detection — and no question shuffling or cap on attempts. A published paper is public: listed in the [public exam library](/marketplace), and any student or guest who finds it may sit it. No paywall, no payments, no private delivery to one batch. For a free test series that is a feature; if a paper must stay inside your batch, this is not the tool for it.",
    },
    {
      type: "h2",
      text: "Getting the Questions In Without Typing Them Twice",
    },
    {
      type: "p",
      text: "A full-length paper in two languages is a lot of typing, and the bulk route exists for exactly this. Run the published extraction prompt from the [JSON upload guide](/json-upload-guide) over your PDF in whatever AI you already use, then upload the JSON into the matching section. Do the primary language first: the second pass pairs each question to its primary twin by position and takes the answer key, the answer type and the cross-language link from it, so you are only supplying translated text.",
    },
    {
      type: "p",
      text: "Know the edges. The importer leaves numeric, TITA and match-the-column questions for you to add by hand, and there is no Excel or Word import. Figures do survive: the picture is not in the JSON, but the extraction records each figure's page and bounding box and the upload crops it out of your source PDF for approval. The server-side \"Import from PDF\" option, where you hand the PDF over and skip the prompt, is off by default and switched on per creator on request — the prompt plus a JSON upload is the route open to everyone. Either way the AI only extracts what is in the PDF you supply. It never generates questions from a syllabus.",
    },
    {
      type: "h2",
      text: "What You Can See After the Batch Has Sat It",
    },
    {
      type: "p",
      text: "The analytics page gives you the average time per attempted question, accuracy and average time by section, a spread of scores across bands, and for every question its accuracy, its average time over everyone who attempted it, and the wrong option picked most often. That last one is worth building a class around: it separates a topic nobody knows from one everyone confuses with a single neighbour.",
    },
    {
      type: "p",
      text: "What you will not get: no CSV or Excel export, no per-student report cards, no certificates, and nothing goes out to students by email, SMS or WhatsApp about a test — the product sends account email for signup and password reset, nothing more. You share the link yourself. Institutes running this at scale in Hindi should read [the notes for Hindi-medium coaching institutes](/blog/online-test-platform-for-hindi-medium-coaching-institutes).",
    },
    {
      type: "h2",
      text: "Before You Share the Link",
    },
    {
      type: "ul",
      items: [
        "Every section's question count and duration matches the notification line you copied, not your memory of it.",
        "Marking is set from the exam default down, and any section that differs has been overridden deliberately.",
        "Both languages are published, or you decided on purpose to release one.",
        "The instructions state the marking in words in each language, and say plainly that the score is raw and unnormalised.",
        "You previewed the paper and sat a few questions — a creator preview records nothing, so it costs no stray attempt.",
        "The title names the stage.",
      ],
    },
    {
      type: "p",
      text: "A railway mock built this way is not more sophisticated than a paid test series. It is honest about its clock, readable in the language the batch will sit in, and specific about what it does not know. [Everything a creator can build](/for-creators) is free and needs no card, and the same shape works for other recruitment papers — [the SSC MTS build walkthrough](/blog/how-to-create-an-ssc-mts-mock-test-online) is the closest worked example.",
    },
  ],
  faqs: [
    {
      question: "How do I create an RRB NTPC mock test online?",
      answer:
        "Create one exam for the stage you are mocking, tick both Hindi and English in the create-exam dialog, and add one section per section of the real paper. Take the question counts, the durations and the marking from the current RRB notification rather than from memory, since these differ by stage and change between cycles. Set the clock exactly as the notification sets it, write the marking scheme into the instructions in both languages, then publish and share the link.",
    },
    {
      question: "Should an RRB NTPC mock test be bilingual?",
      answer:
        "Yes, and you have to decide it up front. Railway recruitment draws a very large Hindi-medium audience, and for a student in it an English-only mock measures reading speed instead of preparation. The language set is fixed when the exam is created — there is no way to add a language to an existing exam afterwards, and duplicating it carries the same set. Pick one language as primary: it owns the questions, the answer keys and the marking, while the other language carries translated text only.",
    },
    {
      question: "Can an online mock reproduce the way RRB compares scores across shifts?",
      answer:
        "No. MockSetu scores a raw total against the marking scheme you set — there is no normalisation, no percentile, no projected rank and no safe-score estimate anywhere in the product. Do not imply otherwise in your instructions. Tell students plainly that the number they see is a raw score on your paper, and send them to the notification for how the board works out the real result. That is more useful to them than a fabricated percentile would be.",
    },
    {
      question: "How do I build two RRB NTPC stages as separate mocks without rebuilding everything?",
      answer:
        "Build one stage fully, then use Duplicate on its dashboard card. The copy carries the questions, the marking scheme, the timing groups and the links between the language versions, and it lands unpublished so you can rework it privately. Duplication is fail-soft by design, so open the copy and check one question in each section before you edit, then replace the content and reset the counts and clock to the second stage's notification lines.",
    },
    {
      question: "Can I keep my railway mock test private to my own batch?",
      answer:
        "No. A published paper is public: it appears in the public exam library and any student or guest who finds the link may attempt it. There is no paywall, no payment handling and no private delivery to a named group. There is also no proctoring of any kind — no webcam, no lockdown browser and no tab-switch detection — and no limit on attempts. For a free test series used to attract students that is usually what you want, but if a paper must stay inside one batch, this is not the right tool.",
    },
  ],
};

export default post;
