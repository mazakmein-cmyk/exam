/**
 * Hindi Transliteration Engine
 * 
 * Uses Google Input Tools API for high-quality transliteration suggestions.
 * Includes a built-in offline ITRANS fallback dictionary for when the API is unreachable.
 * 
 * Architecture: Supports multiple languages via the `lang` parameter.
 * Currently optimized for Hindi ("hi"). Easily extendable.
 */

// ============================================
// OFFLINE ITRANS MAPPING (Fallback)
// ============================================

// Vowel mappings (independent forms)
const VOWELS: Record<string, string> = {
  'a': 'अ', 'aa': 'आ', 'A': 'आ',
  'i': 'इ', 'ee': 'ई', 'ii': 'ई', 'I': 'ई',
  'u': 'उ', 'oo': 'ऊ', 'uu': 'ऊ', 'U': 'ऊ',
  'e': 'ए', 'ai': 'ऐ',
  'o': 'ओ', 'au': 'औ', 'ou': 'औ',
  'an': 'अं', 'am': 'अं',
  'ah': 'अः',
  'ri': 'ऋ',
};

// Vowel diacritics (used after consonants)
const VOWEL_MARKS: Record<string, string> = {
  'a': '', 'aa': 'ा', 'A': 'ा',
  'i': 'ि', 'ee': 'ी', 'ii': 'ी', 'I': 'ी',
  'u': 'ु', 'oo': 'ू', 'uu': 'ू', 'U': 'ू',
  'e': 'े', 'ai': 'ै',
  'o': 'ो', 'au': 'ौ', 'ou': 'ौ',
  'ri': 'ृ',
};

// Consonant mappings
const CONSONANTS: Record<string, string> = {
  'k': 'क', 'kh': 'ख', 'g': 'ग', 'gh': 'घ', 'ng': 'ङ',
  'ch': 'च', 'chh': 'छ', 'j': 'ज', 'jh': 'झ',
  'T': 'ट', 'Th': 'ठ', 'D': 'ड', 'Dh': 'ढ', 'N': 'ण',
  't': 'त', 'th': 'थ', 'd': 'द', 'dh': 'ध', 'n': 'न',
  'p': 'प', 'ph': 'फ', 'f': 'फ', 'b': 'ब', 'bh': 'भ', 'm': 'म',
  'y': 'य', 'r': 'र', 'l': 'ल', 'v': 'व', 'w': 'व',
  'sh': 'श', 'Sh': 'ष', 'shh': 'ष', 's': 'स', 'h': 'ह',
  'x': 'क्ष', 'tr': 'त्र', 'gy': 'ज्ञ', 'gn': 'ज्ञ',
  'q': 'क़', 'kh_': 'ख़', 'G': 'ग़', 'z': 'ज़',
};

// Special characters
const SPECIAL: Record<string, string> = {
  'om': 'ॐ', 'aum': 'ॐ',
  '.': '।', '..': '॥',
  '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
  '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
};

// Common Hindi words for better offline suggestions
const COMMON_WORDS: Record<string, string[]> = {
  'namaste': ['नमस्ते', 'नमस्ती'],
  'namaskar': ['नमस्कार'],
  'dhanyavaad': ['धन्यवाद'],
  'shukriya': ['शुक्रिया'],
  'aap': ['आप'],
  'aapka': ['आपका'],
  'kya': ['क्या'],
  'hai': ['है'],
  'hain': ['हैं'],
  'nahi': ['नहीं', 'नही'],
  'kaise': ['कैसे'],
  'kaisa': ['कैसा'],
  'accha': ['अच्छा'],
  'achha': ['अच्छा'],
  'pariksha': ['परीक्षा'],
  'prashna': ['प्रश्न'],
  'uttar': ['उत्तर'],
  'samay': ['समय'],
  'vibhag': ['विभाग'],
  'anubhag': ['अनुभाग'],
  'vivaran': ['विवरण'],
  'nirdesh': ['निर्देश'],
  'bhasha': ['भाषा'],
  'hindi': ['हिंदी', 'हिन्दी'],
  'ganit': ['गणित'],
  'vigyan': ['विज्ञान'],
  'angreji': ['अंग्रेजी'],
  'adhyay': ['अध्याय'],
  'abhyas': ['अभ्यास'],
  'prashan': ['प्रशन', 'प्रश्न'],
  'ank': ['अंक'],
  'mein': ['में'],
  'ke': ['के'],
  'ka': ['का'],
  'ki': ['की'],
  'ko': ['को'],
  'se': ['से'],
  'par': ['पर'],
  'aur': ['और'],
  'ya': ['या'],
  'yah': ['यह'],
  'vah': ['वह'],
  'hum': ['हम'],
  'tum': ['तुम'],
  'main': ['मैं', 'मैन'],
  'ek': ['एक'],
  'do': ['दो'],
  'teen': ['तीन'],
  'char': ['चार'],
  'paanch': ['पांच', 'पाँच'],
  'sahi': ['सही'],
  'galat': ['गलत'],
  'samjhe': ['समझे'],
  'likhe': ['लिखे'],
  'padhe': ['पढ़े'],
  'dekhe': ['देखे'],
  'shuru': ['शुरू'],
  'khatam': ['खतम', 'ख़तम'],
};

