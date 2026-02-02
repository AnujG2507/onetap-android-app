

# Fix Native PDF Viewer - Blank White Pages Issue

## Problem Diagnosis

After a thorough analysis of the `NativePdfViewerActivity.java` code, I've identified **two critical bugs** that cause blank white pages to appear:

### Bug 1: Incorrect Matrix Usage in page.render()

The current code creates a bitmap at the target size, then applies a scaling Matrix to the render call:

```java
float lowScale = baseScale * targetZoom * LOW_RES_SCALE;
int lowWidth = Math.max(1, (int) (pageWidth * lowScale));
int lowHeight = Math.max(1, (int) (pageHeight * lowScale));

Bitmap lowBitmap = Bitmap.createBitmap(lowWidth, lowHeight, Bitmap.Config.RGB_565);
Matrix lowMatrix = new Matrix();
lowMatrix.setScale(lowScale, lowScale);  // ❌ WRONG!
page.render(lowBitmap, null, lowMatrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

**Why this is wrong:** The Matrix parameter transforms the PDF content in its *original coordinate system* (typically 72 DPI PDF points). When you pass a scale-down matrix, you're telling PdfRenderer to render the PDF at an even smaller size *within* the already-small bitmap. The result is that the content becomes microscopic or invisible.

**Correct approach:** Pass `null` for the Matrix parameter. PdfRenderer will automatically scale the PDF content to fit the destination bitmap dimensions.

### Bug 2: Double Executor Wrapping

The `onBindViewHolder` method does:
```java
renderExecutor.execute(() -> renderPageAsync(position, currentZoom, false));
```

But `renderPageAsync` internally ALSO wraps its work in:
```java
renderExecutor.execute(() -> { ... });
```

This double-wrapping adds unnecessary complexity and could cause timing issues.

---

## Technical Solution

### Changes to `NativePdfViewerActivity.java`

1. **Fix `renderPageAsync()` method** - Remove the internal `renderExecutor.execute()` wrapper since it's already being called from within an executor task. The method should directly perform its work.

2. **Fix the Matrix usage** - Pass `null` instead of the scaling Matrix to `page.render()`. The bitmap is already sized correctly, so PdfRenderer will auto-scale.

3. **Simplified rendering logic:**
   ```java
   // Create bitmap at desired output size
   Bitmap lowBitmap = Bitmap.createBitmap(lowWidth, lowHeight, Bitmap.Config.RGB_565);
   lowBitmap.eraseColor(Color.WHITE);
   
   // Render - pass null for Matrix, let PdfRenderer auto-scale to bitmap dimensions
   page.render(lowBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
   ```

4. **Same fix for high-res rendering** - Remove the Matrix parameter for the high-resolution pass as well.

---

## Implementation Steps

### Step 1: Fix the renderPageAsync method

Remove the outer `renderExecutor.execute()` wrapper inside `renderPageAsync()` since it's already being called from an executor context in `onBindViewHolder`.

### Step 2: Fix low-res rendering (lines ~688-690)

Change from:
```java
Matrix lowMatrix = new Matrix();
lowMatrix.setScale(lowScale, lowScale);
page.render(lowBitmap, null, lowMatrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

To:
```java
// No Matrix needed - PdfRenderer auto-scales to bitmap size
page.render(lowBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

### Step 3: Fix high-res rendering (lines ~735-737)

Change from:
```java
Matrix highMatrix = new Matrix();
highMatrix.setScale(highScale, highScale);
page.render(highBitmap, null, highMatrix, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

To:
```java
// No Matrix needed - PdfRenderer auto-scales to bitmap size
page.render(highBitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
```

### Step 4: Cleanup unused Matrix import and variables

Remove the Matrix-related code that's no longer needed for rendering.

---

## Files to Modify

| File | Change |
|------|--------|
| `native/android/app/src/main/java/app/onetap/shortcuts/NativePdfViewerActivity.java` | Fix rendering logic to remove incorrect Matrix scaling and double executor wrapping |

---

## Expected Outcome

After these changes:
- PDF pages will render correctly with visible content
- Page indicator will show proper page numbers
- Scrolling will work smoothly with content visible
- Pinch-to-zoom will continue to work (still uses Matrix for visual scaling, but not for rendering)
- Resume position functionality remains intact

