import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, BookOpen, Store, Search, ArrowLeft, Share2, MoreVertical, Radio, Plus } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { getVerificationTier } from "@/lib/verification";
import Navbar from "@/components/Navbar";
import SEO from "@/components/SEO";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { orderExamCategories } from "@/hooks/use-exam-categories";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import OnboardingModal from "@/components/OnboardingModal";
import JoinLiveExamDialog from "@/components/live/JoinLiveExamDialog";
import { fetchMyParticipatedLiveExams } from "@/services/liveExamService";

type Exam = {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    is_published: boolean;
    exam_category: string | null;
    user_id: string;
    creator_username?: string;
    creator_verified?: boolean;
    creator_gold?: boolean;
};

import { useUserRole } from "@/hooks/use-user-role";

/**
 * Category filters live in the URL so a filtered library is a shareable link.
 *
 * This is what the exam landing pages point at — /marketplace?category=SSC%20MTS
 * drops an aspirant straight into their own papers instead of the full library.
 * Accepts both ?category=A&category=B and ?category=A,B.
 */
const parseCategoryParam = (params: URLSearchParams): string[] => {
    const values = params
        .getAll("category")
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean);
    return Array.from(new Set(values));
};

/** "ssc-mts" and "ssc mts" both have to reach the "SSC MTS" a creator typed. */
const normalizeCategoryKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Snap URL-supplied categories onto the exact casing/spacing used by the exams
 * themselves. Without this the filter compares a hand-written query string
 * against a creator-entered category and silently matches nothing. Returns the
 * original array when nothing moved, so this can't trigger a pointless render.
 */
const canonicalizeCategories = (selected: string[], exams: Exam[]): string[] => {
    if (selected.length === 0) return selected;
    const known = new Map<string, string>();
    exams.forEach((e) => {
        if (e.exam_category) known.set(normalizeCategoryKey(e.exam_category), e.exam_category);
    });
    let changed = false;
    const next = selected.map((s) => {
        const hit = known.get(normalizeCategoryKey(s));
        if (hit && hit !== s) {
            changed = true;
            return hit;
        }
        return s;
    });
    return changed ? next : selected;
};

