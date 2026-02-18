

# Fix: Visible Pages Going Blank on Touch/Scroll

## Root Cause

The `LruCache` evicts bitmaps based on least-recently-used order, with **no awareness of which pages are currently visible**. When a new page render completes and gets inserted into the cache, LruCache may evict a bitmap for a page that is still on screen. That page immediately appears blank until it gets re-rendered.

This is exacerbated by `renderAfterSettle`, which runs on every `ACTION_UP` (line 1462-1463). It calls `renderGeneration.incrementAndGet()` + `pendingRenders.clear()`, which **invalidates all in-flight renders**. So:

1. User touches the screen (even a light tap that triggers `ACTION_UP`)
2. `renderAfterSettle` fires after 100ms
3. All pending renders are cancelled via generation increment
4. New renders are requested for visible pages
5. While those renders execute, old cache entries for visible pages may have already been evicted by earlier cache insertions
6. Result: visible pages go blank for the duration of the re-render

## Fix (Two Changes)

### Change 1: Add LruCache eviction protection for visible pages

Override `entryRemoved` on the `LruCache` to prevent eviction of pages currently in the visible range. When the cache tries to evict a visible page's bitmap, re-insert it to keep it alive.

Specifically:
- Track the current visible page range in a field (`visibleFirst`, `visibleLast`) updated during `onDraw`
- In `LruCache.entryRemoved()`, if the evicted page is within the visible range and eviction was automatic (not explicit removal), re-add the bitmap to the cache after a short delay to prevent it from being lost

A simpler and safer approach: increase cache protection by **not incrementing renderGeneration on simple touch releases**. The generation increment should only happen during zoom changes, not on every finger lift.

### Change 2: Stop invalidating renders on every touch release

The `renderAfterSettle` callback increments `renderGeneration`, which cancels ALL in-flight renders. This is appropriate after a zoom change (where resolution needs updating) but destructive during normal scrolling.

**Fix:** Split into two callbacks:
- `renderAfterZoom`: Increments generation + clears pending + re-requests (used after zoom/double-tap)
- `renderAfterScroll`: Only calls `requestVisiblePageRenders()` WITHOUT incrementing generation (used after scroll/touch/fling)

This way, normal scrolling never cancels in-flight renders. Only zoom-level changes trigger a full re-render cycle.

### Change 3: Protect visible pages from cache eviction

Add an `entryRemoved` override to the `LruCache` that checks whether the evicted page is currently visible. If it is, schedule an immediate re-render for that page rather than letting it stay blank.

## Technical Details

### File Modified
- `native/android/app/src/main/java/app/onetap/access/NativePdfViewerV2Activity.java`

### Specific Changes

1. **LruCache `entryRemoved` override** (lines 159-164): Add callback that detects when a visible page's bitmap is evicted and immediately schedules a re-render for it.

2. **Add `visibleFirst`/`visibleLast` tracking fields** to PdfDocumentView, updated in `onDraw` (line 1205).

3. **Split `renderAfterSettle`** (line 894-898) into:
   - `renderAfterZoom`: keeps current behavior (increment generation + clear + re-request) -- used only after `onScaleEnd` and `animateZoomTo`
   - `renderAfterScroll`: just calls `requestVisiblePageRenders()` without generation increment -- used in `ACTION_UP`, `computeScroll`, and `fsScrollToY`

4. **Update all callsites**:
   - `onScaleEnd` (line 1036-1037): use `renderAfterZoom`
   - `animateZoomTo` end (line 1501-1503): use `renderAfterZoom`
   - `ACTION_UP` handler (line 1462-1463): use `renderAfterScroll`
   - `computeScroll` fling end (line 1404-1405): use `renderAfterScroll`
   - `fsScrollToY` (line 1376-1377): use `renderAfterScroll`

### Testing Checklist
- Open a multi-page PDF where 2-3 pages are visible at once
- Tap on the lower page -- the upper page should NOT go blank
- Scroll slowly through pages -- no visible page should ever flash blank
- Pinch to zoom in and out -- pages should re-render at correct resolution without blanking
- Fast-scroll drag through a long PDF -- pages should render progressively, never stuck blank
