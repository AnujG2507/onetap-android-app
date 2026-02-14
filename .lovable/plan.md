

# Fix Bookmark Swipe-to-Delete Being Overridden by Tab Swipe

## Problem

The bookmarks tab container (in `Index.tsx` line 606) spreads `{...swipeHandlers}` for tab navigation. `BookmarkItem` also has its own `onTouchStart/Move/End` handlers for swipe-to-delete. Since both are on different DOM levels, when a user swipes horizontally on a bookmark item:

1. The bookmark's touch handler detects a delete swipe and updates `swipeX`
2. The parent's touch handler also detects a horizontal swipe and triggers tab navigation
3. Tab navigation wins, overriding the delete gesture

## Solution

In `BookmarkItem.tsx`, stop touch event propagation once a horizontal delete swipe is confirmed. This prevents the event from bubbling up to the parent's swipe navigation handler.

### Changes in `src/components/BookmarkItem.tsx`

**`handleTouchMove`** (around line 151): When `isHorizontalSwipe.current` is confirmed and it's a delete swipe direction, call `e.stopPropagation()` to prevent the parent tab swipe handler from receiving the event.

**`handleTouchStart`** (around line 133): No change needed -- propagation should be allowed initially so the parent can track the start position.

### Technical Detail

Add `e.stopPropagation()` inside `handleTouchMove` right after confirming it's a horizontal delete swipe (where `e.preventDefault()` is already called). This is the minimal, targeted fix:

```text
if (isHorizontalSwipe.current && isDeleteSwipe(deltaX)) {
  e.preventDefault();
  e.stopPropagation();  // <-- add this line
  ...
}
```

Also add `e.stopPropagation()` in the early detection block when `isHorizontalSwipe.current` is first set to `true`, to catch the initial move event as well.

## Files Changed

| File | Change |
|------|--------|
| `src/components/BookmarkItem.tsx` (handleTouchMove, ~line 151) | Add `e.stopPropagation()` when horizontal delete swipe is detected |

## Why This Works

- Touch events bubble from child (BookmarkItem) to parent (tab container)
- By stopping propagation on the BookmarkItem when a delete swipe is detected, the parent's `onTouchMove` never fires
- Vertical scrolling and non-delete horizontal swipes still propagate normally, preserving tab navigation in unaffected areas
- This matches the existing pattern used for horizontal scroll containers (filter chips) noted in the project memory

