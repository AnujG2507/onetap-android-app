

# Fix: Slideshow Viewer Back Button Should Exit App (Like Video Player)

## Problem

When a slideshow shortcut is tapped from the home screen, the native `SlideshowProxyActivity` launches `MainActivity` with a deep link. Pressing the back button (or the header arrow) calls `navigate(-1)`, which goes back in the WebView history to the app's home screen instead of closing the app. This is inconsistent with the Video Player, which calls `App.exitApp()` to close immediately.

## Solution

Match the Video Player's behavior: on native platform, exit the app; on web, use `window.history.back()`.

## Changes

### File: `src/pages/SlideshowViewer.tsx`

1. **Replace `useBackButton` hook** (lines 39-43) with a direct `App.addListener('backButton')` that calls `App.exitApp()`, matching how `VideoPlayer.tsx` does it.

2. **Update `handleClose`** (lines 270-272) to call `App.exitApp()` on native instead of `navigate(-1)`.

3. **Update `handleSwipeDown`** (lines 227-229) to also exit the app on native.

All three exit paths (hardware back, header arrow, swipe down) will consistently exit the app on native, and use `window.history.back()` on web.

### No other files changed.

