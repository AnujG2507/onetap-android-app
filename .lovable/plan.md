

# Make Built-in PDF Viewer Match Google Drive Visual Style

## Problem Summary

Comparing the two screenshots reveals visual discrepancies between the built-in PDF viewer and Google Drive's PDF viewer, despite functional features (train view, fast scroll) already being implemented:

1. **Pages appear with thick black bands** - The built-in viewer shows heavy visual separation between pages
2. **Less content visible** - Despite train view logic, fewer pages are rendered/visible
3. **No floating page indicator badge** - Drive shows "1-5/121" on the right side as a floating chip
4. **No grid/thumbnail view button** - Drive has a 6-dot icon for quick page navigation
5. **Page cards lack subtle shadows** - Drive pages look like floating cards with soft shadows

---

## Root Cause Analysis

### Issue 1: Thick Black Bands Between Pages

The current implementation uses:
- `PAGE_GAP_DP = 8` (line 97) - 8dp gap between pages
- RecyclerView background is `0xFF1A1A1A` (dark gray)
- Pages have white background

The visual result shows much thicker black bands than Drive because:
1. When zoomed out (train view), the gap stays at 8dp but pages are scaled smaller, making gaps proportionally larger
2. The page item decoration doesn't scale with zoom level

**Solution**: Reduce page gap and make it zoom-aware. Drive uses ~2dp gaps at normal zoom.

### Issue 2: Fewer Pages Visible

The train view logic exists but may not be fully active. Looking at the code:
- `getScaledPageHeight()` correctly scales heights when `currentZoom < 1.0f`
- However, the initial zoom is `1.0f`, so train view only activates after pinching out

**Issue**: The screenshot comparison shows Drive at what appears to be a default zoomed-out state. Our viewer starts at 1.0x (fit-to-width).

**Solution**: Consider a slightly zoomed-out default (e.g., 0.7x) to show more pages initially, or match Drive's exact default scale.

### Issue 3: No Floating Page Indicator Badge

Drive shows a floating "1-5/121" badge on the right side with a grid button. Our implementation:
- Has a header-only page indicator that auto-hides
- Has a fast scroll popup, but only during dragging

**Solution**: Add a persistent floating page indicator chip on the right side (similar to the `FastScrollOverlay` but always visible).

### Issue 4: Missing Grid/Thumbnail View Button

Drive has a 6-dot grid icon next to the page indicator for quick navigation via thumbnails.

**Solution**: Add a grid button that opens a thumbnail sheet/overlay for fast page selection.

### Issue 5: Page Shadow Style

Drive pages have subtle card-like shadows making them appear to float. Our pages have:
- Flat white background
- No elevation/shadow effect

**Solution**: Add subtle shadow/elevation to page items using Android's elevation or a custom shadow drawable.

---

## Detailed Implementation Plan

### Phase 1: Visual Styling Fixes (Priority: High)

**1.1: Reduce Page Gap and Make Zoom-Aware**

| File | Location | Change |
|------|----------|--------|
| `NativePdfViewerActivity.java` | Line 97 | Change `PAGE_GAP_DP = 8` to `PAGE_GAP_DP = 4` |
| `NativePdfViewerActivity.java` | Lines 1359-1369 | Scale gap by zoom level when below 1.0x |

```java
// In ItemDecoration.getItemOffsets():
int gap = pageGapPx;
if (currentZoom < 1.0f) {
    gap = Math.max(dpToPx(2), (int)(pageGapPx * currentZoom));
}
outRect.top = gap;
```

**1.2: Add Subtle Page Shadow**

| File | Location | Change |
|------|----------|--------|
| `NativePdfViewerActivity.java` | Lines 1893-1903 | Add elevation to ImageView items |

```java
// In onCreateViewHolder():
imageView.setElevation(dpToPx(2));
imageView.setOutlineProvider(ViewOutlineProvider.BOUNDS);
imageView.setClipToOutline(true);
```

**1.3: Adjust Default Zoom**

