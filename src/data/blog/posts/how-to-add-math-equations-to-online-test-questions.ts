import type { BlogPost } from "@/data/blogPosts";

const post: BlogPost = {
  slug: "how-to-add-math-equations-to-online-test-questions",
  title: "How to Add Math Equations (LaTeX) to Online Test Questions",
  metaTitle: "LaTeX in an Online Quiz: Add Math to Test Questions | MockSetu",
  metaDescription:
    "Type LaTeX in the question editor and it renders with KaTeX. The constructs an entrance paper needs, the doubled-backslash trap in JSON import, and when to snip instead.",
  keywords:
    "latex in online quiz, add math equations to online test, katex online test, latex in json import, math questions online test maker, how to write fractions in an online quiz, equation editor for online exams, latex backslash json escape",
  excerpt:
    "Equations are the part of a physics or maths paper that stalls halfway. Type the LaTeX, double every backslash inside JSON exactly once, and snip the expressions that are not worth the markup.",
  publishedAt: "2026-10-03",
  updatedAt: "2026-10-03",
  readingMinutes: 10,
  category: "For Educators",
  tags: [
    // Routes the end-of-article CTA to /for-creators. See CLUSTER_CTAS in
    // src/pages/BlogPost.tsx — without it this article funnels a paper-setter
    // to a student pillar.
    "For Creators",
    "Question Formatting",
    "LaTeX",
    "KaTeX",
    "JSON import",
    "maths papers",
  ],
  hero: {
    eyebrow: "Question Formatting",
    h1: "How to Add Math Equations (LaTeX) to Online Test Questions",
    lede: "Equations are the part of digitising a physics or maths paper that stalls. Type the LaTeX, double the backslashes inside JSON exactly once, and snip the ones that are not worth the fight.",
  },
  content: [
    {
      type: "p",
      text: "Type the equation as LaTeX and it renders as typeset maths on the student's screen. In the MockSetu question editor you can write it inline between dollar signs — $x^2 + y^2 = r^2$ — or open the maths and formula button, build the expression against a live preview, and insert it. KaTeX does the rendering, so a fraction arrives stacked and a square root arrives with a radical over it, not as a slash and the letters sqrt.",
    },
    {
      type: "p",
      text: "The LaTeX itself is the easy half. The half that wrecks maths papers is JSON. If you are importing a whole paper rather than typing it question by question, every backslash in a LaTeX command has to be doubled inside the JSON string. Doubled once is the rule. The trap is the file doubled twice, because that is the one that parses cleanly and reports success: the platform unpicks it at several points, but it is the error you want to catch in the file rather than leave to the repairs.",
    },
    {
      type: "p",
      text: "If the paper is still a PDF and you have not decided how it becomes a test, start with [how a question paper becomes a computer-based test](/blog/pdf-to-cbt-how-a-question-paper-becomes-a-computer-based-test) and come back when the maths is all that is left.",
    },
    {
      type: "h2",
      text: "Where the Equation Actually Goes In",
    },
    {
      type: "p",
      text: "There are two routes into a question and they behave differently. Typing by hand, you get a rich text editor with a maths and formula button: a panel with a live preview, quick-insert templates for the common shapes, and a searchable formula library to pull a standard expression from instead of recalling its markup. What you insert is fixed into the question as finished maths, which is why nothing can re-escape it later.",
    },
    {
      type: "p",
      text: "Importing by JSON, the maths stays as raw LaTeX inside the string and is rendered when the question is displayed. MockSetu's extraction prompt, published on the [JSON upload guide](/json-upload-guide), tells the assistant to emit maths exactly that way. Four delimiter styles work: a single dollar pair for inline maths, a double dollar pair for a centred display equation on its own line, and the \\( ... \\) and \\[ ... \\] forms if your source already uses them. A lone dollar sign used as currency is left alone, so a passage about prices does not quietly turn itself into algebra.",
    },
    {
      type: "h2",
      text: "The LaTeX You Actually Need for an Entrance Paper",
    },
    {
      type: "p",
      text: "Nobody needs all of LaTeX. A physics, chemistry or maths paper runs on a short list of constructs. Here they are as you would type them in the editor, with a single backslash; in a JSON file every one of those backslashes doubles.",
    },
    {
      type: "ul",
      items: [
        "Fractions: \\frac{a}{b}. Nesting is fine — \\frac{1}{1 + \\frac{1}{x}} — and \\dfrac forces the taller display-size fraction inside a sentence.",
        "Roots: \\sqrt{2} for a square root, \\sqrt[3]{x} for a cube root. The square bracket before the brace carries the index.",
        "Powers and subscripts: x^2 for a single character, x^{10} the moment there is more than one, then v_0 and a_{net} the same way with an underscore. The braces are what people forget: x^10 renders as x to the power one followed by a stray zero.",
        "Integrals, sums and limits: \\int_0^1 x^2 \\, dx, \\sum_{n=1}^{\\infty}, \\lim_{x \\to 0}. The \\, is a thin space before the dx — the difference between a typeset integral and a cramped one.",
        "Vectors and units: \\vec{F}, \\hat{i}, and units set upright with \\text{m s}^{-2} so the letters do not come out italic like variables.",
        "Greek and operators: \\alpha, \\theta, \\mu, \\Delta, \\pi, \\pm, \\times, \\approx, \\leq, \\geq, \\rightarrow, and 30^{\\circ} for a degree.",
        "Chemistry: H_2SO_4, Fe^{3+}, and \\rightleftharpoons for an equilibrium arrow. A full structural formula is not an equation — see the snipping rule below.",
        "Matrices and cases: \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} for a 2x2 matrix, \\begin{cases} ... \\end{cases} for a piecewise definition. Note the doubled backslash acting as a row separator: a genuine LaTeX row break, not a JSON escape. That collision is why the next section exists.",
      ],
    },
    {
      type: "h2",
      text: "The Doubled Backslash: Double It Once, Never Twice",
    },
    {
      type: "p",
      text: "JSON strings use the backslash for escape sequences of their own: backslash-n is a newline, backslash-t a tab, backslash-f a form feed. So an assistant that writes \\frac{a}{b} into a JSON string with one backslash hands a strict parser a form feed followed by the letters rac{a}{b}. Hence the doubling rule — \\frac{a}{b} is written \\\\frac{a}{b} — and hence the fact that a correct maths JSON file looks over-escaped. The parser eats one backslash and gives the other to the renderer.",
    },
    {
      type: "p",
      text: "MockSetu's importer assumes assistants will get this wrong, so it repairs the common case before the file is parsed at all: a lone backslash in front of a letter is re-doubled, and the import preview says so under the label \"LaTeX backslashes auto-doubled\". Four letters are left alone, because \\n, \\r, \\t and \\u are escapes JSON itself owns — so \\nu, \\times, \\text and \\rightarrow arrive with the backslash eaten into a control character instead. The renderer restores most of those at display time. The exception is a \\n inside a display equation, where a line break before a letter is ordinary formatting rather than a broken command, so a \\nu there stays a stray u. Under-escaping is a nuisance, not where most of your checking time should go.",
    },
    {
      type: "p",
      text: "The opposite error is the quieter one, because the file still parses and the import still reports success. An assistant that doubled the backslashes correctly, then applied the rule a second time, emits four where there should be two. Left alone, that breaks in two different ways. One is loud: an environment like \\begin{cases} never opens and the renderer refuses the segment outright. The other is silent — a twice-doubled integral renders as a line break and three italic letters, i, n and t, with no integral sign and nothing to throw an error. MockSetu undoes the extra level at three points: at import when the whole paper is uniformly doubled, at display time for an expression with no matrix or cases machinery that could own a double backslash legitimately, and as a last resort on any segment KaTeX has already refused. Between them they put the integral sign back and open the cases brace, which is why over-escaping is usually a repair rather than a disaster. What none of them can do is invent a formula: if the collapsed version still will not parse, the raw string is what the student reads.",
    },
    {
      type: "p",
      text: "A model that handled the verbal reasoning section flawlessly can still mangle the physics and report the file as ready. The published extraction prompt asks for exactly one level of doubling, and sets the right and wrong spellings side by side; the guide's troubleshooting table tells you what to send back to the chat that produced the file, and the rest of that route's failure modes are in [turning a question paper into import-ready JSON](/blog/how-to-use-chatgpt-to-convert-a-question-paper-into-import-ready-json).",
    },
    {
      type: "quote",
      text: "Doubled once is correct and looks wrong. Doubled twice looks much the same to you, and leaves the renderer guessing which backslashes you meant.",
    },
    {
      type: "h2",
      text: "A Two-Minute Check Before You Upload",
    },
    {
      type: "p",
      text: "Run this on any paper with maths in it. It costs less than importing twice, and it catches the failure hardest to spot afterwards: maths that renders in the stem and not in the options.",
    },
    {
      type: "ul",
      items: [
        "Search the saved file for frac, sqrt, int and begin, and look at what sits in front of each. Two backslashes is correct. Four means the file was doubled twice — re-emit it rather than hand-patch, because a model applies the rule across the whole file. Check what sits around each one too: maths with no delimiters around it is printed as plain text however well it is escaped.",
        "Save it as UTF-8 and confirm it parses in an editor that validates JSON. The importer repairs the usual Windows-1252 mangling of a degree sign or a Greek letter, but a stray quote breaks the paper as completely as a backslash.",
        "Read the repair list on the import preview before you confirm. It names what was auto-fixed — backslashes doubled, double-escaped backslashes collapsed, encoding repaired — and it is the only place the file admits it needed help.",
        "Then open the three or four most equation-heavy questions and read them on screen. Literal words like frac or sqrt, a dollar sign showing in the text, or an integral that has become three italic letters all mean the markup did not survive.",
        "Read the options, not just the stem. Unrendered maths hides in option C, because nobody scrolls past the question text when they are spot-checking late.",
      ],
    },
    {
      type: "h2",
      text: "When to Snip the Equation Instead of Typing It",
    },
    {
      type: "p",
      text: "LaTeX is not always the right answer, and insisting on typing every symbol is the surest way to leave a paper half-built. You can snip a question, an option or a passage straight out of the PDF as an image instead of retyping it, which makes the markup fight optional — it is one of the routes in [converting a PDF question paper into an online test](/blog/convert-pdf-question-paper-to-online-test). The decision rule:",
    },
    {
      type: "ul",
      items: [
        "Type it when the expression is a line of algebra, a fraction, a root, an integral, a small matrix, or anything you could read aloud in one sentence. Typed maths reflows on a narrow phone and stays sharp at any zoom level.",
        "Snip it when it is a chemical structure, a circuit, a ray diagram, a graph, a geometry figure, a long multi-line derivation or a match-the-column grid. Those are not equations; they are pictures that happen to contain symbols.",
        "Snip it the moment you have spent ninety seconds on a single expression. A finished paper with snipped images in it is worth more than an unfinished one with immaculate markup.",
        "Type it when the same expression recurs across several questions, because a typed version survives being edited next year in a way an image does not.",
        "Snip the whole question rather than only the equation when the stem and the formula are tangled together, because a half-snipped question reads worse than a fully snipped one. Never snip print that is already dense: a student on a phone cannot zoom out of a bad scan, so type that one even if it hurts.",
      ],
    },
    {
      type: "h2",
      text: "What LaTeX Does Not Solve",
    },
    {
      type: "p",
      text: "Rendering an equation is not the same as grading one, and a few limits are worth knowing early. The JSON importer leaves numeric, TITA and match-the-column questions for manual entry — the ones that do not reduce to picking one option from a list. On a paper built around [numerical value questions](/blog/jee-main-numerical-value-questions), that is a block you add by hand, with their LaTeX typed the same way as anywhere else.",
    },
    {
      type: "p",
      text: "Because a numeric answer is a value the student types, the key is a number and the LaTeX belongs in the stem, never in the answer field. There is no subjective or essay grading either: you can ask for the value of an integral, not for the derivation that produced it. And the renderer is not a solver — it checks that your expression is syntactically valid, not that it is mathematically sensible. A wrong formula renders beautifully.",
    },
    {
      type: "h2",
      text: "Check It on the Screen the Student Will Use",
    },
    {
      type: "p",
      text: "A fraction that looks correct in the editor can still break on a five-inch phone: the editing pane is wider than the question area, and a long display equation does not wrap the way a sentence does. Preview your own exam — nothing is recorded — and look at the longest equation on a phone as well as a laptop. If a line of algebra runs off the edge, split it onto its own line as a display equation or snip it as an image. A student sitting a [full-length JEE Main mock](/mock-test/jee-main) on a phone reads your maths in a narrow column.",
    },
    {
      type: "p",
      text: "Bilingual papers deserve one extra pass. The maths is identical in the English and Hindi versions and the surrounding sentence is not, so an equation that fitted on one line in English can wrap mid-expression in Hindi. Toggle the language on the preview and read the same three questions again.",
    },
    {
      type: "h2",
      text: "The Order of Operations That Works",
    },
    {
      type: "p",
      text: "Putting it together, for a full paper with heavy maths in two of the three subjects:",
    },
    {
      type: "ul",
      items: [
        "Run the extraction prompt from the JSON upload guide in whichever assistant you already use.",
        "Before uploading, run the backslash search above on the saved file. Two minutes, every time.",
        "Upload, read the preview's repair list, then read the maths-heavy questions on screen rather than trusting that the import reported success.",
        "Fix the stragglers by hand in the editor, using the formula panel rather than retyping markup from memory.",
        "Add the numeric and match-the-column questions by hand, since the importer does not take them.",
        "Snip whatever is still fighting you — structures, diagrams, one hostile derivation — and stop negotiating with it.",
        "Set the marks for correct, wrong and unattempted, set each section's time, preview on a phone, and publish.",
      ],
    },
    {
      type: "p",
      text: "MockSetu renders LaTeX with KaTeX in question text, in options and in reading passages, gives you a formula panel with a live preview, and lets you snip the expressions that are not worth the markup. It is free and there is no card. One thing to know before you publish: a published paper is public, so anyone can attempt it — there is no private delivery to one batch only. If this is your first paper, the [guide for creators](/for-creators) covers the rest of the build.",
    },
  ],
  faqs: [
    {
      question: "How do I write maths in an online quiz question?",
      answer:
        "Write it as LaTeX. In the MockSetu question editor you can type it inline between dollar signs, or open the maths and formula button and build the expression against a live preview with quick-insert templates and a searchable formula library. It is rendered with KaTeX, so the student sees a typeset fraction or integral rather than markup. Inline maths goes between a single dollar pair; a standalone centred equation goes between a double dollar pair.",
    },
    {
      question: "Why does my imported question show the word frac instead of a fraction?",
      answer:
        "Because the renderer never read it as maths, and there are three ways that happens. One: the expression was never wrapped in maths delimiters. The renderer only looks inside a dollar pair, a double dollar pair, or the \\( ... \\) and \\[ ... \\] forms, so a bare fraction command sitting loose in the question text is ordinary text and is printed as written. Two: the escaping went wrong, and that one is largely handled for you. JSON treats a backslash as its own escape character, so a LaTeX command needs exactly two backslashes inside a JSON string, and the importer re-doubles a lone backslash before parsing and names the repair in the preview, while a file doubled twice is collapsed back at import or at display. Three: the markup is simply not valid LaTeX, which survives all of that and is printed raw. Search the saved file for frac and sqrt, check that each sits inside a dollar pair with two backslashes in front of it rather than one or four, and read the equation-heavy questions on screen after importing.",
    },
    {
      question: "Do I have to double backslashes when I type the equation in the editor?",
      answer:
        "No. Doubling applies only inside a JSON file, because that is the only place a JSON parser is reading your text. When you type directly into the question editor you write ordinary LaTeX with single backslashes, exactly as you would in a document. What the formula panel inserts is fixed into the question as finished maths at that moment, so nothing can re-escape it afterwards. The two spellings differ only because an imported file has to survive a JSON parser on the way in.",
    },
    {
      question: "Should I type an equation or paste it as an image?",
      answer:
        "Type it when it is algebra, a fraction, a root, an integral or a small matrix, because typed maths reflows on a phone and stays sharp at any zoom. Snip it from the PDF as an image when it is a chemical structure, a circuit, a ray diagram, a graph, a geometry figure or a long derivation, because those are pictures rather than equations. A good working rule is to snip anything that has taken more than ninety seconds to type.",
    },
    {
      question: "Can students type a maths answer rather than choosing an option?",
      answer:
        "Yes, for numeric and short text answers. A question can be set as single-correct, multi-correct, numeric or text, so a student can type a computed value instead of selecting from options. What is not possible is subjective grading: you can ask for the value of an integral, not for the derivation that produced it, because there is no essay or working-out marking in the product.",
    },
    {
      question: "What happens if a formula is written with invalid LaTeX?",
      answer:
        "It shows up as the raw text you wrote rather than as typeset maths, which is why the check that matters is reading the question on screen after import rather than trusting that the file uploaded successfully. Open the three or four most equation-heavy questions, read the options as well as the stem, and look for literal command names or stray dollar signs sitting in the text.",
    },
  ],
};

export default post;
