import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, History, MonitorPlay, Timer } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import Reveal from "@/components/home/Reveal";
import { readLastExam, type LastExamMemo } from "@/lib/lastExamMemo";
import { slugifyCategory } from "@/lib/homeExamContext";
import { type CycleCopy } from "@/i18n/homeCopy";
import { HOME_COPY_EN } from "@/i18n/homeCopy.en";

/**
 * Cluster A — the Zeigarnik engine: two open loops, side by side.
 *
 *  · The cycle card counts down to the OPENING of the official SSC MTS 2026
 *    window (Sept–Nov per the SSC calendar). The notification is not out as of
 *    Aug 2026, so a countdown to a specific exam date would be fiction — the
 *    window opening is the honest deadline, and /ssc-mts (the SEO pillar) is
 *    where the full cycle story lives.
 *
 *  · The resume card surfaces the last paper the visitor opened (a local
 *    breadcrumb, see lastExamMemo.ts). An unfinished thing with a name pulls
 *    harder than any promotion. First-time visitors get the inline CBT demo
 *    invitation instead — their open loop is "what does the real screen look
 *    like?", and #cbt-preview answers it one scroll away.
 */

/** The official calendar's window for the MTS CBE. */
const WINDOW_OPENS = new Date("2026-09-01T00:00:00+05:30").getTime();
const WINDOW_CLOSES = new Date("2026-11-30T23:59:59+05:30").getTime();

const pad = (n: number) => String(n).padStart(2, "0");

const CountdownDigits = ({ target, copy }: { target: number; copy: CycleCopy }) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const left = Math.max(0, target - now);
    const days = Math.floor(left / 86_400_000);
    const hours = Math.floor((left % 86_400_000) / 3_600_000);
    const mins = Math.floor((left % 3_600_000) / 60_000);
    const secs = Math.floor((left % 60_000) / 1000);

    const cells = [
        { value: String(days), label: copy.countdown.days },
        { value: pad(hours), label: copy.countdown.hrs },
        { value: pad(mins), label: copy.countdown.min },
        { value: pad(secs), label: copy.countdown.sec },
    ];

    return (
        // Ticking numbers are noise to a screen reader — the static copy above
        // them already says what the date is.
        <div className="flex items-end gap-2" aria-hidden="true">
            {cells.map(({ value, label }) => (
                <div key={label} className="text-center">
                    <div className="min-w-[52px] px-2 py-2.5 rounded-xl bg-white/[0.07] border border-white/[0.1] text-[24px] font-black text-white tabular-nums leading-none">
                        {value}
                    </div>
                    <div className="mt-1.5 text-[10px] font-bold tracking-widest uppercase text-white/40">{label}</div>
                </div>
            ))}
        </div>
    );
};

/** The SSC MTS 2026 cycle card, in whichever phase the calendar is in. */
const MtsCycleCard = ({ copy }: { copy: CycleCopy }) => {
    const now = Date.now();
    const beforeWindow = now < WINDOW_OPENS;
    const inWindow = now >= WINDOW_OPENS && now <= WINDOW_CLOSES;

    return (
        <div className="relative overflow-hidden rounded-2xl bg-[#0A0D1E] border border-white/[0.08] p-6 flex flex-col justify-between min-h-[240px]">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <div className="absolute top-[-40%] right-[-20%] w-[300px] h-[240px] rounded-full bg-[#6C3EF4] opacity-[0.16] blur-[80px]" />
            </div>
            <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-[11px] font-bold tracking-widest uppercase text-red-400">
                        {copy.mtsBadge}
                    </span>
                </div>
                {beforeWindow ? (
                    <>
                        <h3 className="text-[19px] font-extrabold text-white tracking-tight leading-snug mb-1">
                            {copy.opensIn}
                        </h3>
                        <p className="text-[12.5px] text-white/45 mb-5">{copy.calendarNote}</p>
                        <CountdownDigits target={WINDOW_OPENS} copy={copy} />
                    </>
                ) : inWindow ? (
                    <>
                        <h3 className="text-[20px] font-extrabold text-white tracking-tight leading-snug mb-1">
                            {copy.openNowTitleA}
                            <span className="text-red-400">{copy.openNowTitleB}</span>.
                        </h3>
                        <p className="text-[13px] text-white/45">{copy.openNowNote}</p>
                    </>
                ) : (
                    <>
                        <h3 className="text-[20px] font-extrabold text-white tracking-tight leading-snug mb-1">
                            {copy.closedTitle}
                        </h3>
                        <p className="text-[13px] text-white/45">{copy.closedNote}</p>
                    </>
                )}
            </div>
            {/* The pillar page is English-only for now, so both languages point
                at it — a Hindi reader following it lands somewhere real rather
                than a 404. */}
            <Link
                to="/ssc-mts"
                className="relative mt-6 inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-[13px] font-bold text-white transition-all duration-200"
            >
                <CalendarClock className="h-4 w-4 text-[#A78BFA]" />
                {copy.cycleLink}
                <ArrowRight className="h-3.5 w-3.5" />
            </Link>
        </div>
    );
};

