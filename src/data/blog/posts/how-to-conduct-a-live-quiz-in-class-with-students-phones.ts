import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-conduct-a-live-quiz-in-class-with-students-phones",
  title: "How to Conduct a Live Quiz in Class With Students' Phones",
  metaTitle: "How to Run a Live Quiz in Class on Phones | MockSetu",
  metaDescription:
    "Run a live quiz on your students' phones: build the questions, publish, share the eight-character code, unlock one question at a time, and read the room as answers land.",
  keywords:
    "live quiz in classroom, live quiz with phones, classroom quiz app india, live exam join code, run a live quiz for students, interactive classroom quiz, live quiz teacher control, free live quiz tool",
  excerpt:
    "One room, one question at a time, on the phones already in the room. The unlock button, the join code, the sign-in that eats your lesson, and the three ways to handle standings.",
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
    "live quiz",
    "classroom tools",
    "classroom teaching",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Conduct a Live Quiz in Class With Students' Phones",
    lede: "Build it, publish it, put the code on the board, and unlock one question at a time while the room answers against a clock you control. Everything else is a judgement call about what the room is allowed to see.",
  },
  content: [
    {
      type: "p",
      text: "A live quiz on MockSetu is one room, one question at a time, on the phones the class already has. You build the questions, publish the exam, put an eight-character code on the board, and unlock questions one by one while the room answers against a countdown you control. The part nobody warns you about: every student needs a signed-in student account, so have them sign up the night before.",
    },
    {
      type: "p",
      text: "The wall is a separate set of decisions, covered in [how to project a live quiz on a classroom screen](/blog/how-to-project-a-live-quiz-on-a-classroom-screen). A full-length paper rather than a warm-up is a different job again, in [how to run a live mock test for a whole batch](/blog/how-to-run-a-live-mock-test-for-a-whole-batch). This is the session itself.",
    },
    {
      type: "h2",
      text: "Build the Quiz Before the Bell",
    },
    {
      type: "p",
      text: "A live exam is its own object, on its own tab in the creator dashboard, separate from your mock tests. You name it, choose English, Hindi or both, and add sections. Then the questions, each with its own timer. A new one starts at 60 seconds and the editor refuses anything under 5. That number is the length of the silence in the room, so it is the most consequential thing you set.",
    },
    {
      type: "ul",
      items: [
        "Create the exam and add at least one section. A live exam with no sections cannot go live.",
        "Add the questions with their timers. Time each at your slowest reader's pace plus thinking time - the clock starts when you unlock, not when they finish reading.",
        "Publish. Go Live appears only once the exam is published, and Share refuses to copy a link until then. Drafts are hidden from students, so an unpublished code reads exactly like a wrong one.",
        "Let the publish check run. No sections, no questions, a blank question, a missing correct answer, or question counts that disagree between your two languages all block the publish. An uneven option count between languages is only a warning and goes through.",
        "Go Live opens the control room, where you confirm the start. Students who typed the code earlier sit in a waiting room, with nothing on screen until you unlock the first question.",
      ],
    },
    {
      type: "h2",
      text: "The Code, and the Sign-In That Eats Your Lesson",
    },
    {
      type: "p",
      text: "Students get in two ways, both resolving to the same eight characters: the join link, or the code typed into Join with code on the [public test library](/marketplace), beside the My Live Exams tab. The control room has a join panel you can pin to the screen - a QR square with the code beside it - so a late arrival does not send you back into a dialog. Treat typing as the real route in: camera autofocus on a bright projected surface from the back row fails often, and the code is set monospaced, in two blocks of four, so 0 and O cannot be confused.",
    },
    {
      type: "p",
      text: "Now the expensive part. A live exam requires a signed-in student account, every time. Someone who opens the link signed out is sent to sign in and returned to the room. Someone whose account was made at the classroom door must finish onboarding - name and user ID - before joining, or the standings would print an email prefix as their name. That queue is the difference between a quiz that starts on time and one that does not.",
    },
    {
      type: "p",
      text: "The join box checks the code before letting anyone through and names the exam when it matches, so a mistyped character is caught in place. Be clear what the code is, though: anyone with a student account who has it can walk in. There is no roster, no attendance list, and no way to restrict a live exam to one batch.",
    },
    {
      type: "h2",
      text: "Putting a Question Up, and Taking It Back",
    },
    {
      type: "p",
      text: "Unlock is the whole job. One button reading \"Unlock first question\", then \"Unlock Q2\" and onwards; the space bar fires it too, which is why a double-tap is refused - the server would otherwise advance twice and skip a question in front of the class. The confirmation names the question and its seconds.",
    },
    {
      type: "p",
      text: "Three recovery controls exist because no live class runs to the plan you wrote the night before. Two sit beside the clock: while the countdown runs you can add 30 or 60 seconds, up to five minutes of extra time on one question, and when the room has plainly finished and the only thing still happening is a ring emptying itself, \"Time's up\" removes the seconds that are left and nothing else - the question then closes by the ordinary route, grading and reveal included.",
    },
    {
      type: "p",
      text: "The third is an undo. For five seconds after an unlock, and only until the first student answers, you can take the question back and the room returns to waiting. After that it is out, and the only repair is to say so out loud.",
    },
    {
      type: "quote",
      text: "The code on the board is a door, not a lock. There is no proctoring here of any kind, so a live quiz is worth exactly what the room's attention is worth - which in a classroom you are standing in is quite a lot.",
    },
    {
      type: "h2",
      text: "What You See While the Answers Land",
    },
    {
      type: "p",
      text: "Your screen is a cockpit, not a document. While a question is open you see how many have answered against how many are actually in the room - present now, from a heartbeat, not everyone who ever joined - plus the live split across the options and a line interpreting it.",
    },
    {
      type: "p",
      text: "Those option bars are built to be projected. They cannot mark an answer correct even if you wanted them to: fixed order, one neutral colour, no tick. A sharp student watching the wall learns how the room is divided and nothing about who is right.",
    },
    {
      type: "p",
      text: "The quietest readout is the count of students who pressed \"I'm lost\". On their phone that button gives nothing back - no count, just a tick and the words telling them only the teacher sees this. It resets every question, and the server takes one tap per student per question. Your side shows an exact number from one upward and vanishes at zero. It never goes on the projector: a public count turns an anonymous signal into a performance, and nobody presses it twice.",
    },
    {
      type: "h2",
      text: "The Reveal, and Who Sees the Standings",
    },
    {
      type: "p",
      text: "When the visual timer ends the server keeps accepting answers for another two seconds, so a student who tapped as the clock hit zero is not punished for their network. Then the question is graded. Until that moment every answer comes back with the verdict withheld, so nobody learns they were right while the room is still deciding. The first submission is final, and only the open question is answerable.",
    },
    {
      type: "p",
      text: "After grading, every student sees the correct answer and the class distribution drawn into their own options. The wall is a separate decision: revealing the answer there is its own switch, which only exists while the wall is showing the choices at all. Standings are three choices, changeable mid-lesson without stopping anything:",
    },
    {
      type: "ul",
      items: [
        "Everyone - the room sees the ranking. Fine for a warm-up, corrosive once it is the same names at the bottom every time.",
        "Just me - each student sees only their own result and nobody else's.",
        "Off - nobody has a place to look at while it runs, you included: a ranking read off the presenter's screen is still a ranking in the room.",
      ],
    },
    {
      type: "p",
      text: "Scores and ranks are recorded in all three, so turning the leaderboard off costs no data - your list comes back when the session ends, and so does the report. Hiding student names is separate: the room sees nicknames while you keep real names on your own screen, which is what you want when the ranking is useful and the shaming is not. On the big screen, standings appear only between questions.",
    },
    {
      type: "h2",
      text: "Ending the Session",
    },
    {
      type: "p",
      text: "Ending asks once, warns you if questions are still locked, computes the final rankings, and cannot be undone. The room then goes read-only: anyone who was in it can reopen the same link for their own result and the standings. Anyone who was not is told the session has finished rather than being enrolled as an attendee who scored zero, which keeps your head count honest. What arrives next is the report, and [reading a live exam report](/blog/how-to-read-a-live-exam-report) is a job of its own. To run the same quiz with the next batch, duplicate it - allowed in every status, ended included.",
    },
    {
      type: "h2",
      text: "Shared Phones, Flat Batteries, and the Student With Nothing",
    },
    {
      type: "p",
      text: "Five classroom facts the feature cannot argue with.",
    },
    {
      type: "ul",
      items: [
        "Two students on one phone are one student. Participation is keyed to the account, not the device, so a shared login is one row with one score. Pair them deliberately and say so, or give both an account and a device.",
        "A flat battery is recoverable. Signing in again on a borrowed phone returns that student to their own row and score; they lose only the questions that closed while they were away.",
        "Latecomers come in on the question the room is on and cannot answer the ones they missed. Say that out loud before someone discovers it and feels cheated.",
        "A student with no device has no row. There is no paper mode and no way to enter an answer for them. Seat them with a partner, let them argue the answer, and leave them out of the ranking.",
        "A colleague on a creator account cannot join as a student - creator accounts are blocked from other people's exams, and your own account in your own room is a watch-only preview that records nothing.",
      ],
    },
    {
      type: "h2",
      text: "What a Live Quiz Here Cannot Do",
    },
    {
      type: "p",
      text: "Saying this now is cheaper than discovering it mid-session. There is no proctoring of any kind: no webcam, no lockdown browser, no tab-switch detection, no question shuffling. There is no mobile app either - it runs in the phone's browser. Nothing emails or messages your class that a room is open, so the code on the board is the announcement. Results do not export to CSV or Excel and there are no per-student report cards. Published papers are public, with no paywall or private delivery to one batch.",
    },
    {
      type: "p",
      text: "A very large sitting is the wrong shape for this. One room on one clock suits a class you are standing in front of; a whole centre is better served by a scheduled mock everyone sits in their own time.",
    },
    {
      type: "h2",
      text: "Rehearse Once, in an Empty Theatre",
    },
    {
      type: "p",
      text: "The control room has a rehearsal mode: a simulated cohort who join, answer at plausible speeds, get things right and wrong, go quiet, and occasionally say they are lost. Every control is real and pressable, and nothing is written anywhere - the rehearsal has no network access at all, so it cannot leak a row into a real leaderboard. Spend one free period on it. The alternative is learning what Unlock does in front of a full class.",
    },
    {
      type: "p",
      text: "Then build it properly. [Everything a creator can make here](/for-creators) - live rooms, timed mocks on a real computer-based-test screen, bilingual papers, sections with their own clocks - sits behind one free account, and a live quiz is the fastest route to a first question.",
    },
  ],
  faqs: [
    {
      question: "How do I run a live quiz in class using students' phones?",
      answer:
        "Create a live exam, add sections and questions with a per-question timer, publish it, then open the control room and start the session. Put the eight-character join code on the board or project the QR panel. Students sign in, enter the code and wait; you unlock questions one at a time and the whole room answers against the same countdown. Nothing appears on their phones until you unlock the first question.",
    },
    {
      question: "Do students need an account to join a live quiz?",
      answer:
        "Yes. A live exam needs a signed-in student account, and a brand-new account has to finish onboarding with a name and user ID before it can join, otherwise the standings would show an email prefix instead of a name. Ask the class to sign up at home the day before. A signed-out student who opens the join link is sent to sign in and returned to the room afterwards, but doing that for a whole class at the start of a lesson is what eats the period.",
    },
    {
      question: "Can I hide the leaderboard during a live quiz?",
      answer:
        "Yes, and you get three settings rather than a switch: the room sees the standings, each student sees only their own result, or nobody sees a place at all while the session runs - including you, since a ranking read off the presenter's screen is still a ranking in the room. Scores and ranks keep being recorded in all three, so turning it off costs no data; your list returns when the session ends and so does the report. A separate setting shows the room nicknames while you keep real names on your own screen.",
    },
    {
      question: "What happens if a student joins late or their phone dies?",
      answer:
        "A latecomer joins on whatever question the room is currently on and cannot answer the ones already closed. A student whose phone dies can sign in again on any device and comes back to their own row with their own score, because participation is tied to the account rather than the handset. The flip side is that two students sharing one login count as one participant with one score.",
    },
    {
      question: "Can I stop students looking up answers during a live quiz?",
      answer:
        "No. There is no proctoring of any kind here - no webcam, no lockdown browser, no tab-switch detection, no question shuffling. What controls it in a classroom is you: short per-question timers, a room you are standing in, and questions that reward thinking faster than searching does. If you need enforced invigilation, this is not the tool for that paper.",
    },
  ],
};

export default post;
