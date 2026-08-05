/**
 * LiveExamPresent.tsx — the focus screen.
 *
 * Why this exists as a separate page
 * ---------------------------------
 * The control room used to do two incompatible jobs at once. It is a dense
 * cockpit designed for one person a foot from the screen, and it was also
 * whatever the class saw when the creator plugged in HDMI. The old code knew
 * this: the answer key was hidden behind an eye-toggle with a comment saying
 * "creators often screen-share this page". That toggle was a patch over a design
 * gap, and it only covered the key — the leaderboard, every private stat and
 * every error message were still on the projector.
 *
 * Two screens instead of one. The wall gets the show, the laptop keeps the
 * buttons. What follows is the safety property that makes it worth the file:
 * this page cannot render a correct answer while a question is open, has no
 * notification surface mounted (its route sits outside the app's notification
 * layout), and no access to the base participant table. A creator cannot leak
 * the key by forgetting something, because there is nothing here to forget.
 *
 * That first clause survived the arrival of Q15b — the reveal — because it was
 * never a promise about this file's branches. The questions come from
 * live_questions_student, a view with no correct_answer column at all, and the
 * key arrives separately from get_revealed_live_answers, which returns a
 * question's answer only once the server's own clock has passed its deadline,
 * extra time included. The wall asks for the key and is refused until the moment
 * it is entitled to it; the branches below decide only whether to draw what the
 * server already agreed to send.
 *
 * It reads the session from the database itself rather than mirroring the
 * control room. That is what lets the projector keep counting down when the
 * creator accidentally closes the cockpit — and a button here reopens it.
 *
 * Who is actually looking at it
 * ----------------------------
 * Not one audience — three, and the layout is a compromise between them:
 *
 *  1. **A room**, five metres back. Everything has to survive that distance, so
 *     type is measured to fill the frame per question (useFitText) and there is
 *     exactly one number per row.
 *  2. **A livestream**, watched on phones at 360p. This is why the frame keeps a
 *     safe margin (stream overlays and TV overscan both eat the outer few percent),
 *     why the depletion bar is six pixels rather than three, why the join panel
 *     spells out a typeable address next to the QR nobody can scan off the screen
 *     they are watching it on, and why every state is named in words rather than
 *     implied by colour alone.
 *  3. **The creator**, standing beside the screen with their back to it. They are
 *     not reading this page — they are performing next to it, driving from the
 *     laptop. So nothing here is interactive that has to be, the rescue and
 *     fullscreen controls fade out after three seconds of stillness, and the
 *     bottom-left corner they habitually stand in front of carries nothing that
 *     matters.
 *
 * Two things the creator decides for all three audiences
 * ----------------------------------------------------
 * **Theme** (Q16). Normally a viewer preference; here nobody looking at the screen
 * can reach the setting, and only the creator knows whether the room is a dark
 * hall or a sunlit classroom with a tired projector. It lives on the exam row and
 * is set from the control room. See lib/live/stageTheme.ts.
 *
 * **Whether the choices appear at all** (Q15). Turning them off is not a cosmetic
 * preference either: it is how you read the options aloud, hold a discussion on
 * the question before anyone has seen them, or keep an answer set off camera on a
 * public stream. When they are off the wall says so explicitly and points the room
 * at their phones — a silent gap under a question reads as a broken projector, and
 * a room that thinks the projector is broken stops answering.
 *
 * **Whether the answer appears when time is up** (Q15b). Off by default, because a
 * key on a projector is a decision about a room and a livestream, not a default.
 * On, the correct choice turns green and is named in words the instant answers
 * lock — which is the moment a room asks "so which was it?" out loud, and the only
 * moment the creator is not looking at their laptop. It is offered only while the
 * choices are drawn: there is nothing to mark otherwise, and "the answer is B"
 * above a wall showing no B is worse than saying nothing at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Maximize2,
  Minimize2,
  MonitorCog,
  Radio,
  Smartphone,
  Trophy,
  Users,
  WifiOff,
} from "lucide-react";
import SEO from "@/components/SEO";
import LiveQuestionBody, { parseLiveQuestionText } from "@/components/live/LiveQuestionBody";
import LiveOption, { optionLetter, type OptionVisual } from "@/components/live/LiveOption";
import PresenterHud from "@/components/live/PresenterHud";
import { StageClock, StageTimerBar, type StageIdleState } from "@/components/live/StageTimer";
import { useLiveTimerPhase, useLiveTimerTarget } from "@/lib/live/timerStore";
import AnswerRiver from "@/components/live/AnswerRiver";
import { useOpenQuestionTally, TALLY_POLL_MS } from "@/hooks/useOpenQuestionTally";
import { tallyOptions } from "@/lib/live/optionTally.js";
import { MomentBanner } from "@/components/live/MomentCard";
import ScheduledCountdown from "@/components/live/ScheduledCountdown";
import { selectMoment } from "@/lib/live/moments.js";
import { fireCelebration, shouldCelebrate } from "@/lib/live/celebrate";
import { fetchLiveMoments, type LiveMoment } from "@/services/liveExamService";
import { useLiveSession } from "@/hooks/useLiveSession";
import { usePeerWindow } from "@/hooks/usePeerWindow";
import { useFitText } from "@/hooks/useFitText";
import { controlWindowName } from "@/lib/live/presentChannel";
import {
  readStageTheme,
  stageVars,
  writeStageTheme,
  type StageTheme,
} from "@/lib/live/stageTheme";
import {
  fetchAllLiveQuestionsStudent,
  fetchLiveExam,
  fetchPublicLeaderboard,
  fetchRevealedAnswers,
  type LiveExam,
  type LiveParticipant,
  type LiveQuestion,
} from "@/services/liveExamService";

/** Milliseconds of stillness before the rescue affordance fades out. */
const CHROME_IDLE_MS = 3000;

