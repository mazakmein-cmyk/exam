import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Edit3, Timer, BarChart3, FileCheck, Zap } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Smart PDF Upload",
    description: "Upload exam PDFs and let our AI extract questions, options, and diagrams with precision.",
    color: "text-primary"
  },
  {
    icon: Edit3,
    title: "Manual Editor",
    description: "Review and fix any parsing errors before starting your exam. Full control over questions.",
    color: "text-success"
  },
  {
    icon: Timer,
    title: "Section Timers",
    description: "Experience realistic exam conditions with per-section countdown timers and auto-submit.",
    color: "text-warning"
  },
  {
    icon: FileCheck,
    title: "Answer Key Support",
    description: "Upload answer keys anytime - during or after the exam - for instant grading and feedback.",
    color: "text-destructive"
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Track time per question, accuracy trends, and compare performance across multiple attempts.",
    color: "text-status-visited"
  },
  {
    icon: Zap,
    title: "CAT-Style Interface",
    description: "Question palette, mark for review, navigation shortcuts - everything you need for exam success.",
    color: "text-accent"
  }
];

const Features = () => {
  return (
    <section className="py-24 px-6 bg-background">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl font-bold text-foreground">
            Everything You Need to Ace Your Exams
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            From upload to analytics, ExamSim provides a complete exam preparation platform
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:shadow-md transition-all hover:-translate-y-1">
              <CardHeader>
                <feature.icon className={`h-12 w-12 mb-4 ${feature.color}`} />
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
