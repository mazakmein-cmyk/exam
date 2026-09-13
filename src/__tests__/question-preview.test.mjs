/**
 * QUESTION ROW PREVIEW — what the creator reads before clicking into an item.
 *
 * Run with: node src/__tests__/question-preview.test.mjs
 *
 * The bug this exists to stop (reported 2026-09-13, SSC-style DI question):
 * a question whose text carries a 4-row distribution table rendered in the
 * creator's question list as
 *
 *   "…given by the following table. &nbsp;District &nbsp;Percentage of
 *    teachers &nbsp;A &nbsp;20% &nbsp;B &nbsp;25% …"
 *
 * Two separate failures in one line: the entities printed as literal text
 * (tags were stripped by regex, then the result was HTML-escaped by the math
 * renderer), and the table was flattened into the middle of a sentence. The
 * editor right below it showed the same question correctly, which is what made
 * it confusing rather than merely ugly.
 */

import katex from "katex";
import {
  buildQuestionPreview,
  decodeEntities,
  extractImageUrls,
  extractTables,
  previewFallbackLabel,
  unwrapBakedMath,
} from "../lib/questionPreview.js";

// Real KaTeX output, not a hand-written imitation: the bug was in the shape of
// what KaTeX actually emits (a MathML twin, a LaTeX annotation and a glyph
// layer, all inside nested spans), so a simplified fixture would have passed
// against markup the app never stores.
const math = (latex) => katex.renderToString(latex, { throwOnError: false });

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ""}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
  }
}
function ok(value, msg) {
  if (!value) throw new Error(msg || "expected truthy");
}

console.log("\n--- entities are decoded, never printed ---");

test("&nbsp; becomes a space, not the literal text", () => {
  const p = buildQuestionPreview("<p>Rate&nbsp;of&nbsp;interest</p>");
  eq(p.text, "Rate of interest");
});

test("a double-escaped entity decodes exactly once", () => {
  // "&amp;nbsp;" is the literal string "&nbsp;" written by an escaping import.
  eq(decodeEntities("A &amp;nbsp; B"), "A &nbsp; B");
});

test("comparison entities survive as characters", () => {
  const p = buildQuestionPreview("<p>If a &lt; b and b &gt; c</p>");
  eq(p.text, "If a < b and b > c");
});

test("numeric entities decode in both bases", () => {
  eq(decodeEntities("caf&#233; &#x2212; 1"), "café − 1");
});

test("an unknown entity is left alone rather than mangled", () => {
  eq(decodeEntities("&notarealentity; stays"), "&notarealentity; stays");
});

console.log("\n--- tables are lifted out, not flattened into prose ---");

const TABLE_QUESTION =
  "<p>The total number of teachers in 4 districts A,B,C and D of a state is 4500. " +
  "The percentagewise distribution of teachers in the 4 districts is given by the following table.</p>" +
  "<table><tbody>" +
  "<tr><td>&nbsp;District</td><td>&nbsp;Percentage of teachers</td></tr>" +
  "<tr><td>&nbsp;A</td><td>&nbsp;20%</td></tr>" +
  "<tr><td>&nbsp;B</td><td>&nbsp;25%</td></tr>" +
  "</tbody></table>" +
  "<p>The total number of female teachers in all the districts is what percentage of the total number of male teachers?</p>";

test("no table cell leaks into the preview line", () => {
  const p = buildQuestionPreview(TABLE_QUESTION);
  ok(!p.text.includes("Percentage of teachers"), `table content leaked: ${p.text}`);
  ok(!p.text.includes("20%"), `table content leaked: ${p.text}`);
  ok(!p.text.includes("&nbsp;"), `entity leaked: ${p.text}`);
});

test("the prose on both sides of the table is kept and stays separated", () => {
  const p = buildQuestionPreview(TABLE_QUESTION);
  ok(p.text.startsWith("The total number of teachers in 4 districts"), p.text);
  ok(p.text.includes("following table. The total number of female teachers"), `sentences ran together: ${p.text}`);
});

test("the table is reported so the row can show a chip", () => {
  eq(buildQuestionPreview(TABLE_QUESTION).hasTable, true);
  eq(buildQuestionPreview("<p>No table here</p>").hasTable, false);
});

