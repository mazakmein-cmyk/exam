/**
 * autoSnipper.ts — client-side render + crop pipeline for §12 auto-snip.
 *
 * Input: a PDF File + an array of snip requests (page + optional 0-1000 bbox).
 * Output: array of PNG Blobs, one per request, in the same order.
 *
 * Pure-ish:
 *   - No Supabase, no React, no DOM beyond <canvas>.
 *   - Uses `pdfjs` re-exported by react-pdf (which is already in the bundle —
 *     no new npm dep). Worker is configured once globally by PdfSnipper.tsx
 *     (and again here defensively in case this module is imported first).
 *
 * Failure mode: a single failed request never aborts the batch. Each result
 * carries an optional `warning` string and an empty Blob if the snip failed
 * altogether. Callers must check `blob.size` / `warning` per result.
 */
import { pdfjs } from "react-pdf";
// Side-effect import: registers the PDF.js worker exactly once across the app.
// Must come before any pdfjs.getDocument call. See src/lib/pdfWorker.ts for why
// this uses Vite's `?worker` (bundles internal imports) rather than `?url`.
import "@/lib/pdfWorker";

export type SnipRequest = {
  /** Caller-defined identifier (e.g. `${sectionName}::${questionIndex}`). */
  key: string;
  /** 1-based PDF page number. */
  page: number;
  /** Normalised 0-1000 bbox. Absent → whole-page snip. */
  bbox?: { xMin: number; yMin: number; xMax: number; yMax: number };
};

export type SnipResult = {
  key: string;
  /** Empty Blob (size 0) if the snip failed. */
  blob: Blob;
  /** Rendered pixel dimensions of the cropped image. */
  width: number;
  height: number;
  /** Human-readable warning when something went sideways but we still returned a Blob. */
  warning?: string;
};

export type AutoSnipOptions = {
  /** Padding applied on each side of the bbox before cropping. Default 5 (%). */
  paddingPct?: number;
  /** PDF render scale (higher = sharper). Default 2.0. */
  renderScale?: number;
  /** Callback fired during work for the UI to show a progress strip. */
  onProgress?: (message: string, done: number, total: number) => void;
  /**
   * Auto-trim white margins around the cropped region. Default true.
   * Lets us recover a tight image even when the AI emits a loose / whole-page
   * bbox (e.g. `{xMin:0, yMin:0, xMax:1000, yMax:1000}` which means "I don't
   * know where it is, just take the whole page"). Trims outer rows / cols that
   * are uniformly white; preserves all interior whitespace.
   */
  autoTrimMargins?: boolean;
  /**
   * Pixel value above which a channel is considered "white" for the trim pass.
   * Default 245 — leaves room for anti-aliasing and slight off-white scans.
   */
  trimWhiteThreshold?: number;
  /**
   * Padding (px) to leave around the auto-trimmed content. Default 8.
   * Prevents the crop from sitting right against the figure's edge.
   */
  trimSafetyPad?: number;
};

/**
 * Render the PDF, crop one rectangle per request, return PNG Blobs.
 *
 * Pages are deduped — each unique page in the request list is rendered exactly
 * once, then every request against that page is cropped from the same canvas.
 * This keeps memory bounded and is dramatically faster on RC/DI clusters where
 * one page hosts multiple questions.
 */