The built-in viewer starts at 1.0x (fit-to-width). Consider matching Drive's behavior where pages appear smaller initially.

| File | Location | Change |
|------|----------|--------|
| `NativePdfViewerActivity.java` | Line 87 | Change default zoom: `FIT_PAGE_ZOOM = 0.8f` or keep at 1.0f but ensure train view activates |

Alternatively, keep 1.0x as default but ensure the comparison is fair (Drive may also be zoomed out in the screenshot).

### Phase 2: Floating Page Indicator Badge (Priority: Medium)

Add a floating chip showing "X-Y/Total" on the right side (like Drive's "1-5/121"):

**2.1: Create Floating Badge View**

Add a new view in `buildUI()` positioned on the right side:

```java
// Floating page badge (Drive-style)
pageBadge = new TextView(this);
pageBadge.setBackgroundResource(android.R.drawable.dialog_frame);
pageBadge.setTextColor(0xFFFFFFFF);
pageBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
pageBadge.setPadding(dpToPx(12), dpToPx(6), dpToPx(12), dpToPx(6));

GradientDrawable badgeBg = new GradientDrawable();
badgeBg.setColor(0xCC424242);
badgeBg.setCornerRadius(dpToPx(16));
pageBadge.setBackground(badgeBg);

FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(
    ViewGroup.LayoutParams.WRAP_CONTENT,
    ViewGroup.LayoutParams.WRAP_CONTENT
);
badgeParams.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
badgeParams.setMarginEnd(dpToPx(16));
pageBadge.setLayoutParams(badgeParams);
```

**2.2: Update Page Range Display**

| Method | Change |
|--------|--------|
| `updatePageIndicator()` | Show visible page range: "1-5/121" instead of "1 / 121" |

```java
int firstVisible = layoutManager.findFirstVisibleItemPosition() + 1;
int lastVisible = layoutManager.findLastVisibleItemPosition() + 1;
int total = pageWidths.length;

if (firstVisible == lastVisible) {
    pageBadge.setText(firstVisible + "/" + total);
} else {
    pageBadge.setText(firstVisible + "-" + lastVisible + "/" + total);
}
```

### Phase 3: Grid/Thumbnail Navigation (Priority: Low)

Add a grid button next to the page badge that shows a thumbnail grid overlay:

**3.1: Add Grid Button**

```java
// Grid button (6-dot icon)
gridButton = new ImageButton(this);
gridButton.setImageResource(android.R.drawable.ic_dialog_dialer); // Placeholder
gridButton.setBackground(badgeBg.getConstantState().newDrawable());
gridButton.setOnClickListener(v -> showThumbnailGrid());
```

**3.2: Thumbnail Grid Implementation**

This is a larger feature - create a fullscreen overlay with a RecyclerView grid showing page thumbnails. Tapping a thumbnail jumps to that page.

(Note: This may be deferred as it's a significant addition beyond visual parity)

---

## Files to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Reduce page gap, add shadow elevation, floating page badge, update page indicator format, optional grid button |

---

## Implementation Priority

1. **High Priority (Visual Parity)**
   - Reduce page gap from 8dp to 4dp
   - Make gap zoom-aware
   - Add subtle page elevation/shadow
   - Add floating page badge with range display

2. **Medium Priority (UX Parity)**
   - Grid button placeholder (shows toast or simple dialog)

3. **Lower Priority (Full Feature)**
   - Full thumbnail grid navigation overlay

---

## Testing Checklist

- [ ] Pages have smaller gaps, closer to Drive appearance
- [ ] Page gaps scale when zoomed out (train view)
- [ ] Pages have subtle shadow/elevation effect
- [ ] Floating page badge shows "X-Y/Total" format
- [ ] Badge updates as user scrolls
- [ ] Badge remains visible while scrolling (doesn't auto-hide)
- [ ] Pinch zoom still works correctly
- [ ] Fast scroll still works correctly
- [ ] Resume position persists correctly

