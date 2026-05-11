import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const MockSetuMark = () => (
  <svg width="22" height="22" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="footer-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6C3EF4" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>
    </defs>
    <path
      d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22"
      stroke="url(#footer-grad)"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22"
      stroke="url(#footer-grad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity="0.45"
    />
  </svg>
);

const Footer = () => {
  return (
    <footer className="border-t border-border/50" aria-label="Site footer">
      <div className="container mx-auto max-w-6xl px-5 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MockSetuMark />
              <span className="text-[15px] font-bold tracking-[-0.02em] text-foreground">
                Mock<span className="text-gradient">Setu</span>
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground leading-[1.65] max-w-[220px]">
              The smartest free <strong className="font-semibold text-foreground/80">mock test</strong> &amp; exam simulator for JEE, NEET, CAT, GATE &amp; UPSC students.
            </p>
          </div>

          {/* For Students */}
          <nav aria-label="For students">
            <h4 className="text-[11px] font-bold tracking-widest text-foreground/40 uppercase mb-4">For Students</h4>
            <ul className="space-y-3">
              {[
                { label: "Sign Up Free", to: "/student-auth" },
                { label: "Exam Library", to: "/marketplace" },
                { label: "My Analytics", to: "/analytics" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-150"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Exam Prep Resources (footer-only deep links) */}
          <nav aria-label="Exam preparation resources">
            <h4 className="text-[11px] font-bold tracking-widest text-foreground/40 uppercase mb-4">Exam Prep</h4>
            <ul className="space-y-3">
              {[
                { label: "JEE Main Mock Test", to: "/mock-test/jee-main", rel: "Free JEE Main mock test simulator" },
                { label: "NEET UG Mock Test", to: "/mock-test/neet-ug", rel: "Free NEET UG mock test simulator" },
                { label: "CAT Mock Test", to: "/mock-test/cat", rel: "Free CAT mock test simulator" },
                { label: "GATE Mock Test", to: "/mock-test/gate", rel: "Free GATE mock test simulator" },
                { label: "UPSC Prelims Mock", to: "/mock-test/upsc-prelims", rel: "Free UPSC Prelims mock test simulator" },
              ].map(({ label, to, rel }) => (
                <li key={to}>
                  <Link
                    to={to}
                    title={rel}
                    className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-150"
                  >
                    {label}
                  </Link>
                </li>
              ))}
              <li className="pt-2 border-t border-border/40 mt-3">
                <Link
                  to="/blog"
                  className="text-[13px] font-semibold text-primary/90 hover:text-primary transition-colors"
                >
                  Blog &amp; Guides →
                </Link>
              </li>
            </ul>
          </nav>

          {/* Educators + Legal */}
          <div>
            <h4 className="text-[11px] font-bold tracking-widest text-foreground/40 uppercase mb-4">Educators</h4>
            <ul className="space-y-3 mb-8">
              <li>
                <Link
                  to="/for-creators"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Become a Creator
                </Link>
              </li>
              <li>
                <Link
                  to="/auth"
                  className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Creator Login
                </Link>
              </li>
            </ul>

            <h4 className="text-[11px] font-bold tracking-widest text-foreground/40 uppercase mb-4">Legal</h4>
            <ul className="space-y-3">
              {[
                { label: "Privacy Policy", to: "/privacy-policy" },
                { label: "Terms of Service", to: "/terms-of-service" },
              ].map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-muted-foreground/70">
            © 2026 MockSetu. Built for students, by educators.
          </p>
          <p className="text-[12px] text-muted-foreground/70">
            Made with ❤️ to help students crack their exams.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
