

# Add Share Button to All Built-in Viewers

## Current State

All three built-in viewers have an "Open with" button (ACTION_VIEW intent) but none have a dedicated "Share" button (ACTION_SEND intent). The difference matters:

- **Open with** (ACTION_VIEW): Opens the file directly in another app (e.g., a PDF reader, gallery)
- **Share** (ACTION_SEND): Shows messaging apps, cloud storage, email -- lets users send the file to someone

## Changes

### 1. NativePdfViewerActivity.java -- Add share button to the top bar

Add a share button next to the existing "Open with" button in the header.

- Create a new `ImageButton` with Android's built-in share icon (`android.R.drawable.ic_menu_share`)
- Place it in the top bar, to the left of the existing "Open with" button
- On click, fire an `ACTION_SEND` intent with the PDF URI and MIME type `application/pdf`, wrapped in `Intent.createChooser`
- Grant URI read permission via `FLAG_GRANT_READ_URI_PERMISSION` and `ClipData`

```text
Top bar layout after change:
  [Back]  [Page indicator]  ... spacer ...  [Share]  [Open with]
```

New method `shareFile()`:
```java
private void shareFile() {
    Intent shareIntent = new Intent(Intent.ACTION_SEND);
    shareIntent.setType("application/pdf");
    shareIntent.putExtra(Intent.EXTRA_STREAM, pdfUri);
    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    shareIntent.setClipData(ClipData.newUri(getContentResolver(), pdfTitle, pdfUri));
    startActivity(Intent.createChooser(shareIntent, null));
}
```

### 2. NativeVideoPlayerActivity.java -- Add share button to the top bar

Add a share button next to the existing "Open with" button.

- Create a new `ImageButton` using the same `createPremiumIconButton` helper
- Use a distinct icon -- since the existing "Open with" button already uses `ic_menu_share`, swap them: use a proper external-link icon (`R.drawable.ic_open_external`) for "Open with", and `android.R.drawable.ic_menu_share` for the new Share button
- On click, fire `ACTION_SEND` with the video URI and its MIME type

```text
Top bar right buttons after change:
  [PiP]  [Share]  [Open with]
```

New method `shareVideo()`:
```java
private void shareVideo() {
    Intent shareIntent = new Intent(Intent.ACTION_SEND);
    shareIntent.setType(videoMimeType != null ? videoMimeType : "video/*");
    shareIntent.putExtra(Intent.EXTRA_STREAM, videoUri);
    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivity(Intent.createChooser(shareIntent, null));
}
```

### 3. SlideshowViewer.tsx -- Add share button to the image/slideshow viewer

Add a Share button next to the existing "Open with" button in the controls header.

- Import `Share2` icon from lucide-react and `Share` from `@capacitor/share`
- Add a new `handleShare` callback that uses Capacitor's Share API with the current image URI
- Add a new button in the top bar between the counter and the "Open with" button

```tsx
const handleShare = useCallback(async () => {
    const currentImage = images[currentIndex];
    if (!currentImage) return;
    try {
        await Share.share({
            title: title,
            url: currentImage,
            dialogTitle: 'Share image...',
        });
    } catch (error) {
        console.log('[SlideshowViewer] Share cancelled or failed:', error);
    }
}, [images, currentIndex, title]);
```

```text
Top bar after change:
  [Back]  [Title]  ... spacer ...  [1/5]  [Share]  [Open with]
```

## Files Modified
1. `native/android/app/src/main/java/app/onetap/access/NativePdfViewerActivity.java` -- Add share button + `shareFile()` method
2. `native/android/app/src/main/java/app/onetap/access/NativeVideoPlayerActivity.java` -- Add share button + `shareVideo()` method, fix icon for "Open with"
3. `src/pages/SlideshowViewer.tsx` -- Add share button + `handleShare` callback

## What Does NOT Change
- No new activities, routes, or components
- No changes to shortcut creation or data model
- "Open with" buttons remain exactly as they are
- WebView-based VideoPlayer.tsx already has both buttons, no changes needed there

