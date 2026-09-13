/**
 * INLINE MARKDOWN — an asterisk is a question, not just emphasis.
 *
 * Run with: node src/__tests__/inline-markdown-asterisks.test.mjs
 *
 * The bug this exists to stop (reported 2026-09-13, SSC-style reasoning paper):
 *
 *   "…sequentially replace the * signs and balance the given equation.
 *    12 * 3 * 4 = 6 * 8 * 8"
 *
 * The creator's question list renders as plain text and showed every asterisk.
 * The student simulator ran the markdown pass, which paired the asterisks up,
 * ate them and italicised the prose in between — so the candidate was asked to
 * replace signs that were no longer on screen.
 *
 * Both halves matter: the arithmetic must survive, and real `*emphasis*` from
 * an imported paper must still render.
 */

import { applyInlineMarkdown as md } from "../lib/inlineMarkdown.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}
const eq = (got, want, msg) => {
  if (got !== want) throw new Error(`${msg}\n       got:  ${JSON.stringify(got)}\n       want: ${JSON.stringify(want)}`);
};
/** The input must come back byte-for-byte — no tag, no eaten asterisk. */
const keeps = (s) => eq(md(s), s, "content was rewritten");

console.log("\n[1] the reported question survives whole");

test("the full sign-substitution question is untouched", () => {
  const q =
    "Select the correct combination of mathematical signs that can sequentially " +
    "replace the * signs and balance the given equation. 12 * 3 * 4= 6 * 8 * 8";
  keeps(q);
});

test("every asterisk is still present and countable", () => {
  const q = "replace the * signs. 12 * 3 * 4= 6 * 8 * 8";
  eq((md(q).match(/\*/g) || []).length, 5, "an asterisk was eaten");
});

console.log("\n[2] asterisks used as maths never open emphasis");

test("spaced multiplication", () => keeps("12 * 3 * 4 = 6 * 8 * 8"));
test("unspaced multiplication", () => keeps("12*3*4=6*8*8"));
test("algebra between letters", () => keeps("x*y*z is the product"));
test("a lone trailing asterisk", () => keeps("Footnote marker *"));
test("a bare double asterisk", () => keeps("a ** b ** c"));
test("four asterisks make nothing", () => keeps("****"));
test("an asterisk against a bracket close", () => keeps("(3 + 4)* 2 = 14"));
test("Hindi prose with spaced signs", () => keeps("चिह्न * को बदलें। 12 * 3 = 36"));

console.log("\n[3] authored emphasis still renders");

test("*italic*", () => eq(md("this is *important* text"), "this is <em>important</em> text", "italic lost"));
test("**bold**", () => eq(md("this is **important** text"), "this is <strong>important</strong> text", "bold lost"));
test("**bold** at the start of a line", () => eq(md("**Note:** read on"), "<strong>Note:</strong> read on", "bold lost"));
test("bracketed italic", () => eq(md("see (*fig. 2*) below"), "see (<em>fig. 2</em>) below", "italic lost"));
test("italic before a comma", () => eq(md("the *base*, not the height"), "the <em>base</em>, not the height", "italic lost"));
test("italic at the very end", () => eq(md("a *word*"), "a <em>word</em>", "italic lost"));
test("~~strike~~", () => eq(md("the ~~old~~ new value"), "the <del>old</del> new value", "strike lost"));
test("bold and italic in one line", () =>
  eq(md("**A** and *b*"), "<strong>A</strong> and <em>b</em>", "one of the two was lost"));

console.log("\n[4] triple asterisks nest instead of shredding");

test("***bold-italic*** nests cleanly", () => {
  // The old pass produced "<strong>*important</strong>* text" and then an <em>
  // that closed across the </strong> — invalid markup the sanitizer had to
  // rescue. Opening runs may no longer start on another asterisk, so the outer
  // stars now pair with each other.
  eq(md("this is ***important*** text"), "this is <em><strong>important</strong></em> text", "nesting broke");
});

console.log("\n[5] the one shape that stays ambiguous");

test("half-spaced '2 *3* 4' is still read as emphasis — and that is deliberate", () => {
  // This is character-for-character the markdown italic shape: the run opens on
  // a space and closes on one. Nothing in the string says whether a paper meant
  // multiplication or emphasis, so it follows markdown rather than guessing.
  // Rejecting it would need "emphasis must contain a letter", which would eat
  // the far commoner "**+3** marks" in an imported instruction line.
  eq(md("2 *3* 4"), "2 <em>3</em> 4", "the documented ambiguity changed — decide it on purpose");
});

console.log("\n[6] links keep their hardening");

test("a markdown link becomes a safe new-tab anchor", () => {
  const out = md("see [Ohm](https://en.wikipedia.org/wiki/Ohm)");
  eq(
    out,
    'see <a class="text-primary underline hover:text-primary/80" href="https://en.wikipedia.org/wiki/Ohm" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">Ohm</a>',
    "link shape changed",
  );
});

test("an authored anchor is given the link class", () => {
  const out = md('<a href="https://example.com">x</a>');
  if (!out.includes('class="text-primary underline hover:text-primary/80"')) {
    throw new Error(`class not added: ${out}`);
  }
});

console.log("\n[7] markup around the text is not disturbed");

test("HTML passes through", () => keeps("<p>A <b>bold</b> tag and 3 * 4</p>"));
test("a KaTeX-bound math segment keeps its delimiters", () => keeps("$a \\times b$ and 3 * 4"));

console.log("\n" + "─".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
