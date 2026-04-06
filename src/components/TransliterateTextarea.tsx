import React, { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { getTransliterationSuggestions } from "@/lib/transliteration";

interface TransliterateTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  lang?: string;
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * A drop-in replacement for <Textarea> that adds Hindi transliteration
 * when `lang="hi"`. For English, renders a plain <Textarea>.
 *
 * Uses Google Input Tools API with offline ITRANS fallback.
 * Supports any Indic language via the `lang` prop.
 */
export function TransliterateTextarea({
  lang = "en",
  value,
  onValueChange,
  className,
  ...rest
}: TransliterateTextareaProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState("");
  const [wordStart, setWordStart] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const isIndicLang = lang && lang !== "en";

  // Extract the current word being typed (from cursor position backwards)
  const extractCurrentWord = useCallback((text: string, cursorPos: number) => {
    let start = cursorPos;
    while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) {
      start--;
    }
    return {
      word: text.substring(start, cursorPos),
      start,
    };
  }, []);

  // Fetch suggestions when the current word changes
  const fetchSuggestions = useCallback(async (word: string) => {
    if (!word || word.length < 1 || !isIndicLang) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const results = await getTransliterationSuggestions(word, lang, 5);
      if (results.length > 0) {
        setSuggestions(results);
        setShowSuggestions(true);
        setActiveIndex(0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [lang, isIndicLang]);

  // Handle text input
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || newValue.length;
    onValueChange(newValue);

    if (!isIndicLang) return;

    const { word, start } = extractCurrentWord(newValue, cursorPos);
    setCurrentWord(word);
    setWordStart(start);

    // Debounce API calls
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(word);
    }, 150);
  }, [onValueChange, isIndicLang, extractCurrentWord, fetchSuggestions]);

  // Apply a suggestion
  const applySuggestion = useCallback((suggestion: string) => {
    const before = value.substring(0, wordStart);
    const after = value.substring(wordStart + currentWord.length);
    const newValue = before + suggestion + after;
    onValueChange(newValue);
    setSuggestions([]);
    setShowSuggestions(false);
    setCurrentWord("");

    // Restore focus and cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = before.length + suggestion.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [value, wordStart, currentWord, onValueChange]);

  // Handle keyboard navigation in suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      rest.onKeyDown?.(e as any);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        // For textarea, only intercept Enter when suggestions are showing
        e.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        break;
      case 'Tab':
        e.preventDefault();
        applySuggestion(suggestions[activeIndex]);
        break;
      case ' ':
        // On space, apply the first suggestion and add a space
        if (suggestions.length > 0) {
          e.preventDefault();
          const before = value.substring(0, wordStart);
          const after = value.substring(wordStart + currentWord.length);
          const newValue = before + suggestions[activeIndex] + ' ' + after;
          onValueChange(newValue);
          setSuggestions([]);
          setShowSuggestions(false);
          setCurrentWord("");
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              const pos = before.length + suggestions[activeIndex].length + 1;
              textareaRef.current.setSelectionRange(pos, pos);
            }
          }, 0);
        }
        break;
      case 'Escape':
        setSuggestions([]);
        setShowSuggestions(false);
        break;
      default:
        rest.onKeyDown?.(e as any);
    }
  }, [showSuggestions, suggestions, activeIndex, applySuggestion, rest, value, wordStart, currentWord, onValueChange]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!isIndicLang) {
    // English mode: plain textarea
    return (
      <Textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
        {...rest}
      />
    );
  }

  return (
    <div className="relative" style={{ position: 'relative' }}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          // Delay hiding suggestions so click can register
          setTimeout(() => setShowSuggestions(false), 200);
          rest.onBlur?.(e);
        }}
        className={className}
        autoComplete="off"
        {...rest}
      />

      {/* Transliteration Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="transliterate-suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 9999,
            marginTop: '4px',
            minWidth: '160px',
            maxWidth: '300px',
            background: 'white',
            border: '1px solid hsl(230 18% 91%)',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden',
            padding: '4px',
          }}
        >
          {suggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className={`transliterate-suggestion-item ${idx === activeIndex ? 'active' : ''}`}
              style={{
                padding: '8px 12px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                borderRadius: '0.375rem',
                transition: 'background 0.15s ease',
                background: idx === activeIndex ? 'hsl(252 87% 57% / 0.08)' : 'transparent',
                color: idx === activeIndex ? 'hsl(252 87% 57%)' : 'inherit',
                fontWeight: idx === activeIndex ? 600 : 400,
                fontFamily: "'Noto Sans Devanagari', 'Inter', sans-serif",
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                applySuggestion(suggestion);
              }}
            >
              {suggestion}
            </div>
          ))}
          <div
            style={{
              padding: '4px 12px',
              fontSize: '0.65rem',
              color: '#999',
              borderTop: '1px solid hsl(230 18% 93%)',
              marginTop: '4px',
              textAlign: 'right',
            }}
          >
            ↑↓ navigate · Enter/Tab to select · Space to confirm
          </div>
        </div>
      )}
    </div>
  );
}

export default TransliterateTextarea;
