
# Fix Image Preview in Shortcut Creation Journey

## Problem Summary

When creating a shortcut for a single image, there are two visual issues:

1. **Top section (Content Preview)**: Shows a blank blue box instead of the image thumbnail
2. **Bottom section (Icon Preview)**: Sometimes works, sometimes blank

## Root Cause

The image source priority is incorrect. When displaying images from the device:
- `source.uri` contains `content://...` (Android file reference)  
- `source.thumbnailData` contains the base64 encoded thumbnail

The problem is that `content://` URIs cannot be displayed in the app's web view, but they are currently listed as the **first** source to try. The base64 thumbnail should be tried **first** instead.

---

## Solution

### Fix 1: Correct Source Order in ContentPreview.tsx

**Current code:**
```javascript
buildImageSources(source.uri, source.thumbnailData)
```

**Fixed code:**
```javascript
buildImageSources(source.thumbnailData, source.uri)
```

By swapping the order, the working base64 thumbnail is tried first before falling back to the URI.

### Fix 2: Add Background Color for Thumbnail Icons in Preview

The icon preview box at the bottom currently has no background when showing thumbnails. If the image fails to load, it appears as an empty transparent box. Add a fallback muted background.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ContentPreview.tsx` | Swap order in `buildImageSources()` call to prioritize `thumbnailData` |
| `src/components/ShortcutCustomizer.tsx` | Add fallback background color for thumbnail icon type in preview area |

---

## Technical Details

### ContentPreview.tsx Change (Line 30)

Change the `imageSources` memo from:
```javascript
return buildImageSources(source.uri, source.thumbnailData);
```
To:
```javascript
return buildImageSources(source.thumbnailData, source.uri);
```

This ensures the base64 thumbnail (which always works in WebView) is attempted before the content:// URI (which never works in WebView).

### ShortcutCustomizer.tsx Change (Lines 280-286)

The preview container style should provide a fallback background for thumbnail icons:
```javascript
style={
  icon.type === 'favicon'
    ? { backgroundColor: '#FFFFFF' }
    : icon.type === 'thumbnail' || icon.type === 'platform'
      ? {} // Currently no background - problematic
      : { backgroundColor: 'hsl(var(--primary))' }
}
```

Change to add a fallback class or muted background when thumbnails fail to load.

---

## Summary

Two small changes:
1. **Swap source order** in ContentPreview so base64 thumbnails load first
2. **Add fallback background** in preview section for robustness

Both changes ensure consistent visual feedback during the shortcut creation process.
