import HomeLanding from "@/pages/HomeLanding";
import { HOME_COPY_HI } from "@/i18n/homeCopy.hi";

/**
 * The Hindi home page at "/hindi" — हिंदी लैंडिंग पेज.
 *
 * Same component, same behaviour, Hindi copy and Hindi-first SEO. It exists
 * as its own indexable URL because Devanagari queries ("फ्री मॉक टेस्ट",
 * "एसएससी एमटीएस पिछले वर्ष का पेपर") cannot be won from an English page.
 * The pair is bound by bidirectional hreflang, NOT by an in-page switcher.
 *
 * This route is lazy-loaded, so importing the Hindi table here is what puts
 * those strings in this chunk instead of the one every visitor downloads.
 */
const IndexHindi = () => <HomeLanding lang="hi" copy={HOME_COPY_HI} />;

export default IndexHindi;
