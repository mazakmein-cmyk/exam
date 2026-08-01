/**
 * LiveExamPresent.tsx — the wall.
 *
 * Why this exists as a separate page
 * ---------------------------------
 * The control room used to do two incompatible jobs at once. It is a dense
 * cockpit designed for one person a foot from the screen, and it was also
 * whatever the class saw when the creator plugged in HDMI. The old code knew
 * this: the answer key was hidden behind an eye-toggle with a comment saying
 * "creators often screen-share this page". That toggle was a patch over a design
 * gap, and it only covered the key — the leaderboard, every private stat and
 * every error toast were still on the projector.
 *
 * Two screens instead of one. The wall gets the show, the laptop keeps the
 * buttons. What follows is the safety property that makes it worth the file:
 * this page has no code path that renders a correct answer while a question is
 * open, no toaster mounted (its route sits outside the app's toaster layout),
 * and no access to the base participant table. A creator cannot leak the key by
 * forgetting something, because there is nothing here to forget.
 *
 * It reads the session from the database itself rather than mirroring the
 * control room. That is what lets the projector keep counting down when the
 * creator accidentally closes the cockpit — and a button here reopens it.
 *
 * Everything on screen has to survive being read from five metres away, so type
 * is measured to fill the frame per question (useFitText) and there is exactly
 * one number per row.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Radio, Users, Trophy, MonitorCog, WifiOff } from "lucide-react";
import SEO from "@/components/SEO";
import LiveQuestionBody from "@/components/live/LiveQuestionBody";
import LiveOption, { type OptionVisual } from "@/components/live/LiveOption";
import PresenterHud from "@/components/live/PresenterHud";
import { TimerBar, TimerRing } from "@/components/live/LiveTimer";
import { useLiveCountdown, useLiveTimerPhase, useLiveTimerTarget } from "@/lib/live/timerStore";
import { useLiveSession } from "@/hooks/useLiveSession";
import { usePeerWindow } from "@/hooks/usePeerWindow";
import { useFitText } from "@/hooks/useFitText";
import { controlWindowName } from "@/lib/live/presentChannel";
import {
  fetchAllLiveQuestionsStudent,
  fetchLiveExam,
  fetchPublicLeaderboard,
  type LiveExam,
  type LiveParticipant,
  type LiveQuestion,
} from "@/services/liveExamService";

/** Milliseconds of stillness before the rescue affordance fades out. */
const CHROME_IDLE_MS = 3000;

