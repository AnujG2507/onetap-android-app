
# Fix: Image Preview Empty in ShortcutCustomizer

## Root Cause Analysis

The intermittent empty preview is caused by **two related issues** in the image shortcut flow:

### Issue A: `isLoadingThumbnail` initializes as `true` regardless

`ShortcutCustomizer.tsx` line 78:
```tsx
const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true);
```

For image file sources that already have `source.thumbnailData` attached, the component mounts with `isLoadingThumbnail = true` and then fires a `useEffect` that does a dynamic `import()` (async). Until the async import resolves and state is updated, the preview area renders the pulse overlay and the icon preview shows nothing. If the user looks at the screen during this async gap (which on slow devices can be hundreds of milliseconds), they see a blank area.

More critically: the initial icon state is:
```tsx
const [icon, setIcon] = useState<ShortcutIcon>(getInitialIcon);
```
`getInitialIcon()` for an image file returns `{ type: 'emoji', value: '🖼️' }` — never `thumbnail`. The `thumbnail` icon type is only set inside the `useEffect`. So on every mount, the icon starts as emoji and the preview section (which only renders the `ImageWithFallback` when `icon.type === 'thumbnail'`) starts empty.

### Issue B: The `isLoadingThumbnail` state is not set to `false` fast enough when `thumbnailData` is already present

The fast path for pre-existing `thumbnailData` (lines 112–126) uses a dynamic `import()`:
```tsx
if (source.thumbnailData) {
  import('@/lib/imageUtils').then(({ normalizeBase64 }) => {
    const normalized = normalizeBase64(source.thumbnailData);
    if (normalized) {
      setThumbnail(normalized);
      setIcon({ type: 'thumbnail', value: normalized });
      setIsLoadingThumbnail(false);  // ← delayed by async import
      return;
    }
    fetchThumbnail();
  });
  return;
}
```

The dynamic `import()` is unnecessary — `normalizeBase64` is a pure utility that can be imported statically at the top of the file. Using a dynamic import here adds an async round-trip that delays thumbnail display.

### Issue C: `getInitialIcon` doesn't use `source.thumbnailData` synchronously

When `source.thumbnailData` is already available on mount, `getInitialIcon()` could immediately return `{ type: 'thumbnail', value: normalizedThumbnail }` instead of `{ type: 'emoji', ... }`. This would make the initial render show the image immediately without any async gap.

## Fix

### File: `src/components/ShortcutCustomizer.tsx`

**Change 1 — Import `normalizeBase64` statically at the top (remove dynamic import):**

```tsx
// Add to existing import:
import { buildImageSources, normalizeBase64 } from '@/lib/imageUtils';
```

**Change 2 — Make `getInitialIcon` use `thumbnailData` synchronously:**

```tsx
const getInitialIcon = (): ShortcutIcon => {
  if (source.type === 'url' || source.type === 'share') {
    if (detectedPlatform?.icon) {
      return { type: 'platform', value: detectedPlatform.icon };
    }
    return { type: 'emoji', value: getPlatformEmoji(source.uri) };
  }
  // For image files with pre-existing thumbnail data, use it immediately
  if (source.thumbnailData) {
    const normalized = normalizeBase64(source.thumbnailData);
    if (normalized) {
      return { type: 'thumbnail', value: normalized };
    }
  }
  // For files, use file-type specific emoji
  return { type: 'emoji', value: getFileTypeEmoji(source.mimeType, source.name) };
};
```

**Change 3 — Set initial `isLoadingThumbnail` correctly based on whether thumbnail is already available:**

```tsx
// Before:
const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true);

// After:
const hasImmediateThumbnail = !!source.thumbnailData && !!normalizeBase64(source.thumbnailData);
const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(!hasImmediateThumbnail);
```

This means: if `thumbnailData` is present and normalizable, `isLoadingThumbnail` starts as `false` — no async delay, no blank flash.

**Change 4 — Simplify the `useEffect` to remove the dynamic import:**

```tsx
useEffect(() => {
  // If we already have thumbnailData from native picker, use it immediately
  if (source.thumbnailData) {
    const normalized = normalizeBase64(source.thumbnailData);
    if (normalized) {
      setThumbnail(normalized);
      setIcon({ type: 'thumbnail', value: normalized });
      setIsLoadingThumbnail(false);
      return;
    }
    // Fall through to generateThumbnail if normalization fails
  }
  
  // Otherwise try to generate thumbnail
  fetchThumbnail();
  
  function fetchThumbnail() {
    setIsLoadingThumbnail(true);
    generateThumbnail(source)
      .then((thumb) => {
        if (thumb) {
          setThumbnail(thumb);
          setIcon({ type: 'thumbnail', value: thumb });
        }
      })
      .finally(() => {
        setIsLoadingThumbnail(false);
      });
  }
}, [source]);
```

This removes the async `import()` chain, making the fast path fully synchronous.

### Also Fix: `ContentPreview` for image sources

`ContentPreview` currently passes `source.uri` as the second source in `buildImageSources`. For native `content://` URIs, this is correctly filtered out by `isValidImageSource`. But for the web flow, `source.uri` is a blob URL and `source.thumbnailData` is a raw base64 string — both are valid. The component works correctly but can be made more robust by also checking `source.thumbnailData` before deciding to show the image slot:

```tsx
// No change needed here — ContentPreview already works correctly.
// The fix is entirely in ShortcutCustomizer's icon initialization.
```

## Summary of Changes

| File | Change | Reason |
|------|--------|--------|
| `src/components/ShortcutCustomizer.tsx` | Add static import of `normalizeBase64` from `@/lib/imageUtils` | Remove unnecessary dynamic import |
| `src/components/ShortcutCustomizer.tsx` | `getInitialIcon()` — synchronously use `source.thumbnailData` when present | Icon starts as `thumbnail` type immediately, no async gap |
| `src/components/ShortcutCustomizer.tsx` | `useState(!hasImmediateThumbnail)` for `isLoadingThumbnail` | Skip loading state when thumbnail is already available |
| `src/components/ShortcutCustomizer.tsx` | Remove `import('@/lib/imageUtils')` dynamic import in `useEffect` | Replace with synchronous `normalizeBase64` call |

The result: when an image shortcut is created and `thumbnailData` is present (all native paths, and small web files), the preview renders **immediately on the first render** with no async gap, no blank flash, and no pulse overlay.
