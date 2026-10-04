import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-create-an-online-test-series",
  title: "How to Create an Online Test Series: From One Paper to a Full Programme",
  metaTitle: "How to Create an Online Test Series Step by Step | MockSetu",
  metaDescription:
    "Plan an online test series: how many papers, the diagnostic-to-taper shape, a calendar built backwards from the notification, and naming that students follow.",
  keywords:
    "how to create test series, how to create an online test series, online test series for students, test series planning for coaching, mock test series schedule, how many papers in a test series, naming mock tests, duplicate test series for new batch",
  excerpt:
    "One paper is a weekend's work. A series is a promise you have to keep for six months. Here is the shape, the realistic paper count, the backwards calendar, and the naming that stops students guessing.",
  publishedAt: "2026-09-17",
  updatedAt: "2026-09-17",
  readingMinutes: 12,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx - without it this article funnels a creator to
    // the student library instead of the creator page.
    "For Creators",
    "Exam Creation",
    "test series",
    "coaching batches",
    "exam calendar",
    "online exam platform",
  ],
  hero: {
    eyebrow: "Creator Playbook",
    h1: "How to Create an Online Test Series: From One Paper to a Full Programme",
    lede: "A single mock is a weekend's work. A series is a cadence you have to hold for six months. This is how to decide the shape, the count, and the calendar before you write question one.",
  },
  content: [
    {
      type: "p",
      text: "To create an online test series, settle the shape before you write a single question: a diagnostic paper at the start, chapter-wise tests while the syllabus is still being taught, sectional tests once a subject closes, full-length papers through the last third, and a short taper in the final ten days. Then fix a paper count you can deliver, build the calendar backwards from the exam date, and name every paper so a student knows what it is without opening it. The platform work is the small part.",
    },
    {
      type: "p",
      text: "There are two ways a first-time series fails, neither of them a software problem: the creator builds twenty-five papers before the batch starts and has nothing left to adjust when the class turns out weak somewhere unexpected, or announces a weekly test, publishes three, and goes quiet.",
    },
    {
      type: "h2",
      text: "The Five Stages of a Series, and What Each Stage Does",
    },
    {
      type: "p",
      text: "A series is not a pile of papers with a shared name. Every paper in it should have one job: calibration (where this student stands against the paper), coverage (the chapters they keep postponing), or conditioning (holding attention for the duration the real exam demands - 180 unbroken minutes for JEE Main Paper 1 or NEET UG, two 45-minute sessions for SSC MTS). Arrange them into five stages, whose proportions shift between a foundation batch and a crash batch but whose order does not change.",
    },
    {
      type: "ul",
      items: [
        "Diagnostic (1 paper, week one). Short, across the whole syllabus, at roughly real difficulty: a baseline for the student, a first read on the batch for you. Students will score badly - say so in the instructions, or they will read a low score as a verdict on themselves and quietly leave.",
        "Chapter-wise (the bulk of the early months). One test per chapter or pair of chapters, a few days after you teach it. 15 to 30 questions, 20 to 40 minutes - small enough that a tired student still attempts it, which is what builds the habit. Mechanics in the guide to [setting up a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online).",
        "Sectional (once a full subject is taught). One subject at real length and real marking. The first time a student sits a full quantitative section under a real clock, pacing collapses - better in September than in the hall.",
        "Full-length (the last third of the cycle). Complete paper, complete duration, complete marking, same time of day as the real exam wherever possible. The only scores worth treating as a predictor.",
        "Taper (the final seven to ten days). Two short papers, no more, with no new question types and no surprise difficulty. The taper keeps the hand warm; it is not for closing gaps.",
      ],
    },
    {
      type: "p",
      text: "The diagnostic is the stage that gets cut first and should not be: one paper, and the only read you will get on the batch before your own teaching changes them. Full-length is the stage that gets over-built - ten in six weeks means a student writes more often than weekly and analyses none of them.",
    },
    {
      type: "h2",
      text: "How Many Papers Is Realistic",
    },
    {
      type: "p",
      text: "Count in hours, not in ambition - and take the hours from your own first paper of each kind rather than from a guess, because the three jobs are nowhere near each other. A short chapter test with a verified key is the cheapest of them. A full-length paper assembled from a previous-year source is mostly transcription. A full-length written fresh is the one that sinks a calendar, because every distractor has to be plausible. Then add the part nobody budgets for: checking the key, fixing the disputed questions, re-publishing.",
    },
    {
      type: "p",
      text: "For one person working alongside teaching, a sustainable rate is one paper a week, with the short chapter tests clustered two to a week early on. Over a six-month cycle that is 26 to 30 papers: one diagnostic, 14 to 16 chapter-wise, 4 to 5 sectional, 5 to 6 full-length, 2 in the taper. A two-person team can carry more. What breaks a series is not a low count but a long gap, and a paper that arrives on Tuesday has already missed the Sunday slot it was built for.",
    },
    {
      type: "quote",
      text: "Twelve papers that all land on time beat thirty that stop in week nine.",
    },
    {
      type: "h2",
      text: "Build the Calendar Backwards from the Notification",
    },
    {
      type: "p",
      text: "Forward planning from today produces a series that runs out of runway in the last month, exactly when students need it most. Place the stages in reverse instead, and cut whatever does not fit from the middle, never from the end.",
    },
    {
      type: "ul",
      items: [
        "Fix date zero: the first day of the exam window, or last cycle's date minus two weeks if the notification is still pending.",
        "Block the last 7 to 10 days for the taper. Nothing new goes in there later, however tempting.",
        "Place the full-length papers at a fixed weekly slot across the preceding 5 to 6 weeks - same day, same start time - and one sectional paper at the end of each subject's teaching block.",
        "Fill the remaining weeks with chapter-wise tests in teaching order, two a week while you have capacity. If they do not fit, merge adjacent chapters rather than pushing the full-length block later.",
        "Publish the whole calendar to the batch on day one, with dates. It is the only thing that makes a missed paper visible - to them and to you.",
      ],
    },
    {
      type: "p",
      text: "Match the paper to the real pattern, because a sectional test at the wrong duration teaches the wrong pacing. A batch preparing for the exam covered on the [SSC MTS preparation hub](/ssc-mts) needs two 45-minute sessions, not one 90-minute paper: Session I is qualifying only and carries no negative marking, while Session II also runs 45 minutes, counts for merit, and penalises a wrong answer by one mark. Practise them merged and a student will guess through Session II at the rate that was safe in Session I. Other exams are shaped quite differently, so read the current official bulletin before you fix any duration - the [mock test format reference](/blog/mock-test-format-for-competitive-exams-reference) covers what to copy across.",
    },
    {
      type: "h2",
      text: "Name the Papers So a Student Can Tell Them Apart",
    },
    {
      type: "p",
      text: "Naming is the cheapest quality improvement in a series, and the one that is easiest to put off until the papers have already piled up. A student looking at twenty papers called \"Mock Test 7\", \"Mock Test 8\" and \"Full Test 2\" cannot tell which to attempt tonight, which they already did, or which covers the chapter they just finished. They pick wrong, score badly on untaught material, and conclude the series is too hard.",
    },
    {
      type: "p",
      text: "A name that works carries four things in a fixed order: batch, stage, number, scope. \"Foundation 2027 - Chapter 04 - Thermodynamics\" says everything in one line; \"Foundation 2027 - Full Length 03\" says this is the third of the serious ones. Keep that order identical across every paper.",
    },
    {
      type: "ul",
      items: [
        "Put the batch or year first. Once you duplicate the series, the year is the only thing separating a 2027 paper from the 2026 original it came from.",
        "Use a two-digit number (01, 02 ... 12). It keeps every title the same width, and anywhere the names get alphabetised - a folder, a spreadsheet, a message pasted into the group - paper 10 will not land ahead of paper 2.",
        "Name the stage in words a student already uses: Diagnostic, Chapter, Sectional, Full Length, Final. Name the scope by topic, not syllabus code - \"Modern Physics\" beats \"Unit 7.3\".",
        "Put the duration and the marking in the description, not the title. The title is for finding the paper; the description is for deciding whether to sit it now.",
        "Never reuse a number. Retire a withdrawn paper's number with it - two papers called 06 will cost you an evening of confused messages.",
      ],
    },
    {
      type: "h2",
      text: "Reuse, Duplicate, and Stop Rewriting the Same Paper",
    },
    {
      type: "p",
      text: "The second cycle should cost a fraction of the first. Duplicating an exam starts the 2027 series as a copy of the 2026 one rather than a blank form: sections, per-section minutes, pooled timing groups, instructions, languages, every question and the marking scheme all come across. The marks are the one part worth checking by hand, because they live in their own tables and are copied on a best-effort basis - if that step fails the copy says nothing and simply arrives with the defaults. The routine: duplicate, rename, fix the dated general-awareness questions, open the marking panel to confirm it matches the original, publish.",
    },
    {
      type: "p",
      text: "Previous-year papers are the other large saving: faster to build because the questions and key already exist, and more trusted than anything you write yourself. Do not plan the series around labelling them, though. The Mock / Previous Year field that tells a student which is which is switched on per creator on request, and a creator without it does not see the field at all - every paper is simply a mock. The build steps are in the guide to [turning a previous-year paper into a mock test](/blog/how-to-create-a-previous-year-paper-mock-test).",
    },
    {
      type: "p",
      text: "A duplicate also arrives unpublished, which is what makes the duplicate-and-republish routine safe to run in daylight: the renaming, the dated questions and the marks you have to set again all happen before anyone can find the paper.",
    },
    {
      type: "h2",
      text: "Setting the Series Up So Every Paper Is Consistent",
    },
    {
      type: "p",
      text: "A timer that behaves differently in paper 4 than in paper 11 teaches nothing reliable about pacing. Settle the structural settings at the diagnostic, then stop touching them.",
    },
    {
      type: "ul",
      items: [
        "Clocks and switching: per-section minutes, or a timing group where the real exam pools two sections under one timer. Lock section switching if the real exam locks it, and never change that mid-series.",
        "Marking: keep marks for correct, wrong and unattempted identical across the series unless the real pattern differs by section, and decide once whether multi-correct questions earn part marks and whether the penalty is charged once or per wrong option.",
        "Instructions: write them once, reuse them, and say in them that the paper auto-submits when time expires. Let MockSetu generate the line that states the paper's shape, because that is the one line it can police - it warns you when the generated shape no longer matches the paper, which catches a duplicate still claiming the old question count. A sentence you wrote yourself it cannot check.",
        "Questions and languages: run MockSetu's extraction prompt from the [JSON upload guide](/json-upload-guide) in whatever AI you already use, then upload the JSON - numeric, TITA and match-the-column questions still need entering by hand. A bilingual batch wants English and Hindi in one paper, not two listings.",
      ],
    },
    {
      type: "p",
      text: "If this is your first paper rather than your tenth, build one end to end first - the walkthrough for [creating a single online mock test](/blog/how-to-create-an-online-mock-test) will change how you scope the series.",
    },
    {
      type: "h2",
      text: "What a Public Test Series Cannot Do, Said Plainly",
    },
    {
      type: "p",
      text: "Plan around these rather than discovering them in week three. A published paper is public: anyone who finds it in the library can attempt it, and the share link is a convenience, not a gate. There is no private delivery to one batch, no paywall, no access code. Nor is an unpublished paper a quieter version of that: it is visible to nobody but you, so there is no half-way state in which your batch sits a paper the public cannot. Your only real control over exposure is timing, so publish on the morning of the slot. There is also no cap on attempts and no question shuffling.",
    },
    {
      type: "p",
      text: "Creator analytics are aggregated: section-wise accuracy, average time per question, and where the class as a whole struggled - enough to decide what to re-teach on Monday. The one place a person appears is a top-three board, and it carries the handle a student chose rather than their real name. Below that there is nothing per student: no report card, no CSV export, and no way to follow one student's curve across the series. There is no proctoring of any kind, no webcam, no lockdown browser and no tab-switch detection, so an unsupervised score is an honest-effort number. Nothing about a test is pushed to anyone either: the platform sends account email such as signup and password reset, but no reminders, results or schedules. You are the one who tells the batch.",
    },
    {
      type: "p",
      text: "None of that stops a series working; it changes what you promise. Promise coverage, cadence, a real interface and a class-level diagnosis after every paper - not a secure ranked examination, because this is not one.",
    },
    {
      type: "h2",
      text: "A Four-Week Plan to Get the First Papers Live",
    },
    {
      type: "p",
      text: "You do not need the whole series built before the first paper goes out - only the calendar fixed and four weeks of papers in hand.",
    },
    {
      type: "ul",
      items: [
        "Week one: write the backwards calendar on one page, cut the paper count to what you can sustain, and publish it to the batch.",
        "Week two: build the diagnostic. Set sections, timing, marking and instructions exactly as the whole series will use them, and preview it yourself end to end before anyone sits it.",
        "Week three: run the diagnostic. Read the aggregated section accuracy and time per question, then reorder the chapter-wise stage so the two weakest areas come early instead of in month four.",
        "Week four: duplicate the diagnostic to inherit its sections, timing, instructions and marking scheme. A duplicate arrives carrying every question, not as an empty shell, so delete those and import chapter test 01's. The marks are copied on a best-effort basis and the copy stays quiet if that step fails, so open the marking panel on the copy once before you publish. Do that twice and two chapter tests stand named against their dates.",
        "Ongoing: within 24 hours of the date a paper was set for, post the class-level weak areas to the batch. The analysis is what students stay for; the paper is only what gets them there.",
      ],
    },
    {
      type: "p",
      text: "MockSetu is free with no card, and a published mock can be attempted as a guest in a phone browser with no account - which takes the sign-up step out from between a student and their first paper. The [creator overview page](/for-creators) lays out what the editor does, and the [public mock test library](/marketplace) shows how other creators have named and sequenced their series.",
    },
  ],
  faqs: [
    {
      question: "How many papers should an online test series have?",
      answer:
        "For one person working alone alongside teaching, one paper a week is sustainable, which over a six-month cycle is 26 to 30 papers: one diagnostic, 14 to 16 chapter-wise tests, 4 to 5 sectional papers, 5 to 6 full-length papers and 2 in the final taper. A two-person team can carry more. The total matters far less than whether each paper lands on the day you promised it.",
    },
    {
      question: "What order should the papers in a test series follow?",
      answer:
        "Diagnostic first, then chapter-wise tests while the syllabus is still being taught, then sectional papers as each subject closes, then full-length papers through the last third of the cycle, then a taper of two light papers in the final seven to ten days. Place them by working backwards from the exam date, so the full-length block never gets squeezed out of the weeks where it matters most.",
    },
    {
      question: "Do I have to rebuild the whole series for next year's batch?",
      answer:
        "No. On MockSetu you can duplicate an exam, so the new cycle starts as a copy with its sections, per-section timing, timing groups, instructions, languages and questions intact. One thing does not copy: the marking scheme. Marks for correct, wrong and unattempted are stored separately from the exam itself, so re-set them on every duplicate before you publish it. Put the batch year first in every paper name so a copied 2027 paper is never mistaken for the 2026 original.",
    },
    {
      question: "How should I name the papers in a test series?",
      answer:
        "Use a fixed four-part order: batch or year, stage, number, scope - for example \"Foundation 2027 - Chapter 04 - Thermodynamics\". Use two-digit numbers so the titles stay the same width and paper 10 never lands ahead of paper 2 in a folder or a spreadsheet, name the stage in words students already use, and keep duration and marking in the description rather than the title. Never reuse a number for a replacement paper.",
    },
    {
      question: "Can I restrict my test series to just my own batch?",
      answer:
        "No. A published paper is public - anyone who finds it in the library can attempt it, there is no paywall or access code, and no cap on attempts. The share link does not gate anything; it only saves your batch a search. Nor is there a half-way state: an unpublished paper is visible to you alone, so it cannot be handed to the batch at all. The only lever is when you publish, so publish on the morning of the slot and plan the series around coverage and cadence rather than exclusivity.",
    },
    {
      question: "What student data does a creator see from a test series?",
      answer:
        "Aggregated results, almost entirely: section-wise accuracy, average time per question, and where the class as a whole struggled. The single exception is a top-three board, which shows the handle a student chose rather than their real name. There is nothing per student below that - no report cards, no CSV export, and no way to track one student across the series. That is enough to decide what to re-teach after each paper, which is the main thing a series should drive, but it is not an individual scorecard.",
    },
  ],
};

export default post;