const Marketplace = () => {
    const { role, loading: roleLoading } = useUserRole();
    const { toast } = useToast();
    const [exams, setExams] = useState<Exam[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState("");
    // Seeded from the URL once, on mount — the landing pages link in pre-filtered.
    const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
        parseCategoryParam(searchParams)
    );
    const [loading, setLoading] = useState(true);
    const [showOnboardingModal, setShowOnboardingModal] = useState(false);
    const [activeTab, setActiveTab] = useState<"mock" | "live">("mock");
    const [liveExams, setLiveExams] = useState<any[]>([]);
    const [loadingLive, setLoadingLive] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const navigate = useNavigate();

    // Joining by code is a student action. Creators are bounced off this page by
    // use-user-role anyway, and a creator account cannot sit an exam at all
    // (see examAccess.ts) — so the button never offers them a dead end. `null`
    // is a visitor who hasn't signed in yet: they get the button, and the live
    // exam screen sends them through student auth and back to the room.
    const canJoinLive = role !== "creator";

    // Only show categories that actually have a published exam — no dead filter
    // options. (Creators still pick from the full admin list when tagging exams.)
    // The exception is a category that is already selected: a shared link can
    // arrive with ?category=X before any published exam carries X, and an option
    // you cannot see in the list is an option you cannot switch back off.
    const examCategories = Array.from(new Set([
        ...(exams.map(e => e.exam_category).filter(Boolean) as string[]),
        ...selectedCategories,
    ]));
    const categoryOptions = orderExamCategories(examCategories)
        .map(c => ({ label: c, value: c }));

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
        fetchLiveExamsData();
    }, []);

    const fetchLiveExamsData = async () => {
        setLoadingLive(true);
        try {
            const data = await fetchMyParticipatedLiveExams();
            setLiveExams(data);
        } catch (error) {
            console.error("Error fetching live exams:", error);
        } finally {
            setLoadingLive(false);
        }
    };

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
                // public_profiles, not profiles: RLS on the base table is own-row
                // only (20260803030000), so reading it here returns nothing and
                // every byline falls back to "Unknown".
                const { data: profiles } = await supabase
                    .from('public_profiles')
                    .select('id, username, is_verified, is_admin_gold')
                    .in('id', userIds);

                const profileMap = new Map(profiles?.map((p: any) => [p.id, { username: p.username, is_verified: p.is_verified, is_admin_gold: p.is_admin_gold }]) || []);

                const examsWithUsernames = examsData.map(exam => ({
                    ...exam,
                    creator_username: profileMap.get(exam.user_id)?.username || 'Unknown',
                    creator_verified: profileMap.get(exam.user_id)?.is_verified || false,
                    creator_gold: profileMap.get(exam.user_id)?.is_admin_gold || false
                }));

                setExams(examsWithUsernames);
            } else {
                setExams(examsData);
            }

            // Only now do we know the real category strings, so this is the first
            // point a URL-supplied filter can be matched to one. Functional update:
            // this runs inside a mount-time fetch and must not close over stale state.
            setSelectedCategories((prev) => canonicalizeCategories(prev, examsData as Exam[]));
        }
        setLoading(false);
    };

    // Keep the URL honest as the user edits filters, so the page they are looking
    // at is always the page they can copy out of the address bar. `replace` keeps
    // Back pointing at wherever they came from rather than at every filter tweak.
    const handleCategoryChange = (next: string[]) => {
        setSelectedCategories(next);
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                params.delete("category");
                next.forEach((c) => params.append("category", c));
                return params;
            },
            { replace: true }
        );
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

    const visibleExams = exams.filter(exam => {
        const query = searchQuery.toLowerCase();
        const nameMatch = exam.name.toLowerCase().includes(query);
        const categoryMatch = exam.exam_category?.toLowerCase().includes(query);
        const textMatch = nameMatch || categoryMatch;
        const filterMatch = selectedCategories.length === 0 || (exam.exam_category && selectedCategories.includes(exam.exam_category));
        return textMatch && filterMatch;
    });

    return (
        <div className="min-h-screen bg-background">
            <SEO
                title="Free Mock Test Library — JEE, NEET, CAT, GATE, UPSC | MockSetu (Mockset)"
                description="Browse the MockSetu (Mockset) free mock test library. Timed JEE, NEET, CAT, GATE & UPSC mocks with answer keys, instant scoring, and deep analytics. Practice unlimited online mock tests on the leading online assessment platform."
                path="/marketplace"
                keywords="mockset, MockSetu marketplace, mockset library, mock test library, free mock tests, online test series, JEE mock test, NEET mock test, CAT mock test, GATE mock test, UPSC mock test, exam practice papers, MCQ practice, online assessment platform, coding assessment library, aptitude preparation"
                jsonLd={[
                    {
                        "@context": "https://schema.org",
                        "@type": "CollectionPage",
                        "name": "MockSetu (Mockset) Exam Library",
                        "alternateName": "Mockset Free Mock Test Library",
                        "description": "Free collection of timed mock tests and exam simulations on MockSetu (Mockset) for JEE, NEET, CAT, GATE, and UPSC aspirants.",
                        "url": "https://mocksetu.in/marketplace",
                        "isPartOf": { "@id": "https://mocksetu.in/#website" },
                        "about": [
                            { "@type": "Thing", "name": "JEE Main Mock Test" },
                            { "@type": "Thing", "name": "NEET Mock Test" },
                            { "@type": "Thing", "name": "CAT Mock Test" },
                            { "@type": "Thing", "name": "GATE Mock Test" },
                            { "@type": "Thing", "name": "UPSC Mock Test" },
                            { "@type": "Thing", "name": "Mockset Mock Test Series" },
                            { "@type": "Thing", "name": "Online Assessment Platform" }
                        ],
                        "publisher": { "@id": "https://mocksetu.in/#organization" }
                    },
                    {
                        "@context": "https://schema.org",
                        "@type": "BreadcrumbList",
                        "itemListElement": [
                            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mocksetu.in/" },
                            { "@type": "ListItem", "position": 2, "name": "Mock Test Library", "item": "https://mocksetu.in/marketplace" }
                        ]
                    }
                ]}
            />
            <Navbar navButtonLabel="Analytics" navButtonLink="/analytics?from=marketplace" />
            <OnboardingModal
                isOpen={showOnboardingModal}
                onComplete={() => setShowOnboardingModal(false)}
            />
            <JoinLiveExamDialog open={joinOpen} onOpenChange={setJoinOpen} />

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
                        <p className="text-muted-foreground text-sm mt-1">
                            Browse and take free MockSetu mock tests shared by the community — the same Mockset exam simulator,
                            now with thousands of timed JEE, NEET, CAT, GATE &amp; UPSC papers.
                        </p>
                    </div>
                </div>

                {/* Tabs and the join action share one line. The join button is
                    NOT scoped to the live tab: a student arriving while a room is
                    already waiting for them shouldn't have to discover a tab
                    first, and it is the one time-critical action on this page. */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-fit border border-border/50">
                        <button
                            onClick={() => setActiveTab("mock")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                activeTab === "mock"
                                    ? "bg-background text-foreground shadow-sm border border-border/60"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <FileText className="h-4 w-4" />
                            Mock Exams
                        </button>
                        <button
                            onClick={() => setActiveTab("live")}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                activeTab === "live"
                                    ? "bg-background text-foreground shadow-sm border border-border/60"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Radio className="h-4 w-4" />
                            My Live Exams
                        </button>
                    </div>

                    {canJoinLive && (
                        <Button
                            onClick={() => setJoinOpen(true)}
                            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:-translate-y-px transition-all duration-200"
                        >
                            <Plus className="h-4 w-4" />
                            Join with code
                        </Button>
                    )}
                </div>

                {activeTab === "mock" && (
                    <>
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
                            onChange={handleCategoryChange}
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
                ) : visibleExams.length === 0 ? (
                    /* Filters are URL-addressable now, so this branch is reachable
                       by following a link rather than only by typing — it has to
                       explain itself and offer the way back. */
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <Search className="h-16 w-16 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No matching exams</h3>
                            <p className="text-muted-foreground mb-5 max-w-sm text-sm">
                                {selectedCategories.length > 0
                                    ? `Nothing published under ${selectedCategories.join(", ")} yet. New papers get added regularly — try the full library in the meantime.`
                                    : "No exams match your search. Try a different title or category."}
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearchQuery("");
                                    handleCategoryChange([]);
                                }}
                            >
                                Show all exams
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {visibleExams.map((exam) => (
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
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        by <span className="font-semibold text-[#6C3EF4]">{exam.creator_username || "Unknown"}</span>
                                        {(() => {
                                            const tier = getVerificationTier({ is_admin_gold: exam.creator_gold, is_verified: exam.creator_verified });
                                            return tier && <VerifiedBadge size={14} tier={tier} />;
                                        })()}
                                    </div>
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
                </>
                )}

                {activeTab === "live" && (
                    <>
                        {loadingLive ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">Loading live exams...</p>
                            </div>
                        ) : liveExams.length === 0 ? (
                            // The list is empty for every student until their first
                            // join — which is exactly the moment a code is in hand,
                            // so the way in belongs here rather than only up in the
                            // header.
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                    <Radio className="h-16 w-16 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No live exams yet</h3>
                                    <p className="text-muted-foreground mb-5 max-w-sm text-sm">
                                        Rooms you join show up here. Got a code from your teacher? Enter it and you're in.
                                    </p>
                                    {canJoinLive && (
                                        <Button
                                            onClick={() => setJoinOpen(true)}
                                            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:-translate-y-px transition-all duration-200"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Join with code
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                                {liveExams.map((participant) => {
                                    const exam = participant.live_exam;
                                    if (!exam) return null;
                                    return (
                                        <div key={participant.id} className="group flex flex-col justify-between rounded-xl border border-border/60 bg-card hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
                                            <div className="p-5">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-base font-bold text-foreground break-words leading-tight mb-1">{exam.name}</h3>
                                                        <Badge variant="secondary" className="text-[10px] font-medium">
                                                            {exam.status === "live" ? "🔴 LIVE" : exam.status === "ended" ? "ENDED" : exam.status}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                {exam.description && (
                                                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{exam.description}</p>
                                                )}
                                                
                                                {/* Stats */}
                                                <div className="mt-4 flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-1.5 text-emerald-600">
                                                        <span className="font-semibold">{participant.total_correct}</span>
                                                        <span className="text-muted-foreground">correct</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-amber-600">
                                                        <span className="font-semibold">Rank {participant.rank || "-"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-5 pt-0 mt-auto">
                                                <Button
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all duration-200 hover:-translate-y-px"
                                                    onClick={() => window.open(`/live/${exam.share_code}`, '_blank')}
                                                >
                                                    {exam.status === "ended" ? "View Results" : "Rejoin Live Exam"}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default Marketplace;
