import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Exam = {
    id: string;
    name: string;
    description: string | null;
    instruction: string | null;
    user_id: string;
};

const ExamIntro = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const [exam, setExam] = useState<Exam | null>(null);
    const [loading, setLoading] = useState(true);
    const [firstSectionId, setFirstSectionId] = useState<string | null>(null);

    const fromPage = searchParams.get("from");

    useEffect(() => {
        if (examId) {
            fetchExamData();
        }
    }, [examId]);

    const fetchExamData = async () => {
        try {
            setLoading(true);
            // Fetch Exam
            const { data: examData, error: examError } = await supabase
                .from("exams")
                .select("*")
                .eq("id", examId)
                .single();

            if (examError) throw examError;
            setExam(examData as unknown as Exam);

            // Fetch First Section
            const { data: sections, error: sectionsError } = await supabase
                .from("sections")
                .select("id")
                .eq("exam_id", examId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true })
                .limit(1);

            if (sectionsError) throw sectionsError;

            if (sections && sections.length > 0) {
                setFirstSectionId(sections[0].id);
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: "Failed to load exam details",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleStartExam = () => {
        if (firstSectionId) {
            navigate(`/exam/${examId}/section/${firstSectionId}/simulator`);
        } else {
            toast({
                title: "No sections",
                description: "This exam has no sections to start.",
                variant: "destructive",
            });
        }
    };

    const handleBack = () => {
        if (fromPage === "marketplace") {
            navigate("/marketplace");
        } else {
            navigate("/dashboard");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">Loading exam details...</div>
            </div>
        );
    }

    if (!exam) return null;

    return (
        <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
            <Card className="max-w-2xl w-full">
                <CardHeader>
                    <div className="flex items-center gap-4 mb-4">
                        <Button variant="ghost" size="icon" onClick={handleBack}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <CardTitle className="text-2xl">Exam Instructions</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-primary">{exam.name}</h1>
                        {exam.description && (
                            <p className="text-muted-foreground text-lg">{exam.description}</p>
                        )}
                    </div>

                    {exam.instruction && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-2">
                            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                                <BookOpen className="h-4 w-4" />
                                Instructions
                            </h3>
                            <p className="text-blue-800 whitespace-pre-wrap">{exam.instruction}</p>
                        </div>
                    )}

                    <div className="pt-6 border-t flex justify-end">
                        <Button
                            size="lg"
                            className="w-full sm:w-auto text-lg px-8"
                            onClick={handleStartExam}
                            disabled={!firstSectionId}
                        >
                            Start Exam
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ExamIntro;
