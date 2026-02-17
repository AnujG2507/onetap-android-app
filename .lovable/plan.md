

# Fix PDF Viewer Zoom Stability and Resume

## Problems Identified

### 1. Zoom-out "page size mismatch" during commit
When `onScaleEnd` fires, `committedZoom` is immediately set to the new zoom level (line 382), but the actual layout commit (`notifyItemRangeChanged`) doesn't happen until 180ms later. During this gap, `dispatchDraw` thinks layouts are at the new `committedZoom` and applies no canvas transform, but pages still have stale layout params from the previous zoom. This causes a visible jump -- some pages appear at wrong sizes.

### 2. Only visible pages get layout updates on zoom-out
`commitZoomAndRerender()` at line 1640-1648 only calls `notifyItemRangeChanged` for currently visible pages. Pages just outside the visible range retain their old layout heights. When they scroll into view, they appear at the wrong size until `onBindViewHolder` re-measures them.

### 3. `updatePageBitmap` skips layout correction when zoomed out
Fix 3 (line 2668) guards layout param updates with `if (currentZoom >= 1.0f)`. When zoomed out, bitmap swaps never fix stale page heights, so a page bound at zoom 0.8 but now at zoom 0.5 keeps its old height.

### 4. Resume at non-1.0x zoom never commits layout
On restore (line 1231-1234), `setZoom` is called but `commitZoomAndRerender()` is never invoked. Pages display at 1.0x layout params while the canvas applies a zoom transform, causing a mismatch.

---

## Fixes

### Fix A: Don't update `committedZoom` until actual commit
Move `committedZoom = zoomLevel` from `onScaleEnd` into `commitZoomAndRerender()`. During the 180ms settling delay, `dispatchDraw` will continue using the canvas delta transform (since `isGestureActive` will remain true until commit), preventing the size jump.

This requires keeping `isGestureActive = true` through the settling delay and only setting it to `false` when `commitZoomAndRerender()` runs.

### Fix B: Notify full adapter range on zoom-out commit
In `commitZoomAndRerender()`, when `currentZoom < 1.0f`, use `notifyDataSetChanged()` or at minimum expand the range to include pre-rendered pages (`first - PRERENDER_PAGES` to `last + PRERENDER_PAGES`). This ensures all bound pages (not just visible) get correct heights.

### Fix C: Allow layout correction in `updatePageBitmap` at all zoom levels
Remove the `currentZoom >= 1.0f` guard in `updatePageBitmap`. Apply the 1px threshold check at all zoom levels so that bitmap swaps can fix stale page heights regardless of zoom state.

### Fix D: Call `commitZoomAndRerender()` after resume zoom restore
After setting the zoom on resume (line 1231-1234), post a `commitZoomAndRerender()` call so layouts match the restored zoom level.

---

## Technical Details

### File: `NativePdfViewerActivity.java`

**Change 1 -- `onScaleEnd` in ZoomableRecyclerView (lines 379-395)**
- Remove `isGestureActive = false` and `committedZoom = zoomLevel`
- Keep gesture active through the settling delay

**Change 2 -- `commitZoomAndRerender()` (lines 1634-1652)**
- Add `recyclerView.commitGestureEnd()` call that sets `isGestureActive = false` and updates `committedZoom`
- Expand notification range to `first - PRERENDER_PAGES` through `last + PRERENDER_PAGES` (clamped to adapter bounds)

**Change 3 -- New method `commitGestureEnd()` in ZoomableRecyclerView**
- Sets `isGestureActive = false`
- Sets `committedZoom = zoomLevel`
- Calls `invalidate()`

**Change 4 -- `updatePageBitmap` (lines 2666-2679)**
- Remove the `if (currentZoom >= 1.0f)` guard
- Apply layout correction at all zoom levels using the 1px threshold

**Change 5 -- Resume restore (lines 1225-1234)**
- After setting zoom, post `commitZoomAndRerender()` via `recyclerView.post()`

---

## What Does NOT Change

- No new UI elements or controls
- Gesture handling (pinch, pan, scroll) stays identical
- No architecture changes
- Settling delay timing unchanged (180ms)
- Cache strategy unchanged

## Expected Results

- No page size jumps during or after zoom gestures
- Zoom out feels as smooth as zoom in -- no size "correction" flicker
- Resume at non-1.0x zoom displays correctly from the start
- Pages scrolling into view after zoom already have correct heights

