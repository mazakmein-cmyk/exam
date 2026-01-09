import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Check, X, Plus, Link, Pilcrow, List, MoreHorizontal, Bold, Italic, Underline, Strikethrough, Code, Table, AlignLeft, AlignCenter, AlignRight, AlignJustify, Type, Sigma, Undo, Redo, Keyboard, Baseline, ALargeSmall, ChevronDown, Heading1, Heading2, Heading3, Heading4, Quote, ListOrdered, CheckSquare, MoreVertical, Trash, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Palette, Minus, Search, Copy } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formulaLibrary, quickInsertTemplates } from "@/lib/formulaLibrary";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
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

export function RichTextEditor({ value, onChange, placeholder = "Enter text...", className }: RichTextEditorProps) {
    const textareaRef = useRef<HTMLDivElement>(null);
    const resizingRef = useRef<{ isResizing: boolean; type: 'col' | 'row' | null; target: HTMLTableCellElement | null; startPos: number; startSize: number }>({
        isResizing: false,
        type: null,
        target: null,
        startPos: 0,
        startSize: 0
    });
    const [isEditorFocused, setIsEditorFocused] = useState(false);

    // Link Popover State
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkText, setLinkText] = useState("");
    const [openInNewTab, setOpenInNewTab] = useState(false);
    const [savedSelection, setSavedSelection] = useState<Range | null>(null);

    // Menus State
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

    // Formula Popover State
    const [isFormulaPopoverOpen, setIsFormulaPopoverOpen] = useState(false);
    const [formulaLatex, setFormulaLatex] = useState("");

    // Formula Library State
    const [isFormulaLibraryOpen, setIsFormulaLibraryOpen] = useState(false);
    const [formulaLibrarySearch, setFormulaLibrarySearch] = useState("");
    const [formulaLibraryTab, setFormulaLibraryTab] = useState("basic");

    // Initialize content
    useEffect(() => {
        if (textareaRef.current) {
            if (value === undefined || value === null) {
                // do nothing
            } else if (value !== textareaRef.current.innerHTML) {
                // Avoid updating if active element is this editor and value is lagging
                // But for first load or external updates, we need this.
                if (document.activeElement !== textareaRef.current) {
                    textareaRef.current.innerHTML = value;
                }
            }
        }
    }, [value]);

    // Handle updates when formatting changes or typing
    const updateContent = () => {
        if (textareaRef.current) {
            const html = textareaRef.current.innerHTML;
            if (html !== value) {
                onChange(html);
            }
        }
    };

    // Render LaTeX formula preview
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

    const renderFormulaPreview = (latex: string) => {
        try {
            return katex.renderToString(latex, {
                throwOnError: false,
                displayMode: false
            });
        } catch {
            return "<span class='text-destructive text-xs'>Error</span>";
        }
    };

    const handleCopyFormula = (latex: string) => {
        navigator.clipboard.writeText(latex);
    };

    const handleInsertFormula = () => {
        if (!formulaLatex.trim()) return;

        try {
            const html = katex.renderToString(formulaLatex, {
                throwOnError: false,
                displayMode: false
            });

            // Restore saved selection
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            // Insert HTML with contenteditable=false to treat as a block
            const pad = `&nbsp;<span contenteditable="false" data-latex="${formulaLatex.replace(/"/g, '&quot;')}" class="math-formula">${html}</span>&nbsp;`;
            document.execCommand('insertHTML', false, pad);

            updateContent();
            setIsFormulaPopoverOpen(false);
            setFormulaLatex("");
        } catch (e) {
            console.error("Failed to insert formula", e);
        }
    };

    const handleFontSizeChange = (increment: boolean) => {
        const newSize = increment ? fontSize + 1 : Math.max(8, fontSize - 1);
        setFontSize(newSize);
        if (savedSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }
        }
        // Minimal logic as placeholder for now, since native execCommand fontSize uses 1-7.
    };

    // Save selection before opening popovers
    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            setSavedSelection(selection.getRangeAt(0).cloneRange());
        }
    };

    const handleInsertLink = () => {
        if (!linkUrl || !savedSelection) return;

        // Restore selection
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(savedSelection);
        }

        const a = document.createElement('a');
        a.href = linkUrl;
        a.target = openInNewTab ? "_blank" : "_self";
        a.innerText = linkText || linkUrl; // Use URL if no text provided
        a.className = "text-blue-600 underline cursor-pointer";
        if (openInNewTab) a.rel = "noopener noreferrer";

        // Insert at cursor using saved selection
        savedSelection.deleteContents();
        savedSelection.insertNode(a);

        updateContent();
        setIsLinkPopoverOpen(false);
        setLinkUrl("");
        setLinkText("");
        setOpenInNewTab(false);
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
        saveSelection();
    };

    const handleFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        checkFormats();
        if (textareaRef.current) {
            textareaRef.current.focus();
            updateContent();
        }
    };

    const handleDropdownFormat = (command: string, value?: string) => {
        setIsTextDirectionOpen(false);
        setIsFormatMenuOpen(false);
        setIsAlignMenuOpen(false);

        setTimeout(() => {
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            if (command === 'formatBlock' && value) {
                document.execCommand(command, false, `<${value}>`);
            } else {
                document.execCommand(command, false, value);
            }
            checkFormats();

            if (textareaRef.current) {
                textareaRef.current.focus();
                setIsEditorFocused(true);
                updateContent();
            }
        }, 10);
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

            let tableHtml = `<table style="border-collapse: collapse; width: 100%; margin: 10px 0;"><tbody>`;
            for (let r = 0; r < rows; r++) {
                tableHtml += `<tr>`;
                for (let c = 0; c < cols; c++) {
                    tableHtml += `<td style="border: 1px solid #3b82f6; padding: 8px; min-width: 50px;">&nbsp;</td>`;
                }
                tableHtml += `</tr>`;
            }
            tableHtml += `</tbody></table><p><br></p>`;

            document.execCommand('insertHTML', false, tableHtml);

            if (textareaRef.current) {
                textareaRef.current.focus();
                setIsEditorFocused(true);
                updateContent();
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

        if (!cell && action !== 'deleteTable') return;
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
            if (table.rows.length === 0) table.remove();
        } else if (action === 'deleteCol') {
            for (let i = 0; i < table.rows.length; i++) {
                table.rows[i].deleteCell(colIndex);
            }
            if (table.rows.length > 0 && table.rows[0].cells.length === 0) table.remove();
        } else if (action === 'deleteTable') {
            table.remove();
        }

        if (textareaRef.current) {
            updateContent();
            textareaRef.current.focus();
            setIsEditorFocused(true);
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
            document.execCommand(type === 'text' ? 'foreColor' : 'hiliteColor', false, color);
        } else {
            setCustomColor('');
            document.execCommand(type === 'text' ? 'foreColor' : 'hiliteColor', false, type === 'text' ? '#000000' : 'transparent');
        }

        if (textareaRef.current) {
            textareaRef.current.focus();
            updateContent();
        }
    };

    const handleEditorMouseMove = (e: React.MouseEvent) => {
        const resizeState = resizingRef.current;
        const target = e.target as HTMLElement;

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

        if (target.tagName === 'TD') {
            const rect = target.getBoundingClientRect();
            const isNearRight = Math.abs(e.clientX - rect.right) < 5;
            const isNearBottom = Math.abs(e.clientY - rect.bottom) < 5;
            if (isNearRight) target.style.cursor = 'col-resize';
            else if (isNearBottom) target.style.cursor = 'row-resize';
            else target.style.cursor = 'text';
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
            resizingRef.current = { isResizing: false, type: null, target: null, startPos: 0, startSize: 0 };
            updateContent();
        }
    };

    return (
        <div className={cn(`border rounded-md transition-colors ${isEditorFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen || isFormulaPopoverOpen ? 'border-primary ring-1 ring-primary' : 'border-input'}`, className)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsEditorFocused(false);
                }
            }}
        >
            {(isEditorFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen || isFormulaPopoverOpen) && (
                <div className="flex items-center gap-1 p-1 border-b bg-muted/20 overflow-x-auto">
                    <TooltipProvider>
                        {/* Group 1: Insert/Structure */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            <Dialog open={isFormulaPopoverOpen} onOpenChange={setIsFormulaPopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DialogTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}>
                                                <Sigma className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Maths and Formula</p></TooltipContent>
                                </Tooltip>
                                <DialogContent className="sm:max-w-md">
                                    <DialogHeader>
                                        <div className="flex justify-between items-center">
                                            <DialogTitle>Maths and Formula</DialogTitle>
                                            <a href="https://katex.org/docs/supported.html" target="_blank" rel="noopener noreferrer" className="text-sm text-orange-500 hover:underline flex items-center gap-1">ⓘ LaTeX Help</a>
                                        </div>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div className="min-h-[60px] border rounded-md p-3 bg-muted/30 flex items-center justify-center">
                                            {formulaPreview ? <div dangerouslySetInnerHTML={{ __html: formulaPreview }} /> : <span className="text-muted-foreground text-sm">PREVIEW</span>}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium mb-2">Quick Insert:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {quickInsertTemplates.map((template) => (
                                                    <Button key={template.label} variant="outline" size="sm" className="text-xs" onClick={() => setFormulaLatex(prev => prev + template.latex)}>{template.label}</Button>
                                                ))}
                                                <Dialog open={isFormulaLibraryOpen} onOpenChange={setIsFormulaLibraryOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="text-xs text-primary">More...</Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-4xl max-h-[80vh]">
                                                        <DialogHeader><DialogTitle>Formula Library</DialogTitle></DialogHeader>
                                                        <div className="space-y-4">
                                                            <div className="relative">
                                                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                <Input placeholder="Search formulas..." value={formulaLibrarySearch} onChange={(e) => setFormulaLibrarySearch(e.target.value)} className="pl-10" />
                                                            </div>
                                                            <Tabs value={formulaLibraryTab} onValueChange={setFormulaLibraryTab}>
                                                                <TabsList className="bg-transparent border-b rounded-none w-full justify-start gap-4 h-auto p-0">
                                                                    {Object.keys(formulaLibrary).map(key => (
                                                                        <TabsTrigger key={key} value={key} className="capitalize rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2">
                                                                            {formulaLibrary[key].title || key}
                                                                        </TabsTrigger>
                                                                    ))}
                                                                </TabsList>
                                                                <ScrollArea className="h-[400px] mt-4">
                                                                    {Object.keys(formulaLibrary).map(key => (
                                                                        <TabsContent key={key} value={key} className="mt-0">
                                                                            {/* Updated robust rendering logic */}
                                                                            {(() => {
                                                                                const activeSection = formulaLibrary[key];
                                                                                const renderList = activeSection.sections || (activeSection.formulas ? [{ name: activeSection.title, formulas: activeSection.formulas }] : []);

                                                                                return renderList.map((section: any) => (
                                                                                    <div key={section.name || 'default'} className="mb-6">
                                                                                        <h4 className="font-semibold mb-3">{section.name}</h4>
                                                                                        <div className="grid grid-cols-3 gap-4">
                                                                                            {section.formulas && section.formulas.filter((f: any) => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase())).map((formula: any) => (
                                                                                                <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                    <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                        <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => handleCopyFormula(formula.latex)}><Copy className="h-3 w-3" /></Button>
                                                                                                    </div>
                                                                                                    <div className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }} />
                                                                                                    <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ));
                                                                            })()}
                                                                        </TabsContent>
                                                                    ))}
                                                                </ScrollArea>
                                                            </Tabs>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        </div>
                                        <Textarea placeholder="e.g., x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}" value={formulaLatex} onChange={(e) => setFormulaLatex(e.target.value)} className="min-h-[80px] font-mono text-sm border-orange-300 focus:border-orange-500 focus:ring-orange-500" />
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => { setIsFormulaPopoverOpen(false); setFormulaLatex(""); }}>Cancel</Button>
                                            <Button size="sm" onClick={handleInsertFormula} disabled={!formulaLatex.trim()}>Insert</Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>

                            <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}><Link className="h-4 w-4" /></Button>
                                        </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Insert Link</p></TooltipContent>
                                </Tooltip>
                                <PopoverContent className="w-80 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="space-y-3">
                                        <Input placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-8 text-sm" />
                                        <Input placeholder="Text" value={linkText} onChange={(e) => setLinkText(e.target.value)} className="h-8 text-sm" />
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id="openInNewTab" checked={openInNewTab} onCheckedChange={(checked) => setOpenInNewTab(checked as boolean)} />
                                            <label htmlFor="openInNewTab" className="text-xs font-medium cursor-pointer">Open link in new tab</label>
                                        </div>
                                        <div className="flex justify-end"><Button size="sm" className="h-7 text-xs" onClick={handleInsertLink}>Insert</Button></div>
                                    </div>
                                </PopoverContent>
                            </Popover>

                            <DropdownMenu open={isFormatMenuOpen} onOpenChange={setIsFormatMenuOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-1 bg-muted/50" onMouseDown={(e) => e.preventDefault()}>
                                                <Pilcrow className="h-4 w-4" /><ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Format Text</p></TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'p'); }}><Type className="h-4 w-4 mr-2" /><span>Text</span></DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h1'); }}><Heading1 className="h-4 w-4 mr-2" /><span>Heading 1</span></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h2'); }}><Heading2 className="h-4 w-4 mr-2" /><span>Heading 2</span></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h3'); }}><Heading3 className="h-4 w-4 mr-2" /><span>Heading 3</span></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h4'); }}><Heading4 className="h-4 w-4 mr-2" /><span>Heading 4</span></DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'blockquote'); }}><Quote className="h-4 w-4 mr-2" /><span>Quote</span></DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <DropdownMenu>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-1 bg-muted/50" onMouseDown={(e) => e.preventDefault()}>
                                                <List className="h-4 w-4" /><ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Lists</p></TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onClick={() => handleFormat('insertUnorderedList')}><span>Bullet List</span></DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Group 2: Formatting */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            <ToolbarIcon icon={Bold} label="Bold" onClick={() => handleFormat('bold')} isActive={activeFormats.bold} />
                            <ToolbarIcon icon={Italic} label="Italic" onClick={() => handleFormat('italic')} isActive={activeFormats.italic} />
                            <ToolbarIcon icon={Underline} label="Underline" onClick={() => handleFormat('underline')} isActive={activeFormats.underline} />
                            <ToolbarIcon icon={Strikethrough} label="Strikethrough" onClick={() => handleFormat('strikeThrough')} isActive={activeFormats.strikeThrough} />
                        </div>

                        {/* Group 3: Layout */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            <Popover open={isTablePopoverOpen} onOpenChange={setIsTablePopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}><Table className="h-4 w-4" /></Button>
                                        </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Insert Table</p></TooltipContent>
                                </Tooltip>
                                <PopoverContent className="w-auto p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="grid gap-1">
                                        <div className="flex justify-center text-sm font-medium mb-1">{tableSelection.rows > 0 ? `${tableSelection.cols} x ${tableSelection.rows}` : "Insert Table"}</div>
                                        <div className="grid grid-cols-10 gap-1 p-1" onMouseLeave={() => setTableSelection({ rows: 0, cols: 0 })}>
                                            {Array.from({ length: 100 }).map((_, i) => {
                                                const row = Math.floor(i / 10) + 1;
                                                const col = (i % 10) + 1;
                                                const isSelected = row <= tableSelection.rows && col <= tableSelection.cols;
                                                return (<div key={i} className={`w-4 h-4 border rounded-sm cursor-pointer transition-colors ${isSelected ? 'bg-blue-200 border-blue-400' : 'bg-white border-slate-200 hover:border-blue-300'}`} onMouseEnter={() => setTableSelection({ rows: row, cols: col })} onClick={() => handleInsertTable(row, col)} />);
                                            })}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <DropdownMenu open={isTableMenuOpen} onOpenChange={setIsTableMenuOpen}>
                                <DropdownMenuTrigger asChild onClick={saveSelection}>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onMouseDown={(e) => e.preventDefault()}><MoreVertical className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addRowAbove'); }}><ArrowUp className="mr-2 h-4 w-4" /> Row Above</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addRowBelow'); }}><ArrowDown className="mr-2 h-4 w-4" /> Row Below</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addColLeft'); }}><ArrowLeft className="mr-2 h-4 w-4" /> Column Left</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('addColRight'); }}><ArrowRight className="mr-2 h-4 w-4" /> Column Right</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteRow'); }}><Trash className="mr-2 h-4 w-4" /> Delete Row</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteCol'); }}><Trash className="mr-2 h-4 w-4" /> Delete Column</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTableAction('deleteTable'); }} className="text-red-600"><Trash className="mr-2 h-4 w-4" /> Delete Table</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu open={isTextDirectionOpen} onOpenChange={setIsTextDirectionOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="sm" className={`h-7 gap-0.5 px-1 ${isTextDirectionOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                <TextDirectionIcon className="h-4 w-4" /><ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Text Direction</p></TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyRight'); }}><span>Left to Right</span></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyLeft'); }}><span>Right to Left</span></DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <DropdownMenu open={isAlignMenuOpen} onOpenChange={setIsAlignMenuOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <DropdownMenuTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="sm" className={`h-7 gap-0.5 px-1 ${isAlignMenuOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                <AlignLeft className="h-4 w-4" /><ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Alignment</p></TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyLeft'); }}><div className="flex items-center w-full justify-between"><div className="flex items-center"><AlignLeft className="mr-2 h-4 w-4" /> Left</div>{activeFormats.justifyLeft && <Check className="h-3 w-3 ml-2" />}</div></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyCenter'); }}><div className="flex items-center w-full justify-between"><div className="flex items-center"><AlignCenter className="mr-2 h-4 w-4" /> Center</div>{activeFormats.justifyCenter && <Check className="h-3 w-3 ml-2" />}</div></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyRight'); }}><div className="flex items-center w-full justify-between"><div className="flex items-center"><AlignRight className="mr-2 h-4 w-4" /> Right</div>{activeFormats.justifyRight && <Check className="h-3 w-3 ml-2" />}</div></DropdownMenuItem>
                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('justifyFull'); }}><div className="flex items-center w-full justify-between"><div className="flex items-center"><AlignJustify className="mr-2 h-4 w-4" /> Justify</div>{activeFormats.justifyFull && <Check className="h-3 w-3 ml-2" />}</div></DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Group 4: Text Style */}
                        <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                            <Popover open={isColorPopoverOpen} onOpenChange={setIsColorPopoverOpen}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <PopoverTrigger asChild onClick={saveSelection}>
                                            <Button variant="ghost" size="icon" className={`h-7 w-7 ${isColorPopoverOpen ? "bg-black text-white hover:bg-black/90" : ""}`} onMouseDown={(e) => e.preventDefault()}>
                                                <Palette className="h-4 w-4 text-indigo-500 fill-indigo-500/20" />
                                            </Button>
                                        </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Text Color</p></TooltipContent>
                                </Tooltip>
                                <PopoverContent className="w-64 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="space-y-3">
                                        <div className="flex border rounded overflow-hidden">
                                            <button className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'text' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} onClick={() => setColorTab('text')}>Color</button>
                                            <button className={`flex-1 py-1 text-sm font-medium transition-colors ${colorTab === 'highlight' ? 'bg-white text-black shadow-sm' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`} onClick={() => setColorTab('highlight')}>Background</button>
                                        </div>
                                        <div className="grid grid-cols-10 gap-1">{["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff", "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff", "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc", "#dd7e6b", "#ea9999", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#a4c2f4", "#9fc5e8", "#b4a7d6", "#d5a6bd", "#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0", "#a61c00", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6", "#674ea7", "#a64d79", "#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47", "#5b0f00", "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130"].map((color, i) => (
                                            <button key={i} className="w-4 h-4 rounded-[1px] border border-transparent hover:border-black/50 transition-colors" style={{ backgroundColor: color }} onMouseDown={(e) => { e.preventDefault(); handleColorFormat(color, colorTab); }} title={color} />
                                        ))}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-medium">Set color</label>
                                            <div className="flex gap-2">
                                                <div className="relative flex-1"><input type="text" className="w-full h-8 pl-2 pr-2 border rounded text-xs focus:ring-1 focus:ring-black focus:border-black outline-none" placeholder="#000000" value={customColor} onChange={(e) => setCustomColor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleColorFormat(customColor, colorTab); } }} /></div>
                                                <Button size="icon" variant="outline" className="h-8 w-8" onMouseDown={(e) => e.preventDefault()} onClick={() => handleColorFormat(customColor, colorTab)}><ArrowRight className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                        <button className="w-full text-left text-xs text-muted-foreground hover:text-black py-1" onMouseDown={(e) => { e.preventDefault(); handleColorFormat(null, colorTab); }}>Remove color</button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1 mx-1 border border-slate-200 rounded-md bg-white p-0.5 h-7">
                                        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[2px] hover:bg-slate-100" onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(false); }}><Minus className="h-3 w-3" /></Button>
                                        <div className="w-8 flex justify-center text-xs font-medium select-none text-slate-700">{fontSize}</div>
                                        <Button variant="ghost" size="icon" className="h-5 w-5 rounded-[2px] hover:bg-slate-100" onMouseDown={(e) => { e.preventDefault(); handleFontSizeChange(true); }}><Plus className="h-3 w-3" /></Button>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Font Size</p></TooltipContent>
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
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()}><Keyboard className="h-4 w-4" /></Button>
                                        </PopoverTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none"><p>Keyboard Shortcuts</p></TooltipContent>
                                </Tooltip>
                                <PopoverContent className="w-80 p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                    <div className="p-4 h-[300px] overflow-y-auto">
                                        <h4 className="font-medium mb-4 leading-none">Keyboard shortcuts</h4>
                                        <div className="space-y-4 text-sm">
                                            <div className="grid grid-cols-[1fr,auto] gap-x-4 gap-y-2 items-center">
                                                <span className="text-muted-foreground">Undo</span> <span>Ctrl+Z</span>
                                                <span className="text-muted-foreground">Redo</span> <span>Ctrl+Shift+Z</span>
                                                <span className="text-muted-foreground">Bold</span> <span>Ctrl+B</span>
                                                <span className="text-muted-foreground">Italic</span> <span>Ctrl+I</span>
                                                <span className="text-muted-foreground">Underline</span> <span>Ctrl+U</span>
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
                className="min-h-[100px] w-full px-3 py-2 text-sm border-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap cursor-text overflow-auto empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-blue-600 [&_a]:underline"
                data-placeholder={placeholder}
                onInput={updateContent}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setIsEditorFocused(false);
                    }
                }}
                onFocus={() => setIsEditorFocused(true)}
                onKeyUp={checkFormats}
                onMouseUp={() => { checkFormats(); handleEditorMouseUp(); }}
                onMouseMove={handleEditorMouseMove}
                onMouseDown={handleEditorMouseDown}
                style={{ height: 'auto', minHeight: '100px' }}
            />
        </div>
    );
}
