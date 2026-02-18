

# Rebuild Native PDF Viewer V2 (Parallel Implementation)

## Why V1 Has a Perceptual Ceiling

The current viewer uses a **RecyclerView + PdfPageAdapter** architecture. This means:

- Zoom changes below 1.0x trigger `notifyDataSetChanged()` / `notifyItemRangeChanged()`, causing layout passes
- Bitmap swaps (low-res to high-res) happen via `ImageView.setImageBitmap()`, which is a discrete visual event
- The `ZoomableRecyclerView.dispatchDraw()` applies canvas transforms *on top of* RecyclerView's layout, creating a dual-coordinate system that requires constant patching (the "committedZoom vs zoomLevel" dance)
- A 180ms settling delay after pinch-zoom is needed specifically to hide layout recalculation

These are fundamental to the RecyclerView architecture and cannot be eliminated -- only hidden.

## V2 Architecture: Single Custom View

V2 replaces the entire RecyclerView stack with a **single custom `View`** that owns the full rendering pipeline. This is closer to how Google Drive's PDF viewer works.

```text
+--------------------------------------------------+
|  NativePdfViewerV2Activity                       |
|                                                  |
|  +--------------------------------------------+ |
|  |  PdfDocumentView (custom View)             | |
|  |                                            | |
|  |  - Owns scroll position (float Y offset)  | |
|  |  - Owns zoom level + focal point          | |
|  |  - Owns pan offset                        | |
|  |  - Renders visible pages directly to       | |
|  |    Canvas in onDraw()                      | |
|  |  - No adapter, no ViewHolder, no rebinding | |
|  |                                            | |
|  |  Rendering Pipeline:                       | |
|  |  1. onDraw() determines visible pages      | |
|  |  2. Draws cached bitmaps at current zoom   | |
|  |  3. If no bitmap: draws fallback at        | |
|  |     different resolution (scaled)          | |
|  |  4. Never draws gray/white placeholder     | |
|  |  5. Background thread renders at target    | |
|  |     resolution, posts invalidate()         | |
|  +--------------------------------------------+ |
|                                                  |
|  +--------------------------------------------+ |
|  |  Header / UI Chrome                        | |
|  |  (identical to V1 -- reused logic)         | |
|  +--------------------------------------------+ |
+--------------------------------------------------+
```

### Why This Is Perceptually Superior

| Aspect | V1 (RecyclerView) | V2 (Custom View) |
|--------|-------------------|-------------------|
| Zoom | Canvas transform + deferred layout update | Pure canvas transform, no layout system |
| Bitmap swap | `setImageBitmap()` on ImageView (discrete) | Draw bitmap to canvas (can crossfade) |
| Scroll | RecyclerView's scroll + pan overlay | Single float offset, no layout manager |
| First frame | Adapter bind + render | Draw white page rect immediately, render async |
| Resolution upgrade | Visible as image replacement | Canvas `drawBitmap()` with `Matrix` scaling -- seamless |

## Files to Create

### 1. `NativePdfViewerV2Activity.java`
The activity shell. Handles:
- Intent parsing (URI, shortcut_id, resume, title) -- same as V1
- Immersive mode setup -- same as V1
- UI chrome (header bar with close, share, open-with buttons) -- same as V1
- Error state -- same as V1
- Resume state save/load -- same as V1
- PdfRenderer lifecycle (open/close/destroy)
- Hosts the `PdfDocumentView`

### 2. `PdfDocumentView.java` (inner class or separate file)
The core custom `View`. This is the heart of V2.

**State it owns:**
- `scrollY` (float) -- continuous vertical scroll position in document coordinates
- `zoomLevel` (float) -- current zoom (0.2x to 5.0x)
- `panX` (float) -- horizontal pan when zoomed in
- `focalX, focalY` -- zoom focal point
- `pageOffsets[]` (int array) -- cumulative Y offset for each page top

**onDraw() logic (the critical path):**
1. Apply canvas transform: `canvas.translate(panX, -scrollY * zoomLevel)` then `canvas.scale(zoomLevel, zoomLevel, focalX, focalY)`
2. Calculate which pages intersect the viewport (binary search on `pageOffsets`)
3. For each visible page:
   - Check bitmap cache for exact zoom match -> draw it
   - If no exact match: find ANY cached bitmap for that page (any zoom level) -> draw it scaled via `canvas.drawBitmap(bitmap, srcRect, dstRect, paint)` -- this is the key to invisible resolution upgrades
   - If no bitmap at all: draw a white rectangle (page shape) -- this only happens on first open, for <1 frame
4. Request async render for any page missing its target-zoom bitmap

**Why this eliminates all artifacts:**
- There is no "swap" moment. `onDraw()` always draws *something* for every visible page
- When a higher-res bitmap arrives, the next `invalidate()` simply draws it instead -- same position, same size, just sharper
- Since the canvas transform is the ONLY coordinate system (no layout manager), zoom and scroll are always perfectly consistent
- No settling delay needed -- zoom changes are pure canvas operations with zero layout cost

