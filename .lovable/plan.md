
# Fix: PDF Viewer Bitmap Size Crash at High Zoom

## Problem
The PDF viewer crashes with `RuntimeException: Canvas: trying to draw too large(268329600bytes) bitmap` when zooming to 5.0x. This happens because the rendered bitmap exceeds Android's canvas size limit.

## Technical Analysis
- **Error size**: 268,329,600 bytes = ~256 MB bitmap
- **Android limit**: Typically 100-150 MB per bitmap depending on device
- **Cause**: At 5.0x zoom, bitmap dimensions are calculated as:
  - `highWidth = pageWidth * baseScale * 5.0`
  - `highHeight = pageHeight * baseScale * 5.0`
  - For a standard letter-size PDF on a 1080p device, this creates bitmaps exceeding safe limits
- **Trigger**: The crash occurs in `renderPageAsync()` at line 2162 where `Bitmap.createBitmap()` is called

## Solution

Add bitmap size clamping in the `renderPageAsync()` method to cap maximum dimensions while maintaining aspect ratio.

### Changes to `NativePdfViewerActivity.java`

1. **Add constant for max bitmap size** (near line 97):
```java
// Maximum bitmap memory in bytes (~100MB for ARGB_8888 = ~25 million pixels)
// This prevents Canvas "too large bitmap" crashes on high zoom
private static final long MAX_BITMAP_BYTES = 100 * 1024 * 1024;
private static final int MAX_BITMAP_DIMENSION = 4096; // Hardware texture limit on most devices
```

2. **Add helper method for safe bitmap dimensions**:
```java
/**
 * Calculate safe bitmap dimensions that won't exceed Android's canvas limits.
 * Maintains aspect ratio while capping total size.
 */
private int[] getSafeBitmapDimensions(int requestedWidth, int requestedHeight) {
    // Check against max dimension (hardware texture limit)
    int maxDim = Math.max(requestedWidth, requestedHeight);
    float scale = 1.0f;
    
    if (maxDim > MAX_BITMAP_DIMENSION) {
        scale = (float) MAX_BITMAP_DIMENSION / maxDim;
    }
    
    int width = (int) (requestedWidth * scale);
    int height = (int) (requestedHeight * scale);
    
    // Check against max memory (ARGB_8888 = 4 bytes per pixel)
    long totalBytes = (long) width * height * 4;
    if (totalBytes > MAX_BITMAP_BYTES) {
        float memoryScale = (float) Math.sqrt((double) MAX_BITMAP_BYTES / totalBytes);
        width = (int) (width * memoryScale);
        height = (int) (height * memoryScale);
    }
    
    return new int[] { Math.max(1, width), Math.max(1, height) };
}
```

3. **Apply clamping in renderPageAsync()** (around line 2158-2160):
```java
// --- High-res pass ---
float highScale = baseScale * targetZoom;
int requestedWidth = Math.max(1, (int) (pageWidth * highScale));
int requestedHeight = Math.max(1, (int) (pageHeight * highScale));

// Clamp to safe dimensions to prevent Canvas crash
int[] safeDims = getSafeBitmapDimensions(requestedWidth, requestedHeight);
int highWidth = safeDims[0];
int highHeight = safeDims[1];

if (highWidth != requestedWidth || highHeight != requestedHeight) {
    Log.d(TAG, "Clamped bitmap from " + requestedWidth + "x" + requestedHeight + 
          " to " + highWidth + "x" + highHeight + " for page " + pageIndex);
    crashLogger.addBreadcrumb(CrashLogger.CAT_IO, 
        "Bitmap clamped: " + requestedWidth + "x" + requestedHeight + 
        " → " + highWidth + "x" + highHeight);
}

Bitmap highBitmap = Bitmap.createBitmap(highWidth, highHeight, Bitmap.Config.ARGB_8888);
```

4. **Also apply to low-res pass** (around line 2097-2100) for consistency:
```java
// --- Low-res pass ---
float lowScale = baseScale * targetZoom * LOW_RES_SCALE;
int requestedLowWidth = Math.max(1, (int) (pageWidth * lowScale));
int requestedLowHeight = Math.max(1, (int) (pageHeight * lowScale));

int[] safeLowDims = getSafeBitmapDimensions(requestedLowWidth, requestedLowHeight);
int lowWidth = safeLowDims[0];
int lowHeight = safeLowDims[1];
```

## Behavior After Fix

- At 5.0x zoom on a large PDF, bitmaps are clamped to safe dimensions
- Visual quality may be slightly reduced at extreme zoom levels (inherent tradeoff)
- The viewer remains stable without crashing
- A breadcrumb is logged when clamping occurs for debugging visibility

## Files Modified
| File | Change |
|------|--------|
| `native/android/.../NativePdfViewerActivity.java` | Add bitmap dimension clamping to prevent Canvas crash |

## Testing
After implementation:
1. Open a multi-page PDF via shortcut
2. Pinch-to-zoom to maximum (5.0x)
3. Verify no crash occurs
4. Verify zoomed content remains visible (even if slightly softer due to clamping)
