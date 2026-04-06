import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, BookOpen, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳" },
];

type Exam = {
    id: string;
    name: string;
    description: string | null;
    description_translations?: Record<string, string> | null;
    instruction: string | null;
    instruction_translations?: Record<string, string> | null;
    user_id: string;
    published_languages?: string[];
    supported_languages?: string[];
};

const ExamIntro = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { toast } = useToast();
    const [exam, setExam] = useState<Exam | null>(null);
    const [loading, setLoading] = useState(true);
    const [allSections, setAllSections] = useState<any[]>([]);
    const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
    const [publishedLanguages, setPublishedLanguages] = useState<string[]>([]);

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
            const examRecord = examData as unknown as Exam;
            setExam(examRecord);

            const isEditPreview = searchParams.get("from") === "edit";
            const requestedLang = searchParams.get("lang");

            const pubLangs = isEditPreview 
                ? ((examData as any).supported_languages || ["en"]) 
                : ((examData as any).published_languages || ["en"]);
            
            setPublishedLanguages(pubLangs);

            // Auto-select language from URL if present and valid
            if (requestedLang && pubLangs.includes(requestedLang)) {
                setSelectedLanguage(requestedLang);
            } else if (pubLangs.length === 1) {
                // If only one language, auto-select it
                setSelectedLanguage(pubLangs[0]);
            }

            // Fetch ALL Sections
            const { data: sections, error: sectionsError } = await supabase
                .from("sections")
                .select("id, language, sort_order")
                .eq("exam_id", examId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });

            if (sectionsError) throw sectionsError;

            setAllSections(sections || []);
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
        const lang = selectedLanguage || "en";

        // Find the first section matching the selected language
        const langSections = allSections.filter(s => (s as any).language === lang);

        // Fallback: if no sections match (legacy data), use first section
        const firstSection = langSections.length > 0
            ? langSections[0]
            : allSections[0];

        if (firstSection) {
            navigate(`/exam/${examId}/section/${firstSection.id}/simulator?lang=${lang}`);
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

    const isMultiLang = publishedLanguages.length > 1;
    const displayLanguage = selectedLanguage || publishedLanguages[0] || "en";

    const displayDescription = 
        (exam.description_translations && exam.description_translations[displayLanguage]) || 
        (exam.description_translations && exam.description_translations['en']) || 
        exam.description;

    const displayInstruction = 
        (exam.instruction_translations && exam.instruction_translations[displayLanguage]) || 
        (exam.instruction_translations && exam.instruction_translations['en']) || 
        exam.instruction;

    return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-background">
            {/* Subtle ambient orbs */}
            <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-[#6C3EF4]/6 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-[#A855F7]/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 w-full max-w-2xl">
                {/* Brand bar */}
                <div className="flex items-center justify-between mb-6">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {fromPage === "marketplace" ? "Back to Exam Library" : "Back to Dashboard"}
                    </button>
                    <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                            <defs>
                                <linearGradient id="intro-logo" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#6C3EF4" /><stop offset="100%" stopColor="#A855F7" />
                                </linearGradient>
                            </defs>
                            <path d="M3 22 C3 22 3 10 8.5 10 C10.5 10 12 12 14 14 C16 12 17.5 10 19.5 10 C25 10 25 22 25 22" stroke="url(#intro-logo)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <path d="M7 22 C7 22 7 14 11 14 C12.5 14 13.2 15.5 14 17 C14.8 15.5 15.5 14 17 14 C21 14 21 22 21 22" stroke="url(#intro-logo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
                        </svg>
                        <span className="text-sm font-bold text-foreground tracking-tight">
                            Mock<span className="bg-gradient-to-r from-[#6C3EF4] to-[#A855F7] bg-clip-text text-transparent">Setu</span>
                        </span>
                    </div>
                </div>

                {/* Main card */}
                <div className="rounded-2xl border border-border/60 bg-card shadow-xl overflow-hidden">
                    {/* Header gradient bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-[#6C3EF4] via-[#8B5CF6] to-[#A855F7]" />

                    <div className="p-7 space-y-6">
                        {/* Exam title & description */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-[#A855F7] uppercase tracking-widest bg-[#6C3EF4]/10 border border-[#6C3EF4]/20 px-2 py-0.5 rounded-full">Exam</span>
                            </div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight">{exam.name}</h1>
                            {displayDescription && (
                                <p className="text-muted-foreground mt-2 text-base leading-relaxed">{displayDescription}</p>
                            )}
                        </div>

                        {/* Instructions */}
                        {displayInstruction && (
                            <div className="rounded-xl border border-[#6C3EF4]/20 bg-[#6C3EF4]/5 p-4 space-y-2">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <BookOpen className="h-4 w-4 text-[#A855F7]" />
                                    Instructions
                                </h3>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{displayInstruction}</p>
                            </div>
                        )}

                        {/* Language Selection for Multi-Language Exams */}
                        {isMultiLang && (
                            <div className="rounded-xl border border-border/60 bg-secondary/30 p-4 space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                                    <Globe className="h-4 w-4 text-[#6C3EF4]" />
                                    Choose Your Language
                                </h3>
                                <p className="text-xs text-muted-foreground">This exam is available in multiple languages. Select your preferred language to begin.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {publishedLanguages.map((langCode) => {
                                        const langInfo = AVAILABLE_LANGUAGES.find(l => l.code === langCode);
                                        const isSelected = selectedLanguage === langCode;
                                        return (
                                            <button
                                                key={langCode}
                                                onClick={() => setSelectedLanguage(langCode)}
                                                className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                                                    isSelected
                                                        ? "border-[#6C3EF4] bg-[#6C3EF4]/8 shadow-sm shadow-[#6C3EF4]/15"
                                                        : "border-border/50 bg-card hover:border-[#6C3EF4]/40 hover:bg-secondary/50"
                                                }`}
                                            >
                                                <span className="text-xl">{langInfo?.flag || "🌐"}</span>
                                                <div className="flex-1">
                                                    <div className="font-semibold text-foreground text-sm">{langInfo?.label || langCode}</div>
                                                    {langInfo?.nativeLabel && langInfo.nativeLabel !== langInfo.label && (
                                                        <div className="text-xs text-muted-foreground">{langInfo.nativeLabel}</div>
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <div className="h-5 w-5 rounded-full bg-[#6C3EF4] flex items-center justify-center shrink-0">
                                                        <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Start button */}
                        <div className="pt-2 border-t border-border/40">
                            <button
                                onClick={handleStartExam}
                                disabled={allSections.length === 0 || (isMultiLang && !selectedLanguage)}
                                className="w-full h-12 rounded-xl bg-[#6C3EF4] hover:bg-[#5B2FE3] text-white font-semibold text-base shadow-lg shadow-[#6C3EF4]/30 hover:shadow-xl hover:shadow-[#6C3EF4]/40 hover:-translate-y-[1px] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                            >
                                <BookOpen className="h-5 w-5" />
                                {isMultiLang && !selectedLanguage ? "Select a Language to Start" : "Start Exam"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamIntro;