/**
 * Line length, in ems of the measured question size.
 *
 * The old wall let the question run the full width of the frame, which on a 16:9
 * projector is ninety characters a line — around double what anyone can track
 * comfortably, and the reason a long question felt harder to read at 60px than a
 * short one did at 40. Because the cap is in ems it scales with the measured
 * size, so the wrap points stay put and the fit search only ever trades height.
 */
const QUESTION_MEASURE = "34em";

/**
 * The answer river's own type size — and the reason it is a viewport clamp rather
 * than the measured question size, which is what it obviously "should" be.
 *
 * The river sits BESIDE the measured box in the same flex column, so its height is
 * subtracted from the space the fit search is choosing a size to fit. Sizing it
 * from `fit.fontSizePx` therefore closed a loop: a bigger question made a taller
 * river, a taller river made a shorter box, a shorter box made a smaller question,
 * a smaller question made a shorter river — and round again once per debounce. The
 * wall pulsed between huge and tiny, continuously, for the length of every
 * question. (useFitText now also refuses to be driven like that, but the honest
 * fix is here: nothing that changes the frame may be sized from what the frame
 * decided.)
 *
 * A clamp on viewport height is the right independent variable anyway. The river
 * is secondary information, and it should hold one size while the question above
 * it grows and shrinks — not compete with it.
 */
const RIVER_SIZE = "clamp(1.1rem, 2.6vh, 2.4rem)";

/**
 * Q15b: how long after the local clock says "locked" to ask for the key.
 *
 * The server holds a question's answer back through a two-second grace window on
 * top of the timer, so an immediate request is answered with nothing. This is the
 * fallback path anyway — the reveal normally arrives with the analytics push,
 * which fires at the same moment — and it exists because the projector is
 * precisely the screen that must not depend on a realtime channel staying up.
 */
const REVEAL_FETCH_DELAY_MS = 2400;

/** Bounded, so a question whose key never resolves cannot poll for its whole life. */
const REVEAL_FETCH_ATTEMPTS = 4;

/**
 * Is option `index` part of this question's answer?
 *
 * correct_answer is the option's position, stored as JSON — a scalar for a single
 * answer and an array for a multi-select. Compared as strings because the two
 * sides have been through JSONB and back: a key written as the number 2 and one
 * written as "2" are the same answer, and a projector is not the place to discover
 * that they were not.
 *
 * The student screen carries a broader version of this (it also has to compare
 * one student's whole selection against the key). This is the half a wall needs.
 */
function isOptionInAnswer(index: number, correct: unknown): boolean {
  if (correct === null || correct === undefined) return false;
  if (Array.isArray(correct)) return correct.some((c) => String(c) === String(index));
  return String(correct) === String(index);
}

