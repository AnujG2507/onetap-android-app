

# Make PDF Zoom Provide Instant Feedback

## Problem

Zoom doesn't give instant visual feedback during pinch gestures. While the canvas-level zoom is already instant for zoom levels >= 1.0x, the "train view" (zoom < 1.0x) updates lag because layout changes only happen after the gesture ends.

## Current Behavior

When zooming in/out:

| Zoom Level | Visual Approach | Current Issue |
|------------|-----------------|---------------|
| >= 1.0x | Canvas transform (`dispatchDraw`) | **Works instantly** ✓ |
| < 1.0x | Layout height scaling | **Updates only after gesture ends** ✗ |

The root cause is that `adapter.notifyDataSetChanged()` is only called in `commitZoomAndRerender()`, which is triggered by `onScaleEnd` - not during the gesture.

## Solution

Call layout updates **during** the pinch gesture when zoom is below 1.0x to make the train view respond instantly.

### Changes to `onScale` callback

Update the `onScale` method in `setupGestureDetectors()` to trigger layout refreshes during the gesture:

```java
@Override
public void onScale(float newZoom, float fx, float fy) {
    // Track if we're in train view zone
    boolean wasBelow = currentZoom < 1.0f;
    boolean isBelow = newZoom < 1.0f;
    
    currentZoom = newZoom;
    
    // Trigger layout update during gesture for train view
    // This makes zoom out feel instant instead of waiting for gesture end
    if (isBelow && adapter != null) {
        adapter.notifyDataSetChanged();
    }
}
```

### Performance Optimization

Calling `notifyDataSetChanged()` on every frame could be expensive. Add throttling to limit updates:

```java
// Add to class fields
private long lastLayoutUpdateTime = 0;
private static final int LAYOUT_UPDATE_THROTTLE_MS = 50; // ~20fps for layout

@Override
public void onScale(float newZoom, float fx, float fy) {
    currentZoom = newZoom;
    
    // Throttled layout update during gesture for train view
    if (newZoom < 1.0f && adapter != null) {
        long now = System.currentTimeMillis();
        if (now - lastLayoutUpdateTime > LAYOUT_UPDATE_THROTTLE_MS) {
            lastLayoutUpdateTime = now;
            adapter.notifyDataSetChanged();
        }
    }
}
```

### Why This Works

1. **For zoom >= 1.0x**: Canvas transform in `dispatchDraw()` provides instant visual scaling - no changes needed
2. **For zoom < 1.0x**: The `dispatchDraw()` skips canvas transform, relying on layout heights instead
3. By calling `notifyDataSetChanged()` during the gesture, `onBindViewHolder` is triggered which reads `currentZoom` via `getScaledPageHeight()` and `getScaledPageWidth()`, providing instant layout updates

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Add throttled `adapter.notifyDataSetChanged()` in `onScale` callback |

### Code Changes

**Add field for throttling:**
```java
// Near other timing constants (around line 85-110)
private static final int LAYOUT_UPDATE_THROTTLE_MS = 50;

// Near other state fields (around line 150-170)
private long lastLayoutUpdateTime = 0;
```

**Update `onScale` callback in `setupGestureDetectors()` (around line 1206):**
```java
@Override
public void onScale(float newZoom, float fx, float fy) {
    currentZoom = newZoom;
    
    // Trigger throttled layout update during gesture for train view
    // This makes zoom out feel instant
    if (newZoom < 1.0f && adapter != null) {
        long now = System.currentTimeMillis();
        if (now - lastLayoutUpdateTime > LAYOUT_UPDATE_THROTTLE_MS) {
            lastLayoutUpdateTime = now;
            adapter.notifyDataSetChanged();
        }
    }
}
```

## Expected Result

| Gesture | Before | After |
|---------|--------|-------|
| Pinch zoom in (1.0x → 2.5x) | Instant | Instant (unchanged) |
| Pinch zoom out (1.0x → 0.5x) | Delayed until finger lift | Instant with page sizes shrinking in real-time |
| Double-tap zoom | Animated | Animated (unchanged) |

## Testing Checklist

- [ ] Pinch zoom in - pages scale instantly via canvas transform
- [ ] Pinch zoom out - pages shrink in real-time (train view appears while pinching)
- [ ] No visible lag or stutter during continuous pinch gesture
- [ ] Double-tap zoom animation still smooth
- [ ] Scroll performance remains smooth after zoom changes
- [ ] No jank when crossing the 1.0x threshold during pinch

