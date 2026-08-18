import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * CreatorJourney — the /for-creators feature story as ONE continuous 3D-styled
 * narrative instead of five disconnected sections.
 *
 * The hero object is the creator's own question paper: it flies in as a raw
 * PDF (Act 1), its questions become building blocks (Act 2), it runs LIVE in
 * front of a class — projector, join code, answers streaming in (Act 3) —
 * its results become data (Act 4), it goes out under the creator's name
 * (Act 5), and students flow to it (Act 6). One object, six transformations —
 * every animation is a logical visual metaphor because the viewer is watching
 * their paper's lifecycle, not decoration.
 *
 * Built as scroll-scrubbed CSS 3D (DOM transforms, zero canvas, zero new
 * dependencies) which buys the fallback for free: the same scene components
 * render as posed stills — settled state, no scrub — for `prefers-reduced-
 * motion`, for small screens, and for anything that can't keep up. Copy is
 * always plain HTML beside the stage, never inside it, so the page reads
 * (and indexes, and screen-reads) identically with the theatre switched off.
 *
 * Motion grammar (every act follows it):
 *   stage (first ~10%)  — the rail title arrives, the scene's target pre-lights
 *   perform (middle)    — the transformation, driven by scroll position
 *   settle (last ~20%)  — motion decays to idle, the act's CTA fades in
 */

/* ─────────────────────── timing helpers ─────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Local progress of a sub-beat: 0 before `a`, 1 after `b`. */
const phase = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The one easing the whole stage uses — nothing may teleport. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ─────────────────────── the six acts ─────────────────────── */

type Act = {
    eyebrow: string;
    title: string;
    copy: string;
    cta: { label: string; to: string };
};

const ACTS: Act[] = [
    {
        eyebrow: "Act 1 · Import",
        title: "Any PDF becomes a question bank.",
        copy: "Drop the paper you already wrote. The MockSetu core reads it — questions, options, images — and hands back a clean, structured, fully editable database. Minutes, not evenings.",
        cta: { label: "Start with your first PDF", to: "/auth" },
    },
    {
        eyebrow: "Act 2 · Build",
        title: "Sections, timers, negative marking — switched on, not coded.",
        copy: "Slot questions into sections. Flip a switch for per-section timers, another for negative marking. Every rule of the real exam, one toggle away.",
        cta: { label: "See the exam builder", to: "/auth" },
    },
    {
        eyebrow: "Act 3 · Go Live",
        title: "Or run it live — the whole class, one room.",
        copy: "Put the question on the projector; students join from their phones with one code. Answers stream onto your screen the second they're locked, and the leaderboard reshuffles in real time. A test becomes an event.",
        cta: { label: "Host a live exam", to: "/auth" },
    },
    {
        eyebrow: "Act 4 · Understand",
        title: "Watch the class think.",
        copy: "When the room closes, the data stays. Every attempt feeds your dashboard: section-wise accuracy, time per question, where the whole class stumbled. Slide a filter and the picture redraws itself.",
        cta: { label: "Explore the analytics", to: "/auth" },
    },
    {
        eyebrow: "Act 5 · Brand",
        title: "Your name on every exam.",
        copy: "Papers carry your byline and verified badge, on a full-screen exam experience students open from one link. Your brand does the teaching — MockSetu just holds the clock.",
        cta: { label: "Publish under your name", to: "/auth" },
    },
    {
        eyebrow: "Act 6 · Grow",
        title: "Students find you.",
        copy: "MockSetu's exam pages already rank for the searches your students make — \"ssc mts previous year paper\", \"free mock test\". Publish to the library and that traffic flows to your papers. No ad budget.",
        cta: { label: "Start creating — it's free", to: "/auth" },
    },
];

/* ─────────────────── shared scene furniture ─────────────────── */

/** Matte-charcoal surface + emerald "alive" accents — one factory, five products. */
const SURFACE = "#151929";
const SURFACE_EDGE = "rgba(255,255,255,0.09)";
const ACCENT = "#10B981";
const ACCENT_SOFT = "rgba(16,185,129,";
const VIOLET = "#6C3EF4";

const StageShell = ({ children, drift = 0 }: { children: React.ReactNode; drift?: number }) => (
    <div
        className="relative w-full h-full rounded-3xl overflow-hidden border border-white/[0.07] bg-[#0A0D1E]"
        style={{ perspective: "1200px" }}
    >
        <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.08]"
            style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
                // The dot grid crawls at a tenth of scroll speed — just enough
                // parallax for the stage to read as a space, not a poster.
                transform: `translateY(${drift * -22}px)`,
            }}
        />
        {/* Glows drift against each other for depth. */}
        <div
            aria-hidden="true"
            className="absolute top-[-30%] left-[30%] w-[420px] h-[320px] rounded-full bg-[#10B981] opacity-[0.07] blur-[100px]"
            style={{ transform: `translate(${drift * -60}px, ${drift * 40}px)` }}
        />
        <div
            aria-hidden="true"
            className="absolute bottom-[-30%] right-[10%] w-[360px] h-[280px] rounded-full bg-[#6C3EF4] opacity-[0.07] blur-[100px]"
            style={{ transform: `translate(${drift * 50}px, ${drift * -35}px)` }}
        />
        {children}
    </div>
);

/** Idle hover for settled objects — wraps INSIDE scrub transforms so the two
    never fight over the same transform property. */
