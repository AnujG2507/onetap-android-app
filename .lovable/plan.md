
## Problem: Access Points Not Opening From "My Access Points" List

### Root Cause

The `handleOpen` callback in `src/components/MyShortcutsContent.tsx` (lines 531-543) is incomplete. It only handles 3 of 6 shortcut types:

```
link    ✅  window.open(contentUri, '_blank')
contact ✅  window.open('tel:...', '_self')
message ✅  window.open('https://wa.me/...', '_blank')

file        ❌  (nothing happens - silent no-op)
text        ❌  (nothing happens - silent no-op)
slideshow   ❌  (nothing happens - silent no-op)
```

When a user taps "Open" on a file, text, or slideshow access point, `setSelectedShortcut(null)` is called (closing the sheet) but nothing actually opens. This affects the majority of access point types.

### Solution

The fix has two parts:

**1. On native Android** — use `ShortcutPlugin.openWithExternalApp()` for file shortcuts, and route text/slideshow types through the deep link / native intent system via `buildContentIntent()` from `shortcutManager.ts`. The existing `openWithExternalApp` method correctly handles `content://` URIs on Android.

**2. On web (fallback)** — use `window.open()` for files, navigate to `/text/:id` for text shortcuts, and navigate to `/slideshow/:id` for slideshow shortcuts using React Router.

### Files to Change

**`src/components/MyShortcutsContent.tsx`** — Expand `handleOpen`:

```
file shortcut (native) → ShortcutPlugin.openWithExternalApp({ uri: contentUri, mimeType })
file shortcut (web)    → window.open(contentUri, '_blank')

text shortcut          → navigate to /text route or open native TextProxyActivity
                         (since web has no native activity, use SlideshowViewer/in-app route or window.open)

slideshow shortcut     → navigate('/slideshow/:id')
```

Specifically, for native Android:
- **file**: call `ShortcutPlugin.openWithExternalApp({ uri: shortcut.contentUri, mimeType: shortcut.mimeType })`
- **text**: use `ShortcutPlugin.openDesktopWebView()` or navigate in-app to a text viewer (the app already has `TextProxyActivity` for home screen but no in-app route; we show the content in-app using navigation state)
- **slideshow**: navigate to `/slideshow/${shortcut.id}`

For web fallback:
- **file**: `window.open(shortcut.contentUri, '_blank')`
- **text**: navigate to a route passing the text content as state (or display inline)
- **slideshow**: `navigate('/slideshow/' + shortcut.id)`

### Detailed Technical Plan

#### `src/components/MyShortcutsContent.tsx`

Replace the `handleOpen` callback (lines 531–543) with a complete version:

```typescript
const handleOpen = useCallback(async (shortcut: ShortcutData) => {
  incrementUsage(shortcut.id);
  setSelectedShortcut(null);

  if (shortcut.type === 'link') {
    window.open(shortcut.contentUri, '_blank');

  } else if (shortcut.type === 'contact' && shortcut.phoneNumber) {
    window.open(`tel:${shortcut.phoneNumber}`, '_self');

  } else if (shortcut.type === 'message' && shortcut.phoneNumber) {
    const phone = shortcut.phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}`, '_blank');

  } else if (shortcut.type === 'slideshow') {
    navigate(`/slideshow/${shortcut.id}`);

  } else if (shortcut.type === 'text') {
    // Navigate to in-app text viewer, passing content as state
    navigate(`/text/${shortcut.id}`, {
      state: {
        textContent: shortcut.textContent || '',
        isChecklist: shortcut.isChecklist || false,
        name: shortcut.name,
      }
    });

  } else if (shortcut.type === 'file') {
    if (Capacitor.isNativePlatform() && shortcut.contentUri) {
      await ShortcutPlugin.openWithExternalApp({
        uri: shortcut.contentUri,
        mimeType: shortcut.mimeType,
      });
    } else if (shortcut.contentUri) {
      window.open(shortcut.contentUri, '_blank');
    }
  }
}, [incrementUsage, navigate]);
```

The `navigate` hook needs to be imported from `react-router-dom` (it's already available in the file via `useNavigate`, but `MyShortcutsContent` doesn't currently import it — we'll add it).

#### `src/pages/TextViewer.tsx` (new file)

Since there is no in-app text viewer route, we need to create a simple one that renders the text content passed via router state — mirroring what `TextProxyActivity` does natively. It will:
- Read `textContent`, `isChecklist`, and `name` from `location.state`
- Render markdown text (using a `<pre>` or simple renderer for web)
- Render an interactive checklist if `isChecklist` is true
- Show a back button

#### `src/App.tsx` — Register the new route

Add `/text/:id` route pointing to the new `TextViewer` page.

### Summary of Changes

| File | Change |
|---|---|
| `src/components/MyShortcutsContent.tsx` | Expand `handleOpen` to cover `file`, `text`, `slideshow` types; add `useNavigate` |
| `src/pages/TextViewer.tsx` | New page — in-app text/checklist viewer (used when opening text shortcuts from within the app) |
| `src/App.tsx` | Register `/text/:id` route |

No backend changes required. No new dependencies required.
