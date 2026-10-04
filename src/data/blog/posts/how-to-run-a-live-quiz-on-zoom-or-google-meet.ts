import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-run-a-live-quiz-on-zoom-or-google-meet",
  title: "How to Run a Live Quiz for Online Batches on Zoom or Google Meet",
  metaTitle: "Live Quiz on a Zoom or Google Meet Class | MockSetu",
  metaDescription:
    "Run a live quiz beside your Zoom or Meet class: share the big-screen window only, keep the control room private, and read a room you cannot see.",
  keywords:
    "live quiz on zoom class, live quiz google meet, online batch quiz, live quiz for online classes, screen share quiz, live exam zoom, quiz for online coaching batch, interactive quiz online class india",
  excerpt:
    "Run the quiz beside the call, not inside it. Share one window, keep the control room to yourself, and let the answer bars tell you whether anyone is still there.",
  publishedAt: "2026-10-18",
  updatedAt: "2026-10-18",
  readingMinutes: 8,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx. Never add "SSC MTS" or "JEE Main" here - those
    // tags win the match and send a paper setter to a student pillar.
    "For Creators",
    "Live Exam",
    "online classes",
    "live quiz",
    "student engagement",
  ],
  hero: {
    eyebrow: "Live Exam",
    h1: "How to Run a Live Quiz for Online Batches on Zoom or Google Meet",
    lede: "Run the quiz beside the call, not inside it - one window shared, one window never shared, and a set of readouts that replace the room you cannot see.",
  },
  content: [
    {
      type: "p",
      text: "Run the quiz beside the call, not inside it. Open the live exam's big-screen view in its own browser window, share that one window in Zoom or Google Meet, and let students answer on their own device with the eight-character join code. The call carries your voice; the exam carries the answers and the clock. What must never reach the shared screen is the control room - that window has real names, confusion counts and the answer key on it.",
    },
    {
      type: "p",
      text: "This is the online twin of [running a live quiz in class with students' phones](/blog/how-to-conduct-a-live-quiz-in-class-with-students-phones), and most of it still holds. What changes is that you cannot read the room. No face is a signal, silence means nothing, and the only honest evidence your batch is still there is the data on your screen.",
    },
    {
      type: "h2",
      text: "Share One Window, Not Your Whole Screen",
    },
    {
      type: "p",
      text: "The control room and the big screen are two separate pages on purpose, and the product opens the second as its own browser window. \"Open big screen\" launches the projector view into a named window - click it again and it focuses that window rather than making a second one. It is available before you go live, so the share can be set up while students are still arriving.",
    },
    {
      type: "p",
      text: "Sharing the whole desktop instead is the mistake that ends a session. Notifications land on it. Other tabs are one keystroke away. And the moment you glance at the control room to check how many have answered, the batch reads the answer key over your shoulder.",
    },
    {
      type: "ul",
      items: [
        "Open the control room and click Open big screen. A second window opens on the lobby.",
        "Press f on that window for fullscreen, so no bookmarks bar travels into the stream. The control fades once you stop moving the mouse.",
        "In Zoom or Meet, choose to share a window and pick that one by name. Never the entire screen.",
        "Check what the meeting says it is sharing before you unlock question one, not after.",
        "Keep the control room on a second monitor, or behind the shared window if you have one screen.",
      ],
    },
    {
      type: "h2",
      text: "The Control Room Is the One Screen You Never Cast",
    },
    {
      type: "p",
      text: "The two screens are allowed to know different things. The big screen loads questions from a student-facing view with no correct-answer column in it at all, and the key arrives separately only once the server's clock has passed that question's deadline. It cannot leak an answer early; there is nothing on the page to leak. The optional reveal - the right choice turning green when answers lock - stays off until you switch it on.",
    },
    {
      type: "p",
      text: "The control room is the opposite. It reads the real participant table, so standings there carry real names even while the room sees nicknames, and the readouts beside them name individual behaviour: how fast the wrong answers came in, how many pressed the confusion button, which wrong choice the room has settled on. A batch learns to game those numbers the second it can see them.",
    },
    {
      type: "quote",
      text: "The call carries your voice. The big screen carries the question. The control room carries everything the room is not allowed to know - and it is the one window you never share.",
    },
    {
      type: "h2",
      text: "Two Devices, One Tab, or a Split Screen",
    },
    {
      type: "p",
      text: "Online batches arrive in three setups. Two devices is the best: the call on a laptop, the quiz on a phone, nothing competing for the screen. Put \"keep your phone next to you\" in the joining message, not in your voice at question one.",
    },
    {
      type: "p",
      text: "One screen with two tabs is the common reality, and nothing punishes it. A MockSetu live exam has no tab-switch detection, no webcam and no lockdown browser, so a student moving between your call and the question is neither flagged nor visible to you. That cuts both ways; the honest half is further down this page.",
    },
    {
      type: "p",
      text: "A split screen - call on one half, quiz on the other - is what to recommend to anyone on a laptop only, and it must be arranged before you start. Each question carries its own countdown, and the editor's default is a minute: a question spent dragging windows into place is a question nobody answers.",
    },
    {
      type: "h2",
      text: "Getting the Code Into the Call",
    },
    {
      type: "p",
      text: "A live exam carries an eight-character code and a join link built from it, and the code box accepts either - paste the whole link in and it is reduced to the eight characters on the way through. The chat panel does the distribution work a classroom has to do out loud.",
    },
    {
      type: "p",
      text: "Paste the link in before you start, then again once the session is running: chat scrolls, and a link sent before the start is buried by the time somebody's wifi drops at question nine. Say in the same message that students sign in first - the link sends anyone not signed in through the [student sign-in page](/student-auth) and back, and an unexpected sign-in screen reads as a broken link. The shared screen is the backstop: a QR square, the code split into two groups of four so it survives being read aloud, and the address written out without the https - all three staying up while questions run, not only in the lobby. For scheduled papers, see [sharing an online test with students](/blog/how-to-share-an-online-test-with-students).",
    },
    {
      type: "h2",
      text: "A Countdown Does More Online Than It Does in a Room",
    },
    {
      type: "p",
      text: "In a classroom, a four o'clock start is enforced by people sitting in front of you. Online it is enforced by nothing. Students trickle in, reach a page saying nothing has started, and message you to ask whether it is working - in the minutes you least need it.",
    },
    {
      type: "p",
      text: "A start time replaces that with a countdown: large digits on the shared screen, and a line on each student's device in their own time zone. It runs on a server-corrected clock rather than the device's, because phones are routinely minutes off and two students comparing countdowns is worse than none. Past zero it stops and reads \"Starting shortly\" rather than going negative. Auto-start is deliberately limited: the session begins on its own only while your control room is open. [Scheduling a live online test with a countdown](/blog/how-to-schedule-a-live-online-test-with-a-countdown) walks through it.",
    },
    {
      type: "h2",
      text: "Reading a Room You Cannot See",
    },
    {
      type: "p",
      text: "In a room you look up. On a call you look at a grid of initials, and three readouts have to do that job instead.",
    },
    {
      type: "ul",
      items: [
        "The head count, from a presence heartbeat - who is in the room now, not who ever joined, so it drops when somebody closes the tab.",
        "The answered meter on the open question. This is the one you act on: still climbing means give the room more time, gone flat means move.",
        "The live answer bars, filling as responses land. Anonymous, in fixed option order, never marked right or wrong - which is what makes them safe to put on the shared window.",
      ],
    },
    {
      type: "p",
      text: "The confusion button points the other way. A student taps it and nothing visible happens - no count, no \"six others feel this way\", just a tick - and that silence is why the quiet ones use it. The number lands in your control room only. On a call, where nobody will unmute to say they are lost, it is the closest thing to a raised hand.",
    },
    {
      type: "h2",
      text: "Latecomers, Dropped Calls and Weak Connections",
    },
    {
      type: "p",
      text: "A student who joins after you have begun comes in on the question the room is on. Everything before it is marked as missed on their rail and cannot be answered later - which is half of why the countdown earns its place. Say so at the start, or somebody spends question four hunting for question one.",
    },
    {
      type: "p",
      text: "A student who disconnects and returns lands wherever the room is, earlier answers intact, because responses are stored on the server and not in the tab. A connection too weak to hold a realtime channel is not fatal either - the room falls back to polling, so that screen runs a few seconds behind rather than never updating. One case has no recovery: somebody who was never in the room cannot join after you end the session, because enrolling them then would file a zero-score attendee into the standings and the report's head count.",
    },
    {
      type: "h2",
      text: "What a Live Quiz on a Call Will Not Do",
    },
    {
      type: "p",
      text: "Say this to yourself before a parent says it to you. There is no proctoring of any kind - no webcam, no lockdown browser, no tab-switch detection - and no question shuffling or limit on attempts. Published papers are public: no paywall, no private delivery to one batch, no custom domain. A live room is gated by its code, and a code stops being a secret the moment it is in a chat window. [Reducing cheating without proctoring](/blog/how-to-reduce-cheating-in-online-tests-without-proctoring) is the argument for what to do instead.",
    },
    {
      type: "p",
      text: "Nothing notifies your students either. No email, SMS or WhatsApp about a session - the only way anyone learns it is happening is the message you send. (Account email for signup and password reset does go out; that is the extent of it.) There is no CSV or Excel export of results, no per-student report card, no certificates. And a very large sitting is the wrong shape for one live room: when head count is the point, run it as a scheduled mock taken on each student's own clock, the way the papers in the [public mock test library](/marketplace) are built.",
    },
    {
      type: "h2",
      text: "The Run Sheet",
    },
    {
      type: "p",
      text: "Rehearse first. The control room can run the whole exam against a simulated class using the real buttons, with nothing written to the database and nobody notified - which is where you find out a question needs more time than you gave it.",
    },
    {
      type: "ul",
      items: [
        "Publish the exam. Go Live only appears on a published one, and the share button refuses a draft. Publishing also runs a readiness check that blocks real problems - no questions, a blank one, a missing answer.",
        "Fix the per-question seconds in the editor. Each question carries its own limit, and the editor's field runs from five seconds to ten minutes.",
        "Set the start time and paste the join link into the chat the day before, telling students to sign in early and keep a second device ready.",
        "Open the control room, open the big screen, share only that window, and confirm what the meeting is actually sharing.",
        "Walk the session settings before question one: names hidden or shown, standings to everyone, to just you, or off, choices on the shared screen or on phones only, reveal on or off.",
        "Watch the answered meter rather than the clock - add thirty or sixty seconds while it climbs, end the question early once it is flat, and use the five-second undo if you unlock one too soon.",
        "End the session, then read the report: [how to read a live exam report](/blog/how-to-read-a-live-exam-report) covers median answer time, who dropped off, and who to check on tomorrow.",
      ],
    },
    {
      type: "p",
      text: "MockSetu is free and takes no card. [Everything a creator can build](/for-creators) - live rooms, scheduled mocks, bilingual papers, a listing in the public library - sits behind one account. A live quiz on a video call answers the one question a recorded lecture never does: is this batch actually following you?",
    },
  ],
  faqs: [
    {
      question: "How do I run a live quiz during a Zoom or Google Meet class?",
      answer:
        "Run it beside the call rather than inside it. Open the live exam's control room, click Open big screen so the projector view launches in its own browser window, and share only that window in Zoom or Meet. Students answer on their own device - ideally a phone, with the call on the laptop - using the eight-character join code or the join link you paste into the meeting chat. Never share your entire screen, because the control room beside it shows real names and the answer key.",
    },
    {
      question: "Which window should I screen-share, and which one must stay private?",
      answer:
        "Share the big screen. It is a separate page that loads questions from a student-facing view with no correct-answer column, and it cannot show a key before the question's deadline has passed on the server. Keep the control room private: it reads the real participant table, shows real names even when the room sees nicknames, and carries creator-only readouts that name individual behaviour, including how many students flagged confusion. Choosing \"share a window\" rather than \"entire screen\" is what keeps the two apart.",
    },
    {
      question: "What if a student joins late or their internet drops mid-quiz?",
      answer:
        "A latecomer enters on the question the room is currently on; earlier questions are marked as missed on their rail and cannot be answered afterwards. A student who disconnects and returns lands where the room is with their earlier answers intact, because responses are stored server-side. A connection too weak for a realtime channel falls back to polling, so that student runs a few seconds behind rather than getting stuck. Somebody who was never in the room, though, cannot join once you have ended the session.",
    },
    {
      question: "Can I stop students switching tabs to search for answers during a live quiz?",
      answer:
        "No. MockSetu has no proctoring of any kind - no webcam monitoring, no lockdown browser and no tab-switch detection - so a student moving between your call and another tab is neither blocked nor reported to you. There is also no question shuffling and no attempt limit. What genuinely helps on a call is a short timer on each question, questions that need working rather than recall, and treating the quiz as a teaching instrument rather than an examination.",
    },
    {
      question: "Do my students need an account to join a live quiz?",
      answer:
        "Yes. The join link sends anyone who is not signed in to the student sign-in page and returns them to the room afterwards, so it is worth saying so in your chat message - an unexpected sign-in screen is usually read as a broken link. Nothing else notifies them: there is no email, SMS or WhatsApp about a session, so the message you post and the code on the shared screen are the only two ways anyone finds the room.",
    },
  ],
};

export default post;
