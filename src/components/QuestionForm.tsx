import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Search } from "lucide-react";

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

    // Formula Popover State
    const [isFormulaPopoverOpen, setIsFormulaPopoverOpen] = useState(false);
    const [formulaLatex, setFormulaLatex] = useState("");

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

    // Quick insert templates
    const quickInsertTemplates = [
        { label: "Fraction", latex: "\\frac{a}{b}" },
        { label: "Exponent", latex: "x^{n}" },
        { label: "Subscript", latex: "x_{i}" },
        { label: "Square Root", latex: "\\sqrt{x}" },
        { label: "Greek Pi", latex: "\\pi" },
        { label: "Infinity", latex: "\\infty" },
        { label: "Sum", latex: "\\sum_{i=1}^{n}" },
        { label: "Integral", latex: "\\int_{a}^{b}" }
    ];

    // Formula Library State
    const [isFormulaLibraryOpen, setIsFormulaLibraryOpen] = useState(false);
    const [formulaLibrarySearch, setFormulaLibrarySearch] = useState("");
    const [formulaLibraryTab, setFormulaLibraryTab] = useState("basic");

    // Formula Library Data
    const formulaLibrary = {
        basic: {
            title: "Basic Syntax",
            formulas: [
                { name: "Fraction", latex: "\\frac{a}{b}" },
                { name: "Mixed Fraction", latex: "a\\frac{b}{c}" },
                { name: "Exponent (Superscript)", latex: "x^2" },
                { name: "Complex Exponent", latex: "x^{10}" },
                { name: "Negative Exponent", latex: "x^{-1}" },
                { name: "Subscript", latex: "x_1" },
                { name: "Complex Subscript", latex: "x_{10}" },
                { name: "Both Super & Sub", latex: "x_i^2" },
                { name: "Square Root", latex: "\\sqrt{x}" },
                { name: "Cube Root", latex: "\\sqrt[3]{x}" },
                { name: "Nth Root", latex: "\\sqrt[n]{x}" },
                { name: "Parentheses", latex: "\\left( \\frac{a}{b} \\right)" },
                { name: "Brackets", latex: "\\left[ x \\right]" },
                { name: "Curly Braces", latex: "\\left\\{ x \\right\\}" },
                { name: "Angle Brackets", latex: "\\langle x \\rangle" },
                { name: "Absolute Value", latex: "\\left| x \\right|" },
                { name: "Norm", latex: "\\left\\| x \\right\\|" },
                { name: "Floor Function", latex: "\\lfloor x \\rfloor" },
                { name: "Ceiling Function", latex: "\\lceil x \\rceil" },
                { name: "Overline", latex: "\\overline{AB}" },
                { name: "Underline", latex: "\\underline{AB}" },
                { name: "Vector", latex: "\\vec{v}" },
                { name: "Bold Vector", latex: "\\mathbf{v}" },
                { name: "Hat", latex: "\\hat{i}" },
                { name: "Tilde", latex: "\\tilde{x}" },
                { name: "Bar", latex: "\\bar{x}" },
                { name: "Dot", latex: "\\dot{x}" },
                { name: "Double Dot", latex: "\\ddot{x}" },
                { name: "Text in Formula", latex: "x \\text{ and } y" },
                { name: "Bold Text", latex: "\\textbf{bold}" },
                { name: "Italic", latex: "\\textit{italic}" },
                { name: "Space", latex: "a \\quad b" },
                { name: "Small Space", latex: "a \\, b" },
                { name: "Prime", latex: "f'(x)" },
                { name: "Double Prime", latex: "f''(x)" },
                { name: "Degree Symbol", latex: "90^\\circ" },
                { name: "Percentage", latex: "50\\%" },
                { name: "Factorial", latex: "n!" },
                { name: "Binomial Coefficient", latex: "\\binom{n}{k}" }
            ]
        },
        symbols: {
            title: "Symbols",
            sections: [
                {
                    name: "Greek Letters (Lowercase)",
                    formulas: [
                        { name: "Alpha", latex: "\\alpha" },
                        { name: "Beta", latex: "\\beta" },
                        { name: "Gamma", latex: "\\gamma" },
                        { name: "Delta", latex: "\\delta" },
                        { name: "Epsilon", latex: "\\epsilon" },
                        { name: "Varepsilon", latex: "\\varepsilon" },
                        { name: "Zeta", latex: "\\zeta" },
                        { name: "Eta", latex: "\\eta" },
                        { name: "Theta", latex: "\\theta" },
                        { name: "Vartheta", latex: "\\vartheta" },
                        { name: "Iota", latex: "\\iota" },
                        { name: "Kappa", latex: "\\kappa" },
                        { name: "Lambda", latex: "\\lambda" },
                        { name: "Mu", latex: "\\mu" },
                        { name: "Nu", latex: "\\nu" },
                        { name: "Xi", latex: "\\xi" },
                        { name: "Pi", latex: "\\pi" },
                        { name: "Rho", latex: "\\rho" },
                        { name: "Sigma", latex: "\\sigma" },
                        { name: "Tau", latex: "\\tau" },
                        { name: "Upsilon", latex: "\\upsilon" },
                        { name: "Phi", latex: "\\phi" },
                        { name: "Varphi", latex: "\\varphi" },
                        { name: "Chi", latex: "\\chi" },
                        { name: "Psi", latex: "\\psi" },
                        { name: "Omega", latex: "\\omega" }
                    ]
                },
                {
                    name: "Greek Letters (Uppercase)",
                    formulas: [
                        { name: "Gamma", latex: "\\Gamma" },
                        { name: "Delta", latex: "\\Delta" },
                        { name: "Theta", latex: "\\Theta" },
                        { name: "Lambda", latex: "\\Lambda" },
                        { name: "Xi", latex: "\\Xi" },
                        { name: "Pi", latex: "\\Pi" },
                        { name: "Sigma", latex: "\\Sigma" },
                        { name: "Upsilon", latex: "\\Upsilon" },
                        { name: "Phi", latex: "\\Phi" },
                        { name: "Psi", latex: "\\Psi" },
                        { name: "Omega", latex: "\\Omega" }
                    ]
                },
                {
                    name: "Operators & Relations",
                    formulas: [
                        { name: "Plus", latex: "+" },
                        { name: "Minus", latex: "-" },
                        { name: "Plus/Minus", latex: "\\pm" },
                        { name: "Minus/Plus", latex: "\\mp" },
                        { name: "Times", latex: "\\times" },
                        { name: "Division", latex: "\\div" },
                        { name: "Dot Product", latex: "\\cdot" },
                        { name: "Asterisk", latex: "\\ast" },
                        { name: "Star", latex: "\\star" },
                        { name: "Circle", latex: "\\circ" },
                        { name: "Bullet", latex: "\\bullet" },
                        { name: "Equals", latex: "=" },
                        { name: "Not Equal", latex: "\\neq" },
                        { name: "Approximately", latex: "\\approx" },
                        { name: "Almost Equal", latex: "\\simeq" },
                        { name: "Congruent", latex: "\\cong" },
                        { name: "Equivalent", latex: "\\equiv" },
                        { name: "Proportional", latex: "\\propto" },
                        { name: "Similar", latex: "\\sim" },
                        { name: "Less Than", latex: "<" },
                        { name: "Greater Than", latex: ">" },
                        { name: "Less or Equal", latex: "\\leq" },
                        { name: "Greater or Equal", latex: "\\geq" },
                        { name: "Much Less", latex: "\\ll" },
                        { name: "Much Greater", latex: "\\gg" },
                        { name: "Not Less", latex: "\\nless" },
                        { name: "Not Greater", latex: "\\ngtr" },
                        { name: "Parallel", latex: "\\parallel" },
                        { name: "Perpendicular", latex: "\\perp" }
                    ]
                },
                {
                    name: "Set Notation",
                    formulas: [
                        { name: "Element Of", latex: "\\in" },
                        { name: "Not Element Of", latex: "\\notin" },
                        { name: "Contains", latex: "\\ni" },
                        { name: "Subset", latex: "\\subset" },
                        { name: "Superset", latex: "\\supset" },
                        { name: "Subset or Equal", latex: "\\subseteq" },
                        { name: "Superset or Equal", latex: "\\supseteq" },
                        { name: "Not Subset", latex: "\\not\\subset" },
                        { name: "Union", latex: "\\cup" },
                        { name: "Intersection", latex: "\\cap" },
                        { name: "Set Minus", latex: "\\setminus" },
                        { name: "Empty Set", latex: "\\emptyset" },
                        { name: "Natural Numbers", latex: "\\mathbb{N}" },
                        { name: "Integers", latex: "\\mathbb{Z}" },
                        { name: "Rationals", latex: "\\mathbb{Q}" },
                        { name: "Reals", latex: "\\mathbb{R}" },
                        { name: "Complex", latex: "\\mathbb{C}" },
                        { name: "For All", latex: "\\forall" },
                        { name: "Exists", latex: "\\exists" },
                        { name: "Not Exists", latex: "\\nexists" }
                    ]
                },
                {
                    name: "Logic Symbols",
                    formulas: [
                        { name: "And (Conjunction)", latex: "\\land" },
                        { name: "Or (Disjunction)", latex: "\\lor" },
                        { name: "Not (Negation)", latex: "\\neg" },
                        { name: "Implies", latex: "\\Rightarrow" },
                        { name: "Implied By", latex: "\\Leftarrow" },
                        { name: "If and Only If", latex: "\\Leftrightarrow" },
                        { name: "Therefore", latex: "\\therefore" },
                        { name: "Because", latex: "\\because" },
                        { name: "True", latex: "\\top" },
                        { name: "False", latex: "\\bot" }
                    ]
                },
                {
                    name: "Arrows",
                    formulas: [
                        { name: "Right Arrow", latex: "\\rightarrow" },
                        { name: "Left Arrow", latex: "\\leftarrow" },
                        { name: "Double Arrow", latex: "\\leftrightarrow" },
                        { name: "Long Right Arrow", latex: "\\longrightarrow" },
                        { name: "Long Left Arrow", latex: "\\longleftarrow" },
                        { name: "Maps To", latex: "\\mapsto" },
                        { name: "Implies", latex: "\\Rightarrow" },
                        { name: "Implied By", latex: "\\Leftarrow" },
                        { name: "If and Only If", latex: "\\Leftrightarrow" },
                        { name: "Up Arrow", latex: "\\uparrow" },
                        { name: "Down Arrow", latex: "\\downarrow" },
                        { name: "Up-Down Arrow", latex: "\\updownarrow" },
                        { name: "Northeast Arrow", latex: "\\nearrow" },
                        { name: "Southeast Arrow", latex: "\\searrow" },
                        { name: "Northwest Arrow", latex: "\\nwarrow" },
                        { name: "Southwest Arrow", latex: "\\swarrow" },
                        { name: "Hook Right", latex: "\\hookrightarrow" },
                        { name: "Hook Left", latex: "\\hookleftarrow" }
                    ]
                },
                {
                    name: "Miscellaneous",
                    formulas: [
                        { name: "Infinity", latex: "\\infty" },
                        { name: "Partial", latex: "\\partial" },
                        { name: "Nabla", latex: "\\nabla" },
                        { name: "Aleph", latex: "\\aleph" },
                        { name: "Hbar", latex: "\\hbar" },
                        { name: "Ellipsis", latex: "\\ldots" },
                        { name: "Centered Dots", latex: "\\cdots" },
                        { name: "Vertical Dots", latex: "\\vdots" },
                        { name: "Diagonal Dots", latex: "\\ddots" },
                        { name: "Triangle", latex: "\\triangle" },
                        { name: "Square", latex: "\\square" },
                        { name: "Diamond", latex: "\\diamond" },
                        { name: "Check Mark", latex: "\\checkmark" },
                        { name: "Cross", latex: "\\times" },
                        { name: "Angle", latex: "\\angle" },
                        { name: "Measured Angle", latex: "\\measuredangle" }
                    ]
                }
            ]
        },
        common: {
            title: "Common Formulas",
            sections: [
                {
                    name: "Algebra",
                    formulas: [
                        { name: "Quadratic Formula", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" },
                        { name: "Binomial Square", latex: "(a+b)^2 = a^2 + 2ab + b^2" },
                        { name: "Binomial Square Negative", latex: "(a-b)^2 = a^2 - 2ab + b^2" },
                        { name: "Difference of Squares", latex: "a^2 - b^2 = (a+b)(a-b)" },
                        { name: "Binomial Cube", latex: "(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3" },
                        { name: "Binomial Cube Negative", latex: "(a-b)^3 = a^3 - 3a^2b + 3ab^2 - b^3" },
                        { name: "Sum of Cubes", latex: "a^3 + b^3 = (a+b)(a^2 - ab + b^2)" },
                        { name: "Difference of Cubes", latex: "a^3 - b^3 = (a-b)(a^2 + ab + b^2)" },
                        { name: "Binomial Theorem", latex: "(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k}b^k" },
                        { name: "Arithmetic Sequence", latex: "a_n = a_1 + (n-1)d" },
                        { name: "Geometric Sequence", latex: "a_n = a_1 \\cdot r^{n-1}" },
                        { name: "Arithmetic Sum", latex: "S_n = \\frac{n(a_1 + a_n)}{2}" },
                        { name: "Geometric Sum", latex: "S_n = a_1 \\cdot \\frac{1-r^n}{1-r}" },
                        { name: "Infinite Geometric Sum", latex: "S = \\frac{a_1}{1-r}, |r| < 1" },
                        { name: "Logarithm Product", latex: "\\log(ab) = \\log a + \\log b" },
                        { name: "Logarithm Quotient", latex: "\\log\\frac{a}{b} = \\log a - \\log b" },
                        { name: "Logarithm Power", latex: "\\log a^n = n \\log a" },
                        { name: "Change of Base", latex: "\\log_b a = \\frac{\\ln a}{\\ln b}" },
                        { name: "Exponential", latex: "e^x" },
                        { name: "Natural Log", latex: "\\ln x" },
                        { name: "Logarithm Definition", latex: "\\log_b x = y \\Leftrightarrow b^y = x" },
                        { name: "Common Log", latex: "\\log_{10} x" },
                        { name: "Exponent Rules", latex: "a^m \\cdot a^n = a^{m+n}" },
                        { name: "Exponent Division", latex: "\\frac{a^m}{a^n} = a^{m-n}" },
                        { name: "Power of Power", latex: "(a^m)^n = a^{mn}" },
                        { name: "Complex Number", latex: "z = a + bi" },
                        { name: "Complex Modulus", latex: "|z| = \\sqrt{a^2 + b^2}" },
                        { name: "Euler's Formula", latex: "e^{i\\theta} = \\cos\\theta + i\\sin\\theta" }
                    ]
                },
                {
                    name: "Geometry",
                    formulas: [
                        { name: "Pythagorean Theorem", latex: "a^2 + b^2 = c^2" },
                        { name: "Area of Circle", latex: "A = \\pi r^2" },
                        { name: "Circumference", latex: "C = 2\\pi r" },
                        { name: "Diameter", latex: "d = 2r" },
                        { name: "Arc Length", latex: "s = r\\theta" },
                        { name: "Sector Area", latex: "A = \\frac{1}{2}r^2\\theta" },
                        { name: "Area of Triangle", latex: "A = \\frac{1}{2}bh" },
                        { name: "Heron's Formula", latex: "A = \\sqrt{s(s-a)(s-b)(s-c)}" },
                        { name: "Area of Rectangle", latex: "A = lw" },
                        { name: "Area of Square", latex: "A = s^2" },
                        { name: "Area of Parallelogram", latex: "A = bh" },
                        { name: "Area of Trapezoid", latex: "A = \\frac{1}{2}(b_1 + b_2)h" },
                        { name: "Area of Rhombus", latex: "A = \\frac{1}{2}d_1 d_2" },
                        { name: "Area of Ellipse", latex: "A = \\pi ab" },
                        { name: "Perimeter of Rectangle", latex: "P = 2(l + w)" },
                        { name: "Volume of Sphere", latex: "V = \\frac{4}{3}\\pi r^3" },
                        { name: "Surface Area of Sphere", latex: "A = 4\\pi r^2" },
                        { name: "Volume of Cylinder", latex: "V = \\pi r^2 h" },
                        { name: "Surface Area of Cylinder", latex: "A = 2\\pi r(r + h)" },
                        { name: "Volume of Cone", latex: "V = \\frac{1}{3}\\pi r^2 h" },
                        { name: "Volume of Cube", latex: "V = s^3" },
                        { name: "Volume of Rectangular Prism", latex: "V = lwh" },
                        { name: "Volume of Pyramid", latex: "V = \\frac{1}{3}Bh" },
                        { name: "Distance Formula (2D)", latex: "d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}" },
                        { name: "Distance Formula (3D)", latex: "d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2 + (z_2-z_1)^2}" },
                        { name: "Midpoint Formula", latex: "M = \\left(\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2}\\right)" },
                        { name: "Slope Formula", latex: "m = \\frac{y_2 - y_1}{x_2 - x_1}" },
                        { name: "Slope-Intercept Form", latex: "y = mx + b" },
                        { name: "Point-Slope Form", latex: "y - y_1 = m(x - x_1)" },
                        { name: "Standard Form", latex: "Ax + By = C" },
                        { name: "Circle Equation", latex: "(x-h)^2 + (y-k)^2 = r^2" },
                        { name: "Ellipse Equation", latex: "\\frac{(x-h)^2}{a^2} + \\frac{(y-k)^2}{b^2} = 1" },
                        { name: "Parabola Equation", latex: "y = a(x-h)^2 + k" },
                        { name: "Hyperbola Equation", latex: "\\frac{(x-h)^2}{a^2} - \\frac{(y-k)^2}{b^2} = 1" }
                    ]
                },
                {
                    name: "Trigonometry",
                    formulas: [
                        { name: "Sine", latex: "\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}}" },
                        { name: "Cosine", latex: "\\cos\\theta = \\frac{\\text{adjacent}}{\\text{hypotenuse}}" },
                        { name: "Tangent", latex: "\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta}" },
                        { name: "Cosecant", latex: "\\csc\\theta = \\frac{1}{\\sin\\theta}" },
                        { name: "Secant", latex: "\\sec\\theta = \\frac{1}{\\cos\\theta}" },
                        { name: "Cotangent", latex: "\\cot\\theta = \\frac{1}{\\tan\\theta}" },
                        { name: "Pythagorean Identity", latex: "\\sin^2\\theta + \\cos^2\\theta = 1" },
                        { name: "Pythagorean Identity 2", latex: "1 + \\tan^2\\theta = \\sec^2\\theta" },
                        { name: "Pythagorean Identity 3", latex: "1 + \\cot^2\\theta = \\csc^2\\theta" },
                        { name: "Sine Double Angle", latex: "\\sin 2\\theta = 2\\sin\\theta\\cos\\theta" },
                        { name: "Cosine Double Angle", latex: "\\cos 2\\theta = \\cos^2\\theta - \\sin^2\\theta" },
                        { name: "Cosine Double Angle 2", latex: "\\cos 2\\theta = 2\\cos^2\\theta - 1" },
                        { name: "Cosine Double Angle 3", latex: "\\cos 2\\theta = 1 - 2\\sin^2\\theta" },
                        { name: "Tan Double Angle", latex: "\\tan 2\\theta = \\frac{2\\tan\\theta}{1-\\tan^2\\theta}" },
                        { name: "Sine Half Angle", latex: "\\sin\\frac{\\theta}{2} = \\pm\\sqrt{\\frac{1-\\cos\\theta}{2}}" },
                        { name: "Cosine Half Angle", latex: "\\cos\\frac{\\theta}{2} = \\pm\\sqrt{\\frac{1+\\cos\\theta}{2}}" },
                        { name: "Sum of Angles Sin", latex: "\\sin(A+B) = \\sin A\\cos B + \\cos A\\sin B" },
                        { name: "Sum of Angles Cos", latex: "\\cos(A+B) = \\cos A\\cos B - \\sin A\\sin B" },
                        { name: "Law of Sines", latex: "\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}" },
                        { name: "Law of Cosines", latex: "c^2 = a^2 + b^2 - 2ab\\cos C" },
                        { name: "Law of Tangents", latex: "\\frac{a-b}{a+b} = \\frac{\\tan\\frac{A-B}{2}}{\\tan\\frac{A+B}{2}}" },
                        { name: "Area with Sine", latex: "A = \\frac{1}{2}ab\\sin C" },
                        { name: "Inverse Sine", latex: "\\sin^{-1}x = \\arcsin x" },
                        { name: "Inverse Cosine", latex: "\\cos^{-1}x = \\arccos x" },
                        { name: "Inverse Tangent", latex: "\\tan^{-1}x = \\arctan x" },
                        { name: "Radians to Degrees", latex: "\\theta_{deg} = \\theta_{rad} \\cdot \\frac{180}{\\pi}" },
                        { name: "Degrees to Radians", latex: "\\theta_{rad} = \\theta_{deg} \\cdot \\frac{\\pi}{180}" }
                    ]
                },
                {
                    name: "Statistics & Probability",
                    formulas: [
                        { name: "Mean", latex: "\\bar{x} = \\frac{\\sum x_i}{n}" },
                        { name: "Weighted Mean", latex: "\\bar{x} = \\frac{\\sum w_i x_i}{\\sum w_i}" },
                        { name: "Median", latex: "\\text{Med} = x_{(n+1)/2}" },
                        { name: "Mode", latex: "\\text{Mode} = \\text{most frequent value}" },
                        { name: "Range", latex: "R = x_{max} - x_{min}" },
                        { name: "Variance (Population)", latex: "\\sigma^2 = \\frac{\\sum(x_i - \\mu)^2}{N}" },
                        { name: "Variance (Sample)", latex: "s^2 = \\frac{\\sum(x_i - \\bar{x})^2}{n-1}" },
                        { name: "Standard Deviation", latex: "\\sigma = \\sqrt{\\frac{\\sum(x_i - \\mu)^2}{N}}" },
                        { name: "Z-Score", latex: "z = \\frac{x - \\mu}{\\sigma}" },
                        { name: "Covariance", latex: "\\text{Cov}(X,Y) = \\frac{\\sum(x_i-\\bar{x})(y_i-\\bar{y})}{n-1}" },
                        { name: "Correlation", latex: "r = \\frac{\\text{Cov}(X,Y)}{\\sigma_X \\sigma_Y}" },
                        { name: "Combination", latex: "\\binom{n}{r} = \\frac{n!}{r!(n-r)!}" },
                        { name: "Permutation", latex: "P(n,r) = \\frac{n!}{(n-r)!}" },
                        { name: "Factorial", latex: "n! = n \\cdot (n-1) \\cdot (n-2) \\cdots 2 \\cdot 1" },
                        { name: "Probability", latex: "P(A) = \\frac{n(A)}{n(S)}" },
                        { name: "Complement", latex: "P(A') = 1 - P(A)" },
                        { name: "Union", latex: "P(A \\cup B) = P(A) + P(B) - P(A \\cap B)" },
                        { name: "Conditional Probability", latex: "P(A|B) = \\frac{P(A \\cap B)}{P(B)}" },
                        { name: "Bayes' Theorem", latex: "P(A|B) = \\frac{P(B|A)P(A)}{P(B)}" },
                        { name: "Expected Value", latex: "E(X) = \\sum x_i P(x_i)" },
                        { name: "Binomial Distribution", latex: "P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}" },
                        { name: "Normal Distribution", latex: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}" },
                        { name: "Poisson Distribution", latex: "P(X=k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}" }
                    ]
                },
                {
                    name: "Calculus Basics",
                    formulas: [
                        { name: "Limit Definition", latex: "\\lim_{x \\to a} f(x) = L" },
                        { name: "Derivative Definition", latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}" },
                        { name: "Power Rule", latex: "\\frac{d}{dx}x^n = nx^{n-1}" },
                        { name: "Constant Rule", latex: "\\frac{d}{dx}c = 0" },
                        { name: "Sum Rule", latex: "\\frac{d}{dx}[f+g] = f' + g'" },
                        { name: "Product Rule", latex: "\\frac{d}{dx}[fg] = f'g + fg'" },
                        { name: "Quotient Rule", latex: "\\frac{d}{dx}\\left[\\frac{f}{g}\\right] = \\frac{f'g - fg'}{g^2}" },
                        { name: "Chain Rule", latex: "\\frac{d}{dx}f(g(x)) = f'(g(x)) \\cdot g'(x)" },
                        { name: "Derivative of sin", latex: "\\frac{d}{dx}\\sin x = \\cos x" },
                        { name: "Derivative of cos", latex: "\\frac{d}{dx}\\cos x = -\\sin x" },
                        { name: "Derivative of tan", latex: "\\frac{d}{dx}\\tan x = \\sec^2 x" },
                        { name: "Derivative of e^x", latex: "\\frac{d}{dx}e^x = e^x" },
                        { name: "Derivative of ln", latex: "\\frac{d}{dx}\\ln x = \\frac{1}{x}" },
                        { name: "Integral Power Rule", latex: "\\int x^n dx = \\frac{x^{n+1}}{n+1} + C" },
                        { name: "Integral of sin", latex: "\\int \\sin x \\, dx = -\\cos x + C" },
                        { name: "Integral of cos", latex: "\\int \\cos x \\, dx = \\sin x + C" },
                        { name: "Integral of e^x", latex: "\\int e^x dx = e^x + C" },
                        { name: "Integral of 1/x", latex: "\\int \\frac{1}{x} dx = \\ln|x| + C" },
                        { name: "Definite Integral", latex: "\\int_a^b f(x) dx = F(b) - F(a)" },
                        { name: "Area Under Curve", latex: "A = \\int_a^b f(x) dx" }
                    ]
                }
            ]
        },
        physics: {
            title: "Physics",
            sections: [
                {
                    name: "Mechanics",
                    formulas: [
                        { name: "Velocity", latex: "v = \\frac{\\Delta x}{\\Delta t}" },
                        { name: "Average Velocity", latex: "\\bar{v} = \\frac{x_f - x_i}{t_f - t_i}" },
                        { name: "Acceleration", latex: "a = \\frac{\\Delta v}{\\Delta t}" },
                        { name: "Kinematic Eq 1", latex: "v = u + at" },
                        { name: "Kinematic Eq 2", latex: "s = ut + \\frac{1}{2}at^2" },
                        { name: "Kinematic Eq 3", latex: "v^2 = u^2 + 2as" },
                        { name: "Kinematic Eq 4", latex: "s = \\frac{(u+v)}{2}t" },
                        { name: "Newton's 1st Law", latex: "\\sum \\vec{F} = 0 \\Rightarrow \\vec{v} = \\text{const}" },
                        { name: "Newton's 2nd Law", latex: "\\vec{F} = m\\vec{a}" },
                        { name: "Newton's 3rd Law", latex: "\\vec{F}_{12} = -\\vec{F}_{21}" },
                        { name: "Weight", latex: "W = mg" },
                        { name: "Momentum", latex: "\\vec{p} = m\\vec{v}" },
                        { name: "Impulse", latex: "\\vec{J} = \\vec{F}\\Delta t = \\Delta\\vec{p}" },
                        { name: "Conservation of Momentum", latex: "m_1v_1 + m_2v_2 = m_1v_1' + m_2v_2'" },
                        { name: "Kinetic Energy", latex: "KE = \\frac{1}{2}mv^2" },
                        { name: "Potential Energy (Gravity)", latex: "PE = mgh" },
                        { name: "Elastic PE", latex: "PE = \\frac{1}{2}kx^2" },
                        { name: "Work", latex: "W = \\vec{F} \\cdot \\vec{d} = Fd\\cos\\theta" },
                        { name: "Work-Energy Theorem", latex: "W_{net} = \\Delta KE" },
                        { name: "Power", latex: "P = \\frac{W}{t} = \\vec{F} \\cdot \\vec{v}" },
                        { name: "Static Friction", latex: "f_s \\leq \\mu_s N" },
                        { name: "Kinetic Friction", latex: "f_k = \\mu_k N" },
                        { name: "Centripetal Acceleration", latex: "a_c = \\frac{v^2}{r} = \\omega^2 r" },
                        { name: "Centripetal Force", latex: "F_c = \\frac{mv^2}{r}" },
                        { name: "Universal Gravitation", latex: "F = G\\frac{m_1 m_2}{r^2}" },
                        { name: "Gravitational Field", latex: "g = \\frac{GM}{r^2}" },
                        { name: "Orbital Velocity", latex: "v = \\sqrt{\\frac{GM}{r}}" },
                        { name: "Escape Velocity", latex: "v_e = \\sqrt{\\frac{2GM}{r}}" },
                        { name: "Kepler's 3rd Law", latex: "T^2 = \\frac{4\\pi^2}{GM}r^3" }
                    ]
                },
                {
                    name: "Rotational Mechanics",
                    formulas: [
                        { name: "Angular Velocity", latex: "\\omega = \\frac{\\Delta\\theta}{\\Delta t}" },
                        { name: "Angular Acceleration", latex: "\\alpha = \\frac{\\Delta\\omega}{\\Delta t}" },
                        { name: "Linear-Angular Relation", latex: "v = r\\omega" },
                        { name: "Tangential Acceleration", latex: "a_t = r\\alpha" },
                        { name: "Rotational Kinematic 1", latex: "\\omega = \\omega_0 + \\alpha t" },
                        { name: "Rotational Kinematic 2", latex: "\\theta = \\omega_0 t + \\frac{1}{2}\\alpha t^2" },
                        { name: "Rotational Kinematic 3", latex: "\\omega^2 = \\omega_0^2 + 2\\alpha\\theta" },
                        { name: "Torque", latex: "\\tau = r F \\sin\\theta = r \\times F" },
                        { name: "Newton's 2nd for Rotation", latex: "\\tau = I\\alpha" },
                        { name: "Moment of Inertia", latex: "I = \\sum m_i r_i^2" },
                        { name: "I (Solid Cylinder)", latex: "I = \\frac{1}{2}MR^2" },
                        { name: "I (Solid Sphere)", latex: "I = \\frac{2}{5}MR^2" },
                        { name: "I (Hollow Sphere)", latex: "I = \\frac{2}{3}MR^2" },
                        { name: "I (Rod, Center)", latex: "I = \\frac{1}{12}ML^2" },
                        { name: "I (Rod, End)", latex: "I = \\frac{1}{3}ML^2" },
                        { name: "Parallel Axis Theorem", latex: "I = I_{cm} + Md^2" },
                        { name: "Rotational KE", latex: "KE_{rot} = \\frac{1}{2}I\\omega^2" },
                        { name: "Angular Momentum", latex: "L = I\\omega" },
                        { name: "Conservation of L", latex: "I_1\\omega_1 = I_2\\omega_2" },
                        { name: "Rolling without Slipping", latex: "v_{cm} = R\\omega" }
                    ]
                },
                {
                    name: "Oscillations & Waves",
                    formulas: [
                        { name: "SHM Displacement", latex: "x = A\\cos(\\omega t + \\phi)" },
                        { name: "SHM Velocity", latex: "v = -A\\omega\\sin(\\omega t + \\phi)" },
                        { name: "SHM Acceleration", latex: "a = -\\omega^2 x" },
                        { name: "Angular Frequency", latex: "\\omega = 2\\pi f = \\frac{2\\pi}{T}" },
                        { name: "Period (Spring)", latex: "T = 2\\pi\\sqrt{\\frac{m}{k}}" },
                        { name: "Period (Pendulum)", latex: "T = 2\\pi\\sqrt{\\frac{L}{g}}" },
                        { name: "Wave Speed", latex: "v = f\\lambda" },
                        { name: "Period", latex: "T = \\frac{1}{f}" },
                        { name: "Wave Equation", latex: "y = A\\sin(kx - \\omega t)" },
                        { name: "Wave Number", latex: "k = \\frac{2\\pi}{\\lambda}" },
                        { name: "Speed on String", latex: "v = \\sqrt{\\frac{T}{\\mu}}" },
                        { name: "Doppler Effect", latex: "f' = f\\frac{v \\pm v_o}{v \\mp v_s}" },
                        { name: "Beat Frequency", latex: "f_{beat} = |f_1 - f_2|" },
                        { name: "Standing Wave (Fixed)", latex: "\\lambda_n = \\frac{2L}{n}" },
                        { name: "Sound Intensity", latex: "I = \\frac{P}{4\\pi r^2}" },
                        { name: "Decibel Level", latex: "\\beta = 10\\log\\frac{I}{I_0}" }
                    ]
                },
                {
                    name: "Optics",
                    formulas: [
                        { name: "Speed of Light", latex: "c = 3 \\times 10^8 \\text{ m/s}" },
                        { name: "Snell's Law", latex: "n_1\\sin\\theta_1 = n_2\\sin\\theta_2" },
                        { name: "Refractive Index", latex: "n = \\frac{c}{v}" },
                        { name: "Critical Angle", latex: "\\sin\\theta_c = \\frac{n_2}{n_1}" },
                        { name: "Mirror Equation", latex: "\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}" },
                        { name: "Lens Equation", latex: "\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}" },
                        { name: "Magnification", latex: "M = -\\frac{d_i}{d_o} = \\frac{h_i}{h_o}" },
                        { name: "Lens Power", latex: "P = \\frac{1}{f}" },
                        { name: "Lensmaker's Equation", latex: "\\frac{1}{f} = (n-1)\\left(\\frac{1}{R_1} - \\frac{1}{R_2}\\right)" },
                        { name: "Two Lens System", latex: "\\frac{1}{f} = \\frac{1}{f_1} + \\frac{1}{f_2}" },
                        { name: "Young's Double Slit", latex: "d\\sin\\theta = m\\lambda" },
                        { name: "Diffraction Grating", latex: "d\\sin\\theta = n\\lambda" },
                        { name: "Single Slit Minimum", latex: "a\\sin\\theta = m\\lambda" },
                        { name: "Thin Film Interference", latex: "2nt = (m + \\frac{1}{2})\\lambda" },
                        { name: "Brewster's Angle", latex: "\\tan\\theta_B = \\frac{n_2}{n_1}" }
                    ]
                },
                {
                    name: "Electricity",
                    formulas: [
                        { name: "Coulomb's Law", latex: "F = k\\frac{q_1 q_2}{r^2}" },
                        { name: "Electric Field (Point)", latex: "E = k\\frac{Q}{r^2}" },
                        { name: "Electric Field (Definition)", latex: "\\vec{E} = \\frac{\\vec{F}}{q}" },
                        { name: "Electric Potential", latex: "V = k\\frac{Q}{r}" },
                        { name: "Potential Energy", latex: "U = k\\frac{q_1 q_2}{r}" },
                        { name: "Work by E-field", latex: "W = q\\Delta V" },
                        { name: "E from V", latex: "E = -\\frac{dV}{dx}" },
                        { name: "Parallel Plate E", latex: "E = \\frac{\\sigma}{\\epsilon_0} = \\frac{V}{d}" },
                        { name: "Capacitance", latex: "C = \\frac{Q}{V}" },
                        { name: "Parallel Plate C", latex: "C = \\epsilon_0 \\frac{A}{d}" },
                        { name: "Capacitor with Dielectric", latex: "C = \\kappa\\epsilon_0\\frac{A}{d}" },
                        { name: "Energy in Capacitor", latex: "U = \\frac{1}{2}CV^2 = \\frac{Q^2}{2C}" },
                        { name: "Capacitors in Series", latex: "\\frac{1}{C_{eq}} = \\frac{1}{C_1} + \\frac{1}{C_2}" },
                        { name: "Capacitors in Parallel", latex: "C_{eq} = C_1 + C_2" },
                        { name: "Ohm's Law", latex: "V = IR" },
                        { name: "Resistance", latex: "R = \\rho\\frac{L}{A}" },
                        { name: "Power (Electrical)", latex: "P = IV = I^2R = \\frac{V^2}{R}" },
                        { name: "Resistors in Series", latex: "R_{eq} = R_1 + R_2 + R_3" },
                        { name: "Resistors in Parallel", latex: "\\frac{1}{R_{eq}} = \\frac{1}{R_1} + \\frac{1}{R_2}" },
                        { name: "Kirchhoff's Current", latex: "\\sum I_{in} = \\sum I_{out}" },
                        { name: "Kirchhoff's Voltage", latex: "\\sum V = 0" },
                        { name: "RC Time Constant", latex: "\\tau = RC" },
                        { name: "RC Charging", latex: "Q = Q_0(1 - e^{-t/RC})" },
                        { name: "RC Discharging", latex: "Q = Q_0 e^{-t/RC}" }
                    ]
                },
                {
                    name: "Magnetism",
                    formulas: [
                        { name: "Magnetic Force on Charge", latex: "\\vec{F} = q\\vec{v} \\times \\vec{B}" },
                        { name: "Magnetic Force on Wire", latex: "F = BIL\\sin\\theta" },
                        { name: "Lorentz Force", latex: "\\vec{F} = q(\\vec{E} + \\vec{v} \\times \\vec{B})" },
                        { name: "Circular Motion in B", latex: "r = \\frac{mv}{qB}" },
                        { name: "Magnetic Field (Wire)", latex: "B = \\frac{\\mu_0 I}{2\\pi r}" },
                        { name: "B (Center of Loop)", latex: "B = \\frac{\\mu_0 I}{2R}" },
                        { name: "B (Solenoid)", latex: "B = \\mu_0 n I" },
                        { name: "Magnetic Flux", latex: "\\Phi_B = BA\\cos\\theta" },
                        { name: "Faraday's Law", latex: "\\varepsilon = -N\\frac{d\\Phi_B}{dt}" },
                        { name: "Motional EMF", latex: "\\varepsilon = BLv" },
                        { name: "Lenz's Law", latex: "\\varepsilon = -\\frac{d\\Phi}{dt}" },
                        { name: "Inductance", latex: "L = \\frac{N\\Phi_B}{I}" },
                        { name: "Self-Induced EMF", latex: "\\varepsilon = -L\\frac{dI}{dt}" },
                        { name: "Energy in Inductor", latex: "U = \\frac{1}{2}LI^2" },
                        { name: "RL Time Constant", latex: "\\tau = \\frac{L}{R}" },
                        { name: "Transformer", latex: "\\frac{V_s}{V_p} = \\frac{N_s}{N_p}" }
                    ]
                },
                {
                    name: "Thermodynamics",
                    formulas: [
                        { name: "Heat Transfer", latex: "Q = mc\\Delta T" },
                        { name: "Latent Heat", latex: "Q = mL" },
                        { name: "Heat Conduction", latex: "P = \\frac{kA\\Delta T}{L}" },
                        { name: "Ideal Gas Law", latex: "PV = nRT" },
                        { name: "Ideal Gas (Particles)", latex: "PV = Nk_BT" },
                        { name: "Kinetic Theory", latex: "KE_{avg} = \\frac{3}{2}k_BT" },
                        { name: "rms Speed", latex: "v_{rms} = \\sqrt{\\frac{3k_BT}{m}}" },
                        { name: "Internal Energy", latex: "U = \\frac{3}{2}nRT" },
                        { name: "First Law", latex: "\\Delta U = Q - W" },
                        { name: "Work (Isobaric)", latex: "W = P\\Delta V" },
                        { name: "Work (Isothermal)", latex: "W = nRT\\ln\\frac{V_f}{V_i}" },
                        { name: "Adiabatic Process", latex: "PV^\\gamma = \\text{const}" },
                        { name: "Efficiency (Heat Engine)", latex: "\\eta = 1 - \\frac{Q_C}{Q_H}" },
                        { name: "Carnot Efficiency", latex: "\\eta_C = 1 - \\frac{T_C}{T_H}" },
                        { name: "Entropy Change", latex: "\\Delta S = \\frac{Q_{rev}}{T}" },
                        { name: "Stefan-Boltzmann", latex: "P = \\sigma A T^4" },
                        { name: "Wien's Law", latex: "\\lambda_{max} T = 2.898 \\times 10^{-3}" },
                        { name: "Thermal Expansion (Linear)", latex: "\\Delta L = \\alpha L_0 \\Delta T" },
                        { name: "Thermal Expansion (Volume)", latex: "\\Delta V = \\beta V_0 \\Delta T" }
                    ]
                },
                {
                    name: "Fluid Mechanics",
                    formulas: [
                        { name: "Density", latex: "\\rho = \\frac{m}{V}" },
                        { name: "Pressure", latex: "P = \\frac{F}{A}" },
                        { name: "Hydrostatic Pressure", latex: "P = P_0 + \\rho gh" },
                        { name: "Pascal's Principle", latex: "\\frac{F_1}{A_1} = \\frac{F_2}{A_2}" },
                        { name: "Buoyant Force", latex: "F_B = \\rho_f V_d g" },
                        { name: "Continuity Equation", latex: "A_1 v_1 = A_2 v_2" },
                        { name: "Bernoulli's Equation", latex: "P + \\frac{1}{2}\\rho v^2 + \\rho gh = \\text{const}" },
                        { name: "Torricelli's Theorem", latex: "v = \\sqrt{2gh}" },
                        { name: "Viscous Force", latex: "F = \\eta A \\frac{dv}{dy}" },
                        { name: "Stokes' Law", latex: "F = 6\\pi\\eta rv" },
                        { name: "Reynolds Number", latex: "Re = \\frac{\\rho vD}{\\eta}" }
                    ]
                },
                {
                    name: "Modern Physics",
                    formulas: [
                        { name: "Mass-Energy", latex: "E = mc^2" },
                        { name: "Relativistic Energy", latex: "E = \\gamma mc^2" },
                        { name: "Lorentz Factor", latex: "\\gamma = \\frac{1}{\\sqrt{1-v^2/c^2}}" },
                        { name: "Relativistic Momentum", latex: "p = \\gamma mv" },
                        { name: "Time Dilation", latex: "\\Delta t = \\gamma \\Delta t_0" },
                        { name: "Length Contraction", latex: "L = \\frac{L_0}{\\gamma}" },
                        { name: "Photon Energy", latex: "E = hf = \\frac{hc}{\\lambda}" },
                        { name: "Photon Momentum", latex: "p = \\frac{h}{\\lambda} = \\frac{E}{c}" },
                        { name: "de Broglie Wavelength", latex: "\\lambda = \\frac{h}{p} = \\frac{h}{mv}" },
                        { name: "Photoelectric Effect", latex: "KE_{max} = hf - \\phi" },
                        { name: "Work Function", latex: "\\phi = hf_0" },
                        { name: "Heisenberg Uncertainty", latex: "\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}" },
                        { name: "Energy-Time Uncertainty", latex: "\\Delta E \\cdot \\Delta t \\geq \\frac{\\hbar}{2}" },
                        { name: "Bohr Radius", latex: "r_n = n^2 a_0" },
                        { name: "Bohr Energy Levels", latex: "E_n = -\\frac{13.6}{n^2} \\text{ eV}" },
                        { name: "Rydberg Formula", latex: "\\frac{1}{\\lambda} = R\\left(\\frac{1}{n_1^2} - \\frac{1}{n_2^2}\\right)" },
                        { name: "Radioactive Decay", latex: "N = N_0 e^{-\\lambda t}" },
                        { name: "Half-Life", latex: "t_{1/2} = \\frac{\\ln 2}{\\lambda}" },
                        { name: "Activity", latex: "A = \\lambda N = A_0 e^{-\\lambda t}" },
                        { name: "Binding Energy", latex: "E_b = (Zm_p + Nm_n - M)c^2" },
                        { name: "Mass Defect", latex: "\\Delta m = Zm_p + Nm_n - M" }
                    ]
                }
            ]
        },
        chemistry: {
            title: "Chemistry",
            sections: [
                {
                    name: "Stoichiometry",
                    formulas: [
                        { name: "Molar Mass", latex: "M = \\frac{m}{n}" },
                        { name: "Number of Moles", latex: "n = \\frac{m}{M}" },
                        { name: "Avogadro's Number", latex: "N_A = 6.022 \\times 10^{23}" },
                        { name: "Number of Particles", latex: "N = n \\times N_A" },
                        { name: "Molar Volume (STP)", latex: "V_m = 22.4 \\text{ L/mol}" },
                        { name: "Molarity", latex: "M = \\frac{n}{V}" },
                        { name: "Molality", latex: "m = \\frac{n}{m_{solvent}}" },
                        { name: "Dilution", latex: "M_1V_1 = M_2V_2" },
                        { name: "Percent Composition", latex: "\\% = \\frac{m_{element}}{m_{compound}} \\times 100" },
                        { name: "Percent Yield", latex: "\\% = \\frac{\\text{actual}}{\\text{theoretical}} \\times 100" },
                        { name: "Empirical Formula", latex: "\\text{Divide by smallest ratio}" },
                        { name: "Molecular Formula", latex: "\\text{Molecular} = n \\times \\text{Empirical}" }
                    ]
                },
                {
                    name: "Gas Laws",
                    formulas: [
                        { name: "Ideal Gas Law", latex: "PV = nRT" },
                        { name: "Boyle's Law", latex: "P_1V_1 = P_2V_2" },
                        { name: "Charles's Law", latex: "\\frac{V_1}{T_1} = \\frac{V_2}{T_2}" },
                        { name: "Gay-Lussac's Law", latex: "\\frac{P_1}{T_1} = \\frac{P_2}{T_2}" },
                        { name: "Combined Gas Law", latex: "\\frac{P_1V_1}{T_1} = \\frac{P_2V_2}{T_2}" },
                        { name: "Dalton's Law", latex: "P_{total} = P_1 + P_2 + P_3" },
                        { name: "Mole Fraction", latex: "X_A = \\frac{n_A}{n_{total}}" },
                        { name: "Partial Pressure", latex: "P_A = X_A \\cdot P_{total}" },
                        { name: "Graham's Law", latex: "\\frac{r_1}{r_2} = \\sqrt{\\frac{M_2}{M_1}}" },
                        { name: "Density of Gas", latex: "\\rho = \\frac{PM}{RT}" },
                        { name: "Van der Waals", latex: "\\left(P + \\frac{an^2}{V^2}\\right)(V-nb) = nRT" }
                    ]
                },
                {
                    name: "Chemical Reactions",
                    formulas: [
                        { name: "Reaction Arrow", latex: "\\rightarrow" },
                        { name: "Reversible Reaction", latex: "\\rightleftharpoons" },
                        { name: "Precipitate", latex: "\\downarrow" },
                        { name: "Gas Evolved", latex: "\\uparrow" },
                        { name: "Heat Added", latex: "+\\Delta" },
                        { name: "Catalyst", latex: "\\xrightarrow{\\text{cat}}" },
                        { name: "Water", latex: "H_2O" },
                        { name: "Hydronium", latex: "H_3O^+" },
                        { name: "Hydroxide", latex: "OH^-" },
                        { name: "Carbon Dioxide", latex: "CO_2" },
                        { name: "Glucose", latex: "C_6H_{12}O_6" },
                        { name: "Ethanol", latex: "C_2H_5OH" },
                        { name: "Sulfuric Acid", latex: "H_2SO_4" },
                        { name: "Nitric Acid", latex: "HNO_3" },
                        { name: "Hydrochloric Acid", latex: "HCl" },
                        { name: "Sodium Hydroxide", latex: "NaOH" },
                        { name: "Ammonia", latex: "NH_3" },
                        { name: "Methane Combustion", latex: "CH_4 + 2O_2 \\rightarrow CO_2 + 2H_2O" },
                        { name: "Photosynthesis", latex: "6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2" },
                        { name: "Cellular Respiration", latex: "C_6H_{12}O_6 + 6O_2 \\rightarrow 6CO_2 + 6H_2O" }
                    ]
                },
                {
                    name: "Thermochemistry",
                    formulas: [
                        { name: "Enthalpy Change", latex: "\\Delta H = H_{products} - H_{reactants}" },
                        { name: "Exothermic Reaction", latex: "\\Delta H < 0" },
                        { name: "Endothermic Reaction", latex: "\\Delta H > 0" },
                        { name: "Gibbs Free Energy", latex: "\\Delta G = \\Delta H - T\\Delta S" },
                        { name: "Spontaneous Reaction", latex: "\\Delta G < 0" },
                        { name: "Hess's Law", latex: "\\Delta H_{rxn} = \\sum \\Delta H_f(products) - \\sum \\Delta H_f(reactants)" },
                        { name: "Heat Capacity (molar)", latex: "q = nC_p\\Delta T" },
                        { name: "Heat Capacity (mass)", latex: "q = mc\\Delta T" },
                        { name: "Bond Energy", latex: "\\Delta H = \\sum E_{broken} - \\sum E_{formed}" },
                        { name: "Entropy Change", latex: "\\Delta S = \\sum S_{products} - \\sum S_{reactants}" }
                    ]
                },
                {
                    name: "Kinetics",
                    formulas: [
                        { name: "Reaction Rate", latex: "\\text{Rate} = -\\frac{\\Delta[A]}{\\Delta t}" },
                        { name: "Rate Law", latex: "\\text{Rate} = k[A]^m[B]^n" },
                        { name: "Zero Order Integrated", latex: "[A] = [A]_0 - kt" },
                        { name: "First Order Integrated", latex: "\\ln[A] = \\ln[A]_0 - kt" },
                        { name: "Second Order Integrated", latex: "\\frac{1}{[A]} = \\frac{1}{[A]_0} + kt" },
                        { name: "Half-Life (1st Order)", latex: "t_{1/2} = \\frac{\\ln 2}{k}" },
                        { name: "Half-Life (2nd Order)", latex: "t_{1/2} = \\frac{1}{k[A]_0}" },
                        { name: "Arrhenius Equation", latex: "k = Ae^{-E_a/RT}" },
                        { name: "Two-Point Arrhenius", latex: "\\ln\\frac{k_2}{k_1} = \\frac{E_a}{R}\\left(\\frac{1}{T_1} - \\frac{1}{T_2}\\right)" },
                        { name: "Activation Energy", latex: "\\ln k = \\ln A - \\frac{E_a}{RT}" }
                    ]
                },
                {
                    name: "Equilibrium",
                    formulas: [
                        { name: "Equilibrium Constant", latex: "K_{eq} = \\frac{[C]^c[D]^d}{[A]^a[B]^b}" },
                        { name: "Kp and Kc Relation", latex: "K_p = K_c(RT)^{\\Delta n}" },
                        { name: "Reaction Quotient", latex: "Q = \\frac{[C]^c[D]^d}{[A]^a[B]^b}" },
                        { name: "Le Chatelier's Principle", latex: "Q < K \\Rightarrow \\text{forward}" },
                        { name: "ICE Table Method", latex: "K = \\frac{(x)(x)}{([A]_0-x)([B]_0-x)}" },
                        { name: "Solubility Product", latex: "K_{sp} = [A^+]^a[B^-]^b" },
                        { name: "Common Ion Effect", latex: "\\text{Decreases solubility}" }
                    ]
                },
                {
                    name: "Acids & Bases",
                    formulas: [
                        { name: "pH Definition", latex: "pH = -\\log[H^+]" },
                        { name: "pOH Definition", latex: "pOH = -\\log[OH^-]" },
                        { name: "pH + pOH", latex: "pH + pOH = 14" },
                        { name: "pKa Definition", latex: "pK_a = -\\log K_a" },
                        { name: "Ka Expression", latex: "K_a = \\frac{[H^+][A^-]}{[HA]}" },
                        { name: "Kb Expression", latex: "K_b = \\frac{[BH^+][OH^-]}{[B]}" },
                        { name: "Ka × Kb", latex: "K_a \\times K_b = K_w = 10^{-14}" },
                        { name: "Henderson-Hasselbalch", latex: "pH = pK_a + \\log\\frac{[A^-]}{[HA]}" },
                        { name: "Buffer Capacity", latex: "\\beta = \\frac{\\Delta n}{\\Delta pH}" },
                        { name: "Weak Acid pH", latex: "[H^+] = \\sqrt{K_a \\cdot C_a}" },
                        { name: "Strong Acid pH", latex: "pH = -\\log[H^+]" },
                        { name: "Neutralization", latex: "HA + BOH \\rightarrow BA + H_2O" },
                        { name: "Titration Endpoint", latex: "n_{acid} = n_{base}" }
                    ]
                },
                {
                    name: "Electrochemistry",
                    formulas: [
                        { name: "Cell Notation", latex: "\\text{Anode} | \\text{solution} || \\text{solution} | \\text{Cathode}" },
                        { name: "Cell Potential", latex: "E^\\circ_{cell} = E^\\circ_{cathode} - E^\\circ_{anode}" },
                        { name: "Nernst Equation", latex: "E = E^\\circ - \\frac{0.0592}{n}\\log Q" },
                        { name: "Gibbs and E", latex: "\\Delta G^\\circ = -nFE^\\circ" },
                        { name: "Equilibrium and E", latex: "E^\\circ = \\frac{0.0592}{n}\\log K" },
                        { name: "Faraday's Law", latex: "m = \\frac{MIt}{nF}" },
                        { name: "Charge", latex: "Q = It" },
                        { name: "Current Efficiency", latex: "\\% = \\frac{m_{actual}}{m_{theoretical}} \\times 100" }
                    ]
                },
                {
                    name: "Atomic Structure",
                    formulas: [
                        { name: "Atomic Number", latex: "Z = \\text{number of protons}" },
                        { name: "Mass Number", latex: "A = Z + N" },
                        { name: "Isotope Notation", latex: "^A_Z X" },
                        { name: "Planck's Equation", latex: "E = hf = \\frac{hc}{\\lambda}" },
                        { name: "de Broglie", latex: "\\lambda = \\frac{h}{mv}" },
                        { name: "Bohr Energy Levels", latex: "E_n = -\\frac{13.6}{n^2} \\text{ eV}" },
                        { name: "Electron Configuration", latex: "1s^2 2s^2 2p^6 \\ldots" },
                        { name: "Orbital Shapes", latex: "s, p, d, f" },
                        { name: "Pauli Exclusion", latex: "\\text{Max 2 electrons per orbital}" },
                        { name: "Hund's Rule", latex: "\\text{Fill orbitals singly first}" }
                    ]
                }
            ]
        },
        advanced: {
            title: "Advanced",
            formulas: [
                { name: "Integral", latex: "\\int_{a}^{b} f(x) dx" },
                { name: "Double Integral", latex: "\\iint_R f(x,y) \\, dA" },
                { name: "Triple Integral", latex: "\\iiint_V f(x,y,z) \\, dV" },
                { name: "Line Integral", latex: "\\oint_C \\vec{F} \\cdot d\\vec{r}" },
                { name: "Surface Integral", latex: "\\iint_S \\vec{F} \\cdot d\\vec{S}" },
                { name: "Derivative", latex: "\\frac{d}{dx}f(x)" },
                { name: "Partial Derivative", latex: "\\frac{\\partial f}{\\partial x}" },
                { name: "Second Derivative", latex: "\\frac{d^2 y}{dx^2}" },
                { name: "Mixed Partial", latex: "\\frac{\\partial^2 f}{\\partial x \\partial y}" },
                { name: "Gradient", latex: "\\nabla f = \\frac{\\partial f}{\\partial x}\\hat{i} + \\frac{\\partial f}{\\partial y}\\hat{j}" },
                { name: "Divergence", latex: "\\nabla \\cdot \\vec{F} = \\frac{\\partial P}{\\partial x} + \\frac{\\partial Q}{\\partial y}" },
                { name: "Curl", latex: "\\nabla \\times \\vec{F}" },
                { name: "Laplacian", latex: "\\nabla^2 f = \\frac{\\partial^2 f}{\\partial x^2} + \\frac{\\partial^2 f}{\\partial y^2}" },
                { name: "Directional Derivative", latex: "D_u f = \\nabla f \\cdot \\hat{u}" },
                { name: "Limit", latex: "\\lim_{x \\to a} f(x) = L" },
                { name: "Limit at Infinity", latex: "\\lim_{x \\to \\infty} f(x)" },
                { name: "L'Hôpital's Rule", latex: "\\lim_{x \\to a} \\frac{f(x)}{g(x)} = \\lim_{x \\to a} \\frac{f'(x)}{g'(x)}" },
                { name: "Taylor Series", latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n" },
                { name: "Maclaurin Series", latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(0)}{n!}x^n" },
                { name: "e^x Series", latex: "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}" },
                { name: "sin x Series", latex: "\\sin x = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n+1}}{(2n+1)!}" },
                { name: "cos x Series", latex: "\\cos x = \\sum_{n=0}^{\\infty} \\frac{(-1)^n x^{2n}}{(2n)!}" },
                { name: "Fourier Series", latex: "f(x) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty}(a_n\\cos nx + b_n\\sin nx)" },
                { name: "Fourier Coefficient a_n", latex: "a_n = \\frac{1}{\\pi}\\int_{-\\pi}^{\\pi} f(x)\\cos(nx)dx" },
                { name: "Fourier Coefficient b_n", latex: "b_n = \\frac{1}{\\pi}\\int_{-\\pi}^{\\pi} f(x)\\sin(nx)dx" },
                { name: "Integration by Parts", latex: "\\int u \\, dv = uv - \\int v \\, du" },
                { name: "U-Substitution", latex: "\\int f(g(x))g'(x)dx = \\int f(u)du" },
                { name: "Partial Fractions", latex: "\\frac{P(x)}{Q(x)} = \\frac{A}{x-a} + \\frac{B}{x-b}" },
                { name: "Arc Length", latex: "s = \\int_a^b \\sqrt{1 + (f'(x))^2} dx" },
                { name: "Surface Area (Revolution)", latex: "A = 2\\pi \\int_a^b f(x)\\sqrt{1+(f'(x))^2}dx" },
                { name: "Volume (Disk Method)", latex: "V = \\pi \\int_a^b [f(x)]^2 dx" },
                { name: "Volume (Shell Method)", latex: "V = 2\\pi \\int_a^b x f(x) dx" },
                { name: "Sum", latex: "\\sum_{n=1}^{\\infty} a_n" },
                { name: "Product", latex: "\\prod_{i=1}^{n} x_i" },
                { name: "Geometric Series", latex: "\\sum_{n=0}^{\\infty} ar^n = \\frac{a}{1-r}" },
                { name: "P-Series", latex: "\\sum_{n=1}^{\\infty} \\frac{1}{n^p}" },
                { name: "Ratio Test", latex: "\\lim_{n \\to \\infty} \\left|\\frac{a_{n+1}}{a_n}\\right| < 1" },
                { name: "Root Test", latex: "\\lim_{n \\to \\infty} \\sqrt[n]{|a_n|} < 1" },
                { name: "2x2 Matrix", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
                { name: "3x3 Matrix", latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}" },
                { name: "2x2 Determinant", latex: "\\det(A) = ad - bc" },
                { name: "3x3 Determinant", latex: "\\det(A) = a(ei-fh) - b(di-fg) + c(dh-eg)" },
                { name: "Matrix Multiplication", latex: "C_{ij} = \\sum_k A_{ik}B_{kj}" },
                { name: "Matrix Transpose", latex: "(A^T)_{ij} = A_{ji}" },
                { name: "Matrix Inverse", latex: "AA^{-1} = I" },
                { name: "Eigenvalues", latex: "\\det(A - \\lambda I) = 0" },
                { name: "Eigenvector", latex: "(A - \\lambda I)\\vec{v} = 0" },
                { name: "Dot Product", latex: "\\vec{a} \\cdot \\vec{b} = |a||b|\\cos\\theta" },
                { name: "Cross Product", latex: "\\vec{a} \\times \\vec{b} = |a||b|\\sin\\theta \\, \\hat{n}" },
                { name: "1st Order ODE", latex: "\\frac{dy}{dx} + P(x)y = Q(x)" },
                { name: "Separable ODE", latex: "\\frac{dy}{dx} = f(x)g(y)" },
                { name: "2nd Order ODE", latex: "ay'' + by' + cy = 0" },
                { name: "Characteristic Equation", latex: "ar^2 + br + c = 0" },
                { name: "Laplace Transform", latex: "\\mathcal{L}\\{f(t)\\} = \\int_0^\\infty e^{-st}f(t)dt" },
                { name: "Inverse Laplace", latex: "\\mathcal{L}^{-1}\\{F(s)\\}" },
                { name: "Green's Theorem", latex: "\\oint_C (Pdx + Qdy) = \\iint_R \\left(\\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y}\\right)dA" },
                { name: "Stokes' Theorem", latex: "\\oint_C \\vec{F} \\cdot d\\vec{r} = \\iint_S (\\nabla \\times \\vec{F}) \\cdot d\\vec{S}" },
                { name: "Divergence Theorem", latex: "\\iiint_V (\\nabla \\cdot \\vec{F})dV = \\iint_S \\vec{F} \\cdot d\\vec{S}" },
                { name: "System of Equations", latex: "\\begin{cases} ax + by = c \\\\ dx + ey = f \\end{cases}" },
                { name: "Piecewise Function", latex: "f(x) = \\begin{cases} x & x \\geq 0 \\\\ -x & x < 0 \\end{cases}" },
                { name: "Gamma Function", latex: "\\Gamma(n) = \\int_0^\\infty x^{n-1}e^{-x}dx" },
                { name: "Beta Function", latex: "B(x,y) = \\int_0^1 t^{x-1}(1-t)^{y-1}dt" },
                { name: "Complex Exponential", latex: "e^{i\\theta} = \\cos\\theta + i\\sin\\theta" },
                { name: "De Moivre's Theorem", latex: "(\\cos\\theta + i\\sin\\theta)^n = \\cos n\\theta + i\\sin n\\theta" }
            ]
        }
    };

    const handleCopyFormula = (latex: string) => {
        setFormulaLatex(prev => prev + latex);
        setIsFormulaLibraryOpen(false);
    };

    const renderFormulaPreview = (latex: string) => {
        try {
            return katex.renderToString(latex, {
                throwOnError: false,
                displayMode: true
            });
        } catch {
            return "";
        }
    };

    const handleInsertFormula = () => {
        if (!formulaLatex.trim()) return;

        // Restore selection
        if (savedSelection) {
            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(savedSelection);
            }
        }

        // Create formula HTML using KaTeX
        const formulaHtml = katex.renderToString(formulaLatex, {
            throwOnError: false,
            displayMode: false
        });

        // Wrap in a span with class for styling
        const wrappedHtml = `<span class="katex-formula" contenteditable="false">${formulaHtml}</span>&nbsp;`;

        document.execCommand('insertHTML', false, wrappedHtml);

        if (textareaRef.current) {
            setText(textareaRef.current.innerHTML);
            textareaRef.current.focus();
        }

        setIsFormulaPopoverOpen(false);
        setFormulaLatex("");
    };

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
        if (isLinkPopoverOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen || isFormatMenuOpen || isFormulaPopoverOpen) {
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
    }, [isLinkPopoverOpen, isTextDirectionOpen, isTablePopoverOpen, isTableMenuOpen, isAlignMenuOpen, isColorPopoverOpen, isFormatMenuOpen, isFormulaPopoverOpen, colorTab]);

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

    const handleAutofill = (type: 'alpha' | 'numeric') => {
        const newOptions = [...options];
        // Ensure at least 4 options
        while (newOptions.length < 4) {
            newOptions.push("");
        }

        if (type === 'alpha') {
            // Fill with a, b, c, d...
            const letters = "abcdefghijklmnopqrstuvwxyz".split("");
            for (let i = 0; i < newOptions.length; i++) {
                if (i < letters.length) {
                    newOptions[i] = letters[i];
                }
            }
        } else {
            // Fill with 1, 2, 3, 4...
            for (let i = 0; i < newOptions.length; i++) {
                newOptions[i] = (i + 1).toString();
            }
        }
        setOptions(newOptions);
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
        setIsFormatMenuOpen(false);

        // Restore selection and execute command with a slight delay to allow UI to settle
        setTimeout(() => {
            if (savedSelection) {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(savedSelection);
                }
            }

            // Execute command - formatBlock requires angle brackets around tag name
            if (command === 'formatBlock' && value) {
                document.execCommand(command, false, `<${value}>`);
            } else {
                document.execCommand(command, false, value);
            }
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
                    className={`border rounded-md transition-colors ${isQuestionFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen || isFormulaPopoverOpen ? 'border-primary ring-1 ring-primary' : 'border-input'}`}
                    onBlur={(e) => {
                        // Check if the new focus is still within this container (e.g. clicking toolbar buttons)
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                            setIsQuestionFocused(false);
                        }
                    }}
                >
                    {(isQuestionFocused || isLinkPopoverOpen || isFormatMenuOpen || isTextDirectionOpen || isTablePopoverOpen || isTableMenuOpen || isAlignMenuOpen || isColorPopoverOpen || isFormulaPopoverOpen) && (
                        <div className="flex items-center gap-1 p-1 border-b bg-muted/20 overflow-x-auto">
                            <TooltipProvider>
                                {/* Group 1: Insert/Structure */}
                                <div className="flex items-center gap-0.5 border-r pr-1 mr-1">
                                    <Dialog open={isFormulaPopoverOpen} onOpenChange={setIsFormulaPopoverOpen}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                    >
                                                        <Sigma className="h-4 w-4" />
                                                    </Button>
                                                </DialogTrigger>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-black text-white px-2 py-1 text-xs rounded shadow-lg border-none">
                                                <p>Maths and Formula</p>
                                            </TooltipContent>
                                        </Tooltip>
                                        <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                                <div className="flex justify-between items-center">
                                                    <DialogTitle>Maths and Formula</DialogTitle>
                                                    <a
                                                        href="https://katex.org/docs/supported.html"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-orange-500 hover:underline flex items-center gap-1"
                                                    >
                                                        ⓘ LaTeX Help
                                                    </a>
                                                </div>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                                <p className="text-sm text-muted-foreground">
                                                    Type LaTeX code below to create a mathematical formula.
                                                </p>
                                                <div className="min-h-[60px] border rounded-md p-3 bg-muted/30 flex items-center justify-center">
                                                    {formulaPreview ? (
                                                        <div dangerouslySetInnerHTML={{ __html: formulaPreview }} />
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">PREVIEW</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium mb-2">Quick Insert:</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {quickInsertTemplates.map((template) => (
                                                            <Button
                                                                key={template.label}
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-xs"
                                                                onClick={() => setFormulaLatex(prev => prev + template.latex)}
                                                            >
                                                                {template.label}
                                                            </Button>
                                                        ))}
                                                        <Dialog open={isFormulaLibraryOpen} onOpenChange={setIsFormulaLibraryOpen}>
                                                            <DialogTrigger asChild>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="text-xs text-primary"
                                                                >
                                                                    More...
                                                                </Button>
                                                            </DialogTrigger>
                                                            <DialogContent className="sm:max-w-4xl max-h-[80vh]">
                                                                <DialogHeader>
                                                                    <DialogTitle>Formula Library</DialogTitle>
                                                                </DialogHeader>
                                                                <div className="space-y-4">
                                                                    {/* Search */}
                                                                    <div className="relative">
                                                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                                        <Input
                                                                            placeholder="Search formulas (e.g., 'fraction', 'integral', 'pi')..."
                                                                            value={formulaLibrarySearch}
                                                                            onChange={(e) => setFormulaLibrarySearch(e.target.value)}
                                                                            className="pl-10"
                                                                        />
                                                                    </div>

                                                                    {/* Tabs */}
                                                                    <Tabs value={formulaLibraryTab} onValueChange={setFormulaLibraryTab}>
                                                                        <TabsList className="bg-transparent border-b rounded-none w-full justify-start gap-4 h-auto p-0">
                                                                            <TabsTrigger
                                                                                value="basic"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Basic Syntax
                                                                            </TabsTrigger>
                                                                            <TabsTrigger
                                                                                value="symbols"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Symbols
                                                                            </TabsTrigger>
                                                                            <TabsTrigger
                                                                                value="common"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Common Formulas
                                                                            </TabsTrigger>
                                                                            <TabsTrigger
                                                                                value="physics"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Physics
                                                                            </TabsTrigger>
                                                                            <TabsTrigger
                                                                                value="chemistry"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Chemistry
                                                                            </TabsTrigger>
                                                                            <TabsTrigger
                                                                                value="advanced"
                                                                                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-500 data-[state=active]:shadow-none pb-2"
                                                                            >
                                                                                Advanced
                                                                            </TabsTrigger>
                                                                        </TabsList>

                                                                        <ScrollArea className="h-[400px] mt-4">
                                                                            {/* Basic Syntax Tab */}
                                                                            <TabsContent value="basic" className="mt-0">
                                                                                <div className="grid grid-cols-3 gap-4">
                                                                                    {formulaLibrary.basic.formulas
                                                                                        .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                        .map((formula) => (
                                                                                            <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                    <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                    <Button
                                                                                                        variant="ghost"
                                                                                                        size="icon"
                                                                                                        className="h-6 w-6 flex-shrink-0"
                                                                                                        onClick={() => handleCopyFormula(formula.latex)}
                                                                                                    >
                                                                                                        <Copy className="h-3 w-3" />
                                                                                                    </Button>
                                                                                                </div>
                                                                                                <div
                                                                                                    className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                    dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                />
                                                                                                <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                            </div>
                                                                                        ))}
                                                                                </div>
                                                                            </TabsContent>

                                                                            {/* Symbols Tab */}
                                                                            <TabsContent value="symbols" className="mt-0">
                                                                                {formulaLibrary.symbols.sections?.map((section) => (
                                                                                    <div key={section.name} className="mb-6">
                                                                                        <h4 className="font-semibold mb-3">{section.name}</h4>
                                                                                        <div className="grid grid-cols-3 gap-4">
                                                                                            {section.formulas
                                                                                                .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                                .map((formula) => (
                                                                                                    <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                        <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                            <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                            <Button
                                                                                                                variant="ghost"
                                                                                                                size="icon"
                                                                                                                className="h-6 w-6 flex-shrink-0"
                                                                                                                onClick={() => handleCopyFormula(formula.latex)}
                                                                                                            >
                                                                                                                <Copy className="h-3 w-3" />
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                        <div
                                                                                                            className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                            dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                        />
                                                                                                        <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                                    </div>
                                                                                                ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </TabsContent>

                                                                            {/* Common Formulas Tab */}
                                                                            <TabsContent value="common" className="mt-0">
                                                                                {formulaLibrary.common.sections?.map((section) => (
                                                                                    <div key={section.name} className="mb-6">
                                                                                        <h4 className="font-semibold mb-3">{section.name}</h4>
                                                                                        <div className="grid grid-cols-3 gap-4">
                                                                                            {section.formulas
                                                                                                .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                                .map((formula) => (
                                                                                                    <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                        <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                            <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                            <Button
                                                                                                                variant="ghost"
                                                                                                                size="icon"
                                                                                                                className="h-6 w-6 flex-shrink-0"
                                                                                                                onClick={() => handleCopyFormula(formula.latex)}
                                                                                                            >
                                                                                                                <Copy className="h-3 w-3" />
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                        <div
                                                                                                            className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                            dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                        />
                                                                                                        <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                                    </div>
                                                                                                ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </TabsContent>

                                                                            {/* Physics Tab */}
                                                                            <TabsContent value="physics" className="mt-0">
                                                                                {formulaLibrary.physics.sections?.map((section) => (
                                                                                    <div key={section.name} className="mb-6">
                                                                                        <h4 className="font-semibold mb-3">{section.name}</h4>
                                                                                        <div className="grid grid-cols-3 gap-4">
                                                                                            {section.formulas
                                                                                                .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                                .map((formula) => (
                                                                                                    <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                        <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                            <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                            <Button
                                                                                                                variant="ghost"
                                                                                                                size="icon"
                                                                                                                className="h-6 w-6 flex-shrink-0"
                                                                                                                onClick={() => handleCopyFormula(formula.latex)}
                                                                                                            >
                                                                                                                <Copy className="h-3 w-3" />
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                        <div
                                                                                                            className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                            dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                        />
                                                                                                        <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                                    </div>
                                                                                                ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </TabsContent>

                                                                            {/* Chemistry Tab */}
                                                                            <TabsContent value="chemistry" className="mt-0">
                                                                                {formulaLibrary.chemistry.sections?.map((section) => (
                                                                                    <div key={section.name} className="mb-6">
                                                                                        <h4 className="font-semibold mb-3">{section.name}</h4>
                                                                                        <div className="grid grid-cols-3 gap-4">
                                                                                            {section.formulas
                                                                                                .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                                .map((formula) => (
                                                                                                    <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                        <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                            <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                            <Button
                                                                                                                variant="ghost"
                                                                                                                size="icon"
                                                                                                                className="h-6 w-6 flex-shrink-0"
                                                                                                                onClick={() => handleCopyFormula(formula.latex)}
                                                                                                            >
                                                                                                                <Copy className="h-3 w-3" />
                                                                                                            </Button>
                                                                                                        </div>
                                                                                                        <div
                                                                                                            className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                            dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                        />
                                                                                                        <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                                    </div>
                                                                                                ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </TabsContent>

                                                                            {/* Advanced Tab */}
                                                                            <TabsContent value="advanced" className="mt-0">
                                                                                <div className="grid grid-cols-3 gap-4">
                                                                                    {formulaLibrary.advanced.formulas
                                                                                        .filter(f => f.name.toLowerCase().includes(formulaLibrarySearch.toLowerCase()) || f.latex.toLowerCase().includes(formulaLibrarySearch.toLowerCase()))
                                                                                        .map((formula) => (
                                                                                            <div key={formula.name} className="border rounded-lg p-3 hover:border-primary/50 transition-colors overflow-hidden">
                                                                                                <div className="flex justify-between items-start mb-2 gap-2">
                                                                                                    <span className="text-sm font-medium truncate flex-1">{formula.name}</span>
                                                                                                    <Button
                                                                                                        variant="ghost"
                                                                                                        size="icon"
                                                                                                        className="h-6 w-6 flex-shrink-0"
                                                                                                        onClick={() => handleCopyFormula(formula.latex)}
                                                                                                    >
                                                                                                        <Copy className="h-3 w-3" />
                                                                                                    </Button>
                                                                                                </div>
                                                                                                <div
                                                                                                    className="bg-muted/30 rounded p-2 min-h-[50px] flex items-center justify-center mb-2 overflow-x-auto overflow-y-hidden"
                                                                                                    dangerouslySetInnerHTML={{ __html: renderFormulaPreview(formula.latex) }}
                                                                                                />
                                                                                                <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded block truncate" title={formula.latex}>{formula.latex}</code>
                                                                                            </div>
                                                                                        ))}
                                                                                </div>
                                                                            </TabsContent>
                                                                        </ScrollArea>
                                                                    </Tabs>
                                                                </div>
                                                            </DialogContent>
                                                        </Dialog>
                                                    </div>
                                                </div>
                                                <Textarea
                                                    placeholder="e.g., x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
                                                    value={formulaLatex}
                                                    onChange={(e) => setFormulaLatex(e.target.value)}
                                                    className="min-h-[80px] font-mono text-sm border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setIsFormulaPopoverOpen(false);
                                                            setFormulaLatex("");
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="bg-primary text-primary-foreground"
                                                        onClick={handleInsertFormula}
                                                        disabled={!formulaLatex.trim()}
                                                    >
                                                        Insert
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
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
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'p'); }}>
                                                <Type className="h-4 w-4 mr-2" />
                                                <span>Text</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h1'); }}>
                                                <Heading1 className="h-4 w-4 mr-2" />
                                                <span>Heading 1</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h2'); }}>
                                                <Heading2 className="h-4 w-4 mr-2" />
                                                <span>Heading 2</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h3'); }}>
                                                <Heading3 className="h-4 w-4 mr-2" />
                                                <span>Heading 3</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'h4'); }}>
                                                <Heading4 className="h-4 w-4 mr-2" />
                                                <span>Heading 4</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDropdownFormat('formatBlock', 'blockquote'); }}>
                                                <Quote className="h-4 w-4 mr-2" />
                                                <span>Quote</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
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
                        className={`min-h-[100px] w-full px-3 py-2 text-sm border-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre-wrap cursor-text overflow-auto ${!text ? 'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground' : ''} [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:my-1 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_a]:text-blue-600 [&_a]:underline`}
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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAutofill('alpha')}
                    >
                        <ListOrdered className="mr-2 h-4 w-4" /> Autofill (a, b, c, d)
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAutofill('numeric')}
                    >
                        <ListOrdered className="mr-2 h-4 w-4" /> Autofill (1, 2, 3, 4)
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

            {
                !isEditing && (
                    <Button className="w-full" onClick={onAdd}>
                        <Plus className="mr-2 h-4 w-4" /> Save Question
                    </Button>
                )
            }
        </div >
    );
}
