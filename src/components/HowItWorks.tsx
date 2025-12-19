import { Card } from "@/components/ui/card";
import { Upload, FileSearch, Edit, Play, BarChart } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Upload Your PDF",
    description: "Drop your exam paper PDF - JEE, NEET, CAT, or any test format"
  },
  {
    icon: FileSearch,
    number: "02",
    title: "AI Extracts Questions",
    description: "Our smart parser identifies questions, options, and diagrams accurately"
  },
  {
    icon: Edit,
    number: "03",
    title: "Review & Fix",
    description: "Use the manual editor to verify and correct any parsing issues"
  },
  {
    icon: Play,
    number: "04",
    title: "Take the Exam",
    description: "Experience realistic conditions with timers and CAT-style navigation"
  },
  {
    icon: BarChart,
    number: "05",
    title: "Analyze Results",
    description: "Get detailed analytics on accuracy, timing, and improvement areas"
  }
];

const HowItWorks = () => {
  return (
    <section className="py-24 px-6 bg-secondary">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-foreground">
            How It Works
          </h2>
          <p className="text-xl text-muted-foreground">
            Five simple steps from PDF to performance insights
          </p>
        </div>

        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-20 left-0 right-0 h-0.5 bg-border" />
          
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-8 relative">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="p-6 text-center space-y-4 h-full bg-card hover:shadow-lg transition-shadow">
                  <div className="mx-auto w-16 h-16 rounded-full bg-gradient-hero flex items-center justify-center shadow-glow">
                    <step.icon className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-mono font-bold text-primary">{step.number}</div>
                    <h3 className="font-bold text-lg">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
