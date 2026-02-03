
# Fix: Pinch Zoom Snapping Back to Fit-Page-Width

## Problem Analysis

The pinch zoom gesture starts working but immediately snaps back to 1.0x (fit-to-width). The user can see the zoom briefly apply before it reverts.

### Root Cause

The current implementation uses `setOnTouchListener()` on the RecyclerView to handle gesture detection:

```java
recyclerView.setOnTouchListener((v, event) -> {
    scaleGestureDetector.onTouchEvent(event);
    gestureDetector.onTouchEvent(event);
    
    if (scaleGestureDetector.isInProgress() || event.getPointerCount() > 1) {
        return true;  // Consume
    }
    return false;  // Let RecyclerView handle
});
```

**The problem**: When `setOnTouchListener` returns `false`, RecyclerView's internal `onTouchEvent()` still processes the event. This creates a race condition:

1. User places second finger → `ACTION_POINTER_DOWN` fires
2. `scaleGestureDetector.isInProgress()` returns `false` (gesture hasn't started yet)
3. Touch listener returns `false` → RecyclerView starts processing as scroll
4. `scaleGestureDetector` finally recognizes the pinch and calls `onScaleBegin()`
5. **Conflict**: RecyclerView is already in scroll mode, and the two gestures fight
6. When RecyclerView processes an `ACTION_MOVE`, it may trigger a layout pass
7. Layout pass causes adapter rebinding, which reads `currentZoom` (still 1.0f during gesture)
8. Visual zoom snaps back to match the layout

### Why Double-Tap Works

Double-tap zoom works because it uses `animateZoomTo()` which directly updates `zoomLevel` and calls `invalidate()`. There's no ongoing touch gesture, so no conflict with RecyclerView's scroll handling.

## Solution

Move gesture detection **inside** `ZoomableRecyclerView.onTouchEvent()` instead of using an external touch listener. This ensures:

1. Gesture detectors receive events before RecyclerView's scroll logic
2. We can return `true` early to prevent scroll handling during scale gestures
3. No race condition between gesture recognition and scroll state

### Implementation Changes

#### 1. Move ScaleGestureDetector into ZoomableRecyclerView

Move the gesture detector initialization into the `ZoomableRecyclerView` class and handle it in `onTouchEvent()`:

```java
private class ZoomableRecyclerView extends RecyclerView {
    private ScaleGestureDetector internalScaleDetector;
    private GestureDetector internalGestureDetector;
    private boolean inScaleMode = false;
    
    public ZoomableRecyclerView(Context context) {
        super(context);
        setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        initGestureDetectors();
    }
    
    private void initGestureDetectors() {
        internalScaleDetector = new ScaleGestureDetector(getContext(), 
            new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                // ... scale handling
            });
        internalGestureDetector = new GestureDetector(getContext(),
            new GestureDetector.SimpleOnGestureListener() {
                // ... tap handling
            });
    }
    
    @Override
    public boolean onTouchEvent(MotionEvent e) {
        // Process gestures FIRST
        internalScaleDetector.onTouchEvent(e);
        internalGestureDetector.onTouchEvent(e);
        
        // If scaling or multi-touch, don't let RecyclerView scroll
        if (internalScaleDetector.isInProgress() || e.getPointerCount() > 1) {
            inScaleMode = true;
            return true;  // Consume - no scroll
        }
        
        // If just exited scale mode, don't immediately allow scroll
        if (inScaleMode && e.getActionMasked() == MotionEvent.ACTION_UP) {
            inScaleMode = false;
            return true;  // Consume the final UP to prevent scroll fling
        }
        
        // Only allow scroll when not zoomed above 1.0x (for horizontal pan)
        // or always allow vertical scroll
        return super.onTouchEvent(e);
    }
}
```

#### 2. Remove External Touch Listener

Remove the `recyclerView.setOnTouchListener()` call in `setupGestureDetectors()` since gesture handling is now internal.

#### 3. Keep Activity-Level References

The activity still needs access to `isScaling`, `currentZoom`, etc. for rendering logic. Add setter methods or use a callback interface.

### Detailed Code Changes

**File: `NativePdfViewerActivity.java`**

| Location | Change |
|----------|--------|
| Lines 177-405 (`ZoomableRecyclerView` class) | Add `initGestureDetectors()`, move scale/gesture detector logic inside, update `onTouchEvent()` |
| Lines 686-742 (`setupGestureDetectors()`) | Remove `ScaleGestureDetector` creation, keep only the callback connection |
| Lines 773-798 (`setOnTouchListener`) | Remove entirely |
| Add new `setScaleListener()` method | Allow activity to receive scale callbacks |

### Key Technical Details

1. **`inScaleMode` Flag**: Tracks if we're in a multi-touch gesture. Even after `isInProgress()` returns false (gesture ended), we keep the flag true until `ACTION_UP` to prevent an immediate scroll fling.

2. **Gesture Detector Order**: Call `onTouchEvent()` on detectors BEFORE deciding whether to let RecyclerView handle the event.

3. **No Layout Invalidation During Gesture**: The `setZoom()` method only calls `invalidate()`, not `requestLayout()`, so adapter bindings won't be triggered mid-gesture.

4. **Activity Callback Interface**: Use a simple interface to communicate scale events back to the activity:
   ```java
   interface ScaleCallback {
       void onScaleBegin(float startZoom);
       void onScale(float newZoom, float fx, float fy);
       void onScaleEnd(float finalZoom);
   }
   ```

## Expected Behavior After Fix

| Gesture | Before | After |
|---------|--------|-------|
| Pinch in (zoom to 2x) | Briefly zooms, snaps back to 1.0x | Zooms smoothly, stays at 2x |
| Pinch out (zoom to 0.5x) | Briefly zooms, snaps back to 1.0x | Zooms smoothly, stays at 0.5x |
| Pinch to 0.2x | Not possible | Shows ~5 pages, content centered |
| Single-finger scroll | Works | Works (unchanged) |
| Double-tap zoom | Works | Works (unchanged) |

## Testing Checklist

- [ ] Pinch zoom in holds the zoom level after gesture ends
- [ ] Pinch zoom out holds the zoom level after gesture ends
- [ ] Zoom level persists when scrolling after pinch
- [ ] Double-tap zoom still works
- [ ] Vertical scrolling works at 1.0x zoom
- [ ] Horizontal panning works when zoomed in above 1.0x
- [ ] Resume position (including zoom) restores correctly