console.log("\n--- structure becomes whitespace, never a run-on ---");

test("block boundaries separate words", () => {
  eq(buildQuestionPreview("<p>First.</p><p>Second.</p>").text, "First. Second.");
});

test("list items do not concatenate", () => {
  eq(buildQuestionPreview("<ul><li>alpha</li><li>beta</li></ul>").text, "alpha beta");
});

test("<br> is a space", () => {
  eq(buildQuestionPreview("Line one<br>Line two").text, "Line one Line two");
});

test("images are dropped from the text but flagged", () => {
  const p = buildQuestionPreview('<p>Study the graph.</p><img src="x.png">');
  eq(p.text, "Study the graph.");
  eq(p.hasImage, true);
});

console.log("\n--- passage questions preview their question half ---");

test("the passage half is not previewed", () => {
  const p = buildQuestionPreview(
    '<div class="passage-section"><p>A long reading passage about bees.</p></div>' +
      '<div class="question-section"><p>What do bees collect?</p></div>',
  );
  eq(p.text, "What do bees collect?");
  eq(p.hasPassage, true);
});

test("a question section containing a nested div is not cut short", () => {
  const p = buildQuestionPreview(
    '<div class="passage-section"><p>Passage.</p></div>' +
      '<div class="question-section"><div>Part one</div> and part two</div>',
  );
  eq(p.text, "Part one and part two");
});

console.log("\n--- empty previews describe what IS there ---");

test("an image-only question says so", () => {
  const p = buildQuestionPreview('<img src="figure.png">');
  eq(p.isEmpty, true);
  eq(previewFallbackLabel(p), "Question with image");
});

test("a table-only question says so", () => {
  const p = buildQuestionPreview("<table><tr><td>1</td></tr></table>");
  eq(p.isEmpty, true);
  eq(previewFallbackLabel(p), "Question with a table");
});

test("null and undefined are empty, not a crash", () => {
  eq(buildQuestionPreview(null).text, "");
  eq(buildQuestionPreview(undefined).isEmpty, true);
});

console.log("\n--- baked KaTeX says the expression once ---");

test("a saved-back KaTeX block becomes its LaTeX, not its three layers", () => {
  // Reported 2026-09-13. The WYSIWYG editor loads the RENDERED question into a
  // contentEditable and saves innerHTML back, so opening and saving a question
  // bakes KaTeX's output into storage. Stripping the tags off that put all
  // three layers in the row at once:
  //   "at 3 3 4 3\\frac{3}{4} 3 4 3 % per annum"
  const stored =
    "<p>For what sum will the simple interest at " +
    math(String.raw`3\frac{3}{4}`) +
    " % per annum be 210 in " +
    math(String.raw`2\frac{1}{3}`) +
    " years?</p>";
  const p = buildQuestionPreview(stored);
  eq(
    p.text,
    "For what sum will the simple interest at $3\\frac{3}{4}$ % per annum be 210 in $2\\frac{1}{3}$ years?",
  );
});

test("no MathML digit twin survives", () => {
  // The MathML twin of "3\\frac{3}{4}" is the loose digits "3 3 4" — the exact
  // noise that made the row unreadable.
  const p = buildQuestionPreview("<p>x = " + math(String.raw`3\frac{3}{4}`) + "</p>");
  eq(p.text, "x = $3\\frac{3}{4}$");
});

test("the LaTeX is left in dollars so the row RENDERS it", () => {
  // Bare LaTeX would print as source; renderMathInText only renders what is
  // delimited, so the dollars are load-bearing.
  const p = buildQuestionPreview("<p>" + math(String.raw`\sqrt{2}`) + "</p>");
  ok(p.text.startsWith("$") && p.text.endsWith("$"), p.text);
});

test("display math survives the same way", () => {
  const p = buildQuestionPreview(
    "<p>Solve " + katex.renderToString(String.raw`a^2+b^2`, { displayMode: true, throwOnError: false }) + "</p>",
  );
  eq(p.text, "Solve $a^2+b^2$");
});

