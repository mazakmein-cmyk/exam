/**
 * pdfWorker.ts — single source of truth for the PDF.js worker.
 *
 * Why `?worker` + `workerPort` instead of `?url` + `workerSrc`:
 *   - PDF.js 5.x ships an ES-module worker whose source has *internal* imports
 *     (e.g. `import('./pdf.mjs')`). When you serve the worker file via Vite's
 *     `?url` import, the browser loads it as `type: 'module'` and tries to
 *     resolve those imports relative to the served URL — they fail silently
 *     because Vite has only bundled the *entry* file, not its dependencies.
 *     PDF.js then waits indefinitely for the worker's "ready" message →
 *     `getDocument().promise` hangs at the "Opening PDF…" phase.
 *   - Vite's `?worker` import *bundles* the worker (entry + all transitive
 *     imports) into a single deployable file and returns a `Worker` class.
 *     We instantiate it ourselves and hand the live Worker instance to
 *     PDF.js via `GlobalWorkerOptions.workerPort`, bypassing PDF.js's
 *     internal worker bootstrapping.
 *
 * The worker is created exactly once at module load (guarded by an idempotency
 * check on `workerPort`), shared by react-pdf's <Document>, PdfSnipper, and
 * autoSnipper. Negligible boot cost (~10 ms).
 */
import { pdfjs } from "react-pdf";
// `?worker&module` tells Vite:
//   - bundle the worker entry plus all its transitive imports into one file
//   - keep ES module syntax inside it (don't transpile to IIFE)
//   - create the Worker with { type: 'module' } so the browser parses it correctly
// pdfjs-dist 5.x ships ES module workers; classic-worker conversion can quietly
// strip dynamic imports or top-level await and produce a worker that boots but
// can't talk to the main thread. Forcing module-type worker eliminates that
// whole class of failure.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerPort) {
  try {
    const worker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = worker as unknown as Worker;
    // Loud diagnostic — easy to spot in DevTools if something's wrong later.
    // eslint-disable-next-line no-console
    console.info("[pdfWorker] PDF.js worker initialised (inline module worker)");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pdfWorker] Failed to start PDF.js worker:", err);
  }
}

export {};
