/**
 * JoinLiveExamDialog.tsx — the student's way into a live exam without a link.
 *
 * The problem it solves
 * ---------------------
 * Until now a live exam could only be entered through the URL the creator
 * shared. That works over chat and collapses everywhere else: a code read out in
 * a classroom, written on a board, or shown on the projector had nowhere to be
 * typed. "My Live Exams" listed rooms the student had ALREADY joined, so the
 * first join was the one moment the library could not help with — and it is the
 * moment with a room waiting.
 *
 * Why a verify step instead of straight navigation
 * ------------------------------------------------
 * Navigating to /live/<code> on a mistyped code lands the student on the exam
 * screen, which reports the failure as a toast over an empty page — the join has
 * already "happened" as far as the app is concerned, and the student has to go
 * back and start over. Checking the code here means a wrong character is
 * answered in place, with the code still on screen to fix, and a correct one is
 * answered with the exam's own name: confirmation that this is the right room
 * before entering it. The check is one indexed lookup on a unique column.
 *
 * The three joinable states are deliberately NOT flattened into one button.
 * "Join now", "waiting room" and "results" are three different things to walk
 * into, and a student who reads the wrong one blames themselves for a room that
 * looks empty. `draft` is not among them: RLS hides drafts from everyone but
 * their creator, so an unpublished code is — correctly — indistinguishable from
 * a wrong one, and the box never becomes a probe for which codes exist.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import {
    AlertCircle,
    ArrowRight,
    CalendarClock,
    Hourglass,
    KeyRound,
    Loader2,
    Radio,
    Trophy,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHARE_CODE_LENGTH, isCompleteShareCode, normalizeShareCode } from "@/lib/live/shareCode";
import { lookupLiveExamByShareCode, type LiveExam } from "@/services/liveExamService";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

/**
 * idle     — nothing to say yet (empty or partial code)
 * checking — a lookup is in flight
 * missing  — the code resolved to nothing this student is allowed to enter
 * error    — the lookup itself failed; the code may well be fine
 * found    — a joinable exam, held alongside the code it was found for
 */
type Status =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "missing" }
    | { status: "error" }
    | { status: "found"; exam: LiveExam };

/** How a joinable exam introduces itself, per status. */
type Plan = {
    cta: string;
    note: string;
    icon: typeof Radio;
    /** Card + icon tint. Emerald reads "in progress" everywhere else in live. */
    ring: string;
    tint: string;
    accent: string;
    /** Only a running room gets the live dot — it means "right now", not "soon". */
    pulse?: boolean;
    /** Results are a look back, so the action stops competing with a real join. */
    quiet?: boolean;
};

function planFor(exam: LiveExam): Plan {
    if (exam.status === "live") {
        return {
            cta: "Join now",
            note: "Running right now — you'll come in on the question the room is on.",
            icon: Radio,
            ring: "border-emerald-500/30 bg-emerald-500/[0.06]",
            tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            accent: "text-emerald-700 dark:text-emerald-400",
            pulse: true,
        };
    }

    if (exam.status === "ended") {
        return {
            cta: "View results",
            note: "This one has finished. The answers and standings are still there to read.",
            icon: Trophy,
            ring: "border-border/70 bg-muted/40",
            tint: "bg-muted text-muted-foreground",
            accent: "text-foreground",
            quiet: true,
        };
    }

    // published — the host has opened the room but not started the exam.
    const scheduled = exam.scheduled_start_at ? new Date(exam.scheduled_start_at) : null;
    const upcoming = scheduled && scheduled.getTime() > Date.now();

    return {
        cta: "Enter the waiting room",
        note: upcoming
            ? `Scheduled for ${scheduled!.toLocaleString([], {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
              })} — wait here and it starts on its own.`
            : "Not started yet. Wait here and the first question appears the moment your host begins.",
        icon: upcoming ? CalendarClock : Hourglass,
        ring: "border-[#6C3EF4]/25 bg-[#6C3EF4]/[0.06]",
        tint: "bg-[#6C3EF4]/10 text-[#6C3EF4]",
        accent: "text-[#6C3EF4]",
    };
}

/**
 * Slot geometry. Eight boxes plus a group gap have to fit inside the dialog's
 * padding on a 320px phone — the narrowest real screen — which is what pins the
 * base width to w-8 and only lets the boxes grow at `sm`.
 */
const SLOT_BASE =
    "h-11 w-8 font-mono text-sm font-semibold sm:h-14 sm:w-11 sm:text-lg";

