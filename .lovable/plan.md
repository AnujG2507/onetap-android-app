

# Fix: Cannot Pan to Right Edge of PDF When Zoomed

## Root Cause

The pan clamping in `clampScrollAndPan` uses a symmetric range centered at zero:

```text
maxPan = (pageW - viewW) / 2
panX clamped to [-maxPan, +maxPan]
```

But in `onDraw`, `screenLeft = panX` directly (line 1279). This means:
- At `panX = +maxPan`: the page shifts right, its left edge becomes visible (gap on left) -- this is what the user sees
- At `panX = -maxPan`: the page shifts left, but only by half the overflow -- the right edge is at `(pageW + viewW) / 2`, which is STILL beyond the view width. The right boundary is unreachable.

The correct range for `panX` (which IS `screenLeft`) should be `[-(pageW - viewW), 0]`:
- `panX = 0`: page starts at x=0, left edge visible
- `panX = -(pageW - viewW)`: page right edge aligns with view right edge, right boundary visible

Both boundaries become reachable, and the total pan distance is the same.

## Fix

### Change 1: Fix `clampScrollAndPan` (line 1596-1602)

Replace the symmetric clamping:

```java
// BEFORE (wrong - symmetric around 0)
float maxPan = (screenWidth * zoomLevel - getWidth()) / 2f;
if (maxPan < 0) maxPan = 0;
panX = Math.max(-maxPan, Math.min(maxPan, panX));

// AFTER (correct - full range from left-edge-visible to right-edge-visible)
float overflow = screenWidth * zoomLevel - getWidth();
if (overflow < 0) overflow = 0;
panX = Math.max(-overflow, Math.min(0, panX));
```

### Change 2: Fix `getMaxPanX` (line 1605-1609)

This is used for fling bounds. Update to match the new asymmetric range:

```java
// BEFORE
float maxPan = (screenWidth * zoomLevel - getWidth()) / 2f;
return Math.max(0, (int) maxPan);

// AFTER - return the full overflow
float overflow = screenWidth * zoomLevel - getWidth();
return Math.max(0, (int) overflow);
```

### Change 3: Fix fling bounds (line 1152-1155)

The fling uses `-panX` as current X position. With the new range `panX in [-overflow, 0]`, `-panX` ranges from `[0, overflow]`. So the fling X bounds should be `[0, getMaxPanX()]`:

```java
// BEFORE
-getMaxPanX(), getMaxPanX(),

// AFTER
0, getMaxPanX(),
```

### Change 4: Adjust initial pan position for zoom gestures

When zooming in via pinch (line 1083) or double-tap, the initial `panX` calculation may need to be offset so the centered position is `-(overflow)/2` instead of `0`. Review the pinch and double-tap zoom code to ensure the initial pan is within the new valid range (the existing `clampScrollAndPan()` call after setting panX will handle this automatically).

## Technical Details

### File Modified
- `native/android/app/src/main/java/app/onetap/access/NativePdfViewerV2Activity.java`

### Lines Changed
| Location | Change |
|----------|--------|
| Lines 1596-1602 (`clampScrollAndPan`) | Symmetric range to `[-overflow, 0]` |
| Lines 1605-1609 (`getMaxPanX`) | Return full overflow instead of half |
| Lines 1152-1155 (fling bounds) | Change from `[-max, max]` to `[0, max]` |

### Why This Works
- `panX = 0` means page left edge at screen left edge (left boundary visible)
- `panX = -overflow` means page right edge at screen right edge (right boundary visible)
- `panX = -overflow/2` means page centered (current default position during zoom)
- `clampScrollAndPan()` is called after every pan/zoom/fling update, so all code paths are automatically corrected
- Canvas drawing uses `screenLeft = panX` directly, so no drawing changes needed

### Testing Checklist
- Zoom in to 2.5x, pan left -- left boundary of page should be visible
- Pan right -- right boundary of page should be visible (the fix)
- Both boundaries should feel symmetric in behavior
- Fling horizontally while zoomed -- should work in both directions and stop at boundaries
- Double-tap zoom -- page should center correctly on tap point
- Pinch zoom -- focal point should remain stable
