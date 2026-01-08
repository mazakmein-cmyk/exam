import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Bold, Italic, Underline, Strikethrough, Table, AlignLeft, AlignCenter, AlignRight, AlignJustify, Sigma, Undo, Redo, ChevronDown, MoreVertical, Trash, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Palette, Minus, Plus, Link, Pilcrow, List, Type, Heading1, Heading2, Heading3, Heading4, Quote, Keyboard, Check
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface OptionEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

// Custom Text Direction Icon
const TextDirectionIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 12H11" /><path d="m15 16-4-4 4-4" /><path d="M4 4v16" />
    </svg>
);

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

export function OptionEditor({ value, onChange, placeholder = "Enter option" }: OptionEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLDivElement>(null);
    const [savedSelection, setSavedSelection] = useState<Range | null>(null);

    // Popover states
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [openInNewTab, setOpenInNewTab] = useState(false);

    const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
    const [isTablePopoverOpen, setIsTablePopoverOpen] = useState(false);
    const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
    const [isTextDirectionOpen, setIsTextDirectionOpen] = useState(false);
    const [isAlignMenuOpen, setIsAlignMenuOpen] = useState(false);
    const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
    const [colorTab, setColorTab] = useState<'text' | 'highlight'>('text');
    const [customColor, setCustomColor] = useState('');
    const [tableSelection, setTableSelection] = useState({ rows: 0, cols: 0 });

    const [isFormulaPopoverOpen, setIsFormulaPopoverOpen] = useState(false);
    const [formulaLatex, setFormulaLatex] = useState("");

    const [fontSize, setFontSize] = useState(16);
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

    const formulaPreview = useMemo(() => {
        if (!formulaLatex.trim()) return "";
        try {
            return katex.renderToString(formulaLatex, {
                throwOnError: false,
                displayMode: true
            });
        } catch {
            return "<span class='text-destructive'>Invalid LaTeX</span>";
        }
    }, [formulaLatex]);

    // Sync value with innerHTML
    useEffect(() => {
        if (textareaRef.current && textareaRef.current.innerHTML !== value) {
            textareaRef.current.innerHTML = value;
        }
    }, [value]);

    // Save selection when popovers open
    useEffect(() => {
        if (isLinkPopoverOpen || isTablePopoverOpen || isColorPopoverOpen || isFormulaPopoverOpen || isAlignMenuOpen || isTextDirectionOpen || isFormatMenuOpen) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                setSavedSelection(range);
                if (isLinkPopoverOpen) {
                    setLinkText(range.toString());
                }
            } else {
                setSavedSelection(null);
                if (isLinkPopoverOpen) {
                    setLinkText("");
                }
            }
        }
    }, [isLinkPopoverOpen, isTablePopoverOpen, isColorPopoverOpen, isFormulaPopoverOpen, isAlignMenuOpen, isTextDirectionOpen, isFormatMenuOpen]);

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

    const handleFormat = (command: string, val?: string) => {
        document.execCommand(command, false, val);
        checkFormats();
        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }
    };

    const handleDropdownFormat = (command: string, val?: string) => {
        setIsFormatMenuOpen(false);
        setIsTextDirectionOpen(false);
        setIsAlignMenuOpen(false);
        setTimeout(() => {
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }
            if (val) {
                document.execCommand(command, false, `<${val}>`);
            } else {
                document.execCommand(command, false);
            }
            checkFormats();
            if (textareaRef.current) {
                onChange(textareaRef.current.innerHTML);
                textareaRef.current.focus();
            }
        }, 10);
    };

    const handleInsertLink = () => {
        if (!linkUrl) return;
        if (!savedSelection) return;

        const a = document.createElement('a');
        a.href = linkUrl;
        a.textContent = linkText || linkUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "text-primary underline hover:text-primary/80";
        if (openInNewTab) {
            a.target = "_blank";
        }

        savedSelection.deleteContents();
        savedSelection.insertNode(a);

        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
        }

        setIsLinkPopoverOpen(false);
        setLinkUrl("");
        setLinkText("");
        setOpenInNewTab(false);
    };

    const handleInsertTable = (rows: number, cols: number) => {
        setIsTablePopoverOpen(false);
        setTableSelection({ rows: 0, cols: 0 });

        setTimeout(() => {
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            let tableHtml = `<table style="border-collapse: collapse; width: 100%; margin: 4px 0;"><tbody>`;
            for (let r = 0; r < rows; r++) {
                tableHtml += `<tr>`;
                for (let c = 0; c < cols; c++) {
                    tableHtml += `<td style="border: 1px solid #3b82f6; padding: 4px; min-width: 30px;">&nbsp;</td>`;
                }
                tableHtml += `</tr>`;
            }
            tableHtml += `</tbody></table>`;

            document.execCommand('insertHTML', false, tableHtml);

            if (textareaRef.current) {
                onChange(textareaRef.current.innerHTML);
                textareaRef.current.focus();
            }
        }, 10);
    };

    const handleTableAction = (action: string) => {
        setIsTableMenuOpen(false);
        let cell: HTMLTableCellElement | null = null;
        const selection = savedSelection ? savedSelection : window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;

        if (selection) {
            let node = selection.startContainer;
            while (node && node !== textareaRef.current) {
                if (node.nodeName === 'TD' || node.nodeName === 'TH') {
                    cell = node as HTMLTableCellElement;
                    break;
                }
                node = node.parentNode!;
            }
        }

        if (!cell) return;

        const row = cell.parentElement as HTMLTableRowElement;
        const table = row.parentElement?.parentElement as HTMLTableElement;
        if (!table) return;

        const rowIndex = row.rowIndex;
        const colIndex = cell.cellIndex;

        if (action === 'addRowAbove') {
            const newRow = table.insertRow(rowIndex);
            for (let i = 0; i < row.cells.length; i++) {
                const newCell = newRow.insertCell(i);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '4px';
                newCell.style.minWidth = '30px';
            }
        } else if (action === 'addRowBelow') {
            const newRow = table.insertRow(rowIndex + 1);
            for (let i = 0; i < row.cells.length; i++) {
                const newCell = newRow.insertCell(i);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '4px';
                newCell.style.minWidth = '30px';
            }
        } else if (action === 'addColLeft') {
            for (let i = 0; i < table.rows.length; i++) {
                const newCell = table.rows[i].insertCell(colIndex);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '4px';
                newCell.style.minWidth = '30px';
            }
        } else if (action === 'addColRight') {
            for (let i = 0; i < table.rows.length; i++) {
                const newCell = table.rows[i].insertCell(colIndex + 1);
                newCell.innerHTML = '&nbsp;';
                newCell.style.border = '1px solid #3b82f6';
                newCell.style.padding = '4px';
                newCell.style.minWidth = '30px';
            }
        } else if (action === 'deleteRow') {
            table.deleteRow(rowIndex);
            if (table.rows.length === 0) table.remove();
        } else if (action === 'deleteCol') {
            for (let i = 0; i < table.rows.length; i++) {
                table.rows[i].deleteCell(colIndex);
            }
            if (table.rows[0]?.cells.length === 0) table.remove();
        } else if (action === 'deleteTable') {
            table.remove();
        }

        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
        }
    };

    const handleColorFormat = (color: string | null, type: 'text' | 'highlight') => {
        if (savedSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }
        }

        if (color) {
            setCustomColor(color);
            if (type === 'text') {
                document.execCommand('foreColor', false, color);
            } else {
                document.execCommand('hiliteColor', false, color);
            }
        } else {
            setCustomColor('');
            if (type === 'text') {
                document.execCommand('foreColor', false, '#000000');
            } else {
                document.execCommand('hiliteColor', false, 'transparent');
            }
        }

        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }
    };

    const handleInsertFormula = () => {
        if (!formulaLatex.trim()) return;

        if (savedSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }
        }

        const formulaHtml = katex.renderToString(formulaLatex, {
            throwOnError: false,
            displayMode: false
        });
        const wrappedHtml = `<span class="katex-formula" contenteditable="false">${formulaHtml}</span>&nbsp;`;
        document.execCommand('insertHTML', false, wrappedHtml);

        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }

        setIsFormulaPopoverOpen(false);
        setFormulaLatex("");
    };

    const handleFontSizeChange = (increment: boolean) => {
        const newSize = increment ? fontSize + 1 : fontSize - 1;
        if (newSize < 8 || newSize > 36) return;
        setFontSize(newSize);

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            const selectedText = range.extractContents();
            const span = document.createElement('span');
            span.style.fontSize = `${newSize}px`;
            span.appendChild(selectedText);
            range.insertNode(span);

            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);
        }

        if (textareaRef.current) {
            onChange(textareaRef.current.innerHTML);
        }
    };

    return (
        <TooltipProvider>
            <div className={`border rounded-md ${isFocused ? 'ring-2 ring-primary border-primary' : 'border-input'}`}>
                {/* Toolbar - visible on focus */}
                {isFocused && (
                    <div className="flex flex-wrap items-center gap-0.5 p-1 border-b bg-muted/30">
                        {/* Group 1: Insert & Format */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            {/* Formula */}
                            <Popover open={isFormulaPopoverOpen} onOpenChange={setIsFormulaPopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" size="icon" className={`h-7 w-7 ${isFormulaPopoverOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                <Sigma className="h-4 w-4" />
                                            </Button>
                                        </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                        <p>Insert Formula</p>
                                    </TooltipContent>
                                </Tooltip>
                                <PopoverContent className="w-80 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium">LaTeX Formula</p>
                                        <Input
                                            placeholder="e.g. \frac{a}{b}"
                                            value={formulaLatex}
                                            onChange={(e) => setFormulaLatex(e.target.value)}
                                            className="h-7 text-xs font-mono"
                                        />
                                        {formulaPreview && (
                                            <div className="bg-muted/50 rounded p-2 min-h-[40px] flex items-center justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: formulaPreview }} />
                                        )}
                                        <div className="flex flex-wrap gap-1">
                                            {[
                                                { label: "√", latex: "\\sqrt{x}" },
                                                { label: "x²", latex: "x^{2}" },
                                                { label: "xₙ", latex: "x_{n}" },
                                                { label: "a/b", latex: "\\frac{a}{b}" },
                                                { label: "∑", latex: "\\sum_{i=1}^{n}" },
                                                { label: "∫", latex: "\\int_{a}^{b}" },
                                                { label: "π", latex: "\\pi" },
                                                { label: "∞", latex: "\\infty" }
                                            ].map((t, i) => (
                                                <Button key={i} variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setFormulaLatex(prev => prev + t.latex)}>
                                                    {t.label}
                                                </Button>
                                            ))}
                                        </div>
                                        <Button size="sm" className="h-6 text-xs w-full" onClick={handleInsertFormula}>Insert Formula</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Link */}
                            <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}>
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
                                            <Input placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-8 text-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <Input placeholder="Text" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="h-8 text-sm" />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="openInNewTabOpt" checked={openInNewTab} onCheckedChange={(checked) => setOpenInNewTab(checked as boolean)} />
                                            <label htmlFor="openInNewTabOpt" className="text-xs font-medium leading-none cursor-pointer">Open link in new tab</label>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button size="sm" className="h-7 text-xs bg-black text-white hover:bg-gray-800" onClick={handleInsertLink}>Insert</Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Paragraph Format */}
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
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'p'); }}>
                                        <Type className="h-4 w-4 mr-2" /><span>Text</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h1'); }}>
                                        <Heading1 className="h-4 w-4 mr-2" /><span>Heading 1</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h2'); }}>
                                        <Heading2 className="h-4 w-4 mr-2" /><span>Heading 2</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h3'); }}>
                                        <Heading3 className="h-4 w-4 mr-2" /><span>Heading 3</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h4'); }}>
                                        <Heading4 className="h-4 w-4 mr-2" /><span>Heading 4</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'blockquote'); }}>
                                        <Quote className="h-4 w-4 mr-2" /><span>Quote</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* List */}
                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-1 bg-muted/50" onMouseDown={(e) => e.preventDefault()}>
                                                <List className="h-4 w-4" />
                                                <ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                        <p>Lists</p>
                                    </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem>
                                        <span>Bullet List</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Group 2: Formatting (B I U S) */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            <ToolbarIcon icon={Bold} label="Bold" onClick={() => handleFormat('bold')} isActive={activeFormats.bold} />
                            <ToolbarIcon icon={Italic} label="Italic" onClick={() => handleFormat('italic')} isActive={activeFormats.italic} />
                            <ToolbarIcon icon={Underline} label="Underline" onClick={() => handleFormat('underline')} isActive={activeFormats.underline} />
                            <ToolbarIcon icon={Strikethrough} label="Strikethrough" onClick={() => handleFormat('strikeThrough')} isActive={activeFormats.strikeThrough} />
                        </div>

                        {/* Group 3: Layout (Table, More, TextDir, Align) */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            {/* Table */}
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
                                            {tableSelection.rows > 0 && tableSelection.cols > 0 ? `${tableSelection.cols} x ${tableSelection.rows}` : "Insert Table"}
                                        </div>
                                        <div className="grid grid-cols-10 gap-1 p-1" onMouseLeave={() => setTableSelection({ rows: 0, cols: 0 })}>
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

                            {/* Table Actions */}
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

                            {/* Text Direction */}
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

                            {/* Alignment */}
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
                                            <div className="flex items-center"><AlignLeft className="mr-2 h-4 w-4" /> Left</div>
                                            {activeFormats.justifyLeft && <Check className="h-3 w-3 ml-2" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyCenter'); }}>
                                        <div className="flex items-center w-full justify-between">
                                            <div className="flex items-center"><AlignCenter className="mr-2 h-4 w-4" /> Center</div>
                                            {activeFormats.justifyCenter && <Check className="h-3 w-3 ml-2" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyRight'); }}>
                                        <div className="flex items-center w-full justify-between">
                                            <div className="flex items-center"><AlignRight className="mr-2 h-4 w-4" /> Right</div>
                                            {activeFormats.justifyRight && <Check className="h-3 w-3 ml-2" />}
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyFull'); }}>
                                        <div className="flex items-center w-full justify-between">
                                            <div className="flex items-center"><AlignJustify className="mr-2 h-4 w-4" /> Justify</div>
                                            {activeFormats.justifyFull && <Check className="h-3 w-3 ml-2" />}
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Group 4: Text Style (Color, Font Size) */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            {/* Color */}
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
                                        <div className="flex border rounded overflow-hidden">
                                            <button className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'text' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} onClick={() => setColorTab('text')}>Color</button>
                                            <button className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'highlight' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} onClick={() => setColorTab('highlight')}>Background</button>
                                        </div>
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
                                                    onMouseDown={(e) => { e.preventDefault(); handleColorFormat(color, colorTab); }}
                                                    title={color}
                                                />
                                            ))}
                                        </div>
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
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleColorFormat(customColor, colorTab); } }}
                                                    />
                                                </div>
                                                <Button size="icon" variant="outline" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => handleColorFormat(customColor, colorTab)}>
                                                    <ArrowRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <button className="w-full text-left text-xs text-muted-foreground hover:text-black py-1" onMouseDown={(e) => { e.preventDefault(); handleColorFormat(null, colorTab); }}>Remove color</button>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            {/* Font Size */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 mx-1 border border-slate-200 rounded-md bg-white p-0.5 h-7">
                                        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[2px] hover:bg-slate-100" onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(false); }}>
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <div className="w-8 flex justify-center text-xs font-medium select-none text-slate-700">{fontSize}</div>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[2px] hover:bg-slate-100" onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(true); }}>
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                    <p>Font Size</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        {/* Group 5: Actions (Undo, Redo, Keyboard) */}
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
                                <PopoverContent className="w-72 p-3" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-sm">Keyboard Shortcuts</h4>
                                        <div className="text-xs space-y-1">
                                            <div className="flex justify-between"><span>Bold</span><kbd className="bg-muted px-1 rounded">Ctrl+B</kbd></div>
                                            <div className="flex justify-between"><span>Italic</span><kbd className="bg-muted px-1 rounded">Ctrl+I</kbd></div>
                                            <div className="flex justify-between"><span>Underline</span><kbd className="bg-muted px-1 rounded">Ctrl+U</kbd></div>
                                            <div className="flex justify-between"><span>Undo</span><kbd className="bg-muted px-1 rounded">Ctrl+Z</kbd></div>
                                            <div className="flex justify-between"><span>Redo</span><kbd className="bg-muted px-1 rounded">Ctrl+Y</kbd></div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )}

                {/* Content Editable Area */}
                <div
                    ref={textareaRef}
                    contentEditable
                    className={`min-h-[36px] px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap cursor-text overflow-auto ${!value ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground' : ''}`}
                    data-placeholder={placeholder}
                    onInput={(e) => onChange(e.currentTarget.innerHTML)}
                    onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setIsFocused(false);
                        }
                    }}
                    onKeyUp={checkFormats}
                    onMouseUp={checkFormats}
                    onFocus={() => setIsFocused(true)}
                    style={{ minHeight: '36px' }}
                />
            </div>
        </TooltipProvider>
    );
}