export default function JoinLiveExamDialog({ open, onOpenChange }: Props) {
    const navigate = useNavigate();

    const [code, setCode] = useState("");
    const [state, setState] = useState<Status>({ status: "idle" });
    const [joining, setJoining] = useState(false);

    /**
     * Monotonic token so a slow answer for an old code can never overwrite a
     * newer one. Editing a full code fires a fresh lookup while the previous is
     * still in flight, and the wrong winner would show one exam's name for
     * another exam's code. Bumping it also cancels everything on close.
     */
    const requestRef = useRef(0);
    const joinRef = useRef<HTMLButtonElement>(null);

    const complete = isCompleteShareCode(code);
    // Belt for the invariant the whole card rests on: what is drawn is what was
    // typed. Any drift here would be a student joining a room they didn't ask for.
    const found = state.status === "found" && state.exam.share_code === code ? state.exam : null;
    const plan = found ? planFor(found) : null;

    const verify = useCallback(async (candidate: string) => {
        const token = ++requestRef.current;
        setState({ status: "checking" });

        try {
            const exam = await lookupLiveExamByShareCode(candidate);
            if (token !== requestRef.current) return;
            // A draft is visible to its own creator only; to everyone else the
            // lookup already returned null. Both read as "not a room you can enter".
            if (!exam || exam.status === "draft") {
                setState({ status: "missing" });
                return;
            }
            setState({ status: "found", exam });
        } catch {
            if (token !== requestRef.current) return;
            setState({ status: "error" });
        }
    }, []);

    /**
     * Every path to a complete code checks it — typing the last character,
     * pasting a link, and replacing a full code with another full one. That last
     * case is why this is an effect on the value rather than input-otp's
     * onComplete, which only fires on the transition into full length and would
     * leave one exam's card sitting above a different exam's code.
     */
    useEffect(() => {
        if (!open) return;
        if (code.length < SHARE_CODE_LENGTH) {
            requestRef.current++;
            setState({ status: "idle" });
            return;
        }
        verify(code);
    }, [code, open, verify]);

    // A found room is one keystroke from being entered: Enter joins.
    useEffect(() => {
        if (found) joinRef.current?.focus();
    }, [found]);

    // Reopening starts clean — a stale code from last time is never what is wanted.
    useEffect(() => {
        if (open) return;
        requestRef.current++;
        setCode("");
        setState({ status: "idle" });
        setJoining(false);
    }, [open]);

    const handleJoin = () => {
        if (!found || joining) return;
        setJoining(true);
        // Close first, then navigate: the dialog owns a scroll lock, and letting
        // Radix unwind it before the route changes is the tidier order.
        onOpenChange(false);
        navigate(`/live/${found.share_code}`);
    };

    const handlePrimary = () => {
        if (found) {
            handleJoin();
            return;
        }
        // "Try again" after a wrong code or a failed lookup.
        if (complete) verify(code);
    };

    const slotClass = cn(
        SLOT_BASE,
        state.status === "missing" && "border-destructive/60 text-destructive",
        found && "border-emerald-500/50",
    );

    const primaryLabel = joining
        ? "Opening…"
        : plan
          ? plan.cta
          : state.status === "checking"
            ? "Checking code…"
            : state.status === "missing" || state.status === "error"
              ? "Check again"
              : "Join live exam";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-2xl p-5 sm:p-6">
                <DialogHeader>
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <KeyRound className="h-4 w-4" />
                        </span>
                        <DialogTitle className="text-lg">Join a live exam</DialogTitle>
                    </div>
                    <DialogDescription className="pt-1">
                        Enter the {SHARE_CODE_LENGTH}-character code from your host. Pasting the
                        join link works too.
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handlePrimary();
                    }}
                >
                    <div className="flex justify-center py-1">
                        <InputOTP
                            autoFocus
                            maxLength={SHARE_CODE_LENGTH}
                            value={code}
                            // Codes are case-insensitive to a student and uppercase in the
                            // column; folding here means the slots always show what will
                            // actually be looked up.
                            onChange={(value) => setCode(value.toUpperCase())}
                            // Everything a code can be pasted as — link, "Code: X", spaced —
                            // collapses to the same eight characters.
                            pasteTransformer={(pasted) => normalizeShareCode(pasted)}
                            pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label="Live exam code"
                            aria-invalid={state.status === "missing"}
                            containerClassName="gap-0"
                        >
                            <InputOTPGroup>
                                {[0, 1, 2, 3].map((i) => (
                                    <InputOTPSlot key={i} index={i} className={slotClass} />
                                ))}
                            </InputOTPGroup>
                            {/* Two groups of four: eight characters read as one run
                                are miscounted, and a code is re-read a lot. */}
                            <span
                                aria-hidden
                                className="mx-1 h-px w-2 shrink-0 rounded bg-border sm:mx-2.5 sm:w-3"
                            />
                            <InputOTPGroup>
                                {[4, 5, 6, 7].map((i) => (
                                    <InputOTPSlot key={i} index={i} className={slotClass} />
                                ))}
                            </InputOTPGroup>
                        </InputOTP>
                    </div>

                    {/* Fixed-height status well: the footer must not jump under the
                        cursor as an answer arrives. */}
                    <div className="mt-3 min-h-[74px]" aria-live="polite">
                        {found && plan ? (
                            <div className={cn("flex items-start gap-3 rounded-xl border p-3", plan.ring)}>
                                <span
                                    className={cn(
                                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                        plan.tint,
                                    )}
                                >
                                    <plan.icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        {plan.pulse && (
                                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                                        )}
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {found.name}
                                        </p>
                                    </div>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                        {plan.note}
                                    </p>
                                </div>
                            </div>
                        ) : state.status === "missing" ? (
                            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                <div>
                                    <p className="text-sm font-semibold text-destructive">
                                        No live exam with that code
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                        Check the characters against what your host shared — codes
                                        that haven't been opened yet won't work either.
                                    </p>
                                </div>
                            </div>
                        ) : state.status === "error" ? (
                            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-500">
                                        Couldn't check that code
                                    </p>
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                        The code may be perfectly fine — check your connection and
                                        try again.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="px-1 pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
                                {state.status === "checking"
                                    ? "Looking for that room…"
                                    : "Your host can read the code off the exam screen or re-share the join link."}
                            </p>
                        )}
                    </div>

                    <div className="mt-1 flex items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="rounded-xl"
                        >
                            Cancel
                        </Button>
                        <Button
                            ref={joinRef}
                            type="submit"
                            disabled={!complete || state.status === "checking" || joining}
                            className={cn(
                                "min-w-[9.5rem] rounded-xl shadow-md transition-all duration-200 hover:-translate-y-px",
                                plan?.quiet
                                    ? "bg-foreground text-background shadow-black/10 hover:bg-foreground/90"
                                    : "bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700",
                            )}
                        >
                            {state.status === "checking" || joining ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {primaryLabel}
                            {found && !joining && <ArrowRight className="h-4 w-4" />}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