export async function autoSnip(
  pdfFile: File,
  requests: SnipRequest[],
  options: AutoSnipOptions = {}
): Promise<SnipResult[]> {
  const paddingPct = options.paddingPct ?? 5;
  const renderScale = options.renderScale ?? 2.0;
  const onProgress = options.onProgress ?? (() => {});
  const autoTrimMargins = options.autoTrimMargins ?? true;
  const trimWhiteThreshold = options.trimWhiteThreshold ?? 245;
  const trimSafetyPad = options.trimSafetyPad ?? 8;

  if (requests.length === 0) return [];

  onProgress("Opening PDF…", 0, requests.length);

  // eslint-disable-next-line no-console
  console.info("[autoSnipper] opening PDF, size =", pdfFile.size, "bytes");

  const buffer = await pdfFile.arrayBuffer();

  // Wrap getDocument with a hard timeout so a silent worker hang surfaces
  // as a real error instead of pinning the UI forever. 60 s is generous;
  // a healthy worker opens a 30-page PDF in 1-3 s.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await Promise.race<any>([
    loadingTask.promise,
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "PDF.js getDocument() timed out after 60s — worker likely failed to start. Check DevTools console for [pdfWorker] log lines."
            )
          ),
        60_000
      )
    ),
  ]);
  // eslint-disable-next-line no-console
  console.info("[autoSnipper] opened PDF, numPages =", pdfDoc.numPages);

  // Group requests by page (preserve insertion order via Map).
  const requestsByPage = new Map<number, SnipRequest[]>();
  for (const req of requests) {
    const arr = requestsByPage.get(req.page) ?? [];
    arr.push(req);
    requestsByPage.set(req.page, arr);
  }

  // Map keyed by request.key to preserve final output order.
  const resultsByKey = new Map<string, SnipResult>();
  let done = 0;

  for (const [pageNum, pageRequests] of requestsByPage) {
    if (pageNum < 1 || pageNum > pdfDoc.numPages) {
      for (const req of pageRequests) {
        resultsByKey.set(req.key, {
          key: req.key,
          blob: new Blob(),
          width: 0,
          height: 0,
          warning: `Page ${pageNum} does not exist in this PDF (has ${pdfDoc.numPages} pages).`,
        });
        done++;
      }
      onProgress(`Skipped page ${pageNum} — out of range`, done, requests.length);
      continue;
    }

    onProgress(`Rendering page ${pageNum}…`, done, requests.length);

    let pageCanvas: HTMLCanvasElement;
    try {
      pageCanvas = await renderPdfPageToCanvas(pdfDoc, pageNum, renderScale);
    } catch (err: any) {
      const msg = `Page ${pageNum} failed to render: ${err?.message ?? String(err)}`;
      for (const req of pageRequests) {
        resultsByKey.set(req.key, {
          key: req.key,
          blob: new Blob(),
          width: 0,
          height: 0,
          warning: msg,
        });
        done++;
      }
      onProgress(msg, done, requests.length);
      continue;
    }

    for (let i = 0; i < pageRequests.length; i++) {
      const req = pageRequests[i];
      onProgress(
        `Cropping region ${done + 1} of ${requests.length}…`,
        done,
        requests.length
      );
      const result = await cropFromCanvas(pageCanvas, req, paddingPct, {
        autoTrimMargins,
        trimWhiteThreshold,
        trimSafetyPad,
      });
      resultsByKey.set(req.key, result);
      done++;
    }
  }

  onProgress("Done", done, requests.length);

  // Return in the original request order.
  return requests.map(
    (req) =>
      resultsByKey.get(req.key) ?? {
        key: req.key,
        blob: new Blob(),
        width: 0,
        height: 0,
        warning: "Unknown error — no result produced.",
      }
  );
}

// ─── Internals ──────────────────────────────────────────────────────────

async function renderPdfPageToCanvas(
  pdfDoc: any,
  pageNum: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  // `willReadFrequently: true` opts the canvas into a CPU-backed buffer so the
  // subsequent getImageData() inside findContentBounds() uses the fast path.
  // Chrome otherwise warns and falls back to a slow GPU→CPU copy.
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to acquire 2D canvas context.");
  }
  // PDF.js renders with a transparent background by default; flatten to white
  // so PNG snips look like the source paper, not the dark app background.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas;
}

async function cropFromCanvas(
  pageCanvas: HTMLCanvasElement,
  req: SnipRequest,
  paddingPct: number,
  trimOpts: {
    autoTrimMargins: boolean;
    trimWhiteThreshold: number;
    trimSafetyPad: number;
  }
): Promise<SnipResult> {
  const cw = pageCanvas.width;
  const ch = pageCanvas.height;

  let x = 0;
  let y = 0;
  let w = cw;
  let h = ch;
  let warning: string | undefined;

  // Detect the "whole page sentinel" (xMin/yMin=0, xMax/yMax=1000). The AI
  // emits this when it knows the figure is on this page but can't localise
  // it. Don't bother applying our normal bbox crop in that case — go
  // straight to auto-trim of the full page render below.
  const isWholePageSentinel =
    !!req.bbox &&
    req.bbox.xMin === 0 &&
    req.bbox.yMin === 0 &&
    req.bbox.xMax === 1000 &&
    req.bbox.yMax === 1000;

  if (req.bbox && !isWholePageSentinel) {
    const { xMin, yMin, xMax, yMax } = req.bbox;
    if (
      Number.isFinite(xMin) &&
      Number.isFinite(yMin) &&
      Number.isFinite(xMax) &&
      Number.isFinite(yMax) &&
      xMin >= 0 &&
      yMin >= 0 &&
      xMax <= 1000 &&
      yMax <= 1000 &&
      xMin < xMax &&
      yMin < yMax
    ) {
      x = (xMin / 1000) * cw;
      y = (yMin / 1000) * ch;
      w = ((xMax - xMin) / 1000) * cw;
      h = ((yMax - yMin) / 1000) * ch;

      // Padding (applied as a fraction of the *region* size, not page size).
      const padX = w * (paddingPct / 100);
      const padY = h * (paddingPct / 100);
      x -= padX;
      y -= padY;
      w += 2 * padX;
      h += 2 * padY;

      // Clamp to canvas bounds.
      if (x < 0) {
        w += x;
        x = 0;
      }
      if (y < 0) {
        h += y;
        y = 0;
      }
      if (x + w > cw) w = cw - x;
      if (y + h > ch) h = ch - y;
    } else {
      warning = "Invalid bbox at render time — fell back to whole page.";
    }
  } else if (isWholePageSentinel) {
    warning = "AI emitted whole-page bbox — auto-trimming margins instead.";
  }

  // Round to integer pixels.
  let ix = Math.max(0, Math.round(x));
  let iy = Math.max(0, Math.round(y));
  let iw = Math.max(1, Math.round(w));
  let ih = Math.max(1, Math.round(h));

  // ─── Auto-trim outer white margins (§ "the real fix") ───
  // Compensates for loose / whole-page AI bboxes by detecting the actual
  // content extent. Tight bboxes from competent AIs are mostly no-op here.
  if (trimOpts.autoTrimMargins) {
    const bounds = findContentBounds(
      pageCanvas,
      ix,
      iy,
      iw,
      ih,
      trimOpts.trimWhiteThreshold
    );
    if (bounds) {
      const pad = trimOpts.trimSafetyPad;
      const trimmedX = Math.max(ix, bounds.x - pad);
      const trimmedY = Math.max(iy, bounds.y - pad);
      const trimmedW = Math.min(
        ix + iw - trimmedX,
        bounds.x + bounds.w - trimmedX + pad
      );
      const trimmedH = Math.min(
        iy + ih - trimmedY,
        bounds.y + bounds.h - trimmedY + pad
      );
      // Only accept the trim if it's a meaningful tightening (>2% shrink on
      // either axis). Avoid jittery 1-pixel adjustments.
      const shrankW = trimmedW < iw * 0.98;
      const shrankH = trimmedH < ih * 0.98;
      if ((shrankW || shrankH) && trimmedW > 0 && trimmedH > 0) {
        ix = trimmedX;
        iy = trimmedY;
        iw = trimmedW;
        ih = trimmedH;
      }
    }
  }

  if (iw < 50 || ih < 50) {
    warning = (warning ? warning + "; " : "") + `crop is small (${iw}×${ih} px)`;
  }

  const cropped = document.createElement("canvas");
  cropped.width = iw;
  cropped.height = ih;
  const ctx = cropped.getContext("2d", { alpha: false });
  if (!ctx) {
    return {
      key: req.key,
      blob: new Blob(),
      width: 0,
      height: 0,
      warning: "Failed to acquire 2D canvas context for crop.",
    };
  }
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, iw, ih);
  ctx.drawImage(pageCanvas, ix, iy, iw, ih, 0, 0, iw, ih);

  const blob = await new Promise<Blob>((resolve) => {
    cropped.toBlob(
      (b) => resolve(b ?? new Blob()),
      "image/png"
    );
  });

  if (blob.size === 0 && !warning) {
    warning = "toBlob produced empty blob.";
  }

  return { key: req.key, blob, width: iw, height: ih, warning };
}

