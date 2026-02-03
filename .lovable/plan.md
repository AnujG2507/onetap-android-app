
# Fix: Recycled Bitmap Crash in PDF Viewer

## Problem Analysis

The crash `Canvas: trying to use a recycled bitmap` occurs due to a race condition:

1. The `LruCache` evicts a bitmap when memory pressure occurs
2. In the `entryRemoved()` callback, the bitmap is immediately recycled (freed from memory)
3. Meanwhile, the UI thread's `ImageView` still holds a reference to that same bitmap
4. When the RecyclerView tries to draw (during scroll/zoom), it attempts to use the recycled bitmap → crash

```text
┌──────────────────┐     ┌──────────────────┐
│   LruCache       │     │   UI Thread      │
├──────────────────┤     ├──────────────────┤
│ put(new bitmap)  │     │                  │
│       ↓          │     │                  │
│ evict(old bitmap)│     │ imageView.draw() │
│       ↓          │     │       ↓          │
│ oldBitmap.recycle│ ←── │ Uses recycled    │
│                  │     │ bitmap → CRASH   │
└──────────────────┘     └──────────────────┘
```

## Solution

Remove automatic bitmap recycling from the LruCache eviction callback. Instead, let the garbage collector handle bitmap memory naturally. Modern Android (API 11+) handles bitmap memory efficiently without manual recycling.

### Changes

**File: `native/android/app/src/main/java/app/onetap/shortcuts/NativePdfViewerActivity.java`**

1. **Remove `entryRemoved()` callback** (lines 198-203)
   - Delete the automatic `recycle()` call on evicted bitmaps
   - This prevents the race condition where evicted bitmaps are recycled while still in use by ImageViews

2. **Add recycled bitmap check in adapter** (lines 1430-1446)
   - Before setting a cached bitmap to an ImageView, check `bitmap.isRecycled()`
   - If recycled, skip that bitmap and fall through to the next cache level or trigger a re-render
   - This provides defense-in-depth against any remaining edge cases

3. **Add recycled bitmap check in `updatePageBitmap()`** (lines 1494-1496)
   - Before setting a newly rendered bitmap, verify it hasn't been recycled
   - Skip the update if the bitmap is invalid

4. **Keep manual `evictAll()` in `onDestroy()`** (line 1364-1366)
   - The explicit eviction on destroy is fine since the activity is shutting down
   - No drawing will occur after this point

### Why This Works

- **No more race**: Evicted bitmaps aren't immediately recycled, so ImageViews can still draw them
- **Memory still managed**: The LruCache still evicts entries based on size limits
- **GC handles cleanup**: When ImageViews release references, the GC frees bitmap memory naturally
- **Defense-in-depth**: The `isRecycled()` checks catch any edge cases where a recycled bitmap might slip through

### Technical Note

On modern Android (API 11+), bitmap pixel data is stored on the Java heap, so the garbage collector can reclaim it efficiently. Manual `recycle()` calls are only necessary in specific scenarios (e.g., very large bitmaps, tight memory loops). For a PDF viewer with LruCache, letting GC handle it is both safer and sufficient.
