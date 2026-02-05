import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// LANGUAGE SUPPORT TEMPORARILY DISABLED
// The following imports are intentionally commented out for the English-only launch.
// Do not delete. Will be re-enabled in a future update.
// import LanguageDetector from 'i18next-browser-languagedetector';
// import HttpBackend from 'i18next-http-backend';

// English fallback translations (bundled for instant load)
import en from './locales/en.json';

i18n
  // LANGUAGE SUPPORT TEMPORARILY DISABLED
  // These plugins are intentionally commented out for the English-only launch.
  // Do not delete. Will be re-enabled in a future update.
  // .use(HttpBackend)
  // .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // English bundled as fallback, other languages loaded on demand
    resources: {
      en: { translation: en },
    },
    // LANGUAGE SUPPORT TEMPORARILY DISABLED
    // Force English only - language detection and switching disabled for initial launch.
    // Do not delete. Will be re-enabled in a future update.
    lng: 'en', // Force English
    fallbackLng: 'en',
    // Required when mixing bundled (English) with dynamically loaded languages
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    // Show friendly fallback instead of raw keys like "clipboard.quickSave"
    saveMissing: false,
    parseMissingKeyHandler: (key: string) => {
      // Extract the last part of the key and humanize it
      // e.g., "clipboard.quickSave" → "Quick Save"
      const lastPart = key.split('.').pop() || key;
      // Convert camelCase/snake_case to Title Case with spaces
      return lastPart
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
        .replace(/_/g, ' ') // snake_case → snake case
        .replace(/\b\w/g, (char) => char.toUpperCase()); // Capitalize first letter of each word
    },
    // LANGUAGE SUPPORT TEMPORARILY DISABLED
    // Detection config intentionally commented out for the English-only launch.
    // Do not delete. Will be re-enabled in a future update.
    // detection: {
    //   // Prioritize user's manual choice (localStorage) over browser default
    //   order: ['localStorage', 'navigator'],
    //   lookupLocalStorage: 'i18nextLng',
    //   caches: ['localStorage'],
    // },
    // backend: {
    //   // Load translations from public folder
    //   loadPath: '/locales/{{lng}}.json',
    // },
    // Only load the detected language (not all languages)
    load: 'languageOnly',
    // LANGUAGE SUPPORT TEMPORARILY DISABLED
    // Only English supported for initial launch.
    // Do not delete. Will be re-enabled in a future update.
    // supportedLngs: ['en', 'zh', 'hi', 'es', 'ar', 'pt', 'fr', 'ru', 'bn', 'id'],
    supportedLngs: ['en'],
    // Don't load translations for languages not in supportedLngs
    nonExplicitSupportedLngs: false,
    // Disable Suspense to avoid race conditions with language switching
    react: {
      useSuspense: false,
    },
  });

export default i18n;

// LANGUAGE SUPPORT TEMPORARILY DISABLED
// The full supportedLanguages array is preserved below for future re-enablement.
// Do not delete. Will be re-enabled in a future update.
// export const supportedLanguages: readonly LanguageConfig[] = [
//   { code: 'en', name: 'English', nativeName: 'English', rtl: false },
//   { code: 'zh', name: 'Chinese', nativeName: '中文', rtl: false },
//   { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
//   { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false },
//   { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
//   { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false },
//   { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
//   { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false },
//   { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false },
//   { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false },
// ];

// English-only placeholder for now
export const supportedLanguages: readonly LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false },
];

interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

export type SupportedLanguage = typeof supportedLanguages[number]['code'];
