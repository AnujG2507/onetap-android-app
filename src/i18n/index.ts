import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// English fallback translations (bundled for instant load)
import en from './locales/en.json';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // English bundled as fallback, other languages loaded on demand
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    // Required when mixing bundled (English) with dynamically loaded languages
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Prioritize user's manual choice (localStorage) over browser default
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    backend: {
      // Load translations from public folder
      loadPath: '/locales/{{lng}}.json',
    },
    // Only load the detected language (not all languages)
    load: 'languageOnly',
    // Supported languages - others will fall back to English
    supportedLngs: ['en', 'es', 'pt', 'hi', 'de', 'ja', 'ar', 'fr', 'it', 'zh', 'ko', 'ru', 'th', 'vi'],
    // Don't load translations for languages not in supportedLngs
    nonExplicitSupportedLngs: false,
    // Disable Suspense to avoid race conditions with language switching
    react: {
      useSuspense: false,
    },
  });

export default i18n;

export const supportedLanguages: readonly LanguageConfig[] = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', rtl: false },
  { code: 'ko', name: 'Korean', nativeName: '한국어', rtl: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', rtl: false },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false },
];

interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

export type SupportedLanguage = typeof supportedLanguages[number]['code'];
