

## Add "Preview Content" Button to Content Preview Card

### What This Does

Adds a small button on the right side of the content preview card (shown at the top of the Shortcut Customizer screen) that lets users tap to preview/open the file before creating the shortcut. This uses the app's built-in viewers when available, and falls back to the system app picker for unsupported file types.

### UX Design

- A subtle icon button (Eye or ExternalLink icon) placed on the right edge of the existing `ContentPreview` card
- Tap opens the content using the best available viewer
- The button should feel lightweight -- not competing with the main "Add to Home Screen" CTA

### Viewer Routing Logic

The button will route to the appropriate viewer based on content type:

```text
Content Type         Viewer Used
-----------------    ------------------------------------------
URL / Share link     In-app browser (Chrome Custom Tabs)
PDF file             Native PDF viewer (NativePdfViewerV2Activity)
Video file           Native video player
Image file           Native viewer via openWithExternalApp
Other files          System app picker (ACTION_VIEW intent)
Web fallback         window.open in new tab
```

### Technical Changes

**1. `src/components/ContentPreview.tsx`**

- Add an `onPreview` optional callback prop
- Render a small icon button (`ExternalLink` from lucide-react) on the right side of the card, visible only when `onPreview` is provided
- Button styled as a ghost/muted circle to match the card's aesthetic

**2. `src/components/ShortcutCustomizer.tsx`**

- Add a `handlePreviewContent` function that inspects the `source` and opens using the appropriate method:
  - **URL/share sources**: call `openInAppBrowser(source.uri)` from `src/lib/inAppBrowser.ts`
  - **PDF files** (native): call `ShortcutPlugin.openWithExternalApp({ uri: source.uri, mimeType: 'application/pdf' })` -- this will route to the native PDF viewer since it's registered for that MIME type
  - **Video files** (native): call `ShortcutPlugin.openNativeVideoPlayer({ uri: source.uri, mimeType: source.mimeType })`
  - **All other files** (native): call `ShortcutPlugin.openWithExternalApp({ uri: source.uri, mimeType: source.mimeType })` -- this triggers Android's ACTION_VIEW intent, showing the system app picker
  - **Web fallback**: `window.open(source.uri, '_blank')`
- Pass `handlePreviewContent` as the `onPreview` prop to `ContentPreview`

**3. Translation key**

- Add `shortcutCustomizer.previewContent` to `src/i18n/locales/en.json` (e.g., "Preview")

### Visual Layout

```text
+-----------------------------------------------+
| [icon/thumb]  Label                   [eye-btn]|
|               Sublabel                         |
+-----------------------------------------------+
```

The eye/external-link button will be a 32x32 tappable area with a muted foreground icon, right-aligned within the existing card flex layout.

