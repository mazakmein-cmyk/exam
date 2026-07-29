const fs = require('fs');

function patchFile() {
  let content = fs.readFileSync('src/pages/LiveExamDetail.tsx', 'utf8');

  // Add imports
  if (!content.includes('import JsonUploadDialog')) {
    content = content.replace(
      'import { QuestionForm } from "@/components/QuestionForm";',
      `import { QuestionForm } from "@/components/QuestionForm";
import JsonUploadDialog from "@/components/JsonUploadDialog";
import type { ParseReport } from "@/services/jsonImportParser";
import { RichTextEditor } from "@/components/RichTextEditor";
const PdfSnipper = lazy(() => import("@/components/PdfSnipper"));
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";`
    );
  }

  // Ensure lazy, Suspense are imported from React
  if (!content.includes('lazy, Suspense')) {
    content = content.replace(
      'import { useEffect, useState, useRef } from "react";',
      'import { useEffect, useState, useRef, lazy, Suspense } from "react";'
    );
  }

  // Fix lucide-react imports
  const lucideLine = content.match(/import {.*?}.*?from "lucide-react";/s);
  if (lucideLine) {
    const currentIcons = lucideLine[0].substring(lucideLine[0].indexOf('{') + 1, lucideLine[0].indexOf('}')).split(',').map(s => s.trim());
    const newIcons = ["FileText", "Sparkles", "Copy", "Layers", "Lock", "Upload", "FileJson", "Check", "X"];
    newIcons.forEach(icon => {
      if (!currentIcons.includes(icon)) currentIcons.push(icon);
    });
    content = content.replace(lucideLine[0], `import { ${currentIcons.join(', ')} } from "lucide-react";`);
  }

  // Add state variables
  if (!content.includes('const [showJsonUploadDialog')) {
    content = content.replace(
      '// Delete Question Confirmation State',
      `// Format / Passage / PDF / AI State
  const [showJsonUploadDialog, setShowJsonUploadDialog] = useState(false);
  const [questionFormat, setQuestionFormat] = useState("standard");
  const [passageText, setPassageText] = useState("");
  const [passageImage, setPassageImage] = useState<string | null>(null);
  const [aiParsedQuestions, setAiParsedQuestions] = useState<any[]>([]);
  const [aiParsingStatus, setAiParsingStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle');
  const [aiPdfUrl, setAiPdfUrl] = useState<string | null>(null);

  // Delete Question Confirmation State`
    );
  }

  // Add Duplicate and JSON actions to Top Bar (near Share button)
  if (!content.includes('FileJson')) {
    content = content.replace(
      `<Button variant="ghost" size="icon" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>`,
      `<DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {}}>
                      <Copy className="mr-2 h-4 w-4 text-blue-500" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowJsonUploadDialog(true)}>
                      <FileJson className="mr-2 h-4 w-4 text-blue-500" />
                      Upload JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShare}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>`
    );
  }

  fs.writeFileSync('src/pages/LiveExamDetail.tsx', content);
  console.log('LiveExamDetail.tsx patched successfully');
}

patchFile();
