/**
 * liveSounds.ts
 * -------------
 * Tiny WebAudio cues for the live exam player — no audio assets.
 * The AudioContext is created lazily and resumed on the first user
 * gesture (browser autoplay policies suspend it until then).
 * All playback errors are swallowed: sounds are best-effort only.
 */

let ctx: AudioContext | null = null;

let muted = false;
try {
  muted = localStorage.getItem("liveExamMuted") === "1";
} catch {
  /* storage unavailable */
}

function getCtx(): AudioContext | null {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

// Resume the context on the first user gesture after a suspend.
if (typeof window !== "undefined") {
  const resume = () => {
    try {
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("pointerdown", resume, { passive: true });
  window.addEventListener("keydown", resume);
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("liveExamMuted", m ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isMuted(): boolean {
  return muted;
}

type ToneOpts = {
  freq: number;
  at: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
};

function tone(ac: AudioContext, { freq, at, duration, type = "sine", gain = 0.12 }: ToneOpts): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + at;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Short pleasant two-tone: a new question was unlocked. */
export function playUnlockDing(): void {
  if (muted) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    tone(ac, { freq: 660, at: 0, duration: 0.15 });
    tone(ac, { freq: 990, at: 0.12, duration: 0.22 });
  } catch {
    /* ignore */
  }
}

/** Soft click for the final seconds of the countdown. */
export function playTick(): void {
  if (muted) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    tone(ac, { freq: 1200, at: 0, duration: 0.05, type: "square", gain: 0.04 });
  } catch {
    /* ignore */
  }
}

/** Rising arpeggio: the student's answer was correct. */
export function playCorrectChime(): void {
  if (muted) return;
  try {
    const ac = getCtx();
    if (!ac) return;
    tone(ac, { freq: 523.25, at: 0, duration: 0.18 });
    tone(ac, { freq: 659.25, at: 0.11, duration: 0.18 });
    tone(ac, { freq: 783.99, at: 0.22, duration: 0.3 });
  } catch {
    /* ignore */
  }
}
