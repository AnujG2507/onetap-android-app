

# PDF Viewer Zoom Crash Analysis

## Root Cause Identification

After thorough code review, I've identified **multiple critical issues** that can cause crashes during zoom operations:

---

### Critical Issue #1: Removed `previousZoom` Field Declaration

**Location:** Lines 109-113 (the last diff removed it)

The last edit removed the `previousZoom` field declaration at line 113:
```java
private FrameLayout errorView;
// private float previousZoom = 1.0f;  ← REMOVED
```

But there's **still a valid declaration at line 109**:
```java
private float previousZoom = 1.0f;
```

**However**, the diff shows this was removed from line 113, which means if the original file had TWO declarations, one was removed but now I see one remains at line 109. This is correct. Let me re-check...

Actually, looking at the current file (lines 109), `previousZoom` IS declared:
```java
// Previous zoom level (for fallback bitmap lookup during transitions)
private float previousZoom = 1.0f;
```

So the field exists. This is NOT the crash cause.

---

### Critical Issue #2: ConcurrentModificationException in `pendingRenders` Set

**Location:** Lines 101, 700, 741-746, 866-870, 1341-1343

The `pendingRenders` HashSet is accessed from:
- **Main thread**: `commitZoomAndRerender()` (line 700: `pendingRenders.clear()`)
- **Main thread**: `prerenderVisiblePages()` (lines 741-746: check and add)
- **Main thread**: `prerenderAdjacentPages()` (lines 866-870: check and add)
- **Main thread**: `onBindViewHolder()` (lines 1341-1343: check and add)
- **Background thread**: `renderPageAsync()` (lines 1115, 1170, 1208, 1224, 1234: remove)

**Problem**: While most additions happen on the main thread, removals happen on background threads via `renderExecutor`. A regular `HashSet` is NOT thread-safe. Concurrent access will cause:
- `ConcurrentModificationException`
- Silent data corruption leading to unpredictable crashes

---

### Critical Issue #3: Null `pdfRenderer` Access in Background Thread

**Location:** Lines 1147-1152, 1205-1218

```java
synchronized (pdfRenderer) {  // ← Can crash if pdfRenderer is null
    if (pdfRenderer == null || pageIndex < 0 ...) {
```

The `synchronized` block uses `pdfRenderer` as the monitor object. If `pdfRenderer` becomes null (e.g., during `onDestroy()`), this throws `NullPointerException`.

**Crash sequence:**
1. User zooms → triggers `renderPageAsync()` on background thread
2. User exits viewer → `onDestroy()` runs, sets `pdfRenderer = null` (after closing)
3. Background thread reaches `synchronized(pdfRenderer)` → NPE crash

---

### Critical Issue #4: Race Condition During Rapid Zoom

**Location:** Lines 466, 651, 654-656

In `onScaleEnd()` and `animateDoubleTapZoom.onAnimationEnd()`:
```java
previousZoom = currentZoom;  // or baseZoom
currentZoom = endZoom;
pendingZoom = endZoom;
```

If a user rapidly zooms in/out (pinch followed by double-tap, or multiple fast pinches), these values can be overwritten before the previous render completes. This leads to:
- `previousZoom` being incorrect for fallback bitmap lookup
- Cache keys mismatching expected values
- Visual glitches or IndexOutOfBoundsException

---

### Critical Issue #5: Possible IndexOutOfBoundsException in Animation

**Location:** Lines 601-619, 636-642

```java
final float[][] pivotCache = new float[last - first + 1][2];

for (int i = first; i <= last; i++) {
    ...
    pivotCache[i - first][0] = localX;  // Can throw AIOOBE
```

If `last < first` (which can happen if RecyclerView has no visible items), then:
- Array size becomes 0 or negative → `NegativeArraySizeException`
- Access `pivotCache[-1]` → `ArrayIndexOutOfBoundsException`

Also in the animation update listener:
```java
for (int i = animFirst; i <= animLast; i++) {
    View child = lm.findViewByPosition(i);
```

If layout changes during animation, `findViewByPosition()` can return null for previously-visible positions.

