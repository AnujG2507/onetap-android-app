
# Stabilize Native PDF Viewer to Drive-Level Smoothness

## Overview

Seven targeted fixes addressing the ranked instability causes. No new features, no architecture changes, no user-facing behavior changes. Pure stability polish.

---

## Fix 1: Zoom Commit Settling Delay (Highest Visual Impact)

**Problem**: `commitZoomAndRerender()` fires instantly on gesture end, causing visible resolution snaps.

**Change in** `onScaleEnd` callback (line ~1552-1559):
- Instead of calling `commitZoomAndRerender()` immediately, post it with a 180ms delay via `mainHandler.postDelayed()`
- Store the delayed runnable so it can be cancelled if a new gesture starts before it fires
- Cancel the pending commit in `onScaleBegin`

**Why**: Users are still visually processing the zoom when the gesture ends. A short delay lets the eye settle before bitmap swap, making the transition feel continuous rather than staged.

---

## Fix 2: Replace `notifyDataSetChanged()` with Targeted Updates

**Problem**: `commitZoomAndRerender()` at line 1614-1616 calls `notifyDataSetChanged()` for sub-1.0x zoom, causing full adapter rebind (layout storm).

**Change in** `commitZoomAndRerender()`:
- Replace `adapter.notifyDataSetChanged()` with `notifyItemRangeChanged(first, last - first + 1)` using the visible range from `LinearLayoutManager`
- Only update items that are actually visible, not the entire dataset

**Why**: Full rebind triggers measure/layout for every bound page. Targeted updates only re-layout visible pages, eliminating the stutter.

---

## Fix 3: Eliminate Layout Thrashing in `updatePageBitmap`

**Problem**: Lines 2468-2479 call `setLayoutParams()` on both the ImageView and wrapper during bitmap swap, triggering measure/layout passes while the user is reading.

**Change in** `updatePageBitmap()`:
- Only call `setLayoutParams()` if the height actually differs by more than 1px (already partially guarded but wrapper params are always set)
- Move the wrapper `setLayoutParams` inside the existing `params.height != height` guard
- At zoom >= 1.0x, page heights should already be stable from `onBindViewHolder`, so skip layout changes entirely during bitmap updates unless the page hasn't been laid out yet

**Why**: Layout params changes during scroll cause micro-stutters. Bitmap swaps should be image-only operations.

---

## Fix 4: Stale Render Task Cancellation

**Problem**: Fast scrolling floods the 3-thread executor with render tasks for pages no longer visible. `renderGeneration` prevents display but not computation -- bitmaps are still allocated, rendered, then discarded.

**Changes**:
1. Add a `Set<Integer> visiblePages` field (ConcurrentHashMap-backed) that tracks currently visible page indices
2. Update it in `prerenderNearbyPages()` and `onScrolled()`
3. At the start of `renderPageAsync()`, after the generation check, add a visibility check: if the page is far from visible range (more than PRERENDER_PAGES away from any visible page), return early without rendering
4. Before bitmap allocation in the high-res pass, re-check generation to avoid allocating a bitmap that will be immediately discarded

**Why**: Frees executor capacity for visible pages. Reduces memory pressure from phantom allocations.

---

## Fix 5: Async Page Dimension Scanning (First Frame Latency)

**Problem**: `openPdf()` at lines 1665-1670 synchronously opens and closes every page to cache dimensions. For a 500-page PDF, this blocks the UI thread for several seconds.

**Changes**:
1. In `openPdf()`, only scan the first ~10 pages synchronously (enough for initial display)
2. Move remaining page scanning to a background thread via `renderExecutor.execute()`
3. Use a volatile `int scannedPageCount` to track progress
4. `getItemCount()` returns `scannedPageCount` instead of full length until scanning completes
5. When background scanning finishes, post `notifyItemRangeInserted()` to add remaining pages
6. `getScaledPageHeight()` for un-scanned pages falls back to the average of scanned pages (prevents layout jumps)

**Why**: First page appears immediately. User can start reading while remaining pages are scanned in background.

---

## Fix 6: Graceful OOM Cache Eviction

**Problem**: Line 2253-2255 calls `bitmapCache.evictAll()` on any OOM, causing all visible pages to go gray simultaneously.

**Changes**:
1. Replace `evictAll()` with targeted eviction: evict non-visible pages first
2. Strategy: iterate cache snapshot, remove entries for pages outside `[firstVisible - 2, lastVisible + 2]` range
3. If still OOM after targeted eviction, evict low-res entries for visible pages (keep high-res)
4. Only fall back to `evictAll()` as absolute last resort
5. Wrap the low-res `Bitmap.createBitmap()` call (line 2140) in its own try/catch for OOM -- if low-res allocation fails, skip to high-res instead of failing entirely

**Why**: Partial eviction keeps visible content on screen. User never sees all pages vanish at once.

---

## Fix 7: Risk Cleanup (Low-Risk, High-Value)

### 7a. Cache Key Precision Pollution
**Problem**: `String.format("%.2f", zoom)` creates near-duplicate entries for zoom 1.004 vs 1.006.

**Change in** `getCacheKey()` (line 2009-2011):
- Round zoom to 1 decimal place: `String.format(Locale.US, "%.1f", zoom)`
- This reduces cache entries by ~10x during pinch gestures

### 7b. Header Animation Layout Passes
**Problem**: `hideTopBar()` animates `headerSpace.setLayoutParams()` every frame (line 1906-1909), triggering layout passes during reading.

**Change**:
- Replace the height animation with `headerSpace.setTranslationY(-height)` which is GPU-composited and does not trigger layout
- On show, animate `translationY` back to 0
- Keep the `headerSpace` at fixed height, only translate it off-screen

### 7c. Low-res Bitmap OOM Safety
**Problem**: No dedicated OOM catch around low-res bitmap allocation.

**Change**: Wrap the `Bitmap.createBitmap()` at line 2140 in try/catch for `OutOfMemoryError`. On failure, skip low-res and proceed directly to high-res attempt (or skip entirely).

---

## Files Changed

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | All 7 fixes above -- settling delay, targeted adapter updates, layout thrash guard, stale task cancellation, async page scan, graceful OOM, risk cleanup |

## What Does NOT Change

- No new UI elements, controls, or modes
- No changes to gesture handling (pinch, pan, scroll remain identical)
- No tiled rendering or OpenGL
- No changes to resume state, fast scroll, or header design
- No changes to public behavior or feature set

## Definition of Success

After these changes:
- Zoom feels continuous -- no visible resolution snap on release
- Scroll never flashes gray during normal reading speed
- Large PDFs (500+ pages) open without UI blocking
- OOM never causes all-pages-gray
- Header show/hide is GPU-composited, no layout jank
- Bitmap cache stays lean during pinch gestures