export default function LiveExamPresent() {
  const { creatorId, liveExamId } = useParams();

  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moments, setMoments] = useState<LiveMoment[]>([]);
  /**
   * Last celebrate sequence acted on. Starts null so the FIRST observation only
   * establishes a baseline — otherwise opening the projector during a session that
   * had already celebrated once would greet the room with confetti.
   */
  const celebratedSeqRef = useRef<number | null>(null);
  /** The rescue controls hide themselves so they never appear in a photo of the wall. */
  const [chromeVisible, setChromeVisible] = useState(true);
  /**
   * Q15b. Correct answers for questions the SERVER considers closed, keyed by
   * question id. Empty whenever the creator has the reveal off — this screen does
   * not hold a key it has no intention of drawing.
   */
  const [revealedAnswers, setRevealedAnswers] = useState<Map<string, unknown>>(new Map());
  /**
   * Whether the wall currently wants a key at all.
   *
   * A ref because the answer depends on session state that is derived further
   * down, and it is read from inside the session callbacks — which run on the
   * push lane, long after the render that set up the fetch.
   */
  const wantsKeyRef = useRef(false);

  // ─── Load ──────────────────────────────────────────────────

  const loadStandings = useCallback(async () => {
    if (!liveExamId) return;
    try {
      // The MASKED view, never the base table — this screen is authenticated as
      // the creator but is pointed at the class, so it gets exactly what a
      // student would get. A creator exemption here would put real names on the
      // wall, which is the one thing privacy mode exists to prevent.
      setLeaderboard(await fetchPublicLeaderboard(liveExamId, 10));
    } catch {
      /* standings are decoration here; the question is the point */
    }
  }, [liveExamId]);

  useEffect(() => {
    if (!liveExamId) return;
    let cancelled = false;

    (async () => {
      try {
        const examData = await fetchLiveExam(liveExamId);
        if (cancelled) return;
        setExam(examData);
        // The student-safe question view: it has no correct_answer column at
        // all, so this page cannot reveal an answer even by accident.
        const qs = await fetchAllLiveQuestionsStudent(
          liveExamId,
          examData.primary_language || "en"
        );
        if (cancelled) return;
        setQuestions(qs);
        void loadStandings();
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Could not open this exam.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liveExamId, loadStandings]);

  // ─── Session ───────────────────────────────────────────────

  const loadMoments = useCallback(() => {
    if (!liveExamId) return;
    void fetchLiveMoments(liveExamId).then(setMoments).catch(() => {});
  }, [liveExamId]);

  /**
   * Q15b. Ask for whatever the server is willing to reveal by now.
   *
   * get_revealed_live_answers is the gate, not this call: it returns a question's
   * answer only once now() has passed that question's deadline — the timer, any
   * A3 extra time, and a two-second grace. Asking early is not a leak, it is an
   * empty result, which is why this can be wired to blunt triggers like a
   * reconnect without reasoning about what the room can see at that instant.
   */
  const loadRevealedAnswers = useCallback(async () => {
    if (!liveExamId || !wantsKeyRef.current) return;
    try {
      setRevealedAnswers(await fetchRevealedAnswers(liveExamId));
    } catch {
      // A new identity for the same contents. The retry below re-arms on this
      // state changing, so without it a single failed request would end the
      // fallback silently — and the fallback exists precisely for the session
      // whose network is misbehaving.
      setRevealedAnswers((prev) => new Map(prev));
    }
  }, [liveExamId]);

  const session = useLiveSession(liveExamId, {
    role: "creator",
    onUnlock: () => setChromeVisible(false),
    /**
     * Analytics landing IS the reveal: the row is computed when the question
     * closes, which is the same instant the server starts handing out its answer.
     * This is the fast path for Q15b; the timed fallback below covers the case
     * where this push never arrives.
     */
    onAnalytics: () => {
      void loadStandings();
      loadMoments();
      void loadRevealedAnswers();
    },
    onEnded: () => {
      void loadStandings();
      // Ending the session reveals every remaining answer at once, including the
      // question still on the wall.
      void loadRevealedAnswers();
    },
    onReconnect: () => {
      void loadStandings();
      void loadRevealedAnswers();
    },
    /**
     * A10 undo. The creator took an unlock back, so the server re-hides the
     * reopened question's answer — but a copy of it is sitting in this map, and
     * the wall would go on drawing a key for a question that is about to be open
     * again in front of the room.
     */
    onRewind: (index) => {
      setRevealedAnswers((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        questions.forEach((q, i) => {
          if (i >= index) next.delete(q.id);
        });
        return next;
      });
    },
    /**
     * E1 / E3. The creator hid the names, and this screen is the room.
     *
     * Standings and moments are both name-bearing and both already fetched, so
     * without this the wall keeps the real names until the next reveal — the
     * toggle appears to do nothing on the one surface it exists to protect.
     */
    onSettings: () => {
      void loadStandings();
      loadMoments();
    },
    /**
     * B14 layer 2. Fired from the exam row's monotonic counter rather than a
     * broadcast, so a reconnect cannot replay it.
     */
    onCelebrate: (seq) => {
      if (shouldCelebrate(celebratedSeqRef.current, seq)) {
        fireCelebration("display");
      }
      celebratedSeqRef.current = seq;
    },
  });

  // Establish the baseline from the first sync, so only a genuine increase fires.
  useEffect(() => {
    if (celebratedSeqRef.current === null && !session.loading) {
      celebratedSeqRef.current = session.celebrateSeq;
    }
  }, [session.loading, session.celebrateSeq]);

  const status = session.status ?? exam?.status ?? null;
  const index = session.currentQuestionIndex;
  const question = index >= 0 ? questions[index] : null;
  const isLive = status === "live";
  const isEnded = status === "ended";

  useLiveTimerTarget({
    index,
    unlockedAt: session.unlockedAt,
    extraSeconds: session.extraSeconds,
    timeSeconds: question?.time_seconds ?? null,
    active: isLive,
  });

  const timerPhase = useLiveTimerPhase();
  const timerReady = timerPhase.key === index;
  const isRunning = timerReady && timerPhase.running;
  /** A question that is open but out of time — the reveal window. */
  const isRevealing = isLive && index >= 0 && timerReady && !timerPhase.running;

  // ─── Q2: reopen the cockpit from the wall ──────────────────

  const controlUrl = `/live-exam/${creatorId}/${liveExamId}/control`;

  /**
   * Optimistic settings preview.
   *
   * The control room posts a `config` intent when a projector toggle changes, so
   * the wall reacts on the same keystroke rather than a round trip later. The
   * database row is still the source of truth — the next sync overwrites this —
   * but without it a creator flicking a switch while casting sees nothing happen
   * for a beat and reaches for it again.
   *
   * It matters most for the two settings added last. A theme change that takes a
   * second to land is a second of the wrong frame on camera, and a creator who
   * hides the choices to read them aloud is mid-sentence.
   */
  const [configPreview, setConfigPreview] = useState<{
    showLeaderboard?: boolean;
    showRiver?: boolean;
    showOptions?: boolean;
    revealAnswer?: boolean;
    theme?: StageTheme;
  }>({});

  const { peerOpen, openPeer } = usePeerWindow(
    liveExamId,
    "present",
    controlUrl,
    controlWindowName(liveExamId || ""),
    (intent) => {
      if (intent.t === "config") {
        setConfigPreview((cur) => ({
          showLeaderboard: intent.showLeaderboard ?? cur.showLeaderboard,
          showRiver: intent.showRiver ?? cur.showRiver,
          showOptions: intent.showOptions ?? cur.showOptions,
          revealAnswer: intent.revealAnswer ?? cur.revealAnswer,
          theme: intent.theme ?? cur.theme,
        }));
      }
    }
  );

  // Once the row itself arrives, the preview has served its purpose. Clearing it
  // keeps a stale optimistic value from outliving a change made elsewhere.
  useEffect(() => {
    setConfigPreview({});
  }, [
    session.presentShowLeaderboard,
    session.presentShowRiver,
    session.presentShowOptions,
    session.presentRevealAnswer,
    session.presentTheme,
  ]);

  // ─── Q16: the frame ─────────────────────────────────────────

  /**
   * The theme, and the one place a local copy of a database value is right.
   *
   * The row arrives one round trip after the first paint. Until it does the screen
   * has to guess, and guessing dark is wrong loudly for the creator who chose
   * light: their wall flashes black in front of the room, on camera, on every
   * reload. So the last known answer is remembered per exam and used only while
   * the first sync is in flight.
   */
  const [rememberedTheme, setRememberedTheme] = useState<StageTheme>(() =>
    readStageTheme(liveExamId)
  );
  const theme: StageTheme =
    configPreview.theme ?? (session.loading ? rememberedTheme : session.presentTheme);

  useEffect(() => {
    if (session.loading) return;
    writeStageTheme(liveExamId, session.presentTheme);
    setRememberedTheme(session.presentTheme);
  }, [session.loading, session.presentTheme, liveExamId]);

  // ─── Fullscreen ────────────────────────────────────────────

  /**
   * The only thing on this page the creator drives from the page itself.
   *
   * Everything else lives in the control room by design, but fullscreen cannot:
   * it is a per-window browser state with no database representation, and a
   * projector showing browser tabs and a bookmarks bar along the top of a
   * livestream is the most common way this screen goes wrong. `f` does it from the
   * clicker in their hand.
   */
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()?.catch(() => {});
    } else {
      void document.documentElement.requestFullscreen?.()?.catch(() => {});
    }
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Show the rescue affordance on any movement, then let it fade. A creator can
  // always find it; a photograph of the wall almost never contains it.
  useEffect(() => {
    let timer: number | null = null;
    const wake = () => {
      setChromeVisible(true);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    };
    const onKey = (event: KeyboardEvent) => {
      wake();
      // No modifier: ⌘F and Ctrl+F belong to the browser, and a creator reaching
      // for find-in-page on the projector should get find-in-page.
      if (
        (event.key === "f" || event.key === "F") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", onKey);
    wake();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggleFullscreen]);

  // ─── Fit the question to the frame ─────────────────────────

  /**
   * maxPx is 88 rather than the old 64.
   *
   * The ceiling was doing the shrinking that the measurement is there to do: a
   * six-word question on a 4K wall stopped growing at 64px with two thirds of the
   * frame empty. The binary search already refuses anything that does not fit, so
   * the only job of the ceiling is to stop a three-word question from becoming a
   * poster.
   */
  const fit = useFitText<HTMLDivElement>(question?.id ?? `idle-${index}`, {
    minPx: 20,
    maxPx: 88,
  });

  const optionCount = Array.isArray(question?.options) ? question!.options.length : 0;

  /**
   * A passage question renders its own two-column layout, so the reading-measure
   * cap has to come off — applied to a split pane it squeezes both halves into
   * columns narrower than the passage needs.
   */
  const hasPassage = useMemo(
    () => (question ? parseLiveQuestionText(question.text).hasPassage : false),
    [question]
  );

  /**
   * B9 on the wall.
   *
   * Polled only while a question is genuinely running and the creator has the
   * setting on — the projector is the one surface where an always-on poll would be
   * pure cost, since nobody is looking at it between questions.
   *
   * This is a SECOND tally poller (the control room has its own), which is
   * acceptable because both live in the creator's browser: two requests every
   * 750ms from one machine, not per student.
   */
  const riverEnabled = (configPreview.showRiver ?? session.presentShowRiver) && isRunning;
  const { tally } = useOpenQuestionTally(liveExamId, riverEnabled, TALLY_POLL_MS);

  /**
   * Zero-filled rather than empty while the first poll is in flight.
   *
   * The tally arrives up to 750ms after the question does, and an empty array
   * meant the whole river block appeared a beat late — which changed the height of
   * the box the question had already been measured into, so the question jumped
   * once per question on top of everything else. Rendering the rows immediately,
   * at zero, keeps the frame one shape from the first paint to the last.
   */
  const riverCounts = useMemo(() => {
    if (!question || tally.live_question_id !== question.id) {
      return { counts: new Array(optionCount).fill(0) as number[], totalSelections: 0, unparsed: 0 };
    }
    return tallyOptions(tally.option_tally, optionCount);
  }, [tally, question, optionCount]);

  /** Answered-so-far, for the river's own header. */
  const answeredCount =
    question && tally.live_question_id === question.id ? tally.response_count : 0;

  const showLeaderboard =
    (configPreview.showLeaderboard ?? session.presentShowLeaderboard) &&
    // The projector is what the room sees, so it obeys the leaderboard-visibility
    // setting exactly as a student would: 'private' hides it here too.
    session.leaderboardVisibility === "full" &&
    (isRevealing || isEnded) &&
    leaderboard.length > 0;

  /** Q15. */
  const showOptions = configPreview.showOptions ?? session.presentShowOptions;

  /**
   * Q15b, and the `&& showOptions` is the whole rule.
   *
   * The two settings are stored independently — a creator who hides the choices
   * to talk the room through a question must get their reveal back when they show
   * them again — but a key with nothing to attach it to is not a feature. With the
   * choices off the wall says "answer on your device" and stays out of it.
   */
  const revealAnswer =
    (configPreview.revealAnswer ?? session.presentRevealAnswer) && showOptions;

  wantsKeyRef.current = revealAnswer;

  /**
   * Fetch on the way in; forget on the way out.
   *
   * Dropping the map when the setting goes off is not tidiness. This screen is
   * pointed at a room, and a creator who turns the reveal off has decided the room
   * should not see the key — leaving a fetched copy in memory to be re-drawn by
   * the next re-render is exactly the shape of bug the split-screen design exists
   * to rule out.
   */
  useEffect(() => {
    if (!revealAnswer) {
      setRevealedAnswers((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    void loadRevealedAnswers();
  }, [revealAnswer, loadRevealedAnswers]);

  /**
   * The fallback that makes the reveal work on a dead realtime channel.
   *
   * The answer normally arrives with the analytics push at the instant the
   * question closes. The projector is the one screen that cannot depend on that:
   * it may be an hour into a session on the poll lane, in a hall with hostile
   * wifi, in front of the class. So when the local clock says the question is
   * locked and no key has turned up, it asks — a few times, with backoff, then
   * stops, because a question whose key never resolves must not poll for the rest
   * of its life.
   */
  const revealAttemptsRef = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });

  useEffect(() => {
    if (!revealAnswer || !isRevealing || !question) return;
    if (revealedAnswers.has(question.id)) return;

    const attempts = revealAttemptsRef.current;
    if (attempts.id !== question.id) {
      attempts.id = question.id;
      attempts.n = 0;
    }
    if (attempts.n >= REVEAL_FETCH_ATTEMPTS) return;

    const delay = REVEAL_FETCH_DELAY_MS * (attempts.n + 1);
    const timer = window.setTimeout(() => {
      attempts.n += 1;
      void loadRevealedAnswers();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [revealAnswer, isRevealing, question, revealedAnswers, loadRevealedAnswers]);

  /**
   * The key for the question on screen, or undefined — which is also what a
   * still-running question gets, since the server would not have sent one.
   *
   * Gated on the local reveal state as well as on the map's contents. Two
   * independent conditions for one leak is the right number when the cost of
   * being wrong is a room seeing the answer to a question it is still answering.
   */
  const answerKey =
    revealAnswer && question && (isRevealing || isEnded)
      ? revealedAnswers.get(question.id)
      : undefined;

  /** Which options the key names, as letters, for the line under the grid. */
  const answerLetters = useMemo(() => {
    if (answerKey === undefined || answerKey === null || optionCount === 0) return [];
    const letters: string[] = [];
    for (let i = 0; i < optionCount; i++) {
      if (isOptionInAnswer(i, answerKey)) letters.push(optionLetter(i));
    }
    return letters;
  }, [answerKey, optionCount]);

  const sectionLabel = useMemo(() => question?.section_label || null, [question]);

  /**
   * The moment for the question just revealed.
   *
   * Names arrive already masked from get_live_moments — this screen is
   * creator-authenticated but pointed at a class, so it gets exactly what a
   * student would. No withRealNames here, deliberately.
   */
  const featuredMoment = useMemo(
    () => (index < 0 ? null : selectMoment(moments, index)),
    [moments, index]
  );

  // ─── States before a question is on screen ─────────────────

  if (loadError) {
    return (
      <PresentShell theme={theme} center>
        <div className="flex flex-col items-center gap-4 text-center">
          <WifiOff className="h-12 w-12" style={{ color: "var(--stage-faint)" }} />
          <p className="text-2xl font-semibold" style={{ color: "var(--stage-muted)" }}>
            {loadError}
          </p>
        </div>
      </PresentShell>
    );
  }

  if (!exam) {
    return (
      <PresentShell theme={theme} center>
        <div
          className="h-12 w-12 animate-spin rounded-full border-4"
          style={{
            borderColor: "var(--stage-line)",
            borderTopColor: "var(--stage-muted)",
          }}
        />
      </PresentShell>
    );
  }

  const shareUrl = `${window.location.origin}/live/${exam.share_code}`;

  /**
   * What the clock says when it is not counting.
   *
   * Three different silences, and the old wall rendered two of them as a hollow
   * grey ring with a word in it. "Time up" in particular has a consequence worth
   * spelling out — answers are locked — because the room's next question is always
   * "can I still change mine?".
   */
  const clockIdle: StageIdleState = isEnded ? "done" : isRevealing ? "locked" : "ready";

  /**
   * The choices, hoisted out of the JSX because they are drawn in one of two
   * PLACES rather than in one of two ways.
   *
   * On an ordinary question they sit under the question across the full frame,
   * where a wide landscape wall can afford two columns of them. On a passage
   * question they belong inside the question pane, beside the passage — a room
   * reads passage → ask → choices as one path, and drawn across the full width
   * they land under both panes with the whole frame between a question and the
   * answers to it. Same element, same props, different parent.
   */
  const choices =
    question &&
    optionCount > 0 &&
    (showOptions ? (
        <>
          {/* Two columns is a request, not an instruction: the stylesheet grants
              it only on a frame with the width and the aspect ratio to afford it —
              and refuses inside a passage pane, which has half of one. */}
          <div className="stage-options" data-multi={optionCount > 3}>
            {(question.options as string[]).map((opt, i) => (
              <LiveOption
                key={i}
                index={i}
                html={opt}
                imageUrl={
                  Array.isArray(question.option_image_urls) ? question.option_image_urls[i] : null
                }
                /*
                  Q15b. "correct" and not "correct-picked": those visuals describe
                  a key against one person's answer, and a wall has no answer of
                  its own.

                  `answerKey` is undefined for every question that is still open —
                  not because of this branch, but because the server refuses to
                  send one until the deadline has passed. This line cannot mark an
                  option early even if it is wrong.
                */
                visual={
                  (answerKey !== undefined && isOptionInAnswer(i, answerKey)
                    ? "correct"
                    : "idle") as OptionVisual
                }
                // Spend the tick's width from the first paint, so the reveal
                // cannot rewrap an option and re-fit the question under the
                // room's nose.
                reserveMark={revealAnswer}
                display
              />
            ))}
          </div>

          {/* Colour alone is not a statement — a stream at 360p, a tired projector
              and a colour-blind viewer all lose it. The letter is the fact; the
              green is the emphasis. */}
          {revealAnswer && <AnswerKeyLine letters={answerLetters} />}
        </>
      ) : (
        <ChoicesOnDeviceCard count={optionCount} locked={isRevealing} />
      ));

  return (
    <PresentShell theme={theme}>
      <SEO
        title={`${exam.name} | On screen`}
        description="Projector view for a live exam session."
        path={`/live-exam/${creatorId}/${liveExamId}/present`}
        noindex
      />

      {/* Depletion hairline across the very top — visible from anywhere in a room,
          and the one piece of timer information a phone at 360p can read. */}
      <div className="absolute inset-x-0 top-0 z-20">
        <StageTimerBar />
      </div>

      {/* ─── Header ─── */}
      <header className="stage-head stage-pad relative z-10">
        <div className="flex min-w-0 items-center gap-4">
          <StatusPill isLive={isLive} isEnded={isEnded} />
          {/*
            The section moved under the exam name. On the old header it sat in the
            top right competing with the question counter for the same corner, and
            both lost: a truncated "English Language and Com…" next to a number
            nobody could find.
          */}
          <div className="min-w-0">
            <h1
              className="truncate text-[clamp(1.05rem,1.5vw,1.7rem)] font-semibold leading-tight"
              style={{ color: "var(--stage-fg)" }}
            >
              {exam.name}
            </h1>
            {sectionLabel && (
              <p
                className="truncate text-[clamp(0.8rem,1vw,1.1rem)] leading-tight"
                style={{ color: "var(--stage-muted)" }}
              >
                {sectionLabel}
              </p>
            )}
          </div>
        </div>

        {index >= 0 && (
          <div className="flex shrink-0 items-center gap-4">
            <p className="text-[clamp(1.1rem,1.7vw,1.9rem)] font-bold leading-none tabular-nums">
              <span style={{ color: "var(--stage-fg)" }}>Q{index + 1}</span>
              <span style={{ color: "var(--stage-faint)" }}> / {questions.length}</span>
            </p>
            {/* How far through the set we are — the question a room asks out loud
                every few minutes, answered without anyone having to. */}
            <div
              className="h-2 w-[clamp(4rem,9vw,11rem)] overflow-hidden rounded-full"
              style={{ background: "var(--stage-line)" }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${questions.length > 0 ? ((index + 1) / questions.length) * 100 : 0}%`,
                  background: "var(--stage-muted)",
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ─── Body ─── */}
      <main className="stage-main stage-pad relative z-10">
        <section className="stage-body">
          {!question ? (
            <PresentLobby
              isEnded={isEnded}
              shareUrl={shareUrl}
              shareCode={exam.share_code}
              inRoom={session.onlineCount}
              scheduledStartAt={session.scheduledStartAt}
              serverNow={session.serverNow}
            />
          ) : (
            <>
              {/* Measured to fill, never to scroll. */}
              <div
                ref={fit.containerRef}
                className="min-h-0 flex-1 overflow-hidden transition-opacity duration-300"
                style={{ opacity: fit.measured ? 1 : 0 }}
              >
                {/*
                  fontSize here is the ONLY size in this subtree. Both children
                  are in `display` mode, which makes them emit em-based sizing
                  and inherit from this element — `.live-prose` and KaTeX are
                  em-based throughout, so the measured size scales the prose, the
                  maths, the option letters and the padding together.
                */}
                <div
                  ref={fit.contentRef}
                  style={{ fontSize: fit.fontSizePx, color: "var(--stage-fg)" }}
                >
                  {/* Keyed so the entrance replays per question. The animation is on
                      this inner element and the opacity gate on the container above,
                      because a CSS animation outranks an inline style and would
                      otherwise flash the question at its unmeasured size. */}
                  <div key={question.id} className="stage-rise">
                    <div style={{ maxWidth: hasPassage ? undefined : QUESTION_MEASURE }}>
                      {/*
                        The reading measure comes off for a passage because the
                        split lays out its own two panes and each caps its own
                        line length — applied on top, it squeezes both halves into
                        columns narrower than the passage needs.

                        The choices go INSIDE the body on a passage question (see
                        `choices`), so the ask and the answers to it stay in the
                        same pane.
                      */}
                      {hasPassage ? (
                        <LiveQuestionBody text={question.text} display>
                          {choices}
                        </LiveQuestionBody>
                      ) : (
                        <LiveQuestionBody text={question.text} display />
                      )}
                    </div>

                    {!hasPassage && choices}
                  </div>
                </div>
              </div>

              {/*
                B9. Neutral by construction — AnswerRiver has no `correct` prop
                at all, renders in one colour and keeps options in fixed order,
                so a student watching the wall learns how the room is split and
                nothing about who is right.
              */}
              {riverEnabled && riverCounts.counts.length > 0 && (
                // fontSize is RIVER_SIZE, deliberately NOT fit.fontSizePx — see the
                // constant. Every em below is an em of that.
                <div className="mt-[0.9em] shrink-0" style={{ fontSize: RIVER_SIZE }}>
                  <div className="mb-[0.5em] flex items-baseline justify-between gap-[1em]">
                    <p
                      className="text-[0.62em] font-bold uppercase tracking-[0.16em]"
                      style={{ color: "var(--stage-faint)" }}
                    >
                      How the room is answering
                    </p>
                    {/* Four empty bars and nothing else read as a broken widget. The
                        count says the wall is listening even before the first answer
                        lands, which is most of the time a room spends looking at it. */}
                    <p
                      className="shrink-0 text-[0.62em] font-semibold tabular-nums"
                      style={{ color: "var(--stage-muted)" }}
                    >
                      {answeredCount > 0
                        ? `${answeredCount} of ${Math.max(session.onlineCount, answeredCount)} answered`
                        : "waiting for the first answer"}
                    </p>
                  </div>
                  <AnswerRiver
                    counts={riverCounts.counts}
                    // The question-guarded count, not the raw poll: the tally
                    // deliberately keeps its last value across a question boundary,
                    // and a stale denominator under fresh zeroes is a wrong number.
                    responders={answeredCount}
                    roomSize={session.onlineCount}
                    isMulti={
                      question?.answer_type === "multi" || question?.answer_type === "multi-select"
                    }
                    display
                  />
                </div>
              )}
            </>
          )}
        </section>

        {/*
          ─── The rail: the clock, then whatever the room needs between questions ───

          Beside the question on a wide landscape frame, in a row underneath it on
          anything else — a portrait stream, a rotated monitor, a narrow window. The
          stylesheet owns that decision (see .stage-rail), because it depends on the
          frame's aspect ratio and not on any state this component holds.

          Absent before the first question. The lobby is a pre-show — a countdown and
          one large join panel, centred — and a rail beside it would put a second copy
          of the same QR and code on the wall next to a clock that has nothing to
          count. Two join panels is worse than one at any size.
        */}
        {question && (
          <aside className="stage-rail">
            {/* Capped in CSS, because the rail is a percentage of a frame that might
                be 4K and a clock the size of a dinner plate is not more legible. */}
            <div className="stage-clock">
              <StageClock idle={clockIdle} />
            </div>

            {/* B14 layer 2 — between questions only, so it never competes with a
                question the room is trying to read. */}
            {(isRevealing || isEnded) && featuredMoment && (
              <div className="stage-rail-grow stage-rail-optional">
                <MomentBanner moment={featuredMoment} />
              </div>
            )}

            {showLeaderboard && (
              <div className="stage-card stage-rail-grow stage-rail-optional min-h-0 p-4">
                <p
                  className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em]"
                  style={{ color: "var(--stage-faint)" }}
                >
                  <Trophy className="h-4 w-4" style={{ color: "var(--stage-warn)" }} />
                  Standings
                </p>
                <ol className="mt-3 space-y-1.5">
                  {leaderboard.slice(0, 8).map((p, i) => (
                    // p.id, not p.user_id: this screen authenticates as the creator,
                    // who is not a participant, so under privacy mode every row's
                    // user_id comes back NULL and every key would collide.
                    <li key={p.id} className="flex items-center gap-3">
                      <span
                        className="w-7 shrink-0 text-right text-lg font-bold tabular-nums"
                        style={{ color: "var(--stage-muted)" }}
                      >
                        {p.rank ?? i + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-lg font-medium"
                        style={{ color: "var(--stage-fg)" }}
                      >
                        {p.display_name}
                      </span>
                      <span
                        className="shrink-0 text-lg font-bold tabular-nums"
                        style={{ color: "var(--stage-good)" }}
                      >
                        {p.total_correct}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/*
              Joining stays on screen for the whole session rather than only in the
              lobby. A room fills up in the first minute; a livestream audience
              arrives continuously for an hour, and every one of them needs the code.
              It shrinks to a single row while a question is running so it is
              available without competing.
            */}
            {/* Pushed to the far end of the rail — the right in a row, the bottom in
                a column. With standings on screen they take the slack instead and
                the auto margin quietly resolves to nothing. */}
            <div className="stage-rail-push shrink-0">
              <PresenterHud
                shareUrl={shareUrl}
                shareCode={exam.share_code}
                inRoom={session.onlineCount}
                variant="present"
                dense={isRunning}
              />
            </div>
          </aside>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="stage-foot stage-pad relative z-10">
        <div
          className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[clamp(0.95rem,1.15vw,1.35rem)] font-semibold"
          style={{ color: "var(--stage-muted)" }}
        >
          <Users className="h-[1.15em] w-[1.15em] shrink-0" />
          <span className="tabular-nums" style={{ color: "var(--stage-fg)" }}>
            {session.onlineCount}
          </span>
          <span>in the room</span>

          <AnswerState isLive={isLive} isEnded={isEnded} isRunning={isRunning} isRevealing={isRevealing} />

          {/* A3, announced to the room. The clock growing without explanation looks
              like a fault; naming it makes it a gift. */}
          {session.extraSeconds > 0 && !isRevealing && (
            <span
              className="rounded-full px-3 py-1 text-[0.85em] font-bold tabular-nums"
              style={{ background: "var(--stage-warn-bg)", color: "var(--stage-warn)" }}
            >
              +{session.extraSeconds}s added
            </span>
          )}
        </div>

        {/*
          Q2 rescue plus fullscreen, in the flow of the footer rather than floating
          over it. As absolutely-positioned chrome they sat on top of the room count
          and clipped it — the corner that is meant to hold nothing important was
          holding two things, overlapping.

          E4: no notification surface is mounted on this route at all (see App.tsx),
          so an error can never pop up on the wall. Transient trouble becomes a quiet
          corner chip instead — visible to the creator, invisible to the back row.
        */}
        <div
          className={`flex shrink-0 items-center gap-2 transition-opacity duration-500 ${
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {session.transport === "poll" && (
            <span
              className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: "var(--stage-warn-line)",
                background: "var(--stage-warn-bg)",
                color: "var(--stage-warn)",
              }}
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span className="stage-chrome-label">Reconnecting</span>
            </span>
          )}

          <ChromeButton
            onClick={toggleFullscreen}
            title={isFullscreen ? "Leave fullscreen (F)" : "Fill the screen (F)"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            <span className="stage-chrome-label">
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </span>
          </ChromeButton>

          <ChromeButton onClick={openPeer} title="The cockpit — buttons, timer controls, private stats">
            <MonitorCog className="h-3.5 w-3.5" />
            <span className="stage-chrome-label">
              {peerOpen ? "Focus control room" : "Open control room"}
            </span>
          </ChromeButton>
        </div>
      </footer>
    </PresentShell>
  );
}

// ─── Pieces ──────────────────────────────────────────────────

/**
 * Full-bleed frame, themed by the creator.
 *
 * It used to be hard-coded dark, with a comment arguing that a projector in a lit
 * classroom is the one surface where the choice is not the viewer's to make. Half
 * of that still holds and is why the theme lives on the exam row rather than in a
 * media query — but it is not the viewer's choice OR ours. A weak projector in
 * daylight cannot render black; it renders grey, and a dark frame there is grey
 * text on a grey wall. The creator is the only party in the building who can see
 * which of the two is true.
 */
function PresentShell({
  theme,
  center = false,
  children,
}: {
  theme: StageTheme;
  /** For the load and error states, which are one element in the middle. */
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`live-stage stage-frame relative w-full ${
        center ? "items-center justify-center" : ""
      }`}
      style={stageVars(theme)}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at top, var(--stage-glow), transparent 60%)",
        }}
      />
      {children}
    </div>
  );
}

/** Live / waiting / finished, in words as well as colour. */
function StatusPill({ isLive, isEnded }: { isLive: boolean; isEnded: boolean }) {
  if (isLive) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-[0.18em]"
        style={{ background: "var(--stage-live-bg)", color: "var(--stage-live-fg)" }}
      >
        <span
          className="live-dot h-2 w-2 rounded-full"
          style={{ background: "var(--stage-live-fg)" }}
        />
        Live
      </span>
    );
  }
  return (
    <span
      className="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-[0.18em]"
      style={{ background: "var(--stage-surface-2)", color: "var(--stage-muted)" }}
    >
      {isEnded ? "Finished" : "Waiting"}
    </span>
  );
}

/**
 * Whether an answer can still be changed, said out loud.
 *
 * The old wall implied this with a grey "Time up" badge that appeared in two
 * places at once — the timer ring and the footer row — and said nothing about
 * consequence. A room does not want to know that a clock reached zero; it wants to
 * know whether it can still change its mind.
 */
function AnswerState({
  isLive,
  isEnded,
  isRunning,
  isRevealing,
}: {
  isLive: boolean;
  isEnded: boolean;
  isRunning: boolean;
  isRevealing: boolean;
}) {
  let label: string | null = null;
  let color = "var(--stage-muted)";

  if (isEnded) label = "Session over";
  else if (isRevealing) {
    label = "Answers locked";
    color = "var(--stage-crit)";
  } else if (isRunning) {
    label = "Answers open";
    color = "var(--stage-good)";
  } else if (isLive) label = "Next question coming";

  if (!label) return null;

  return (
    <span
      className="flex items-center gap-2 rounded-full px-3 py-1 text-[0.85em] font-bold uppercase tracking-[0.1em]"
      style={{ background: "var(--stage-surface-2)", color }}
    >
      <span className="h-[0.45em] w-[0.45em] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** The fading rescue controls. Low profile, findable on any movement. */
function ChromeButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors"
      style={{
        borderColor: "var(--stage-line)",
        background: "var(--stage-surface)",
        color: "var(--stage-muted)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Q15b: the answer in words, under the choices.
 *
 * Two reasons it exists rather than leaving the green card to speak for itself.
 * A livestream at 360p through an encoder that has spent its bitrate on the
 * question, a projector whose colour has drifted, and the eight per cent of any
 * room with a red-green deficiency all receive "one of these boxes is slightly
 * different" and nothing else. And a room five metres back reads a letter faster
 * than it re-scans four boxes looking for the one that changed.
 *
 * It renders from the moment the reveal setting is on and holds its space while
 * it waits, because appearing at the reveal would change the height of the box
 * the question was measured into — and the fix for that is one line of CSS here
 * versus the whole wall zooming at the exact moment the room is looking at it.
 */
function AnswerKeyLine({ letters }: { letters: string[] }) {
  const known = letters.length > 0;
  return (
    <p
      className="mt-[0.6em] text-[0.5em] font-bold uppercase tracking-[0.1em]"
      style={{
        color: "var(--stage-good)",
        // Hidden, never unmounted: the row keeps its height either way.
        visibility: known ? "visible" : "hidden",
      }}
      aria-live="polite"
    >
      {letters.length > 1 ? "Answers: " : "Answer: "}
      <span style={{ color: "var(--stage-fg)" }}>{known ? letters.join(", ") : "—"}</span>
    </p>
  );
}

/**
 * Q15's other half: what the wall says when the choices are off.
 *
 * The setting would be actively harmful without this. A question with a blank
 * space under it reads as a projector that failed to render, and a room that
 * believes the screen is broken stops answering and starts asking. So the space
 * says what is happening and where to look instead — sized in ems like everything
 * else in the measured subtree, so it grows with the question rather than becoming
 * a footnote under a 70px headline.
 */
function ChoicesOnDeviceCard({ count, locked }: { count: number; locked: boolean }) {
  return (
    <div
      className="mt-[0.8em] inline-flex items-center gap-[0.65em] border px-[0.8em] py-[0.65em]"
      style={{
        borderColor: "var(--stage-line)",
        background: "var(--stage-surface)",
        borderWidth: "max(1px, 0.03em)",
        borderRadius: "0.42em",
      }}
    >
      <Smartphone
        style={{ width: "1.5em", height: "1.5em", color: "var(--stage-accent)" }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p
          className="text-[0.6em] font-bold leading-tight"
          style={{ color: "var(--stage-fg)" }}
        >
          Answer on your device
        </p>
        <p
          className="mt-[0.15em] text-[0.42em] font-medium leading-tight"
          style={{ color: "var(--stage-faint)" }}
        >
          {locked
            ? `${count} choices · answers are locked`
            : `${count} choices · tap yours on your phone`}
        </p>
      </div>
    </div>
  );
}

/** Before the first unlock, and after the last question. */
function PresentLobby({
  isEnded,
  shareUrl,
  shareCode,
  inRoom,
  scheduledStartAt,
  serverNow,
}: {
  isEnded: boolean;
  shareUrl: string;
  shareCode: string;
  inRoom: number;
  scheduledStartAt: string | null;
  serverNow: () => number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-3xl"
        style={{ background: "var(--stage-surface-2)" }}
      >
        <Radio className="h-10 w-10" style={{ color: "var(--stage-faint)" }} />
      </div>
      {/* A9 on the wall: a cinema countdown. Nobody has to ask whether it is on. */}
      {!isEnded && scheduledStartAt ? (
        <ScheduledCountdown
          scheduledStartAt={scheduledStartAt}
          serverNow={serverNow}
          display
        />
      ) : (
        <p
          className="max-w-2xl text-[clamp(1.75rem,3.4vw,3rem)] font-semibold leading-snug"
          style={{ color: "var(--stage-muted)" }}
        >
          {isEnded ? "That's the end — well done." : "Waiting for the first question"}
        </p>
      )}
      {!isEnded && (
        <PresenterHud
          shareUrl={shareUrl}
          shareCode={shareCode}
          inRoom={inRoom}
          variant="present"
          className="scale-110"
        />
      )}
    </div>
  );
}
