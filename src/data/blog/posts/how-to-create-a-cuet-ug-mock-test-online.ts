import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-cuet-ug-mock-test-online",
  title: "How to Create a CUET UG Mock Test Online",
  metaTitle: "CUET UG Mock Test: How to Create One Online | MockSetu",
  metaDescription:
    "A CUET UG paper is assembled from the subjects each candidate chose, so build one short mock per domain subject. How to set them up, duplicate them, and add Hindi.",
  keywords:
    "cuet mock test create, how to create cuet ug mock test, cuet ug practice test online, cuet domain subject paper, cuet mock test for coaching, bilingual cuet mock test, cuet question paper online, create cuet test series",
  excerpt:
    "A CUET batch does not all sit the same paper, because each paper is assembled from the subjects that candidate chose. Build one short exam per domain subject, not one long one for everybody.",
  publishedAt: "2026-10-25",
  updatedAt: "2026-10-25",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "CUET",
    "question paper setting",
    "coaching institutes",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a CUET UG Mock Test Online",
    lede: "A CUET candidate's paper is assembled from the subjects they personally chose, so a mixed batch has no single paper to sit. Build one short exam per domain subject, then duplicate your way across the rest.",
  },
  content: [
    {
      type: "p",
      text: "Build one short exam per domain subject, not one long paper for the whole batch. A CUET UG candidate sits a test assembled from the subjects they themselves selected, so a mixed coaching batch is not one audience sitting one paper. Make each subject its own exam with its own link and its own clock, then hand every student only the links matching their choices. The rest of this page is how to do that without repeating the work.",
    },
    {
      type: "p",
      text: "This is written for the person building the paper. If you want the candidate's side of it - what to revise, in what order, and how to use a mock once it exists - send them to the [CUET UG preparation strategy guide](/blog/cuet-ug-preparation-strategy) instead.",
    },
    {
      type: "h2",
      text: "Why One Big CUET Paper Is the Wrong Shape",
    },
    {
      type: "p",
      text: "With a single-paper exam you mirror the paper and everybody sits it. CUET is not that. The subject combination is the candidate's own, so a single long mock covering everything your batch studies is a paper nobody actually takes. The physics student scrolls past accountancy, the history student past chemistry, the clock is wrong for both, and the score at the end compares students who never answered the same questions.",
    },
    {
      type: "p",
      text: "Split by subject and everything gets easier. Each paper carries the clock and the marking scheme its own subject is given, each duplicates into next week's set in one action, and the analytics page for a subject paper tells you something usable instead of averaging economics and biology into a number that describes nobody.",
    },
    {
      type: "h2",
      text: "Read the Bulletin, Then Set the Numbers",
    },
    {
      type: "p",
      text: "CUET's structure has moved between cycles: the subjects a candidate may take, the questions in a paper, the duration, whether there is internal choice, whether a wrong answer costs anything. Nothing on this page will give you those figures, and that is deliberate. A mock built from last year's numbers teaches last year's pacing. Open the current NTA information bulletin for the cycle your batch is sitting and copy from it.",
    },
    {
      type: "ul",
      items: [
        "The question count for each domain subject you are building, and whether every question is compulsory or the candidate chooses a subset.",
        "The duration of a single subject paper. That becomes the section clock, and pacing practice against the wrong clock is worse than no pacing practice.",
        "Marks for a correct answer, and the penalty for a wrong one if there is any. If the bulletin charges nothing, type a zero in the wrong-answer box rather than a token deduction.",
        "The language list, and whether the language a candidate picks changes anything beyond the wording.",
        "Whether the general test and the language papers follow the domain papers' rules or their own.",
      ],
    },
    {
      type: "p",
      text: "Write those down before you open the editor. A mock whose numbers do not match the bulletin is a confident lie told to a student who trusts you.",
    },
    {
      type: "h2",
      text: "Build One Subject Properly, Then Duplicate It",
    },
    {
      type: "p",
      text: "The first paper is the expensive one. Build the subject you know best, end to end: sections, clocks, the marking scheme from the exam default downwards, the instructions in plain words, and the second language if you are publishing one. Then stop building and start copying.",
    },
    {
      type: "p",
      text: "Duplicate sits in the exam page menu and on the dashboard card menu, and both routes run the same copy rules. The copy arrives with a \"(Copy)\" suffix and unpublished. Every column on every section and question travels except the handful that must change, so the marking scheme comes too - exam default, section overrides and question overrides. Timing groups are rebuilt as fresh pools belonging to the copy, and the language twin links are remapped so the copy's two languages pair with each other. Category, description and instructions ride across.",
    },
    {
      type: "p",
      text: "One caveat. The marks and timing-group copies are deliberately fail-soft - a database hiccup can never turn a good duplicate into a failed one, which also means a partial copy fails quietly. Open the copy, check the marking panel and the section clocks, then start swapping questions.",
    },
    {
      type: "ul",
      items: [
        "Build the subject paper you understand best, completely, before you build any other.",
        "Sit it yourself in preview and reach the end. A creator preview records nothing - no attempt, no analytics row, no leaderboard entry.",
        "Duplicate it once per remaining subject, rename each copy, then replace the questions.",
        "Open each copy's marking panel and section clocks and confirm they survived, before you edit anything else.",
        "Give every paper in the family the same exam category, so the set stays one set.",
      ],
    },
    {
      type: "p",
      text: "That last point pays off twice. Your dashboard filters your exam list by category, and [the MockSetu marketplace](/marketplace) filters the public library by it too - with the filter held in the URL, so a filtered view is a link you can paste into a batch group.",
    },
    {
      type: "quote",
      text: "A CUET batch is not one audience. It is as many audiences as there are subject combinations in the room, and one long paper serves none of them.",
    },
    {
      type: "h2",
      text: "The Language Question",
    },
    {
      type: "p",
      text: "CUET is sat in many languages, and a student practising in English for a paper they will attempt in another medium is rehearsing the wrong thing - in a domain subject the vocabulary of the stem is part of the difficulty. Know the limit here before you promise a batch anything: this product builds papers in English and Hindi, and in no other language. If the bulletin lists a medium your students will use and it is not one of those two, that paper cannot be built here. Within the pair, an exam carries one as its primary language and the other as a secondary, and each secondary section and question is tied to its primary twin by a shared group id - which keeps a question the same question in both languages rather than two papers sitting side by side.",
    },
    {
      type: "p",
      text: "The publish gate checks that pairing hard, per language. It looks for a counterpart to each primary section, compares the question counts, flags any translated question whose text is empty unless it carries an image, compares option counts and answer types question by question, and reports any translated question not linked to its twin. Each of those stops that language publishing - and the error names the section, with the question numbers whenever the problem is question-level, so the fix is mechanical rather than a hunt.",
    },
    {
      type: "p",
      text: "Two consequences change how you plan. Publishing selects which of your languages go live, so English can go live now and Hindi can join when the translation is done, instead of the whole paper waiting. And marks are managed on the primary language only - a marking block inside a secondary-language import is ignored with a warning. Separately, when more than one language is published, the student picks theirs on the instructions page before the clock starts. [How to create a bilingual Hindi-English online test](/blog/how-to-create-a-bilingual-hindi-english-online-test) covers that build in full.",
    },
    {
      type: "h2",
      text: "Getting the Questions In",
    },
    {
      type: "p",
      text: "Typing a full subject paper by hand is the slow route, and every key you re-enter by hand is another chance to enter the wrong one. The route open to every creator is JSON: run MockSetu's published extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI tool you already use, then upload or paste the result. Four things catch people out.",
    },
    {
      type: "ul",
      items: [
        "Section names in the JSON must match your exam's section names exactly. The importer pairs them by name, never by order. Unmatched names are listed in the preview, and on a primary-language upload a button there creates the missing sections for you - it does not appear on a secondary-language upload, because a section with no primary twin could never pair.",
        "Answer indexes are zero-based. A printed key of \"(1)\" becomes \"0\" and a key of \"(3)\" becomes \"2\". Get this wrong and the paper grades every student against the wrong option.",
        "Figures survive, though no picture is in the file: the extraction records each figure's page and bounding box, and the upload crops it from your source PDF for you to approve or re-crop.",
        "Numeric, TITA and match-the-column questions arrive as placeholders for manual entry. Budget time for those rather than meeting them at the publish gate.",
      ],
    },
    {
      type: "p",
      text: "On upload you also choose Append or Replace. Append is the safe default; Replace wipes that language's existing questions, which is what you want on a second run at the same import and nothing else. A separate \"Import from PDF\" route does the extraction server-side, but it is off by default and switched on per creator on request, so plan around prompt-and-upload. Either way the AI only extracts from a PDF you supply - nothing generates CUET questions from a syllabus, and no Excel or Word file can be imported.",
    },
    {
      type: "h2",
      text: "Chapter-Sized Papers Between the Full Mocks",
    },
    {
      type: "p",
      text: "A full subject mock is a rehearsal, and rehearsals are expensive to run weekly. The per-subject structure you have built cuts naturally into shorter papers - check which syllabus the bulletin names for each domain subject, take one unit of it, publish a short timed paper on that alone. [How to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online) is the method. Question style matters as much as coverage, so [competency-based questions for the CBSE pattern](/blog/competency-based-questions-for-the-cbse-pattern) is worth reading first.",
    },
    {
      type: "h2",
      text: "What This Will Not Do for Your Batch",
    },
    {
      type: "p",
      text: "Say this to your students before they ask, because the competition here tends not to. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or cap on attempts. Published papers are public: anyone with the link may attempt them, and there is no paid or private delivery to one batch. Results are read on the analytics page; there is no CSV or Excel export, no per-student report card and no certificates. The product sends transactional account email for signup and password reset, but never notifies a student about a test - sharing the link is your job.",
    },
    {
      type: "h2",
      text: "Before You Share the Link",
    },
    {
      type: "ul",
      items: [
        "Every subject paper is its own exam, named so a student can tell at a glance which combination it belongs to, and all of them carry the same category.",
        "Clocks and marking match the current bulletin for the cycle your batch is sitting, not the one you built last year.",
        "The marking scheme is written into the instructions in words, in every language you are publishing. The drift notice warns when stored instructions stop describing the paper, but it only warns - it never blocks a publish, and it does not watch marks at all.",
        "Every duplicate has had its marking panel and section clocks opened and confirmed.",
        "You sat the paper in preview and reached the end of it.",
        "You published before sharing. The share action refuses on an unpublished exam and tells you to publish first.",
      ],
    },
    {
      type: "p",
      text: "Built this way, a CUET season stops being one impossible paper and becomes a small library of short ones you hand out by combination. MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - sections with their own clocks, pooled timing groups, per-question marking, bilingual papers, a listing in the public library - sits behind a single account, and the first subject paper is the only one you build the slow way.",
    },
  ],
  faqs: [
    {
      question: "How do I create a CUET UG mock test online?",
      answer:
        "Build one exam per domain subject rather than a single long paper, because each candidate's CUET is assembled from the subjects they chose and a mixed batch does not share one combination. Take the question count, duration and marking scheme for each subject from the current NTA information bulletin, build the first subject paper completely, then duplicate it for every other subject and swap the questions. Give the whole family one exam category so the set stays findable.",
    },
    {
      question: "Should a CUET mock test be one paper or several?",
      answer:
        "Several. A combined paper forces a physics student to scroll past accountancy and an accountancy student past physics, puts both on a clock that is wrong for either, and the final score compares students who never answered the same questions. Separate subject papers each carry their own clock and marking scheme, duplicate cleanly into the next set, and give you an analytics page per subject whose per-question rows, grouped by section, show where the batch actually lost marks.",
    },
    {
      question: "Can I make a CUET mock test in Hindi as well as English?",
      answer:
        "Yes - but only those two. English and Hindi are the only languages this product builds in, so a CUET medium outside that pair cannot be made here at all. Within it, the exam carries one as primary and the other as secondary, with each translated section and question linked to its primary twin so question numbers stay aligned. The publish gate checks that pairing per language - matching sections, matching question counts, no empty translated text, matching option counts and answer types - and blocks only the language that fails. You can publish English first and add Hindi later, since publishing selects which of your languages go live. Marks are managed on the primary language only.",
    },
    {
      question: "What is the fastest way to get CUET questions into a mock test?",
      answer:
        "Run MockSetu's published extraction prompt from the JSON upload guide against your source PDF in whatever AI tool you already use, then upload the JSON. Section names must match your exam's section names exactly, answer indexes are zero-based so a printed key of \"(1)\" is \"0\", and figures come through as page and bounding-box references that get cropped from your PDF for approval. Numeric, TITA and match-the-column questions are left as placeholders for manual entry. A server-side \"Import from PDF\" route exists, but it is off by default and switched on per creator on request, so plan around the prompt-and-upload route.",
    },
    {
      question: "Can I restrict a CUET mock test to my own batch?",
      answer:
        "No. A published paper is public - anyone with the link can attempt it - and there is no paid or private delivery, no attempt limit and no proctoring of any kind. If a paper must not circulate, do not publish it. For everything else, treat the public link as a feature: it costs nothing to share and students outside your batch attempting it does not affect what your own students see.",
    },
  ],
};

export default post;
