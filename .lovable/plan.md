
# Fix: Crash on Rapid PDF Open/Close

## Problem

When a PDF shortcut is opened and closed quickly multiple times, the app crashes. The root cause is a chain of race conditions and missing guards in the cleanup path.

## Crash Vectors Identified

### 1. `evictAll()` triggers re-render after executor shutdown (RejectedExecutionException)
In `onDestroy`, the sequence is:
```text
renderExecutor.shutdownNow()  // line 279
renderExecutor = null          // line 285
bitmapCache.evictAll()         // line 288 -- triggers entryRemoved() callbacks
  -> entryRemoved posts to mainHandler
    -> scheduleRender() called
      -> renderExecutor.execute() -- NPE or RejectedExecutionException
```
The `evictAll()` call fires `entryRemoved` for every cached bitmap. The callback checks if the page is visible and posts a re-render -- but the executor is already dead.

### 2. `scheduleRender` has no null-check on `renderExecutor`
Line 428: `renderExecutor.execute(...)` will NPE if called after `onDestroy` sets it to null.

### 3. Background threads hold stale PdfRenderer reference
A render thread grabs `PdfRenderer r = pdfRenderer` (line 466), then enters `synchronized(r)`. Meanwhile `onDestroy` sets `pdfRenderer = null` and calls `rendererToClose.close()`. The thread is still inside `synchronized(r)` using the now-closed renderer -- `IllegalStateException: Already closed`.

### 4. No `isFinishing()` guard on mainHandler posts
Background threads post to `mainHandler` without checking if the activity is finishing, causing work to execute on a destroyed activity.

### 5. No `isDestroyed` flag for fast short-circuit
Multiple code paths check `pdfRenderer == null` and `documentView != null` individually, but there's no single flag to short-circuit everything during teardown.

## Solution

### Add a volatile `destroyed` flag
```java
private volatile boolean destroyed = false;
```
Set it as the very first thing in `onDestroy()`. Check it in all background thread paths.

### Fix onDestroy ordering
Move `bitmapCache.evictAll()` BEFORE `renderExecutor.shutdownNow()` -- no wait, that makes it worse. Instead, **set `documentView = null` before `evictAll()`** so `entryRemoved` sees `documentView == null` and skips re-render.

Corrected `onDestroy` sequence:
```text
1. destroyed = true
2. Set documentView = null (prevents entryRemoved from scheduling renders)
3. Increment renderGeneration (invalidates in-flight renders)
4. shutdownNow + awaitTermination
5. evictAll (safe now -- entryRemoved sees documentView==null)
6. Close renderer + fd
```

### Guard `scheduleRender` against null executor
```java
private void scheduleRender(int pageIndex, float zoom) {
    ExecutorService exec = renderExecutor;
    if (destroyed || exec == null || ...) return;
    ...
    exec.execute(() -> renderPage(pageIndex, zoom, gen));
}
```

### Guard `renderPage` with destroyed check
```java
private void renderPage(int pageIndex, float targetZoom, int generation) {
    if (destroyed) return;
    ...
}
```

### Guard all `mainHandler.post` calls
```java
mainHandler.post(() -> {
    if (destroyed || documentView == null) return;
    ...
});
```

## Technical Details

### File: `NativePdfViewerV2Activity.java`

1. Add field: `private volatile boolean destroyed = false;`

2. Update `onDestroy()`:
   - Set `destroyed = true` first
   - Set `documentView = null` before evictAll
   - Increment `renderGeneration` to cancel in-flight renders
   - Clear `pendingRenders` and `pageKeyIndex`

3. Update `scheduleRender()`:
   - Add `destroyed` and null executor check
   - Capture executor in local variable to avoid NPE

4. Update `renderPage()`:
   - Add `if (destroyed) return` at the top
   - Add `destroyed` check after bitmap creation (before PdfRenderer access)

5. Update `entryRemoved()` callback:
   - Add `if (destroyed) return` at the top

6. Update background scan thread (in `openPdf`):
   - Add `if (destroyed) break` in the loop
   - Guard the `mainHandler.post` with `if (!destroyed)`

7. Update `requestVisiblePageRenders()`:
   - Add `if (destroyed)` guard

No changes to other files.
