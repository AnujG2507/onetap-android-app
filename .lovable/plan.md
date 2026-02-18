

# V2 PDF Viewer: Critical Fixes and Experience Improvements

## Summary

One confirmed bug causing the panning failure, two performance bottlenecks causing scroll lag, and three UX enhancements to elevate the experience.

---

## Bug Fix 1: Panning Only Works in One Direction (ROOT CAUSE)

**File:** `NativePdfViewerV2Activity.java` (line 1035-1039)

The fling X-axis bounds are wrong. Currently:

```text
scroller.fling(
    (int) -panX, ...
    ...,
    0, getMaxPanX(),   // X bounds: 0 to maxPan
    ...);
```

Then in `computeScroll`: `panX = -scroller.getCurrX()`

This means panX can only range from `-maxPan` to `0` during fling. The user can only fling-pan in one horizontal direction. Dragging works both ways (onScroll does `panX -= dx` and clamp allows `-maxPan` to `+maxPan`), but the moment the user lifts their finger and fling takes over, the scroller clamps X to `[0, maxPan]`, snapping the view back.

**Fix:** Change fling X bounds from `[0, getMaxPanX()]` to `[-getMaxPanX(), getMaxPanX()]`:

```java
scroller.fling(
    (int) -panX, (int) scrollY,
    zoomLevel > 1.0f ? (int) -vx : 0, (int) -vy,
    -getMaxPanX(), getMaxPanX(),
    0, maxScrollY);
```

---

## Bug Fix 2: Parent Steals Touch During Scale Gesture

**File:** `NativePdfViewerV2Activity.java` (line 981)

`onScaleEnd` calls `getParent().requestDisallowInterceptTouchEvent(false)` immediately. If the user transitions from pinch to pan without lifting their finger, the parent (LinearLayout) can intercept the touch and kill the pan gesture.

**Fix:** Remove the `requestDisallowInterceptTouchEvent(false)` from `onScaleEnd`. Instead, release in `onTouchEvent` on `ACTION_UP`/`ACTION_CANCEL` only.

---

## Performance Fix 1: Cache Lookup Allocates in onDraw

**File:** `NativePdfViewerV2Activity.java` (line 496-522)

`findBestBitmap` calls `bitmapCache.snapshot()` which creates a full `LinkedHashMap` copy on **every call**, and it's called **per visible page per frame**. For a 5-page visible range at 60fps, that's 300 map copies per second.

**Fix:** 
- For the exact-match path (most common case), keep as-is -- it's just a `get()`.
- For the fallback path, maintain a lightweight secondary index: a `ConcurrentHashMap<Integer, String>` mapping `pageIndex` to its last-rendered cache key. When an exact match misses, look up this secondary index first before doing the full snapshot scan.
- Move the snapshot scan to a separate method called only when the secondary index also misses (rare).

---

## Performance Fix 2: Object Allocation in onDraw Hot Path

**File:** `NativePdfViewerV2Activity.java` (line 1182)

Every frame allocates `new RectF(...)` per visible page. At 60fps with 5 visible pages, that's 300 object allocations per second that pressure the GC.

**Fix:** Pre-allocate a single reusable `RectF drawRect` field in PdfDocumentView and reuse it via `drawRect.set(...)` in onDraw.

---

## Performance Fix 3: Trigger Renders During Fling

**File:** `NativePdfViewerV2Activity.java` (line 1292-1306)

Currently, `computeScroll` only triggers renders after the fling ends. During a fast fling through a long document, the user sees white pages because no render requests are made until the fling decelerates to a stop.

**Fix:** Add a throttled render request during fling. Track the last render-request time, and if more than 200ms has passed during `computeScroll`, fire `requestVisiblePageRenders()` for the current position. This pre-fetches pages the user is about to see.

---

## UX Enhancement 1: Floating Page Indicator During Scroll

Since the page indicator was removed from the header, the user has no way to know which page they're on except during fast-scroll drag.

**Fix:** Add a floating page indicator pill (similar to Google Drive's) that appears during scroll/fling and auto-hides after 1.5s. Render it in `onDraw` at bottom-center of the view, showing "Page X of Y". Use the same fade logic as the fast-scroll thumb.

---

## Technical Details

### File Modified
- `native/android/app/src/main/java/app/onetap/access/NativePdfViewerV2Activity.java`

### Changes Summary

| Change | Lines Affected | Impact |
|--------|---------------|--------|
| Fix fling X bounds | ~1035-1039 | Fixes panning in zoomed state |
| Fix parent touch intercept | ~981 + ~1358 | Prevents pan gesture theft |
| Cache lookup optimization | ~496-522 + new field | Eliminates 300+ map copies/sec |
| Reusable RectF | ~1182 + new field | Eliminates GC pressure in draw |
| Fling render throttle | ~1292-1306 | Reduces white pages during fling |
| Floating page indicator | New draw code in onDraw | Page awareness without header |

### Testing Checklist
- Open a multi-page PDF, pinch to zoom in, pan left AND right -- both directions should work smoothly
- Zoom in, fling horizontally -- should continue panning in fling direction, not snap back
- Fast scroll through a 50+ page PDF -- pages should render during fling, not only after stopping
- Scroll normally -- floating page indicator appears at bottom and auto-hides
- Verify no visible regressions in zoom, double-tap, or fast-scroll drag

