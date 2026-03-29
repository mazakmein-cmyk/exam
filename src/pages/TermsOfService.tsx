import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { FileText, ChevronRight, ArrowUp } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const EFFECTIVE_DATE = "30 March 2025";
const CONTACT_EMAIL = "legal@mocksetu.in";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "eligibility", label: "Eligibility" },
  { id: "accounts", label: "Accounts & Access" },
  { id: "student-terms", label: "Student Terms" },
  { id: "creator-terms", label: "Creator Terms" },
  { id: "content-standards", label: "Content Standards" },
  { id: "ip", label: "Intellectual Property" },
  { id: "prohibited", label: "Prohibited Conduct" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "termination", label: "Termination" },
  { id: "governing-law", label: "Governing Law" },
  { id: "dispute", label: "Dispute Resolution" },
  { id: "general", label: "General Provisions" },
  { id: "contact", label: "Contact" },
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

const Callout = ({ type, children }: { type: "warning" | "info"; children: React.ReactNode }) => {
  const styles = {
    warning: "border-amber-500/25 bg-amber-500/[0.05] text-amber-700 dark:text-amber-400",
    info: "border-primary/20 bg-primary/[0.04] text-primary/80",
  };
  return (
    <div className={`rounded-xl border p-4 mb-5 text-[13.5px] leading-[1.7] ${styles[type]}`}>
      {children}
    </div>
  );
};

