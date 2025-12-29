import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BookOpen, Store, Search, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";

type Exam = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    is_published: boolean;
    exam_category: string | null;
};

import { useUserRole } from "@/hooks/use-user-role";

const Marketplace = () => {
    const { role, loading: roleLoading } = useUserRole();
    const [exams, setExams] = useState<Exam[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const uniqueCategories = Array.from(new Set(exams.map(e => e.exam_category).filter(Boolean))) as string[];
    const categoryOptions = uniqueCategories.map(c => ({ label: c, value: c }));

    useEffect(() => {
        fetchPublishedExams();
    }, []);

    const fetchPublishedExams = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("exams")
            .select("*")
            .eq("is_published", true)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error loading exams:", error);
        } else {
            setExams(data || []);
        }
        setLoading(false);
    };

    const handleTakeExam = (examId: string) => {
        navigate(`/exam/${examId}/intro?from=marketplace`);
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar navButtonLabel="Analytics" navButtonLink="/analytics?from=marketplace" />

            <main className="container mx-auto max-w-7xl px-6 py-8">
                {/* Back Button */}
                <Button
                    variant="ghost"
                    onClick={() => navigate("/")}
                    className="mb-4 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Home
                </Button>

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Store className="h-8 w-8 text-primary" />
                            <h1 className="text-3xl font-bold text-foreground">Marketplace</h1>
                        </div>
                        <p className="text-muted-foreground">Browse and take public exams shared by the community</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="flex gap-4 flex-1">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by title..."
                                className="pl-8"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button>Search</Button>
                    </div>
                    <div className="w-full md:w-64">
                        <MultiSelectDropdown
                            options={categoryOptions}
                            selected={selectedCategories}
                            onChange={setSelectedCategories}
                            placeholder="Filter by category"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <p className="text-muted-foreground">Loading exams...</p>
                    </div>
                ) : exams.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No exams available</h3>
                            <p className="text-muted-foreground mb-4">Check back later for public exams</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {exams.filter(exam => {
                            const query = searchQuery.toLowerCase();
                            const nameMatch = exam.name.toLowerCase().includes(query);
                            const categoryMatch = exam.exam_category?.toLowerCase().includes(query);
                            const textMatch = nameMatch || categoryMatch;

                            const filterMatch = selectedCategories.length === 0 || (exam.exam_category && selectedCategories.includes(exam.exam_category));

                            return textMatch && filterMatch;
                        }).map((exam) => (
                            <Card key={exam.id} className="flex flex-col justify-between">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-xl font-bold">{exam.name}</CardTitle>
                                            {exam.exam_category && (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    {exam.exam_category}
                                                </Badge>
                                            )}
                                        </div>
                                        <CardDescription>{exam.description || "No description"}</CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="mt-4">
                                    <div className="flex gap-3">
                                        <Button
                                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                                            onClick={() => handleTakeExam(exam.id)}
                                        >
                                            <BookOpen className="mr-2 h-4 w-4" />
                                            Take Exam
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Marketplace;