**Gesture handling:**
- `ScaleGestureDetector` for pinch-to-zoom (same as V1)
- `GestureDetector` for fling scroll, double-tap zoom, single-tap toggle
- Manual touch tracking for pan when zoomed in
- `OverScroller` for fling physics (replaces custom `VelocityTracker` + `ValueAnimator` approach in V1)

**Scroll implementation:**
- `scrollY` is in document-space pixels (sum of all page heights + gaps)
- Fling uses `OverScroller.fling()` -- standard Android physics, no custom friction math
- `computeScroll()` reads from `OverScroller` and calls `invalidate()` -- standard pattern

**Double-tap zoom:**
- `ValueAnimator` from current zoom to target zoom
- Each frame: update `zoomLevel`, adjust `scrollY` to keep focal point stable, `invalidate()`
- No layout updates, no adapter notifications

### 3. `PdfBitmapCache.java` (inner class)
Thin wrapper around `LruCache` with:
- Key: `pageIndex` (zoom level NOT in key -- cache stores best available bitmap per page)
- Actually, store multiple entries per page keyed by zoom level, but `onDraw()` searches for best available
- Key format: `pageIndex_zoomLevel` (same as V1 but with smarter fallback search)
- `findBest(pageIndex)`: returns highest-quality cached bitmap for a page, at any zoom level

### 4. `PdfRenderWorker.java` (inner class)
Background rendering with:
- `ExecutorService` with 2 threads
- Generation counter to cancel stale renders (same pattern as V1)
- Renders at target zoom level
- Posts `view.postInvalidate()` when done (not `setImageBitmap()` -- just triggers redraw)
- Priority: visible pages first, then prerender buffer

## What Stays the Same as V1

- UI chrome layout (header bar, buttons, page indicator)
- Auto-hide header behavior
- Share / Open-with intent logic
- Resume state (SharedPreferences with page index + scroll fraction + zoom)
- Error state UI
- Immersive mode setup
- ProGuard rules (add V2 activity)
- Fast scroll overlay concept (adapted to work with `scrollY` instead of `LinearLayoutManager`)
- CrashLogger integration

## What Does NOT Change

- `NativePdfViewerActivity.java` -- untouched, fully functional
- `PDFProxyActivity.java` -- untouched (still routes to V1)
- `AndroidManifest.xml` -- V2 activity added alongside V1
- No callers are migrated

## Manifest Addition

```xml
<activity
    android:name=".NativePdfViewerV2Activity"
    android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen"
    android:exported="false"
    android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden" />
```

## ProGuard Addition

```
-keep class app.onetap.access.NativePdfViewerV2Activity { *; }
```

## Rendering Strategy Summary

1. **During interaction (scroll/zoom/pan):** Canvas transforms only. Zero layout work. Existing bitmaps drawn scaled via `drawBitmap()` with `Matrix`. The user sees content at every frame.

2. **After interaction settles:** Background threads render at target zoom. When done, `postInvalidate()` triggers redraw. `onDraw()` now finds the sharper bitmap and draws it. No swap, no flash -- just a seamless sharpening.

3. **First open:** Page dimensions scanned (first 10 sync, rest async). First visible page rendered at screen resolution immediately. White page rectangles shown for unrendered pages (shape-accurate, not gray placeholders).

## Why This Feels Closer to Drive

- **No dual coordinate system.** V1 has RecyclerView layout coordinates AND canvas transform coordinates that must stay synchronized. V2 has one coordinate system.
- **No discrete bitmap swaps.** V1 calls `setImageBitmap()` which is a view property change. V2 draws bitmaps to canvas -- the transition from low-res to high-res is invisible because it happens in the same draw call, at the same position and size.
- **No settling delay.** V1 needs 180ms after pinch ends to commit layout. V2 has no layout to commit -- zoom is always just a canvas scale factor.
- **Smooth sub-1.0x zoom.** V1 must call `notifyItemRangeChanged()` to resize page layouts when zooming out. V2 just scales the canvas -- pages shrink smoothly with no layout pass.

## Validation Checklist

- Zoom in/out repeatedly: no flashes (canvas-only transform)
- Zoom + pan aggressively: no jumps (single coordinate system)
- Scroll while zoomed: stable (scrollY + zoomLevel, no layout manager)
- Fast scroll through long PDFs: no gray pages (fallback bitmap always available after first render)
- Large PDFs (300+ pages): open without blocking (progressive scan, same as V1)
- Low-memory: graceful eviction preserves visible pages
- Return to a page: instant (bitmap cache hit)

## Estimated Size

- `NativePdfViewerV2Activity.java`: ~1800-2200 lines (simpler than V1's 2772 because no RecyclerView/Adapter complexity)
- The core `PdfDocumentView` is ~800 lines, the rest is UI chrome and lifecycle (mostly reused patterns from V1)

