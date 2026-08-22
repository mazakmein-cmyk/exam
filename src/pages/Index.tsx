import HomeLanding from "@/pages/HomeLanding";
import { HOME_COPY_EN } from "@/i18n/homeCopy.en";

/**
 * The English home page at "/". The whole implementation lives in
 * HomeLanding — see that file for the page's architecture and for why the
 * Hindi twin at /hindi is a separate URL rather than a language toggle.
 *
 * Importing only the English table here is what keeps the Hindi strings out
 * of this eager chunk.
 */
const Index = () => <HomeLanding lang="en" copy={HOME_COPY_EN} />;

export default Index;