// Halant (virama) for creating conjuncts
const HALANT = '्';

/**
 * Simple offline ITRANS transliteration
 */
function transliterateITRANS(input: string): string {
  let result = '';
  let i = 0;
  let lastWasConsonant = false;

  while (i < input.length) {
    let matched = false;

    // Try matching longest sequences first (up to 4 chars)
    for (let len = Math.min(4, input.length - i); len > 0; len--) {
      const chunk = input.substring(i, i + len);
      const chunkLower = chunk;

      // Check special characters
      if (SPECIAL[chunkLower]) {
        result += SPECIAL[chunkLower];
        i += len;
        matched = true;
        lastWasConsonant = false;
        break;
      }

      // Check consonants
      if (CONSONANTS[chunkLower]) {
        if (lastWasConsonant) {
          result += HALANT;
        }
        result += CONSONANTS[chunkLower];
        i += len;
        matched = true;
        lastWasConsonant = true;
        break;
      }

      // Check vowels
      if (lastWasConsonant && VOWEL_MARKS[chunkLower] !== undefined) {
        result += VOWEL_MARKS[chunkLower];
        i += len;
        matched = true;
        lastWasConsonant = false;
        break;
      }

      if (!lastWasConsonant && VOWELS[chunkLower]) {
        result += VOWELS[chunkLower];
        i += len;
        matched = true;
        lastWasConsonant = false;
        break;
      }
    }

    if (!matched) {
      // Handle anusvara/chandrabindu markers
      if (input[i] === 'n' && i + 1 < input.length && CONSONANTS[input[i + 1]]) {
        result += (lastWasConsonant ? HALANT : '') + 'ं';
        i++;
        lastWasConsonant = false;
      } else {
        // Pass through unrecognized characters
        if (lastWasConsonant) {
          // Add implicit 'a' vowel sound before space/punctuation
          if (/\s|[,;:!?]/.test(input[i])) {
            // Don't add halant before whitespace
          }
        }
        result += input[i];
        i++;
        lastWasConsonant = false;
      }
    }
  }

  return result;
}

// ============================================
// GOOGLE INPUT TOOLS API
// ============================================

// Language to Google Input Tools code mapping
const LANG_CODES: Record<string, string> = {
  'hi': 'hi-t-i0-und',
  'bn': 'bn-t-i0-und',
  'ta': 'ta-t-i0-und',
  'te': 'te-t-i0-und',
  'mr': 'mr-t-i0-und',
  'gu': 'gu-t-i0-und',
  'kn': 'kn-t-i0-und',
  'ml': 'ml-t-i0-und',
  'pa': 'pa-t-i0-und',
  'or': 'or-t-i0-und',
  'ur': 'ur-t-i0-und',
};

// Request cache to avoid duplicate API calls
const suggestionCache = new Map<string, string[]>();

// Debounce tracking
let abortController: AbortController | null = null;

/**
 * Fetch transliteration suggestions from Google Input Tools API
 * Falls back to offline ITRANS if API is unreachable
 */
export async function getTransliterationSuggestions(
  word: string,
  lang: string = 'hi',
  numSuggestions: number = 5
): Promise<string[]> {
  if (!word || word.trim() === '') return [];

  const cacheKey = `${lang}:${word}`;
  if (suggestionCache.has(cacheKey)) {
    return suggestionCache.get(cacheKey)!;
  }

  // Check common words dictionary first
  const lowerWord = word.toLowerCase();
  if (COMMON_WORDS[lowerWord]) {
    suggestionCache.set(cacheKey, COMMON_WORDS[lowerWord]);
    return COMMON_WORDS[lowerWord];
  }

  const itc = LANG_CODES[lang];
  if (!itc) {
    // Unsupported language, return empty
    return [];
  }

  // Cancel any previous in-flight request
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();

  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=${itc}&num=${numSuggestions}&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;

    const response = await fetch(url, {
      signal: abortController.signal,
      // Adding a short timeout
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Google Input Tools returns: ["SUCCESS", [["input", ["suggestion1", "suggestion2", ...], ...]]]
    if (data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
      const suggestions: string[] = data[1][0][1].slice(0, numSuggestions);
      suggestionCache.set(cacheKey, suggestions);
      return suggestions;
    }

    throw new Error('Invalid API response');
  } catch (error: any) {
    if (error.name === 'AbortError') return [];

    // Offline fallback: use ITRANS transliteration
    const fallback = transliterateITRANS(word);
    const suggestions = fallback ? [fallback] : [];
    return suggestions;
  }
}

/**
 * Clear the suggestion cache (useful when switching languages)
 */
export function clearTransliterationCache(): void {
  suggestionCache.clear();
}

export { transliterateITRANS };
