

# Fix: PDF Viewer Gaps, Limited Zoom-Out Pages, and Fast Scroll

## Problem Summary

The user reports three issues with the PDF viewer:

1. **Large gaps/delays in content loading** - Pages appear after significant delay
2. **Only 3 pages visible when zoomed out** - At MIN_ZOOM (0.2x), the user expects to see more pages as a "train" view
3. **No fast scroll capability** - Need a scroll thumb/indicator to quickly navigate large documents (like Google Drive)

---

## Root Cause Analysis

### Issue 1: Content Loading Gaps

Looking at the rendering logic:
- **Low-res first, high-res second**: The system renders a low-res preview (0.5x scale) then a high-res version
- **Only 2 pages pre-rendered**: `PRERENDER_PAGES = 2` means only 2 pages above/below are cached
- **White placeholder shown**: When no cached bitmap exists, the page shows white (`holder.imageView.setBackgroundColor(0xFFFFFFFF)`)

The delay is caused by:
1. Low pre-render count (only 5 pages total: current ± 2)
2. Rendering on background threads with no instant placeholder
3. Layout dimensions calculated correctly, but bitmaps not ready yet

### Issue 2: Only 3 Pages Visible at Max Zoom-Out

Current MIN_ZOOM is 0.2x, which should show ~5 pages. The user sees only 3. This suggests:

1. **Page heights are too large**: At 1.0x, each page fills most of the screen height
2. **Zoom scaling center**: When zoomed out, the canvas scales from center but layout remains at 1.0x
3. **Limited viewport**: At 0.2x, 5 full pages fit mathematically, but RecyclerView may only have 3 bound

The fundamental issue: **Layout dimensions stay at 1.0x while canvas scales visually**. This means RecyclerView thinks it needs large pages and only binds a few, even though visually they're tiny.

**Better approach**: When zoomed out, adjust layout heights proportionally so more ViewHolders are bound and visible.

### Issue 3: No Fast Scroll

The viewer has no fast scroll indicator. For 121-page documents (like in the logs), users need a way to jump quickly. Google Drive shows:
- A draggable scroll thumb on the right edge
- A page number popup when dragging

---

## Solution Design

### Fix 1: Increase Pre-render and Add Immediate Placeholders

Increase `PRERENDER_PAGES` from 2 to 4-6 for smoother scrolling with more pages ready. Additionally, show a low-res placeholder immediately from cache when available.

### Fix 2: Dynamic Layout Heights When Zoomed Out

**Key insight**: Google Drive keeps layout at 1.0x and uses canvas zoom for visual scaling. But we need to ensure more pages are bound when zoomed out.

The solution:
1. Keep layout at 1.0x for zoom ≥ 1.0
2. When zoom < 1.0, scale layout heights proportionally so RecyclerView binds more pages
3. This creates the "train of pages" effect

Changes to `getScaledPageHeight()`:
```java
private int getScaledPageHeight(int pageIndex) {
    if (pageWidths == null || pageIndex < 0 || pageIndex >= pageWidths.length) {
        return screenHeight / 2;
    }
    float scale = (float) screenWidth / pageWidths[pageIndex];
    int baseHeight = (int) (pageHeights[pageIndex] * scale);
    
    // When zoomed out, scale layout heights to show more pages
    float layoutZoom = Math.min(1.0f, currentZoom);
    return (int) (baseHeight * layoutZoom);
}
```

And update `dispatchDraw()` to NOT apply canvas scaling when zoom < 1.0 (since layout already handles it):
```java
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    if (zoomLevel > 1.0f) {
        // ZOOMED IN: Pan + scale from focal point
        canvas.translate(panX, 0);
        canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    }
    // At or below 1.0x: Layout handles sizing, no canvas transform
    
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

### Fix 3: Add Fast Scroll with Page Indicator

Implement a custom fast scroller that:
1. Shows a thumb on the right edge
2. Displays a page number popup when dragging
3. Allows direct jumps by dragging

This requires adding:
1. A `FastScrollView` custom view (thumb + track)
2. Touch handling for drag-to-scroll
3. Page number popup (simple `TextView` positioned near thumb)
4. Auto-hide after inactivity

---

## Technical Implementation

### Phase 1: Fix Content Loading Delays

**File: `NativePdfViewerActivity.java`**

| Change | Details |
|--------|---------|
| Line 84 | Increase `PRERENDER_PAGES` from 2 to 5 |
| `prerenderNearbyPages()` | Prioritize low-res renders for distant pages |
| `onBindViewHolder()` | If no bitmap exists, use a gray gradient placeholder instead of white |

### Phase 2: Dynamic Layout for Zoom-Out

**File: `NativePdfViewerActivity.java`**

| Method | Change |
|--------|--------|
| `getScaledPageHeight()` | Scale height by `min(1.0, currentZoom)` when zoomed out |
| `dispatchDraw()` | Remove canvas scaling for zoom < 1.0 (layout handles it) |
| `commitZoomAndRerender()` | Call `adapter.notifyDataSetChanged()` when zoom changes below 1.0 to trigger re-layout |
| `onScale()` | Live update layout heights during pinch gesture for smooth zoom-out |

### Phase 3: Add Fast Scroll

**New inner class: `FastScrollOverlay`**

```java
private class FastScrollOverlay extends View {
    private Paint thumbPaint;
    private Paint trackPaint;
    private RectF thumbRect;
    private boolean isDragging = false;
    private TextView pagePopup;
    
    // Shows page "15 / 121" while dragging
    // Handles touch to compute scroll position
    // Auto-hides after 1.5s of inactivity
}
```

**Integration:**
1. Add `FastScrollOverlay` to the root `FrameLayout` after `recyclerView`
2. Connect it to RecyclerView scroll events to update thumb position
3. Handle touch events to scroll RecyclerView when thumb is dragged

---

## Visual Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Zoom out to 0.2x | 3 pages visible, large gaps | 8-10 pages visible, continuous train |
| Scroll fast | White flashes, delayed loading | Pre-rendered pages, smooth scroll |
| 121-page document | Must scroll slowly | Drag thumb to jump instantly |
| Page indicator | Only in header (auto-hides) | Popup appears while dragging |

---

## Files to Modify

1. **`NativePdfViewerActivity.java`**
   - Update `PRERENDER_PAGES` constant
   - Modify `getScaledPageHeight()` for zoom-aware layout
   - Update `dispatchDraw()` canvas transformation logic
   - Add layout change notification when zoom crosses 1.0 threshold
   - Add new `FastScrollOverlay` inner class
   - Integrate fast scroll into `buildUI()`
   - Connect scroll listener to update thumb position

---

## Testing Checklist

- [ ] Open 121-page PDF, zoom out fully → should see 8-10 pages
- [ ] Scroll quickly → no white flashes, pages pre-loaded
- [ ] Fast scroll thumb appears on right edge
- [ ] Drag thumb → page popup shows "X / 121"
- [ ] Release thumb → jumps to correct page
- [ ] Thumb auto-hides after 1.5s
- [ ] Pinch zoom still works (in/out)
- [ ] Double-tap zoom still works
- [ ] Resume position (page + zoom) persists

