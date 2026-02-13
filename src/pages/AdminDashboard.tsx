import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Lock, Users, UserCheck, LogOut, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminDashboard = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [stats, setStats] = useState<{ total_students: number; total_creators: number } | null>(null);
    const [exams, setExams] = useState<any[]>([]);

    // Filter State
    const [filter, setFilter] = useState<'all' | 'published' | 'unpublished'>('all');

    // Preview State
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [previewExamName, setPreviewExamName] = useState("");

    const navigate = useNavigate();

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email === "abarnwal3008@mocksetu.in") {
            setIsAuthenticated(true);
            fetchStats();
            fetchExams();
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        try {
            const { data, error } = await supabase.rpc('get_admin_stats');
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
            const { data, error } = await supabase.rpc('admin_get_all_exams');

            if (error) throw error;
            setExams(data || []);
        } catch (error: any) {
            console.error("Error fetching exams:", error);
            toast.error("Failed to load exams list");
        }
    };

    const handleToggleStatus = async (examId: string, currentStatus: boolean) => {
        try {
            const newStatus = !currentStatus;
            const { error } = await supabase.rpc('admin_update_exam_status', {
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
            const { data, error } = await supabase.rpc('admin_get_exam_preview', {
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

            if (data.user?.email === "abarnwal3008@mocksetu.in") {
                setIsAuthenticated(true);
                fetchStats();
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
        setUsername("");
        setPassword("");
        toast.success("Logged out");
    };

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
                            <div className="space-y-2">
                                <Input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-white"
                                />
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
            <div className="max-w-5xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                    <Button variant="outline" onClick={handleLogout} className="flex items-center gap-2">
                        <LogOut className="w-4 h-4" />
                        Sign Out
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="hover:shadow-lg transition-shadow">
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

                    <Card className="hover:shadow-lg transition-shadow">
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

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Exams Management</h2>
                            <p className="text-sm text-gray-500">
                                Total: {exams.length} |
                                Published: {exams.filter(e => e.is_published).length} |
                                Unpublished: {exams.filter(e => !e.is_published).length}
                            </p>
                        </div>
                        <div className="w-[200px]">
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

                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-gray-500">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">Exam Title</th>
                                        <th scope="col" className="px-6 py-3">Creator</th>
                                        <th scope="col" className="px-6 py-3">Created At</th>
                                        <th scope="col" className="px-6 py-3">Status</th>
                                        <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 border-t border-gray-200">
                                    {exams.filter(e => {
                                        if (filter === 'published') return e.is_published;
                                        if (filter === 'unpublished') return !e.is_published;
                                        return true;
                                    }).length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                                                No exams found.
                                            </td>
                                        </tr>
                                    ) : (
                                        exams
                                            .filter(e => {
                                                if (filter === 'published') return e.is_published;
                                                if (filter === 'unpublished') return !e.is_published;
                                                return true;
                                            })
                                            .map((exam) => (
                                                <tr key={exam.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 font-medium text-gray-900">
                                                        {exam.name || "Untitled Exam"}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-900">
                                                        {exam.username || "Unknown"}
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
                                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-4">
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
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

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
