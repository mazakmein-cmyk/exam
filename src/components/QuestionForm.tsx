import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Check, X, Plus, Link, Pilcrow, List, MoreHorizontal, Bold, Italic, Underline, Strikethrough, Code, Table, AlignLeft, Type, Sigma, Undo, Redo, Keyboard, Baseline, ALargeSmall } from "lucide-react";

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

const ToolbarIcon = ({ icon: Icon, label, onClick }: { icon: any, label: string, onClick?: () => void }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
                <Icon className="h-4 w-4" />
            </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
            <p>{label}</p>
        </TooltipContent>
    </Tooltip>
);

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
    const [isQuestionFocused, setIsQuestionFocused] = useState(false);

    // Link Popover State
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [openInNewTab, setOpenInNewTab] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Capture selection when opening popover
    useEffect(() => {
        if (isLinkPopoverOpen && textareaRef.current) {
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            if (start !== end) {
                setLinkText(text.substring(start, end));
            }
        }
    }, [isLinkPopoverOpen, text]);

    const handleInsertLink = () => {
        if (!linkUrl) return;

        const textToInsert = openInNewTab
            ? `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${linkText || linkUrl}</a>`
            : `[${linkText || linkUrl}](${linkUrl})`;

        const textarea = textareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText = text.substring(0, start) + textToInsert + text.substring(end);
            setText(newText);

            setIsLinkPopoverOpen(false);
            setLinkUrl("");
            setLinkText("");
            setOpenInNewTab(false);

            // Restore focus next tick
            setTimeout(() => {
                textarea.focus();
                const newCursorPos = start + textToInsert.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        }
    };

    const handleMultiCorrectToggle = (option: string) => {
        const currentCorrect = Array.isArray(correct) ? correct : [];
        if (currentCorrect.includes(option)) {
            setCorrect(currentCorrect.filter(opt => opt !== option));
        } else {
            setCorrect([...currentCorrect, option]);
        }
    };

    const handleFormat = (marker: string) => {
        const textarea = textareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selection = text.substring(start, end);
            const textToInsert = `${marker}${selection}${marker}`;
            const newText = text.substring(0, start) + textToInsert + text.substring(end);
            setText(newText);

            // Restore focus next tick and select the wrapped text (excluding markers)
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + marker.length, end + marker.length);
            }, 0);
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
                <div
                    className={`border rounded-md transition-colors ${isQuestionFocused || isLinkPopoverOpen ? 'border-primary ring-1 ring-primary' : 'border-input'}`}
                    onBlur={(e) => {
                        // Check if the new focus is still within this container (e.g. clicking toolbar buttons)
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setIsQuestionFocused(false);
                        }
                    }}
                >
                    {(isQuestionFocused || isLinkPopoverOpen) && (
                        <div className="flex items-center gap-1 p-1 border-b bg-muted/20 overflow-x-auto">
                            <TooltipProvider>
                                {/* Group 1: Insert/Structure */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <ToolbarIcon icon={Sigma} label="Insert Formula" />
                                    <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                        }}
                                                    >
                                                        <Link className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Insert Link</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <PopoverContent className="w-80 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
                                            <div className="space-y-3">
                                                <div className="space-y-1">
                                                    <Input
                                                        placeholder="URL"
                                                        value={linkUrl}
                                                        onChange={(e) => setLinkUrl(e.target.value)}
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Input
                                                        placeholder="Text"
                                                        value={linkText}
                                                        onChange={(e) => setLinkText(e.target.value)}
                                                        className="h-8 text-sm"
                                                    />
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id="openInNewTab"
                                                        checked={openInNewTab}
                                                        onCheckedChange={(checked) => setOpenInNewTab(checked as boolean)}
                                                    />
                                                    <label
                                                        htmlFor="openInNewTab"
                                                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                    >
                                                        Open link in new tab
                                                    </label>
                                                </div>
                                                <div className="flex justify-end">
                                                    <Button size="sm" className="h-7 text-xs bg-black text-white hover:bg-gray-800" onClick={handleInsertLink}>
                                                        Insert
                                                    </Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    <ToolbarIcon icon={Pilcrow} label="Format" />
                                    <ToolbarIcon icon={List} label="Bullet List" />
                                    <ToolbarIcon icon={MoreHorizontal} label="More Options" />
                                </div>

                                {/* Group 2: Formatting */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <ToolbarIcon icon={Bold} label="Bold" onClick={() => handleFormat('**')} />
                                    <ToolbarIcon icon={Italic} label="Italic" onClick={() => handleFormat('*')} />
                                    <ToolbarIcon icon={Underline} label="Underline" />
                                    <ToolbarIcon icon={Strikethrough} label="Strikethrough" />
                                    <ToolbarIcon icon={Code} label="Code Block" />
                                </div>

                                {/* Group 3: Layout */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <ToolbarIcon icon={Table} label="Insert Table" />
                                    <ToolbarIcon icon={Pilcrow} label="Text Direction" />
                                    <ToolbarIcon icon={AlignLeft} label="Align Left" />
                                </div>

                                {/* Group 4: Text Style */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <ToolbarIcon icon={Baseline} label="Text Color" />
                                    <ToolbarIcon icon={Type} label="Font Family" />
                                    <ToolbarIcon icon={ALargeSmall} label="Font Size" />
                                </div>

                                {/* Group 5: Actions */}
                                <div className="flex items-center gap-0.5">
                                    <ToolbarIcon icon={Undo} label="Undo" />
                                    <ToolbarIcon icon={Redo} label="Redo" />
                                    <ToolbarIcon icon={Keyboard} label="Keyboard Shortcuts" />
                                </div>
                            </TooltipProvider>
                        </div>
                    )}
                    {(!isQuestionFocused && !isLinkPopoverOpen && text) ? (
                        <div
                            className="w-full min-h-[80px] px-3 py-2 text-sm bg-transparent border-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap cursor-text"
                            onClick={() => {
                                setIsQuestionFocused(true);
                                setTimeout(() => {
                                    textareaRef.current?.focus();
                                }, 0);
                            }}
                            dangerouslySetInnerHTML={{
                                __html: text
                                    .replace(
                                        /\[([^\]]+)\]\(([^)]+)\)/g,
                                        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
                                    )
                                    .replace(
                                        /<a href/g,
                                        '<a class="text-primary underline hover:text-primary/80" href'
                                    )
                                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
                            }}
                        />
                    ) : (
                        <Textarea
                            ref={textareaRef}
                            placeholder="Enter question text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onFocus={() => setIsQuestionFocused(true)}
                            className="min-h-[100px] border-none focus-visible:ring-0 p-3 resize-none shadow-none leading-relaxed"
                            style={{ height: 'auto', minHeight: '100px' }}
                        />
                    )}
                </div>
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
