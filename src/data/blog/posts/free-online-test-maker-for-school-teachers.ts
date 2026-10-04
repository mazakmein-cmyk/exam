import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "free-online-test-maker-for-school-teachers",
  title: "Free Online Test Maker for School Teachers: Set Up Your First Class Test",
  metaTitle: "Free Online Test Maker for School Teachers | MockSetu",
  metaDescription:
    "A free online test maker for school teachers, walked end to end: decide the pattern, create the exam, add questions three ways, set the clock, and share one link.",
  keywords:
    "free online test maker for teachers, online test maker for school teachers, create online test for students, free test maker for class test, make an online unit test, online exam creator for schools, free quiz and test tool for teachers, share online test link with students",
  excerpt:
    "A timed class test, online, on a link any phone can open, in about twenty minutes. Here is the whole sequence - what to decide first, how to add questions three ways, and what free actually costs you.",
  publishedAt: "2026-09-10",
  updatedAt: "2026-09-10",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx - without it this article funnels a teacher
    // to the student library instead of the creator page.
    "For Creators",
    "Exam Creation",
    "school teachers",
    "class test",
    "free tools for teachers",
    "online assessment",
  ],
  hero: {
    eyebrow: "First Test, Start Here",
    h1: "Free Online Test Maker for School Teachers: Set Up Your First Class Test",
    lede: "You do not need a budget, a training session, or an IT department to put a timed class test online. You need about twenty minutes and three decisions made in advance.",
  },
  content: [
    {
      type: "p",
      text: "A timed class test, online, on a link your students open on any phone - that is about twenty minutes of work the first time, and less after that, because the second test starts as a copy of the first. The scaffolding - naming the exam, adding a section, setting the clock and the marks, previewing and publishing - is roughly seven minutes of it; the rest is getting the questions in. MockSetu is a free online test maker for school teachers, free to build on and free to publish, no card. The sequence below is in order, so you can follow it with the tab open.",
    },
    {
      type: "p",
      text: "This is written for a school teacher doing it for the first time: a Class 9 science unit test, a Class 11 maths chapter test, a revision check before the half-yearly. One teacher, one class, a test that has to work on whatever phone the student has at home. The twenty minutes assumes the questions already exist somewhere - a notebook, a worksheet, last year's paper; writing twenty fresh ones is a separate job that takes as long as it takes.",
    },
    {
      type: "h2",
      text: "Decide Three Things Before You Open Any Tool",
    },
    {
      type: "p",
      text: "The software is rarely what stops a first test. What stops it is sitting down to build a paper before deciding what the paper is, then making those decisions inside a form with the cursor blinking at you. Settle these three with a pen first.",
    },
    {
      type: "ul",
      items: [
        "How many questions, and of what kind. Twenty single-correct MCQs is a sane first test. Numeric answers, multi-correct questions and reading-passage questions are all supported, but note them now - they change how you enter the questions.",
        "How long. Minutes per question, multiplied. Roughly forty-five seconds for a straightforward recall MCQ and a minute and a half where there is working to do, adjusted against what your class actually needs. A twenty-minute test at home gets attempted; a ninety-minute one does not.",
        "Whether a wrong answer costs marks. For a school unit test the honest answer is usually no - negative marking exists to punish guessing in a ranking exam, and a student who leaves ten questions blank out of fear tells you nothing. If you do want a penalty, fix the numbers now: correct, wrong and unattempted are three separate settings you will be asked for anyway.",
      ],
    },
    {
      type: "h2",
      text: "Minutes One and Two: Create the Exam",
    },
    {
      type: "p",
      text: "Creating the exam is a short form: a name, a category, a description. Write the name the way a student will read it in a list - \"Class 9 Science - Unit 3 Matter in Our Surroundings\" beats \"Test 1\". Two instruction fields follow, general and exam-specific, each with a one-click fill if you would rather edit than write - boilerplate on the first, a draft read off your own paper on the second. Then the language: English, Hindi or both, and on a bilingual paper each student picks one on the way in and sits the whole thing in it.",
    },
    {
      type: "p",
      text: "If your account has the paper type field - granted on request rather than shown to everyone - you also pick Mock or Previous Year. Anything you wrote yourself is a Mock, which is what an untagged paper counts as anyway; Previous Year is for a real past paper you are reproducing, so students can filter the library for the genuine article. It is a label, not a permission, and changes nothing about who can open the test.",
    },
    {
      type: "h2",
      text: "Minute Three: Add a Section and Set the Clock",
    },
    {
      type: "p",
      text: "Every exam needs at least one section, and a section carries its own minutes. On a single-subject unit test, one section is the whole test and its clock is the whole clock. On a three-part paper - objective, numerical, assertion-reason - three sections with their own minutes stop a class burning forty minutes on part one and reaching part three with four left.",
    },
    {
      type: "p",
      text: "One switch at the top of the sections list decides what all those minutes mean, so understand it before you fill them in. Leave section switching off, the default, and each section runs on its own clock: the student sits section one, submits it, and it closes for good. Turn it on and the paper has a single clock instead - the per-section minutes go quiet, kept rather than deleted - and the student moves between sections in any order, revisiting any answer until they submit.",
    },
    {
      type: "p",
      text: "On a one-section unit test the switch changes nothing. On a multi-part paper, pick on intent: on if the class should budget one pot of time across the paper, off if part one closing is the point. There is a middle setting - with switching off, two or more sections can share one pooled clock as a timing group while the rest keep their own. Either way the paper auto-submits when time runs out, so nothing is lost if a student forgets to press the button; [how to create a timed online test with auto-submit](/blog/how-to-create-a-timed-online-test-with-auto-submit) goes deeper.",
    },
    {
      type: "h2",
      text: "Minutes Four to Sixteen: Put the Questions In, Three Ways",
    },
    {
      type: "p",
      text: "This is the part that actually takes time, and the part where teachers give up. There are three routes in, and picking the wrong one is what turns twenty minutes into an evening.",
    },
    {
      type: "ul",
      items: [
        "Type them. A rich text editor with LaTeX for maths, so a fraction renders as a fraction. Attach an image to a question, use images as the options, set a reading passage above a question - a cluster carries its own copy of the passage on each question rather than linking to one. Answer types cover single-correct, multi-correct, numeric and text. Best when the questions are in your head or in a notebook.",
        "Snip them. Where the questions already exist in a PDF - last year's paper, a textbook exercise, a scanned worksheet - snip a question, an option or a passage straight out of it as an image rather than retyping. It saves the most time on a diagram-heavy science paper.",
        "Import by JSON. MockSetu publishes its own extraction prompt at the [JSON upload guide](/json-upload-guide). Run that prompt in whatever AI assistant you already use, attach your question paper, save the JSON it returns and upload the file. A whole paper arrives in one go.",
      ],
    },
    {
      type: "p",
      text: "Be realistic about the JSON route's edges. It handles MCQs well and leaves numeric, TITA and match-the-column questions for you to add by hand, so a mostly numerical paper is faster typed or snipped, and there is no Excel or Word import. One guardrail either way: change the paper after writing the instructions and the publish dialog tells you the two no longer match, which catches the instruction page promising fifty questions above a test of thirty. It is a warning rather than a block - the Publish button still works - and it audits the lines it generated, not a sentence you typed yourself. The longer version of building the paper itself is [how to make a question paper online](/blog/how-to-make-a-question-paper-online).",
    },
    {
      type: "h2",
      text: "Minute Seventeen: The Marking Scheme",
    },
    {
      type: "p",
      text: "Marks are set per question: correct, wrong, unattempted. On a plain unit test, four, zero and zero is the whole decision. Multi-correct questions carry more dials - partial credit or all-or-nothing, a penalty charged once or once per wrong option ticked, and part marks rounded down, to nearest, up, or exact, which leaves the fraction as it falls. You will use almost none of it on your first test and be glad it exists on your fifth.",
    },
    {
      type: "p",
      text: "Get the key right before you publish, because a published paper is locked for editing: to fix a wrong answer you unpublish, correct it and publish again. Attempts already recorded keep the marks they were given - nothing re-scores them - so the fix only reaches students who sit it afterwards. That is the strongest argument there is for the preview below.",
    },
    {
      type: "h2",
      text: "Minutes Eighteen to Twenty: Preview, Publish, Share One Link",
    },
    {
      type: "p",
      text: "Preview your own exam before anyone sees it. It runs the real student screen - palette, mark for review, the instructions page with its paper table and language picker, fullscreen - and records nothing. Take it at speed: two minutes catches the blank option, the image that did not attach, and the answer you keyed as B when it is C.",
    },
    {
      type: "p",
      text: "Then publish - in the language or languages you chose - and share the link. The test appears in the public [student library of mock tests](/marketplace) and you send that link to your class on whatever group you already use. If you need it gone, unpublish it. For next year's batch, duplicate rather than rebuild: the copy carries the sections, questions, instructions, languages, timing groups and the marking scheme down to the per-question overrides, and arrives unpublished. Change what the new batch needs before you publish, not after.",
    },
    {
      type: "h2",
      text: "Do Your Students Need Accounts? For a Published Test, No",
    },
    {
      type: "p",
      text: "This is the question every teacher asks second, and the answer decides how much of the class actually sits the paper rather than meaning to. A published test can be started as a guest: no account, no sign-up, no OTP, no app - the student taps the link on a phone and begins.",
    },
    {
      type: "quote",
      text: "A test nobody can open is not a test. Remove the login before you remove anything else.",
    },
    {
      type: "p",
      text: "Two exceptions. A signed-in student who drops out mid-exam - battery, a call, the network - can return within about five minutes on the same device; a guest has no such safety net, which is a fair reason to ask a class to sign in if they can. And live exam mode, where the class joins from their phones with one code while you run a projector view, needs a one-time sign-in. Say so in advance.",
    },
    {
      type: "h2",
      text: "What Free Actually Costs You: Published Papers Are Public",
    },
    {
      type: "p",
      text: "Here is the trade, stated plainly rather than buried in a settings page. MockSetu is free with no card, and the way that works is that published papers go into a public library where anyone can find and attempt them. There is no private delivery to one batch, no password-protected link, no paywall and no way to sell access - and no attempt limit and no question shuffling either, so two students sitting together see the same questions in the same order.",
    },
    {
      type: "p",
      text: "For school use that lands somewhere specific. It is excellent for practice, revision drills, pre-boards at home, and unit tests where the point is diagnosis. It is the wrong tool for anything whose marks go on a report card: no webcam proctoring, no lockdown browser, no tab-switch detection. Keep the graded ones in the room.",
    },
    {
      type: "h2",
      text: "What You Get Back After the Test, and What You Do Not",
    },
    {
      type: "p",
      text: "Creator analytics are aggregated. You see section-wise accuracy, time spent per question, the score distribution and where the class as a whole struggled. The one place an individual surfaces is a top-three leaderboard, and it shows the handle a student signed up with and their score - never a full name, never an email address. Everyone else is a bar in the distribution. There is no CSV or Excel export and no per-student report card, so a mark sheet is the one thing this will not hand you.",
    },
    {
      type: "p",
      text: "What it is good at is telling you that question 14 took four times as long as question 13, or that accuracy collapsed in the second section. That is reteaching information, and a stack of answer sheets never gave it to you without an evening of counting. One caution: deleting an exam deletes its attempts with it, so do not delete last term's test if you still want that picture.",
    },
    {
      type: "h2",
      text: "The Last Check Before You Send the Link",
    },
    {
      type: "ul",
      items: [
        "The clock is set. A section with no minutes is a test with no clock, and with section switching on it is the paper total that counts, not the section boxes.",
        "Correct, wrong and unattempted marks say what you meant - and on a duplicate, which inherits last year's scheme, that means checked rather than assumed.",
        "You previewed it end to end: every image loaded, every correct answer the one you meant, instructions matching the paper.",
        "The class has been told plainly: no account needed, works on a phone, auto-submits when time is up.",
      ],
    },
    {
      type: "h2",
      text: "Where to Go After Your First Test",
    },
    {
      type: "p",
      text: "The second test is where duplicating pays, and it is worth being exact about how much. You duplicate the first exam, so the sections, the clock, the instructions, the languages and the marking scheme are already built; the questions come in by snip or JSON; you preview and publish. Four of the seven scaffolding minutes go away - the exam form, the section and its clock, the marking scheme. The preview and the publish do not, and neither does the thirteen of question entry, because a copy cannot bring questions it has never seen. That is why the route you pick for the questions is the decision that matters most. For a run of chapter tests across a term, [how school teachers can create online unit tests](/blog/how-school-teachers-can-create-online-unit-tests) covers sequencing them so the class picture compounds.",
    },
    {
      type: "p",
      text: "If the paper you have in mind is bigger than a class test - several sections, a real marking scheme - [how to create an online mock test](/blog/how-to-create-an-online-mock-test) is the same sequence at that scale, and the [creator overview for teachers building tests](/for-creators) lists what is included.",
    },
    {
      type: "p",
      text: "If you try one thing from this article, make it the snip-from-PDF route on a paper already sitting in a folder. Twenty questions you do not have to retype is the moment this stops feeling like a project and starts feeling like a Tuesday.",
    },
  ],
  faqs: [
    {
      question: "Is there a genuinely free online test maker for school teachers?",
      answer:
        "Yes. MockSetu is free to create and publish tests on, with no card required. The trade is that published papers go into a public library, so anyone can find and attempt them - there is no private or password-protected delivery to one class only. For practice tests, revision drills and unit tests used for diagnosis that is fine. For an assessment whose marks go on a report card, it is the wrong tool.",
    },
    {
      question: "Do students need to create an account to take the test?",
      answer:
        "Not for a published test. A student taps the link and starts as a guest, on a phone or a laptop, with no sign-up. Two things need a sign-in: live exam mode, where the class joins with one code from their phones, and the five-minute resume window that lets a signed-in student who drops out mid-exam return on the same device. Guests have no resume window, which is a reasonable reason to ask students to sign in if they can.",
    },
    {
      question: "How long does it actually take to set up a class test?",
      answer:
        "About twenty minutes the first time for a twenty-question test, assuming the questions already exist somewhere and you are moving them rather than writing them. The scaffolding around the questions - naming the exam, adding a section, setting the clock and the marks, previewing and publishing - is roughly seven minutes of that; the rest is question entry, which is why the route you pick for it matters more than any other decision. The second test is faster because you duplicate the first one: the exam form, the section and its clock and the marking scheme all come across with the copy, which is four of those seven minutes gone. You still preview and publish, and the questions are the one thing a copy cannot bring, so budget those thirteen minutes again.",
    },
    {
      question: "Can I upload my existing question paper instead of typing it?",
      answer:
        "Two ways. You can snip a question, an option or a passage straight out of a PDF as an image rather than retyping it, which is fastest on diagram-heavy papers. Or you can bulk import by JSON: run MockSetu's published extraction prompt in whatever AI assistant you already use, save the JSON it returns, and upload the file. There is no Excel or Word import, and the JSON route leaves numeric, TITA and match-the-column questions for manual entry.",
    },
    {
      question: "Will I see each student's marks after the test?",
      answer:
        "Not as a mark sheet. Creator analytics are aggregated: section-wise accuracy, time per question, the score distribution, and where the class as a whole struggled. The only named view is a top-three leaderboard, which shows the handle a student signed up with and their score - no full names, no email addresses, and nothing per-child for the rest of the class. There is also no CSV export and no report card. If you need named marks for every student, collect them the way you already do and use the class-level picture to decide what to reteach.",
    },
    {
      question: "Is an online test like this invigilated?",
      answer:
        "No. There is no webcam or AI proctoring, no lockdown browser and no tab-switch detection, and there is no question shuffling or cap on attempts either. Treat it as an open-book practice environment. For tests where marks count, keep the paper in the room and use the online version for the drills, pre-boards taken at home, and chapter checks where the point is finding out what the class has not understood.",
    },
  ],
};

export default post;
