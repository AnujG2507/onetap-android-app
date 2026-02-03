

# Smooth Zoom-Out Enhancement for PDF Viewer

## Problem

When zooming out below 1.0x, the PDF viewer becomes glitchy because:

1. `adapter.notifyDataSetChanged()` is called every 50ms during the pinch gesture (throttled, but still frequent)
2. Each call triggers full RecyclerView rebind - recalculating all visible item layouts, finding cached bitmaps, and updating views
3. This causes visible flickering and layout jumps during the gesture

Meanwhile, zoom above 1.0x is smooth because it only uses canvas transforms (`canvas.scale()`) without any adapter updates.

## Solution: Canvas-Based Scaling During Gesture

Apply the same smooth canvas scaling for ALL zoom levels during the gesture, then commit layout changes only when the gesture ends. This ensures:

- Smooth, consistent zooming at all levels (no flickering)
- Content remains sharp because layouts are only updated once at gesture end
- No compromise on content clarity - bitmaps are re-rendered at final zoom level after gesture

---

## Implementation

### 1. Add Gesture State Tracking

Track when a gesture is active to distinguish between "visual preview" and "committed" state:

```java
// In ZoomableRecyclerView
private boolean isGestureActive = false;
private float committedZoom = 1.0f;  // Zoom level when layouts were last updated
```

### 2. Modify dispatchDraw for Gesture-Aware Scaling

During a gesture, apply canvas scaling for all zoom levels (including below 1.0x):

```java
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    if (isGestureActive) {
        // DURING GESTURE: Canvas-based scaling for all zoom levels
        // This avoids triggering layout updates that cause flickering
        float scaledContentWidth = getWidth() * zoomLevel;
        float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
        
        canvas.translate(effectivePanX, panY);
        canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    } else if (zoomLevel < 1.0f) {
        // COMMITTED ZOOMED OUT: Layouts already scaled, no canvas transform needed
        // Pages are centered via Gravity.CENTER_HORIZONTAL in adapter
    } else if (zoomLevel > 1.0f) {
        // COMMITTED ZOOMED IN: Canvas-based pan + scale
        float scaledContentWidth = getWidth() * zoomLevel;
        float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
        
        canvas.translate(effectivePanX, panY);
        canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    }
    // At 1.0x committed: No transformation needed
    
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

### 3. Update Scale Gesture Callbacks

Set `isGestureActive` flag in the scale detector and remove throttled layout updates:

```java
// In ScaleGestureDetector.onScaleBegin:
isGestureActive = true;

// In ScaleGestureDetector.onScaleEnd:
isGestureActive = false;
committedZoom = zoomLevel;
```

### 4. Remove Throttled Layout Updates During Gesture

In `onScale()` callback, remove the `notifyDataSetChanged()` call:

```java
@Override
public void onScale(float newZoom, float fx, float fy) {
    currentZoom = newZoom;
    // REMOVED: Throttled adapter.notifyDataSetChanged() during gesture
    // Canvas transform now handles visual scaling smoothly
}
```

### 5. Commit Layout Changes Only at Gesture End

Update `onScaleEnd()` to trigger the adapter update once:

```java
@Override
public void onScaleEnd(float finalZoom) {
    isScaling = false;
    previousZoom = currentZoom;
    currentZoom = finalZoom;
    
    // Commit layout changes NOW (single update instead of many during gesture)
    if (finalZoom < 1.0f && adapter != null) {
        adapter.notifyDataSetChanged();
    }
    
    // Trigger high-res re-render at final zoom
    commitZoomAndRerender();
}
```

### 6. Update Double-Tap Animation for Consistency

Ensure double-tap zoom also uses canvas scaling during animation:

```java
// In animateZoomTo(), track animation as a gesture
isGestureActive = true;

// In onAnimationEnd:
isGestureActive = false;
committedZoom = targetZoom;
if (targetZoom < 1.0f && adapter != null) {
    adapter.notifyDataSetChanged();
}
```

---

## Content Clarity Guarantee

This approach ensures **no compromise on content clarity**:

| Phase | Behavior |
|-------|----------|
| During gesture | Canvas scales existing bitmaps (may be slightly soft) |
| Gesture ends | Layout updates + high-res bitmaps rendered at final zoom |
| Result | Sharp, clear content at the committed zoom level |

The slight softness during the gesture is imperceptible because:
1. Fingers are actively moving, so the user isn't examining detail
2. The gesture typically lasts < 1 second
3. Sharp rendering happens immediately at gesture end

---

## File to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Add `isGestureActive`/`committedZoom` fields, update `dispatchDraw()`, modify scale callbacks, update `animateZoomTo()` |

---

## Testing Checklist

- [ ] Zoom out from 1.0x to 0.3x: Smooth transition, no flickering
- [ ] Release pinch at 0.5x: Layouts update once, pages remain sharp
- [ ] Zoom in from 0.3x to 2.5x in one gesture: Seamless, no layout jumps
- [ ] Double-tap zoom to 0.2x: Smooth animation, sharp result
- [ ] Scroll while zoomed out: Train view pages bind correctly with proper bitmaps
- [ ] Orientation change during zoom: Layouts recalculate correctly

