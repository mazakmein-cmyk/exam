import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "online-test-day-checklist-for-teachers",
  title: "Online Test Day Checklist for Teachers",
  metaTitle: "Online Test Day Checklist for Teachers | MockSetu",
  metaDescription:
    "A three-phase runbook for the day of an online test: what to check the day before, what to send in the hour before, and what you can actually see while it runs.",
  keywords:
    "online exam checklist for teachers, online test day checklist, how to run an online test, online exam preparation teacher, test day runbook, online exam administration india, exam link share checklist",
  excerpt:
    "Three phases - the day before, the hour before, and while the clock runs. Every item checkable, and an honest list of what the screen will not tell you once students are in the paper.",
  publishedAt: "2026-10-29",
  updatedAt: "2026-10-29",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Operations",
    "online exam",
    "test administration",
    "exam day",
  ],
  hero: {
    eyebrow: "Operations",
    h1: "Online Test Day Checklist for Teachers",
    lede: "The day before you check the paper. The hour before you check the link. While it runs you watch a screen that shows less than most teachers expect - so here is the runbook, with the gaps marked.",
  },
  content: [
    {
      type: "p",
      text: "An online test day has three phases and each one has a different job. The day before, you check the paper: preview it end to end, spot-audit the answer key, and make the instructions agree with the paper table. The hour before, you check the delivery: the share link copied from the right place, opened once on a phone, with the window announced in words and a sign-in reminder attached. While it runs, you mostly wait - because there is no proctoring of any kind here and no live roster of who is sitting at this second.",
    },
    {
      type: "p",
      text: "This is the operational runbook, not the build guide. For setting the paper up in the first place, read [how to conduct an online exam for students](/blog/how-to-conduct-an-online-exam-for-students). For the words students read before the clock starts, use the [online exam instructions template](/blog/online-exam-instructions-template-for-students).",
    },
    {
      type: "h2",
      text: "The Day Before: Sit Your Own Paper End to End",
    },
    {
      type: "p",
      text: "Start with the check nothing else substitutes for: open your own paper the way a candidate does. The overflow menu on the dashboard card carries \"Sit it as a student\", which opens the exam's instructions page. Creator accounts never actually sit exams, so your own paper opens in preview - fully browsable, nothing persisted. No attempt row, no responses, no marks, no leaderboard entry, nothing in your analytics.",
    },
    {
      type: "p",
      text: "Work through these the day before. Each one is a thing you can tick or fail.",
    },
    {
      type: "ul",
      items: [
        "Preview the paper from the instructions page to the last question. Long papers hide their damage at the end, where nobody scrolls.",
        "Spot-audit the answer key. Open a handful of questions in every section and confirm the marked option is the one you meant. An attempt is scored when it is submitted, so a wrong key is cheap now and costly later - see [correcting an answer key after students have attempted](/blog/how-to-correct-an-answer-key-after-students-have-attempted).",
        "Read the paper table on the instructions page: one row per section with the question count, the maximum marks and - on a paper sat one section at a time - that section's clock, plus a total row once there is more than one section. The Maximum Marks column appears only once marks actually resolve somewhere on the paper, so a missing column is itself a finding.",
        "Read your general instructions against that table. If the prose claims a duration or a count the table contradicts, the table is what students will believe.",
        "Check the declaration still makes sense for your batch. It arrives un-ticked every time, and Start refuses - naming the reason - until it is ticked, a language is chosen on a bilingual paper, and the exam has at least one section.",
        "Publish, and read the publish dialog properly rather than clicking through it.",
      ],
    },
    {
      type: "h2",
      text: "What the Publish Dialog Blocks, and What It Only Whispers",
    },
    {
      type: "p",
      text: "One thing in that dialog genuinely stops you. If marks are set on part of the paper but not all of it, Publish stays disabled and the banner names the sections with holes. The reason is worth knowing: the ranking logic flips the whole exam to correct-count mode the moment a single attempt touches an unscored question, so your carefully built scheme quietly stops deciding ranks. It is all or nothing - cover every section, or remove marks everywhere.",
    },
    {
      type: "p",
      text: "An exam with no marking anywhere is allowed: a red banner says students will submit and see results without marks, but it is a consistent choice and it publishes. Separately, each language has its own toggle, and a language with validation issues cannot be switched on at all - missing question text, a question with no type or fewer than two options, a question with no correct answer marked, a section absent in that language, a question count that differs from the primary.",
    },
    {
      type: "p",
      text: "The instruction-drift notice is the one teachers misread. It warns; it does not block. It compares the written instructions against the paper's timing and its section and question counts, flags a mismatch, and offers to regenerate that language's exam instruction from the paper - which replaces your wording entirely, with an undo next to it - then lets you publish either way. Treat it as a message addressed to you, not a gate that will save you.",
    },
    {
      type: "p",
      text: "Know what publishing means. The paper goes into the public [mock test library](/marketplace) and anyone who finds it may attempt it. There is no paywall and no private delivery to one batch. Unpublishing takes it back out of the library. If a paper must not be seen by the wider internet, a public platform is the wrong container for it.",
    },
    {
      type: "h2",
      text: "The Hour Before: The Link, the Window, the Sign-In",
    },
    {
      type: "p",
      text: "Use the Share action on the exam card. It copies the candidate-facing instructions URL to your clipboard, and it refuses outright with a toast if the exam is not published yet - which is a useful accident to have in the hour before, rather than in the minute after. Do not copy the URL out of your address bar while editing: that is the editor address, and a student who opens it gets nowhere.",
    },
    {
      type: "p",
      text: "There is no scheduled open or close time on a mock paper. An exam carries no start or end timestamp: once published it is available, and it stays available until you unpublish it. The window is something you announce and hold people to, not something the software enforces.",
    },
    {
      type: "ul",
      items: [
        "Send the link from the Share action, and send it once, in one place, so there is a single message to point at later.",
        "Tell students to sign in before they open the link, and point them at the [student sign-in page](/student-auth) in the same message. A sitting by someone not signed in creates no attempt row; the finished paper is parked in that browser's own storage and replayed after they sign in, on that device, in that browser.",
        "State the window in words: the date, the start time, the latest time you will accept a start, and the duration.",
        "Open the link yourself on a phone, on mobile data rather than staffroom wifi. There is no app to install - the paper runs in the browser - but you want to have seen it render on a small screen before your batch does.",
        "Keep one device free with the link already open, so your answer to \"it is not loading\" is a fact rather than a guess.",
      ],
    },
    {
      type: "quote",
      text: "The platform enforces the clock. It does not enforce the window, the room, or the honesty - those are yours, and pretending otherwise is how test days go wrong.",
    },
    {
      type: "h2",
      text: "While It Runs: What You Can See and What You Cannot",
    },
    {
      type: "p",
      text: "There is no webcam proctoring, no AI invigilation, no lockdown browser and no tab-switch detection. Nothing fires when a second tab opens, because nothing is watching for one. There is also no question shuffling and no attempt limit. If integrity matters for this particular test, it has to come from how you design and supervise it - [reducing cheating without proctoring](/blog/how-to-reduce-cheating-in-online-tests-without-proctoring) covers the levers that do exist.",
    },
    {
      type: "p",
      text: "There is no live roster either. The analytics page is a page: it fetches when it loads, so seeing new submissions means reloading it. What it gives you afterwards is per-question statistics averaged across everyone who attempted that question, a trend of average accuracy by day, and a top-three leaderboard by username. Your own preview sittings never appear, and your own attempts are filtered out of the numbers.",
    },
    {
      type: "p",
      text: "If you want to watch a room answer, that is a different mode: a live session is presenter-driven, and you move the class question by question as responses arrive. [Running a live quiz on students' phones](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones) covers it. A very large sitting is still better run as a scheduled mock than as one live room.",
    },
    {
      type: "h2",
      text: "The Student Who Drops Mid-Paper",
    },
    {
      type: "p",
      text: "Have an answer ready for the student whose browser closes mid-paper. Three mechanics decide what happens, and none of them needs you to intervene. All three need the student signed in: an anonymous sitting creates no attempt row, so it gets no stored clock, no resume and no saving as it goes. That is the real reason to make signing in the first instruction you send.",
    },
    {
      type: "p",
      text: "First, the clock is stored server-side rather than in the tab. A refresh resumes the same deadline instead of minting a fresh full-length one, and the browser's own \"Leave site?\" confirmation fires on a reload or a tab close while the clock is running. That text cannot be customised, but the pause is the point.",
    },
    {
      type: "p",
      text: "Second, there is a five-minute return window. Come back inside five minutes and the sitting resumes on the question it last touched, with the clock having run the whole time. Stay away longer and that sitting is sealed - filed with its saved answers as a normal, ranked attempt - and the next start is a fresh one. The check is same-device: it relies on a heartbeat written in that browser, so with no heartbeat on record, from another device or cleared storage, the fallback is simply to resume.",
    },
    {
      type: "p",
      text: "Third, the clock ends the paper. A one-time warning appears with five minutes left, and at zero the paper submits itself. Answers are written as the student works, not held until the end, so a sealed or auto-submitted attempt still carries what was answered.",
    },
    {
      type: "ul",
      items: [
        "Reopen the same link in the same browser on the same device, immediately.",
        "Do not switch to another phone or laptop mid-paper - the return window cannot see across devices.",
        "If it has already been more than five minutes, the earlier sitting is filed and counts; starting again starts a new attempt.",
        "Extra time cannot be granted. There is no control on a mock paper that hands one student more minutes, so do not promise it.",
      ],
    },
    {
      type: "h2",
      text: "After the Last Submit",
    },
    {
      type: "p",
      text: "Open analytics from the exam card once the window has closed, rather than refreshing through it. Then be honest about the follow-up: there is no CSV or Excel export of results, no per-student report card, no certificates, and nothing emails, texts or messages your students about the test. The only mail the product sends is transactional account mail - signing up, resetting a password. The debrief is a session you run, using the per-question numbers to pick what is worth reopening in class.",
    },
    {
      type: "p",
      text: "If the same paper is going to a second batch, duplicate it rather than republishing the original. The copy carries the sections, the questions, the marking scheme, the timing groups and the language links, and it arrives as a draft with its own link and an empty leaderboard. The copy is best-effort, so open it once and check a section before you publish it.",
    },
    {
      type: "p",
      text: "None of this is complicated. It is the part nobody writes down, which is why it gets rediscovered on the morning of the test with a batch already waiting. [What a creator account can build](/for-creators) is free and takes no card, and every check above applies as much to your first published paper as to your most recent.",
    },
  ],
  faqs: [
    {
      question: "What should a teacher check before running an online test?",
      answer:
        "Work in three phases. The day before: preview the paper end to end as a student, spot-audit the answer key, read the paper table on the instructions page against your written instructions, and publish. The hour before: copy the link from the Share action, open it once on a phone, announce the window in words, and tell students to sign in before they start. While it runs: keep a device free with the link open, and reload analytics rather than expecting it to update itself.",
    },
    {
      question: "Can I see which students are currently taking my online test?",
      answer:
        "No. There is no live roster of who is sitting a scheduled mock test at a given moment. The analytics page fetches its data when it loads, so new submissions appear only when you reload it, and what it shows afterwards is per-question statistics across everyone who attempted, an accuracy trend by day, and a top-three leaderboard by username. If you want to watch a room answer in real time, that is a live session - a presenter-driven mode where you move the class question by question.",
    },
    {
      question: "What happens if a student's internet drops in the middle of an online test?",
      answer:
        "Answers are saved as the student works, and the clock is stored server-side, so reopening the same link in the same browser resumes the same deadline rather than granting a fresh one. There is a five-minute return window: come back inside it and the sitting resumes on the question last touched; stay away longer and that sitting is sealed and filed with whatever was saved, as a normal ranked attempt. The window is same-device, so switching phones mid-paper breaks it.",
    },
    {
      question: "Does the platform stop students cheating during an online test?",
      answer:
        "No, and it is better to plan around that. There is no webcam proctoring, no lockdown browser, no tab-switch detection, no question shuffling and no limit on attempts. Published papers are public, so anyone with the link may attempt them. Integrity on test day comes from supervision and from how the paper is designed, not from a setting.",
    },
    {
      question: "Can I schedule an online test to open and close at a set time?",
      answer:
        "Not on a mock paper. An exam has no start or end timestamp: once it is published it is available to anyone who has the link, and it stays available until you unpublish it. The test window is something you announce and hold students to, and unpublishing is how you take the paper back out of the public library. A live session is the exception - it can carry a scheduled start time so students land in a lobby with a countdown, and even then it begins on your own control screen rather than unattended.",
    },
  ],
};

export default post;
