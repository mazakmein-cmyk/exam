import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Lock, Users, UserCheck, LogOut, Eye, EyeOff, Search, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, MoreVertical, Ban, TrendingUp, Activity, X, Filter, CalendarIcon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import VerifiedBadge, { VerifiedSeal } from "@/components/VerifiedBadge";
import { getVerificationTier } from "@/lib/verification";
import { useNavigate } from "react-router-dom";
import SEO from "@/components/SEO";

const AdminDashboard = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [stats, setStats] = useState<{ total_students: number; total_creators: number } | null>(null);
    const [exams, setExams] = useState<any[]>([]);

    // Filter State
    const [filter, setFilter] = useState<'all' | 'published' | 'unpublished'>('all');

    // Exam Search & Sort State
    const [examSearch, setExamSearch] = useState("");
    const [examSortField, setExamSortField] = useState<'name' | 'username' | 'created_at' | 'status'>('created_at');
    const [examSortOrder, setExamSortOrder] = useState<'asc' | 'desc'>('desc');

    // Preview State
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [previewExamName, setPreviewExamName] = useState("");

    // Users State
    const [users, setUsers] = useState<any[]>([]);
    const [userSearch, setUserSearch] = useState("");
    const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'student' | 'creator'>('all');
    const [userSortField, setUserSortField] = useState<'created_at' | 'email' | 'user_type' | 'activity'>('created_at');
    const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');

    // Verification confirmation state
    const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
    const [verifyTargetUser, setVerifyTargetUser] = useState<any>(null);

    // Analytics State
    const [trendTab, setTrendTab] = useState<'month' | 'year'>('month');
    const [activeTrendTab, setActiveTrendTab] = useState<'dau' | 'mau'>('dau');

    // Interactive Filters
    const [timeFilter, setTimeFilter] = useState<{ type: 'active' | 'signup', start: Date, end: Date, label: string } | null>(null);
    const usersTableRef = useRef<HTMLDivElement>(null);

    // Custom Date Filter State
    const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
    
    // Collapse/Expand State
    const [examsExpanded, setExamsExpanded] = useState(true);
    const [usersExpanded, setUsersExpanded] = useState(true);
    const [customDateType, setCustomDateType] = useState<'signup' | 'active'>('signup');
    const [customFilterOpen, setCustomFilterOpen] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email === "abarnwal3008@mocksetu.in" || session?.user?.email === "admin@mocksetu.in") {
            setIsAuthenticated(true);
            fetchStats();
            fetchExams();
            fetchUsers();
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const { data, error } = await (supabase.rpc as any)('get_admin_stats');
            if (error) throw error;
            setStats(data as any);
        } catch (error: any) {
            console.error("Error fetching stats:", error);
            toast.error(error.message || "Failed to fetch stats");
            // If RPC fails with access denied but we are logged in, maybe we shouldn't be here
        }
    };

    const fetchExams = async () => {
        try {
            // Use secure RPC to get ALL exams (published and unpublished)
            const { data, error } = await (supabase.rpc as any)('admin_get_all_exams');

            if (error) throw error;
            setExams(data || []);
        } catch (error: any) {
            console.error("Error fetching exams:", error);
            toast.error("Failed to load exams list");
        }
    };

    const fetchUsers = async () => {
        try {
            const { data, error } = await (supabase.rpc as any)('admin_get_all_users');
            if (error) throw error;
            setUsers(data || []);
        } catch (error: any) {
            console.error("Error fetching users:", error);
            toast.error("Failed to load users list");
        }
    };

    const scrollToUsers = () => {
        setTimeout(() => {
            usersTableRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const applyCustomFilter = () => {
        if (customDateRange?.from && customDateRange?.to) {
            setTimeFilter({
                type: customDateType,
                start: customDateRange.from,
                end: new Date(customDateRange.to.getFullYear(), customDateRange.to.getMonth(), customDateRange.to.getDate(), 23, 59, 59, 999),
                label: `${customDateType === 'signup' ? 'Signups' : 'Active'} (${format(customDateRange.from, 'dd MMM yyyy')} - ${format(customDateRange.to, 'dd MMM yyyy')})`
            });
            setCustomFilterOpen(false);
        } else {
            toast.error("Please select a complete date range");
        }
    };

    // Derived Analytics from users array to ensure 100% consistency with frontend timezone/filters
    const derivedAnalytics = useMemo(() => {
        if (!users || users.length === 0) return { dau: 0, mau: 0, monthly_trend: [], yearly_trend: [] };

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        let dau = 0;
        let mau = 0;
        
        const monthlyCounts: Record<string, number> = {};
        const yearlyCounts: Record<string, number> = {};
        
        const activeDailyCounts: Record<string, number> = {};
        const activeMonthlyCounts: Record<string, number> = {};

        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= now.getDate(); i++) {
            const d = new Date(now.getFullYear(), now.getMonth(), i);
            const key = format(d, 'yyyy-MM-dd');
            monthlyCounts[key] = 0;
            activeDailyCounts[key] = 0;
        }

        for (let i = 0; i <= now.getMonth(); i++) {
            const d = new Date(now.getFullYear(), i, 1);
            const key = format(d, 'yyyy-MM-01');
            yearlyCounts[key] = 0;
            activeMonthlyCounts[key] = 0;
        }

        users.forEach(u => {
            if (u.last_sign_in_at) {
                const activeDate = new Date(u.last_sign_in_at);
                if (activeDate >= startOfDay) dau++;
                if (activeDate >= startOfMonth) mau++;

                if (activeDate >= startOfMonth) {
                    const dayKey = format(activeDate, 'yyyy-MM-dd');
                    if (activeDailyCounts[dayKey] !== undefined) activeDailyCounts[dayKey]++;
                }
                if (activeDate >= startOfYear) {
                    const monthKey = format(activeDate, 'yyyy-MM-01');
                    if (activeMonthlyCounts[monthKey] !== undefined) activeMonthlyCounts[monthKey]++;
                }
            }

            if (u.created_at) {
                const createdDate = new Date(u.created_at);
                if (createdDate >= startOfMonth) {
                    const dayKey = format(createdDate, 'yyyy-MM-dd');
                    if (monthlyCounts[dayKey] !== undefined) monthlyCounts[dayKey]++;
                }
                if (createdDate >= startOfYear) {
                    const monthKey = format(createdDate, 'yyyy-MM-01');
                    if (yearlyCounts[monthKey] !== undefined) yearlyCounts[monthKey]++;
                }
            }
        });

        const monthly_trend = Object.keys(monthlyCounts).sort().map(key => {
            const d = new Date(key);
            return { label: format(d, 'dd MMM'), day: key, signups: monthlyCounts[key] };
        });

        const yearly_trend = Object.keys(yearlyCounts).sort().map(key => {
            const d = new Date(key);
            return { label: format(d, 'MMM'), month: key, signups: yearlyCounts[key] };
        });

        const active_daily_trend = Object.keys(activeDailyCounts).sort().map(key => {
            const d = new Date(key);
            return { label: format(d, 'dd MMM'), day: key, active: activeDailyCounts[key] };
        });

        const active_monthly_trend = Object.keys(activeMonthlyCounts).sort().map(key => {
            const d = new Date(key);
            return { label: format(d, 'MMM'), month: key, active: activeMonthlyCounts[key] };
        });

        return { dau, mau, monthly_trend, yearly_trend, active_daily_trend, active_monthly_trend };
    }, [users]);

    const handleToggleVerified = async (user: any) => {
        try {
            const { data, error } = await (supabase.rpc as any)('admin_toggle_verified', {
                target_user_id: user.id
            });
            if (error) throw error;
            toast.success(data ? `Blue tick granted to ${user.username || user.email}` : `Blue tick removed from ${user.username || user.email}`);
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_verified: data } : u));
        } catch (error: any) {
            console.error("Error toggling verified:", error);
            toast.error("Failed to update verification status");
        } finally {
            setVerifyConfirmOpen(false);
            setVerifyTargetUser(null);
        }
    };

    const handleToggleStatus = async (examId: string, currentStatus: boolean) => {
        try {
            const newStatus = !currentStatus;
            const { error } = await (supabase.rpc as any)('admin_update_exam_status', {
                target_exam_id: examId,
                new_status: newStatus
            });

            if (error) throw error;

            toast.success(`Exam ${newStatus ? 'Published' : 'Unpublished'} successfully`);

            // Optimistic update
            setExams(prev => prev.map(e =>
                e.id === examId ? { ...e, is_published: newStatus } : e
            ));
        } catch (error: any) {
            console.error("Error updating exam status:", error);
            toast.error("Failed to update status");
        }
    };



    const handlePreview = async (exam: any) => {
        setPreviewOpen(true);
        setPreviewLoading(true);
        setPreviewExamName(exam.name || "Untitled Exam");
        setPreviewData([]);

        try {
            // Use secure RPC to fetch preview data
            const { data, error } = await (supabase.rpc as any)('admin_get_exam_preview', {
                target_exam_id: exam.id
            });

            if (error) throw error;

            // Data comes back as the structure we expect: [{ name, questions: []... }]
            setPreviewData(data as any || []);

        } catch (error: any) {
            console.error("Error loading preview:", error);
            toast.error("Failed to load exam preview");
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Handle if user entered full email or just ID
            const email = username.includes("@")
                ? username
                : `${username}@mocksetu.in`;

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data.user?.email === "abarnwal3008@mocksetu.in" || data.user?.email === "admin@mocksetu.in") {
                setIsAuthenticated(true);
                fetchStats();
                fetchExams();
                fetchUsers();
                toast.success("Welcome back, Admin");
            } else {
                await supabase.auth.signOut();
                toast.error("Unauthorized account");
            }
        } catch (error: any) {
            toast.error(error.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setIsAuthenticated(false);
        setStats(null);
        setExams([]);
        setUsers([]);
        setUsername("");
        setPassword("");
        toast.success("Logged out");
    };

    const filteredExams = useMemo(() => {
        const emailFor = (userId: string) => users.find(u => u.id === userId)?.email || '';
        return exams
            .filter(e => {
                if (filter === 'published') return e.is_published;
                if (filter === 'unpublished') return !e.is_published;
                return true;
            })
            .filter(e => {
                if (!examSearch.trim()) return true;
                const q = examSearch.toLowerCase();
                return (
                    (e.name || '').toLowerCase().includes(q) ||
                    (e.username || '').toLowerCase().includes(q) ||
                    emailFor(e.user_id).toLowerCase().includes(q)
                );
            })
            .sort((a, b) => {
                const order = examSortOrder === 'asc' ? 1 : -1;
                if (examSortField === 'status') {
                    return ((a.is_published ? 1 : 0) - (b.is_published ? 1 : 0)) * order;
                }
                if (examSortField === 'created_at') {
                    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * order;
                }
                const aVal = (a[examSortField] || '').toString().toLowerCase();
                const bVal = (b[examSortField] || '').toString().toLowerCase();
                return aVal < bVal ? -order : aVal > bVal ? order : 0;
            });
    }, [exams, users, filter, examSearch, examSortField, examSortOrder]);

    const toggleExamSort = (field: 'name' | 'username' | 'created_at' | 'status') => {
        if (examSortField === field) {
            setExamSortOrder(examSortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setExamSortField(field);
            setExamSortOrder(field === 'created_at' ? 'desc' : 'asc');
        }
    };

    const filteredUsers = useMemo(() => {
        return users
            .filter(u => {
                if (userTypeFilter === 'student') return u.user_type === 'student';
                if (userTypeFilter === 'creator') return u.user_type !== 'student';
                return true;
            })
            .filter(u => {
                if (!timeFilter) return true;
                const checkDateStr = timeFilter.type === 'signup' ? u.created_at : u.last_sign_in_at;
                if (!checkDateStr) return false;
                const checkDate = new Date(checkDateStr);
                return checkDate >= timeFilter.start && checkDate <= timeFilter.end;
            })
            .filter(u => {
                if (!userSearch.trim()) return true;
                const q = userSearch.toLowerCase();
                return (
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.username || '').toLowerCase().includes(q) ||
                    (u.phone || '').toLowerCase().includes(q) ||
                    (u.id || '').toLowerCase().includes(q)
                );
            })
            .sort((a, b) => {
                const field = userSortField;
                const order = userSortOrder === 'asc' ? 1 : -1;
                
                if (field === 'activity') {
                    const aCount = a.user_type === 'student' ? (a.exams_attempted || 0) : (a.exams_created || 0);
                    const bCount = b.user_type === 'student' ? (b.exams_attempted || 0) : (b.exams_created || 0);
                    return (aCount - bCount) * order;
                }

                const aVal = (a[field] || '').toString().toLowerCase();
                const bVal = (b[field] || '').toString().toLowerCase();
                return aVal < bVal ? -order : aVal > bVal ? order : 0;
            });
    }, [users, userTypeFilter, timeFilter, userSearch, userSortField, userSortOrder]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50">Loading...</div>;
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <Card className="w-full max-w-md shadow-xl">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <Lock className="w-6 h-6 text-primary" />
                            Restricted Access
                        </CardTitle>
                        <CardDescription>
                            Enter your admin credentials to continue.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    type="text"
                                    placeholder="Admin ID"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                            <div className="space-y-2 relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-white pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-[10px] text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                            <Button type="submit" className="w-full">
                                Authenticate
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <SEO title="Admin | MockSetu" description="Internal admin console." path="/barnwal3008-admin" noindex />
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                    <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card 
                        className="hover:shadow-lg transition-shadow cursor-pointer border-transparent hover:border-blue-200"
                        onClick={() => {
                            setUserTypeFilter('creator');
                            setTimeFilter(null);
                            scrollToUsers();
                        }}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xl font-medium">Total Creators</CardTitle>
                            <Users className="w-8 h-8 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-gray-900">
                                {stats?.total_creators ?? "-"}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Unique creator accounts
                            </p>
                        </CardContent>
                    </Card>

                    <Card 
                        className="hover:shadow-lg transition-shadow cursor-pointer border-transparent hover:border-green-200"
                        onClick={() => {
                            setUserTypeFilter('student');
                            setTimeFilter(null);
                            scrollToUsers();
                        }}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xl font-medium">Total Students</CardTitle>
                            <UserCheck className="w-8 h-8 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-gray-900">
                                {stats?.total_students ?? "-"}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Unique student accounts
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* DAU / MAU Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card 
                        className="hover:shadow-lg transition-shadow cursor-pointer border-transparent hover:border-orange-200"
                        onClick={() => {
                            const now = new Date();
                            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            setTimeFilter({ type: 'active', start: startOfDay, end: now, label: 'Active Today (DAU)' });
                            setUserTypeFilter('all');
                            scrollToUsers();
                        }}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xl font-medium">DAU</CardTitle>
                            <Activity className="w-8 h-8 text-orange-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-gray-900">
                                {derivedAnalytics.dau}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Daily active users (today)
                            </p>
                        </CardContent>
                    </Card>

                    <Card 
                        className="hover:shadow-lg transition-shadow cursor-pointer border-transparent hover:border-indigo-200"
                        onClick={() => {
                            const now = new Date();
                            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                            setTimeFilter({ type: 'active', start: startOfMonth, end: now, label: 'Active This Month (MAU)' });
                            setUserTypeFilter('all');
                            scrollToUsers();
                        }}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xl font-medium">MAU</CardTitle>
                            <TrendingUp className="w-8 h-8 text-indigo-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold text-gray-900">
                                {derivedAnalytics.mau}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Monthly active users (this month)
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8">
                    {/* Signup Trend Chart */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div>
                                <CardTitle className="text-xl font-medium">New Signups Trend</CardTitle>
                                <p className="text-sm text-gray-500 mt-1">
                                    {trendTab === 'month' ? 'Daily signups this month' : 'Monthly signups this year'}
                                </p>
                            </div>
                            <div className="flex bg-gray-100 rounded-lg p-0.5">
                                <button
                                    onClick={() => setTrendTab('month')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        trendTab === 'month'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Month
                                </button>
                                <button
                                    onClick={() => setTrendTab('year')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        trendTab === 'year'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Year
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart 
                                        data={trendTab === 'month' ? derivedAnalytics.monthly_trend : derivedAnalytics.yearly_trend}
                                        onClick={(e) => {
                                            if (e && e.activePayload && e.activePayload.length > 0) {
                                                const data = e.activePayload[0].payload;
                                                const date = new Date(data.day || data.month);
                                                let start, end, label;
                                                if (trendTab === 'month') {
                                                    start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                                    end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
                                                    label = `Signups on ${data.label}`;
                                                } else {
                                                    start = new Date(date.getFullYear(), date.getMonth(), 1);
                                                    end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
                                                    label = `Signups in ${data.label} ${date.getFullYear()}`;
                                                }
                                                setTimeFilter({ type: 'signup', start, end, label });
                                                setUserTypeFilter('all');
                                                scrollToUsers();
                                            }
                                        }}
                                        className="cursor-pointer"
                                    >
                                        <defs>
                                            <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                                            formatter={(value: any) => [value, 'Signups']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="signups"
                                            stroke="#6366f1"
                                            strokeWidth={2}
                                            fill="url(#signupGradient)"
                                            dot={{ r: 3, fill: '#6366f1' }}
                                            activeDot={{ r: 5, fill: '#6366f1' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Active Users Trend Chart */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <div>
                                <CardTitle className="text-xl font-medium">Active Users Trend</CardTitle>
                                <p className="text-sm text-gray-500 mt-1">
                                    {activeTrendTab === 'dau' ? 'Daily active users this month' : 'Monthly active users this year'}
                                </p>
                            </div>
                            <div className="flex bg-gray-100 rounded-lg p-0.5">
                                <button
                                    onClick={() => setActiveTrendTab('dau')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        activeTrendTab === 'dau'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    DAU
                                </button>
                                <button
                                    onClick={() => setActiveTrendTab('mau')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        activeTrendTab === 'mau'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    MAU
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart 
                                        data={activeTrendTab === 'dau' ? derivedAnalytics.active_daily_trend : derivedAnalytics.active_monthly_trend}
                                        onClick={(e) => {
                                            if (e && e.activePayload && e.activePayload.length > 0) {
                                                const data = e.activePayload[0].payload;
                                                const date = new Date(data.day || data.month);
                                                let start, end, label;
                                                if (activeTrendTab === 'dau') {
                                                    start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                                    end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
                                                    label = `Active Users on ${data.label}`;
                                                } else {
                                                    start = new Date(date.getFullYear(), date.getMonth(), 1);
                                                    end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
                                                    label = `Active Users in ${data.label} ${date.getFullYear()}`;
                                                }
                                                setTimeFilter({ type: 'active', start, end, label });
                                                setUserTypeFilter('all');
                                                scrollToUsers();
                                            }
                                        }}
                                        className="cursor-pointer"
                                    >
                                        <defs>
                                            <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
                                            formatter={(value: any) => [value, 'Active Users']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="active"
                                            stroke="#f97316"
                                            strokeWidth={2}
                                            fill="url(#activeGradient)"
                                            dot={{ r: 3, fill: '#f97316' }}
                                            activeDot={{ r: 5, fill: '#f97316' }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div 
                                className="flex items-center gap-2 cursor-pointer select-none group"
                                onClick={() => setExamsExpanded(!examsExpanded)}
                            >
                                <div className="p-1 rounded hover:bg-gray-200 transition-colors">
                                    {examsExpanded ? <ChevronDown className="h-5 w-5 text-gray-700" /> : <ChevronRight className="h-5 w-5 text-gray-700" />}
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900">Exams Management</h2>
                            </div>
                            <p className="text-sm text-gray-500 mt-1 pl-9">
                                Showing: {filteredExams.length} |
                                Total: {exams.length} |
                                Published: {exams.filter(e => e.is_published).length} |
                                Unpublished: {exams.filter(e => !e.is_published).length}
                            </p>
                        </div>
                        {examsExpanded && (
                            <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by title or creator..."
                                    value={examSearch}
                                    onChange={(e) => setExamSearch(e.target.value)}
                                    className="pl-9 w-[300px] bg-white"
                                />
                            </div>
                            <div className="w-[160px]">
                                <Select
                                    value={filter}
                                    onValueChange={(val: any) => setFilter(val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Filter Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Exams</SelectItem>
                                        <SelectItem value="published">Published Only</SelectItem>
                                        <SelectItem value="unpublished">Unpublished Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        )}
                    </div>

                    {examsExpanded && (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-500">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => toggleExamSort('name')}
                                            >
                                                Exam Title
                                                {examSortField === 'name' ? (
                                                    examSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => toggleExamSort('username')}
                                            >
                                                Creator
                                                {examSortField === 'username' ? (
                                                    examSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => toggleExamSort('created_at')}
                                            >
                                                Created At
                                                {examSortField === 'created_at' ? (
                                                    examSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => toggleExamSort('status')}
                                            >
                                                Status
                                                {examSortField === 'status' ? (
                                                    examSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-right pr-10 w-[150px] sticky right-0 bg-gray-50 z-10 shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.05)] border-l border-gray-200">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 border-t border-gray-200">
                                    {filteredExams.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                                                No exams found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredExams
                                            .map((exam) => (
                                                <tr key={exam.id} className="hover:bg-gray-50 group">
                                                    <td className="px-6 py-4 font-medium text-gray-900">
                                                        {exam.name || "Untitled Exam"}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-900">
                                                        <div>
                                                            <div className="font-medium">{exam.username || "Unknown"}</div>
                                                            <div className="text-xs text-gray-500">{users.find(u => u.id === exam.user_id)?.email || ""}</div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {new Date(exam.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${exam.is_published
                                                            ? "bg-green-50 text-green-700 ring-green-600/20"
                                                            : "bg-gray-50 text-gray-600 ring-gray-500/10"
                                                            }`}>
                                                            {exam.is_published ? "Published" : "Draft"}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 pr-10 text-right sticky right-0 bg-white group-hover:bg-gray-50 z-10 shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.05)] border-l border-gray-200">
                                                        <div className="flex items-center justify-end gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">
                                                                {exam.is_published ? "Live" : "Hidden"}
                                                            </span>
                                                            <Switch
                                                                checked={exam.is_published}
                                                                onCheckedChange={() => handleToggleStatus(exam.id, exam.is_published)}
                                                            />
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            title="Quick Glance"
                                                            onClick={() => handlePreview(exam)}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>

                {/* Users Management */}
                <div className="space-y-4" ref={usersTableRef}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div 
                                className="flex items-center gap-2 cursor-pointer select-none group"
                                onClick={() => setUsersExpanded(!usersExpanded)}
                            >
                                <div className="p-1 rounded hover:bg-gray-200 transition-colors">
                                    {usersExpanded ? <ChevronDown className="h-5 w-5 text-gray-700" /> : <ChevronRight className="h-5 w-5 text-gray-700" />}
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900">Users Management</h2>
                                {timeFilter && (
                                    <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium border border-indigo-200">
                                        <span>{timeFilter.label}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setTimeFilter(null); }}
                                            className="p-0.5 hover:bg-indigo-200 rounded-full transition-colors ml-1"
                                            title="Clear filter"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1 pl-9">
                                Total: {filteredUsers.length} |
                                Students: {filteredUsers.filter(u => u.user_type === 'student').length} |
                                Creators: {filteredUsers.filter(u => u.user_type !== 'student').length}
                            </p>
                        </div>
                        {usersExpanded && (
                            <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search by email, username, or phone..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className="pl-9 w-[300px] bg-white"
                                />
                            </div>
                            <div className="w-[160px]">
                                <Select value={userTypeFilter} onValueChange={(val: any) => setUserTypeFilter(val)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Filter Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Users</SelectItem>
                                        <SelectItem value="student">Students Only</SelectItem>
                                        <SelectItem value="creator">Creators Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Popover open={customFilterOpen} onOpenChange={setCustomFilterOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="flex items-center gap-2 border-gray-200">
                                        <Filter className="h-4 w-4 text-gray-500" />
                                        Custom Filter
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-4" align="end">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Filter By</label>
                                            <Select value={customDateType} onValueChange={(val: any) => setCustomDateType(val)}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="signup">Signups Date</SelectItem>
                                                    <SelectItem value="active">Last Active Date</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Date Range</label>
                                            <div className="border rounded-md p-1">
                                                <Calendar
                                                    initialFocus
                                                    mode="range"
                                                    defaultMonth={customDateRange?.from}
                                                    selected={customDateRange}
                                                    onSelect={setCustomDateRange}
                                                    numberOfMonths={2}
                                                />
                                            </div>
                                        </div>
                                        <Button className="w-full" onClick={applyCustomFilter}>
                                            Apply Filter
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                        )}
                    </div>

                    {usersExpanded && (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-gray-500">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => {
                                                    if (userSortField === 'email') setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setUserSortField('email'); setUserSortOrder('asc'); }
                                                }}
                                            >
                                                Email
                                                {userSortField === 'email' ? (
                                                    userSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">Username</th>
                                        <th scope="col" className="px-6 py-3">Phone</th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => {
                                                    if (userSortField === 'user_type') setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setUserSortField('user_type'); setUserSortOrder('asc'); }
                                                }}
                                            >
                                                Type
                                                {userSortField === 'user_type' ? (
                                                    userSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => {
                                                    if (userSortField === 'activity') setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setUserSortField('activity'); setUserSortOrder('desc'); }
                                                }}
                                            >
                                                Activity
                                                {userSortField === 'activity' ? (
                                                    userSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3">
                                            <button
                                                className="flex items-center gap-1 hover:text-gray-900"
                                                onClick={() => {
                                                    if (userSortField === 'created_at') setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc');
                                                    else { setUserSortField('created_at'); setUserSortOrder('desc'); }
                                                }}
                                            >
                                                Created At
                                                {userSortField === 'created_at' ? (
                                                    userSortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                                ) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                                            </button>
                                        </th>
                                        <th scope="col" className="px-6 py-3 text-right pr-10 w-[80px] sticky right-0 bg-gray-50 z-10 shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.05)] border-l border-gray-200">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 border-t border-gray-200">
                                    {(() => {
                                        if (filteredUsers.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                                                        No users found.
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-gray-50 group">
                                                <td className="px-6 py-4 font-medium text-gray-900">
                                                    <div className="flex items-center gap-1.5">
                                                        {user.email || "—"}
                                                        {(() => {
                                                            const tier = getVerificationTier({ email: user.email, is_admin_gold: user.is_admin_gold, is_verified: user.is_verified });
                                                            return tier && <VerifiedBadge size={16} tier={tier} />;
                                                        })()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-900">
                                                    {user.username || "—"}
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    {user.phone || "—"}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                                        user.user_type === 'student'
                                                            ? "bg-blue-50 text-blue-700 ring-blue-600/20"
                                                            : "bg-purple-50 text-purple-700 ring-purple-600/20"
                                                    }`}>
                                                        {user.user_type === 'student' ? 'Student' : 'Creator'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    {user.user_type === 'student'
                                                        ? `${user.exams_attempted || 0} Attempted`
                                                        : `${user.exams_created || 0} Created`}
                                                </td>
                                                <td className="px-6 py-4 text-sm">
                                                    {new Date(user.created_at).toLocaleDateString('en-IN', {
                                                        day: '2-digit', month: 'short', year: 'numeric'
                                                    })}
                                                </td>
                                                <td className="px-6 py-4 pr-10 text-right sticky right-0 bg-white group-hover:bg-gray-50 z-10 shadow-[-12px_0_15px_-4px_rgba(0,0,0,0.05)] border-l border-gray-200">
                                                    {user.user_type !== 'student' && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                    <MoreVertical className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setVerifyTargetUser(user);
                                                                        setVerifyConfirmOpen(true);
                                                                    }}
                                                                >
                                                                    <VerifiedSeal size={16} className="mr-2" />
                                                                    {user.is_verified ? 'Remove Blue Tick' : 'Give Blue Tick'}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem disabled className="opacity-50">
                                                                    <Ban className="mr-2 h-4 w-4" />
                                                                    Publish/Unpublish
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            </div>

            {/* Verification Confirmation Dialog */}
            <AlertDialog open={verifyConfirmOpen} onOpenChange={setVerifyConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {verifyTargetUser?.is_verified ? 'Remove Blue Tick?' : 'Give Blue Tick?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {verifyTargetUser?.is_verified
                                ? `Are you sure you want to remove the blue tick from ${verifyTargetUser?.username || verifyTargetUser?.email}? They will no longer appear as verified across MockSetu.`
                                : `Are you sure you want to give a blue tick to ${verifyTargetUser?.username || verifyTargetUser?.email}? They will appear as "Verified by MockSetu" across the platform.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => verifyTargetUser && handleToggleVerified(verifyTargetUser)}>
                            {verifyTargetUser?.is_verified ? 'Remove Blue Tick' : 'Give Blue Tick'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Preview: {previewExamName}</DialogTitle>
                    </DialogHeader>

                    {previewLoading ? (
                        <div className="flex items-center justify-center p-8">Loading exam content...</div>
                    ) : (
                        <div className="flex-1 overflow-y-auto pr-2">
                            {previewData.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No content found for this exam.</p>
                            ) : (
                                <Tabs defaultValue={previewData[0]?.id} className="w-full">
                                    <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
                                        {previewData.map((section) => (
                                            <TabsTrigger key={section.id} value={section.id}>
                                                {section.name} ({(section.questions?.length || 0)})
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>

                                    {previewData.map((section) => (
                                        <TabsContent key={section.id} value={section.id} className="mt-4 space-y-4">
                                            {section.questions && section.questions.length > 0 ? (
                                                section.questions.map((q: any) => (
                                                    <Card key={q.id}>
                                                        <CardHeader className="pb-2">
                                                            <CardTitle className="text-sm font-medium text-gray-500">
                                                                Question {q.question_number}
                                                            </CardTitle>
                                                        </CardHeader>
                                                        <CardContent className="space-y-4">
                                                            {/* Images from fields */}
                                                            {q.image_url && (
                                                                <img
                                                                    src={q.image_url}
                                                                    alt="Question Image"
                                                                    className="max-w-full h-auto rounded-lg mb-2"
                                                                />
                                                            )}
                                                            {q.image_urls && Array.isArray(q.image_urls) && q.image_urls.map((url: string, imgIdx: number) => (
                                                                <img
                                                                    key={imgIdx}
                                                                    src={url}
                                                                    alt={`Question Image ${imgIdx + 1}`}
                                                                    className="max-w-full h-auto rounded-lg mb-2"
                                                                />
                                                            ))}

                                                            {/* Question Text (HTML or Plain) */}
                                                            <div
                                                                className="prose prose-sm max-w-none [&>img]:max-w-full [&>img]:h-auto [&>img]:rounded-lg"
                                                                dangerouslySetInnerHTML={{ __html: q.question_text || "" }}
                                                            />
                                                            {(!q.question_text && !q.image_url && (!q.image_urls || q.image_urls.length === 0)) && (
                                                                <p className="text-gray-400 italic">No text or image content.</p>
                                                            )}

                                                            {/* Options List */}
                                                            <div className="space-y-2">
                                                                {q.options && Array.isArray(q.options) && q.options.map((opt: string, idx: number) => (
                                                                    <div
                                                                        key={idx}
                                                                        className={`p-2 rounded border text-sm ${q.correct_answer === String.fromCharCode(65 + idx) || q.correct_answer === opt
                                                                            ? "bg-green-50 border-green-200 text-green-800"
                                                                            : "bg-gray-50 border-gray-100"
                                                                            }`}
                                                                    >
                                                                        <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
                                                                        {opt}
                                                                        {(q.correct_answer === String.fromCharCode(65 + idx) || q.correct_answer === opt) && (
                                                                            <span className="ml-2 text-xs font-bold text-green-600">(Correct)</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))
                                            ) : (
                                                <div className="text-center py-8 text-gray-500">
                                                    No questions in this section.
                                                </div>
                                            )}
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminDashboard;
