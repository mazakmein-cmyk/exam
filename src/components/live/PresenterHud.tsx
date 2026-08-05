/**
 * PresenterHud.tsx — the join instructions, permanently available.
 *
 * The problem it removes
 * ---------------------
 * Joining a live exam is not a one-time event. Students arrive late, phones die,
 * a tab gets closed, wifi drops. Each one used to be an interruption: the creator
 * opened the Share dialog, which covered the entire control room — timer, unlock
 * button and leaderboard all vanished behind it — so they closed it again
 * immediately, and did the whole dance for the next arrival.
 *
 * Pinning it removes a recurring thought from the creator's head. That is the
 * whole feature: not new information, one less decision.
 *
 * The code is bigger than the QR
 * ------------------------------
 * The share code is rendered LARGER than the QR square, which looks wrong until
 * you have watched a class try to scan a projector from the back row. Camera
 * autofocus on a bright projected surface at five metres frequently fails, and
 * the fallback is a student typing eight characters. So the characters get the
 * emphasis, tracked wide and monospaced so 0/O and 1/I cannot be misread.
 *
 * On the wall it never leaves the screen
 * -------------------------------------
 * The projector variant used to appear in the lobby and then disappear the moment
 * the first question went up, on the reasonable assumption that a room fills in
 * the first minute. That assumption is about a ROOM. A livestream audience arrives
 * continuously for an hour — somebody finds the link at minute forty and needs the
 * code exactly as much as the people who were early — and taking it away is how a
 * late arrival ends up watching a quiz they cannot play.
 *
 * So it stays up, and `dense` is how it stays up without competing: while a
 * question is open it collapses to one quiet row in the rail rather than the full
 * QR-plus-huge-code panel. Small enough that the question still owns the frame,
 * legible enough that it is still a way in.
 *
 * The address next to the QR nobody can scan
 * -----------------------------------------
 * A QR is useless to the audience that needs joining instructions most. A stream
 * viewer is already holding the screen the code is on — there is no second device
 * to point at it — so the join address is spelled out in readable text beside the
 * square, stripped down to the part a browser actually needs. That is also the
 * only form that survives being read aloud down a phone to somebody who missed it.
 */

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Copy, Check, Users, X, QrCode as QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PresenterHudProps = {
  /** Full join url, encoded into the QR. */
  shareUrl: string;
  /** The 8-character code, for anyone who cannot scan. */
  shareCode: string;
  /** Present now, from the heartbeat — not "ever joined". */
  inRoom: number;
  /** Rendered huge for a projector, compact for the creator's own screen. */
  variant?: "control" | "present";
  /** Control variant only: dismiss the pin. */
  onClose?: () => void;
  className?: string;
  /** Present variant: one row instead of a panel, while a question is open. */
  dense?: boolean;
};

/**
 * Split the code so it can be read aloud and typed without losing your place.
 * "4F9A2C1B" reads back as "4F9A — 2C1B".
 */
