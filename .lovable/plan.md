

# Show Image Thumbnail in Shared File Dialog

## Problem

When an image is shared to the app via the Android share sheet, the "File received" dialog shows a generic emoji icon instead of an actual image thumbnail. This happens because:

1. The `useSharedContent` hook creates a `ContentSource` with a `content://` URI but no `thumbnailData`
2. `SharedFileActionSheet` calls `buildImageSources(file.thumbnailData, file.uri)` -- but `thumbnailData` is undefined
3. `content://` URIs are explicitly rejected by `isValidImageSource()` in `imageUtils.ts` (they cannot be rendered by WebView `<img>` tags)
4. Result: `imageSources` is empty, so the emoji fallback is shown

Multiple-image slideshows work because they go through a different flow. The single image share path never converts the URI to a renderable format.

## Solution

Convert the `content://` URI to a WebView-renderable URL using `Capacitor.convertFileSrc()` inside `SharedFileActionSheet`, the same technique already used in `SlideshowViewer.tsx` and `VideoPlayer.tsx`.

## Changes

### File: `src/components/SharedFileActionSheet.tsx`

1. Import `Capacitor` from `@capacitor/core`
2. Update the `imageSources` memo to convert `content://` URIs via `Capacitor.convertFileSrc()` before passing them to `buildImageSources`

The updated logic:

```text
imageSources = useMemo(() => {
  if (!isImage || isMultiImage) return [];

  // Convert content:// URI to a WebView-renderable URL
  let renderableUri = file.uri;
  if (file.uri?.startsWith('content://') || file.uri?.startsWith('file://')) {
    try {
      renderableUri = Capacitor.convertFileSrc(file.uri);
    } catch { /* fall through to buildImageSources */ }
  }

  return buildImageSources(file.thumbnailData, renderableUri);
}, [isImage, isMultiImage, file.thumbnailData, file.uri]);
```

This converts `content://com.google.photos/...` to `http://localhost/_capacitor_content_/...`, which the WebView can render as a standard HTTP image. The `thumbnailData` (if present from future improvements) still takes priority as the first argument to `buildImageSources`.

No other files need changes. The native layer already grants temporary read permission to shared `content://` URIs for the duration of the activity, so the converted URL will load correctly.

