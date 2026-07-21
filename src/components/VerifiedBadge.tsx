import { useId } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VerificationTier } from "@/lib/verification";

// Scalloped rosette seal — the shape people instinctively read as "verified".
const SEAL_PATH =
    "M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z";

const TIER_CONFIG: Record<
    VerificationTier,
    { stops: [string, string][]; glow: string; label: string; sublabel: string }
> = {
    blue: {
        stops: [
            ["0", "#5BB7FF"],
            ["0.55", "#1D9BF0"],
            ["1", "#0C7FDE"],
        ],
        glow: "drop-shadow-[0_1px_1px_rgba(29,155,240,0.3)]",
        label: "Verified Creator",
        sublabel: "Authenticity verified by MockSetu",
    },
    gold: {
        stops: [
            ["0", "#FDE68A"],
            ["0.5", "#F5B301"],
            ["1", "#DE8E00"],
        ],
        glow: "drop-shadow-[0_1px_1.5px_rgba(222,142,0,0.45)]",
        label: "MockSetu Official",
        sublabel: "The official MockSetu account",
    },
};

interface VerifiedSealProps {
    size?: number;
    tier?: VerificationTier;
    className?: string;
}

export const VerifiedSeal = ({ size = 14, tier = "blue", className }: VerifiedSealProps) => {
    const gradientId = useId();
    const cfg = TIER_CONFIG[tier];
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={cfg.label}
            className={cn("shrink-0", cfg.glow, className)}
        >
            <defs>
                <linearGradient id={gradientId} x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
                    {cfg.stops.map(([offset, color]) => (
                        <stop key={offset} offset={offset} stopColor={color} />
                    ))}
                </linearGradient>
            </defs>
            <path d={SEAL_PATH} fill={`url(#${gradientId})`} />
            <path
                d="M8.3 12.35l2.45 2.45 4.95-5.3"
                stroke="white"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

interface VerifiedBadgeProps extends VerifiedSealProps {
    /** Set false to render the seal without the hover tooltip. */
    tooltip?: boolean;
}

const VerifiedBadge = ({ size = 14, tier = "blue", className, tooltip = true }: VerifiedBadgeProps) => {
    if (!tooltip) return <VerifiedSeal size={size} tier={tier} className={className} />;

    const cfg = TIER_CONFIG[tier];
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className={cn(
                            "inline-flex items-center align-middle cursor-help transition-transform duration-200 hover:scale-110",
                            className,
                        )}
                    >
                        <VerifiedSeal size={size} tier={tier} />
                    </span>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    sideOffset={6}
                    collisionPadding={12}
                    className="rounded-xl border-0 bg-gray-900 px-3.5 py-2.5 shadow-xl shadow-black/20"
                >
                    <span className="flex items-center gap-2.5">
                        <VerifiedSeal size={20} tier={tier} className="drop-shadow-none" />
                        <span className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold leading-none text-white">{cfg.label}</span>
                            <span className="text-[10px] leading-none text-gray-400">{cfg.sublabel}</span>
                        </span>
                    </span>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

export default VerifiedBadge;