const Float = ({ children, dur = 5, delay = 0, live }: { children: React.ReactNode; dur?: number; delay?: number; live: boolean }) => (
    <div style={live ? { animation: `float ${dur}s ease-in-out ${delay}s infinite` } : undefined}>{children}</div>
);

type SceneProps = {
    /** Local progress through this act, 0..1. Stills pass the settled pose. */
    p: number;
    /** Whether looping ambient animations (pulses, particle streams) may run. */
    live: boolean;
};

/* ───────────────────────── Act 1: Import ─────────────────────────
   A raw PDF flies in from the left, is consumed by the MockSetu core
   (a monolith whose seam lights up while it "thinks"), and re-emerges
   on the right as ordered question tiles inside a tablet frame.        */

/** Deterministic scatter offsets so tiles assemble from "chaos" without Math.random. */
const TILE_SCATTER = [
    [-60, -80], [40, -110], [90, -40], [-100, 30], [70, 90],
    [-40, 110], [110, 60], [-90, -30], [30, 40],
] as const;

const ImportScene = ({ p, live }: SceneProps) => {
    const flight = easeOut(phase(p, 0, 0.32));
    const ingest = easeOut(phase(p, 0.34, 0.48));
    const thinking = phase(p, 0.3, 0.42) > 0 && phase(p, 0.3, 0.62) < 1;

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            {/* The raw PDF. Visible from the act's FIRST frame — an empty stage
                reads as broken — hovering at the wings until scroll sends it in. */}
            <div
                className="absolute"
                style={{
                    transform: `translateX(${lerp(-235, -130, flight) + lerp(0, 105, ingest)}px) rotate(${lerp(-14, -4, flight)}deg) scale(${lerp(1, 0.15, ingest)})`,
                    opacity: (0.55 + 0.45 * flight) * (1 - ingest),
                }}
                aria-hidden="true"
            >
                <Float live={live && ingest === 0} dur={4.5}>
                    <div className="w-[92px] h-[118px] rounded-lg bg-white shadow-2xl shadow-black/50 flex flex-col p-3 gap-1.5">
                        <span className="text-[9px] font-black text-red-500">PDF</span>
                        {[52, 44, 58, 36, 50].map((w, i) => (
                            <span key={i} className="h-1 rounded bg-slate-300" style={{ width: `${w}px` }} />
                        ))}
                    </div>
                </Float>
            </div>

            {/* The MockSetu core — matte monolith, one living seam. The seam
                idles softly even before the paper arrives (pre-light staging). */}
            <div className="absolute" style={{ transform: "translateX(-30px)" }} aria-hidden="true">
                <Float live={live} dur={6} delay={0.8}>
                    <div
                        className="w-[76px] h-[124px] rounded-2xl"
                        style={{
                            background: SURFACE,
                            border: `1px solid ${SURFACE_EDGE}`,
                            transform: "rotateY(-14deg)",
                            boxShadow: thinking
                                ? `0 0 40px ${ACCENT_SOFT}0.35), inset 0 0 24px ${ACCENT_SOFT}0.2)`
                                : `0 20px 40px rgba(0,0,0,0.5), 0 0 18px ${ACCENT_SOFT}0.08)`,
                            transition: "box-shadow 300ms ease",
                        }}
                    >
                        <span
                            className={`absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 ${live ? "animate-pulse" : ""}`}
                            style={{ background: `linear-gradient(180deg, transparent, ${ACCENT}, transparent)`, opacity: thinking ? 1 : 0.45 }}
                        />
                    </div>
                </Float>
            </div>

            {/* The result — a tablet of ordered question tiles */}
            <div
                className="absolute right-[8%] w-[190px] rounded-2xl p-3"
                style={{
                    background: SURFACE,
                    border: `1px solid ${SURFACE_EDGE}`,
                    transform: `rotateY(${lerp(18, 8, phase(p, 0.5, 1))}deg) translateY(${lerp(10, 0, easeOut(phase(p, 0.45, 0.7)))}px)`,
                    boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
                }}
                aria-hidden="true"
            >
                <div className="text-[8px] font-bold tracking-widest uppercase mb-2" style={{ color: ACCENT }}>
                    Question bank
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {TILE_SCATTER.map(([dx, dy], i) => {
                        const t = easeOut(phase(p, 0.5 + i * 0.035, 0.72 + i * 0.035));
                        return (
                            <div
                                key={i}
                                className="h-9 rounded-md flex items-center justify-center text-[8px] font-bold text-white/50"
                                style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: `1px solid ${t > 0.9 ? ACCENT_SOFT + "0.4)" : "rgba(255,255,255,0.08)"}`,
                                    transform: `translate(${lerp(dx, 0, t)}px, ${lerp(dy, 0, t)}px)`,
                                    opacity: t,
                                }}
                            >
                                Q{i + 1}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/* ───────────────────────── Act 2: Build ─────────────────────────
   The question tiles slot into section trays; two physical toggles
   flip on, each igniting a logic pathway whose consequence appears
   on the board — toggle → light → change, the real builder mechanic. */

const TRAYS = ["General Intelligence", "Numerical Aptitude", "English"];

const BuilderScene = ({ p }: SceneProps) => {
    const timerOn = p > 0.56;
    const negOn = p > 0.74;
    const timerPath = easeOut(phase(p, 0.56, 0.68));
    const negPath = easeOut(phase(p, 0.74, 0.86));

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <div
                className="relative w-[420px] max-w-[88%] rounded-2xl p-4"
                style={{
                    background: SURFACE,
                    border: `1px solid ${SURFACE_EDGE}`,
                    transform: `rotateX(${lerp(24, 12, easeOut(phase(p, 0, 0.3)))}deg)`,
                    transformStyle: "preserve-3d",
                    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
                }}
                aria-hidden="true"
            >
                <div className="grid grid-cols-3 gap-3">
                    {TRAYS.map((tray, trayIdx) => (
                        <div
                            key={tray}
                            className="rounded-xl p-2 min-h-[120px]"
                            style={{
                                background: "rgba(255,255,255,0.04)",
                                border: `1px solid ${trayIdx === 0 && timerOn ? ACCENT_SOFT + "0.5)" : "rgba(255,255,255,0.08)"}`,
                                boxShadow: trayIdx === 0 && timerOn ? `0 0 20px ${ACCENT_SOFT}0.15)` : "none",
                                transition: "border-color 300ms ease, box-shadow 300ms ease",
                            }}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[7.5px] font-bold tracking-wide text-white/45 truncate">{tray}</span>
                                {trayIdx === 0 && (
                                    <span
                                        className="text-[7px] font-black px-1 py-px rounded tabular-nums"
                                        style={{
                                            background: ACCENT_SOFT + "0.18)",
                                            color: ACCENT,
                                            opacity: timerOn ? 1 : 0,
                                            transform: `scale(${timerOn ? 1 : 0.6})`,
                                            transition: "all 250ms cubic-bezier(0.34,1.56,0.64,1)",
                                        }}
                                    >
                                        ⏱ 24:00
                                    </span>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                {[0, 1].map((row) => {
                                    const tileIdx = trayIdx * 2 + row;
                                    const t = easeOut(phase(p, 0.04 + tileIdx * 0.07, 0.34 + tileIdx * 0.07));
                                    const stamped = tileIdx === 1 && negOn;
                                    return (
                                        <div
                                            key={row}
                                            className="relative h-8 rounded-md flex items-center px-2 text-[8px] font-bold text-white/55"
                                            style={{
                                                background: "rgba(255,255,255,0.07)",
                                                border: "1px solid rgba(255,255,255,0.09)",
                                                transform: `translateY(${lerp(-120, 0, t)}px) scale(${t < 1 ? lerp(1.06, 1, t) : 1})`,
                                                opacity: t,
                                            }}
                                        >
                                            Q{tileIdx + 1}
                                            {stamped && (
                                                <span
                                                    className="absolute -top-1.5 -right-1.5 text-[7px] font-black px-1 py-px rounded bg-red-500/90 text-white"
                                                    style={{
                                                        transform: `scale(${negOn ? 1 : 0})`,
                                                        transition: "transform 250ms cubic-bezier(0.34,1.56,0.64,1)",
                                                    }}
                                                >
                                                    −0.25
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* The two rule toggles + their logic pathways */}
                <div className="mt-4 flex items-center gap-6">
                    {[
                        { label: "Section timer", on: timerOn, path: timerPath, color: ACCENT },
                        { label: "Negative marking", on: negOn, path: negPath, color: "#EF4444" },
                    ].map(({ label, on, path, color }) => (
                        <div key={label} className="flex-1">
                            <div className="flex items-center gap-2">
                                <span
                                    className="relative w-8 h-[18px] rounded-full shrink-0"
                                    style={{
                                        background: on ? color : "rgba(255,255,255,0.12)",
                                        transition: "background 250ms ease",
                                    }}
                                >
                                    <span
                                        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white"
                                        style={{ left: on ? "16px" : "2px", transition: "left 250ms cubic-bezier(0.34,1.56,0.64,1)" }}
                                    />
                                </span>
                                <span className="text-[8.5px] font-bold text-white/55">{label}</span>
                            </div>
                            <span
                                className="block h-px mt-2 origin-left"
                                style={{
                                    background: `linear-gradient(90deg, ${color}, transparent)`,
                                    transform: `scaleX(${path})`,
                                    boxShadow: path > 0 ? `0 0 8px ${color}` : "none",
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

/* ───────────────────────── Act 3: Go Live ─────────────────────────
   The classroom moment. The projector screen rises with a join code;
   student phones fly in from the wings and lock in answers; each
   answer streams to the screen as a glowing particle (the product's
   actual "answer river"); the distribution bars fill live and the
   leaderboard reshuffles while everyone watches.                       */

/** Phones fan out along the bottom; each locks a different option. */
const LIVE_PHONES = [
    { x: -168, option: 1, stagger: 0 },
    { x: -84, option: 1, stagger: 0.05 },
    { x: 0, option: 2, stagger: 0.1 },
    { x: 84, option: 1, stagger: 0.15 },
    { x: 168, option: 3, stagger: 0.2 },
];

/** Final answer distribution on the projector (option B is the crowd pick). */
const LIVE_DIST = [0.2, 0.85, 0.45, 0.3];
const OPTION_LABELS = ["A", "B", "C", "D"];

/** Curved particle paths from each phone up into the projector screen. */
const RIVER_PATHS = LIVE_PHONES.map(
    ({ x }) => `M ${300 + x * 1.4},292 C ${300 + x * 1.1},225 ${300 + x * 0.3},175 300,128`
);

const LiveScene = ({ p, live }: SceneProps) => {
    const screenUp = easeOut(phase(p, 0, 0.16));
    const flowing = phase(p, 0.36, 0.5);
    const bars = easeOut(phase(p, 0.42, 0.78));
    const swap = easeOut(phase(p, 0.78, 0.92));
    const answered = Math.floor(lerp(0, 30, phase(p, 0.36, 0.86)));

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            {/* The answer river — one particle per streaming answer */}
            <svg viewBox="0 0 600 300" className="absolute inset-0 w-full h-full" aria-hidden="true">
                {RIVER_PATHS.map((d, i) => (
                    <g key={i} opacity={flowing}>
                        <path d={d} fill="none" stroke={ACCENT} strokeWidth="0.5" strokeOpacity="0.14" />
                        {[0, 1, 2].map((j) => (
                            <circle key={j} r="2" fill={ACCENT} style={{ filter: `drop-shadow(0 0 4px ${ACCENT})` }}>
                                <animateMotion
                                    dur={`${1.7 + i * 0.23}s`}
                                    begin={`${j * 0.55 + i * 0.2}s`}
                                    repeatCount="indefinite"
                                    path={d}
                                    {...(live ? {} : { end: "0s" })}
                                />
                            </circle>
                        ))}
                    </g>
                ))}
            </svg>

            {/* The projector screen */}
            <div
                className="absolute top-[7%] w-[300px] rounded-2xl p-4"
                style={{
                    background: SURFACE,
                    border: `1px solid ${SURFACE_EDGE}`,
                    transform: `translateY(${lerp(34, 0, screenUp)}px) rotateX(${lerp(10, 4, screenUp)}deg)`,
                    opacity: 0.25 + 0.75 * screenUp,
                    boxShadow: `0 30px 60px rgba(0,0,0,0.55), 0 0 ${lerp(0, 34, screenUp)}px ${ACCENT_SOFT}0.12)`,
                }}
                aria-hidden="true"
            >
                <div className="flex items-center justify-between mb-2.5">
                    <span className="inline-flex items-center gap-1.5 text-[8px] font-black tracking-widest text-red-400">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className={`${live ? "animate-ping" : ""} absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75`} />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                        </span>
                        LIVE
                    </span>
                    <span className="text-[8px] font-black tracking-[0.2em] px-1.5 py-0.5 rounded" style={{ background: ACCENT_SOFT + "0.15)", color: ACCENT }}>
                        JOIN · 4X9K2
                    </span>
                </div>
                <div className="text-[9px] font-bold text-white/75 mb-2.5">
                    Q7 · Which number completes the series 3, 7, 15, 31, __?
                </div>
                {/* Live option distribution */}
                <div className="space-y-1.5">
                    {LIVE_DIST.map((share, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                            <span className="w-3 text-[7.5px] font-black text-white/40">{OPTION_LABELS[i]}</span>
                            <div className="flex-1 h-2.5 rounded bg-white/[0.06] overflow-hidden">
                                <div
                                    className="h-full rounded"
                                    style={{
                                        width: `${share * bars * 100}%`,
                                        background: i === 1 ? ACCENT : "rgba(255,255,255,0.18)",
                                        boxShadow: i === 1 && bars > 0.1 ? `0 0 10px ${ACCENT_SOFT}0.4)` : "none",
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-2 text-right text-[7.5px] font-bold text-white/40 tabular-nums">
                    {answered}/30 answered
                </div>
            </div>

            {/* The leaderboard — two rows trade places mid-scene */}
            <div className="absolute right-[5%] top-[30%] w-[104px] space-y-1" aria-hidden="true" style={{ opacity: phase(p, 0.55, 0.7) }}>
                <div className="text-[7px] font-black tracking-widest uppercase text-white/35 mb-1">Leaderboard</div>
                {[
                    { name: "Priya", swapTo: 1 },
                    { name: "Arjun", swapTo: 0 },
                    { name: "Fatima", swapTo: 2 },
                ].map(({ name, swapTo }, i) => (
                    <div
                        key={name}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                        style={{
                            background: SURFACE,
                            border: `1px solid ${(swap > 0.5 ? swapTo : i) === 0 ? ACCENT_SOFT + "0.5)" : "rgba(255,255,255,0.08)"}`,
                            transform: `translateY(${(swapTo - i) * swap * 26}px)`,
                            transition: "border-color 250ms ease",
                        }}
                    >
                        <span className="text-[8px]">{(swap > 0.5 ? swapTo : i) === 0 ? "👑" : "·"}</span>
                        <span className="text-[8px] font-bold text-white/70">{name}</span>
                    </div>
                ))}
            </div>

            {/* The students' phones, arriving from the wings */}
            {LIVE_PHONES.map(({ x, option, stagger }, i) => {
                const arrive = easeOut(phase(p, 0.08 + stagger, 0.3 + stagger));
                const locked = flowing > 0 && phase(p, 0.38 + stagger * 0.6, 0.44 + stagger * 0.6) > 0.5;
                return (
                    <div
                        key={i}
                        className="absolute bottom-[5%]"
                        style={{
                            transform: `translateX(${x}px) translateY(${lerp(90, 0, arrive)}px) rotate(${lerp(x > 0 ? 10 : -10, 0, arrive)}deg)`,
                            opacity: arrive,
                        }}
                        aria-hidden="true"
                    >
                        <Float live={live && arrive === 1} dur={3.5 + i * 0.4} delay={i * 0.3}>
                            <div
                                className="w-[46px] h-[76px] rounded-lg p-1"
                                style={{
                                    background: "#1B2033",
                                    border: `1px solid ${locked ? ACCENT_SOFT + "0.55)" : SURFACE_EDGE}`,
                                    boxShadow: locked ? `0 0 16px ${ACCENT_SOFT}0.3)` : "0 12px 24px rgba(0,0,0,0.5)",
                                    transition: "border-color 200ms ease, box-shadow 200ms ease",
                                }}
                            >
                                <div className="w-full h-full rounded-md bg-[#0B0E1C] p-1 grid grid-cols-2 gap-0.5">
                                    {OPTION_LABELS.map((label, o) => (
                                        <span
                                            key={label}
                                            className="rounded flex items-center justify-center text-[6px] font-black"
                                            style={{
                                                background: locked && o === option ? ACCENT : "rgba(255,255,255,0.06)",
                                                color: locked && o === option ? "#06251B" : "rgba(255,255,255,0.35)",
                                                transform: locked && o === option ? "scale(1.08)" : "scale(1)",
                                                transition: "all 200ms cubic-bezier(0.34,1.56,0.64,1)",
                                            }}
                                        >
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </Float>
                    </div>
                );
            })}
        </div>
    );
};

/* ───────────────────────── Act 4: Understand ─────────────────────────
   The board becomes a floor and a chart stack assembles on it. An
   invisible hand slides the filter; every chart reacts at once.       */

const BARS_A = [42, 66, 30, 78, 55, 70, 46];
const BARS_B = [70, 38, 62, 46, 84, 40, 74];
const DOTS_A = [0.9, 0.35, 0.7, 0.5, 0.85, 0.4];
const DOTS_B = [0.4, 0.9, 0.5, 0.95, 0.45, 0.8];
/** Globe marker positions (percent of the disc). */
const DOT_POS = [[28, 30], [55, 22], [70, 48], [40, 62], [62, 72], [22, 55]] as const;

const AnalyticsScene = ({ p, live }: SceneProps) => {
    const grow = easeOut(phase(p, 0.02, 0.38));
    const slide = easeOut(phase(p, 0.46, 0.84));
    const draw = phase(p, 0.15, 0.55);
    const accuracy = Math.round(lerp(58, 71, slide));

    return (
        <div className="absolute inset-0 flex items-center justify-center gap-6">
            <div
                className="relative w-[300px] max-w-[62%] rounded-2xl p-4"
                style={{
                    background: SURFACE,
                    border: `1px solid ${SURFACE_EDGE}`,
                    transform: "rotateX(8deg) rotateY(-6deg)",
                    boxShadow: "0 30px 60px rgba(0,0,0,0.55)",
                }}
                aria-hidden="true"
            >
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[8px] font-bold tracking-widest uppercase text-white/40">Class performance</span>
                    <span className="text-[9px] font-black tabular-nums" style={{ color: ACCENT }}>
                        {accuracy}% accuracy
                    </span>
                </div>

                {/* Bars — two baked datasets, blended by the filter position */}
                <div className="flex items-end gap-2 h-[90px]">
                    {BARS_A.map((a, i) => {
                        const h = lerp(a, BARS_B[i], slide) * grow;
                        return (
                            <div key={i} className="flex-1 rounded-t-md" style={{
                                height: `${h}%`,
                                background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT_SOFT}0.25))`,
                                boxShadow: `0 0 12px ${ACCENT_SOFT}0.25)`,
                            }} />
                        );
                    })}
                </div>

                {/* A line that draws itself over the bars */}
                <svg viewBox="0 0 100 30" className="absolute left-4 right-4 top-10 w-[calc(100%-32px)] h-[70px] pointer-events-none" preserveAspectRatio="none">
                    <polyline
                        points="0,22 16,12 32,18 48,7 64,14 80,4 100,10"
                        fill="none"
                        stroke={VIOLET}
                        strokeWidth="1.4"
                        strokeDasharray="160"
                        strokeDashoffset={160 - draw * 160}
                        style={{ filter: `drop-shadow(0 0 4px ${VIOLET})` }}
                    />
                </svg>

                {/* The filter — the "virtual hand" is the scroll itself */}
                <div className="mt-4">
                    <div className="flex justify-between text-[7px] font-bold text-white/35 mb-1">
                        <span>Filter: exam type</span>
                        <span>{slide < 0.5 ? "All papers" : "Previous year"}</span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-white/[0.08]">
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${slide * 100}%`, background: ACCENT }} />
                        <span
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg"
                            style={{ left: `calc(${slide * 100}% - 7px)` }}
                        />
                    </div>
                </div>
            </div>

            {/* The reach globe — markers brighten as the filter shifts */}
            <div
                className="relative w-[120px] h-[120px] rounded-full shrink-0 hidden sm:block"
                style={{
                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.1), ${SURFACE})`,
                    border: `1px solid ${SURFACE_EDGE}`,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                    transform: `scale(${lerp(0.7, 1, grow)})`,
                    opacity: grow,
                }}
                aria-hidden="true"
            >
                <span className="absolute inset-3 rounded-full border border-white/[0.06]" />
                {DOT_POS.map(([x, y], i) => (
                    <span
                        key={i}
                        className={`absolute w-1.5 h-1.5 rounded-full ${live ? "animate-pulse" : ""}`}
                        style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            background: ACCENT,
                            opacity: lerp(DOTS_A[i], DOTS_B[i], slide),
                            boxShadow: `0 0 8px ${ACCENT}`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

/* ───────────────────────── Act 5: Brand ─────────────────────────
   An assembly line: a plain exam icon rolls in, the creator's mark
   stamps onto it, and the finished, branded exam lights up on a
   student's phone — your name doing the teaching.                     */

const AppScene = ({ p }: SceneProps) => {
    const rollIn = easeOut(phase(p, 0, 0.26));
    const stampDown = easeOut(phase(p, 0.3, 0.42));
    const stamped = p > 0.42;
    const handoff = easeOut(phase(p, 0.5, 0.68));
    const screenOn = easeOut(phase(p, 0.66, 0.86));

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            {/* Conveyor */}
            <div className="absolute bottom-[24%] left-[8%] right-[45%] h-px bg-white/[0.12]" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="absolute top-1 w-1 h-1 rounded-full bg-white/[0.15]" style={{ left: `${i * 22 + 6}%` }} />
                ))}
            </div>

            {/* The exam icon travelling the line */}
            <div
                className="absolute bottom-[26%] w-[64px] h-[64px] rounded-2xl flex items-center justify-center"
                style={{
                    left: `calc(${lerp(4, 26, rollIn) + lerp(0, 22, handoff)}%)`,
                    background: SURFACE,
                    border: `1px solid ${stamped ? ACCENT_SOFT + "0.6)" : SURFACE_EDGE}`,
                    boxShadow: stamped ? `0 0 24px ${ACCENT_SOFT}0.3)` : "0 12px 24px rgba(0,0,0,0.5)",
                    opacity: rollIn * (1 - phase(p, 0.66, 0.72)),
                    transition: "border-color 200ms ease, box-shadow 200ms ease",
                }}
                aria-hidden="true"
            >
                <span className="text-[10px] font-black" style={{ color: stamped ? ACCENT : "rgba(255,255,255,0.3)" }}>
                    {stamped ? "SA ✦" : "EXAM"}
                </span>
                {/* Impact ring on the stamp beat */}
                <span
                    className="absolute inset-0 rounded-2xl border-2"
                    style={{
                        borderColor: ACCENT,
                        transform: `scale(${stamped ? lerp(1, 1.6, phase(p, 0.42, 0.52)) : 1})`,
                        opacity: stamped ? 1 - phase(p, 0.42, 0.52) : 0,
                    }}
                />
            </div>

            {/* The stamp head carrying the creator's mark */}
            <div
                className="absolute left-[26%] bottom-[42%] w-[52px] h-[70px] flex flex-col items-center"
                style={{
                    transform: `translateY(${lerp(-70, 0, stampDown) - lerp(0, -50, phase(p, 0.44, 0.56))}px)`,
                    opacity: phase(p, 0.2, 0.3) * (1 - phase(p, 0.56, 0.66)),
                }}
                aria-hidden="true"
            >
                <span className="w-2 h-8 rounded-t bg-white/[0.15]" />
                <span
                    className="w-[52px] h-[30px] rounded-lg flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: VIOLET, boxShadow: `0 0 20px rgba(108,62,244,0.5)` }}
                >
                    SA ✦
                </span>
            </div>

            {/* The student's phone — the finished product, live */}
            <div
                className="absolute right-[12%] w-[130px] h-[240px] rounded-[22px] p-2"
                style={{
                    background: "#1B2033",
                    border: `1px solid ${SURFACE_EDGE}`,
                    transform: `translateY(${lerp(26, 0, screenOn)}px) rotateY(-8deg)`,
                    boxShadow: screenOn > 0.5 ? `0 30px 60px rgba(0,0,0,0.6), 0 0 40px ${ACCENT_SOFT}0.15)` : "0 30px 60px rgba(0,0,0,0.6)",
                }}
                aria-hidden="true"
            >
                <div className="w-full h-full rounded-[16px] overflow-hidden flex flex-col" style={{ background: "#0B0E1C", opacity: lerp(0.35, 1, screenOn) }}>
                    <div className="px-2.5 py-2 border-b border-white/[0.07]">
                        <div className="text-[8px] font-black text-white truncate">SSC MTS Full Mock 4</div>
                        <div className="text-[6.5px] font-semibold" style={{ color: ACCENT }}>
                            by Sharma Academy ✓
                        </div>
                    </div>
                    <div className="p-2.5 space-y-1.5 flex-1">
                        <span className="block h-1.5 w-4/5 rounded bg-white/[0.14]" />
                        <span className="block h-1.5 w-3/5 rounded bg-white/[0.10]" />
                        {[0, 1, 2].map((i) => (
                            <span key={i} className={`block h-4 rounded-md border ${i === 1 ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.04]"}`} />
                        ))}
                    </div>
                    <div className="px-2.5 pb-2.5">
                        <span className="block h-5 rounded-md" style={{ background: VIOLET, opacity: 0.9 }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ────────────────────────── Act 6: Grow ──────────────────────────
   The branded exam becomes the centre of gravity. Streams of glowing
   particles — students arriving from searches — fall inward along
   curved paths. SMIL animateMotion drives the particles: zero JS per
   frame, and it pauses with the scene.                                 */

const STREAM_PATHS = [
    "M 10,30 C 120,40 210,90 300,150",
    "M 40,290 C 140,260 220,200 300,158",
    "M 560,60 C 460,80 380,110 306,148",
    "M 590,270 C 480,250 390,200 310,156",
];

const STREAM_QUERIES = ["“ssc mts previous year paper”", "“free mock test”", "“mts 2026 practice”"];

const SeoScene = ({ p, live }: SceneProps) => {
    const nodeIn = easeOut(phase(p, 0, 0.2));
    const flow = phase(p, 0.15, 0.4);
    const students = Math.floor(lerp(0, 2140, easeOut(phase(p, 0.22, 0.9))));

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 600 300" className="absolute inset-0 w-full h-full" aria-hidden="true">
                {STREAM_PATHS.map((d, i) => (
                    <g key={i} opacity={flow}>
                        <path d={d} fill="none" stroke={ACCENT} strokeWidth="0.6" strokeOpacity="0.18" />
                        {[0, 1, 2, 3].map((j) => (
                            <circle key={j} r="2.2" fill={ACCENT} style={{ filter: `drop-shadow(0 0 4px ${ACCENT})` }}>
                                <animateMotion
                                    dur={`${2.6 + i * 0.4}s`}
                                    begin={`${j * 0.65}s`}
                                    repeatCount="indefinite"
                                    path={d}
                                    // SMIL keeps flowing even when the tab is idle;
                                    // gate on `live` so stills stay still.
                                    {...(live ? {} : { end: "0s" })}
                                />
                            </circle>
                        ))}
                    </g>
                ))}
            </svg>

            {/* The centre node — the creator's content */}
            <div
                className="relative w-[110px] h-[110px] rounded-3xl flex flex-col items-center justify-center"
                style={{
                    background: SURFACE,
                    border: `1px solid ${ACCENT_SOFT}0.5)`,
                    boxShadow: `0 0 ${lerp(0, 50, nodeIn)}px ${ACCENT_SOFT}0.3), 0 24px 48px rgba(0,0,0,0.55)`,
                    transform: `scale(${lerp(0.6, 1, nodeIn)})`,
                    opacity: nodeIn,
                }}
                aria-hidden="true"
            >
                <span className="text-[10px] font-black text-white">SA ✦</span>
                <span className="text-[7px] font-bold text-white/40 mt-0.5">your papers</span>
                <span className="mt-1.5 text-[13px] font-black tabular-nums" style={{ color: ACCENT }}>
                    {students.toLocaleString("en-IN")}
                </span>
                <span className="text-[6.5px] font-bold text-white/40">students this month</span>
            </div>

            {/* The searches the streams represent */}
            {STREAM_QUERIES.map((q, i) => (
                <span
                    key={q}
                    className="absolute text-[8.5px] font-semibold text-white/45 px-2 py-1 rounded-full border border-white/[0.08] bg-white/[0.04]"
                    style={{
                        left: ["6%", "10%", "68%"][i],
                        top: ["16%", "78%", "12%"][i],
                        opacity: phase(p, 0.3 + i * 0.12, 0.45 + i * 0.12),
                    }}
                    aria-hidden="true"
                >
                    {q}
                </span>
            ))}
        </div>
    );
};

const SCENES = [ImportScene, BuilderScene, LiveScene, AnalyticsScene, AppScene, SeoScene];

/* ────────────────────── media-query hooks ────────────────────── */

const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(() =>
        typeof window !== "undefined" ? window.matchMedia(query).matches : false
    );
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
    }, [query]);
    return matches;
};

/* ───────────────── the scrubbed theatre (desktop) ───────────────── */

const ScrubJourney = () => {
    const navigate = useNavigate();
    const wrapRef = useRef<HTMLDivElement>(null);
    const [progress, setProgress] = useState(0);
    const targetRef = useRef(0);
    const currentRef = useRef(0);
    const rafRef = useRef(0);

    // Wheel input arrives in steps; a stage scrubbed 1:1 to it feels notchy.
    // The scroll position only sets a TARGET — a rAF loop chases it with an
    // exponential ease (~9%/frame), so every wheel click becomes a glide and
    // trackpad flicks decay with inertia. The loop parks itself when it
    // arrives, so an idle page costs zero frames.
    useEffect(() => {
        const readTarget = () => {
            const el = wrapRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const total = el.offsetHeight - window.innerHeight;
            if (total <= 0) return;
            targetRef.current = clamp01(-rect.top / total);
        };
        const tick = () => {
            const t = targetRef.current;
            const c = currentRef.current;
            const next = Math.abs(t - c) < 0.0004 ? t : c + (t - c) * 0.09;
            if (next !== c) {
                currentRef.current = next;
                setProgress(next);
            }
            rafRef.current = next !== t ? requestAnimationFrame(tick) : 0;
        };
        const onScroll = () => {
            readTarget();
            if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        onScroll();
        // First paint lands on the target directly — no swoop on page load.
        currentRef.current = targetRef.current;
        setProgress(targetRef.current);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    /** Smooth-scroll the window so act `i` plays from its opening beat. */
    const scrollToAct = (i: number) => {
        const el = wrapRef.current;
        if (!el) return;
        const total = el.offsetHeight - window.innerHeight;
        const top = window.scrollY + el.getBoundingClientRect().top;
        window.scrollTo({ top: top + ((i + 0.12) / ACTS.length) * total, behavior: "smooth" });
    };

    const actCount = ACTS.length;
    const activeIndex = Math.min(actCount - 1, Math.floor(progress * actCount));
    const local = clamp01(progress * actCount - activeIndex);
    const act = ACTS[activeIndex];
    // The CTA belongs to the settle beat — never mid-motion.
    const settled = local > 0.72 || (activeIndex === actCount - 1 && local > 0.6);

    return (
        // 100vh of sticky theatre per act plus one viewport of runway.
        <div ref={wrapRef} style={{ height: `${actCount * 100 + 100}vh` }} className="relative">
            <div className="sticky top-0 h-screen flex items-center overflow-hidden">
                <div className="container mx-auto max-w-6xl px-5 grid lg:grid-cols-[380px_1fr] gap-10 items-center w-full">
                    {/* The rail — plain HTML, the story in words */}
                    <div key={activeIndex} className="creator-act-rail">
                        <div className="text-[11px] font-bold tracking-widest uppercase mb-3" style={{ color: ACCENT }}>
                            {act.eyebrow}
                        </div>
                        <h3 className="text-[26px] xl:text-[32px] font-black text-foreground tracking-[-0.03em] leading-[1.12]">
                            {act.title}
                        </h3>
                        <p className="mt-4 text-[14.5px] text-muted-foreground leading-[1.7]">{act.copy}</p>
                        <button
                            onClick={() => navigate(act.cta.to)}
                            className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13.5px] font-bold shadow-md shadow-emerald-600/20 transition-all duration-500"
                            style={{ opacity: settled ? 1 : 0, transform: `translateY(${settled ? 0 : 8}px)`, pointerEvents: settled ? "auto" : "none" }}
                        >
                            {act.cta.label} <ArrowRight className="h-4 w-4" />
                        </button>

                        {/* Act indicator — each dash is a door to its act */}
                        <div className="mt-10 flex items-center gap-2">
                            {ACTS.map((a, i) => (
                                <button
                                    key={i}
                                    onClick={() => scrollToAct(i)}
                                    aria-label={`Go to ${a.eyebrow}`}
                                    className="h-2.5 flex items-center rounded-full transition-all duration-300"
                                >
                                    <span
                                        className="block h-1 rounded-full transition-all duration-300"
                                        style={{
                                            width: i === activeIndex ? 28 : 10,
                                            background: i === activeIndex ? ACCENT : "hsl(var(--border))",
                                        }}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* The stage. The whole frame "breathes" — a slow dolly-in
                        through each act's middle, easing out at the boundaries —
                        and the scenes crossfade with a whisper of scale so a cut
                        never feels like a slide swap. */}
                    <div
                        className="relative h-[440px] xl:h-[500px]"
                        style={{
                            transform: `scale(${0.982 + 0.018 * Math.sin(Math.PI * local)})`,
                            willChange: "transform",
                        }}
                    >
                        <StageShell drift={progress}>
                            {SCENES.map((Scene, i) => {
                                const isActive = i === activeIndex;
                                const p = isActive ? local : i < activeIndex ? 1 : 0;
                                // Neighbouring scene stays mounted for the crossfade;
                                // everything further is skipped entirely.
                                if (Math.abs(i - activeIndex) > 1) return null;
                                return (
                                    <div
                                        key={i}
                                        className="absolute inset-0 transition-[opacity,transform] duration-500 ease-out"
                                        style={{
                                            opacity: isActive ? 1 : 0,
                                            transform: `scale(${isActive ? 1 : 0.97})`,
                                            pointerEvents: "none",
                                            willChange: "opacity, transform",
                                        }}
                                    >
                                        <Scene p={p} live={isActive} />
                                    </div>
                                );
                            })}
                        </StageShell>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ───────────── the posed fallback (mobile / reduced motion) ───────────── */

const StaticJourney = () => {
    const navigate = useNavigate();
    return (
        <div className="container mx-auto max-w-6xl px-5 space-y-14">
            {ACTS.map((act, i) => {
                const Scene = SCENES[i];
                return (
                    <div key={act.eyebrow} className="grid lg:grid-cols-[380px_1fr] gap-6 lg:gap-10 items-center">
                        <div>
                            <div className="text-[11px] font-bold tracking-widest uppercase mb-3" style={{ color: ACCENT }}>
                                {act.eyebrow}
                            </div>
                            <h3 className="text-[22px] sm:text-[26px] font-black text-foreground tracking-[-0.03em] leading-[1.15]">
                                {act.title}
                            </h3>
                            <p className="mt-3 text-[14px] text-muted-foreground leading-[1.7]">{act.copy}</p>
                            <button
                                onClick={() => navigate(act.cta.to)}
                                className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13.5px] font-bold shadow-md shadow-emerald-600/20 transition-all duration-200"
                            >
                                {act.cta.label} <ArrowRight className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="relative h-[300px] sm:h-[360px]">
                            <StageShell>
                                {/* The settled pose of the same scene the theatre plays. */}
                                <Scene p={0.92} live={false} />
                            </StageShell>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/* ─────────────────────────── the export ─────────────────────────── */

const CreatorJourney = () => {
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const desktop = useMediaQuery("(min-width: 1024px)");
    // A sticky 600vh theatre is a desktop luxury; phones and motion-sensitive
    // visitors get the same five scenes as composed stills.
    const scrub = desktop && !reducedMotion;

    return (
        <section aria-label="How MockSetu works for creators" className="py-16 sm:py-24">
            <div className="container mx-auto max-w-6xl px-5 text-center mb-4 lg:mb-0">
                <div className="section-label justify-center mb-4">
                    <span className="w-6 h-px bg-emerald-500/40" />
                    One paper's journey
                    <span className="w-6 h-px bg-emerald-500/40" />
                </div>
                <h2 className="text-[28px] sm:text-[36px] md:text-[44px] font-black text-foreground tracking-[-0.03em] leading-[1.1]">
                    Follow your paper from{" "}
                    <span
                        style={{
                            background: "linear-gradient(135deg, #10B981, #34D399)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                        }}
                    >
                        PDF to phenomenon
                    </span>
                    .
                </h2>
            </div>
            {scrub ? <ScrubJourney /> : <StaticJourney />}
        </section>
    );
};

export default CreatorJourney;
