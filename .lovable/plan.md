
# Fix Image Loading in Shortcut/Reminder Creation Journey

## Problem Summary

Image previews are not loading correctly during the shortcut creation journey. The root cause is a combination of:

1. **Missing thumbnail data** when picking single images from the multi-picker
2. **Native single file picker doesn't generate thumbnails** for images
3. **`generateThumbnail()` returns raw `content://` URIs** for images, which WebView cannot display
4. **No fallback mechanism** when `content://` URIs fail to load in the browser

---

## Root Cause Analysis

### The Image Loading Flow

When a user picks an image on Android:

1. Native picker returns a `content://` URI
2. This URI is passed to `ShortcutCustomizer`
3. `generateThumbnail(source)` is called, which returns `source.uri` (the `content://` URI)
4. This URI is set as the thumbnail and icon value
5. `ImageWithFallback` tries to render it in an `<img>` tag
6. **FAILS** because WebView cannot directly load `content://` URIs

### Why Multi-Picker Sometimes Works

The multi-picker (`pickMultipleFiles`) generates a base64 thumbnail on the native side using `generateImageThumbnailBase64()`. However, when a single image is selected from this picker, the thumbnail data is not passed to the ContentSource in `AccessFlow.tsx`.

### Why Single File Picker Never Works

The single file picker (`pickFile`) doesn't generate any thumbnail data for images, so there's no base64 fallback available.

---

## Solution Design

### Fix 1: Pass thumbnail data when single image selected from multi-picker

**File: `src/components/AccessFlow.tsx`**

Add the missing `thumbnailData` property when a single image is selected:

```typescript
} else if (result && result.files.length === 1) {
  // Single image - use existing flow
  setContentSource({
    type: 'file',
    uri: result.files[0].uri,
    mimeType: result.files[0].mimeType,
    name: result.files[0].name,
    thumbnailData: result.files[0].thumbnail,  // ADD THIS
  });
  setStep('customize');
  return;
}
```

### Fix 2: Generate thumbnail in native single file picker for images

**File: `native/android/app/src/main/java/app/onetap/shortcuts/plugins/ShortcutPlugin.java`**

In the `pickFileResult()` callback, add thumbnail generation for images:

```java
// After getting metadata...
String thumbnail = null;

// Generate thumbnail for images
if (mimeType != null && mimeType.startsWith("image/")) {
    thumbnail = generateImageThumbnailBase64(context, uri, 256);
}

ret.put("success", true);
ret.put("uri", uri.toString());
if (mimeType != null) ret.put("mimeType", mimeType);
if (name != null) ret.put("name", name);
ret.put("size", size);
if (thumbnail != null) ret.put("thumbnail", thumbnail);  // ADD THIS

call.resolve(ret);
```

### Fix 3: Update pickFile() in contentResolver.ts to use thumbnail

**File: `src/lib/contentResolver.ts`**

Update the native file picker response handling to include thumbnail data:

```typescript
return {
  type: 'file',
  uri: picked.uri,
  mimeType: picked.mimeType,
  name: picked.name,
  fileSize: picked.size,
  thumbnailData: picked.thumbnail,  // ADD THIS - from native picker
  isLargeFile: typeof picked.size === 'number' ? picked.size > VIDEO_CACHE_THRESHOLD : undefined,
};
```

### Fix 4: Update generateThumbnail() to prefer thumbnailData for images

**File: `src/lib/contentResolver.ts`**

Modify `generateThumbnail()` to check for existing thumbnailData first:

```typescript
export async function generateThumbnail(source: ContentSource): Promise<string | null> {
  // If we already have thumbnail data (from native), use it
  if (source.thumbnailData) {
    const normalized = normalizeBase64(source.thumbnailData);
    if (normalized) return normalized;
  }
  
  if (source.mimeType?.startsWith('image/')) {
    // For content:// URIs on native, we can't load them in JS
    // Return null and rely on the existing thumbnailData
    if (Capacitor.isNativePlatform() && source.uri.startsWith('content://')) {
      console.log('[ContentResolver] Image has content:// URI - thumbnail should come from native');
      return null;
    }
    // For blob: or http: URLs, we can use them directly
    return source.uri;
  }
  
  // ... rest of the function stays the same
}
```

### Fix 5: Update ShortcutCustomizer to use source.thumbnailData

**File: `src/components/ShortcutCustomizer.tsx`**

Use the source's thumbnail data when available:

```typescript
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
  }
  
  // Otherwise try to generate thumbnail
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
}, [source]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/AccessFlow.tsx` | Add `thumbnailData` when single image selected from multi-picker |
| `native/android/.../ShortcutPlugin.java` | Generate thumbnail in `pickFileResult()` for images |
| `src/lib/contentResolver.ts` | Pass thumbnail from native picker; update `generateThumbnail()` |
| `src/components/ShortcutCustomizer.tsx` | Use `source.thumbnailData` when available |

---

## Testing Checklist

- [ ] Pick a single photo (via Photo button) → preview loads in customizer
- [ ] Pick multiple photos → slideshow thumbnail grid loads correctly
- [ ] Pick single photo from multi-select → preview loads in customizer  
- [ ] Pick a video → preview still works (uses video frame extraction)
- [ ] Pick a PDF/document → emoji fallback still works
- [ ] URL shortcuts → platform icons and favicons still work
- [ ] Shortcut icon in home screen preview updates correctly
- [ ] Test on both native Android and web fallback

---

## Technical Notes

### Why content:// URIs Don't Work in WebView

Android's `content://` URIs require special permissions to access. While the native app has these permissions, the WebView running the Capacitor app cannot directly load them in `<img>` tags. The solution is to:

1. Use `Capacitor.convertFileSrc()` for full-resolution display (used in SlideshowViewer)
2. Generate base64 thumbnails on the native side for preview purposes (our approach)

### Why Native Thumbnail Generation is Preferred

Generating thumbnails on the native side (Java/Kotlin) is more reliable because:
- It has direct access to the content provider
- It can handle EXIF rotation correction
- It works with all image formats Android supports
- It doesn't require the WebView to have file access permissions
