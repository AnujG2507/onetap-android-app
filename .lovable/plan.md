

# Fix: Eliminate "Squeeze" When Starting Gesture at Zoomed-Out State

## Problem Diagnosis

When the PDF is committed at a zoom level below 1.0x (e.g., 0.5x), the pages are already physically scaled via layout parameters. When the user places two fingers on the screen to begin a pinch gesture, `isGestureActive` becomes `true`, and `dispatchDraw` suddenly applies a canvas scale of 0.5x on top of the already-scaled layouts — effectively scaling the content to 25%.

**This causes the visible "squeeze" or jump as soon as the gesture is detected, even before any pinch movement occurs.**

---

## Solution

When entering gesture mode from a committed zoomed-out state, we must NOT apply canvas scaling immediately. Instead, we should:

1. **Track the zoom baseline**: When `isGestureActive` becomes true, record the `committedZoom` as a "baseline" that layouts already represent
2. **Apply only the DELTA scaling**: During the gesture, canvas should only scale by the ratio `zoomLevel / committedZoom`, not by the absolute `zoomLevel`

This ensures a seamless visual transition:
- At gesture start: `zoomLevel == committedZoom` → canvas scale = 1.0 (no change)
- As user pinches out: `zoomLevel > committedZoom` → canvas scales up smoothly
- As user pinches in: `zoomLevel < committedZoom` → canvas scales down smoothly

---

## Implementation

### 1. Modify `dispatchDraw` to Use Delta Scaling

```java
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    if (isGestureActive) {
        // SMOOTH ZOOM: During gesture, apply DELTA scaling from committed state
        // This prevents the "squeeze" effect when starting gesture at zoomed-out state
        
        // Calculate the visual scale factor relative to committed layouts
        float visualScale = zoomLevel / committedZoom;
        
        if (visualScale != 1.0f) {
            float centerX = getWidth() / 2f;
            float centerY = getHeight() / 2f;
            
            if (zoomLevel < 1.0f) {
                // ZOOMING OUT: Scale from center, no pan
                canvas.scale(visualScale, visualScale, centerX, centerY);
            } else if (committedZoom < 1.0f) {
                // TRANSITIONING from zoomed-out to zoomed-in during gesture
                // Scale from center during this transition
                canvas.scale(visualScale, visualScale, centerX, centerY);
            } else {
                // ZOOMING IN from >= 1.0x: Use focal point and pan
                float scaledContentWidth = getWidth() * zoomLevel;
                float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
                canvas.translate(effectivePanX, panY);
                canvas.scale(visualScale, visualScale, focalX, focalY);
            }
        }
        // visualScale == 1.0f means no transform needed (gesture just started)
    } else if (committedZoom < 1.0f && zoomLevel < 1.0f) {
        // COMMITTED ZOOMED OUT: Layouts already scaled, no canvas transform
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

### 2. Ensure `committedZoom` Is Correct Before Gesture Starts

The `committedZoom` must accurately reflect the current layout state. Verify it's set correctly:
- At initial load: `committedZoom = 1.0f` (default)
- After any `notifyDataSetChanged()`: `committedZoom = zoomLevel`
- After animation completes: `committedZoom = targetZoom`

---

## Technical Explanation

| State | `zoomLevel` | `committedZoom` | `visualScale` | Canvas Effect |
|-------|-------------|-----------------|---------------|---------------|
| Committed at 0.5x, gesture starts | 0.5 | 0.5 | 1.0 | No change |
| Pinch out to 0.7x | 0.7 | 0.5 | 1.4 | 40% larger |
| Pinch in to 0.3x | 0.3 | 0.5 | 0.6 | 40% smaller |
| Pinch to 1.0x | 1.0 | 0.5 | 2.0 | Double (back to fit-width) |
| Gesture ends at 0.7x | 0.7 | 0.7 (updated) | 1.0 | Layouts updated |

---

## Files to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Update `dispatchDraw()` to use delta scaling (`zoomLevel / committedZoom`) instead of absolute `zoomLevel` |

---

## Testing Checklist

- [ ] Start at 0.5x zoom, place two fingers: No visual change
- [ ] Pinch out from 0.5x to 0.8x: Smooth zoom, no jump at gesture start
- [ ] Pinch in from 0.5x to 0.3x: Smooth zoom, no jump
- [ ] Start at 1.0x, pinch out to 0.5x: Smooth transition
- [ ] Start at 2.0x, pinch to 0.5x: Smooth throughout
- [ ] Double-tap cycles: Smooth animations without jumps

