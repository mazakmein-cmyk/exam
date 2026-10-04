import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-ssc-mts-mock-test-online",
  title: "How to Create an SSC MTS Mock Test Online: Session I and Session II",
  metaTitle: "Create an SSC MTS Mock Test Online: Both Sessions | MockSetu",
  metaDescription:
    "Build an SSC MTS mock as two sections: 45 minutes each, no penalty in Session I, minus one in Session II, one bilingual paper, and the gate that blocks publishing.",
  keywords:
    "ssc mts mock test create, ssc mts mock test online, create ssc mts practice test, session i session ii mock, sectional timing online test, no negative marking section, bilingual ssc mock test, ssc mts paper setter",
  excerpt:
    "One paper, two sessions, two different marking rules. Here is how to build an SSC MTS mock so Session I stays free to guess in and Session II still costs a mark.",
  publishedAt: "2026-10-23",
  updatedAt: "2026-10-23",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. Never add "SSC MTS" here -
    // that tag wins the match and sends a paper setter to the student pillar.
    "For Creators",
    "Exam Creation",
    "SSC",
    "sectional timing",
    "marking scheme",
    "mock test series",
  ],
  hero: {
    eyebrow: "Exam Creation",
    h1: "How to Create an SSC MTS Mock Test Online: Session I and Session II",
    lede: "Two sections, two clocks, two marking rules, one exam. The asymmetry between the sessions is the entire paper, and a mock that flattens it drills the wrong instinct.",
  },
  content: [
    {
      type: "p",
      text: "Build it as two sections inside one exam, not as two exams. Section one is Session I on a 45-minute clock with the wrong-answer value at zero. Section two is Session II on its own 45-minute clock, deducting one mark for a wrong answer. The paper runs 90 questions for 270 marks, which divides to three marks a question, and because marks resolve per question — the question's own rule, then its section's, then the exam default — one exam can hold a qualifying session where guessing is free and a merit session where it is not.",
    },
    {
      type: "p",
      text: "That asymmetry is the only reason this paper is hard to reproduce. Everything below is the build. For the student side of it — what to practise, which papers to sit — point candidates at the [SSC MTS mock test page](/ssc-mts) instead.",
    },
    {
      type: "h2",
      text: "What the Bulletin Decides and What You Decide",
    },
    {
      type: "p",
      text: "The stable shape is short: 90 questions, 270 marks, two sessions of 45 minutes each, Session I qualifying only with no negative marking, Session II counting towards merit with one mark off for a wrong answer. Repeat that and stop there. Which subjects sit in which session, how many questions each carries, whether a candidate may return to Session I after leaving it, what the qualifying bar is that year — any of it can change between cycles, and all of it belongs to the current official notice.",
    },
    {
      type: "p",
      text: "A mock built from memory drills a shape the real paper may no longer have, and the student cannot find that out until the day. And the two-session structure is specific to SSC MTS — never carry it across to another staff-selection paper because the names look alike.",
    },
    {
      type: "h2",
      text: "Build It as Two Sections, Each With Its Own Clock",
    },
    {
      type: "p",
      text: "A section carries its own time in minutes, and the default navigation mode treats the paper as a sequence: sections are sat in order, a submitted section stays closed, and unused time never carries into the next one. That is what this paper needs, and it is what you get without changing anything. The alternative setting — whole-paper switching — puts the whole exam on one clock and lets a candidate roam, turning 45 and 45 into 90 undifferentiated minutes.",
    },
    {
      type: "p",
      text: "The runner backs that up. The countdown runs in a background worker, so a backgrounded tab keeps losing time honestly; a dialog fires once when five minutes remain; at zero the section submits itself with no prompt. A tab that closes mid-section is not a disaster for a signed-in candidate. Reopened on the same device within about five minutes, the sitting resumes on the question it last touched, with the clock where it had run down to — it never paused for the absence. Stay away longer than that and the old sitting is sealed, filed with the answers it already had, and the next start is a fresh one. A candidate who sat without signing in has no attempt record to come back to.",
    },
    {
      type: "ul",
      items: [
        "Create the exam, then two sections in order, named Session I and Session II.",
        "Give each section 45 minutes.",
        "Leave navigation locked. The only alternative puts the whole paper on one clock, so nothing here gives you 45 and 45 and movement between the two.",
        "Put each question into the session it belongs to — the section is the clock it runs on.",
        "Preview the paper yourself first. A creator preview is fully browsable and records nothing: no attempt, no responses, no analytics.",
      ],
    },
    {
      type: "h2",
      text: "The Marking Asymmetry Is the Whole Paper",
    },
    {
      type: "p",
      text: "Marks resolve down a chain: a question uses its own rule if it has one, otherwise its section's, otherwise the exam default. Build downwards and you only ever write the exception. Set the exam default to the Session II scheme — three marks right, one off for wrong, nothing for a blank. Then override the Session I section alone, keeping three marks right and setting the wrong-answer value to zero. Session II needs no override, because the default already is Session II.",
    },
    {
      type: "p",
      text: "Order matters more than the numbers. A question given its own override outranks the exam default forever after, so override a few questions early, change the default later, and those questions will not follow. The preset row at the top of the marks panel sets all three numbers in one tap, but none of the four presets is a three-mark question, so type this paper's numbers yourself.",
    },
    {
      type: "quote",
      text: "A mock that charges a penalty in Session I is not a stricter mock. It is a different exam — and it teaches a candidate to leave marks on the table in the one session where a guess is free.",
    },
    {
      type: "h2",
      text: "The Gate That Stops a Half-Marked Paper",
    },
    {
      type: "p",
      text: "Publishing is blocked outright when marks are set on only part of a paper. Either every gradeable question is covered by some rule or none is; the dialog names each section with holes and how many questions are uncovered. The failure mode on a two-session build is predictable: skip the exam default, override Session II only, and Session I sits unscored until the gate catches it. Setting the exam default first makes that impossible, because every question then inherits something.",
    },
    {
      type: "p",
      text: "A paper with no marks anywhere is a different case: allowed, warned about rather than blocked, and ranked by correct count. Neither state is what you want here. The full mechanics of per-question and per-section schemes are in [how to add negative marking to an online test](/blog/how-to-add-negative-marking-to-an-online-test).",
    },
    {
      type: "h2",
      text: "When a Session Holds More Than One Subject",
    },
    {
      type: "p",
      text: "If the notice splits a session across subjects and you want each subject named separately while the session's minutes stay one pool, that is a timing group. Group two or more adjacent sections and they share a clock: free movement between members, one countdown, and a pool equal to the figure you set on the group, or the sum of the members' minutes if you set none. Outside a group the locked rules still apply.",
    },
    {
      type: "p",
      text: "Two rules will bite you. A group needs at least two sections: drop it to one member and the group dissolves, and that section returns to its own clock. And a pool pays out once — if a group's sections are not adjacent, only the first run of two or more carries the pool and the stragglers fall back to per-section clocks. Keep each session's sections next to each other, in order. If the editor says timing groups need a migration, the feature is not live on your database and each subject needs its own clock.",
    },
    {
      type: "h2",
      text: "Hindi and English Without Building the Paper Twice",
    },
    {
      type: "p",
      text: "A bilingual mock is one exam, not two. Each section in the second language is linked to its counterpart in the primary language, and the scoring configuration is stored on the primary-language rows only — secondary rows resolve their scheme through that link. So the zero penalty you set once on Session I governs both versions, with no second marking panel to drift out of sync. The instructions page renders its paper table in whichever language the candidate picked, headings included.",
    },
    {
      type: "p",
      text: "Publishing checks the second language against the first before letting it go live: same section count, same question count per section, every question linked back, no empty text, matching option counts and answer types. The workflow is in [how to create a bilingual Hindi and English online test](/blog/how-to-create-a-bilingual-hindi-english-online-test).",
    },
    {
      type: "h2",
      text: "Getting 90 Questions In Without Typing Them",
    },
    {
      type: "p",
      text: "The route available to everyone is JSON: run the published extraction prompt from the [JSON upload guide](/json-upload-guide) over your PDF in whatever AI tool you already use, then upload the result. Section names in the file must match the section names in your exam, so create both sessions first and spell them the same way in the JSON.",
    },
    {
      type: "p",
      text: "Know the edges first. Numeric, TITA and match-the-column questions arrive as placeholders at the right question number with sentinel options and a warning each — open those in the editor and fill the real options before publishing. Figures do survive: the image is not in the JSON, but the extraction records each figure's page and bounding box and the upload crops them from your source PDF for approval. Server-side PDF import exists but is off by default, switched on per creator on request. There is no Excel or Word import, and the AI only extracts from a paper you supply — it will not invent questions from a syllabus.",
    },
    {
      type: "p",
      text: "If you are reproducing an actual past paper rather than writing a fresh mock, [how to create a previous year paper mock test](/blog/how-to-create-a-previous-year-paper-mock-test) covers that, including the Mock or Previous Year label — a per-creator grant, off unless you ask for it and invisible in the editor until it is given.",
    },
    {
      type: "h2",
      text: "Before You Share the Link",
    },
    {
      type: "ul",
      items: [
        "Open one question in each session and confirm which rule it says it inherited, then check that every question carrying its own override was meant to have one.",
        "Read the paper table on the instructions page: section names, question counts, maximum marks, sectional timing. Those come from the questions, so a wrong count is a wrong paper.",
        "Write the marking rule into the instructions in words, once per session, in every language. The drift notice checks timing and section and question counts — it only warns, never blocks, and never looks at marks.",
        "If you built this by duplicating another paper, open the copy. A duplicate does carry the marking scheme, timing groups and language links, but it is best-effort, so verify.",
        "Know what publishing means. A published paper is public, anyone with the link may attempt it, and there is no proctoring at all — no webcam, no lockdown browser, no tab-switch detection, no shuffling, no attempt cap.",
      ],
    },
    {
      type: "h2",
      text: "What You See After the Batch Has Sat It",
    },
    {
      type: "p",
      text: "Section-wise performance gives average accuracy per section, with both language versions counted as one row rather than split in two. Session I and Session II therefore read separately, which is the payoff of building them as two sections: a qualifying session's accuracy is a different question from a merit session's score, and one combined percentage answers neither.",
    },
    {
      type: "p",
      text: "Be clear about what is not there. There is no qualifying-cutoff feature — the report hands you a total and section-level accuracy, and holding a candidate against a bar is work you do yourself. Per-question figures average over everyone who attempted that question, not everyone who sat the paper. There is no CSV or Excel export, no per-student report card, no certificates, and no notification to students when a test goes up. [Everything a creator can build](/for-creators) — sections with their own clocks, pooled timing groups, bilingual papers, a listing in the public library — is free behind one account.",
    },
  ],
  faqs: [
    {
      question: "How do I create an SSC MTS mock test online?",
      answer:
        "Create one exam with two sections, Session I and Session II, 45 minutes each, and keep navigation locked so they are sat in order with no carry-over. Set the exam default marking to three marks for a right answer and one mark off for a wrong one, then override the Session I section alone to a zero penalty. Load the questions, check the paper table on the instructions page, preview it yourself, and publish. The shape to reproduce is 90 questions for 270 marks across the two sessions — everything beyond that, including the subject split, should come from the current official notice.",
    },
    {
      question: "Can one mock test have negative marking in Session II but not Session I?",
      answer:
        "Yes. Marks resolve per question — the question's own rule, then its section's, then the exam default — so two sections of one paper can carry different schemes. Set the exam default to the Session II rule and override only Session I to a zero wrong-answer value. Leaving Session II to inherit the default is deliberate: it is one fewer rule to maintain, and a question added later picks it up automatically.",
    },
    {
      question: "Why is my SSC MTS mock refusing to publish?",
      answer:
        "On a two-session paper, check marks coverage first. Publishing is blocked when some gradeable questions carry a marking rule and others carry none, and the dialog names the section with the gap and how many questions are uncovered. That state arises when a section override is set on Session II without an exam default ever being set, leaving Session I covered by nothing. Set the exam default first, then override Session I, and the state cannot occur.",
    },
    {
      question: "Should each session be one section or several?",
      answer:
        "One section per session is the simplest build and it is enough. If the notice splits a session across subjects and you want each subject named separately while the session's minutes stay a single pool, put those sections into a timing group: two or more adjacent sections then share one clock with free movement between them. A group needs at least two members, and the sections must be adjacent in the paper, or only the first run of two or more gets the pool.",
    },
    {
      question: "Does a mock test need to recreate the qualifying rule of Session I?",
      answer:
        "Recreate the marking, not the verdict. There is no qualifying cutoff feature in the product, so you cannot make Session I gate Session II the way the real process does. What you can and must reproduce is the risk: no penalty in Session I means an unsure candidate should attempt everything there, and a mock that quietly charges a penalty teaches the opposite habit. Read Session I's accuracy off the section-wise report afterwards and judge the qualifying question yourself.",
    },
  ],
};

export default post;
