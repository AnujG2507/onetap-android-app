

# PDF Viewer Center Alignment Enhancement

## Overview

Ensure the PDF viewer content stays perfectly center-aligned at all zoom levels during both gesture (pinch) and committed (released) states.

---

## Current Behavior Analysis

| Zoom Level | State | Centering Method | Issue |
|------------|-------|------------------|-------|
| < 1.0x | Committed | Layout `Gravity.CENTER_HORIZONTAL` | Works correctly ✓ |
| < 1.0x | During gesture | Canvas scaling around focal point | May not center properly |
| = 1.0x | Any | Full-width layout | Works correctly ✓ |
| > 1.0x | Any | Canvas scaling + pan | Content can be panned off-center |

---

## Problem Areas

### 1. Gesture-Mode Centering When Zooming Out
During a pinch-to-zoom gesture below 1.0x, the canvas scaling uses `effectivePanX` based on whether scaled width exceeds screen width. However, when zoomed out, the scaled content is narrower than the screen but may not be perfectly centered because:
- `focalX` from the pinch gesture may not be screen center
- Previous `panX` offset may persist

### 2. Zoomed-In Mode Pan Reset
When zooming from a panned state back toward 1.0x, the pan offsets should animate toward zero to ensure centering when the gesture ends.

### 3. Canvas Origin for Zoomed-Out
When using canvas scaling for zoom < 1.0x during gesture, the scaling should be from screen center to keep content visually centered.

---

## Solution

### 1. Force Center-Based Canvas Scaling When Zooming Out

In `dispatchDraw`, when zoom level is below 1.0x (during gesture), always scale from screen center and ignore pan offsets:

```java
@Override
protected void dispatchDraw(Canvas canvas) {
    canvas.save();
    
    if (isGestureActive) {
        if (zoomLevel < 1.0f) {
            // ZOOMING OUT: Always scale from center, no pan
            float centerX = getWidth() / 2f;
            float centerY = getHeight() / 2f;
            canvas.scale(zoomLevel, zoomLevel, centerX, centerY);
        } else {
            // ZOOMING IN: Use focal point and pan
            float scaledContentWidth = getWidth() * zoomLevel;
            float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
            canvas.translate(effectivePanX, panY);
            canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
        }
    } else if (committedZoom < 1.0f && zoomLevel < 1.0f) {
        // COMMITTED ZOOMED OUT: Layouts handle centering, no canvas transform
    } else if (zoomLevel > 1.0f) {
        // COMMITTED ZOOMED IN: Canvas pan + scale
        float scaledContentWidth = getWidth() * zoomLevel;
        float effectivePanX = (scaledContentWidth > getWidth()) ? panX : 0;
        canvas.translate(effectivePanX, panY);
        canvas.scale(zoomLevel, zoomLevel, focalX, focalY);
    }
    // At 1.0x: No transform
    
    super.dispatchDraw(canvas);
    canvas.restore();
}
```

### 2. Reset Pan When Transitioning to Zoomed-Out

In `onScale()`, reset pan offsets when zoom goes below 1.0x to prevent off-center content:

```java
if (newZoom < 1.0f) {
    panX = 0;
    panY = 0;
}
```

### 3. Ensure Focal Point Is Centered for Zoom-Out Animation

In `animateZoomTo()`, when target zoom is <= 1.0x, animate focal point to screen center (already partially implemented, but ensure it's consistent):

```java
final float targetFocalX = (targetZoom <= 1.0f) ? getWidth() / 2f : fx;
final float targetFocalY = (targetZoom <= 1.0f) ? getHeight() / 2f : fy;
```

### 4. Update Focal Point During Gesture for Smooth Centering

When zooming out below 1.0x, smoothly blend the focal point toward screen center (already implemented at lines 331-339, but verify it propagates correctly):

```java
// In onScale:
if (newZoom < 1.0f) {
    float centerX = getWidth() / 2f;
    float centerY = getHeight() / 2f;
    float t = (1.0f - newZoom) / (1.0f - MIN_ZOOM);
    t = Math.min(1.0f, t);
    focalX = focalX + (centerX - focalX) * t;
    focalY = focalY + (centerY - focalY) * t;
}
```

---

## Technical Details

### Center-Based Scaling Math

When scaling from screen center:
- Content width after scale: `screenWidth * zoomLevel`
- Horizontal margin on each side: `(screenWidth - scaledWidth) / 2`
- Canvas `scale(zoom, zoom, centerX, centerY)` automatically centers the scaled content

### Pan Clamping for Zoomed-In

The existing `clampPan()` already handles this correctly:
- Resets panX/panY to 0 when content fits within screen
- Clamps to bounds when content exceeds screen

---

## Files to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Update `dispatchDraw()` to use center-based scaling for zoom < 1.0x during gesture, reset pan when zoom drops below 1.0x |

---

## Testing Checklist

- [ ] Zoom out from 1.0x to 0.3x: Content stays centered throughout gesture
- [ ] Zoom out then release: Pages remain perfectly centered
- [ ] Zoom in to 2.5x then zoom out to 0.5x in one gesture: Smooth centered transition
- [ ] Double-tap to zoom out (e.g., to MIN_ZOOM): Content centered
- [ ] Pan while zoomed in at 2.5x, then zoom out to 0.5x: Pan resets, content centers
- [ ] Portrait and landscape: Content centered in both orientations

