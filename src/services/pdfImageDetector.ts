/**
 * pdfImageDetector.ts — find the exact positions of embedded raster images on
 * a PDF page, without rendering anything.
 *
 * Why: the AI's `image_region` bbox is a visual GUESS (the extraction prompt
 * literally asks the model to estimate from a mental 10×10 grid). But for
 * raster figures — which is what exam-paper figures almost always are — the
 * PDF itself knows precisely where every image is drawn. This module replays
 * the page's operator list, tracking the transform stack, and reports the
 * device-space rectangle of every image paint op.
 *
 * DOM-free on purpose: it only needs a pdf.js `page`, a `viewport`, and the
 * pdf.js `OPS` namespace (passed in so the same code runs under react-pdf's
 * bundled pdfjs in the browser and pdfjs-dist in node tests). Matrix math is
 * done inline rather than via `pdfjs.Util` — v5 changed `applyTransform` to
 * mutate in place and return undefined, so depending on it is version-fragile.
 *
 * Failure mode: any error → empty array → callers fall back to the AI bbox,
 * exactly as if detection didn't exist.
 */

export type ImageRect = {
  /** Device-space (canvas px at the viewport's scale). */
  x: number;
  y: number;
  w: number;
  h: number;
};

type Matrix = [number, number, number, number, number, number];

/** m1 × m2 (PDF matrix composition, same as pdf.js Util.transform). */
function matMul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Apply matrix to a point, returning a fresh point. */
function matApply(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

/**
 * Replay the operator list and return one rect per image paint op, in
 * device space for the given viewport. Rects are unclamped and may extend
 * past the canvas (callers clamp).
 */
export async function detectEmbeddedImageRects(
  page: any,
  viewport: any,
  OPS: any
): Promise<ImageRect[]> {
  try {
    const opList = await page.getOperatorList();
    const fnArray: number[] = opList.fnArray;
    const argsArray: any[] = opList.argsArray;

    const base = Array.from(viewport.transform) as Matrix;
    const stack: Matrix[] = [];
    let ctm: Matrix = [...base] as Matrix;
    const rects: ImageRect[] = [];
    // Annotation appearance streams (stamps, widgets) are positioned by a
    // transform that lives in the beginAnnotation ARGS, not in transform ops —
    // replaying their inner ops against the page CTM would yield rects at
    // WRONG positions. Skip everything inside; the AI-bbox fallback covers
    // annotation-borne figures exactly as before this module existed.
    let annotationDepth = 0;

    const pushImageRect = (m: Matrix) => {
      // An image paint op draws the image into the unit square [0,1]×[0,1]
      // under the current transform. Transform all four corners and take
      // the axis-aligned bounds.
      const corners = [
        matApply(m, 0, 0),
        matApply(m, 1, 0),
        matApply(m, 0, 1),
        matApply(m, 1, 1),
      ];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      if (w > 0.5 && h > 0.5) rects.push({ x, y, w, h });
    };

    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i];
      const args = argsArray[i];

      if (fn === OPS.beginAnnotation) {
        annotationDepth++;
        continue;
      }
      if (fn === OPS.endAnnotation) {
        annotationDepth = Math.max(0, annotationDepth - 1);
        continue;
      }
      if (annotationDepth > 0) continue;

      switch (fn) {
        case OPS.save:
          stack.push([...ctm] as Matrix);
          break;
        case OPS.restore:
          if (stack.length > 0) ctm = stack.pop()!;
          break;
        case OPS.transform:
          if (args && args.length === 6) {
            ctm = matMul(ctm, Array.from(args) as Matrix);
          }
          break;
        // Form XObjects carry their own matrix and are bracketed by
        // begin/end ops — treat like save + transform / restore.
        case OPS.paintFormXObjectBegin: {
          stack.push([...ctm] as Matrix);
          const matrix = args?.[0];
          if (matrix && matrix.length === 6) {
            ctm = matMul(ctm, Array.from(matrix) as Matrix);
          }
          break;
        }
        case OPS.paintFormXObjectEnd:
          if (stack.length > 0) ctm = stack.pop()!;
          break;
        case OPS.paintImageXObject:
        case OPS.paintInlineImageXObject:
        case OPS.paintImageMaskXObject:
          pushImageRect(ctm);
          break;
        case OPS.paintImageXObjectRepeat:
        case OPS.paintInlineImageXObjectGroup:
        case OPS.paintImageMaskXObjectGroup:
        case OPS.paintImageMaskXObjectRepeat:
          // Rare grouped/tiled forms — positions live inside args in
          // op-specific layouts. Skipped in v1; the AI-bbox fallback covers
          // these pages exactly as before.
          break;
        default:
          break;
      }
    }

    return rects;
  } catch {
    return [];
  }
}

