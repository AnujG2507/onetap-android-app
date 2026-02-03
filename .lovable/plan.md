

# Fix: Zoom-Out Support with Consistent Gap Behavior

## Problem Analysis

### Issue 1: No Zoom-Out Capability
Current `MIN_ZOOM = 1.0f` prevents zooming out. Users cannot see multiple pages at once for faster navigation through large documents.

### Issue 2: Potential Gap Issues During Zoom-Out
The current canvas-level zoom approach scales the entire RecyclerView drawing. When zooming out:
- Pages shrink visually
- But gaps (8dp fixed decoration) would also shrink proportionally with canvas scale
- The relative gap-to-page ratio stays the same, so gaps should remain proportional

However, to allow viewing ~5 pages at once, we need MIN_ZOOM ≈ 0.2 (1/5), which requires careful handling.

## Solution

### 1. Adjust Zoom Range Constants

```java
// Before
private static final float MIN_ZOOM = 1.0f;
private static final float MAX_ZOOM = 5.0f;
private static final float DOUBLE_TAP_ZOOM = 2.5f;

// After
private static final float MIN_ZOOM = 0.2f;   // Show ~5 pages
private static final float MAX_ZOOM = 5.0f;
private static final float DOUBLE_TAP_ZOOM = 2.5f;
private static final float FIT_PAGE_ZOOM = 1.0f;  // Default fit-to-width
```

### 2. Update ZoomableRecyclerView Pan/Zoom Logic

When zoomed out (zoomLevel < 1.0), the content is smaller than the screen width. We need to:
- Center the content horizontally (no panning needed when content fits)
- Disable horizontal pan when zoomed out
- Ensure focal point behavior works correctly for zoom-out gestures

```java
private void clampPan() {
    // When zoomed out or at 1.0x, center content (no pan)
    if (zoomLevel <= 1.0f) {
        panX = 0;
        return;
    }
    // When zoomed in, allow panning
    float contentWidth = getWidth() * zoomLevel;
    float maxPan = contentWidth - getWidth();
    panX = Math.max(-maxPan, Math.min(0, panX));
}

@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    // When zoomed out, center content horizontally
    float translateX = panX;
    if (zoomLevel < 1.0f) {
        // Center the scaled content
        float scaledWidth = getWidth() * zoomLevel;
        translateX = (getWidth() - scaledWidth) / 2f;
    }
    
    canvas.translate(translateX, 0);
    canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

### 3. Update Double-Tap Behavior

Current double-tap toggles between 1.0x and 2.5x. With zoom-out support, a more intuitive behavior:
- If zoomed out (< 1.0x): tap to fit-to-width (1.0x)
- If at fit-to-width (≈ 1.0x): tap to zoom in (2.5x)
- If zoomed in (> 1.5x): tap to fit-to-width (1.0x)

```java
@Override
public boolean onDoubleTap(MotionEvent e) {
    if (isDoubleTapAnimating) return true;
    
    float targetZoom;
    if (currentZoom < 0.9f) {
        // Zoomed out → fit to width
        targetZoom = FIT_PAGE_ZOOM;
    } else if (currentZoom > 1.5f) {
        // Zoomed in → fit to width
        targetZoom = FIT_PAGE_ZOOM;
    } else {
        // At fit → zoom in
        targetZoom = DOUBLE_TAP_ZOOM;
    }
    
    animateDoubleTapZoom(currentZoom, targetZoom, e.getX(), e.getY());
    return true;
}
```

### 4. Horizontal Panning Guard

Ensure horizontal panning is only enabled when zoomed in (content wider than screen):

```java
@Override
public boolean onInterceptTouchEvent(MotionEvent e) {
    // Only intercept for horizontal panning when zoomed IN
    if (zoomLevel > 1.0f && e.getPointerCount() == 1) {
        return true;
    }
    return super.onInterceptTouchEvent(e);
}

@Override
public boolean onTouchEvent(MotionEvent e) {
    // Handle horizontal panning only when zoomed in
    if (zoomLevel > 1.0f) {
        // ... existing panning logic
    }
    return super.onTouchEvent(e);
}
```

### 5. Update Scale Gesture MIN_ZOOM Reference

In `setZoom()` and `updateZoomGesture()`, the clamping already uses `MIN_ZOOM` constant, so changing that value will automatically allow zoom-out.

## Technical Changes

### File: `NativePdfViewerActivity.java`

| Line | Change |
|------|--------|
| 77 | Change `MIN_ZOOM` from `1.0f` to `0.2f` |
| 79 | Add `FIT_PAGE_ZOOM = 1.0f` constant |
| 192-203 | Update `dispatchDraw()` to center content when zoomed out |
| 205-211 | Update `onInterceptTouchEvent()` to only intercept when zoomed in |
| 279-291 | Update `clampPan()` (already correct, just verify) |
| 752-766 | Update double-tap logic to handle zoom-out state |

## Expected Behavior After Changes

| Gesture | Before | After |
|---------|--------|-------|
| Pinch out (zoom out) | Stops at 1.0x | Goes to 0.2x (5 pages visible) |
| Pinch in (zoom in) | Works up to 5x | Same |
| Double-tap when zoomed out | N/A | Animates to 1.0x fit-to-width |
| Double-tap at 1.0x | Zooms to 2.5x | Same |
| Double-tap when zoomed in | Returns to 1.0x | Same |
| Horizontal pan when zoomed out | N/A | Disabled (content centered) |
| Horizontal pan when zoomed in | Works | Same |
| Page gaps when zoomed out | N/A | Scale proportionally (no large gaps) |

## Visual Representation

```text
At MIN_ZOOM (0.2x):
┌─────────────────────────────────────┐
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐ │
│  │ P1  │  │ P2  │  │ P3  │  │ P4  │ │
│  └─────┘  └─────┘  └─────┘  └─────┘ │
│  ┌─────┐                            │
│  │ P5  │  ...                       │
│  └─────┘                            │
└─────────────────────────────────────┘
Content is centered, pages visible with proportional gaps

At FIT_PAGE_ZOOM (1.0x):
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │           Page 1                │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │           Page 2                │ │
└─────────────────────────────────────┘
Pages fill width, normal reading mode

At MAX_ZOOM (5.0x):
┌─────────────────────────────────────┐
│ ┌───────────────────────────────────│──...
│ │                                   │
│ │     Detail of Page 1              │
│ │                                   │
│ │     (pan left/right to see more)  │
│ │                                   │
└─────────────────────────────────────┘
Pan enabled to see full width
```

## Testing Checklist

- [ ] Pinch out allows zooming to ~0.2x (5 pages visible)
- [ ] Content stays centered when zoomed out (no horizontal drift)
- [ ] Page gaps remain proportional (no large gaps at zoom-out)
- [ ] Pinch in still works up to 5x
- [ ] Double-tap from zoomed-out returns to 1.0x
- [ ] Double-tap from 1.0x zooms to 2.5x
- [ ] Double-tap from zoomed-in returns to 1.0x
- [ ] Horizontal pan disabled when zoomed out
- [ ] Horizontal pan works when zoomed in
- [ ] Resume position saves/restores zoom correctly for < 1.0x values
- [ ] Smooth animations during zoom transitions

