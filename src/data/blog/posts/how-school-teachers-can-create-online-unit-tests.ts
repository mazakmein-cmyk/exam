import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-school-teachers-can-create-online-unit-tests",
  title: "How School Teachers Can Create Online Unit Tests",
  metaTitle: "Online Unit Test: A School Teacher's Guide | MockSetu",
  metaDescription:
    "A unit test is short, frequent and diagnostic: about twenty questions, twenty-five minutes, no negative marking. How to build one online and read what comes back.",
  keywords:
    "online unit test, create unit test online for students, unit test for school teachers, formative assessment online, chapter unit test online, class test online free, online test for school class, unit test question paper online",
  excerpt:
    "A unit test is short, frequent and diagnostic - around twenty questions, twenty-five minutes, no negative marking. Here is how to build one online, run it on the phones your class actually owns, and use what comes back.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx - without it this article funnels a school
    // teacher to the student library instead of the creator page.
    "For Creators",
    "School Teachers",
    "unit test",
    "formative assessment",
    "classroom technology",
    "online assessment",
  ],
  hero: {
    eyebrow: "Unit Tests, Term After Term",
    h1: "How School Teachers Can Create Online Unit Tests",
    lede: "Twenty questions, twenty-five minutes, no negative marking, and a diagnosis at the end. The unit test is the smallest piece of assessment that still changes what you teach next week.",
  },
  content: [
    {
      type: "p",
      text: "An online unit test is the short one: around twenty questions, twenty-five minutes, usually no negative marking, run within a few days of finishing a chapter. Its job is diagnosis, not ranking - it tells you what to reteach; it does not rank thirty children. Students attempt it from a link on whatever phone they have, and what comes back is a class-level picture of which questions the room got wrong and how long each took.",
    },
    {
      type: "p",
      text: "This is written for a school teacher with thirty to sixty students in a section and six or eight chapters to get through in a term - not for a coaching test series, and not for anything whose marks go on a report card. That last distinction matters more than any setting in any tool, so it gets its own section near the end.",
    },
    {
      type: "h2",
      text: "What a Unit Test Is For, and Why It Is Not a Term Exam",
    },
    {
      type: "p",
      text: "A term exam measures. A unit test diagnoses. That is formative assessment in two sentences, and the design follows from it: short enough that the class sits it without a week of warning, soon enough after teaching that the chapter is still warm, narrow enough that a wrong answer points at one idea rather than a vague weakness in science. If you cannot say which misconception a question would expose, the question is decoration.",
    },
    {
      type: "p",
      text: "Formative also means the result is addressed to you, not to the child. A term exam's output is a mark the student carries; a unit test's output is a line in your plan for next week. So keep the stakes low on purpose: once a chapter test starts counting for something, students optimise for the mark instead of showing you their thinking, and the diagnosis stops arriving.",
    },
    {
      type: "p",
      text: "Which is why negative marking is almost always wrong here. A penalty exists to stop guesswork in a ranking exam. In a unit test, the student who leaves eight questions blank out of fear has told you nothing, and a blank is the one response you cannot learn from. Marks are set per question as three numbers - right, wrong, blank - so set one, zero and zero. If a senior batch is sitting a pattern paper and you do want a penalty, [negative marking schemes of Indian exams for paper setters](/blog/negative-marking-schemes-of-indian-exams-for-paper-setters) covers what the real exams use.",
    },
    {
      type: "quote",
      text: "A term exam asks how the class did. A unit test asks what to teach on Monday. Only one of those changes your week.",
    },
    {
      type: "h2",
      text: "Spec the Unit Test Before You Build It",
    },
    {
      type: "p",
      text: "Two minutes with a pen beats twenty minutes of deciding inside a form. The spec below is for one chapter, and it is the same six lines every time.",
    },
    {
      type: "ul",
      items: [
        "Question count: eighteen to twenty-two, spread so each idea appears at least twice. One wrong answer is noise; two on the same idea is a signal.",
        "Time: forty-five seconds for a recall question, ninety where there is working to do - so twenty questions run fifteen to thirty minutes depending on the mix, and twenty-five is a safe allowance. A twenty-five minute test gets attempted; a ninety-minute one sent home does not.",
        "Coverage: write the chapter's four or five core ideas down the margin and put four or five questions against each - four ideas at five questions, or five at four, is how you land on twenty. Eleven questions on the first idea and one on the last diagnoses the first idea only.",
        "Question types: single-correct carries most unit tests; multi-correct, numeric and text are there when the chapter needs them. A comprehension question can carry its own passage, but the passage belongs to the question it sits in, so a six-question set means pasting it six times.",
        "Language: English, Hindi or both. On a bilingual paper the student picks a language on the instructions page, before the clock starts, and the whole sitting runs in it - worth setting up where half the room thinks in Hindi and answers in English.",
        "Paper type: nothing to decide. A test you wrote yourself is a Mock, which is what every paper is unless it is tagged otherwise, and the Mock / Previous Year picker is off for every account until an admin switches it on - so unless you asked for it, the field is not on your screen at all, and you do not need it.",
      ],
    },
    {
      type: "p",
      text: "If you teach to the CBSE pattern, the shift towards application and case-based items changes what a good unit test item looks like; [competency-based questions for the CBSE pattern](/blog/competency-based-questions-for-the-cbse-pattern) covers how to write them without turning every question into a paragraph.",
    },
    {
      type: "h2",
      text: "Building It Is the Short Part",
    },
    {
      type: "p",
      text: "The build is not what this article is for: a sibling piece walks it click by click, laid out as twenty minutes end to end - name the exam, add one section with its minutes, put the questions in by typing, snipping from a PDF or importing JSON, then set the marks and preview. Follow [the setup walkthrough for school teachers](/blog/free-online-test-maker-for-school-teachers), or [how to create an online mock test](/blog/how-to-create-an-online-mock-test) for the general version. The only unit-test-specific advice: keep the chapter in one section on one clock, because splitting twenty questions into parts costs the student a decision and gains nothing.",
    },
    {
      type: "h2",
      text: "Running It in Class, or Sending It Home",
    },
    {
      type: "p",
      text: "In class is simpler and gives cleaner data. Publish the test, share the link, give the room twenty-five minutes, and the papers submit themselves when the clock runs out. A student starts a published paper as a guest - no account, no sign-up - which is what makes it workable to hand one link to a whole section rather than enrolling thirty children first. One catch to say out loud before you build a term on it: a guest's paper is only saved when they sign in on the screen at the end, so a child who closes the tab there leaves you nothing. Preview it yourself with nothing recorded before the class sees it.",
    },
    {
      type: "p",
      text: "Sent home, the same test becomes practice rather than assessment - treat it that way in your head. There is no attempt limit and no question shuffling, so two students sitting together see the same questions in the same order. Fine for a diagnostic; not fine for anything you intend to grade. Announce a deadline of two or three days rather than one evening - and be clear the deadline is yours, not the platform's: a published paper stays open until you unpublish it.",
    },
    {
      type: "h2",
      text: "The Device Reality in an Indian Classroom",
    },
    {
      type: "p",
      text: "You will lose more attempts to devices than to difficulty, and in an Indian classroom the device usually belongs to somebody else. The class has phones, not laptops; some of those phones leave with a parent in the morning or pass between siblings in the evening; the lab, if there is one, has fewer machines than the section has children; and the bandwidth in the last period is not the bandwidth in the first. The test itself runs in the browser with no app to install. The rest you design around, because a diagnostic only half the class could open has diagnosed half the class.",
    },
    {
      type: "ul",
      items: [
        "Open the link yourself on the cheapest phone you can borrow. The exam screen, the palette and the submit button all have to be reachable with one thumb.",
        "For shared devices, announce a two- or three-day deadline rather than a one-hour slot - one phone cannot serve three children between 7 and 8 pm. The paper stays open either way; the window is the one in your message.",
        "For patchy networks, ask students to sign in if they can. A signed-in student who drops mid-exam can return within about five minutes on the same device; a guest cannot.",
        "Keep the paper light. Twenty typed questions open on a slow evening connection; twenty full-page snips of a worksheet are twenty images to download. Snip the diagrams and type the rest.",
        "Running it in the lab? Book one more machine than you need and run two batches rather than cramming three to a screen.",
        "Tell the class four things up front: no account is needed to start, it works on a phone, it submits itself when time is up, and they must sign in on the screen that appears at the end or their paper never reaches you.",
      ],
    },
    {
      type: "h2",
      text: "A Unit Test Is Not a Live Quiz",
    },
    {
      type: "p",
      text: "These two get confused constantly and they solve different problems. A live exam is synchronous and in the room: the class joins from their phones with one code - they sign in once first, so tell them in advance - you run a projector view, answer bars fill as the room answers, and the correct answer reaches every student's phone the moment that question's timer ends. Putting it on the projector too is a switch, and one that starts off.",
    },
    {
      type: "p",
      text: "A unit test is the opposite: individual, asynchronous, quiet, about the data rather than the moment. You do not want a leaderboard running while a student works out whether they understood displacement reactions. Run the live format before an exam when the goal is participation; run the unit test after a chapter when the goal is to find what did not land.",
    },
    {
      type: "h2",
      text: "What the Analytics Tell You, and What They Deliberately Do Not",
    },
    {
      type: "p",
      text: "Creator analytics are aggregated. You get section-wise accuracy, average time per question - counted across everyone who submitted the paper, not only the ones who answered that question, so a question most of the class never reached reads as fast rather than hard - and where the class as a whole struggled. What you do not get is a register: no emails, no real names, no mark sheet with forty rows on it. The one exception is a Top Students panel showing the top three scorers, under the handles they signed up with. Everything else is aggregate by design rather than by omission, and that is the honest answer to the teacher who opened the page expecting a roll call.",
    },
    {
      type: "p",
      text: "State the limit before you build your term around it: there is no CSV or Excel export and no per-student report card. If you need named marks per child, keep collecting them the way you already do. What it gives you is what a stack of answer sheets never did without an evening of counting - that question 14 took four times as long as question 13, or that accuracy fell off a cliff halfway down the paper. For a formative test that is the output that matters, and it arrives the same day.",
    },
    {
      type: "h2",
      text: "Turning the Class Picture Into the Next Lesson",
    },
    {
      type: "p",
      text: "Read the aggregate with one question in mind: what changes about Monday? Three patterns are worth looking for.",
    },
    {
      type: "ul",
      items: [
        "Accuracy collapsed on two or three questions sharing an idea. The idea was not taught, or was taught in a way that produced a confident wrong model. Reteach it from a different starting point, not louder, and put two questions on it into the next unit test.",
        "Accuracy held but time per question doubled. They can do it; they cannot do it fluently. That needs drilling, not explaining, and a second short test a week later shows whether it moved.",
        "Accuracy drops steeply towards the end of the paper. Usually pacing rather than content - check the time you allotted against the working the questions required before blaming the last topic.",
      ],
    },
    {
      type: "p",
      text: "Two operational notes, both about mistakes. If you find a key error after the class has attempted - and you will - a published paper is locked for editing, so the fix means unpublishing, correcting the key and publishing again; and marks are stamped at the moment a paper is submitted, so nothing re-scores the attempts already recorded. The correction reaches the next student, never the last one, which is the whole argument for the preview. And do not delete an exam you still want the picture from: deleting it deletes its attempts with it.",
    },
    {
      type: "h2",
      text: "Where a Free Online Unit Test Is the Wrong Tool",
    },
    {
      type: "p",
      text: "Here is the trade, said plainly. MockSetu is free to build and publish on, with no card, and publishing puts the paper in the public [student library of mock tests](/marketplace) where anyone can find and attempt it. There is no private delivery to one batch, no password-protected link, no paywall and no way to sell access - and no webcam or AI proctoring, no lockdown browser, no tab-switch detection.",
    },
    {
      type: "p",
      text: "For unit tests, that trade lands in a good place. Diagnosis, practice, revision drills and homework checks are exactly the use case, and none of them are ruined by a student who looked something up - they have still shown you which question sent them looking. Anything whose marks go on a report card stays in the room, on paper. Other absences worth knowing: no certificates, no notifications to the class about a test by email, SMS or WhatsApp, no Google Classroom or LMS integration, no subjective or essay grading. You share the link on the group your class is already on.",
    },
    {
      type: "h2",
      text: "A Term of Unit Tests, Not One Good Test",
    },
    {
      type: "p",
      text: "One unit test tells you about one chapter. Six across a term tell you about the class, because the same idea keeps reappearing and you can see whether reteaching worked. The rhythm that holds up is one short test per chapter, built from the last by duplicating the exam and swapping the questions. The copy brings the scaffolding with it - the sections, the clock, the marking scheme - so what is left is the questions themselves, which is the one part no copy can do for you. The same logic across a whole syllabus is [how to create a chapter-wise test online](/blog/how-to-create-a-chapter-wise-test-online).",
    },
    {
      type: "p",
      text: "The honest advice is to stop reading and put your next chapter test online, for one section, this week. Twenty questions you do not have to correct by hand, and a class-level answer the same evening, is where this stops being a project and becomes how you finish a chapter.",
    },
  ],
  faqs: [
    {
      question: "How many questions should an online unit test have?",
      answer:
        "Around twenty - eighteen to twenty-two is the band that works. The test is diagnostic, so the count matters less than the spread: each core idea in the chapter should carry at least two questions, because one wrong answer is noise and two on the same idea is a signal. At forty-five seconds for a recall question and ninety where there is working to do, twenty questions run from fifteen to thirty minutes depending on the mix, so twenty-five minutes is a safe allowance and short enough that the class actually sits it.",
    },
    {
      question: "Should a unit test have negative marking?",
      answer:
        "Usually not. Negative marking exists to stop guessing in a ranking exam. In a unit test you want to see what students believe, and a blank left out of fear tells you nothing you can reteach from. Marks are set per question as three separate numbers - right, wrong and blank - so setting one, zero and zero takes a few seconds and keeps the data readable.",
    },
    {
      question: "Do students need accounts to take an online unit test?",
      answer:
        "Not to start one. A student taps the link to a published paper and begins as a guest on a phone or a laptop, with no sign-up and no app to install. Signing in buys two things, and both matter. A guest's paper is only saved when they sign in on the screen at the end, so a guest who closes the tab there leaves you nothing to read; and a signed-in student who drops out mid-exam can return within about five minutes on the same device, which a guest cannot. Live exam mode is the other exception - there the class signs in once before joining with the code.",
    },
    {
      question: "Can I see how each individual student performed?",
      answer:
        "Not as a register. Creator analytics are aggregated: section-wise accuracy, average time per question counted across everyone who submitted, and where the class as a whole struggled. No emails, no real names, no CSV or Excel export and no per-student report card. The one named thing on the page is a Top Students panel showing the top three scorers under their handles. For marks against children's names, keep the record you already keep - and use the class-level picture to decide what to reteach.",
    },
    {
      question: "Is an online unit test safe to use for report card marks?",
      answer:
        "No, and it is better to say so plainly. Published papers are public, there is no limit on attempts, there is no question shuffling, and there is no webcam proctoring, lockdown browser or tab-switch detection. That is fine for diagnosis, practice and homework, and wrong for an assessment that counts. Keep graded tests in the room and use the online unit test for the thing it is good at - finding out what the chapter did not land.",
    },
    {
      question: "How is a unit test different from a live quiz in class?",
      answer:
        "A live exam is synchronous: the class joins from their phones with one code after signing in, you run a projector view, answer bars fill as the room answers, and the correct answer reaches every student's phone when that question's timer ends. It is built for revision energy and participation. A unit test is individual, asynchronous and quiet, and it exists to produce a class-level diagnosis rather than a moment. Use the live format before an exam, and the unit test after a chapter.",
    },
  ],
};

export default post;