/**
 * Merge overlapping / near-touching rects into clusters. A figure is often
 * composed of several adjacent image tiles; students think of it as ONE
 * picture, so we snap to the merged bounds.
 */
export function clusterImageRects(rects: ImageRect[], gapPx = 24): ImageRect[] {
  const clusters: ImageRect[] = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        const touch =
          a.x - gapPx < b.x + b.w &&
          b.x - gapPx < a.x + a.w &&
          a.y - gapPx < b.y + b.h &&
          b.y - gapPx < a.y + a.h;
        if (touch) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.max(a.x + a.w, b.x + b.w) - x;
          const h = Math.max(a.y + a.h, b.y + b.h) - y;
          clusters[i] = { x, y, w, h };
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return clusters;
}

/** Area of the intersection of two rects (0 if disjoint). */
export function intersectArea(a: ImageRect, b: ImageRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// ─── Snap heuristics ───────────────────────────────────────────────────────
// Tuned against real Adda247-style exam PDFs (Shift-2.pdf probe):
//   - question figures & option strips range from ~148×29 to ~775×62
//   - answer ✔/✗ icons are ~24×16 / 16×16          → MIN_W/MIN_H excludes
//   - the page watermark is ~775×668 (25% of page) → MAX_AREA_FRAC excludes
//   - full-page ad rasters are ~100% of page       → MAX_AREA_FRAC excludes
const MIN_W = 28;
const MIN_H = 20;
const MAX_AREA_FRAC = 0.2;
/** A rect must sit mostly inside the AI bbox to count as "the figure". */
const INSIDE_FRAC = 0.5;
/** Don't bother snapping to something microscopic. */
const MIN_UNION_AREA = 1000;
/**
 * If the qualifying rasters cover under 10% of the bbox, the real figure is
 * probably VECTOR art (paths draw no image ops) and the rasters are
 * incidental — an inline equation strip, a logo. Snapping would shrink the
 * crop to the wrong thing, so refuse and keep the AI bbox.
 */
const MIN_UNION_TO_CROP = 0.1;

/**
 * Given the AI's crop rectangle (canvas px, already padded/clamped) and the
 * page's detected image rects, return a refined crop that tightly bounds the
 * raster figure(s) the bbox was pointing at — or null to keep the AI crop.
 *
 * Conservative by design: any doubt → null → caller keeps existing behavior.
 */
export function snapCropToImages(
  crop: ImageRect,
  rects: ImageRect[],
  pageW: number,
  pageH: number,
  padPx = 8
): ImageRect | null {
  if (rects.length === 0) return null;
  const pageArea = pageW * pageH;

  const candidates = rects.filter((r) => {
    if (r.w < MIN_W || r.h < MIN_H) return false; // icons, bullets
    if (r.w * r.h > pageArea * MAX_AREA_FRAC) return false; // watermark, ads
    const inside = intersectArea(r, crop) / (r.w * r.h);
    return inside >= INSIDE_FRAC;
  });
  if (candidates.length === 0) return null;

  // Union of everything that qualified — a question's visual content is often
  // several rasters (prompt figure + four option strips).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of candidates) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }

  const union: ImageRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (union.w * union.h < MIN_UNION_AREA) return null;
  if (union.w * union.h < crop.w * crop.h * MIN_UNION_TO_CROP) return null;

  // Pad and clamp to the page.
  const x = Math.max(0, union.x - padPx);
  const y = Math.max(0, union.y - padPx);
  const w = Math.min(pageW - x, union.w + 2 * padPx);
  const h = Math.min(pageH - y, union.h + 2 * padPx);
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}
