import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Shield, ChevronRight, ArrowUp } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const EFFECTIVE_DATE = "30 March 2025";
const CONTACT_EMAIL = "privacy@mocksetu.in";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "who-we-are", label: "Who We Are" },
  { id: "information-collected", label: "Information We Collect" },
  { id: "students", label: "→ Students" },
  { id: "creators", label: "→ Creators" },
  { id: "how-we-use", label: "How We Use Data" },
  { id: "sharing", label: "Sharing & Disclosure" },
  { id: "cookies", label: "Cookies & Tracking" },
  { id: "security", label: "Data Security" },
  { id: "retention", label: "Data Retention" },
  { id: "rights", label: "Your Rights" },
  { id: "children", label: "Children's Privacy" },
  { id: "grievance", label: "Grievance Officer" },
  { id: "changes", label: "Policy Changes" },
  { id: "contact", label: "Contact Us" },
];

const SectionHeading = ({ id, title, sub }: { id: string; title: string; sub?: string }) => (
  <div id={id} className="scroll-mt-24 pt-10 pb-3 border-b border-border/50 mb-6">
    {sub && <p className="text-xs font-bold tracking-widest text-primary uppercase mb-1">{sub}</p>}
    <h2 className="text-[22px] font-bold text-foreground tracking-tight">{title}</h2>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[15px] text-muted-foreground leading-[1.85] mb-4">{children}</p>
);

