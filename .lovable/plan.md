

# Fix: All Pages Blank When Zoomed In Above 1x

## Root Cause

At zoom > 1x, `renderPage` creates bitmaps at full zoomed resolution (`screenWidth * zoom`). For example on a 1080p screen at 2.5x zoom, a single page bitmap is approximately 2700 x 3800 pixels = **41MB ARGB**. The bitmap cache is `maxMemory / 8`, which on a typical 256MB heap is only **32MB total**.

Result: a single page bitmap exceeds the entire cache capacity. When `bitmapCache.put(key, bitmap)` is called, `LruCache` inserts it, then immediately calls `trimToSize()` which evicts it (and everything else) because the single entry exceeds `maxSize`. The bitmap is gone before `postInvalidate()` even runs.

The `entryRemoved` eviction protection then fires and schedules a re-render for the evicted visible page, which renders again, puts it in cache, gets immediately evicted again -- creating an infinite render-evict loop that never produces a visible frame.

The "split second" of content seen during scrolling is when `findBestBitmap` briefly finds a stale lower-zoom bitmap through the `pageKeyIndex` fallback before that too gets evicted by incoming zoomed renders.

## Fix: Cap Render Resolution to Fit Cache Budget

Instead of rendering bitmaps at the full zoomed pixel resolution, cap the render resolution so that each page bitmap fits within a fraction of the cache. The Canvas will upscale the bitmap when drawing, which is what every major PDF viewer does (Google Drive, Adobe Reader all render at a capped resolution and let the GPU scale).

### Change 1: Add render resolution cap based on cache budget

**File:** `NativePdfViewerV2Activity.java`

Add a method `getMaxRenderScale()` that calculates the maximum render scale so that a single page bitmap never exceeds `cacheMaxSize / 6` (guaranteeing at least 6 pages fit in cache at any zoom level).

In `renderPage`, after computing `bmpW` and `bmpH`, apply this cap BEFORE `getSafeBitmapDimensions`. This ensures:
- At zoom 1.0x: typical page is ~1080x1400 = ~6MB -- fits fine, no capping
- At zoom 2.5x: would be ~2700x3500 = ~38MB -- capped down to ~1600x2100 = ~13MB (fits 2-3 per cache)
- Canvas upscaling handles the visual zoom -- slightly less crisp at extreme zoom but never blank

### Change 2: Guard entryRemoved to prevent re-render loops

**File:** `NativePdfViewerV2Activity.java`

The current `entryRemoved` override schedules a re-render when a visible page is evicted. But if the bitmap is too large for the cache, this creates an infinite loop. Add a guard:
- Track whether a re-render was already triggered for a given page within the last 500ms
- If the same page gets evicted again within that window, skip the re-render (the bitmap simply cannot fit in cache at this resolution)

### Change 3: Increase cache size for zoomed state

**File:** `NativePdfViewerV2Activity.java`

Change cache from `maxMemory / 8` to `maxMemory / 5`. This gives more headroom for zoomed bitmaps while still being safe on memory. On a 256MB heap, this increases cache from 32MB to 51MB.

## Technical Details

### File Modified
- `native/android/app/src/main/java/app/onetap/access/NativePdfViewerV2Activity.java`

### Specific Changes

1. **New field** `cacheMaxBytes` -- store the cache capacity in bytes for budget calculation

2. **New method** `getMaxRenderScale(int pageWidth, int pageHeight)` -- returns the maximum pixel scale factor such that `pageW * pageH * 4 <= cacheMaxBytes / 6`. Returns `Float.MAX_VALUE` if no capping needed.

3. **Modify `renderPage`** (lines 427-436): After computing `bmpW`/`bmpH` from `baseScale * targetZoom`, apply:
   ```
   float maxScale = getMaxRenderScale(pageWidth, pageHeight);
   if (scale > maxScale) { scale = maxScale; bmpW/bmpH recalculated }
   ```
   Then pass through existing `getSafeBitmapDimensions`.

4. **Modify cache init** (line 159): Change `/8` to `/5` for larger cache budget.

5. **Add re-render throttle map** `ConcurrentHashMap<Integer, Long> evictReRenderTimes` to `entryRemoved`:
   - Before scheduling re-render, check if this page was re-rendered within the last 500ms
   - If yes, skip (prevents infinite loop)
   - If no, update timestamp and schedule

### What This Does NOT Change
- Drawing logic in `onDraw` -- Canvas already scales bitmaps to screen size via `drawBitmap(bmp, null, drawRect, paint)`, so capped-resolution bitmaps are upscaled automatically
- Zoom level tracking, gesture handling, panning -- all unchanged
- Cache key structure -- still uses zoom bucket, so different zoom levels have different keys

### Visual Impact
- At zoom 1.0x-1.5x: no difference (bitmaps already fit in cache)
- At zoom 1.5x-3.0x: very slightly less crisp text (rendered at ~1.5x resolution, displayed at 2-3x) but pages are always visible
- At zoom 3.0x-5.0x: noticeable softness but fully functional (same behavior as Google Drive)
- All zoom levels: pages NEVER go blank

### Testing Checklist
- Open a PDF and double-tap to zoom to 2.5x -- all visible pages should remain visible (not blank)
- Pinch zoom to 4x or 5x -- pages should be slightly soft but never blank
- Scroll while zoomed in -- pages should remain rendered, never flash blank
- Zoom back to 1.0x -- pages should re-render at full crispness
- Open a 50+ page PDF at zoom 1.0x -- verify no regression in normal scroll performance

