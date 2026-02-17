

# Open Single Image Shortcuts in the Built-in Slideshow Viewer

## Current Behavior
When a single image shortcut is tapped on the home screen, it goes through `FileProxyActivity`, which launches an Android app selector (ACTION_VIEW intent) to open the image in an external gallery app.

## Proposed Solution (Minimal Changes)
Route single image file shortcuts through the same `SlideshowProxyActivity` path that slideshows use. The `SlideshowViewer` already handles single images perfectly -- it shows pinch-to-zoom, swipe-down-to-close, and an "Open with" button for external apps.

Only **2 files** need changes, and the changes are small:

---

## Changes

### 1. `ShortcutPlugin.java` -- Route image shortcuts through SlideshowProxyActivity

In the intent-building logic (around line 395), before the generic `FileProxyActivity` fallback, add a check: if the MIME type starts with `image/`, route through `SlideshowProxyActivity` instead. This applies to both the shortcut creation path and the shortcut update path.

```text
Before (simplified):
  if OPEN_SLIDESHOW -> SlideshowProxyActivity
  else -> FileProxyActivity  (catches images, audio, docs, etc.)

After:
  if OPEN_SLIDESHOW -> SlideshowProxyActivity
  else if mimeType starts with "image/" -> SlideshowProxyActivity (NEW)
  else -> FileProxyActivity  (audio, docs, etc. only)
```

Two places to update:
- Shortcut creation intent builder (~line 395)
- Shortcut update intent builder (~line 4550)

### 2. `SlideshowViewer.tsx` -- Handle `type: 'file'` with image mimeType

Currently the viewer only loads data when `shortcut.type === 'slideshow'`. Add a second condition: if the shortcut is `type === 'file'` and `fileType === 'image'`, treat its single `contentUri` as a one-image slideshow.

```text
if (shortcut.type === 'slideshow') {
  // existing slideshow logic
} else if (shortcut.type === 'file' && shortcut.fileType === 'image') {
  // Treat as single-image slideshow
  setImages([shortcut.contentUri]);
  setThumbnails(shortcut.thumbnailData ? [shortcut.thumbnailData] : []);
  setTitle(shortcut.name);
}
```

This reuses all existing UI: pinch-zoom, controls, "Open with" button. Navigation arrows and dot indicators are already hidden when `images.length === 1`.

---

## What Does NOT Change
- No new activities, routes, or components
- No changes to shortcut creation flow or data model
- No changes to how slideshows work
- Audio, document, and other file shortcuts still use `FileProxyActivity` as before
