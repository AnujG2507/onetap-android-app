

# Fix: Proper Zoom Implementation (Google Drive Style)

## Problem Analysis

The current zoom-out behavior is broken because:

1. **Focal point scaling doesn't work for zoom-out**: When `canvas.scale(0.5, 0.5, focalX, focalY)` is applied, content shrinks toward the focal point, causing it to drift off-screen instead of staying centered
2. **Centering logic is incomplete**: The horizontal centering `(getWidth() - scaledWidth) / 2f` doesn't account for the focal-point-based scale transformation that follows it
3. **Scale and translate order**: The current order causes the focal point to be applied in the wrong coordinate space

### How Google Drive Does It

Google Drive PDF viewer uses a simpler approach:
- **Zoomed out (< 1.0x)**: Scale uniformly from center of screen, no focal point tracking
- **At 1.0x**: No transformation, pages fit width normally  
- **Zoomed in (> 1.0x)**: Scale from focal point, allow horizontal panning

## Solution

### 1. Separate Zoom Behavior by Range

When zoomed out, ignore focal point and scale from screen center:

```java
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    if (zoomLevel < 1.0f) {
        // ZOOMED OUT: Scale from center, no focal point
        float centerX = getWidth() / 2f;
        float centerY = getHeight() / 2f;
        canvas.scale(zoomLevel, zoomLevel, centerX, centerY);
    } else if (zoomLevel > 1.0f) {
        // ZOOMED IN: Pan + scale from focal point
        canvas.translate(panX, 0);
        canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    }
    // At 1.0x: No transformation needed
    
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

### 2. Adjust Focal Point Tracking for Zoom-Out

During pinch-to-zoom-out, the focal point should transition to screen center:

```java
@Override
public boolean onScale(ScaleGestureDetector detector) {
    float scaleFactor = detector.getScaleFactor();
    float newZoom = startZoom * scaleFactor;
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    
    float fx = detector.getFocusX();
    float fy = detector.getFocusY();
    
    // When zooming out, blend focal point toward center
    if (newZoom < 1.0f) {
        float centerX = recyclerView.getWidth() / 2f;
        float centerY = recyclerView.getHeight() / 2f;
        float t = 1.0f - newZoom; // 0 at 1.0x, 0.8 at 0.2x
        fx = fx + (centerX - fx) * t;
        fy = fy + (centerY - fy) * t;
    }
    
    recyclerView.setZoom(newZoom, fx, fy);
    return true;
}
```

### 3. Improve Double-Tap Animation for Zoom-Out

When double-tapping from zoomed state, animate smoothly to center:

```java
public void animateZoomTo(float targetZoom, float fx, float fy, Runnable onComplete) {
    // ...
    final float startZoom = zoomLevel;
    final float startPanX = panX;
    final float startFocalX = focalX;
    final float startFocalY = focalY;
    
    // Target focal point is center when zooming out
    final float targetFocalX = (targetZoom <= 1.0f) ? getWidth() / 2f : fx;
    final float targetFocalY = (targetZoom <= 1.0f) ? getHeight() / 2f : fy;
    final float targetPanX = (targetZoom <= 1.0f) ? 0 : panX;
    
    doubleTapAnimator.addUpdateListener(animation -> {
        float progress = (float) animation.getAnimatedValue();
        zoomLevel = startZoom + (targetZoom - startZoom) * progress;
        panX = startPanX + (targetPanX - startPanX) * progress;
        focalX = startFocalX + (targetFocalX - startFocalX) * progress;
        focalY = startFocalY + (targetFocalY - startFocalY) * progress;
        clampPan();
        invalidate();
    });
    // ...
}
```

### 4. Ensure Vertical Scroll Position Adjusts During Zoom-Out

When zooming out, the visible content should stay in view. Add scroll adjustment:

```java
@Override
public void onScaleEnd(ScaleGestureDetector detector) {
    isScaling = false;
    float newZoom = recyclerView.getZoomLevel();
    
    // If significantly zoomed out, scroll to keep content visible
    if (newZoom < 0.5f && previousZoom >= 1.0f) {
        // Scroll to show more pages
        LinearLayoutManager lm = (LinearLayoutManager) recyclerView.getLayoutManager();
        if (lm != null) {
            int firstVisible = lm.findFirstVisibleItemPosition();
            // Keep first visible page at a reasonable position
            lm.scrollToPositionWithOffset(firstVisible, 0);
        }
    }
    
    previousZoom = currentZoom;
    currentZoom = newZoom;
    recyclerView.commitZoomGesture();
    commitZoomAndRerender();
}
```

## Technical Changes

### File: `NativePdfViewerActivity.java`

| Section | Change |
|---------|--------|
| `ZoomableRecyclerView.dispatchDraw()` (lines 192-212) | Separate zoom-out vs zoom-in rendering logic |
| `ZoomableRecyclerView.animateZoomTo()` (lines 350-395) | Animate focal point toward center when zooming out |
| `setupGestureDetectors()` - `onScale()` (lines 693-700) | Blend focal point toward center during zoom-out gesture |
| `setupGestureDetectors()` - `onScaleEnd()` (lines 703-714) | Add scroll adjustment for large zoom-out transitions |

## Expected Behavior After Fix

| Gesture | Before | After |
|---------|--------|-------|
| Pinch out to 0.5x | Content drifts off-screen | Content shrinks toward center, stays visible |
| Pinch out to 0.2x | Not working properly | Shows ~5 pages, centered on screen |
| Double-tap when zoomed out | May jump erratically | Smooth animation to 1.0x, centered |
| Pinch in from zoomed out | Focal point jumps | Smooth transition, focal point blends naturally |
| Gaps when zoomed out | May appear uneven | Proportionally scaled with pages |

## Visual Comparison

```text
BEFORE (broken):
┌─────────────────────────────────────┐
│                                     │
│              ┌─────┐                │  Pages drift toward
│              │ P1  │                │  focal point, off-center
│              └─────┘                │
│                    ┌─────┐          │
│                    │ P2  │          │
│                                     │
└─────────────────────────────────────┘

AFTER (fixed):
┌─────────────────────────────────────┐
│                                     │
│        ┌─────┐  ┌─────┐  ┌─────┐    │  Content centered,
│        │ P1  │  │ P2  │  │ P3  │    │  multiple pages visible
│        └─────┘  └─────┘  └─────┘    │
│        ┌─────┐  ┌─────┐             │
│        │ P4  │  │ P5  │             │
│        └─────┘  └─────┘             │
└─────────────────────────────────────┘
```

## Testing Checklist

- [ ] Pinch out smoothly transitions to showing multiple pages
- [ ] Content stays centered when zoomed out (not drifting)
- [ ] Pinch out to MIN_ZOOM (0.2x) shows approximately 5 pages
- [ ] Gaps between pages remain proportional (no large gaps)
- [ ] Double-tap from zoomed-out animates smoothly to 1.0x
- [ ] Pinch in from zoomed-out transitions smoothly with focal tracking
- [ ] Vertical scrolling works correctly when zoomed out
- [ ] Resume position saves/restores correctly for zoom < 1.0x

