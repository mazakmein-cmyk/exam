import { useEffect, useRef, useState } from "react";

/**
 * Reveal — the home page's one scroll-entrance primitive.
 *
 * Sections rise gently as the reader reaches them; cards inside a cluster
 * stagger by a few frames so a grid reads as a dealt hand rather than a
 * poster flip. One component, used everywhere, so the whole page shares a
 * single motion voice (same trick the /for-creators page plays).
 *
 * Plays once and disconnects — scrolling back up never re-animates, because
 * content that vanishes behind you feels broken, not delightful. Under
 * `prefers-reduced-motion` everything is simply visible.
 */
const Reveal = ({
    children,
    delay = 0,
    className = "",
}: {
    children: React.ReactNode;
    delay?: number;
    className?: string;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className={`transition-all duration-700 ease-out ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            } ${className}`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {children}
        </div>
    );
};

export default Reveal;
