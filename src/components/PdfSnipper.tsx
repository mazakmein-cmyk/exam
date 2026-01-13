import { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Scissors, ZoomIn, ZoomOut } from "lucide-react";

// Set up worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfSnipperProps {
    pdfUrl: string;
    onSnip: (blob: Blob) => void;
    onSnipPassage?: (blob: Blob) => void;
}

export default function PdfSnipper({ pdfUrl, onSnip, onSnipPassage }: PdfSnipperProps) {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.1);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [imageRef, setImageRef] = useState<HTMLCanvasElement | null>(null);

    // We need to capture the rendered canvas from react-pdf
    const canvasRef = useRef<HTMLCanvasElement>(null);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
    }

    const processSnip = async (callback: (blob: Blob) => void) => {
        if (!completedCrop || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const crop = completedCrop;

        const scaleX = canvas.width / canvas.offsetWidth;
        const scaleY = canvas.height / canvas.offsetHeight;

        const snipCanvas = document.createElement('canvas');
        snipCanvas.width = crop.width;
        snipCanvas.height = crop.height;
        const ctx = snipCanvas.getContext('2d');

        if (!ctx) return;

        ctx.drawImage(
            canvas,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            crop.width,
            crop.height
        );

        snipCanvas.toBlob((blob) => {
            if (blob) {
                callback(blob);
                setCrop(undefined); // Clear crop after snip
                setCompletedCrop(undefined); // Clear completedCrop to disable buttons
            }
        }, 'image/png');
    };

    const handleSnip = () => processSnip(onSnip);
    const handleSnipPassage = () => onSnipPassage && processSnip(onSnipPassage);

    return (
        <div className="flex flex-col h-full bg-slate-100 rounded-lg border overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 bg-white border-b">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium">
                        Page {pageNumber} of {numPages}
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setScale(s => Math.max(1.1, s - 0.1))}
                    >
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm w-12 text-center">{(scale * 100).toFixed(0)}%</span>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                    >
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    {onSnipPassage && (
                        <Button
                            onClick={handleSnipPassage}
                            disabled={!completedCrop?.width || !completedCrop?.height}
                            variant="outline"
                            className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                        >
                            <Scissors className="mr-2 h-4 w-4" />
                            Snip & Attach Passage
                        </Button>
                    )}
                    <Button
                        onClick={handleSnip}
                        disabled={!completedCrop?.width || !completedCrop?.height}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Scissors className="mr-2 h-4 w-4" />
                        Snip & Attach Question
                    </Button>
                </div>
            </div>

            {/* PDF Viewer Area */}
            <div className="flex-1 overflow-auto p-4 flex justify-center relative">
                <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="shadow-lg"
                >
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                    >
                        <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            canvasRef={canvasRef}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                        />
                    </ReactCrop>
                </Document>
            </div>
        </div>
    );
}
