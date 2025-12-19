import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Check, X, Plus } from "lucide-react";

interface QuestionFormProps {
    text: string;
    setText: (text: string) => void;
    type: string;
    setType: (type: string) => void;
    options: string[];
    setOptions: (options: string[]) => void;
    correct: string | string[];
    setCorrect: (correct: string | string[]) => void;
    image: string | null;
    onImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAdd: () => void;
    showImageUpload?: boolean;
    isEditing?: boolean;
}

export function QuestionForm({
    text, setText,
    type, setType,
    options, setOptions,
    correct, setCorrect,
    image, onImageUpload,
    onAdd,
    showImageUpload = true,
    isEditing = false
}: QuestionFormProps) {
    const handleMultiCorrectToggle = (option: string) => {
        const currentCorrect = Array.isArray(correct) ? correct : [];
        if (currentCorrect.includes(option)) {
            setCorrect(currentCorrect.filter(opt => opt !== option));
        } else {
            setCorrect([...currentCorrect, option]);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Question Image {showImageUpload ? "(Ctrl+V to paste)" : "(Snipped from PDF)"}</Label>
                {showImageUpload && (
                    <div className="flex items-center gap-4">
                        <Button variant="outline" className="relative" onClick={() => document.getElementById('img-upload')?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Image
                            <input
                                id="img-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={onImageUpload}
                            />
                        </Button>
                        {image && (
                            <span className="text-sm text-green-600 flex items-center">
                                <Check className="mr-1 h-4 w-4" /> Image attached
                            </span>
                        )}
                    </div>
                )}
                {image && (
                    <div className="mt-2 border rounded-md p-2 bg-slate-50 w-fit">
                        <img src={image} alt="Preview" className="h-32 object-contain" />
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <Label>Question Text (Optional)</Label>
                <Textarea
                    placeholder="Enter question text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                <Label>Question Type</Label>
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">Multiple Choice (Single)</SelectItem>
                        <SelectItem value="multi">Multiple Choice (Multiple)</SelectItem>
                        <SelectItem value="numeric">Numeric</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {(type === "single" || type === "multi") && (
                <div className="space-y-3">
                    <Label>Options</Label>
                    {options.map((opt, idx) => (
                        <div key={idx} className="flex gap-2">
                            <Input
                                placeholder={`Option ${idx + 1}`}
                                value={opt}
                                onChange={(e) => {
                                    const newOpts = [...options];
                                    newOpts[idx] = e.target.value;
                                    setOptions(newOpts);
                                }}
                            />
                            {idx > 1 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        const newOpts = options.filter((_, i) => i !== idx);
                                        setOptions(newOpts);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOptions([...options, ""])}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Add Option
                    </Button>
                </div>
            )}

            <div className="space-y-2">
                <Label>Correct Answer{type === "multi" ? "s" : ""}</Label>
                {type === "single" ? (
                    <Select value={correct as string} onValueChange={setCorrect}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select correct option" />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((opt, idx) => (
                                opt && <SelectItem key={idx} value={opt}>{opt}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : type === "multi" ? (
                    <div className="space-y-2 border rounded-md p-3">
                        {options.filter(opt => opt.trim() !== "").map((opt, idx) => (
                            <div key={idx} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`option-${idx}`}
                                    checked={Array.isArray(correct) && correct.includes(opt)}
                                    onCheckedChange={() => handleMultiCorrectToggle(opt)}
                                />
                                <label
                                    htmlFor={`option-${idx}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                    {opt}
                                </label>
                            </div>
                        ))}
                        {options.filter(opt => opt.trim() !== "").length === 0 && (
                            <p className="text-sm text-muted-foreground">Add options above to select correct answers</p>
                        )}
                    </div>
                ) : (
                    <Input
                        placeholder="Enter correct answer"
                        value={correct as string}
                        onChange={(e) => setCorrect(e.target.value)}
                    />
                )}
            </div>

            {!isEditing && (
                <Button className="w-full" onClick={onAdd}>
                    <Plus className="mr-2 h-4 w-4" /> Add Question
                </Button>
            )}
        </div>
    );
}
