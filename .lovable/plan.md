
# Current Plan

No active plan. All previous tasks completed.

## Recently Completed

### Fix: Bottom CTA Overlap on Android (Permanent)
- Disabled edge-to-edge rendering via `WindowCompat.setDecorFitsSystemWindows(window, true)` in `MainActivity.java`
- Replaced `--android-nav-height` with `--android-safe-bottom` CSS variable (24px minimum floor)
- Removed all `env(safe-area-inset-bottom)` dependencies from CSS
- Files: `MainActivity.java`, `src/index.css`

### Fix: Single Image Shortcut Not Loading on Subsequent Taps
- Moved `onetap:open-slideshow` event listener from `Index.tsx` to `App.tsx` (`SlideshowDeepLinkHandler`)
- Added `?t=` timestamp param to force React Router remount on repeated taps
- Added full state reset in `SlideshowViewer.tsx` on navigation
- Added `useBackButton` to `SlideshowViewer.tsx` for Android back button support
- Files: `src/App.tsx`, `src/pages/Index.tsx`, `src/pages/SlideshowViewer.tsx`
