
# PDF Viewer UX Improvements: Drive-Quality Zoom and Header

## Overview
This plan addresses three key issues with the current PDF viewer to match Google Drive's premium experience:
1. Pages overlap during pinch-to-zoom due to ImageView scaling
2. Page dimensions don't properly match PDF aspect ratios during zoom
3. Missing auto-hiding header with "Open in other apps" functionality

---

## Issue 1: Page Overlap During Zoom

### Current Problem
The viewer applies `setScaleX()/setScaleY()` to individual `ImageView` items within the RecyclerView. This scales the visual content but **does not update layout bounds**, causing:
- Pages visually expand beyond their allocated space
- Adjacent pages overlap during pinch gesture
- Layout "snaps" back when touch ends and high-res bitmaps arrive

### Solution: Container-Level Zoom with Custom RecyclerView
Instead of scaling individual children, apply a single transform to the entire RecyclerView's drawing canvas. This is how Google Drive handles it.

**Implementation approach:**
1. Create a custom `ZoomableRecyclerView` class that extends `RecyclerView`
2. Override `dispatchDraw()` to apply a canvas-level scale transformation
3. The focal point of the pinch determines the zoom anchor
4. Horizontal panning is enabled when zoomed in (content wider than screen)
5. Remove all `setScaleX/setScaleY` calls from individual ImageViews

**Key code changes:**
```java
// In ZoomableRecyclerView.dispatchDraw()
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    // Apply zoom centered on focal point
    canvas.translate(panX, 0);
    canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

**Benefits:**
- All children scale uniformly without overlapping
- RecyclerView layout remains stable
- Panning and zooming feel identical to Google Drive

---

## Issue 2: Page Frame Not Matching PDF Size

### Current Problem
The page height calculation doesn't account for the canvas-level zoom, and during visual scaling the aspect ratio appears distorted.

### Solution: Separate Layout Size from Visual Zoom
1. **Layout dimensions** remain at 1.0x zoom (based on screen width fit)
2. **Visual zoom** is applied at the canvas level via the custom RecyclerView
3. Re-render bitmaps at the target resolution after zoom gesture ends

**Implementation:**
- Remove `currentZoom` from `getScaledPageHeight()` - layouts always use 1.0x dimensions
- Canvas-level scaling handles the visual zoom
- When gesture ends, trigger high-res re-render at the committed zoom level
- The bitmap resolution matches the visual size for crisp display

```java
// Layout height calculation (always 1.0x)
private int getScaledPageHeight(int pageIndex) {
    float scale = (float) screenWidth / pageWidths[pageIndex];
    return (int) (pageHeights[pageIndex] * scale);
}
```

---

## Issue 3: Auto-Hiding Header with "Open in Other Apps"

### Current State
- Top bar exists with close button and page indicator
- Hides after 6 seconds or on tap
- No scroll-based hiding
- No "Open in other apps" option

### Solution: Enhanced Header UX

**A. Scroll-Based Auto-Hide:**
Add a scroll listener to the RecyclerView that:
- Hides header when user scrolls down (reading)
- Shows header when user scrolls up (navigating)
- Uses a small threshold to avoid jitter

```java
// Scroll direction detection
recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
    @Override
    public void onScrolled(RecyclerView rv, int dx, int dy) {
        if (dy > 10) hideTopBar();      // Scrolling down
        else if (dy < -10) showTopBar(); // Scrolling up
    }
});
```

**B. Add "Open with..." Button:**
Add a share/open button to the top bar that launches an Intent chooser:
- Position: Right side of top bar, next to page indicator
- Icon: Standard Android "open in browser" or "share" icon
- Action: `Intent.ACTION_VIEW` with the PDF URI and `application/pdf` MIME type

```java
// Open in external app
Intent intent = new Intent(Intent.ACTION_VIEW);
intent.setDataAndType(pdfUri, "application/pdf");
intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
startActivity(Intent.createChooser(intent, null));
```

**C. Header Layout Update:**
```text
┌─────────────────────────────────────────┐
│  [X]              1 / 24         [↗]    │
│   ↑                 ↑             ↑     │
│ Close           Page #      Open with   │
└─────────────────────────────────────────┘
```

---

## Technical Changes Summary

### File: `NativePdfViewerActivity.java`

1. **Create inner class `ZoomableRecyclerView`** (new, ~80 lines)
   - Extends RecyclerView
   - Maintains `zoomLevel`, `panX`, `focalX`, `focalY` state
   - Overrides `dispatchDraw()` to apply canvas transform
   - Handles horizontal pan bounds (clamps to content width)
   - Exposes `setZoom()`, `animateZoomTo()`, `resetZoom()` methods

2. **Update `buildUI()`** (~15 lines changed)
   - Replace `new RecyclerView()` with `new ZoomableRecyclerView()`
   - Add "Open with" button to top bar
   - Store PDF URI as class field for Intent launching

3. **Update `setupGestureDetectors()`** (~40 lines changed)
   - Remove ImageView `setScaleX/setScaleY` calls from `applyVisualZoom()`
   - Call `zoomableRecyclerView.setZoom()` instead
   - Move focal point tracking to the custom RecyclerView

4. **Simplify `animateDoubleTapZoom()`** (~20 lines changed)
   - Animate via `zoomableRecyclerView.animateZoomTo()`
   - Remove per-child scale manipulation

5. **Update scroll listener** (~10 lines added)
   - Add direction-based header show/hide

6. **Simplify `PdfPageAdapter`** (~20 lines removed)
   - Remove all scale reset logic from `updatePageBitmap()`
   - Remove `pendingZoomSwap` tracking (no longer needed)

7. **Update `getScaledPageHeight()`** (~2 lines changed)
   - Remove `currentZoom` multiplier

8. **Add "Open with" intent handler** (~15 lines added)
   - Store URI in class field
   - Create intent chooser on button click

---

## Expected Behavior After Changes

| Interaction | Before | After |
|-------------|--------|-------|
| Pinch zoom | Pages overlap, then snap | Smooth unified zoom, no overlap |
| Double-tap zoom | Works, slight jitter | Smooth animated zoom |
| Scroll while zoomed | Vertical only | Horizontal pan + vertical scroll |
| Scroll down | Header stays | Header hides |
| Scroll up | Header stays | Header shows |
| Tap screen | Toggle header | Toggle header (unchanged) |
| "Open with" | Not available | Opens PDF in Drive, Adobe, etc. |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| RecyclerView recycling during zoom | Canvas transform doesn't affect recycling - items still bind normally |
| Pan bounds calculation | Clamp `panX` to `0...(contentWidth * zoom - screenWidth)` |
| Bitmap resolution mismatch | Re-render at committed zoom after gesture ends |
| Performance during zoom | Canvas transform is GPU-accelerated, very fast |

---

## Testing Checklist

After implementation, verify:
- [ ] No page overlap during pinch-to-zoom
- [ ] Smooth zoom in/out transitions
- [ ] Horizontal panning works when zoomed in
- [ ] Double-tap zoom centers on tap point
- [ ] Header hides on scroll down, shows on scroll up
- [ ] Tap toggles header visibility
- [ ] "Open with" button launches intent chooser
- [ ] Page numbers display correctly
- [ ] Resume position works after closing
- [ ] No crashes on large PDFs
