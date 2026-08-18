/**
 * sanitizeConfig.js — the DOMPurify configuration for creator-authored HTML.
 *
 * Pure data, no imports — split out of sanitizeHtml.ts (same pattern as
 * paperType.js) so the node test suite can build a jsdom DOMPurify around the
 * EXACT config the app ships and prove what survives it.
 *
 * Why this exists at all: question text, options, and passages are HTML written
 * by creators — self-signup accounts — and rendered into OTHER people's
 * browsers (students sitting the exam, admins reviewing content). The editors
 * only emit a tame tag set, but the editor is not the boundary: any creator can
 * write arbitrary HTML straight to their own rows through the REST API with
 * their JWT. Whatever the column holds lands in dangerouslySetInnerHTML, so the
 * boundary has to be at render time.
 *
 * The allowlist is calibrated against the two producers whose output must
 * survive byte-for-byte:
 *
 *  1. The WYSIWYG editors (RichTextEditor / QuestionForm) — execCommand HTML:
 *     <font color>, <b/i/u/s>, <sub/sup>, lists, tables, <a href>, <img> from
 *     Supabase storage, and the passage-section/question-section wrappers.
 *     This is the EDITOR_TAGS vocabulary in richText.ts.
 *
 *  2. KaTeX (`output: "htmlAndMathml"`) — spans with class/style, and a MathML
 *     twin under <semantics>/<annotation encoding="application/x-tex"> that
 *     screen readers use. DOMPurify's default MathML profile does NOT include
 *     semantics/annotation (they are cousins of the annotation-xml mXSS
 *     vector), so they are added back explicitly. annotation-xml itself — the
 *     actually dangerous one, which can host HTML-namespace content — is NOT
 *     added.
 *
 * Everything else is DOMPurify's stock profile behavior: script/iframe/object
 * never survive, on* handlers are dropped, and javascript: URLs are stripped
 * from href/src. data: URLs are also blocked by the default URI policy — the
 * editors never produce them (images upload to storage and come back https),
 * so nothing legitimate is lost.
 */

export const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },

  // KaTeX's accessibility twin — see note 2 above.
  ADD_TAGS: ["semantics", "annotation"],

  // `target` is not in DOMPurify's default attribute list, but
  // applyInlineMarkdown() writes target="_blank" onto every link it creates so
  // a reference opened mid-exam does not navigate away from the paper. It is
  // always written alongside rel="noopener noreferrer" (which IS preserved by
  // default), so keeping it does not reopen the window.opener hole.
  // `encoding` is the annotation attribute ("application/x-tex").
  ADD_ATTR: ["target", "encoding"],

  // In DOMPurify's stock html profile but banned here because the editors
  // never emit them and each is an attack surface on its own, no script
  // needed:
  //  - style:    a <style> tag is page-global — a question could restyle or
  //              overlay the exam UI far outside its own card. (Inline
  //              style="" attributes are unaffected; KaTeX and the editors
  //              depend on those.)
  //  - form controls: a rendered question must never be able to present a
  //              working input/submit surface — that is phishing scaffolding,
  //              not content. The exam's own answer inputs are React-rendered
  //              outside this HTML.
  FORBID_TAGS: ["style", "form", "input", "textarea", "select", "button"],
};
