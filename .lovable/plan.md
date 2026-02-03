
# Fix PDF Page Background Extending to Screen Edges

## Problem

When zoomed out in train view, the PDF pages' gray/white background extends to the screen edges on left and right, creating an unappealing visual. Google Drive shows pages as centered narrow tiles with dark background on the sides.

## Root Cause

In the current implementation:
- Page `ImageView` width is set to `MATCH_PARENT` (fills entire screen width)
- Only the height is scaled when zoomed out (`getScaledPageHeight()`)
- The white/gray background (`0xFFFFFFFF` or `0xFFF5F5F5`) extends across the full width

This means when zoomed to 0.5x, the page image scales down visually but the container still fills the screen width with its background color.

## Solution

Scale both width AND height when zoomed out (< 1.0x), and center the page tiles horizontally:

### Changes Required

**1. Create zoom-aware page width calculator**

Add a new method `getScaledPageWidth()` that mirrors `getScaledPageHeight()`:

```java
private int getScaledPageWidth(int pageIndex) {
    // At or above 1.0x: Full screen width
    if (currentZoom >= 1.0f) {
        return screenWidth;
    }
    // When zoomed out: Scale width proportionally
    return (int) (screenWidth * currentZoom);
}
```

**2. Update adapter to set explicit width**

In `onCreateViewHolder()`:
- Change width from `MATCH_PARENT` to an explicit value
- Center the ImageView using a wrapper or gravity

In `onBindViewHolder()`:
- Update both width and height based on zoom level:

```java
ViewGroup.LayoutParams params = holder.imageView.getLayoutParams();
params.width = getScaledPageWidth(position);
params.height = getScaledPageHeight(position);
holder.imageView.setLayoutParams(params);
```

**3. Center page tiles horizontally**

Wrap each page in a `FrameLayout` with `MATCH_PARENT` width and transparent/dark background, then center the actual ImageView inside:

```java
// In onCreateViewHolder():
FrameLayout wrapper = new FrameLayout(parent.getContext());
wrapper.setLayoutParams(new RecyclerView.LayoutParams(
    ViewGroup.LayoutParams.MATCH_PARENT,
    ViewGroup.LayoutParams.WRAP_CONTENT
));

ImageView imageView = new ImageView(parent.getContext());
FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
    ViewGroup.LayoutParams.WRAP_CONTENT,
    ViewGroup.LayoutParams.WRAP_CONTENT
);
imageParams.gravity = Gravity.CENTER_HORIZONTAL;
imageView.setLayoutParams(imageParams);
// ... rest of setup

wrapper.addView(imageView);
return new PageViewHolder(wrapper, imageView);
```

**4. Update PageViewHolder to hold wrapper reference**

```java
class PageViewHolder extends RecyclerView.ViewHolder {
    FrameLayout wrapper;
    ImageView imageView;
    int pageIndex = -1;
    
    PageViewHolder(FrameLayout wrapper, ImageView imageView) {
        super(wrapper);
        this.wrapper = wrapper;
        this.imageView = imageView;
    }
}
```

**5. Ensure RecyclerView background is dark**

The RecyclerView already has a dark background (`0xFF1A1A1A`), so when the page tiles become narrower, the dark background will show on the sides.

## Files to Modify

| File | Changes |
|------|---------|
| `NativePdfViewerActivity.java` | Add `getScaledPageWidth()`, update adapter to wrap ImageView in centered FrameLayout, update `onBindViewHolder()` to set both width and height |

## Visual Result

| Scenario | Before | After |
|----------|--------|-------|
| Zoom out (train view) | Gray/white background extends to screen edges | Narrow page tiles centered with dark background on sides |
| Zoom 1.0x (fit-width) | Page fills screen width | Page fills screen width (no change) |
| Zoom > 1.0x | Normal zoom behavior | Normal zoom behavior (no change) |

## Testing Checklist

- [ ] Zoom out to 0.5x - pages should be narrow with dark sides
- [ ] Zoom out fully (0.2x) - 8-10 narrow pages visible, centered
- [ ] Zoom to 1.0x - pages fill screen width (no visible dark sides)
- [ ] Zoom in to 2.5x - normal panning and zoom behavior
- [ ] Scroll through document - pages remain centered
- [ ] Fast scroll still works correctly
- [ ] Page shadows still visible
- [ ] Resume position works correctly
