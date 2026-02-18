

# Fix: Single Image Shortcut Not Loading on Subsequent Taps

## Root Cause

There are two bugs working together:

### Bug 1: Event listener is on the wrong component

The `onetap:open-slideshow` event listener lives exclusively in `Index.tsx` (line 140-149). When the user taps a shortcut while already viewing a slideshow, they are on the `/slideshow/:id` route -- `Index.tsx` is unmounted, so the event is never received. The deep link fires into the void.

### Bug 2: Same-route navigation is a no-op

Even if the event were received, calling `navigate('/slideshow/same-id')` with the same shortcut ID does not remount the component. React Router sees identical params and skips re-rendering.

## Fix

### Change 1: Move the slideshow deep link listener to `App.tsx` (always mounted)

Instead of handling the `onetap:open-slideshow` event only in `Index.tsx`, handle it at the App level where the router lives. This ensures the listener is always active regardless of which route the user is on.

- Remove the slideshow event listener from `Index.tsx`
- Create a small `SlideshowDeepLinkHandler` component inside `App.tsx` that:
  - Listens for `onetap:open-slideshow` events
  - Uses `useNavigate` to route to the slideshow
  - Appends a cache-busting timestamp query param (`?t=...`) to force React Router to treat it as a new navigation, which remounts the `SlideshowViewer` component

### Change 2: Force remount on repeated navigation to same slideshow

In `SlideshowViewer.tsx`, use `searchParams` (already imported but unused for this purpose) so that a change in `?t=` query param triggers a fresh load cycle. Since `AnimatePresence` and state are all keyed on component mount, a forced remount via the timestamp param is sufficient.

Alternatively (and more cleanly), use `useLocation().key` as a React `key` on the viewer wrapper to force remount whenever navigation occurs, even to the same path.

### Change 3: Reset state properly when shortcutId changes

As a safety net, ensure `SlideshowViewer` resets all image state (`convertedUrls`, `imageLoadStates`, `images`, `thumbnails`) when `shortcutId` changes. Currently the `images` useEffect (line 84) does reset `imageLoadStates`, but `convertedUrls` is only set additively -- it is never cleared. On a re-navigation, stale converted URLs from the previous session could persist.

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Add `SlideshowDeepLinkHandler` component inside `BrowserRouter` that listens for `onetap:open-slideshow` and navigates with a timestamp param |
| `src/pages/Index.tsx` | Remove the `onetap:open-slideshow` event listener (lines 139-149) |
| `src/pages/SlideshowViewer.tsx` | Clear `convertedUrls` and `imageLoadStates` when `shortcutId` changes; optionally key the component on `location.key` for forced remount |

## Technical Detail

### `App.tsx` -- new handler component

```typescript
function SlideshowDeepLinkHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: CustomEvent<{ slideshowId: string }>) => {
      const { slideshowId } = event.detail;
      // Timestamp forces React Router to treat as new navigation
      navigate(`/slideshow/${slideshowId}?t=${Date.now()}`, { replace: true });
    };
    window.addEventListener('onetap:open-slideshow', handler as EventListener);
    return () => window.removeEventListener('onetap:open-slideshow', handler as EventListener);
  }, [navigate]);
  return null;
}
```

This component renders nothing but is always mounted inside `BrowserRouter`, so it can always receive events and navigate.

### `SlideshowViewer.tsx` -- state reset

Add `convertedUrls` and `imageLoadStates` clearing at the top of the shortcut-loading `useEffect`:

```typescript
useEffect(() => {
  // Reset all image state for clean load
  setConvertedUrls(new Map());
  setImageLoadStates(new Map());
  setImages([]);
  setThumbnails([]);
  setCurrentIndex(0);
  setIsLoading(true);
  // ... rest of existing logic
}, [shortcutId, getShortcut]);
```

## Why This Works

- The listener is now always active (App-level, always mounted)
- The `?t=` param ensures React Router treats every tap as a fresh navigation
- State is fully reset on each load, preventing stale converted URLs or load states
- No changes needed to native Android code or deep link format

