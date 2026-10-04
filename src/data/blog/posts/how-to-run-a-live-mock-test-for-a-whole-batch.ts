import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-run-a-live-mock-test-for-a-whole-batch",
  title: "How to Run a Live Mock Test for a Whole Batch at Once",
  metaTitle: "Run a Live Mock Test for a Whole Batch | MockSetu",
  metaDescription:
    "A live mock test unlocks one question at a time for the whole batch on one clock. When that shape fits your paper, when a scheduled mock is the better call.",
  keywords:
    "live mock test for students, run a live test for a batch, live online exam for class, live quiz for coaching batch, conduct live test online, live exam report, scheduled mock test",
  excerpt:
    "A live room paces the class; a scheduled mock paces the candidate. Here is how to decide which one your paper wants, and how to run the live version without losing the room.",
  publishedAt: "2026-10-16",
  updatedAt: "2026-10-16",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Live Exam",
    "live mock test",
    "batch testing",
    "classroom tools",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Run a Live Mock Test for a Whole Batch at Once",
    lede: "One room, one clock, one question on screen at a time. It is a very good format for a sectional drill and a poor one for a full-length paper - here is how to tell the difference before you build anything.",
  },
  content: [
    {
      type: "p",
      text: "A live mock test is one room on one clock. You unlock a question, the whole batch answers inside that question's seconds, the answer is revealed to everyone at the same moment, and you move on. Decide honestly whether your paper wants that shape before you build one. A live room is for a shared, paced experience - a sectional drill, a formula round, the revision sprint before a test. A full-length paper is almost always better set as an ordinary timed mock, which each student sits on their own clock, in their own hour.",
    },
    {
      type: "p",
      text: "This is the how-to for the person running the event. For the short classroom version, see [how to conduct a live quiz in class](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones). For start times and lobbies in depth, [how to schedule a live online test with a countdown](/blog/how-to-schedule-a-live-online-test-with-a-countdown). For the session afterwards, [how to read a live exam report](/blog/how-to-read-a-live-exam-report).",
    },
    {
      type: "h2",
      text: "Decide the Format Before You Build Anything",
    },
    {
      type: "p",
      text: "The live engine paces by question, not by paper. Every question carries its own clock, set when you write it - anywhere from 5 to 600 seconds, defaulting to 60. Nothing is on screen until you unlock it, and once a question's clock is finished it is closed to answers. The only way back is an undo available for five seconds after an unlock.",
    },
    {
      type: "p",
      text: "Two consequences settle the format. First, a long paper run one question at a time removes the exact skill a full-length mock rehearses: skipping, returning, re-reading, budgeting the last stretch. Second, live grading is correct or wrong, full stop. A live exam carries no marking scheme - no marks per question, no negative marking, no part marks - and a JSON import into one drops marks on the way in, because there is nowhere to put them. You cannot rehearse a minus-one paper in a live room, because the room has no minus one.",
    },
    {
      type: "ul",
      items: [
        "Run it live when the session is short and the shared pace is the point - a sectional drill, a speed round, a last class before the real exam.",
        "Run it live with a new batch, when you want to see who is lost while you can still do something about it.",
        "Set it as a scheduled mock when the paper is full length, when it needs a real marking scheme, or when a student should be free to skip and come back.",
        "Set it as a scheduled mock when the sitting is very large. A big batch is better served by a paper everyone opens on their own clock than by one live room.",
        "Want both? Run the paper as a scheduled mock, then run the post-mortem live on the questions the batch actually got wrong.",
      ],
    },
    {
      type: "quote",
      text: "A live room paces the class. A scheduled mock paces the candidate. Pick the one that matches what you are actually rehearsing.",
    },
    {
      type: "h2",
      text: "Build the Live Paper - It Is Its Own Object",
    },
    {
      type: "p",
      text: "Live exams sit on their own tab on the creator dashboard, next to Mock Exams, and they are not the same thing as your mock papers. A live exam has its own sections, its own questions and its own per-question clocks. Question types are single-correct, multiple-correct, numeric and text. You can type questions in or bring them through the same JSON upload the mock side uses, remembering that marks are ignored on that route. English and Hindi both work, and a student can switch language mid-session - but build the Hindi side before you go live, not during.",
    },
    {
      type: "h2",
      text: "Publish First, Then Go Live",
    },
    {
      type: "p",
      text: "These are two separate steps and the first is a gate. Publishing runs the server's own readiness check - the same rule the start-session function applies, not a second copy of it - and refuses outright on blocking problems like a section with no questions or a question with no answer key. Issues rated as warnings let the publish through and tell you what they are. The Go Live button exists only on an exam already published or already running; on a draft there is nothing to press, and Share tells you to publish first.",
    },
    {
      type: "p",
      text: "Before the real thing, press Rehearse. It runs the actual control room against 24 simulated students, so you discover that a question's clock is too short in an empty room rather than in front of a batch. Nobody is notified and nothing is saved.",
    },
    {
      type: "h2",
      text: "Put a Time on the Invitation",
    },
    {
      type: "p",
      text: "Set a start time on the pre-live screen and students who open the link land in a lobby with a countdown instead of an open-ended wait. That is what lets you share the link the previous evening rather than fighting the projector and the chat at once. The screen names the time zone it is reading. Starting automatically is off by default, and when switched on the session begins only while your own control room is open - nothing starts unattended.",
    },
    {
      type: "p",
      text: "There are three ways into the room: the join link, the eight-character code read off a projector and typed into the join box, and the QR code on the pre-live screen. Students need an account, because a live session records a participant row against a signed-in user - so put [student sign-up](/student-auth) in the same message as the link, the night before. The pre-live screen counts how many are already waiting, which is the number to glance at before pressing Go Live.",
    },
    {
      type: "h2",
      text: "Pacing a Long Session Without Losing the Room",
    },
    {
      type: "p",
      text: "Pacing is the whole job once the session starts. The controls sit beside each other on purpose, because you use them while a room watches.",
    },
    {
      type: "ul",
      items: [
        "Set each question's seconds while you write it. The editor takes 5 to 600 and defaults to 60 - a comprehension question and a one-line recall question should never share a clock.",
        "Add 30 or 60 seconds mid-question when the room is clearly still working. The total you can add to one question is capped, and the buttons leave once the countdown is finished.",
        "Use Time's up when the clock is still running and the thinking plainly is not. It removes the seconds left and nothing else; the question closes by the route a natural expiry takes.",
        "Leave the talk gap on purpose. The stretch between one question closing and the next unlocking is where you explain, and the report measures it afterwards.",
        "Watch the I'm lost taps, not just the answer count. The tap returns nothing to the student - no count, no 'others feel this way' - and nobody else in the room sees it, which is what makes it usable.",
        "Plan the content to fit one sitting. A live room moves at a single pace for everyone, so if it will not fit, split it across two sessions rather than running one marathon.",
      ],
    },
    {
      type: "h2",
      text: "When a Student Drops",
    },
    {
      type: "p",
      text: "Someone will lose signal. Reopening the same link puts them back in: saved answers come back, missed reveals are restored, and they land on whatever question the room is on now. What does not come back is the time. The clock belongs to the room, and questions that closed while they were away stay closed. Say that out loud before the first unlock, so nobody spends the session arguing about it in chat.",
    },
    {
      type: "p",
      text: "A student who misses the session entirely cannot be added afterwards: once it has ended, anyone who was never in the room is refused, because filing them as an attendee would put a zero in the standings for someone who never sat the paper. To run it again for absentees, duplicate the live exam - allowed in any status, including ended - and the copy arrives as a draft on a brand-new code.",
    },
    {
      type: "p",
      text: "Be clear about what a live room is not. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no email, SMS or WhatsApp goes out about the test; the link reaches students because you sent it. Anyone holding the code can walk in while the session runs. For a high-stakes graded result that is a problem; for a class drill it is not.",
    },
    {
      type: "h2",
      text: "The Report, and What It Will Not Give You",
    },
    {
      type: "p",
      text: "End the session and the report is generated for you: you land on it rather than requesting it. The headline tiles give class accuracy, how many took part, how many questions were asked and how many I'm lost taps came in; your own view adds the median score, the average share of asked questions each student answered, and how many stopped answering before the end or never started. Four tabs sit under the tiles: Overview, Questions, Students and Pacing. Per question you get the median answer time - the middle student, not the average.",
    },
    {
      type: "p",
      text: "The recap can be shared, and the sharing is narrower than it looks on purpose: a public link renders only the overview, student-level detail never travels on it, and with privacy mode on the room sees nicknames while you still see real names. What the report will not do is hand you a spreadsheet - no CSV or Excel export, no per-student report card, no certificates. Read it, pick the questions worth reteaching, and spend Monday on those.",
    },
    {
      type: "h2",
      text: "If a Scheduled Mock Is the Right Answer",
    },
    {
      type: "p",
      text: "For most full-length papers it is. Build it on the mock side, where marks live: a scheme per question or per section, section clocks, and a paper that submits itself when time runs out. The clock is held server-side, so a refresh resumes the same deadline instead of minting a fresh full-length one, and a student away for more than five minutes has that sitting sealed and filed with the answers they had saved. Share the link once and let the batch sit it when they can.",
    },
    {
      type: "p",
      text: "SSC MTS illustrates the dividing line. It runs 90 questions for 270 marks across two sessions of 45 minutes, Session I qualifying with no negative marking and Session II counting towards merit at minus one. A live room cannot reproduce that; a scheduled mock reproduces it exactly, section by section and rule by rule. Students hunting practice can find papers on the [SSC MTS mock test page](/ssc-mts). Whichever route you take, check the current official bulletin of the exam you are mirroring before setting a single clock.",
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - live sessions, scheduled mocks with their own marking schemes, bilingual papers, a listing in the public library - sits behind one account, one tab apart on the same dashboard.",
    },
  ],
  faqs: [
    {
      question: "How do I run a live mock test for a whole batch?",
      answer:
        "Build the live exam on the Live Exams tab of the creator dashboard, publish it, then open the control room and press Go Live. Students join through the link, the eight-character code or the QR code on the pre-live screen, and you unlock questions one at a time while the whole batch answers on the same clock. Set a start time first if you want to share the link the night before, so students arrive at a countdown rather than an empty waiting room.",
    },
    {
      question: "Should a full-length paper be run live or set as a normal mock?",
      answer:
        "Usually as a normal timed mock. A live room paces the class question by question, which removes the skipping and returning a full-length paper is meant to rehearse, and live grading is correct-or-wrong only - there is no marking scheme and no negative marking in a live session. Use the live format for short, shared, paced work: a sectional drill, a speed round, a post-mortem on the questions a batch got wrong.",
    },
    {
      question: "What happens if a student loses connection during a live test?",
      answer:
        "They reopen the same link and are put back in. Their saved answers and the reveals they missed come back, and they land on whatever question the room is on. The time does not come back - the clock belongs to the room, so questions that closed while they were away stay closed. Someone who misses the session entirely cannot be enrolled after it ends; to run it again for absentees, duplicate the live exam and run the copy, which arrives as a draft on a new code.",
    },
    {
      question: "How many students can join one live session?",
      answer:
        "Rather than quote a number, treat it as a format question. A very large sitting is better run as a scheduled mock that students open on their own clock than as one live room, because a live room is an event that depends on everyone keeping pace together. If your batch is big enough that you are asking the question, the scheduled mock is the safer build.",
    },
    {
      question: "Is a live mock test proctored?",
      answer:
        "No. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and anyone holding the code can join while the session is running. A live session is an honest teaching tool, not an invigilated exam. Use it where you are in the room anyway, or where the result informs your teaching rather than a rank.",
    },
  ],
};

export default post;