/** For non-MTS contexts: the same slot holds that exam's shelf instead. */
const ShelfCard = ({ category, copy }: { category: string; copy: CycleCopy }) => {
    const navigate = useNavigate();
    return (
        <div className="relative overflow-hidden rounded-2xl bg-[#0A0D1E] border border-white/[0.08] p-6 flex flex-col justify-between min-h-[240px]">
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                <div className="absolute top-[-40%] right-[-20%] w-[300px] h-[240px] rounded-full bg-[#6C3EF4] opacity-[0.16] blur-[80px]" />
            </div>
            <div className="relative">
                <span className="text-[11px] font-bold tracking-widest uppercase text-[#A78BFA]">{copy.shelfEyebrow}</span>
                <h3 className="mt-3 text-[20px] font-extrabold text-white tracking-tight leading-snug">
                    {copy.shelfTitle(category)}
                </h3>
                <p className="mt-1.5 text-[13px] text-white/45">{copy.shelfNote}</p>
            </div>
            <button
                onClick={() => navigate(`/marketplace?category=${encodeURIComponent(category)}`)}
                className="relative mt-6 inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-[13px] font-bold text-white transition-all duration-200"
            >
                {copy.shelfButton(category)} <ArrowRight className="h-3.5 w-3.5" />
            </button>
        </div>
    );
};

const ResumeCard = ({ memo, copy }: { memo: LastExamMemo; copy: CycleCopy }) => {
    const navigate = useNavigate();
    return (
        <div className="rounded-2xl border border-[#6C3EF4]/25 bg-[#6C3EF4]/[0.04] p-6 flex flex-col justify-between min-h-[240px]">
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-[#6C3EF4]" aria-hidden="true" />
                    <span className="text-[11px] font-bold tracking-widest uppercase text-[#6C3EF4]">
                        {copy.resumeEyebrow}
                    </span>
                </div>
                <h3 className="text-[19px] font-extrabold text-foreground tracking-tight leading-snug">{memo.name}</h3>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{copy.resumeNote(memo.category)}</p>
            </div>
            <button
                onClick={() => navigate(`/exam/${memo.id}/intro?from=home`)}
                className="mt-6 inline-flex items-center justify-center gap-2 self-start px-5 py-3 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white text-[14px] font-bold shadow-md shadow-[#6C3EF4]/25 hover:shadow-lg hover:shadow-[#6C3EF4]/30 hover:-translate-y-px transition-all duration-200"
            >
                <MonitorPlay className="h-4 w-4" /> {copy.resumeButton}
            </button>
        </div>
    );
};

/** No breadcrumb yet → invite the one-scroll-away CBT demo instead. */
const FirstVisitCard = ({ copy }: { copy: CycleCopy }) => (
    <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col justify-between min-h-[240px]">
        <div>
            <div className="flex items-center gap-2 mb-3">
                <MonitorPlay className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span className="text-[11px] font-bold tracking-widest uppercase text-emerald-600">
                    {copy.firstEyebrow}
                </span>
            </div>
            <h3 className="text-[19px] font-extrabold text-foreground tracking-tight leading-snug">
                {copy.firstTitle}
            </h3>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground leading-[1.6]">{copy.firstNote}</p>
        </div>
        <a
            href="#cbt-preview"
            className="mt-6 inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/70 border border-border/60 text-[13px] font-bold text-foreground transition-all duration-200"
        >
            {copy.firstLink} <ArrowRight className="h-3.5 w-3.5" />
        </a>
    </div>
);

const CycleCluster = ({
    selectedCategory,
    copy = HOME_COPY_EN.cycle,
}: {
    selectedCategory: string | null;
    copy?: CycleCopy;
}) => {
    // Read once per mount — the memo only changes by navigating away and back.
    const [memo] = useState(() => readLastExam());

    // Three moods for the left tile: no context → the season card under a
    // GENERIC heading (the MTS window is genuinely what's live right now, but
    // the page must not read as MTS-only); MTS chosen → the full MTS framing;
    // any other exam → that exam's shelf.
    const isMts = selectedCategory !== null && slugifyCategory(selectedCategory) === "ssc-mts";
    const title = isMts
        ? copy.titleMts
        : selectedCategory
          ? copy.titleCategory(selectedCategory)
          : copy.titleGeneric;

    return (
        <section aria-label={copy.eyebrow} className="container mx-auto max-w-6xl px-5 py-14 sm:py-16">
            <Reveal>
                <SectionHeader icon={Timer} eyebrow={copy.eyebrow} title={title} accent="#EF4444" />
            </Reveal>
            <div className="grid md:grid-cols-2 gap-5">
                <Reveal delay={80}>
                    {selectedCategory && !isMts ? (
                        <ShelfCard category={selectedCategory} copy={copy} />
                    ) : (
                        <MtsCycleCard copy={copy} />
                    )}
                </Reveal>
                <Reveal delay={180}>
                    {memo ? <ResumeCard memo={memo} copy={copy} /> : <FirstVisitCard copy={copy} />}
                </Reveal>
            </div>
        </section>
    );
};

export default CycleCluster;
