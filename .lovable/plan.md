

## Add Translations for File Size Indicator & Progress Bar

This plan adds the missing translation keys for the new video file size indicator and progress bar across all 14 supported languages, while also making the large file warning more subtle.

---

### Changes Overview

#### 1. Update English Locale (Subtle Warning)
- Change `largeFileWarning` from "May take longer to process" to "Large file" for a more subtle, less alarming tone

#### 2. Add Missing Translation Keys to All Locales

Each locale file will receive 6 new keys under `shortcutCustomizer`:

| Key | English | Purpose |
|-----|---------|---------|
| `videoFile` | Video file | Label for video file indicator |
| `largeFileWarning` | Large file | Subtle warning for files >50MB |
| `processingVideo` | Processing video | Progress bar title for videos |
| `processingFile` | Processing file | Progress bar title for other files |
| `processingLargeVideo` | Copying {{size}} MB video to app storage... | Progress description for videos |
| `processingLargeFile` | Copying {{size}} MB file to app storage... | Progress description for files |

---

### Translations by Language

| Language | `videoFile` | `largeFileWarning` |
|----------|-------------|-------------------|
| Spanish (es) | Archivo de video | Archivo grande |
| Portuguese (pt) | Arquivo de vídeo | Arquivo grande |
| German (de) | Videodatei | Große Datei |
| French (fr) | Fichier vidéo | Fichier volumineux |
| Italian (it) | File video | File grande |
| Japanese (ja) | 動画ファイル | 大きなファイル |
| Korean (ko) | 동영상 파일 | 대용량 파일 |
| Hindi (hi) | वीडियो फाइल | बड़ी फाइल |
| Arabic (ar) | ملف فيديو | ملف كبير |
| Russian (ru) | Видеофайл | Большой файл |
| Thai (th) | ไฟล์วิดีโอ | ไฟล์ขนาดใหญ่ |
| Vietnamese (vi) | Tệp video | Tệp lớn |
| Chinese (zh) | 视频文件 | 大文件 |

---

### Files to Modify

1. `public/locales/en.json` - Update warning text to be more subtle
2. `public/locales/es.json` - Add all 6 keys
3. `public/locales/pt.json` - Add all 6 keys
4. `public/locales/de.json` - Add all 6 keys
5. `public/locales/fr.json` - Add all 6 keys
6. `public/locales/it.json` - Add all 6 keys
7. `public/locales/ja.json` - Add all 6 keys
8. `public/locales/ko.json` - Add all 6 keys
9. `public/locales/hi.json` - Add all 6 keys
10. `public/locales/ar.json` - Add all 6 keys
11. `public/locales/ru.json` - Add all 6 keys
12. `public/locales/th.json` - Add all 6 keys
13. `public/locales/vi.json` - Add all 6 keys
14. `public/locales/zh.json` - Add all 6 keys

---

### Technical Details

The translations will be added to the existing `shortcutCustomizer` section in each locale file. For languages that don't have a `shortcutCustomizer` section yet (some use `shortcut` instead), the keys will be added to the appropriate existing section or a new `shortcutCustomizer` section will be created to match the English structure.

The `{{size}}` placeholder in `processingLargeVideo` and `processingLargeFile` is an i18next interpolation variable that will be replaced with the actual file size in MB at runtime.