export default function LiveExamPresent() {
  const { creatorId, liveExamId } = useParams();

  const [exam, setExam] = useState<LiveExam | null>(null);
  const [questions, setQuestions] = useState<LiveQuestion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LiveParticipant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The rescue button hides itself so it never appears in a photo of the wall. */
  const [chromeVisible, setChromeVisible] = useState(true);

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

  const session = useLiveSession(liveExamId, {
    role: "creator",
    onUnlock: () => setChromeVisible(false),
    onAnalytics: () => void loadStandings(),
    onEnded: () => void loadStandings(),
    onReconnect: () => void loadStandings(),
  });

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
   * Until now nothing consumed the intent, so the instant preview the control
   * room's comment described did not exist.
   */
  const [configPreview, setConfigPreview] = useState<{
    showLeaderboard?: boolean;
    showRiver?: boolean;
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
        }));
      }
    }
  );

  // Once the row itself arrives, the preview has served its purpose. Clearing it
  // keeps a stale optimistic value from outliving a change made elsewhere.
  useEffect(() => {
    setConfigPreview({});
  }, [session.presentShowLeaderboard, session.presentShowRiver]);

  // Show the rescue affordance on any movement, then let it fade. A creator can
  // always find it; a photograph of the wall almost never contains it.
  useEffect(() => {
    let timer: number | null = null;
    const wake = () => {
      setChromeVisible(true);
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);
    wake();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // ─── Fit the question to the frame ─────────────────────────

  const fit = useFitText<HTMLDivElement>(question?.id ?? `idle-${index}`, {
    minPx: 20,
    maxPx: 64,
  });

  const optionCount = Array.isArray(question?.options) ? question!.options.length : 0;
  const showLeaderboard =
    (configPreview.showLeaderboard ?? session.presentShowLeaderboard) &&
    // The projector is what the room sees, so it obeys the leaderboard-visibility
    // setting exactly as a student would: 'private' hides it here too.
    session.leaderboardVisibility === "full" &&
    (isRevealing || isEnded) &&
    leaderboard.length > 0;

  const sectionLabel = useMemo(() => question?.section_label || null, [question]);

  // ─── States before a question is on screen ─────────────────

  if (loadError) {
    return (
      <PresentShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <WifiOff className="h-12 w-12 text-white/40" />
          <p className="text-2xl font-semibold text-white/80">{loadError}</p>
        </div>
      </PresentShell>
    );
  }

  if (!exam) {
    return (
      <PresentShell>
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white/70" />
      </PresentShell>
    );
  }

  const shareUrl = `${window.location.origin}/live/${exam.share_code}`;

  return (
    <PresentShell>
      <SEO
        title={`${exam.name} | On screen`}
        description="Projector view for a live exam session."
        path={`/live-exam/${creatorId}/${liveExamId}/present`}
        noindex
      />

      {/* Depletion hairline across the very top — visible from anywhere in a room. */}
      <div className="absolute inset-x-0 top-0 z-20">
        <PresentTimerBar />
      </div>

      {/* ─── Header ─── */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-6 px-10 pt-8">
        <div className="flex min-w-0 items-center gap-4">
          {isLive ? (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-rose-500/20 px-4 py-1.5 text-sm font-bold uppercase tracking-[0.18em] text-rose-300">
              <span className="live-dot h-2 w-2 rounded-full bg-rose-400" />
              Live
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold uppercase tracking-[0.18em] text-white/60">
              {isEnded ? "Finished" : "Waiting"}
            </span>
          )}
          <h1 className="truncate text-2xl font-semibold text-white/85">{exam.name}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-6">
          {index >= 0 && (
            <p className="text-2xl font-bold tabular-nums text-white/80">
              <span className="text-white">Q{index + 1}</span>
              <span className="text-white/40"> / {questions.length}</span>
            </p>
          )}
          {sectionLabel && (
            <p className="max-w-[16rem] truncate text-lg text-white/50">{sectionLabel}</p>
          )}
        </div>
      </header>

      {/* ─── Body ─── */}
      <main className="relative z-10 flex min-h-0 flex-1 gap-8 px-10 py-6">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!question ? (
            <PresentLobby
              isEnded={isEnded}
              shareUrl={shareUrl}
              shareCode={exam.share_code}
              inRoom={session.onlineCount}
            />
          ) : (
            <>
              {/* Measured to fill, never to scroll. */}
              <div
                ref={fit.containerRef}
                className="min-h-0 flex-1 overflow-hidden"
                style={{ opacity: fit.measured ? 1 : 0 }}
              >
                {/*
                  fontSize here is the ONLY size in this subtree. Both children
                  are in `display` mode, which makes them emit em-based sizing
                  and inherit from this element — `.live-prose` and KaTeX are
                  em-based throughout, so the measured size scales the prose, the
                  maths, the option letters and the padding together.
                */}
                <div ref={fit.contentRef} className="text-white" style={{ fontSize: fit.fontSizePx }}>
                  <LiveQuestionBody text={question.text} display />

                  {optionCount > 0 && (
                    <div
                      className={`mt-[0.6em] grid gap-[0.4em] ${optionCount > 3 ? "grid-cols-2" : "grid-cols-1"}`}
                    >
                      {(question.options as string[]).map((opt, i) => (
                        <LiveOption
                          key={i}
                          index={i}
                          html={opt}
                          imageUrl={
                            Array.isArray(question.option_image_urls)
                              ? question.option_image_urls[i]
                              : null
                          }
                          // Always "idle". There is deliberately no branch that
                          // could mark an option correct on this screen — the
                          // question row it renders has no correct_answer column.
                          visual={"idle" as OptionVisual}
                          display
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <PresentAnsweredRow inRoom={session.onlineCount} isRevealing={isRevealing} />
            </>
          )}
        </section>

        {/* ─── Right rail: clock, then standings between questions ─── */}
        <aside className="flex w-[300px] shrink-0 flex-col items-center gap-6">
          <PresentTimerRing
            idleLabel={isEnded ? "Done" : index < 0 ? "Ready" : "Time up"}
          />

          {showLeaderboard ? (
            <div className="w-full min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-white/50">
                <Trophy className="h-4 w-4 text-amber-300" />
                Standings
              </p>
              <ol className="mt-3 space-y-1.5">
                {leaderboard.slice(0, 8).map((p, i) => (
                  // p.id, not p.user_id: this screen authenticates as the creator,
                  // who is not a participant, so under privacy mode every row's
                  // user_id comes back NULL and every key would collide.
                  <li key={p.id} className="flex items-center gap-3 text-white/85">
                    <span className="w-7 shrink-0 text-right text-lg font-bold tabular-nums text-white/40">
                      {p.rank ?? i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-lg font-medium">
                      {p.display_name}
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-emerald-300">
                      {p.total_correct}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="w-full">
              <PresenterHud
                shareUrl={shareUrl}
                shareCode={exam.share_code}
                inRoom={session.onlineCount}
                variant="present"
              />
            </div>
          )}
        </aside>
      </main>

      {/* ─── Q2 rescue: low profile, fades out, findable on any movement ─── */}
      <button
        type="button"
        onClick={openPeer}
        className={`absolute bottom-4 left-4 z-30 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3 py-2 text-xs font-medium text-white/70 backdrop-blur transition-opacity duration-500 hover:text-white ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <MonitorCog className="h-3.5 w-3.5" />
        {peerOpen ? "Focus control room" : "Open control room"}
      </button>

      {/*
        E4: no toaster is mounted on this route at all (see App.tsx), so an error
        can never pop up on the wall. Transient trouble becomes a quiet corner
        chip instead — visible to the creator, invisible to the back row.
      */}
      {session.transport === "poll" && (
        <div
          className={`absolute bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200/80 transition-opacity duration-500 ${
            chromeVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <WifiOff className="h-3.5 w-3.5" />
          Reconnecting
        </div>
      )}
    </PresentShell>
  );
}

// ─── Pieces ──────────────────────────────────────────────────

/**
 * Dark, full-bleed frame. Deliberately not theme-aware: a projector in a lit
 * classroom is the one surface where the choice is not the viewer's to make, and
 * a light background washes out to unreadable grey.
 */
function PresentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a12]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.16),transparent_60%)]" />
      {children}
    </div>
  );
}

/** Connected leaves — a tick re-renders these and nothing else on the wall. */
function PresentTimerBar() {
  const { remaining, total, running } = useLiveCountdown();
  return <TimerBar remaining={remaining} total={total} active={running} className="h-1.5" />;
}

function PresentTimerRing({ idleLabel }: { idleLabel: string }) {
  const { remaining, total, running } = useLiveCountdown();
  return (
    <TimerRing
      remaining={remaining}
      total={total}
      active={running}
      size={220}
      strokeWidth={14}
      idleLabel={idleLabel}
      caption={running ? "remaining" : undefined}
    />
  );
}

/**
 * The count, never the names.
 *
 * A number climbing towards the room size is the one live signal a class can
 * watch without it telling them anything about the answer.
 */
function PresentAnsweredRow({
  inRoom,
  isRevealing,
}: {
  inRoom: number;
  isRevealing: boolean;
}) {
  return (
    <div className="mt-6 flex shrink-0 items-center gap-3 text-xl font-semibold text-white/60">
      <Users className="h-6 w-6" />
      <span className="tabular-nums text-white/85">{inRoom}</span>
      <span>in the room</span>
      {isRevealing && (
        <span className="ml-auto rounded-full bg-white/10 px-4 py-1.5 text-base font-bold uppercase tracking-[0.14em] text-white/70">
          Time up
        </span>
      )}
    </div>
  );
}

/** Before the first unlock, and after the last question. */
function PresentLobby({
  isEnded,
  shareUrl,
  shareCode,
  inRoom,
}: {
  isEnded: boolean;
  shareUrl: string;
  shareCode: string;
  inRoom: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/[0.06]">
        <Radio className="h-10 w-10 text-white/50" />
      </div>
      <p className="max-w-2xl text-4xl font-semibold leading-snug text-white/80">
        {isEnded ? "That's the end — well done." : "Waiting for the first question"}
      </p>
      {!isEnded && (
        <PresenterHud
          shareUrl={shareUrl}
          shareCode={shareCode}
          inRoom={inRoom}
          variant="present"
          className="scale-125"
        />
      )}
    </div>
  );
}
