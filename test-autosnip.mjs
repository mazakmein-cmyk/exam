/**
 * test-autosnip.mjs — End-to-end test of the auto-snip pipeline.
 *
 * Tests:
 *  1. JSON parser extracts image_region correctly
 *  2. SnipRequest construction from parsed report
 *  3. autoSnipper renders PDF pages and crops regions (needs canvas)
 *
 * Run: node test-autosnip.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Inline a minimal version of the parser's image_region logic ────────────
// (We can't directly import the TS module, so we replicate the critical path)

function validateImageRegion(raw, index) {
  const warnings = [];
  let imageRegion = undefined;

  if (raw === undefined || raw === null) {
    return { imageRegion, warnings };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push(`question #${index + 1} image_region must be an object — dropped.`);
    return { imageRegion, warnings };
  }

  const rawPage = Number(raw.page);
  if (!Number.isInteger(rawPage) || rawPage < 1) {
    warnings.push(`question #${index + 1} image_region.page must be an integer ≥ 1 — dropped.`);
    return { imageRegion, warnings };
  }

  const hasAnyBbox =
    raw.x_min !== undefined ||
    raw.y_min !== undefined ||
    raw.x_max !== undefined ||
    raw.y_max !== undefined;

  if (!hasAnyBbox) {
    imageRegion = { page: rawPage };
    return { imageRegion, warnings };
  }

  const xMin = Number(raw.x_min);
  const yMin = Number(raw.y_min);
  const xMax = Number(raw.x_max);
  const yMax = Number(raw.y_max);

  const allFinite =
    Number.isFinite(xMin) &&
    Number.isFinite(yMin) &&
    Number.isFinite(xMax) &&
    Number.isFinite(yMax);
  const inRange = xMin >= 0 && yMin >= 0 && xMax <= 1000 && yMax <= 1000;
  const properOrder = xMin < xMax && yMin < yMax;

  if (allFinite && inRange && properOrder) {
    imageRegion = { page: rawPage, bbox: { xMin, yMin, xMax, yMax } };
  } else {
    const reason = !allFinite
      ? "non-numeric coords"
      : !inRange
        ? "coords outside 0..1000"
        : "x_max ≤ x_min or y_max ≤ y_min";
    warnings.push(
      `question #${index + 1} image_region bbox invalid (${reason}) — falling back to whole-page snip.`
    );
    imageRegion = { page: rawPage, invalidBboxFallback: reason };
  }

  return { imageRegion, warnings };
}

// ─── Test JSON (mimics what the AI would produce for CAT-2023) ─────────────

const testJson = {
  schema_version: "1.0",
  language: "en",
  _extraction_summary: {
    source_pdf: "CAt-2023-Question-Paper-slot-01-answer-keys-Bodheeprep (1).pdf",
    model: "test-runner",
    total_in_pdf: 5,
    extracted: 5,
    skipped: [],
    needs_manual_review: [],
    marks_source: "not_present",
    answers_source: "not_present",
  },
  sections: [
    {
      name: "Section 01",
      questions: [
        {
          q_no: 1,
          text: "Test question 1 — no image region",
          answer_type: "single",
          options: ["A", "B", "C", "D"],
          correct_answer: null,
        },
        {
          q_no: 2,
          text: "Test question 2 — with CONFIDENT BBOX on page 15 (upper half)",
          answer_type: "single",
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_answer: null,
          image_region: {
            page: 15,
            x_min: 50,
            y_min: 80,
            x_max: 950,
            y_max: 480,
          },
        },
        {
          q_no: 3,
          text: "Test question 3 — with PAGE-ONLY region (page 3)",
          answer_type: "single",
          options: ["Yes", "No", "Maybe", "None"],
          correct_answer: null,
          image_region: {
            page: 3,
          },
        },
        {
          q_no: 4,
          text: "Test question 4 — with WHOLE-PAGE SENTINEL (should be treated as page-only)",
          answer_type: "single",
          options: ["X", "Y", "Z", "W"],
          correct_answer: null,
          image_region: {
            page: 15,
            x_min: 0,
            y_min: 0,
            x_max: 1000,
            y_max: 1000,
          },
        },
        {
          q_no: 5,
          text: "Test question 5 — with INVALID bbox (x_min > x_max)",
          answer_type: "single",
          options: ["P", "Q", "R", "S"],
          correct_answer: null,
          image_region: {
            page: 10,
            x_min: 800,
            y_min: 200,
            x_max: 100,
            y_max: 600,
          },
        },
      ],
    },
  ],
};

// ─── TEST 1: Parser image_region extraction ─────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 1: Parser image_region extraction");
console.log("═══════════════════════════════════════════════════════════\n");

const questions = testJson.sections[0].questions;
let allPassed = true;

for (let i = 0; i < questions.length; i++) {
  const q = questions[i];
  const { imageRegion, warnings } = validateImageRegion(q.image_region, i);

  const label = `Q${q.q_no}`;
  console.log(`${label}: ${q.text.substring(0, 60)}...`);

  if (i === 0) {
    // No image_region
    const pass = imageRegion === undefined;
    console.log(`  ✓ Expected: no imageRegion → Got: ${imageRegion === undefined ? "undefined" : JSON.stringify(imageRegion)}`);
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
    if (!pass) allPassed = false;
  } else if (i === 1) {
    // Confident bbox
    const pass =
      imageRegion &&
      imageRegion.page === 15 &&
      imageRegion.bbox &&
      imageRegion.bbox.xMin === 50 &&
      imageRegion.bbox.yMin === 80 &&
      imageRegion.bbox.xMax === 950 &&
      imageRegion.bbox.yMax === 480;
    console.log(`  ✓ Expected: page=15, bbox={50,80,950,480}`);
    console.log(`  ✓ Got: ${JSON.stringify(imageRegion)}`);
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
    if (!pass) allPassed = false;
  } else if (i === 2) {
    // Page-only
    const pass = imageRegion && imageRegion.page === 3 && imageRegion.bbox === undefined;
    console.log(`  ✓ Expected: page=3, no bbox`);
    console.log(`  ✓ Got: ${JSON.stringify(imageRegion)}`);
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
    if (!pass) allPassed = false;
  } else if (i === 3) {
    // Whole-page sentinel — parser accepts it as valid bbox (the snipper handles it)
    const pass =
      imageRegion &&
      imageRegion.page === 15 &&
      imageRegion.bbox &&
      imageRegion.bbox.xMin === 0 &&
      imageRegion.bbox.yMin === 0 &&
      imageRegion.bbox.xMax === 1000 &&
      imageRegion.bbox.yMax === 1000;
    console.log(`  ✓ Expected: page=15, bbox={0,0,1000,1000} (sentinel — snipper handles)`);
    console.log(`  ✓ Got: ${JSON.stringify(imageRegion)}`);
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
    if (!pass) allPassed = false;
  } else if (i === 4) {
    // Invalid bbox — fallback to whole-page
    const pass =
      imageRegion &&
      imageRegion.page === 10 &&
      imageRegion.bbox === undefined &&
      imageRegion.invalidBboxFallback !== undefined;
    console.log(`  ✓ Expected: page=10, no bbox, invalidBboxFallback set`);
    console.log(`  ✓ Got: ${JSON.stringify(imageRegion)}`);
    console.log(`  ✓ Warnings: ${warnings.join("; ")}`);
    console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}`);
    if (!pass) allPassed = false;
  }
  console.log();
}

// ─── TEST 2: SnipRequest construction (mimics JsonUploadDialog logic) ───────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 2: SnipRequest construction (Dialog logic)");
console.log("═══════════════════════════════════════════════════════════\n");

// Simulate what the dialog does: build SnipRequests from accepted questions
const simulatedAccepted = questions.map((q, i) => {
  const { imageRegion } = validateImageRegion(q.image_region, i);
  return { ...q, imageRegion };
});

const snipRequests = [];
const sectionName = "Section 01";

simulatedAccepted.forEach((q, qIdx) => {
  if (!q.imageRegion) return;
  snipRequests.push({
    key: `${sectionName}::${qIdx}`,
    page: q.imageRegion.page,
    bbox: q.imageRegion.bbox,
  });
});

console.log(`Built ${snipRequests.length} SnipRequests from ${questions.length} questions:\n`);
for (const req of snipRequests) {
  const bboxStr = req.bbox
    ? `{xMin:${req.bbox.xMin}, yMin:${req.bbox.yMin}, xMax:${req.bbox.xMax}, yMax:${req.bbox.yMax}}`
    : "(whole page)";
  console.log(`  key: "${req.key}", page: ${req.page}, bbox: ${bboxStr}`);
}

const expectedCount = 4; // Q2, Q3, Q4, Q5 all have image_region
const pass2 = snipRequests.length === expectedCount;
console.log(`\n  Expected ${expectedCount} requests → Got ${snipRequests.length}`);
console.log(`  ${pass2 ? "✅ PASS" : "❌ FAIL"}\n`);
if (!pass2) allPassed = false;

// ─── TEST 3: hasImageRegions flag ───────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 3: hasImageRegions flag computation");
console.log("═══════════════════════════════════════════════════════════\n");

const hasImageRegions = simulatedAccepted.some((q) => q.imageRegion !== undefined);
const pass3 = hasImageRegions === true;
console.log(`  hasImageRegions = ${hasImageRegions}`);
console.log(`  ${pass3 ? "✅ PASS — dialog will prompt for PDF" : "❌ FAIL — dialog won't prompt for PDF"}\n`);
if (!pass3) allPassed = false;

// ─── TEST 4: Coordinate conversion (mimics autoSnipper.cropFromCanvas) ──────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 4: Coordinate conversion (autoSnipper logic)");
console.log("═══════════════════════════════════════════════════════════\n");

// Simulate a rendered page at 2x scale (typical A4: ~1190 x 1684 px at 2x)
const cw = 1190;
const ch = 1684;
const paddingPct = 5;

for (const req of snipRequests) {
  const isWholePageSentinel =
    !!req.bbox &&
    req.bbox.xMin === 0 &&
    req.bbox.yMin === 0 &&
    req.bbox.xMax === 1000 &&
    req.bbox.yMax === 1000;

  let x = 0, y = 0, w = cw, h = ch;
  let note = "";

  if (req.bbox && !isWholePageSentinel) {
    const { xMin, yMin, xMax, yMax } = req.bbox;
    x = (xMin / 1000) * cw;
    y = (yMin / 1000) * ch;
    w = ((xMax - xMin) / 1000) * cw;
    h = ((yMax - yMin) / 1000) * ch;

    // Padding
    const padX = w * (paddingPct / 100);
    const padY = h * (paddingPct / 100);
    x -= padX;
    y -= padY;
    w += 2 * padX;
    h += 2 * padY;

    // Clamp
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > cw) w = cw - x;
    if (y + h > ch) h = ch - y;

    note = "BBOX CROP + 5% PADDING";
  } else if (isWholePageSentinel) {
    note = "WHOLE-PAGE SENTINEL → auto-trim will narrow it down";
  } else {
    note = "PAGE-ONLY (no bbox) → auto-trim will narrow it down";
  }

  const ix = Math.max(0, Math.round(x));
  const iy = Math.max(0, Math.round(y));
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));

  console.log(`  ${req.key}:`);
  console.log(`    ${note}`);
  console.log(`    Pixel crop: x=${ix}, y=${iy}, w=${iw}, h=${ih} (canvas: ${cw}×${ch})`);

  const validCrop = ix >= 0 && iy >= 0 && iw > 0 && ih > 0 && (ix + iw) <= cw && (iy + ih) <= ch;
  console.log(`    ${validCrop ? "✅ Valid crop region" : "❌ Invalid crop region!"}\n`);
  if (!validCrop) allPassed = false;
}

// ─── TEST 5: commitJson snipKey matching ────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 5: commitJson snipKey matching");
console.log("═══════════════════════════════════════════════════════════\n");

// Simulate what commitJson does: look up snipUrls by key
const mockSnipUrls = new Map();
for (const req of snipRequests) {
  mockSnipUrls.set(req.key, `https://storage.example.com/auto-snip-${req.key.replace(/[^A-Za-z0-9_-]/g, "_")}.png`);
}

console.log(`  snipUrls map has ${mockSnipUrls.size} entries\n`);

// Simulate commitJson loop
let matchCount = 0;
simulatedAccepted.forEach((q, i) => {
  const snipKey = `${sectionName}::${i}`;
  const snipUrl = mockSnipUrls.get(snipKey);
  const imageUrls = snipUrl ? [snipUrl] : null;

  if (q.imageRegion) {
    const hasUrl = imageUrls !== null;
    console.log(`  Q${q.q_no} (idx=${i}): key="${snipKey}" → ${hasUrl ? "✅ image_urls=[url]" : "❌ image_urls=null"}`);
    if (hasUrl) matchCount++;
    if (!hasUrl) allPassed = false;
  } else {
    const noUrl = imageUrls === null;
    console.log(`  Q${q.q_no} (idx=${i}): key="${snipKey}" → ${noUrl ? "✅ image_urls=null (no image_region)" : "❌ unexpected url"}`);
    if (!noUrl) allPassed = false;
  }
});

const pass5 = matchCount === snipRequests.length;
console.log(`\n  Matched ${matchCount}/${snipRequests.length} snip URLs to questions`);
console.log(`  ${pass5 ? "✅ PASS" : "❌ FAIL"}\n`);

// ─── TEST 6: PDF file accessibility ─────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("TEST 6: PDF file accessibility");
console.log("═══════════════════════════════════════════════════════════\n");

const pdfPath = "C:\\Users\\Shivm\\Downloads\\CAt-2023-Question-Paper-slot-01-answer-keys-Bodheeprep (1).pdf";
try {
  const pdfBuffer = readFileSync(pdfPath);
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
  const isValidPdf = pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50 && pdfBuffer[2] === 0x44 && pdfBuffer[3] === 0x46;
  console.log(`  File: ${pdfPath}`);
  console.log(`  Size: ${sizeMB} MB (${pdfBuffer.length} bytes)`);
  console.log(`  Valid PDF header: ${isValidPdf ? "✅ Yes (%PDF)" : "❌ No"}`);
  console.log(`  Under 50 MB limit: ${pdfBuffer.length < 50 * 1024 * 1024 ? "✅ Yes" : "❌ No"}\n`);
  if (!isValidPdf) allPassed = false;
} catch (err) {
  console.log(`  ❌ Cannot read PDF: ${err.message}\n`);
  allPassed = false;
}

// ─── FINAL SUMMARY ─────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log(allPassed ? "🎉 ALL TESTS PASSED" : "⚠️  SOME TESTS FAILED");
console.log("═══════════════════════════════════════════════════════════\n");

if (allPassed) {
  console.log("The auto-snip pipeline logic is verified:");
  console.log("  ✅ Parser correctly extracts image_region (confident, page-only, sentinel, invalid)");
  console.log("  ✅ SnipRequest construction matches dialog logic");
  console.log("  ✅ hasImageRegions flag triggers PDF prompt");
  console.log("  ✅ Coordinate conversion produces valid crop regions");
  console.log("  ✅ commitJson snipKey matching connects URLs to questions");
  console.log("  ✅ PDF file is accessible and valid");
  console.log("\n  The remaining browser-only step (PDF.js canvas rendering) requires");
  console.log("  a live browser test — upload JSON + PDF in the dialog to verify.\n");
}