const TermsOfService = () => {
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
          <FileText className="h-7 w-7 text-[#6C3EF4]" />
        </div>
        <h1 className="text-[36px] sm:text-[48px] font-black text-white tracking-[-0.03em] leading-tight">
          Terms of Service
        </h1>
        <p className="mt-3 text-white/40 text-[15px] max-w-xl mx-auto">
          These terms form a legally binding agreement between you and MockSetu. Please read them carefully before using the Platform.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-white/30">
          <span>Effective: {EFFECTIVE_DATE}</span>
          <span className="opacity-40">·</span>
          <span>Applies to: Students &amp; Creators</span>
          <span className="opacity-40">·</span>
          <span>Governing Law: India</span>
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
                    }`}
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
            <SectionHeading id="overview" title="Overview & Acceptance" />
            <P>
              Welcome to <strong>MockSetu</strong>. These Terms of Service ("Terms") govern your access to and use of the MockSetu website, platform, and services (collectively, the "Platform"), operated by MockSetu ("we," "us," or "our").
            </P>
            <P>
              By registering an account, clicking "I Agree," or otherwise accessing or using the Platform, you acknowledge that you have read, understood, and agree to be bound by these Terms, along with our <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link>, which is incorporated herein by reference.
            </P>
            <Callout type="warning">
              <strong>Important:</strong> If you do not agree to these Terms, you must immediately cease using the Platform. These Terms constitute a legally binding contract under the Indian Contract Act, 1872, and the Information Technology Act, 2000.
            </Callout>

            {/* Eligibility */}
            <SectionHeading id="eligibility" title="Eligibility" />
            <P>
              To use MockSetu, you must:
            </P>
            <UL items={[
              "Be at least 13 years of age. Users between 13 and 18 years of age must have the consent of a parent or legal guardian.",
              "Have the legal capacity to enter into a binding agreement under applicable law.",
              "Not be barred from using the Platform under the laws of India or any other applicable jurisdiction.",
              "Not have previously been suspended or removed from the Platform by MockSetu.",
            ]} />
            <P>
              If you are registering as a creator on behalf of an institution, coaching centre, or organisation, you represent and warrant that you have the authority to bind that entity to these Terms.
            </P>

            {/* Accounts */}
            <SectionHeading id="accounts" title="Accounts &amp; Access" />
            <P>
              You must provide accurate, current, and complete information during registration and keep your account information updated. You are solely responsible for:
            </P>
            <UL items={[
              "Maintaining the confidentiality of your account credentials (email, password, OAuth tokens).",
              "All activities that occur under your account, whether or not authorised by you.",
              "Immediately notifying us at legal@mocksetu.in if you suspect unauthorised use of your account.",
            ]} />
            <P>
              MockSetu is not liable for any loss or damage arising from your failure to maintain the security of your account. We reserve the right to terminate or suspend accounts that show signs of compromise or abuse.
            </P>

            {/* Student Terms */}
            <SectionHeading id="student-terms" title="Student-Specific Terms" />
            <div className="flex items-center gap-2 mb-4">
              <TagBadge label="STUDENTS" color="#6C3EF4" />
            </div>
            <P>
              As a student using MockSetu, you agree to the following additional terms:
            </P>
            <UL items={[
              "Academic Integrity: You will not share exam questions, answer keys, or question content obtained via MockSetu with other students or on any public platform unless the creator has explicitly permitted such sharing.",
              "Personal Use Only: Your access to exams and analytics is for your personal educational use only. You may not resell, sublicense, or commercially exploit access to any exam content.",
              "Results Disclaimer: Scores obtained on MockSetu are for practice purposes only. They do not guarantee similar performance in official examinations. MockSetu makes no representation regarding score accuracy relative to actual exam performance.",
              "Fair Use of Platform: You will not use automated scripts, bots, or any means to artificially complete exams, manipulate timers, or inflate analytics.",
              "Feedback Participation: You may optionally provide feedback on exams. By doing so, you grant MockSetu a non-exclusive, royalty-free licence to use such feedback to improve the Platform.",
            ]} />

            {/* Creator Terms */}
            <SectionHeading id="creator-terms" title="Creator-Specific Terms" />
            <div className="flex items-center gap-2 mb-4">
              <TagBadge label="CREATORS" color="#10B981" />
            </div>
            <P>
              As a creator publishing content on MockSetu, you agree to the following additional terms:
            </P>
            <UL items={[
              "Content Ownership & Licence: You retain all intellectual property rights in exam content you create and upload. By publishing content on MockSetu, you grant us a non-exclusive, worldwide, royalty-free, sublicensable licence to host, display, distribute, and deliver your content to students via the Platform for as long as the content is published.",
              "Original Content: You represent and warrant that all exam content you upload is your original work or that you have obtained all necessary licences, permissions, and rights to publish it. You must not upload questions from proprietary sources (e.g., official IIT JEE papers, UPSC question papers) without appropriate authorisation.",
              "Copyright Compliance: You must not upload content that infringes the copyright, trademarks, trade secrets, or any other intellectual property rights of any third party, including official examination boards, publishers, or coaching institutes.",
              "Accuracy of Content: You are solely responsible for the accuracy, completeness, and quality of questions, answer keys, and marking schemes you publish. MockSetu does not verify or endorse the accuracy of creator content.",
              "No Harmful Content: You must not publish content that is defamatory, obscene, hateful, discriminatory, politically biased, or otherwise unlawful.",
              "Unpublishing: MockSetu reserves the right to unpublish, remove, or restrict access to any content that violates these Terms, without prior notice, at our sole discretion.",
              "Indemnification for Content: You agree to indemnify MockSetu against all claims, losses, and legal costs arising from your content, including but not limited to copyright infringement claims.",
              "Creator Credentials: Your public creator username is displayed on your exams. You must ensure this does not impersonate any real person, institution, or brand.",
            ]} />

            {/* Content Standards */}
            <SectionHeading id="content-standards" title="Content Standards" />
            <P>
              All content published or submitted on MockSetu — by students or creators — must comply with the following standards:
            </P>
            <UL items={[
              "Must not violate any applicable law, regulation, or judicial order in India or internationally.",
              "Must not infringe any third party's intellectual property or privacy rights.",
              "Must not contain malware, viruses, or any code designed to disrupt, damage, or gain unauthorised access to any system.",
              "Must not be sexually explicit, obscene, or otherwise offensive.",
              "Must not promote violence, terrorism, self-harm, or illegal activities.",
              "Must not contain personally identifiable information of any third party without their consent.",
              "Must not be used to conduct phishing, scams, or any fraudulent activities.",
            ]} />
            <P>
              MockSetu reserves the right to remove any content that violates these standards without notice and to report such violations to the appropriate authorities.
            </P>

            {/* IP */}
            <SectionHeading id="ip" title="Intellectual Property" />
            <P>
              All rights, title, and interest in and to the MockSetu Platform, including its design, software, brand name, logo, visual elements, algorithms, and aggregated data, are owned exclusively by MockSetu or its licensors. Nothing in these Terms transfers any ownership rights to you.
            </P>
            <P>
              The MockSetu name, "Bridge M" logo, and associated marks are trademarks or service marks of MockSetu. You may not use them without our prior written consent.
            </P>
            <P>
              Student-generated data (your exam attempts, answers, and analytics) remains yours. You grant us a limited licence to process and display this data to you via the Platform. We will not commercially exploit this data in any identifiable form.
            </P>

            {/* Prohibited Conduct */}
            <SectionHeading id="prohibited" title="Prohibited Conduct" />
            <P>You agree not to:</P>
            <UL items={[
              "Attempt to access, probe, or test the vulnerability of any MockSetu system or network without authorisation.",
              "Use the Platform to harvest, scrape, or collect data from other users without their consent.",
              "Reverse engineer, decompile, or disassemble any portion of the Platform's software.",
              "Circumvent any security, authentication, or access control mechanism of the Platform.",
              "Use automated tools, bots, crawlers, or scripts to access, interact with, or extract data from the Platform.",
              "Impersonate any person or entity, or misrepresent your affiliation with any person or entity.",
              "Interfere with or disrupt the integrity or performance of the Platform or its infrastructure.",
              "Attempt to gain unauthorised access to accounts, data, or systems of other users.",
              "Engage in any activity that could constitute a criminal or civil offence under Indian law.",
            ]} />

            {/* Disclaimers */}
            <SectionHeading id="disclaimers" title="Disclaimers" />
            <Callout type="warning">
              The Platform is provided on an <strong>"AS IS" and "AS AVAILABLE"</strong> basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement.
            </Callout>
            <P>
              MockSetu does not warrant that:
            </P>
            <UL items={[
              "The Platform will be uninterrupted, error-free, or completely secure.",
              "Any exam content published by creators is accurate, complete, or error-free.",
              "Practice scores on MockSetu will predict or guarantee performance in official examinations.",
              "The Platform will meet your specific educational requirements.",
            ]} />
            <P>
              We are an educational technology platform. We are not an examination board, tutoring service, or accredited educational institution. Decisions about your education should not be made solely based on MockSetu analytics.
            </P>

            {/* Liability */}
            <SectionHeading id="liability" title="Limitation of Liability" />
            <P>
              To the maximum extent permitted by applicable law, MockSetu, its directors, employees, agents, or partners shall not be liable for:
            </P>
            <UL items={[
              "Any indirect, incidental, consequential, special, punitive, or exemplary damages.",
              "Loss of profits, revenue, data, goodwill, or other intangible losses.",
              "Damages arising from your use of or inability to use the Platform.",
              "Unauthorised access to or alteration of your data by third parties.",
              "Errors or omissions in creator-uploaded exam content.",
              "Any exam performance outcomes or career consequences resulting from use of the Platform.",
            ]} />
            <P>
              In jurisdictions that do not permit the exclusion of certain warranties or limitation of liability, our liability is limited to the maximum extent permitted by law. In all cases, our total aggregate liability to you shall not exceed <strong>INR 1,000 (Rupees One Thousand Only)</strong>, or the amount you paid to us in the preceding 12 months, whichever is higher.
            </P>

            {/* Indemnification */}
            <SectionHeading id="indemnification" title="Indemnification" />
            <P>
              You agree to defend, indemnify, and hold harmless MockSetu, its officers, directors, employees, contractors, and agents from and against any and all claims, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or related to:
            </P>
            <UL items={[
              "Your violation of these Terms.",
              "Your use or misuse of the Platform.",
              "Any content you upload, publish, or submit on the Platform.",
              "Your violation of any third party's rights, including intellectual property or privacy rights.",
              "Any misrepresentation made by you.",
            ]} />

            {/* Termination */}
            <SectionHeading id="termination" title="Termination" />
            <P>
              These Terms remain in effect as long as you use the Platform.
            </P>
            <P>
              <strong>By You:</strong> You may terminate your account at any time by using the account deletion option in your settings or by contacting us at <strong>{CONTACT_EMAIL}</strong>. Termination does not relieve you of obligations arising before termination.
            </P>
            <P>
              <strong>By MockSetu:</strong> We reserve the right to suspend or permanently terminate your access to the Platform, with or without notice, if we determine in our sole discretion that:
            </P>
            <UL items={[
              "You have violated any provision of these Terms.",
              "Your continued use poses a security or legal risk to MockSetu or other users.",
              "We are required to do so by law or a judicial order.",
              "You have engaged in fraudulent, abusive, or harmful behaviour.",
            ]} />
            <P>
              Upon termination, all licences granted to you cease immediately. Provisions that by their nature should survive termination (including IP rights, indemnification, limitation of liability, and governing law) shall survive.
            </P>

            {/* Governing Law */}
            <SectionHeading id="governing-law" title="Governing Law" />
            <P>
              These Terms shall be governed by and construed in accordance with the laws of <strong>India</strong>, without regard to its conflict-of-law principles. The exclusive jurisdiction for any dispute arising under or in connection with these Terms shall be the competent courts located in <strong>India</strong>, unless otherwise agreed by the parties.
            </P>
            <P>
              The following Indian laws are specifically applicable to the extent relevant: Information Technology Act, 2000; Information Technology (Amendment) Act, 2008; Digital Personal Data Protection Act, 2023; Indian Contract Act, 1872; Copyright Act, 1957.
            </P>

            {/* Dispute Resolution */}
            <SectionHeading id="dispute" title="Dispute Resolution" />
            <P>
              We encourage you to contact us first at <strong>{CONTACT_EMAIL}</strong> to resolve any dispute informally. We will make a good-faith effort to resolve complaints within <strong>30 days</strong>.
            </P>
            <P>
              <strong>Arbitration:</strong> If a dispute cannot be resolved informally, it shall be submitted to binding arbitration under the <strong>Arbitration and Conciliation Act, 1996</strong> (India). The arbitration shall be conducted by a sole arbitrator mutually agreed upon by the parties, and the seat of arbitration shall be India. The language of arbitration shall be English. The arbitrator's decision shall be final and binding.
            </P>
            <Callout type="info">
              <strong>Class Action Waiver:</strong> You and MockSetu agree that all disputes will be resolved individually and not as part of any class, consolidated, or representative action.
            </Callout>

            {/* General */}
            <SectionHeading id="general" title="General Provisions" />
            <UL items={[
              "Entire Agreement: These Terms, together with the Privacy Policy, constitute the entire agreement between you and MockSetu regarding the Platform and supersede all prior negotiations, agreements, and understandings.",
              "Severability: If any provision of these Terms is held invalid, illegal, or unenforceable, that provision shall be severed and the remaining provisions shall continue in full force and effect.",
              "No Waiver: Our failure to enforce any right or provision of these Terms shall not constitute a waiver of that right or provision.",
              "Assignment: You may not assign or transfer any rights or obligations under these Terms without our prior written consent. MockSetu may assign its rights and obligations freely.",
              "Force Majeure: MockSetu is not liable for any failure or delay in performance to the extent caused by circumstances beyond our reasonable control, including natural disasters, government actions, epidemics, internet outages, or third-party service failures.",
              "Notices: We may provide notices to you via the email address on your account. Notices to us should be sent to legal@mocksetu.in.",
              "Language: These Terms are written in English. Any translations are provided for convenience only; the English version governs.",
            ]} />

            {/* Contact */}
            <SectionHeading id="contact" title="Contact" />
            <P>
              For any questions about these Terms of Service, please contact our legal team:
            </P>
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-5 text-[14px] leading-[1.8] text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">MockSetu Legal Team</p>
              <p>Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
              <p>General: <a href="mailto:hello@mocksetu.in" className="text-primary hover:underline">hello@mocksetu.in</a></p>
              <p>Website: <a href="https://mocksetu.in" className="text-primary hover:underline">mocksetu.in</a></p>
            </div>

            <div className="mt-12 pt-6 border-t border-border/50 flex flex-col sm:flex-row gap-3 justify-between items-start text-[13px] text-muted-foreground/60">
              <span>© 2025 MockSetu. All rights reserved.</span>
              <Link to="/privacy-policy" className="text-primary hover:underline font-medium">Read our Privacy Policy →</Link>
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

export default TermsOfService;
