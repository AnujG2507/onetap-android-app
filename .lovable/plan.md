

# Fix Missing Photo Preview in Shortcut Creation

## Problem Summary

After selecting a single image file, no photo preview is appearing in either:
1. **Top section** (ContentPreview component) - shows blank/blue instead of image
2. **Bottom section** (ShortcutCustomizer preview) - shows blank instead of thumbnail

## Root Cause Analysis

The issue stems from how image sources are processed and validated:

1. **`content://` URIs cannot render in WebView**: When `thumbnailData` is undefined/empty, the code falls back to the `content://` URI which fails silently in the browser
2. **Empty source arrays**: When `thumbnailData` is undefined and `content://` is filtered out (or fails to load), `imageSources` becomes empty
3. **Validation gap**: The `isValidImageSource` function currently marks `content://` as valid, but these URIs cannot actually be rendered by `<img>` tags in WebView

## Solution

### Fix 1: Filter out `content://` URIs in `buildImageSources`

The `content://` protocol should NOT be passed to `<img>` tags because WebViews cannot render them. Currently `isValidImageSource` returns `true` for `content://`, but these will always fail to load.

**Change in `src/lib/imageUtils.ts`**:
- Remove `content://` from `isValidImageSource` since it never works in WebView
- This ensures only actually-renderable sources are included in the array

### Fix 2: Ensure fallback emoji shows when no valid sources

In `ContentPreview.tsx`, when `imageSources` is empty, the emoji fallback should display. The current logic already does this, but we need to verify the emoji is being generated correctly.

### Fix 3: Add logging for debugging

Add console logging to help debug when thumbnails are missing from the native picker, so we can identify if the issue is in native code or frontend processing.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/imageUtils.ts` | Remove `content://` from valid sources since WebView cannot render them |
| `src/components/ContentPreview.tsx` | Add debug logging to identify missing thumbnail data |
| `src/components/ShortcutCustomizer.tsx` | Add debug logging for thumbnail flow |

---

## Technical Details

### imageUtils.ts - Remove content:// from valid sources

The `isValidImageSource` function currently includes:
```javascript
// Android content URI (may or may not work, but worth trying)
if (src.startsWith('content://')) return true;
```

This should be removed because content:// URIs **never** work in WebView img tags. The comment "may or may not work" is optimistic - in practice they always fail.

**New logic**:
```javascript
export function isValidImageSource(src: string | undefined | null): boolean {
  if (!src || typeof src !== 'string') return false;
  if (src.trim() === '') return false;
  
  // Valid base64 data URL
  if (src.startsWith('data:image')) return true;
  
  // Valid blob URL
  if (src.startsWith('blob:')) return true;
  
  // Valid HTTP(S) URL
  if (src.startsWith('http://') || src.startsWith('https://')) return true;
  
  // File URI (local files)
  if (src.startsWith('file://')) return true;
  
  // content:// URIs CANNOT be rendered by WebView <img> tags
  // They require native code to resolve - do NOT include them
  
  return false;
}
```

### ContentPreview.tsx - Add debug logging

Add a log statement to help identify when thumbnail data is missing:
```javascript
const imageSources = useMemo(() => {
  if (!isImage) return [];
  const sources = buildImageSources(source.thumbnailData, source.uri);
  console.log('[ContentPreview] Image sources:', {
    hasThumbnailData: !!source.thumbnailData,
    thumbnailDataLength: source.thumbnailData?.length,
    uri: source.uri?.substring(0, 50),
    resultCount: sources.length,
  });
  return sources;
}, [isImage, source.thumbnailData, source.uri]);
```

### ShortcutCustomizer.tsx - Enhanced thumbnail handling

The existing thumbnail effect already has logging. Ensure the fallback emoji appears when thumbnail generation fails.

---

## Summary

1. **Remove `content://` from valid image sources** - These cannot be rendered in WebView
2. **Add debug logging** - To identify if the issue is missing `thumbnailData` from native picker
3. **Verify emoji fallback works** - Users should at least see the file-type emoji when images can't be displayed

The core fix is removing `content://` from valid sources since including them gives false hope and causes empty renders.

