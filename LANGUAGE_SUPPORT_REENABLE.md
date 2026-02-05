# Re-enabling Multi-Language Support

This document tracks all code locations that were temporarily disabled for the English-only launch. When ready to re-enable multi-language support, follow this checklist.

---

## Quick Checklist

- [ ] `src/i18n/index.ts` - Restore i18n plugins and full language list
- [ ] `src/hooks/useOnboarding.ts` - Restore language selection state
- [ ] `src/hooks/useRTL.ts` - Restore dynamic RTL detection
- [ ] `src/components/SettingsPage.tsx` - Uncomment language section and picker sheet
- [ ] `src/pages/Index.tsx` - Language selection step will auto-enable
- [ ] Test language switching, RTL layout, and persistence

---

## Detailed Changes by File

### 1. `src/i18n/index.ts`

**What was disabled:**
- `LanguageDetector` plugin (browser language detection)
- `HttpBackend` plugin (lazy-loading translations from `/locales/`)
- Detection config (localStorage + navigator order)
- Backend config (load path for translation files)
- Full `supportedLngs` array (10 languages)
- Full `supportedLanguages` export array

**To re-enable:**
1. Uncomment the imports at the top:
   ```ts
   import LanguageDetector from 'i18next-browser-languagedetector';
   import HttpBackend from 'i18next-http-backend';
   ```

2. Uncomment the plugin usage:
   ```ts
   i18n
     .use(HttpBackend)
     .use(LanguageDetector)
   ```

3. Remove the forced `lng: 'en'` line

4. Uncomment the detection and backend configs

5. Restore the full `supportedLngs` array:
   ```ts
   supportedLngs: ['en', 'zh', 'hi', 'es', 'ar', 'pt', 'fr', 'ru', 'bn', 'id'],
   ```

6. Restore the full `supportedLanguages` export with all 10 languages

---

### 2. `src/hooks/useOnboarding.ts`

**What was disabled:**
- `LANGUAGE_SELECTED_KEY` constant
- `hasSelectedLanguage` state (now hardcoded to `true`)
- `markLanguageSelected` function body
- Language key removal in `resetOnboarding`

**To re-enable:**
1. Uncomment the `LANGUAGE_SELECTED_KEY` constant

2. Restore the `hasSelectedLanguage` useState:
   ```ts
   const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(() => {
     try {
       return localStorage.getItem(LANGUAGE_SELECTED_KEY) === 'true';
     } catch {
       return false;
     }
   });
   ```

3. Restore `markLanguageSelected` function body

4. Restore `resetOnboarding` to also remove `LANGUAGE_SELECTED_KEY`

---

### 3. `src/hooks/useRTL.ts`

**What was disabled:**
- Dynamic imports of `useEffect`, `useState`, `useTranslation`, `supportedLanguages`
- Effect that detects RTL based on current language
- Effect that updates `document.documentElement.dir`

**To re-enable:**
1. Uncomment the imports at the top

2. Restore the useState and useEffect:
   ```ts
   const { i18n } = useTranslation();
   const [isRTL, setIsRTL] = useState(false);

   useEffect(() => {
     const currentLangCode = i18n.language?.split('-')[0] || 'en';
     const currentLang = supportedLanguages.find(l => l.code === currentLangCode);
     const rtl = currentLang?.rtl || false;
     
     setIsRTL(rtl);
     document.documentElement.dir = rtl ? 'rtl' : 'ltr';
   }, [i18n.language]);
   ```

3. Remove the hardcoded `const isRTL = false;`

---

### 4. `src/components/SettingsPage.tsx`

**What was disabled:**
- `Globe` icon import
- `supportedLanguages` and `i18n` imports
- Language picker state variables (`languageSheetOpen`, `isChangingLanguage`, `changingTo`)
- `currentLanguage` and `currentLanguageConfig` computed values
- `handleCloseLanguageSheet` callback and `useSheetBackHandler` call
- `handleLanguageChange` async function
- Language Section Card (JSX block)
- Language Picker Sheet (JSX block at bottom)

**To re-enable:**
1. Uncomment the `Globe` import from lucide-react

2. Uncomment the i18n imports:
   ```ts
   import { supportedLanguages } from '@/i18n';
   import i18n from '@/i18n';
   ```

3. Uncomment all language picker state variables

4. Uncomment `currentLanguage` and `currentLanguageConfig`

5. Uncomment `handleCloseLanguageSheet` and `useSheetBackHandler`

6. Uncomment `handleLanguageChange` function

7. Uncomment the Language Section Card JSX (search for `{/* LANGUAGE SUPPORT TEMPORARILY DISABLED`)

8. Uncomment the Language Picker Sheet JSX at the bottom of the component

---

### 5. `src/pages/Index.tsx`

**What was disabled:**
- Nothing removed, but the `LanguageSelectionStep` conditional is now a no-op

**To re-enable:**
- No changes needed here. Once `useOnboarding` is restored, the conditional `if (!hasSelectedLanguage)` will work again automatically.

---

### 6. `src/components/LanguageSelectionStep.tsx`

**Status:** Preserved in full, just not rendered.

**To re-enable:**
- Remove the header comment block (optional, for cleanup)
- No code changes needed - it will render automatically when `hasSelectedLanguage` returns `false` for new users

---

### 7. `src/components/LanguagePicker.tsx`

**Status:** Preserved in full, currently unused.

**To re-enable:**
- Remove the header comment block (optional, for cleanup)
- This component can be used anywhere a language picker is needed

---

### 8. `src/components/TranslationLoader.tsx`

**Status:** Preserved in full, currently unused.

**To re-enable:**
- Remove the header comment block (optional, for cleanup)
- Use this component to show a spinner while translations load for non-English languages

---

## Translation Files

The app expects translation files at `public/locales/{lng}.json` for each supported language:

- `public/locales/zh.json` - Chinese
- `public/locales/hi.json` - Hindi
- `public/locales/es.json` - Spanish
- `public/locales/ar.json` - Arabic (RTL)
- `public/locales/pt.json` - Portuguese
- `public/locales/fr.json` - French
- `public/locales/ru.json` - Russian
- `public/locales/bn.json` - Bengali
- `public/locales/id.json` - Indonesian

English is bundled directly in `src/i18n/locales/en.json`.

---

## Testing Checklist

After re-enabling, verify:

1. **First-time user flow:** Language selection step appears before onboarding
2. **Settings:** Language section visible with all 10 languages
3. **Language switching:** Selecting a language loads translations
4. **RTL:** Arabic layout mirrors correctly (text, icons, swipe gestures)
5. **Persistence:** Language choice persists across app restarts
6. **Fallback:** Missing translation keys gracefully fallback to English

---

## Search Pattern

To find all disabled code, search for:
```
LANGUAGE SUPPORT TEMPORARILY DISABLED
```

This comment pattern marks every location where code was commented out.
