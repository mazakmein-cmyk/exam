import ForCreators from "@/pages/ForCreators";
import { CREATOR_COPY_HI } from "@/i18n/creatorCopy.hi";

/**
 * The Hindi creator landing page at "/hindi/for-creators".
 *
 * Same component, same six-act scroll story, Hindi copy and Hindi-first SEO.
 * Its own URL because Hindi-medium coaching owners search in Hindi
 * ("ऑनलाइन टेस्ट कैसे बनाएं", "मॉक टेस्ट प्लेटफॉर्म") — queries the English
 * page cannot rank for. Paired to the English page by hreflang, not a toggle.
 */
const ForCreatorsHindi = () => <ForCreators lang="hi" copy={CREATOR_COPY_HI} />;

export default ForCreatorsHindi;
