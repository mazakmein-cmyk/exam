import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTA = () => {
  return (
    <section className="py-24 px-6 bg-gradient-hero">
      <div className="container mx-auto max-w-4xl text-center">
        <div className="space-y-8">
          <h2 className="text-4xl lg:text-5xl font-bold text-primary-foreground">
            Ready to Transform Your Exam Prep?
          </h2>
          <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto">
            Join thousands of students using ExamSim to practice with realistic mock exams and improve their performance.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button size="lg" variant="secondary" className="shadow-lg text-lg px-8">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-primary-foreground/70">
            No credit card required • Upload your first exam in under 2 minutes
          </p>
        </div>
      </div>
    </section>
  );
};

export default CTA;
