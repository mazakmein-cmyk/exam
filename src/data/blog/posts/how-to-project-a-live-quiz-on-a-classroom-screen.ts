import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-project-a-live-quiz-on-a-classroom-screen",
  title: "How to Project a Live Quiz on a Classroom Screen",
  metaTitle: "Project a Live Quiz on a Classroom Screen | MockSetu",
  metaDescription:
    "The projector is its own screen with its own settings: theme, whether the choices appear, the answer reveal on timeout, live bars, standings and the join code.",
  keywords:
    "project quiz on classroom screen, live quiz projector, classroom quiz big screen, live quiz display settings, show quiz on projector, classroom response system india, live exam projector view",
  excerpt:
    "The projector is a separate screen with its own settings. Theme, whether the choices appear on it at all, the reveal when time is up, answer bars, standings - and one firm rule about names.",
  publishedAt: "2026-10-17",
  updatedAt: "2026-10-17",
  readingMinutes: 9,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Live Exam",
    "classroom quiz",
    "projector setup",
    "live teaching",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Project a Live Quiz on a Classroom Screen",
    lede: "The big screen is a separate window with its own settings, opened from the control room. Here is what each of those settings changes in the room, and the one thing you should never put on a wall.",
  },
  content: [
    {
      type: "p",
      text: "The big screen is not a mirror of your control room. It is a separate page at its own address, opened from the control room with a button labelled Open big screen, and it carries its own settings. Before the first question goes up you are deciding five things about that screen: the theme, whether the answer choices appear on it at all, whether the correct answer is revealed when the timer ends, whether live answer bars run while a question is open, and whether standings appear between questions.",
    },
    {
      type: "p",
      text: "This is the big-screen half of a live session. The device side of it is covered in [running a live quiz on students' phones](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones), getting a scattered group into the room at the same minute is [scheduling a live test with a countdown](/blog/how-to-schedule-a-live-online-test-with-a-countdown), and what you do with the session afterwards is [reading a live exam report](/blog/how-to-read-a-live-exam-report).",
    },
    {
      type: "h2",
      text: "Two Screens, Not One",
    },
    {
      type: "p",
      text: "The control room is a cockpit: dense, built for one person a foot from it, and full of things a class must never see - the answer key, every real name, every error message. The projector view is a different page, and because its window is named, pressing the button again focuses the wall rather than opening a second copy.",
    },
    {
      type: "p",
      text: "The split is structural, not careful. The wall loads its questions from a view with no correct-answer column in it, and the key arrives from a separate call that refuses until the server's own clock has passed that question's deadline. No notification surface is mounted on that route, so a toast cannot land on the wall. You cannot leak the key by forgetting to hide something, because there is nothing there to forget.",
    },
    {
      type: "p",
      text: "The wall reads the session from the database, not from your laptop, so accidentally closing the control room mid-lesson does not stop the projector - it keeps counting down and carries a button to reopen the cockpit. That button and the fullscreen control beside it fade out after three seconds of stillness.",
    },
    {
      type: "h2",
      text: "Dark or Light Is a Decision About the Room",
    },
    {
      type: "p",
      text: "Theme is normally a viewer preference. On a projector nobody looking at the screen can reach the setting, so it lives on the exam row and is set from the control room by the only person who knows what the room is like. It defaults to dark, right in a dim hall where the projector's own light supplies the contrast.",
    },
    {
      type: "p",
      text: "Switch to light when the room has daylight in it or the projector is old. A weak projector cannot make black - it makes grey - so a dark frame in a bright classroom becomes grey text on a grey wall, and that is the failure people blame on the quiz rather than on the bulb. Neither theme's background is pure black or pure white, because both ends clip and band once a stream encoder gets hold of them.",
    },
    {
      type: "ul",
      items: [
        "Open the big screen on the machine actually plugged into the projector, then press F for fullscreen.",
        "Pick the theme standing in the room with the projector running, not from your laptop in the staff room.",
        "Read the clock from the back row. If the digits are hard from there, nothing else will be easier.",
        "Note where you will stand. The bottom-left corner of the frame is deliberately kept clear of anything that matters, so stand in front of that, not the clock.",
      ],
    },
    {
      type: "h2",
      text: "Whether the Choices Appear on the Screen at All",
    },
    {
      type: "p",
      text: "This switch is on by default, and turning it off is a teaching decision rather than a cosmetic one. With the choices hidden, the wall carries the question alone and every student reads the options on their own phone. That is how you read the choices aloud at your own pace, hold a discussion before anyone has a list to argue about, or keep an answer set off camera on a stream.",
    },
    {
      type: "p",
      text: "The wall does not go blank when you do it. It draws a card saying Answer on your device, with the number of choices and an instruction to tap one on the phone. That card is why the setting is safe: a silent gap under a question reads as a projector that failed to render, and a room that believes the screen is broken stops answering.",
    },
    {
      type: "h2",
      text: "Revealing the Answer When Time Is Up",
    },
    {
      type: "p",
      text: "This one is off by default, because a key on a projector is a decision about a particular room, not a default. Switched on, the correct choice turns green the instant answers lock - never before - and the letter is also printed in words underneath. Both, not just the colour: projector colour drifts, a compressed stream can lose a tint, and part of any room reads red and green as the same thing.",
    },
    {
      type: "p",
      text: "The reveal is where a quiz turns into a lesson: the second answers lock is the second a room asks \"so which was it?\" out loud. Leave it off when you want to work the options through first - the wall then stays neutral after the timer ends, and nothing on it says which choice was right.",
    },
    {
      type: "p",
      text: "The setting only exists while the choices are drawn. Hide them and the reveal row leaves the menu rather than greying out, because a key with nothing to attach it to is not a feature. Your stored choice survives, so bringing the choices back brings the reveal back as you had it.",
    },
    {
      type: "quote",
      text: "A projector that goes quiet at the exact second a room wants the answer is teaching nothing. Decide before the session whether the wall answers the question, or you do.",
    },
    {
      type: "h2",
      text: "Live Answer Bars, and Standings Between Questions",
    },
    {
      type: "p",
      text: "Two more switches, both on by default. Live answer bars run while a question is open: one bar per option under the heading \"How the room is answering\", with a count of how many have answered so far. They are safe to project by construction rather than by convention - the component that draws them has no notion of a correct answer, holds the options in fixed order and paints every bar one colour. A sharp student at the back learns how the room is split and nothing about who is right.",
    },
    {
      type: "p",
      text: "Standings behave the opposite way: between questions only, never while one is open, and the wall shows the top eight. The projector also obeys the leaderboard setting that governs the students' own screens, so Just me or Off hides it on the wall too. None of this costs you anything afterwards - scores and ranks keep recording whatever the room can see.",
    },
    {
      type: "h2",
      text: "Never Project a Name You Have Not Thought About",
    },
    {
      type: "p",
      text: "Real names are the default: with privacy off, the leaderboard everyone sees carries the name on the student's profile. Hide student names switches the room to a stable pseudonym instead - \"Brave Badger\" and its cousins, the same alias all session - while your own cockpit keeps showing the real name. That is the setting for anything you are streaming or recording.",
    },
    {
      type: "ul",
      items: [
        "Standings carry names between questions. Set the ranking to Just me or Off and they leave the wall; keep it on full with Hide student names on and they stay as pseudonyms.",
        "The highlight card carries a name too, and it puts itself on the wall - no switch, nothing to press. Hide student names covers it; the leaderboard setting does not.",
        "Live answer bars never carry a name. There is nothing in them to hide, in any setting.",
        "Celebrate is confetti, not a name. The chip on your laptop suggests the moment and the button fires the celebration; the card appears either way.",
        "Your control room always shows real names, by design. Do not screen-share it - the projector view exists so you never have to.",
      ],
    },
    {
      type: "p",
      text: "So it is one switch, taken before the session rather than during it. A card naming a student's streak lands warmly in a class that knows each other and reads as exposure on a stream, and the wall cannot tell which room it is in. Hide student names covers the whole wall; the leaderboard controls cover only the leaderboard.",
    },
    {
      type: "h2",
      text: "Make It Readable From the Back",
    },
    {
      type: "p",
      text: "Question type is not a fixed size on the wall. Each question is measured into the frame - the largest size at which the whole thing still fits - so a short question fills the screen and a long comprehension passage shrinks until it fits without scrolling. A projector must never scroll: the audience has no scrollbar and you have your back to the screen. Line length is capped as the type grows, so a wide frame does not stretch a question into lines nobody can follow.",
    },
    {
      type: "p",
      text: "What is left is physical, and it is the part that goes wrong. Fullscreen, so browser furniture is not eating the frame. The right theme for the projector you actually have. One walk to the back row, because the screen measures against the frame and never against how far away anyone is sitting.",
    },
    {
      type: "h2",
      text: "Joining Stays on the Screen All Session",
    },
    {
      type: "p",
      text: "Join instructions never leave the wall. A room mostly fills at the start, but phones die, tabs close and wifi drops for the whole hour, and a late arrival with no code ends up watching a quiz instead of playing it. While a question is open the panel collapses to one quiet row; between questions it opens back out.",
    },
    {
      type: "p",
      text: "The code is drawn larger than the QR square, which looks like a mistake until you have watched a class try to scan a bright projected surface from the back row. Autofocus fails on that often enough that the real fallback - a student typing eight characters - has to get the emphasis. The code is split into two blocks of four and set monospaced so 0 and O cannot be misread, and the join address is spelled out beside the QR, stripped of the scheme and any trailing slash.",
    },
    {
      type: "p",
      text: "One thing belongs before the bell rather than during question one. A student joining for the first time is sent through [student sign-up](/student-auth) and must finish a profile before the join completes, so ask the class to make the account the day before.",
    },
    {
      type: "h2",
      text: "What the Big Screen Will Not Do",
    },
    {
      type: "p",
      text: "The wall is a display, not an invigilator. There is no proctoring of any kind here - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling and no cap on attempts either. Nothing projected polices anything, so plan the session as a lesson rather than a secure examination.",
    },
    {
      type: "p",
      text: "Other limits are better known in advance than discovered on the day. There is no CSV or Excel export of results, no per-student report card and no certificates. There are no SMS or WhatsApp alerts telling a class a test is starting - the product sends account email for signup and password reset, and nothing else. And a very large sitting is better run as a scheduled mock paper than as one live room: a live room is for a room.",
    },
    {
      type: "p",
      text: "If a live session is the wrong shape for what you are running, the same questions work as a mock students sit on their own time. [Everything a creator can build](/for-creators) is free and takes no card, and a published paper appears in the [public library](/marketplace) - which also means published papers are public, with no private or paid delivery to one batch.",
    },
  ],
  faqs: [
    {
      question: "How do I project a live quiz on a classroom screen?",
      answer:
        "Open the live session's control room, then press Open big screen. That opens a separate projector page in its own window - put that window on the projector and press F for fullscreen. The control room stays on your laptop and keeps the answer key, the real names and every error message off the wall. Pressing the button again focuses the projector window rather than opening a second copy of it.",
    },
    {
      question: "Can I hide the answer options on the projector?",
      answer:
        "Yes. Show the answer choices is a switch in the session settings, on by default. Turn it off and the wall carries the question alone while every student reads the options on their own phone - useful when you want to read the choices aloud yourself or keep an answer set off camera. The wall does not go blank: it shows a card saying Answer on your device with the number of choices, so nobody thinks the projector has failed.",
    },
    {
      question: "Will the correct answer show on the big screen when time is up?",
      answer:
        "Only if you switch it on. The reveal is off by default. With it on, the correct choice turns green the moment answers lock and the letter is also printed in words beneath the choices, so colour is never the only carrier. It never shows while a question is still open, and it is offered only while the answer choices are being drawn on the wall - hide those and the reveal row leaves the menu until you bring them back.",
    },
    {
      question: "How do I keep student names off the projector?",
      answer:
        "Turn on Hide student names. It switches the room to stable pseudonyms while your own control room keeps showing real names, and it is the only setting that covers the whole wall. Setting the leaderboard to Just me or Off takes standings off the projector, but the highlight card between questions still names a student, so that setting on its own is not enough. Live answer bars are anonymous in every setting.",
    },
    {
      question: "Does the join code stay on screen for students who arrive late?",
      answer:
        "Yes. The join panel stays on the wall for the whole session rather than only in the lobby, shrinking to one compact row while a question is open. The eight-character code is rendered larger than the QR square because scanning a projected surface from the back row often fails, and the typeable join address is spelled out beside it. Students joining for the first time still need a MockSetu account, so it is worth asking them to sign up before the lesson.",
    },
  ],
};

export default post;