const UL = ({ items }: { items: string[] }) => (
  <ul className="mb-5 space-y-2">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3 text-[14.5px] text-muted-foreground leading-[1.75]">
        <ChevronRight className="h-4 w-4 mt-[3px] flex-shrink-0 text-primary/50" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

const TagBadge = ({ label, color }: { label: string; color: string }) => (
  <span
    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold mr-1"
    style={{ background: `${color}15`, color, border: `1px solid ${color}25` }}
  >
    {label}
  </span>
);

const PrivacyPolicy = () => {
  const [activeSection, setActiveSection] = useState("overview");
  const [showTop, setShowTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowTop(window.scrollY > 400);
      const sectionIds = sections.map((s) => s.id);
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el && el.getBoundingClientRect().top <= 120) {
          setActiveSection(sectionIds[i]);
          break;
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <div className="bg-[#07091A] pt-32 pb-16 px-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#6C3EF4]/15 border border-[#6C3EF4]/25 mb-6">
          <Shield className="h-7 w-7 text-[#6C3EF4]" />
        </div>
        <h1 className="text-[36px] sm:text-[48px] font-black text-white tracking-[-0.03em] leading-tight">
          Privacy Policy
        </h1>
        <p className="mt-3 text-white/40 text-[15px] max-w-xl mx-auto">
          We are committed to protecting the privacy of every student and creator on MockSetu.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-white/30">
          <span>Effective: {EFFECTIVE_DATE}</span>
          <span className="opacity-40">·</span>
          <span>Governs: Students &amp; Creators</span>
          <span className="opacity-40">·</span>
          <span>Jurisdiction: India (IT Act 2000, DPDP Act 2023)</span>
        </div>
      </div>

      {/* Body */}
      <div className="container mx-auto max-w-6xl px-5 py-16">
        <div className="flex gap-12">
          {/* Sticky ToC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24">
              <p className="text-[11px] font-bold tracking-widest text-muted-foreground/60 uppercase mb-4">Contents</p>
              <nav className="space-y-0.5">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={`block px-3 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                      activeSection === s.id
                        ? "bg-primary/8 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    } ${s.label.startsWith("→") ? "pl-6" : ""}`}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <div ref={contentRef} className="flex-1 min-w-0 max-w-3xl">

            {/* Overview */}
            <SectionHeading id="overview" title="Overview" />
            <P>
              This Privacy Policy ("Policy") describes how <strong>MockSetu</strong> ("we," "us," or "our") collects, uses, stores, and protects the personal information of individuals who access our platform at <strong>mocksetu.in</strong> and related subdomains ("Platform"), including both students who practise for competitive exams and educators/creators who upload and publish exam content.
            </P>
            <P>
              This Policy is published in compliance with the <strong>Information Technology Act, 2000</strong>, the <strong>Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</strong>, and the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> of India.
            </P>
            <P>
              By using MockSetu, you expressly consent to the collection and use of your information as described herein. If you do not agree, please discontinue use of the Platform immediately.
            </P>

            {/* Who We Are */}
            <SectionHeading id="who-we-are" title="Who We Are" />
            <P>
              MockSetu is an educational technology platform that enables creators (educators, coaching institutes, teachers) to publish exam simulations and students to access them for timed practice. We act as a <strong>Data Fiduciary</strong> under the DPDP Act, 2023, with respect to personal data processed on the Platform.
            </P>

            {/* Information Collected */}
            <SectionHeading id="information-collected" title="Information We Collect" />

            <div id="students" className="scroll-mt-24 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <TagBadge label="STUDENTS" color="#6C3EF4" />
                <span className="text-[13px] font-semibold text-foreground">Information collected from students</span>
              </div>
              <UL items={[
                "Full name and email address provided during account registration or OAuth sign-in (Google).",
                "Year of study, target examination (e.g., JEE, NEET, CAT, GATE, UPSC) — collected optionally to personalise the experience.",
                "Exam attempt data: answers submitted, time spent per question, section scores, review flags, and total marks.",
                "Performance analytics: cumulative attempt history, percentile estimates, subject-wise accuracy, and time-management patterns.",
                "Device and browser metadata: IP address, user-agent string, operating system, and approximate geographic region (city/state level only).",
                "Session data: timestamps of login, exam start/end, and page interactions.",
                "Any messages or support requests submitted voluntarily to our team.",
              ]} />
            </div>

            <div id="creators" className="scroll-mt-24 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <TagBadge label="CREATORS" color="#10B981" />
                <span className="text-[13px] font-semibold text-foreground">Information collected from creators</span>
              </div>
              <UL items={[
                "Full name, email address, and an optional public creator username displayed on published exams.",
                "Payment and billing information (if applicable in future monetisation features) — processed via PCI-DSS compliant third-party payment processors; MockSetu does not store raw card numbers.",
                "Exam content uploaded: PDF files, question text, answer keys, section configurations, marking schemes, and associated metadata.",
                "Publishing settings and exam visibility preferences.",
                "Aggregated statistics on student attempts on your published exams (no individual student PII is shared with creators beyond anonymised aggregates).",
                "Communications with our creator support team.",
              ]} />
            </div>

            {/* How We Use */}
            <SectionHeading id="how-we-use" title="How We Use Your Data" />
            <P>We use the information we collect for the following lawful purposes:</P>
            <UL items={[
              "Account creation, authentication, and identity verification.",
              "Delivering and improving the exam simulation experience — rendering timed tests, calculating scores, and generating analytics dashboards.",
              "Personalising content recommendations (e.g., suggesting exams based on your stated target exam).",
              "Sending transactional communications: account verification emails, password reset links, and exam completion confirmations.",
              "Sending optional product update and announcement emails — you may unsubscribe at any time.",
              "Detecting, investigating, and preventing fraudulent, abusive, or unlawful use of the Platform.",
              "Complying with applicable laws, regulations, and lawful governmental or judicial orders.",
              "Aggregating anonymised data for internal research, product development, and public-facing statistics (e.g., '50K+ questions practised') — no individual is identifiable from these aggregates.",
              "Responding to support inquiries and resolving disputes.",
            ]} />

            {/* Sharing */}
            <SectionHeading id="sharing" title="Sharing &amp; Disclosure" />
            <P>
              MockSetu does <strong>not</strong> sell, rent, or trade your personal data to third parties. We may share data only in the following limited circumstances:
            </P>
            <UL items={[
              "Service Providers: We use trusted third-party vendors (e.g., Supabase for database and authentication, Vercel/cloud hosts for infrastructure) who process data solely on our behalf under data processing agreements. These vendors are contractually prohibited from using your data for their own purposes.",
              "Legal Compliance: We may disclose information when required by law, court order, or governmental authority, or where we believe disclosure is necessary to protect the rights, property, or safety of MockSetu, our users, or the public.",
              "Business Transfers: In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity, subject to the same privacy protections described herein. We will notify you of any such change.",
              "With Your Consent: We may share information with third parties when you have given us explicit consent to do so.",
              "Creators see only anonymised aggregate statistics about their published exams — individual student identities, emails, or scores are never disclosed to creators.",
            ]} />

            {/* Cookies */}
            <SectionHeading id="cookies" title="Cookies &amp; Tracking Technologies" />
            <P>
              MockSetu uses cookies and similar technologies to operate and improve the Platform. These include:
            </P>
            <UL items={[
              "Strictly Necessary Cookies: Essential for authentication, session management, and security (e.g., Supabase auth tokens). These cannot be disabled without breaking core functionality.",
              "Functional Cookies: Remember your preferences such as dark/light mode, exam configuration, and last-visited exams.",
              "Analytics Cookies: We use privacy-respecting analytics tools to understand aggregate usage patterns. We do not use Google Analytics without user consent.",
              "No third-party advertising or tracking cookies are placed on MockSetu. We do not build advertising profiles.",
            ]} />
            <P>
              You may control cookies through your browser settings. Disabling strictly necessary cookies will impair your ability to log in and use the Platform.
            </P>

            {/* Security */}
            <SectionHeading id="security" title="Data Security" />
            <P>
              We implement industry-standard technical and organisational security measures to protect your personal data:
            </P>
            <UL items={[
              "All data is transmitted over HTTPS/TLS 1.2+ encrypted connections.",
              "Passwords are never stored in plain text — we use bcrypt hashing with appropriate cost factors via Supabase Auth.",
              "Database access is controlled via Row-Level Security (RLS) policies — no user can access another user's data.",
              "OAuth tokens are stored in httpOnly cookies to mitigate XSS risks.",
              "Regular security reviews and dependency audits are performed.",
              "Access to production databases is restricted to authorised personnel on a need-to-know basis.",
            ]} />
            <P>
              However, no method of transmission or storage is 100% secure. We cannot guarantee absolute security. In the event of a data breach that is likely to result in high risk to your rights, we will notify you and the relevant authority as required under applicable law.
            </P>

            {/* Retention */}
            <SectionHeading id="retention" title="Data Retention" />
            <P>
              We retain your personal data only for as long as necessary to fulfil the purposes for which it was collected:
            </P>
            <UL items={[
              "Active account data (profile, exam attempts, analytics) is retained for as long as your account remains active.",
              "If you delete your account, we will delete or anonymise your personal data within 30 days of the deletion request, except where we are legally required to retain it (e.g., for fraud investigation or compliance).",
              "Exam attempt logs may be retained in anonymised form for aggregate analytics even after account deletion.",
              "Creator-uploaded exam content (questions, PDFs) may be retained for up to 90 days after account closure to allow for dispute resolution, after which it is permanently deleted.",
              "Server logs containing IP addresses are retained for a maximum of 90 days.",
            ]} />

            {/* Rights */}
            <SectionHeading id="rights" title="Your Rights" />
            <P>
              Under the Digital Personal Data Protection Act, 2023 (India) and applicable data protection principles, you have the following rights:
            </P>
            <UL items={[
              "Right to Access: You may request a copy of the personal data we hold about you.",
              "Right to Correction: You may request correction of inaccurate or incomplete personal data.",
              "Right to Erasure ('Right to be Forgotten'): You may request deletion of your personal data, subject to legal obligations requiring retention.",
              "Right to Portability: You may request your exam attempt data in a machine-readable format (CSV/JSON).",
              "Right to Withdraw Consent: You may withdraw consent to non-essential processing at any time without affecting the lawfulness of prior processing.",
              "Right to Grievance Redressal: You have the right to file a complaint with our Grievance Officer (details below) or with the Data Protection Board of India.",
              "Right to Nominate: You may nominate another individual to exercise your rights on your behalf in the event of your death or incapacity.",
            ]} />
            <P>
              To exercise any of these rights, please email us at <strong>{CONTACT_EMAIL}</strong>. We will respond within <strong>30 days</strong> of receiving a verifiable request.
            </P>

            {/* Children */}
            <SectionHeading id="children" title="Children's Privacy" />
            <P>
              MockSetu is intended for students aged <strong>13 years and above</strong>. We do not knowingly collect personal data from children under 13. If a parent or guardian believes their child under 13 has created an account or provided personal data, they should contact us immediately at <strong>{CONTACT_EMAIL}</strong> and we will delete the data promptly.
            </P>
            <P>
              For students aged 13–18, we encourage parental awareness of the Platform. We collect only the minimum data necessary and do not engage in targeted advertising or profiling of minors.
            </P>

            {/* Grievance */}
            <SectionHeading id="grievance" title="Grievance Officer (India)" />
            <P>
              As mandated under Rule 5(9) of the IT (SPDI) Rules, 2011, and the DPDP Act, 2023, we have designated a Grievance Officer to address concerns relating to your personal data:
            </P>
            <div className="rounded-2xl border border-border/60 bg-secondary/40 p-5 mb-6 text-[14px] leading-[1.8] text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">MockSetu — Grievance Officer</p>
              <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
              <p>Response time: within 30 days of receipt of complaint</p>
              <p>Platform: mocksetu.in</p>
            </div>
            <P>
              If you are not satisfied with our response, you have the right to approach the <strong>Data Protection Board of India</strong> once it becomes fully operational under the DPDP Act, 2023.
            </P>

            {/* Changes */}
            <SectionHeading id="changes" title="Changes to This Policy" />
            <P>
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, or applicable law. When we make material changes, we will:
            </P>
            <UL items={[
              "Update the 'Effective Date' at the top of this page.",
              "Display a prominent notice on the Platform or send an email notification to registered users.",
              "Where required by law, seek fresh consent for new processing activities.",
            ]} />
            <P>
              Continued use of the Platform after the effective date of the revised Policy constitutes acceptance of the changes.
            </P>

            {/* Contact */}
            <SectionHeading id="contact" title="Contact Us" />
            <P>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please reach out:
            </P>
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-5 text-[14px] leading-[1.8] text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">MockSetu Privacy Team</p>
              <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
              <p>Website: <a href="https://mocksetu.in" className="text-primary hover:underline">mocksetu.in</a></p>
            </div>

            <div className="mt-12 pt-6 border-t border-border/50 flex flex-col sm:flex-row gap-3 justify-between items-start text-[13px] text-muted-foreground/60">
              <span>© 2025 MockSetu. All rights reserved.</span>
              <Link to="/terms-of-service" className="text-primary hover:underline font-medium">Read our Terms of Service →</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Back to top */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-8 z-50 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
