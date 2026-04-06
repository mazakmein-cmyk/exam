import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BookOpen, Store, Search, ArrowLeft, Share2, MoreVertical } from "lucide-react";
import Navbar from "@/components/Navbar";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import OnboardingModal from "@/components/OnboardingModal";

type Exam = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    is_published: boolean;
    exam_category: string | null;
    user_id: string;
    creator_username?: string;
};

import { useUserRole } from "@/hooks/use-user-role";

const Marketplace = () => {
    const { role, loading: roleLoading } = useUserRole();
    const { toast } = useToast();
    const [exams, setExams] = useState<Exam[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const navigate = useNavigate();

    const uniqueCategories = Array.from(new Set(exams.map(e => e.exam_category).filter(Boolean))) as string[];
    const categoryOptions = uniqueCategories.map(c => ({ label: c, value: c }));

    useEffect(() => {
        const checkProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (!profile) {
                    setShowOnboardingModal(true);
                }
            }
        };

        checkProfile();
        fetchPublishedExams();
    }, []);

    const fetchPublishedExams = async () => {
        setLoading(true);
        const { data: examsData, error } = await supabase
            .from("exams")
            .select("*")
            .eq("is_published", true)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error loading exams:", error);
            setExams([]);
        } else {
            // Fetch creator profiles
            const userIds = [...new Set(examsData.map(exam => exam.user_id))];

            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', userIds);

                const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);

                const examsWithUsernames = examsData.map(exam => ({
                    ...exam,
                    creator_username: profileMap.get(exam.user_id) || 'Unknown'
                }));

                setExams(examsWithUsernames);
            } else {
                setExams(examsData);
            }
        }
        setLoading(false);
    };

    const handleTakeExam = (examId: string) => {
        window.open(`/exam/${examId}/intro?from=marketplace`, '_blank');
    };

    const handleShare = (examId: string) => {
        const url = `${window.location.origin}/exam/${examId}/intro`;
        navigator.clipboard.writeText(url);
        toast({
            title: "Link copied",
            description: "The exam link has been copied to your clipboard.",
        });
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar navButtonLabel="Analytics" navButtonLink="/analytics?from=marketplace" />
            <OnboardingModal
                isOpen={showOnboardingModal}
                onComplete={() => setShowOnboardingModal(false)}
            />

            <main className="container mx-auto max-w-7xl px-6 py-8">
                {/* Back Button */}
                <button
                    onClick={() => navigate("/")}
                    className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Home
                </button>

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 text-[11px] font-semibold text-[#A855F7] uppercase tracking-wider">Public Library</span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Exam Library</h1>
                        <p className="text-muted-foreground text-sm mt-1">Browse and take mock exams shared by the community</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 mb-8">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by title or category..."
                            className="pl-10 h-11 rounded-xl border-border/60 bg-card/60 focus-visible:border-[#6C3EF4]/40"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-56">
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
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {exams.filter(exam => {
                            const query = searchQuery.toLowerCase();
                            const nameMatch = exam.name.toLowerCase().includes(query);
                            const categoryMatch = exam.exam_category?.toLowerCase().includes(query);
                            const textMatch = nameMatch || categoryMatch;
                            const filterMatch = selectedCategories.length === 0 || (exam.exam_category && selectedCategories.includes(exam.exam_category));
                            return textMatch && filterMatch;
                        }).map((exam) => (
                            <div key={exam.id} className="group flex flex-col justify-between rounded-xl border border-border/60 bg-card hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-foreground break-words leading-tight mb-1">{exam.name}</h3>
                                            {exam.exam_category && (
                                                <Badge variant="secondary" className="text-[10px] font-medium">{exam.exam_category}</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleShare(exam.id)}>
                                                <Share2 className="h-3.5 w-3.5" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                        <MoreVertical className="h-3.5 w-3.5" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleTakeExam(exam.id)}>View Details</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{exam.description || "No description provided."}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        by <span className="font-semibold text-[#6C3EF4]">{exam.creator_username || "Unknown"}</span>
                                    </p>
                                </div>
                                <div className="px-5 pb-5">
                                    <button
                                        onClick={() => handleTakeExam(exam.id)}
                                        className="w-full h-9 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-sm shadow-md shadow-[#6C3EF4]/20 hover:shadow-[#6C3EF4]/30 hover:-translate-y-px transition-all duration-200 flex items-center justify-center gap-2"
                                    >
                                        <BookOpen className="h-4 w-4" />
                                        Take Exam
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Marketplace;
