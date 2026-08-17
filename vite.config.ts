import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Which dependencies get their own chunk — matched against the module's path
 * inside node_modules, first match wins.
 *
 * This is a FUNCTION rather than the object form of `manualChunks` for one
 * concrete reason. The object form (`{ charts: ["recharts"] }`) does not claim
 * only the package you name — it claims that package *and everything it
 * statically imports* that no earlier group already claimed. recharts imports
 * `clsx`, and `clsx` is what `cn()` calls in literally every component on the
 * site. So clsx was assigned to the charts chunk, every chunk then imported
 * clsx from there, and 394 kB (107 kB gzipped) of charting code became a hard
 * static dependency of the entry — modulepreloaded on the landing page, the
 * exam library, everywhere. Nothing rendered a chart.
 *
 * Matching on real paths keeps each group to the package it is named after.
 * Anything not listed here returns undefined and is placed by Rollup's own
 * algorithm, which shares a module between the routes that reach it instead of
 * pinning it to the first heavy library that happened to touch it.
 */
const VENDOR_GROUPS: Array<{ name: string; test: RegExp }> = [
  // ── Listed first on purpose ──
  // The framework, plus the handful of tiny utilities that cross-cut the whole
  // app. `clsx` is the one that matters: `cn()` calls it in every component, and
  // recharts / react-pdf also depend on it. Claiming it here — ahead of the
  // heavy groups below — is what stops a charting or PDF chunk from adopting it
  // and thereby becoming a dependency of every page on the site.
  {
    name: "vendor",
    test: /node_modules\/(react|react-dom|react-is|scheduler|react-router|react-router-dom|@remix-run|clsx|tailwind-merge|class-variance-authority|tiny-invariant)\//,
  },
  { name: "supabase", test: /node_modules\/@supabase\// },
  // Charting: recharts plus the d3 / victory-vendor tree it pulls in. Only the
  // analytics, admin and live-report screens ever load this.
  {
    name: "charts",
    test: /node_modules\/(recharts|recharts-scale|victory-vendor|d3-array|d3-color|d3-ease|d3-format|d3-interpolate|d3-path|d3-scale|d3-shape|d3-time|d3-time-format|d3-timer|internmap|decimal\.js-light|react-smooth|react-transition-group|prop-types|eventemitter3|fast-equals|lodash)\//,
  },
  // PDF viewing + cropping: the upload/snip flow only.
  { name: "pdf", test: /node_modules\/(react-pdf|pdfjs-dist|react-image-crop)\// },
  // Math typesetting: question rendering only.
  { name: "katex", test: /node_modules\/katex\// },
  // Indic transliteration: the section/question editors only. Large enough that
  // it should not ride along inside whichever editor chunk imports it first.
  { name: "transliterate", test: /node_modules\/@ai4bharat\// },
];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Rollup ids use platform separators on Windows; normalize first or
          // none of the patterns below ever match.
          const file = id.replace(/\\/g, "/");

          // Rollup's CommonJS interop shims (`getDefaultExportFromCjs`,
          // `commonjsGlobal`) and Vite's `__vitePreload` are a few dozen bytes
          // each, live in virtual modules with no node_modules path, and are
          // imported by nearly every chunk. Left to the default algorithm they
          // get parked in whichever chunk Rollup visits first — which was the
          // 392 kB charting chunk, so `vendor` and `supabase` imported charts,
          // and the entry therefore preloaded charts on every page. Pin them to
          // vendor, which every page loads regardless.
          if (file.includes("commonjsHelpers") || file.includes("vite/preload-helper")) {
            return "vendor";
          }

          if (!file.includes("node_modules/")) return undefined;
          // Vite's own virtual modules carry a query suffix — most importantly
          // `pdfjs-dist/build/pdf.worker.min.mjs?worker&inline`, which Vite
          // compiles as a separate worker bundle. Grouping that by its path
          // drags the inlined 1.3 MB worker into the main-thread PDF chunk, so
          // every PDF screen downloads it whether or not a worker starts. Leave
          // anything query-suffixed to Vite.
          if (file.includes("?")) return undefined;
          return VENDOR_GROUPS.find((g) => g.test.test(file))?.name;
        },
      },
    },
  },
}));
