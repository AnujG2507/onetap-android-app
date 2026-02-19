

# Harden PDF Viewer Against Rapid Open/Close Crashes

## Current State

The `destroyed` flag and null-guards added in the previous fix correctly cover the main crash vectors. The crash logs provided (all dated 2026-02-19) are from APK builds made **before** those fixes were compiled in. The NPE ("ExecutorService.execute on null") matches exactly the pattern our guards now prevent.

However, there are remaining defensive gaps that could cause crashes in edge cases:

## Remaining Gaps

### 1. Queued handler runnables not cancelled in onDestroy
`renderAfterZoom`, `renderAfterScroll`, and `piHideRunnable` are posted via `mainHandler.postDelayed()` but never explicitly cancelled in `onDestroy`. While the `destroyed` check inside `requestVisiblePageRenders` catches this, it is wasteful and fragile -- if any future code path skips the check, it will crash.

### 2. No try-catch around `exec.execute()` in scheduleRender
If the executor is captured as non-null but has already been `shutdownNow()`'d (race window between capture and use), `exec.execute()` throws `RejectedExecutionException`. This is unlikely on the main thread but possible from a background thread re-entry.

### 3. Inner view animators not cancelled
`pageIndicatorFadeAnimator`, `fsFadeAnimator`, and any running `scroller` fling are not stopped in `onDestroy`. Their update callbacks post to handlers and call `invalidate()`, which can trigger `computeScroll()` -> `requestVisiblePageRenders()` after destruction.

### 4. computeScroll() has no destroyed guard
The `computeScroll()` method at line 1523 calls `requestVisiblePageRenders()` during fling. While the call is guarded inside `requestVisiblePageRenders`, adding a guard at the top of `computeScroll` is a cheap early exit.

## Changes

### File: `NativePdfViewerV2Activity.java`

#### 1. Cancel all handler callbacks in onDestroy
After setting `destroyed = true`, add:
```java
mainHandler.removeCallbacksAndMessages(null);
```
This cancels ALL queued runnables (renderAfterZoom, renderAfterScroll, entryRemoved posts, page indicator updates, etc.) in one call.

#### 2. Wrap exec.execute() in try-catch
In `scheduleRender`:
```java
try {
    exec.execute(() -> renderPage(pageIndex, zoom, gen));
} catch (Exception e) {
    pendingRenders.remove(key);
}
```

#### 3. Cancel inner view animators and scroller in onDestroy
Before setting `documentView = null`, stop all animations on the view:
```java
PdfDocumentView dv = documentView;
if (dv != null) {
    dv.cleanup();
}
documentView = null;
```

Add a `cleanup()` method to `PdfDocumentView`:
```java
void cleanup() {
    scroller.forceFinished(true);
    mainHandler.removeCallbacks(renderAfterZoom);
    mainHandler.removeCallbacks(renderAfterScroll);
    piHideHandler.removeCallbacksAndMessages(null);
    fsHideHandler.removeCallbacksAndMessages(null);
    if (pageIndicatorFadeAnimator != null) pageIndicatorFadeAnimator.cancel();
    if (fsFadeAnimator != null) fsFadeAnimator.cancel();
}
```

#### 4. Add destroyed guard to computeScroll
```java
@Override
public void computeScroll() {
    if (destroyed) return;
    // ... existing code
}
```

#### 5. Guard the background scan execute call
Line 367 (`renderExecutor.execute(...)` in `openPdf`) should also be guarded:
```java
ExecutorService exec = renderExecutor;
if (exec != null && !destroyed) {
    exec.execute(() -> { ... });
}
```

## Summary

These are belt-and-suspenders additions to the existing fix. The primary fix (the `destroyed` flag) is already in the code. These changes ensure that even if a handler callback or animator fires during the narrow teardown window, it is either cancelled before it runs or caught safely.

After these changes, rebuild the APK and test rapid open/close on a physical device.

