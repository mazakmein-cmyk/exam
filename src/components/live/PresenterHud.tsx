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

export default function PresenterHud({
  shareUrl,
  shareCode,
  inRoom,
  variant = "control",
  onClose,
  className = "",
}: PresenterHudProps) {
  const [copied, setCopied] = useState(false);

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

  if (variant === "present") {
    return (
      <div
        className={`flex items-center gap-5 rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-sm ${className}`}
      >
        {/* QR stays on white: a dark-themed QR fails to scan on many phones. */}
        <div className="rounded-xl bg-white p-2.5 shadow-lg">
          <QRCode value={shareUrl} size={92} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
            Join with code
          </p>
          <p className="mt-1 font-mono text-[2.5rem] font-black leading-none tracking-[0.12em] text-white">
            {groupCode(shareCode)}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-white/70">
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
