import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const Index = () => {
  return (
    <div className="min-h-screen">
      <SEO
        title="MockSetu — Free Mock Test & Exam Simulator for JEE, NEET, CAT, GATE, UPSC"
        description="MockSetu is a free online mock test platform and exam simulator. Take timed JEE, NEET, CAT, GATE, and UPSC mocks with deep analytics, instant scoring, and real exam-day conditions."
        path="/"
        keywords="MockSetu, Mockset, mock test, free mock test, online mock test, exam simulator, JEE mock test, NEET mock test, CAT mock test, GATE mock test, UPSC mock test, test series"
      />
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