test("entities inside the annotation are decoded, not printed", () => {
  // KaTeX escapes "<" in the annotation it writes.
  const p = buildQuestionPreview("<p>" + math(String.raw`a<b`) + "</p>");
  eq(p.text, "a<b");
});

test("nested spans do not close the block early", () => {
  // A non-greedy </span> match would end the KaTeX block at its first inner
  // span and spill the whole glyph layer into the prose.
  const p = buildQuestionPreview("<p>before " + math(String.raw`\frac{1}{2}`) + " after</p>");
  eq(p.text, "before $\\frac{1}{2}$ after");
});

test("a bare MathML twin with no KaTeX wrapper is handled too", () => {
  const p = buildQuestionPreview(
    '<p>v = <math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow><mn>1</mn></mrow>' +
      '<annotation encoding="application/x-tex">u+at</annotation></semantics></math></p>',
  );
  eq(p.text, "v = u+at");
});

test("a KaTeX block with no annotation falls back to its glyphs", () => {
  const p = buildQuestionPreview(
    '<p>x = <span class="katex"><span class="katex-mathml"><math><mn>9</mn></math></span>' +
      '<span class="katex-html"><span class="base">9</span></span></span></p>',
  );
  eq(p.text, "x = 9");
});

test("truncated KaTeX markup does not eat the rest of the question", () => {
  const p = buildQuestionPreview(
    '<p>a <span class="katex"><span class="katex-mathml"><math><semantics>' +
      '<annotation encoding="application/x-tex">z</annotation></semantics></math></span>',
  );
  eq(p.text, "a z");
});

test("text with no math is returned untouched by the unwrapper", () => {
  eq(unwrapBakedMath("<p>plain</p>"), "<p>plain</p>");
});

console.log("\n--- the insert-formula wrapper is read at its source ---");