---

### Critical Issue #6: Missing Null Check for `layoutManager`

**Location:** Lines 530, 590-594, 633

While some methods check `if (layoutManager == null) return;`, the animation update listener does NOT have early exit:
```java
doubleTapAnimator.addUpdateListener(animation -> {
    LinearLayoutManager lm = (LinearLayoutManager) recyclerView.getLayoutManager();
    if (lm == null) return;  // This exists ✓
```

But the outer method `animateDoubleTapZoom()` can start the animator even if layout is null:
```java
LinearLayoutManager layoutManager = (LinearLayoutManager) recyclerView.getLayoutManager();
if (layoutManager == null) {
    isDoubleTapAnimating = false;
    return;  // This exists ✓
}
```

This seems OK, but there's still a potential issue...

---

## Summary of Crash Causes (Most to Least Likely)

| Priority | Issue | Crash Type | Likelihood |
|----------|-------|------------|------------|
| **1** | Non-thread-safe `pendingRenders` HashSet | `ConcurrentModificationException` | **Very High** |
| **2** | `synchronized(pdfRenderer)` when null | `NullPointerException` | **High** |
| **3** | Negative array size in animation | `NegativeArraySizeException` | **Medium** |
| **4** | `pivotCache` out of bounds | `ArrayIndexOutOfBoundsException` | **Medium** |
| **5** | Race conditions in zoom state | Visual bugs / edge crashes | **Lower** |

---

## Implementation Plan

### Fix 1: Make `pendingRenders` Thread-Safe

Replace the regular `HashSet` with a thread-safe alternative:

```java
// OLD:
private final Set<String> pendingRenders = new HashSet<>();

// NEW:
private final Set<String> pendingRenders = 
    java.util.Collections.synchronizedSet(new HashSet<>());
```

Or use `ConcurrentHashMap.newKeySet()` for better performance:
```java
private final Set<String> pendingRenders = ConcurrentHashMap.newKeySet();
```

### Fix 2: Guard Against Null `pdfRenderer` in Synchronized Block

```java
// Before synchronized block:
PdfRenderer renderer = pdfRenderer;
if (renderer == null) {
    pendingRenders.remove(...);
    return;
}

synchronized (renderer) {
    // Use 'renderer' instead of 'pdfRenderer'
}
```

### Fix 3: Guard Animation Array Bounds

```java
int first = layoutManager.findFirstVisibleItemPosition();
int last = layoutManager.findLastVisibleItemPosition();

// Add bounds check
if (first < 0 || last < first) {
    isDoubleTapAnimating = false;
    return;
}
```

### Fix 4: Validate Visible Range Before Creating Array

Already partially covered by Fix 3, but also:
```java
final int arraySize = Math.max(0, last - first + 1);
final float[][] pivotCache = new float[arraySize][2];
```

### Fix 5: Add Null-Safe Child Handling in Animation Loop

```java
for (int i = animFirst; i <= animLast; i++) {
    View child = lm.findViewByPosition(i);
    if (child instanceof ImageView) {  // Already handles null
        child.setScaleX(scaleFactor);
        child.setScaleY(scaleFactor);
    }
}
```

This already checks `instanceof ImageView`, which implicitly handles null. ✓

---

## Files to Modify

| File | Changes |
|------|---------|
| `native/android/app/src/main/java/app/onetap/shortcuts/NativePdfViewerActivity.java` | All fixes above |

---

## Testing Strategy

After implementing fixes:

1. **Rapid zoom test**: Pinch in/out rapidly 10+ times without pause
2. **Double-tap during pinch**: Start pinching, then double-tap mid-gesture
3. **Exit during zoom**: Pinch zoom, then immediately press back
4. **Empty page test**: Zoom when RecyclerView has no visible items (edge case)
5. **Memory pressure test**: Open large PDF, zoom extensively, check for crashes

---

## Technical Notes

- All fixes are **surgical** - no architectural changes
- Thread-safety fix uses standard Java concurrency primitives
- No new dependencies required
- Maintains existing visual behavior and performance characteristics
- Compatible with atomic swap strategy

