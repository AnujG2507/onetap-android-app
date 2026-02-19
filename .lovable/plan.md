

# Fix: PDF Resume Position Lost in V2 Viewer

## Problem Identified

The V2 PDF viewer has a **race condition** that breaks resume for documents longer than 10 pages.

### Root Cause

In `onCreate`, the sequence is:

```text
1. openPdf()         --> scans only first 10 pages synchronously (SYNC_SCAN_PAGES = 10)
2. initDocument()    --> calculates totalDocHeight based on those 10 pages only
3. loadResumeState() --> restores scrollY (e.g., page 50's scroll position)
   --> restoreState() calls clampScrollAndPan()
   --> maxScroll = totalDocHeight * zoom - viewHeight
   --> totalDocHeight only covers 10 pages, so scrollY gets CLAMPED to end of page 10
4. Background thread finishes scanning remaining pages
   --> onPageScanProgress() recalculates totalDocHeight with all pages
   --> But the saved scrollY has already been clamped and lost
```

The V1 viewer didn't have this problem because it saved a **page index** (integer) which doesn't depend on document height. V2 saves **scrollY** (float) which is only valid when the full document dimensions are known.

### Additional Issue

V2 uses a different SharedPreferences file (`pdf_resume_positions_v2`) from V1 (`pdf_resume_positions`). This is correct (different coordinate systems), but users upgrading from V1 lose all saved resume positions. This is acceptable since the formats are incompatible, but worth noting.

## Solution

Store the resume scrollY as a **fraction of total document height** instead of an absolute pixel value. This makes resume resilient to:
- Incomplete page scans (the fraction is recalculated when full height is known)
- Screen size changes (already partially handled, but this is more robust)

Additionally, defer resume application until page scan is complete for long documents.

## Technical Changes

### File: `NativePdfViewerV2Activity.java`

#### 1. Save as fraction instead of absolute scrollY

In `saveResumeState()`, save `scrollFraction` = `scrollY / (totalDocHeight * zoomLevel)`:

```java
private void saveResumeState() {
    if (shortcutId == null || !resumeEnabled || documentView == null) return;
    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

    float scrollY = documentView.getScrollYPosition();
    float zoom = documentView.getZoomLevel();
    float totalH = documentView.getTotalDocHeight();

    // Save as fraction of total zoomed document height for scan-independence
    float scrollFraction = 0f;
    if (totalH * zoom > 0) {
        scrollFraction = scrollY / (totalH * zoom);
    }

    prefs.edit()
        .putFloat(shortcutId + "_scrollFraction", scrollFraction)
        .putFloat(shortcutId + "_zoom", zoom)
        .putFloat(shortcutId + "_panX", documentView.getPanX())
        .putInt(shortcutId + "_screenWidth", screenWidth)
        .putLong(shortcutId + "_timestamp", System.currentTimeMillis())
        .apply();
}
```

#### 2. Add pending resume fields and deferred application

Add instance fields to hold pending resume state:

```java
private boolean hasPendingResume = false;
private float pendingScrollFraction = 0f;
private float pendingZoom = 1.0f;
private float pendingPanX = 0f;
```

#### 3. Update loadResumeState to store pending values

```java
private void loadResumeState() {
    if (shortcutId == null || !resumeEnabled) return;
    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

    pendingScrollFraction = prefs.getFloat(shortcutId + "_scrollFraction", 0f);
    // Backward compat: if no fraction saved, try old scrollY key
    if (pendingScrollFraction == 0f) {
        float oldScrollY = prefs.getFloat(shortcutId + "_scrollY", 0f);
        // Can't convert reliably without full doc height, leave at 0
    }
    pendingZoom = prefs.getFloat(shortcutId + "_zoom", 1.0f);
    pendingPanX = prefs.getFloat(shortcutId + "_panX", 0f);
    hasPendingResume = (pendingScrollFraction > 0f || pendingZoom != 1.0f);

    if (pageScanComplete) {
        applyPendingResume();
    }
    // Otherwise, will be applied when onPageScanProgress completes
}
```

#### 4. Add applyPendingResume method

```java
private void applyPendingResume() {
    if (!hasPendingResume || documentView == null) return;
    hasPendingResume = false;

    float totalH = documentView.getTotalDocHeight();
    float scrollY = pendingScrollFraction * totalH * pendingZoom;
    documentView.restoreState(scrollY, pendingZoom, pendingPanX);
    requestVisiblePageRenders();
}
```

#### 5. Apply resume after background scan completes

In `onPageScanProgress`, after recalculating offsets, apply pending resume:

```java
mainHandler.post(() -> {
    if (documentView != null) {
        documentView.onPageScanProgress(scannedPageCount, true);
        applyPendingResume();  // <-- ADD THIS
        requestVisiblePageRenders();
    }
});
```

#### 6. Expose totalDocHeight from PdfDocumentView

Add a getter to the inner `PdfDocumentView` class:

```java
float getTotalDocHeight() { return totalDocHeight; }
```

### For short documents (10 pages or fewer)

When `pageScanComplete` is true after `openPdf()`, `loadResumeState()` calls `applyPendingResume()` immediately -- no deferred behavior needed.

## Summary

| Aspect | V1 (working) | V2 (broken) | V2 (fixed) |
|--------|-------------|-------------|------------|
| Saved format | Page index | Absolute scrollY | Scroll fraction |
| Scan dependency | None | Requires full scan | Deferred until scan complete |
| 10+ page docs | Works | Clamped to page 10 | Works |

