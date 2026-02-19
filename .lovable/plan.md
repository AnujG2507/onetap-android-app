

# Audit: Single Image Shortcut Loading Issues

## Issues Found

### Issue 1: No fallback when full-quality image fails to load (Critical)

When `handleImageError` fires (line 155-157), the state is set to `'error'` but the viewer **does not try the thumbnail fallback**. The `getImageSource` function returns the converted URL as priority 1, and even though a thumbnail exists, it's never tried after a load failure.

**Why slideshows work**: Slideshow images have the same issue technically, but slideshow URIs are all selected in the same session and persisted together. Single image shortcuts are more vulnerable because they're created independently and the `content://` URI may lose permission over time.

**Fix**: When `handleImageError` fires, fall back to the thumbnail. Update `getImageSource` to accept a `failed` flag, or maintain a set of failed indices and skip the converted URL for those indices.

### Issue 2: `content://` URI permission loss is silent (Critical)

`takePersistableUriPermission` at line 641 uses `data.getFlags() & (FLAG_GRANT_READ | FLAG_GRANT_WRITE)` to compute `takeFlags`. If the intent flags don't include the persistable flag (which happens on some OEMs and some content providers), `takeFlags` becomes 0, and the call either silently does nothing or throws an exception that's caught and logged but not surfaced.

For the multi-picker (line 802), `takeFlags` is hardcoded to `Intent.FLAG_GRANT_READ_URI_PERMISSION` which is more reliable.

**Fix**: Use the same hardcoded approach in the single-file picker result, matching the multi-picker pattern.

### Issue 3: No error state UI for single images (Medium)

When all image sources fail, the viewer shows nothing -- a black screen. There's no error message, no retry button, and no indication of what went wrong. Slideshows at least have dot indicators showing position.

**Fix**: Add an error state that shows the shortcut name, an error icon, and an "Open with..." button to try opening the file with an external app.

### Issue 4: `Capacitor.convertFileSrc` for stale URIs returns a URL that fails silently (Medium)

`Capacitor.convertFileSrc` converts `content://...` to `http://localhost/_capacitor_content_/...`. This URL will return an HTTP error if the underlying content provider denies access, but there's no pre-check. The image just fails to load.

**Fix**: This is addressed by Issue 1's fix (thumbnail fallback on error).

## Proposed Changes

### File 1: `src/pages/SlideshowViewer.tsx`

**A. Track failed indices and fall back to thumbnails**

Add a `failedIndices` state set. Update `handleImageError` to add the index to the failed set. Update `getImageSource` to skip converted URLs for failed indices and go straight to thumbnail.

```typescript
const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

// Reset on mount (alongside existing resets)
setFailedIndices(new Set());
```

Update `handleImageError`:
```typescript
const handleImageError = useCallback((index: number) => {
  setImageLoadStates(prev => new Map(prev).set(index, 'error'));
  setFailedIndices(prev => {
    const next = new Set(prev);
    next.add(index);
    return next;
  });
}, []);
```

Update `getImageSource` to check `failedIndices`:
```typescript
const getImageSource = useCallback((index: number): string => {
  const hasFailed = failedIndices.has(index);
  
  // Priority 1: Converted full-quality URI (skip if previously failed)
  if (!hasFailed) {
    const converted = convertedUrls.get(index);
    if (converted) return converted;
  }
  
  // Priority 2: Original URI (for web or HTTP sources)
  const original = images[index];
  if (!hasFailed && original?.startsWith('http')) return original;
  if (original?.startsWith('data:')) return original;
  
  // Priority 3: Thumbnail as fallback
  const thumbnail = thumbnails[index];
  if (thumbnail) {
    return thumbnail.startsWith('data:') 
      ? thumbnail 
      : `data:image/jpeg;base64,${thumbnail}`;
  }
  
  return '';
}, [convertedUrls, images, thumbnails, failedIndices]);
```

**B. Add error state UI when all sources fail**

After the thumbnail fallback, if even that fails (empty string or thumbnail also errors), show a user-friendly error overlay:

```tsx
{/* Error state - shown when image cannot be loaded */}
{currentLoadState === 'error' && !currentImageSrc && (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
    <ImageOff className="h-16 w-16 text-white/40" />
    <p className="text-white/60 text-sm">Image unavailable</p>
    <Button variant="outline" size="sm" onClick={handleOpenWith}
      className="text-white border-white/30">
      Open with another app
    </Button>
  </div>
)}
```

### File 2: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

**Fix the single-file picker's `takePersistableUriPermission` to use hardcoded flags** (matching the multi-picker pattern):

```java
// Current (line 640):
int takeFlags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
context.getContentResolver().takePersistableUriPermission(uri, takeFlags);

// Fixed:
int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
context.getContentResolver().takePersistableUriPermission(uri, takeFlags);
```

This ensures the read permission is always requested, regardless of what flags the intent carries. The multi-picker already does this correctly at line 802.

## Summary

| Issue | Severity | Fix |
|-------|----------|-----|
| No thumbnail fallback on load error | Critical | Track failed indices, skip to thumbnail |
| Single-file picker uses unreliable flag masking for persistable permission | Critical | Hardcode `FLAG_GRANT_READ_URI_PERMISSION` |
| No error UI when image is inaccessible | Medium | Show error state with "Open with" option |
| Silent failures from `convertFileSrc` | Medium | Covered by thumbnail fallback fix |