/**
 * Find the bounding rectangle of non-white content within a sub-region of
 * `canvas`. Returns null if the entire region is white.
 *
 * Algorithm: 4-way edge scan (top/bottom/left/right). Each scan short-circuits
 * on the first row/col containing a non-white pixel. Typical pages have
 * content within the first ~100 px from each edge, so this is ~5-15 ms on
 * 1200×1600 page canvases.
 *
 * A pixel is "white" iff R, G, and B are all ≥ threshold (anti-aliasing
 * tolerated). The alpha channel is ignored — pdf.js renders with opaque
 * background that we filled white at render time.
 */
function findContentBounds(
  canvas: HTMLCanvasElement,
  x0: number,
  y0: number,
  w: number,
  h: number,
  threshold: number
): { x: number; y: number; w: number; h: number } | null {
  if (w <= 0 || h <= 0) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(x0, y0, w, h).data;
  } catch {
    // SecurityError on cross-origin canvases — shouldn't happen for our
    // freshly-rendered pages, but be safe.
    return null;
  }

  const stride = w * 4;
  const isContent = (i: number) =>
    data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold;

  // Top: first row from top that contains any non-white pixel.
  let top = -1;
  for (let yy = 0; yy < h; yy++) {
    const rowStart = yy * stride;
    for (let xx = 0; xx < w; xx++) {
      if (isContent(rowStart + xx * 4)) {
        top = yy;
        break;
      }
    }
    if (top !== -1) break;
  }
  if (top === -1) return null; // entire region is white

  // Bottom: first row from bottom.
  let bottom = h - 1;
  for (let yy = h - 1; yy >= top; yy--) {
    const rowStart = yy * stride;
    let found = false;
    for (let xx = 0; xx < w; xx++) {
      if (isContent(rowStart + xx * 4)) {
        found = true;
        break;
      }
    }
    if (found) {
      bottom = yy;
      break;
    }
  }

  // Left: first col from left. Restrict scan to [top, bottom] vertically
  // since we already know rows outside that range are white.
  let left = -1;
  for (let xx = 0; xx < w; xx++) {
    for (let yy = top; yy <= bottom; yy++) {
      if (isContent(yy * stride + xx * 4)) {
        left = xx;
        break;
      }
    }
    if (left !== -1) break;
  }
  if (left === -1) return null;

  // Right: first col from right.
  let right = w - 1;
  for (let xx = w - 1; xx >= left; xx--) {
    let found = false;
    for (let yy = top; yy <= bottom; yy++) {
      if (isContent(yy * stride + xx * 4)) {
        found = true;
        break;
      }
    }
    if (found) {
      right = xx;
      break;
    }
  }

  // Convert from sub-region coords back to absolute canvas coords.
  return {
    x: x0 + left,
    y: y0 + top,
    w: right - left + 1,
    h: bottom - top + 1,
  };
}
