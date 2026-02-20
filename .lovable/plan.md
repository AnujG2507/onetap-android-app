
## Root Cause

In `src/pages/Index.tsx`, the `swipeEnabled` flag gates the swipe gesture handler:

```ts
const swipeEnabled = showBottomNav
  && !isBookmarkSelectionMode
  && !isNotificationsSelectionMode
  && !isRemindersCreatorOpen
  && !isRemindersEditorOpen
  && !isBookmarkActionSheetOpen
  && !isAccessPickerOpen;   // <-- this is the culprit
```

When the inline picker (photo/video/link/etc.) in the Access tab is expanded, `isAccessPickerOpen` becomes `true`, which sets `swipeEnabled = false` and completely disables the swipe-to-navigate hook.

This was likely added defensively to prevent accidental tab switches while interacting with the picker. However, the `useSwipeNavigation` hook already handles this correctly on its own — it has a built-in vertical lock:

```ts
// from useSwipeNavigation.ts
if (deltaY > 10 && deltaY >= deltaX) {
  isVerticalLocked.current = true;
  return; // bail out, let vertical scroll work
}
```

Any tap or vertical drag on the picker (expanding it, selecting an option) will be classified as a vertical gesture and the hook will bail immediately. Only a clear, intentional horizontal swipe triggers tab navigation. So the `!isAccessPickerOpen` guard is redundant and overly restrictive.

## Fix

Remove `&& !isAccessPickerOpen` from the `swipeEnabled` condition in `src/pages/Index.tsx`.

### Before
```ts
const swipeEnabled = showBottomNav
  && !isBookmarkSelectionMode
  && !isNotificationsSelectionMode
  && !isRemindersCreatorOpen
  && !isRemindersEditorOpen
  && !isBookmarkActionSheetOpen
  && !isAccessPickerOpen;
```

### After
```ts
const swipeEnabled = showBottomNav
  && !isBookmarkSelectionMode
  && !isNotificationsSelectionMode
  && !isRemindersCreatorOpen
  && !isRemindersEditorOpen
  && !isBookmarkActionSheetOpen;
```

The `isAccessPickerOpen` state and its setter (`setIsAccessPickerOpen`) can then be removed entirely since nothing else uses them.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Remove `!isAccessPickerOpen` from `swipeEnabled`, remove `isAccessPickerOpen` state, remove `onPickerOpenChange={setIsAccessPickerOpen}` prop from `AccessFlow` |