// Exactly what RichTextEditor.handleInsertFormula writes into the content.
const inserted = (latex, rendered) =>
  '&nbsp;<span contenteditable="false" data-latex="' +
  latex.replace(/"/g, "&quot;") +
  '" class="math-formula">' +
  (rendered === undefined ? math(latex) : rendered) +
  "</span>&nbsp;";

test("an inserted formula previews as the LaTeX the creator typed", () => {
  const p = buildQuestionPreview("<p>Area is " + inserted(String.raw`\pi r^2`) + "square units</p>");
  eq(p.text, "Area is $\\pi r^2$ square units");
});

test("the wrapper wins over the annotation, so a KaTeX ERROR still previews", () => {
  // throwOnError:false makes KaTeX emit a .katex-error span with no annotation
  // and no MathML — the block alone carries nothing worth showing, but the
  // wrapper still knows what the creator typed.
  const broken = String.raw`\frac{3`;
  const rendered = katex.renderToString(broken, { throwOnError: false });
  ok(rendered.includes("katex-error"), "expected KaTeX to report a parse error");
  const p = buildQuestionPreview("<p>x = " + inserted(broken, rendered) + "</p>");
  eq(p.text, "x = $\\frac{3$");
});

test("escaped quotes in data-latex are decoded", () => {
  const p = buildQuestionPreview('<p><span data-latex="a&quot;b" class="math-formula">x</span></p>');
  eq(p.text, 'a"b');
});

test("the padding spaces around an inserted formula collapse", () => {
  const p = buildQuestionPreview("<p>a" + inserted(String.raw`x`) + "b</p>");
  eq(p.text, "a x b");
});

console.log("\n--- LaTeX with nothing to typeset is not sent to the renderer ---");

// Dollars are a claim, and the math renderer audits it: "$" is a currency sign
// far more often than a delimiter, so lib/renderMath.ts refuses a segment with
// no math signal in it. Wrapping such a source in dollars anyway put the
// DOLLARS on screen — the row read "resistance is $10$ here".

test("a bare number previews as the number, not as $10$", () => {
  const p = buildQuestionPreview("<p>resistance is " + inserted("10") + "here</p>");
  eq(p.text, "resistance is 10 here");
});

test("a formula whose backslash was lost upstream still reads", () => {
  // Reported 2026-09-13: an "\\Omega" that reached the database as "Omega".
  // The row cannot repair that, but it must not add "$" to the wreckage.
  const p = buildQuestionPreview("<p>its resistance is " + inserted("8 Omega") + "and</p>");
  eq(p.text, "its resistance is 8 Omega and");
});

test("real LaTeX still goes to the renderer in dollars", () => {
  for (const latex of [String.raw`3\frac{3}{4}`, String.raw`x^2`, String.raw`a_1`, String.raw`\sqrt{2}`]) {
    const p = buildQuestionPreview("<p>" + inserted(latex) + "</p>");
    eq(p.text, "$" + latex + "$");
  }
});

test("no preview ever shows a stray dollar sign around plain content", () => {
  for (const latex of ["10", "8 Omega", "abc", "50 percent"]) {
    const p = buildQuestionPreview("<p>x " + inserted(latex) + " y</p>");
    ok(!p.text.includes("$"), `dollars leaked for "${latex}": ${p.text}`);
  }
});

console.log("\n--- the chips hand their content to the popup ---");

// The row hides a table behind a chip, and the chip opens a dialog that shows
// it. Those are two halves of one promise: whatever the preview CUT OUT is
// exactly what the popup has to be able to PUT BACK. A chip that opens an
// empty dialog is worse than no chip at all.

test("what the preview removes is what the popup receives", () => {
  const p = buildQuestionPreview(TABLE_QUESTION);
  eq(p.hasTable, true);
  eq(p.tables.length, 1);
  ok(p.tables[0].startsWith("<table"), p.tables[0].slice(0, 40));
  ok(p.tables[0].endsWith("</table>"), p.tables[0].slice(-40));
  // every cell the line dropped is inside the markup the chip hands over
  for (const cell of ["District", "Percentage of teachers", "20%", "25%"]) {
    ok(!p.text.includes(cell), `"${cell}" leaked into the preview line`);
    ok(p.tables[0].includes(cell), `"${cell}" is missing from the popup's copy`);
  }
});

test("a question with two tables hands over both", () => {
  const two = "<p>a</p><table><tr><td>1</td></tr></table><p>b</p><table><tr><td>2</td></tr></table>";
  const p = buildQuestionPreview(two);
  eq(p.tables.length, 2);
  eq(p.text, "a b");
});

test("no table means no empty popup", () => {
  const p = buildQuestionPreview("<p>Just prose.</p>");
  eq(p.hasTable, false);
  eq(p.tables.length, 0);
});

test("the chip flag and the extracted list can never disagree", () => {
  // Both are derived from the same regex, so this holds by construction —
  // the test is here so a future edit cannot quietly split them.
  for (const html of [TABLE_QUESTION, "<p>none</p>", "<table><tr><td>x</td></tr></table>"]) {
    const p = buildQuestionPreview(html);
    eq(p.hasTable, p.tables.length > 0);
    eq(p.hasImage, p.imageUrls.length > 0);
  }
});

test("inline image srcs are collected for the popup", () => {
  const p = buildQuestionPreview(
    '<p>See <img src="a.png"> and <img src="b.png"></p>',
  );
  eq(p.imageUrls.join(","), "a.png,b.png");
});

test("the same figure is not shown twice", () => {
  // A passage image is often repeated inline; the popup should page through
  // pictures, not duplicates.
  const p = buildQuestionPreview(
    '<p><img src="figure.png" class="passage-image"> text <img src="figure.png"></p>',
  );
  eq(p.imageUrls.length, 1);
});

test("entities in a src are decoded so the URL resolves", () => {
  const p = buildQuestionPreview('<p><img src="x.png?a=1&amp;b=2"></p>');
  eq(p.imageUrls[0], "x.png?a=1&b=2");
});

test("the extractors stand alone for callers that have only the html", () => {
  eq(extractTables(TABLE_QUESTION).length, 1);
  eq(extractTables(null).length, 0);
  eq(extractImageUrls('<img src="z.png">')[0], "z.png");
  eq(extractImageUrls(undefined).length, 0);
});

console.log("\n--- math is left for the renderer ---");

test("LaTeX delimiters survive the strip untouched", () => {
  const p = buildQuestionPreview("<p>Find $\\frac{22}{7}$ of the area</p>");
  eq(p.text, "Find $\\frac{22}{7}$ of the area");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
