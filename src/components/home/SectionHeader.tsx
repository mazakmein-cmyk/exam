import type { LucideIcon } from "lucide-react";

/**
 * One header shape for every home cluster, so the page reads as four clean
 * chunks (Miller's law) rather than four differently-dressed sections.
 * Icon-first: the glyph is what a skimming eye keys on, the H2 is what
 * search engines key on.
 */
const SectionHeader = ({
    icon: Icon,
    eyebrow,
    title,
    subtitle,
    accent = "#6C3EF4",
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    subtitle?: string;
    accent?: string;
}) => (
    <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-3">
            <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: `${accent}14`, border: `1px solid ${accent}28` }}
                aria-hidden="true"
            >
                <Icon className="h-[18px] w-[18px]" style={{ color: accent }} />
            </span>
            <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: accent }}>
                {eyebrow}
            </span>
        </div>
        <h2 className="text-[24px] sm:text-[30px] font-black text-foreground tracking-[-0.03em] leading-[1.15]">
            {title}
        </h2>
        {subtitle && <p className="mt-2 text-[14.5px] text-muted-foreground max-w-xl leading-[1.6]">{subtitle}</p>}
    </div>
);

export default SectionHeader;
