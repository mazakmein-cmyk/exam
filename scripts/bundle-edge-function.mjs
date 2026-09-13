#!/usr/bin/env node
/**
 * Produce a single-file copy of the ai-pdf-import edge function that can be
 * pasted into the Supabase dashboard's function editor.
 *
 * Why this exists: supabase/functions/ai-pdf-import/index.ts imports the
 * extraction prompt from src/lib/extractionPrompt.js, OUTSIDE the function
 * folder, so the browser editor cannot resolve it — the guide page and the
 * function have to send the same prompt, and that is worth a shared module.
 * `supabase functions deploy` bundles the import itself and needs none of
 * this; the dashboard route does.
 *
 * The generated file is a build artifact, never a second source of truth. Edit
 * index.ts or extractionPrompt.js and run this again — the output lands in
 * supabase/.temp/ (gitignored) so a stale copy cannot be committed or
 * mistaken for the real function.
 *
 * Usage: node scripts/bundle-edge-function.mjs [outPath]
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = "supabase/functions/ai-pdf-import/index.ts";
const MODULE = "src/lib/extractionPrompt.js";
const OUT = process.argv[2] ?? "supabase/.temp/ai-pdf-import.bundled.ts";

const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

const entry = read(ENTRY);
const mod = read(MODULE);

// 1. The import to replace. The brace body is [^}]* rather than [\s\S]*? on
//    purpose: a cross-line lazy match starts at the FIRST `import {` in the
//    file and runs to this statement's `from`, quietly eating the two remote
//    imports above it. [^}]* cannot leave its own braces.
const IMPORT_RE =
  /^import\s*\{[^}]*\}\s*from\s*"\.\.\/\.\.\/\.\.\/src\/lib\/extractionPrompt\.js";\r?\n/m;
const importMatch = entry.match(IMPORT_RE);
if (!importMatch) {
  throw new Error(
    `${ENTRY}: could not find the extractionPrompt import. If it was renamed or ` +
      `reformatted, update IMPORT_RE in this script.`
  );
}

// 2. Flatten the module's exports into plain top-level declarations. Only
//    `export` at the start of a line is a declaration; anything else would be
//    prompt text, and rewriting that would corrupt what Gemini is sent.
const exportLines = mod.match(/^export .*/gm) ?? [];
const EXPECTED = [
  "export const EXTRACTION_PROMPT_VERSION",
  "export const EXTRACTION_PROMPT ",
  "export function fillExtractionPromptContext",
  "export const EXTRACTION_JSON_START",
  "export const EXTRACTION_JSON_END",
  "export function hasDelimitedExtraction",
];
for (const decl of EXPECTED) {
  if (!exportLines.some((line) => line.startsWith(decl))) {
    throw new Error(`${MODULE}: expected a top-level \`${decl}\` and found none.`);
  }
}
if (exportLines.length !== EXPECTED.length) {
  throw new Error(
    `${MODULE}: expected ${EXPECTED.length} top-level exports, found ${exportLines.length}:\n` +
      exportLines.map((l) => `  ${l.slice(0, 80)}`).join("\n") +
      `\nIf a real export was added, add it to EXPECTED. If one of these is prompt text that ` +
      `now begins with "export ", indent it in ${MODULE} so it is not rewritten.`
  );
}
const inlined = mod.replace(/^export /gm, "");

const banner = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit, and do not commit.
//
// ${ENTRY}
// with ${MODULE} inlined, for pasting into the Supabase dashboard's edge
// function editor (which cannot resolve an import outside the function folder).
//
// Regenerate:  node scripts/bundle-edge-function.mjs
// The real source is the two files named above. Deploying with the CLI
// (\`supabase functions deploy ai-pdf-import\`) uses those directly and does not
// need this file at all.
// ─────────────────────────────────────────────────────────────────────────────

`;

const bundled =
  banner +
  entry.replace(
    IMPORT_RE,
    `// ── inlined from ${MODULE} ──────────────────────────────────────────────────\n` +
      `${inlined}\n` +
      `// ── end of inlined ${MODULE} ───────────────────────────────────────────────\n`
  );

// 3. Nothing relative may survive: a missed import fails at deploy time with a
//    message that does not name this script, so catch it here instead.
const leftover = bundled.match(/^\s*(?:import|export)\s[^;]*?from\s*"\.[^"]*"/gm);
if (leftover) {
  throw new Error(
    `the bundle still has a relative import, so the dashboard cannot deploy it:\n` +
      leftover.map((l) => `  ${l.replace(/\s+/g, " ").slice(0, 100)}`).join("\n")
  );
}

// 4. …and the remote imports must SURVIVE. An over-greedy IMPORT_RE silently
//    eats the statements above it, and the result still looks like a plausible
//    120 KB file — it just fails at runtime on an undefined createClient.
for (const needed of [
  'from "https://esm.sh/@supabase/supabase-js',
  'from "https://deno.land/std',
]) {
  if (!bundled.includes(needed)) {
    throw new Error(`the bundle lost its remote import (${needed}…) — IMPORT_RE matched too much.`);
  }
}

mkdirSync(dirname(resolve(ROOT, OUT)), { recursive: true });
writeFileSync(resolve(ROOT, OUT), bundled, "utf8");

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`Wrote ${OUT}  (${kb(bundled.length)}, ${bundled.split("\n").length} lines)`);
console.log(`  ${ENTRY} ${kb(entry.length)} + ${MODULE} ${kb(mod.length)} inlined`);
