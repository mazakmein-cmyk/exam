import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-schedule-a-live-online-test-with-a-countdown",
  title: "How to Schedule a Live Online Test With a Countdown and Auto-Start",
  metaTitle: "Schedule a Live Online Test: Countdown & Auto-Start | MockSetu",
  metaDescription:
    "Put a start time on a live test so students watch a countdown instead of an open-ended wait. Where to set it, how auto-start works, and how to clear it.",
  keywords:
    "schedule online test start time, live test countdown, auto start online exam, scheduled live quiz, online test waiting room, live exam start time, schedule a test for students, countdown timer online exam",
  excerpt:
    "A start time turns an open-ended wait into a number students can watch. Here is where to set it, what the room sees, and the one condition auto-start depends on.",
  publishedAt: "2026-10-17",
  updatedAt: "2026-10-17",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Live Exam",
    "live quiz",
    "classroom testing",
    "test scheduling",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Schedule a Live Online Test With a Countdown and Auto-Start",
    lede: "Set the time on the pre-live screen, and every student in the waiting room gets a number to watch instead of a spinner. Auto-start will even press Go Live for you - as long as you are still in the room.",
  },
  content: [
    {
      type: "p",
      text: "A live test gets its start time on the pre-live screen of the control room, on the card headed Start time - the same screen that carries the Go Live button. Set a date and time there and every student sitting in the waiting room sees a countdown instead of an open-ended wait. Switch on Start automatically, just below the field, and the session begins by itself when the countdown reaches zero, provided you still have the control room open. That last clause is not a footnote. It is the whole design, and it is the part worth reading on for.",
    },
    {
      type: "p",
      text: "This is the scheduling half of running a live session. [Running a live mock test for a whole batch](/blog/how-to-run-a-live-mock-test-for-a-whole-batch) covers the session itself once it starts, and [running a live quiz on students' phones](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones) covers the classroom version where the whole room is in front of you anyway.",
    },
    {
      type: "h2",
      text: "Where the Start Time Lives",
    },
    {
      type: "p",
      text: "The schedule panel is not in the question editor. It sits on the pre-live screen of the control room, and that screen only exists once the live exam is published - a draft has no waiting room for anybody to wait in. So the order is fixed: build the paper, publish the live exam, open the control room, then set the time. If you cannot find the field, you are almost certainly still looking at a draft.",
    },
    {
      type: "p",
      text: "The field is an ordinary date-and-time picker reading your device's clock, and the panel names the time zone it is reading right underneath. That label matters more than it looks: a creator scheduling for a batch in another city needs to know which clock they just typed into. What gets stored is an absolute instant rather than the text you typed, so a student elsewhere sees the same moment expressed in their own local time - the countdown agrees across devices instead of arguing with them.",
    },
    {
      type: "h2",
      text: "What Students See Before It Opens",
    },
    {
      type: "p",
      text: "With no start time set, the waiting room says \"Waiting for your teacher to start\" and nothing more. That is honest and useless. It could mean anything, so students ask out loud, repeatedly, and you spend the minutes before question one answering the same question instead of setting up.",
    },
    {
      type: "p",
      text: "Set a time and that same space becomes a countdown. It reads \"Starts in\" followed by a figure ticking down in minutes and seconds, picking up an hours field when there is more than an hour to go, with the scheduled time spelled out underneath in the student's own local time. The standing line changes too: instead of waiting for a teacher, it tells them they are in and to keep the tab open. If you are projecting, the big screen carries the same countdown at cinema size with \"Scheduled for\" beneath it, so nobody at the back has to ask whether anything is on.",
    },
    {
      type: "p",
      text: "Two details in that countdown are deliberate rather than decorative. It runs on a server-corrected clock and never the phone's own, because device clocks drift and a countdown that disagrees between two devices in the same room is worse than no countdown. And it never shows a negative number - past zero it switches to \"Starting shortly\", so a teacher who is still wrestling with the projector reads as running late rather than as broken software.",
    },
    {
      type: "h2",
      text: "Auto-Start, and the One Thing It Needs",
    },
    {
      type: "p",
      text: "The Start automatically switch appears only once a time is set, and it is off until you turn it on. With it on, the session begins on its own once the time arrives - but it fires from your own control room, in your own browser. There is no server-side job behind it, no cron, nothing scheduled anywhere but the tab in front of you. Close that tab and nothing starts. The check also runs the moment the control room loads, so opening it after the time has already passed, with the switch on, starts the real exam at once - including in a tab you opened in the background.",
    },
    {
      type: "p",
      text: "Before it begins, it checks the following, and all of them have to hold.",
    },
    {
      type: "ul",
      items: [
        "A start time is set and Start automatically is switched on.",
        "The live exam is in the published state - not a draft, not already live, not ended.",
        "The server-corrected clock has passed the scheduled moment.",
        "You are not in the middle of a rehearsal.",
        "It has not already fired once on this screen.",
      ],
    },
    {
      type: "p",
      text: "That rehearsal guard repays knowing about. A rehearsal already makes the control room look live, so an auto-start underneath it would begin the real exam with nothing on your screen changing - students walking into a room nobody is driving. Instead the start is held and a banner says so in plain words: your scheduled start time has passed and the real exam has not started. Leave the rehearsal and it goes live immediately.",
    },
    {
      type: "quote",
      text: "A scheduled start is a promise to the room, not an instruction to a server. The countdown hitting zero does not open the paper - you do, or your open control room does it on your behalf.",
    },
    {
      type: "h2",
      text: "Changing or Clearing the Schedule",
    },
    {
      type: "p",
      text: "Pick a different time in the same field and it saves as you pick it. There is no separate save button, and a second control tab or your phone picks the change up on its next sync. The small cross beside the field clears the schedule outright, and clearing it also switches auto-start off. That pairing is intentional: an auto-start with no time to fire on is a switch that looks armed and does nothing. Set a new time and you turn the switch back on yourself.",
    },
    {
      type: "p",
      text: "Moving a time after you have announced it is the expensive case, because nothing in the product tells anyone. There are no reminder emails, no SMS and no WhatsApp about a test - transactional account mail for signup and password reset is the only email MockSetu sends. If you move a start time, you announce the move on whatever channel you used the first time, and you assume a student who misses that message will turn up at the old one.",
    },
    {
      type: "h2",
      text: "Announce a Window, Not an Instant",
    },
    {
      type: "p",
      text: "A scheduled time is a technical fact. What your batch needs is an instruction, and the instruction should be a window. Tell them when to be in the room, not when the paper opens - those are different minutes, and the gap between them is where a room settles down.",
    },
    {
      type: "ul",
      items: [
        "Send the join link, or the eight-character code, the evening before - with the window written beside it, not just the start time.",
        "Say what they will see on arriving: a countdown with a real number on it. A student who lands early and expects a blank screen assumes the link is broken.",
        "Say what to do if there is no countdown - refresh once, then re-check the code - so the first message you get is not a screenshot of a waiting room.",
        "Open the control room yourself well before the time, especially with auto-start on. It is the thing the start depends on.",
        "Leave the join link on the big screen while the room fills, so a latecomer reads it off the wall instead of interrupting you for it.",
      ],
    },
    {
      type: "p",
      text: "As an example of the shape: if the paper opens at 7 pm, ask them to be in the room by ten to seven. The countdown does the rest of the work - a number to watch settles a room, and a spinner sends it to the group chat.",
    },
    {
      type: "h2",
      text: "The Batch That Arrives at the Minute",
    },
    {
      type: "p",
      text: "Some of them always will. A live session handles it better than you might fear: a student who joins while the room is running comes straight in on the question the room is currently on, so they are inside and following rather than locked out. What they lose is the questions already gone: a closed question does not reopen, not for one student and not for the room. That is the honest trade of a shared pace.",
    },
    {
      type: "p",
      text: "Which is why the pre-flight card on the control room counts the students present right now rather than everyone who has ever joined. That is the number to read before pressing Go Live - wait a beat if it looks short, then start. And going live only opens the waiting room: nothing appears on a student's screen until you unlock the first question, so there is still a pause between starting the session and starting the paper. Use it for the one-line reminder you always forget.",
    },
    {
      type: "h2",
      text: "What a Schedule Does Not Do",
    },
    {
      type: "p",
      text: "Worth saying plainly, because the tools you are comparing this against will not say it. A start time is not an access window. It will not lock a late student out, it will not close the room at a deadline, and there is no equivalent setting on an ordinary mock test - a published paper is open from the moment it is published, to anyone with the link, because published papers are public. There is no proctoring of any kind here either: no webcam, no lockdown browser, no tab-switch detection, no question shuffling and no attempt limits. A start time is a courtesy to the room and never an integrity control.",
    },
    {
      type: "p",
      text: "And if the sitting is genuinely large, do not force it through one live room. A live session is a shared pace - one question for everybody, one clock, one host driving it - and that shape earns its keep with a class rather than a crowd. Publish the paper as an ordinary mock, announce your own window for it, and let people sit it at their own speed.",
    },
    {
      type: "h2",
      text: "Before You Put a Time on Anything",
    },
    {
      type: "p",
      text: "The schedule is the last decision in a job that is mostly earlier. Write the instructions before you set the time, not after - [an online exam instructions template students will actually read](/blog/online-exam-instructions-template-for-students) is the fastest way to get that done, and the join window belongs in it. Then publish, open the control room, set the time, and send the link.",
    },
    {
      type: "p",
      text: "Students reach a live room by its link or its eight-character code, never by browsing: the [public library](/marketplace) carries a join-with-code button and a tab listing the rooms a student has already been in, but the room itself is not something they stumble on. The link is your entire distribution, which is one more reason to send it the night before rather than at the minute. [Everything a creator can run on MockSetu](/for-creators) - live sessions, scheduled or not, alongside ordinary timed papers - sits behind one free account, and the schedule card described here is on every live exam you publish.",
    },
  ],
  faqs: [
    {
      question: "How do I schedule an online test to start at a specific time?",
      answer:
        "On MockSetu, publish the live exam first, then open its control room. The pre-live screen carries a card headed Start time with a date-and-time field; pick your moment and it saves immediately. The panel names the time zone it is reading, and the instant is stored absolutely, so students in other zones see the same moment in their own local time. Ordinary mock tests have no start-time field at all - a published paper is open from the moment you publish it.",
    },
    {
      question: "Will the test start automatically at the scheduled time?",
      answer:
        "Only if you switch on Start automatically, which appears under the field once a time is set and is off by default - and only while you have the control room open in a browser. It fires from your own screen rather than from a server job, so closing the tab means nothing starts. It also waits if you happen to be running a rehearsal, showing a banner that says the scheduled time has passed and the real exam has not begun; leaving the rehearsal starts it at once.",
    },
    {
      question: "What do students see before a scheduled live test opens?",
      answer:
        "A countdown reading \"Starts in\" with minutes and seconds ticking down, an hours field as well when there is more than an hour to go, and the scheduled time written out in their own local time. It runs on a server-corrected clock rather than the phone's, so two students sitting together see the same number. Past zero it never shows a negative figure - it switches to \"Starting shortly\" instead. With no start time set, they see an open-ended \"waiting for your teacher to start\" and nothing else.",
    },
    {
      question: "Does MockSetu send students a reminder before a scheduled test?",
      answer:
        "No. There are no reminder emails, no SMS and no WhatsApp messages about a test; the only mail the product sends is transactional account email for signup and password reset. The scheduled time shows up for anyone holding the link or the code - in the join box and again in the waiting room - and nowhere else, so announcing the time, and announcing any change to it, is on you. Send the join link or the eight-character code on whatever channel your batch actually reads.",
    },
    {
      question: "What happens to a student who joins after the live test has started?",
      answer:
        "They come in on the question the room is currently on and carry on from there, so a latecomer is following within moments rather than shut out. What they cannot recover is the questions already closed - a live session runs at one shared pace, and a closed question does not reopen for one person or for the room. Announcing a join window a little before the start is the cheapest fix for this.",
    },
  ],
};

export default post;
