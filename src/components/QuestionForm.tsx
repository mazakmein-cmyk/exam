import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Check, X, Plus, Link, Pilcrow, List, MoreHorizontal, Bold, Italic, Underline, Strikethrough, Code, Table, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Sigma, Undo, Redo, Keyboard, Baseline, ALargeSmall, ChevronDown, Heading1, Heading2, Heading3, Heading4, Quote, ListOrdered, CheckSquare, MoreVertical, Trash, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Palette, Minus } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

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

const ToolbarIcon = ({ icon: Icon, label, onClick, isActive }: { icon: any, label: string, onClick?: () => void, isActive?: boolean }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                variant={isActive ? "secondary" : "ghost"}
                size="icon"
                className={`h-7 w-7 ${isActive ? "bg-black text-white hover:bg-black/90" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClick}
            >
                <Icon className="h-4 w-4" />
            </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
            <p>{label}</p>
        </TooltipContent>
    </Tooltip>
);


const TextDirectionIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M12 3v12" />
        <path d="M16 3v12" />
        <path d="M16 3H9.5a3.5 3.5 0 0 0 0 7h2.5" />
        <path d="M6 19h12" />
        <path d="M15 16l3 3-3 3" />
    </svg>
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
    const [savedSelection, setSavedSelection] = useState<Range | null>(null);
    const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
    const [isTextDirectionOpen, setIsTextDirectionOpen] = useState(false);
    const [isTablePopoverOpen, setIsTablePopoverOpen] = useState(false);
    const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
    const [isAlignMenuOpen, setIsAlignMenuOpen] = useState(false);
    const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
    const [colorTab, setColorTab] = useState<'text' | 'highlight'>('text');
    const [customColor, setCustomColor] = useState('');
    const [tableSelection, setTableSelection] = useState({ rows: 0, cols: 0 });
    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
        strikeThrough: false,
        justifyLeft: false,
        justifyCenter: false,
        justifyRight: false,
        justifyFull: false
    });
    const [fontSize, setFontSize] = useState(16); // Default 16px

    const handleFontSizeChange = (increment: boolean) => {
        const newSize = increment ? fontSize + 1 : fontSize - 1;
        if (newSize < 8 || newSize > 72) return; // Bounds check

        setFontSize(newSize);

        // Get the current selection
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // If there's selected text, wrap it in a span with the new font size
        if (!range.collapsed) {
            const selectedText = range.extractContents();
            const span = document.createElement('span');
            span.style.fontSize = `${newSize}px`;
            span.appendChild(selectedText);
            range.insertNode(span);

            // Re-select the inserted content
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);
        }

        // Update the text state
        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
        }
    };
    const textareaRef = useRef<HTMLDivElement>(null);
    const resizingRef = useRef<{
        isResizing: boolean;
        type: 'col' | 'row' | null;
        target: HTMLTableCellElement | null;
        startPos: number;
        startSize: number;
    }>({
        isResizing: false,
        type: null,
        target: null,
        startPos: 0,
        startSize: 0
    });

    // Capture selection when opening popover or dropdowns that steal focus
    useEffect(() => {
        if (isLinkPopoverOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                setSavedSelection(range);
                // Only set link text if it's the link popover
                if (isLinkPopoverOpen) {
                    setLinkText(range.toString());
                }

                // If opening color popover, fetch current color
                if (isColorPopoverOpen) {
                    const rgbToHex = (rgb: string) => {
                        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '';
                        // Check if it's already hex
                        if (rgb.startsWith('#')) return rgb;

                        const rgbValues = rgb.match(/\d+/g);
                        if (!rgbValues || rgbValues.length < 3) return '';

                        const r = parseInt(rgbValues[0]);
                        const g = parseInt(rgbValues[1]);
                        const b = parseInt(rgbValues[2]);

                        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                    };

                    try {
                        let colorValue = '';
                        if (colorTab === 'text') {
                            colorValue = document.queryCommandValue('foreColor');
                        } else {
                            colorValue = document.queryCommandValue('hiliteColor');
                        }
                        setCustomColor(rgbToHex(colorValue));
                    } catch (e) {
                        // Ignore errors if command not supported
                    }
                }

            } else {
                setSavedSelection(null);
                if (isLinkPopoverOpen) {
                    setLinkText("");
                }
            }
        }
    }, [isLinkPopoverOpen, isTextDirectionOpen, isTablePopoverOpen, isTableMenuOpen, isAlignMenuOpen, isColorPopoverOpen, colorTab]);

    // Sync text prop with innerHTML preventing cursor jumps
    useEffect(() => {
        if (textareaRef.current && textareaRef.current.innerHTML !== text) {
            textareaRef.current.innerHTML = text;
        }
    }, [text]);

    const handleInsertLink = () => {
        if (!linkUrl) return;

        // Restore selection
        if (!savedSelection) return;

        // Create link element
        const a = document.createElement('a');
        a.href = linkUrl;
        a.textContent = linkText || linkUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "text-primary underline hover:text-primary/80";
        if (openInNewTab) {
            a.target = "_blank";
        }

        // Insert at cursor using saved selection
        savedSelection.deleteContents();
        savedSelection.insertNode(a);

        // Update state
        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
        }

        setIsLinkPopoverOpen(false);
        setLinkUrl("");
        setLinkText("");
        setOpenInNewTab(false);
    };

    const handleMultiCorrectToggle = (option: string) => {
        const currentCorrect = Array.isArray(correct) ? correct : [];
        if (currentCorrect.includes(option)) {
            setCorrect(currentCorrect.filter(opt => opt !== option));
        } else {
            setCorrect([...currentCorrect, option]);
        }
    };

    const checkFormats = () => {
        setActiveFormats({
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            strikeThrough: document.queryCommandState('strikeThrough'),
            justifyLeft: document.queryCommandState('justifyLeft'),
            justifyCenter: document.queryCommandState('justifyCenter'),
            justifyRight: document.queryCommandState('justifyRight'),
            justifyFull: document.queryCommandState('justifyFull')
        });
    };

    const handleFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        checkFormats();
        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }
    };

    const handleDropdownFormat = (command: string, value?: string) => {
        // Close menus immediately
        setIsTextDirectionOpen(false);

        // Restore selection and execute command with a slight delay to allow UI to settle
        setTimeout(() => {
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            // Execute command
            document.execCommand(command, false, value);
            checkFormats();

            if (textareaRef.current) {
                setText(textareaRef.current.innerHTML);
                textareaRef.current.focus();
                setIsQuestionFocused(true);
            }
        }, 10);
    };

    const handleInsertTable = (rows: number, cols: number) => {
        setIsTablePopoverOpen(false);
        setTableSelection({ rows: 0, cols: 0 }); // Reset selection

        setTimeout(() => {
            // Restore selection
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            // Create table HTML
            let tableHtml = `<table style="border-collapse: collapse; width: 100%; margin: 10px 0;"><tbody>`;
            for (let r = 0; r < rows; r++) {
                tableHtml += `<tr>`;
                for (let c = 0; c < cols; c++) {
                    tableHtml += `<td style="border: 1px solid #3b82f6; padding: 8px; min-width: 50px;">&nbsp;</td>`;
                }
                tableHtml += `</tr>`;
            }
            tableHtml += `</tbody></table><p><br></p>`; // Add paragraph after for easy exit

            document.execCommand('insertHTML', false, tableHtml);

            if (textareaRef.current) {
                setText(textareaRef.current.innerHTML);
                textareaRef.current.focus();
                setIsQuestionFocused(true);
            }
        }, 10);
    };

    const handleColorFormat = (color: string | null, type: 'text' | 'highlight') => {
        // Restore selection
        if (savedSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }
        }

        if (color) {
            setCustomColor(color); // Sync input
            if (type === 'text') {
                document.execCommand('foreColor', false, color);
            } else {
                document.execCommand('hiliteColor', false, color);
            }
        } else {
            // Remove color
            setCustomColor('');
            if (type === 'text') {
                document.execCommand('foreColor', false, '#000000'); // Reset to black/default
            } else {
                document.execCommand('hiliteColor', false, 'transparent');
            }
        }

        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }
        // Do NOT close popover to allow user to see the hex code and try more colors
        // setIsColorPopoverOpen(false);
    };

    const handleTableAction = (action: string) => {
        setIsTableMenuOpen(false);

        // We need to find the active table cell from the saved selection or current selection
        let cell: HTMLTableCellElement | null = null;

        const selection = savedSelection ? savedSelection : window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;

        if (selection) {
            let node = selection.startContainer;
            // Traverse up to find TD or TH
            while (node && node !== textareaRef.current) {
                if (node.nodeName === 'TD' || node.nodeName === 'TH') {
                    cell = node as HTMLTableCellElement;
                    break;
                }
                node = node.parentNode!;
            }
        }

        if (!cell && action !== 'deleteTable') {
            // Try to find any table if we are deleting it, otherwise return
            // For now, simpler to require cell selection
            return;
        }

        if (!cell) return;

        const row = cell.parentElement as HTMLTableRowElement;
        const table = row.parentElement?.parentElement as HTMLTableElement; // tbody -> table
        const tbody = row.parentElement as HTMLTableSectionElement;

        if (!table || !tbody) return;

        const rowIndex = row.rowIndex;
        const colIndex = cell.cellIndex;

        if (action === 'addRowAbove') {
            const newRow = table.insertRow(rowIndex);
            for (let i = 0; i < row.cells.length; i++) {
                const newCell = newRow.insertCell(i);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '8px';
                newCell.style.minWidth = '50px';
            }
        } else if (action === 'addRowBelow') {
            const newRow = table.insertRow(rowIndex + 1);
            for (let i = 0; i < row.cells.length; i++) {
                const newCell = newRow.insertCell(i);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '8px';
                newCell.style.minWidth = '50px';
            }
        } else if (action === 'addColLeft') {
            for (let i = 0; i < table.rows.length; i++) {
                const newCell = table.rows[i].insertCell(colIndex);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '8px';
                newCell.style.minWidth = '50px';
            }
        } else if (action === 'addColRight') {
            for (let i = 0; i < table.rows.length; i++) {
                const newCell = table.rows[i].insertCell(colIndex + 1);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '8px';
                newCell.style.minWidth = '50px';
            }
        } else if (action === 'deleteRow') {
            table.deleteRow(rowIndex);
            if (table.rows.length === 0) {
                table.remove(); // Remove table if empty
            }
        } else if (action === 'deleteCol') {
            for (let i = 0; i < table.rows.length; i++) {
                table.rows[i].deleteCell(colIndex);
            }
            // check if rows are empty
            if (table.rows.length > 0 && table.rows[0].cells.length === 0) {
                table.remove();
            }
        } else if (action === 'deleteTable') {
            table.remove();
        }

        // Update state
        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
            // We loose focus/selection after DOM manipulation, might want to restore it somewhat intelligently
            // For now just focus the editor
            textareaRef.current.focus();
            setIsQuestionFocused(true);
        }
    };

    // Table Resizing Handlers
    const handleEditorMouseMove = (e: React.MouseEvent) => {
        const resizeState = resizingRef.current;
        const target = e.target as HTMLElement;

        // Handle resizing operation
        if (resizeState.isResizing && resizeState.target) {
            e.preventDefault();
            if (resizeState.type === 'col') {
                const delta = e.clientX - resizeState.startPos;
                const newWidth = Math.max(20, resizeState.startSize + delta);
                resizeState.target.style.width = `${newWidth}px`;
                resizeState.target.style.minWidth = `${newWidth}px`;
            } else if (resizeState.type === 'row') {
                const delta = e.clientY - resizeState.startPos;
                const newHeight = Math.max(20, resizeState.startSize + delta);
                resizeState.target.parentElement!.style.height = `${newHeight}px`;
            }
            return;
        }

        // Handle cursor hover state
        if (target.tagName === 'TD') {
            const rect = target.getBoundingClientRect();
            const isNearRight = Math.abs(e.clientX - rect.right) < 5;
            const isNearBottom = Math.abs(e.clientY - rect.bottom) < 5;

            if (isNearRight) {
                target.style.cursor = 'col-resize';
            } else if (isNearBottom) {
                target.style.cursor = 'row-resize';
            } else {
                target.style.cursor = 'text';
            }
        }
    };

    const handleEditorMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'TD') return;

        const rect = target.getBoundingClientRect();
        const isNearRight = Math.abs(e.clientX - rect.right) < 5;
        const isNearBottom = Math.abs(e.clientY - rect.bottom) < 5;

        if (isNearRight || isNearBottom) {
            e.preventDefault();
            resizingRef.current = {
                isResizing: true,
                type: isNearRight ? 'col' : 'row',
                target: target as HTMLTableCellElement,
                startPos: isNearRight ? e.clientX : e.clientY,
                startSize: isNearRight ? rect.width : rect.height
            };
        }
    };

    const handleEditorMouseUp = () => {
        if (resizingRef.current.isResizing) {
            resizingRef.current = {
                isResizing: false,
                type: null,
                target: null,
                startPos: 0,
                startSize: 0
            };
            // Trigger update to parental text state
            if (textareaRef.current) {
                setText(textareaRef.current.innerHTML);
            }
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
                    className={`border rounded-md transition-colors ${isQuestionFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen ? 'border-primary ring-1 ring-primary' : 'border-input'}`}
                    onBlur={(e) => {
                        // Check if the new focus is still within this container (e.g. clicking toolbar buttons)
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setIsQuestionFocused(false);
                        }
                    }}
                >
                    {(isQuestionFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen) && (
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
                                    <DropdownMenu open={isFormatMenuOpen} onOpenChange={setIsFormatMenuOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-1 bg-muted/50" onMouseDown={(e) => e.preventDefault()}>
                                                        <Pilcrow className="h-4 w-4" />
                                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Format Text</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <DropdownMenuItem>
                                                <Type className="h-4 w-4 mr-2" />
                                                <span>Text</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem>
                                                <Heading1 className="h-4 w-4 mr-2" />
                                                <span>Heading 1</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>
                                                <Heading2 className="h-4 w-4 mr-2" />
                                                <span>Heading 2</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>
                                                <Heading3 className="h-4 w-4 mr-2" />
                                                <span>Heading 3</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>
                                                <Heading4 className="h-4 w-4 mr-2" />
                                                <span>Heading 4</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem>
                                                <Quote className="h-4 w-4 mr-2" />
                                                <span>Quote</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <ToolbarIcon icon={List} label="Bullet List" />
                                    <ToolbarIcon icon={MoreHorizontal} label="More Options" />
                                </div>

                                {/* Group 2: Formatting */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <ToolbarIcon icon={Bold} label="Bold" onClick={() => handleFormat('bold')} isActive={activeFormats.bold} />
                                    <ToolbarIcon icon={Italic} label="Italic" onClick={() => handleFormat('italic')} isActive={activeFormats.italic} />
                                    <ToolbarIcon icon={Underline} label="Underline" onClick={() => handleFormat('underline')} isActive={activeFormats.underline} />
                                    <ToolbarIcon icon={Strikethrough} label="Strikethrough" onClick={() => handleFormat('strikeThrough')} isActive={activeFormats.strikeThrough} />
                                    <ToolbarIcon icon={Code} label="Code Block" />
                                </div>

                                {/* Group 3: Layout */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <Popover open={isTablePopoverOpen} onOpenChange={setIsTablePopoverOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}>
                                                        <Table className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Insert Table</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                            <div className="grid gap-1">
                                                <div className="flex justify-center text-sm font-medium mb-1">
                                                    {tableSelection.rows > 0 && tableSelection.cols > 0
                                                        ? `${tableSelection.cols} x ${tableSelection.rows}`
                                                        : "Insert Table"}
                                                </div>
                                                <div
                                                    className="grid grid-cols-10 gap-1 p-1"
                                                    onMouseLeave={() => setTableSelection({ rows: 0, cols: 0 })}
                                                >
                                                    {Array.from({ length: 100 }).map((_, i) => {
                                                        const row = Math.floor(i / 10) + 1;
                                                        const col = (i % 10) + 1;
                                                        const isSelected = row <= tableSelection.rows && col <= tableSelection.cols;

                                                        return (
                                                            <div
                                                                key={i}
                                                                className={`w-4 h-4 border rounded-sm cursor-pointer transition-colors ${isSelected ? 'bg-blue-200 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300'}`}
                                                                onMouseEnter={() => setTableSelection({ rows: row, cols: col })}
                                                                onClick={() => handleInsertTable(row, col)}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                    <DropdownMenu open={isTableMenuOpen} onOpenChange={setIsTableMenuOpen}>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onMouseDown={(e) => e.preventDefault()}>
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addRowAbove'); }}>
                                                <ArrowUp className="mr-2 h-4 w-4" /> Row Above
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addRowBelow'); }}>
                                                <ArrowDown className="mr-2 h-4 w-4" /> Row Below
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addColLeft'); }}>
                                                <ArrowLeft className="mr-2 h-4 w-4" /> Column Left
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addColRight'); }}>
                                                <ArrowRight className="mr-2 h-4 w-4" /> Column Right
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteRow'); }}>
                                                <Trash className="mr-2 h-4 w-4" /> Delete Row
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteCol'); }}>
                                                <Trash className="mr-2 h-4 w-4" /> Delete Column
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteTable'); }} className="text-red-600">
                                                <Trash className="mr-2 h-4 w-4" /> Delete Table
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <DropdownMenu open={isTextDirectionOpen} onOpenChange={setIsTextDirectionOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className={`h-7 gap-0.5 px-1 ${isTextDirectionOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                        <TextDirectionIcon className="h-4 w-4" />
                                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Text Direction</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyRight'); }}>
                                                <span>Left to Right</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyLeft'); }}>
                                                <span>Right to Left</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <DropdownMenu open={isAlignMenuOpen} onOpenChange={setIsAlignMenuOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className={`h-7 gap-0.5 px-1 ${isAlignMenuOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                        <AlignLeft className="h-4 w-4" />
                                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Alignment</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyLeft'); }}>
                                                <div className="flex items-center w-full justify-between">
                                                    <div className="flex items-center">
                                                        <AlignLeft className="mr-2 h-4 w-4" /> Left
                                                    </div>
                                                    {activeFormats.justifyLeft && <Check className="h-3 w-3 ml-2" />}
                                                </div>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyCenter'); }}>
                                                <div className="flex items-center w-full justify-between">
                                                    <div className="flex items-center">
                                                        <AlignCenter className="mr-2 h-4 w-4" /> Center
                                                    </div>
                                                    {activeFormats.justifyCenter && <Check className="h-3 w-3 ml-2" />}
                                                </div>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyRight'); }}>
                                                <div className="flex items-center w-full justify-between">
                                                    <div className="flex items-center">
                                                        <AlignRight className="mr-2 h-4 w-4" /> Right
                                                    </div>
                                                    {activeFormats.justifyRight && <Check className="h-3 w-3 ml-2" />}
                                                </div>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyFull'); }}>
                                                <div className="flex items-center w-full justify-between">
                                                    <div className="flex items-center">
                                                        <AlignJustify className="mr-2 h-4 w-4" /> Justify
                                                    </div>
                                                    {activeFormats.justifyFull && <Check className="h-3 w-3 ml-2" />}
                                                </div>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* Group 4: Text Style */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <Popover open={isColorPopoverOpen} onOpenChange={setIsColorPopoverOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${isColorPopoverOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                        <Palette className="h-4 w-4 text-indigo-500 fill-indigo-500/20" />
                                                    </Button>
                                                </PopoverTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Text Color</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <PopoverContent className="w-64 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                            <div className="space-y-3">
                                                {/* Tabs */}
                                                <div className="flex border rounded overflow-hidden">
                                                    <button
                                                        className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'text' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
                                                        onClick={() => setColorTab('text')}
                                                    >
                                                        Color
                                                    </button>
                                                    <button
                                                        className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'highlight' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}
                                                        onClick={() => setColorTab('highlight')}
                                                    >
                                                        Background
                                                    </button>
                                                </div>

                                                {/* Color Grid */}
                                                <div className="grid grid-cols-10 gap-1">
                                                    {[
                                                        "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
                                                        "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff",
                                                        "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc",
                                                        "#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd",
                                                        "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0",
                                                        "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79",
                                                        "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47",
                                                        "#5b0f00", "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130"
                                                    ].map((color, i) => (
                                                        <button
                                                            key={i}
                                                            className="w-4 h-4 rounded-[1px] border border-transparent hover:border-black/50 transition-colors"
                                                            style={{ backgroundColor: color }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                handleColorFormat(color, colorTab);
                                                            }}
                                                            title={color}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Custom Color Input */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-medium">Set color</label>
                                                    <div className="flex gap-2">
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="text"
                                                                className="w-full h-8 pl-2 pr-2 border rounded text-xs focus:ring-1 focus:ring-black focus:border-black outline-none"
                                                                placeholder="#000000"
                                                                value={customColor}
                                                                onChange={(e) => setCustomColor(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        handleColorFormat(customColor, colorTab);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                        <Button
                                                            size="icon"
                                                            variant="outline"
                                                            className="h-8 w-8"
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onClick={() => handleColorFormat(customColor, colorTab)}
                                                        >
                                                            <ArrowRight className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Remove Color */}
                                                <button
                                                    className="w-full text-left text-xs text-muted-foreground hover:text-black py-1"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        handleColorFormat(null, colorTab);
                                                    }}
                                                >
                                                    Remove color
                                                </button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 mx-1 border border-slate-200 rounded-md bg-white p-0.5 h-7">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 rounded-[2px] hover:bg-slate-100"
                                                    onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(false); }}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <div className="w-8 flex justify-center text-xs font-medium select-none text-slate-700">
                                                    {fontSize}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 rounded-[2px] hover:bg-slate-100"
                                                    onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(true); }}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                            <p>Font Size</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>

                                {/* Group 5: Actions */}
                                <div className="flex items-center gap-0.5">
                                    <ToolbarIcon icon={Undo} label="Undo" onClick={() => handleFormat('undo')} />
                                    <ToolbarIcon icon={Redo} label="Redo" onClick={() => handleFormat('redo')} />
                                    <Popover>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}>
                                                        <Keyboard className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Keyboard Shortcuts</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <PopoverContent className="w-80 p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                            <div className="p-4 h-[300px] overflow-y-auto">
                                                <h4 className="font-medium mb-4 leading-none">Keyboard shortcuts</h4>
                                                <div className="space-y-4 text-sm">
                                                    <div className="grid grid-cols-[1fr,auto] gap-x-4 gap-y-2 items-center">
                                                        <span className="text-muted-foreground">Undo</span> <span>Ctrl+Z</span>
                                                        <span className="text-muted-foreground">Redo</span> <span>Ctrl+Shift+Z</span>
                                                        <span className="text-muted-foreground">Select all blocks</span> <span>Ctrl+A</span>
                                                        <span className="text-muted-foreground">Select text in the block</span> <span>Ctrl+Shift+A</span>
                                                        <span className="text-muted-foreground">Duplicate block</span> <span>Ctrl+Shift+D</span>
                                                        <span className="text-muted-foreground">Move line up</span> <span>Ctrl+Shift+↑</span>
                                                        <span className="text-muted-foreground">Move line down</span> <span>Ctrl+Shift+↓</span>
                                                        <span className="text-muted-foreground">Remove inline format</span> <span>Ctrl+Shift+M</span>

                                                        <div className="col-span-2 h-px bg-border my-2" />

                                                        <span className="text-muted-foreground">Bold</span> <span>Ctrl+B</span>
                                                        <span className="text-muted-foreground">Italic</span> <span>Ctrl+I</span>
                                                        <span className="text-muted-foreground">Underline</span> <span>Ctrl+U</span>
                                                        <span className="text-muted-foreground">Superscript</span> <span>Ctrl+H</span>
                                                        <span className="text-muted-foreground">Subscript</span> <span>Ctrl+L</span>
                                                        <span className="text-muted-foreground">Normal text</span> <span>Ctrl+Alt+0</span>
                                                        <span className="text-muted-foreground">Heading 1</span> <span>Ctrl+Alt+1</span>
                                                        <span className="text-muted-foreground">Heading 2</span> <span>Ctrl+Alt+2</span>
                                                        <span className="text-muted-foreground">Heading 3</span> <span>Ctrl+Alt+3</span>
                                                        <span className="text-muted-foreground">Heading 4</span> <span>Ctrl+Alt+4</span>
                                                        <span className="text-muted-foreground">Heading 5</span> <span>Ctrl+Alt+5</span>
                                                        <span className="text-muted-foreground">Heading 6</span> <span>Ctrl+Alt+6</span>

                                                        <div className="col-span-2 h-px bg-border my-2" />

                                                        <span className="text-muted-foreground">Ordered List</span> <span>Ctrl+Shift+7</span>
                                                        <span className="text-muted-foreground">Unordered List</span> <span>Ctrl+Shift+8</span>
                                                        <span className="text-muted-foreground">Indent</span> <span>Ctrl+]</span>
                                                        <span className="text-muted-foreground">Outdent</span> <span>Ctrl+[</span>
                                                        <span className="text-muted-foreground">Link</span> <span>Ctrl+K</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </TooltipProvider>
                        </div>
                    )}
                    <div
                        ref={textareaRef}
                        contentEditable
                        className={`min-h-[100px] w-full px-3 py-2 text-sm border-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap cursor-text overflow-auto ${!text ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground' : ''}`}
                        data-placeholder="Enter question text"
                        onInput={(e) => setText(e.currentTarget.innerHTML)}
                        onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                setIsQuestionFocused(false);
                            }
                        }}
                        onKeyUp={checkFormats}
                        onMouseUp={(e) => {
                            checkFormats();
                            handleEditorMouseUp();
                        }}
                        onMouseMove={handleEditorMouseMove}
                        onMouseDown={handleEditorMouseDown}
                        onFocus={() => setIsQuestionFocused(true)}
                        style={{ height: 'auto', minHeight: '100px' }}
                    />
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
                    <Plus className="mr-2 h-4 w-4" /> Save Question
                </Button>
            )}
        </div>
    );
}
