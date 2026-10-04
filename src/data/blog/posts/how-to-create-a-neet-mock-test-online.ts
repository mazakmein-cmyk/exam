import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-a-neet-mock-test-online",
  title: "How to Create a NEET Mock Test Online: 180 Questions, One Clock",
  metaTitle: "How to Create a NEET Mock Test Online | MockSetu",
  metaDescription:
    "Build a NEET mock test online: subject sections, 180 questions imported rather than typed, one 180-minute clock, diagrams that survive, and marking from the bulletin.",
  keywords:
    "neet mock test create, how to create a neet mock test online, neet online test series, neet mock test maker, 180 question online test, neet test series for coaching, create neet practice test, neet mock test software",
  excerpt:
    "A NEET mock is 180 questions, 720 marks and 180 minutes on one clock. The settings are the quick part; getting the questions in is the long one. Here is how to make the long part as short as it can be.",
  publishedAt: "2026-10-21",
  updatedAt: "2026-10-21",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Exam Creation",
    "NEET",
    "question paper setting",
    "mock test setup",
    "bulk import",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create a NEET Mock Test Online: 180 Questions, One Clock",
    lede: "180 compulsory questions, 720 marks, 180 minutes. The settings that make a paper behave like the real one are a short job. Getting 180 questions into it is the long one, and that is the part worth planning.",
  },
  content: [
    {
      type: "p",
      text: "Creating a NEET mock test online is four jobs in order: build one section per subject part, get 180 questions into those sections, put the whole paper on a single 180-minute clock, and set the marking before anyone can open it. NEET UG runs 180 compulsory questions for 720 marks in 180 minutes, so the arithmetic every setting has to agree with is four marks a question and one minute a question. The questions are the slow job. Plan to import them rather than type them.",
    },
    {
      type: "p",
      text: "This is written for the person building the paper. A student looking for a full-length paper to sit should go to the [NEET UG mock test page](/mock-test/neet-ug) instead.",
    },
    {
      type: "h2",
      text: "Build the Sections Before Anything Else",
    },
    {
      type: "p",
      text: "Create the sections first, name them properly, then fill them. The bulk importer matches a section in your JSON to one in your exam by exact name, and anything it cannot match is skipped with its questions still stuck in the file — so a name you mean to tidy up later costs you a rename and another upload. Sections are also what analytics report on, so one per subject part is what gives you an accuracy figure per subject. Take the list of parts, and the question count in each, from the current NEET information bulletin rather than from memory: do not assume 180 splits evenly across them. Whatever split it gives, the arithmetic you own is that your sections add up to 180, and each section row carries a live question count so you can check as you build. Build the heaviest part first: it is the longest stretch of work, and finishing it leaves the short parts for a tired evening.",
    },
    {
      type: "h2",
      text: "One Clock for the Whole Paper, Not One Clock Per Section",
    },
    {
      type: "p",
      text: "A sectioned paper defaults to one section at a time, each on its own clock, with a submitted section closed for good. Wrong shape here. Turn on section switching: the whole paper then shares one clock, and the student gets a tab per section, free to move between them in any order until they submit or time runs out.",
    },
    {
      type: "p",
      text: "If no whole-paper total is set yet, switching it on seeds one from the sum of your section times — rarely the number you want. Type 180 into the total-time field and leave it. The hint underneath reads back what the student actually gets: one clock across every section, with the per-section average beside it, so a paper that ends up with four sections reads about 45 minutes each. The per-section minutes are kept rather than zeroed, and come back if you ever switch the mode off.",
    },
    {
      type: "p",
      text: "Two knock-ons. The instructions page drops its Sectional Timing column, because there is none left to print. And any instruction text you already wrote now describes the old mode: the editor says so and offers to regenerate it from the exam. Take the offer, then read what it wrote.",
    },
    {
      type: "quote",
      text: "Separate section clocks do not make a NEET mock. They make a set of short tests that share a title - and they hide the judgement the real paper tests hardest: where the three hours go.",
    },
    {
      type: "h2",
      text: "Getting 180 Questions In Without Typing 180 Questions",
    },
    {
      type: "p",
      text: "Typing a full NEET paper by hand, with options and answer keys, is a day of work that buys nothing a machine cannot do faster — and it is the step a planned test series stalls on. The route that works on every account is the published extraction prompt plus a JSON upload: run MockSetu's prompt from the [JSON upload guide](/json-upload-guide) in whatever AI you already use, give it your question paper PDF, and upload the JSON it hands back.",
    },
    {
      type: "ul",
      items: [
        "Create and name every section first. The importer matches on exact section name; anything unmatched is reported and skipped, never guessed at.",
        "Check the answer indices. The format numbers options from zero, so the first option is 0 and the fourth is 3. Number them from one instead and every answer lands on the wrong option; only the ones that fall out of range get reported.",
        "If the file is rejected as too large - the cap is 10 MB - emit one subject at a time and upload the files in turn. The parser commits only the sections it finds, so splitting is safe.",
        "Expect placeholders. Numeric, TITA and match-the-column questions are left for manual entry, but they keep their printed question number, so your paper's numbering still lines up with the PDF.",
        "Read the skipped list in the preview before you commit. It names the questions that did not make it, and why.",
      ],
    },
    {
      type: "p",
      text: "Two limits, plainly. The server-side Import from PDF route is off by default and switched on per creator on request, so do not plan around it until you have asked; the route above is the one every account has. And the AI only extracts from a PDF you supply — it does not write NEET questions from a syllabus.",
    },
    {
      type: "h2",
      text: "Diagrams: the Part Biology Cannot Do Without",
    },
    {
      type: "p",
      text: "A question that points at a labelled diagram is worthless as text, and a biology section will have them. The extraction handles this without putting pictures in the JSON: each figure is recorded as a page number plus a bounding box on that page, in a normalised 0 to 1000 grid. On upload the dialog says how many images the file references and asks for the source PDF. Attach it and every crop is cut out automatically, with a thumbnail grid to review before you confirm. A bad crop can be re-snipped, and a skip link creates those questions without pictures if you want text only.",
    },
    {
      type: "p",
      text: "For anything the importer missed, the editor has a manual snipper: open the PDF, page through it, drag a box, and attach the crop to the question, to its passage, or to a single answer option. Figure-based clusters are stored one question at a time — the shared passage and its figure are repeated inside each question, because there is no shared-passage object to link questions to. Clumsy to edit, invisible to the student.",
    },
    {
      type: "h2",
      text: "Marking: Take the Numbers From the Bulletin",
    },
    {
      type: "p",
      text: "Marking is three numbers on a question — what a right answer earns, what a wrong one costs, what a blank costs — resolved from the exam default, through a section override, down to a question override. For 720 marks over 180 questions the right-answer value is four, set once as the exam default. Four preset chips cover the common schemes, and the one at plus four and minus one is labelled JEE / NEET style. Do not let a preset label decide your paper: read the penalty off the current bulletin and type what it says. [How to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test) covers the chain in full.",
    },
    {
      type: "p",
      text: "One marking state actually blocks publishing: marks on only part of the paper. The dialog names the sections with holes and refuses until the paper is all-marks or no-marks, because one attempt touching an unscored question flips the whole exam to ranking by correct count. Most other warnings — including the one saying your instructions no longer describe the paper — are advisory and let you publish anyway.",
    },
    {
      type: "h2",
      text: "What the Student Gets on the Day",
    },
    {
      type: "p",
      text: "One minute a question is brutal, and the screen should make a candidate feel it. The palette colours every question as attempted, marked for review, viewed, or untouched. A warning fires once when five minutes are left, and at zero the paper submits itself with whatever is saved. The countdown runs in a background worker, so a throttled tab hands nobody extra time — [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) covers the clock options in detail.",
    },
    {
      type: "p",
      text: "If a tab dies, returning within five minutes resumes that sitting at the question they left, on the clock that kept running; longer than that and the old sitting is filed as a completed attempt with the answers it had. Preview the paper yourself first — a creator preview is fully browsable and records nothing: no attempt, no marks, no analytics row.",
    },
    {
      type: "h2",
      text: "What This Will Not Do for Your NEET Mock",
    },
    {
      type: "p",
      text: "There is no proctoring of any kind — no webcam, no lockdown browser, no tab-switch detection — and no shuffling or cap on attempts. A published paper is public: anyone with the link can sit it, and there is no paid, private or batch-only delivery. Results do not export to CSV or Excel, there are no per-student report cards and no certificates, and nothing emails or messages your students that a test is live, though account mail for signup and password reset does go out. No Excel or Word import, no LMS or Google Classroom, no white-labelling, no mobile app. Better to know now than after building 180 questions.",
    },
    {
      type: "h2",
      text: "The Pre-Publish Checklist",
    },
    {
      type: "ul",
      items: [
        "Section question counts add up to 180, and the instructions page reads 180 questions and 720 marks.",
        "Section switching is on, the total time says 180, and no Sectional Timing column appears.",
        "Every section has marks - a partly marked paper is blocked - and the penalty matches the bulletin.",
        "Every imported placeholder is filled in or deleted; none is left as a manual-entry stub.",
        "Figures are attached wherever a question needs one, checked at phone width as well as on a laptop.",
        "The instructions state the scheme and the clock in plain words, in every language you publish.",
        "You have previewed the paper and sat a few questions from each subject.",
      ],
    },
    {
      type: "h2",
      text: "After the First Batch Sits It",
    },
    {
      type: "p",
      text: "Section-wise performance is where a sectioned NEET mock pays for itself: one accuracy figure per subject part, across the batch, with nobody tallying anything. Per-question analytics give accuracy and average time over everyone who attempted that question, plus the wrong option picked most often — the most useful line in the report, because it names the misconception rather than the mark. No student is named anywhere in that report except on the top-three leaderboard.",
    },
    {
      type: "p",
      text: "For the next mock, duplicate this one rather than rebuilding it. A duplicate carries the marking scheme, the timing groups and the language links across, though it is best-effort and fail-soft, so open the copy and check it before swapping the questions. If the batch is weak in one chapter, a 180-question mock is the wrong instrument — [how to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online) is the shorter diagnostic that fits between mocks. [Everything a creator can build here](/for-creators) is free and needs no card.",
    },
  ],
  faqs: [
    {
      question: "How do I create a NEET mock test online?",
      answer:
        "Create the exam, add one section per subject part named exactly as you want it, import the questions as JSON rather than typing them, turn on section switching so the whole paper runs on one 180-minute clock, then set the marking as an exam default and check it against the current information bulletin. NEET UG is 180 compulsory questions for 720 marks in 180 minutes, so every setting has to agree with four marks a question and one minute a question.",
    },
    {
      question: "How do I add 180 questions without typing them all?",
      answer:
        "Run MockSetu's published extraction prompt over your question paper PDF in whatever AI you already use, then upload the JSON it returns. Create and name the sections in the exam first, because the importer matches sections by exact name and skips the ones it cannot match. Options are numbered from zero, so check the answer indices before uploading. If the file exceeds the 10 MB cap, emit one subject at a time and upload the files in turn - the parser commits only the sections it finds and leaves the rest of the exam alone.",
    },
    {
      question: "Should a NEET mock have one clock or separate section timers?",
      answer:
        "One clock for the whole paper. NEET UG is a single 180-minute sitting, so turn section switching on: the student gets a tab per section and can move between subjects in any order until they submit or time expires. Separate section clocks would lock a candidate out of a subject they have not finished, which removes the time-allocation decision the real paper is testing. With switching on, the instructions page stops showing a sectional timing column, because there is none.",
    },
    {
      question: "Do diagrams survive when I import a NEET paper from a PDF?",
      answer:
        "Yes. The picture is not inside the JSON file - instead each figure is recorded as a page number and a bounding box on that page. When you upload, the dialog asks for the source PDF, crops every figure automatically and shows you a thumbnail grid to approve before anything is committed. You can re-crop any one that lands badly, skip image extraction entirely if you only want text, or snip a figure by hand later from the editor and attach it to the question, its passage, or a single answer option.",
    },
    {
      question: "What negative marking should I set on a NEET mock test?",
      answer:
        "Take it from the current NEET information bulletin and type exactly what it says. The marks panel offers a preset at plus four and minus one labelled JEE / NEET style, but a preset label is not a source - the scheme is whatever this year's bulletin specifies, and mirroring it matters more than making the paper feel strict. Set it once as the exam default so all 180 questions inherit it, and remember that publishing is blocked outright if marks are configured on only part of the paper.",
    },
    {
      question: "Can I stop students cheating on an online NEET mock?",
      answer:
        "No. There is no proctoring of any kind here - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or attempt limits. Published papers are public, so anyone with the link can sit one. Treat an online mock as practice under honest conditions and use the analytics to find weak chapters, not to police anyone. If you need invigilation, run the paper in a room with the students in front of you.",
    },
  ],
};

export default post;