function groupCode(code: string): string {
  const clean = (code || "").toUpperCase();
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)} ${clean.slice(4)}`;
}

/**
 * The join link as somebody would actually type it.
 *
 * Everything a browser fills in for you comes off: the scheme, a leading `www.`,
 * a trailing slash. On a wall every one of those is a character being copied by
 * hand into a phone keyboard, and "https://" in front of the address is eight of
 * them that do nothing — it is the part people drop anyway, and dropping it here
 * means nobody has to decide whether they can.
 *
 * Derived from shareUrl rather than rebuilt from the code, so there is one join
 * address on this screen and not two spellings of one that might disagree.
 */
function typeableUrl(url: string): string {
  return (url || "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

export default function PresenterHud({
  shareUrl,
  shareCode,
  inRoom,
  variant = "control",
  onClose,
  className = "",
  dense = false,
}: PresenterHudProps) {
  const [copied, setCopied] = useState(false);
  const typedUrl = typeableUrl(shareUrl);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(shareUrl).then(
      () => setCopied(true),
      () => {
        /* clipboard blocked; the code on screen is still readable */
      }
    );
  };

  // ─── Projector variant ─────────────────────────────────────

  /*
    Every colour here comes from the stage palette rather than from white at some
    opacity. The old spelling — border-white/15, bg-black/35, text-white — was
    correct for exactly as long as the frame was always dark; on the light theme
    (Q16) that panel is white-on-white with a border nobody can see, which is to
    say it is the join instructions rendered invisible. See lib/live/stageTheme.ts.

    The one deliberate exception is the QR's quiet zone, which stays literally
    white in both themes: a dark-themed QR fails to scan on a large number of
    phones, and a code that cannot be scanned is worse than a code that clashes.
  */

  if (variant === "present") {
    /*
      Dense — the shape it takes while a question is open.

      Three things, one row: the square to scan, the code to type, the address to
      type it into. Nothing else, because the frame beside it is being read from
      the back of a room and this panel's job right now is to be findable, not to
      be looked at.

      The room count is the deliberate omission. The wall's own footer carries
      "N in the room" permanently, two lines below this, and the same number twice
      on one screen reads as two different numbers that happen to agree — the
      audience starts working out which one is which instead of reading the
      question.
    */
    if (dense) {
      return (
        <div
          className={`flex items-center gap-3 rounded-xl border p-2.5 ${className}`}
          style={{ borderColor: "var(--stage-line)", background: "var(--stage-surface)" }}
        >
          <div className="shrink-0 rounded-xl bg-white p-1.5">
            <QRCode value={shareUrl} size={52} />
          </div>
          <div className="min-w-0">
            <p
              className="font-mono text-[1.4rem] font-black leading-none tracking-[0.1em]"
              style={{ color: "var(--stage-fg)" }}
            >
              {groupCode(shareCode)}
            </p>
            {/* Wrapped, never truncated. The rail is a fraction of the frame and
                this address does not always fit it — but an address ending in an
                ellipsis is an address nobody can type, which is the whole reason
                it is on screen. Two short lines cost nothing here. */}
            <p
              className="mt-1 break-all text-[0.72rem] font-medium leading-tight"
              style={{ color: "var(--stage-muted)" }}
            >
              {typedUrl}
            </p>
          </div>
        </div>
      );
    }

    /* Roomy — the lobby, where joining IS the screen and can have the space. */
    return (
      <div
        className={`flex items-center gap-5 rounded-2xl border p-4 backdrop-blur-sm ${className}`}
        style={{ borderColor: "var(--stage-line)", background: "var(--stage-surface)" }}
      >
        <div className="shrink-0 rounded-xl bg-white p-2.5 shadow-lg">
          <QRCode value={shareUrl} size={92} />
        </div>
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--stage-faint)" }}
          >
            Join with code
          </p>
          <p
            className="mt-1 font-mono text-[2.5rem] font-black leading-none tracking-[0.12em]"
            style={{ color: "var(--stage-fg)" }}
          >
            {groupCode(shareCode)}
          </p>
          {/* Under the code, not next to the QR square, because it is the same
              instruction at a second size: scan it, or type these eight
              characters, or type the whole address — in decreasing order of how
              much of a second device you have. */}
          <p
            className="mt-1.5 break-all text-sm font-medium leading-tight"
            style={{ color: "var(--stage-muted)" }}
          >
            {typedUrl}
          </p>
          <p
            className="mt-1.5 flex items-center gap-1.5 text-sm font-medium"
            style={{ color: "var(--stage-muted)" }}
          >
            <Users className="h-4 w-4" />
            <span className="tabular-nums">{inRoom}</span> in the room
          </p>
        </div>
      </div>
    );
  }

  // ─── Creator variant ───────────────────────────────────────

  return (
    <div
      className={`w-[248px] overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-xl backdrop-blur ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <QrCodeIcon className="h-3.5 w-3.5" />
          Join
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Users className="h-3 w-3 text-primary" />
          <span className="tabular-nums">{inRoom}</span>
        </span>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 h-6 w-6 shrink-0"
            onClick={onClose}
            aria-label="Unpin join panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 p-3">
        <div className="shrink-0 rounded-lg border border-border/60 bg-white p-1.5">
          <QRCode value={shareUrl} size={64} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg font-black leading-tight tracking-[0.08em]">
            {groupCode(shareCode)}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                Link copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
