

# Universal Content Sizing: Fit Content Between System Bars

## Problem

The app uses `min-h-screen` (which maps to `100vh`) for page containers. With Capacitor 8's forced edge-to-edge rendering, `100vh` includes the area **behind** the status bar and navigation bar. While individual components apply safe-area padding (e.g., `pt-header-safe`, `safe-bottom`), there is no single, reliable CSS variable representing the **actual usable viewport height** between the two system bars. This means:

- Content sizing is based on the full physical screen, not the available space
- Different devices with different status bar and nav bar heights get subtly different content proportions
- Components that size children relative to the viewport (e.g., `h-full`, `flex-1` inside `min-h-screen`) may not distribute space correctly

## Solution

Introduce a CSS custom property `--app-available-height` that represents the usable viewport between system bars, and apply it to key page containers. This gives every page a consistent, device-agnostic content area.

### How It Works

```text
+----------------------------+
|      Status Bar (top)      |  <-- --android-safe-top
+----------------------------+
|                            |
|   App Content Area         |  <-- --app-available-height
|   (universal across all    |
|    devices and OEMs)       |
|                            |
+----------------------------+
|    Navigation Bar (bottom) |  <-- --android-safe-bottom
+----------------------------+
```

The CSS calculation:
```
--app-available-height = 100dvh - --android-safe-top - --android-safe-bottom
```

With `100vh` fallback for older WebViews that don't support `dvh`.

## Changes

### File 1: `src/index.css` -- Add CSS variable and utility classes

In the `:root` block, add:
```css
--app-available-height: calc(100vh - var(--android-safe-top, 0px) - var(--android-safe-bottom, 0px));
```

Add a `@supports` block for modern WebViews:
```css
@supports (height: 100dvh) {
  :root {
    --app-available-height: calc(100dvh - var(--android-safe-top, 0px) - var(--android-safe-bottom, 0px));
  }
}
```

Add utility classes in the `@layer utilities` block:
```css
.h-app-viewport {
  height: var(--app-available-height, 100vh);
}
.min-h-app-viewport {
  min-height: var(--app-available-height, 100vh);
}
```

### File 2: `src/pages/Index.tsx` (line 554)

Replace `min-h-screen` with `min-h-app-viewport safe-top safe-bottom`:
```
- <div className="min-h-screen bg-background flex flex-col overflow-hidden">
+ <div className="min-h-app-viewport bg-background flex flex-col overflow-hidden safe-top">
```

This makes the main app container fit exactly between the system bars. The `safe-top` adds status bar padding. Bottom spacing is handled by `BottomNav` which already has `safe-bottom`.

### File 3: `src/pages/MyShortcuts.tsx` (line 46)

```
- <div className="min-h-screen bg-background flex flex-col">
+ <div className="min-h-app-viewport bg-background flex flex-col safe-top">
```

### File 4: `src/components/ContactShortcutCustomizer.tsx` (line 169)

```
- <div className="min-h-screen bg-background flex flex-col animate-fade-in">
+ <div className="min-h-app-viewport bg-background flex flex-col animate-fade-in safe-top">
```

Note: This component already uses `pt-header-safe-compact` on its header, which includes `--android-safe-top` + visual padding. Adding `safe-top` to the container would double the top inset. Instead, we only change the height:

```
- <div className="min-h-screen bg-background flex flex-col animate-fade-in">
+ <div className="min-h-app-viewport bg-background flex flex-col animate-fade-in">
```

### File 5: `src/pages/AuthCallback.tsx` (line 121)

```
- <div className="min-h-screen flex items-center justify-center bg-background p-4">
+ <div className="min-h-app-viewport flex items-center justify-center bg-background p-4 safe-top">
```

### File 6: `src/pages/NotFound.tsx` (line 14)

```
- <div className="flex min-h-screen items-center justify-center bg-muted">
+ <div className="flex min-h-app-viewport items-center justify-center bg-muted safe-top">
```

### File 7: `src/components/ErrorBoundary.tsx` (line 45)

```
- <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
+ <div className="min-h-app-viewport flex flex-col items-center justify-center p-6 bg-background safe-top">
```

### Files NOT changed (and why)

- **`SlideshowViewer.tsx`** and **`VideoPlayer.tsx`**: These are immersive full-screen viewers with absolute-positioned overlays. They intentionally fill the entire screen (including behind system bars) for a cinematic experience, with individual safe-area classes on their controls. Changing them would break the immersive effect.
- **`BottomNav.tsx`**: Already uses `safe-bottom` correctly. No changes needed.
- **`AccessFlow.tsx`**: Not a page container -- it's a child of `Index.tsx`. Its header already uses `pt-header-safe`. No changes needed.
- **`NotificationsPage.tsx`**, **`BookmarkLibrary.tsx`**, **`ProfilePage.tsx`**: These are tab content components within `Index.tsx`, not standalone pages. They use `flex-1` to fill available space within the already-sized parent. No changes needed.

## Technical Notes

- `100dvh` (dynamic viewport height) accounts for the Android Chrome URL bar appearing/disappearing. It is supported in Chromium 108+ (Android 13+). The `@supports` block uses it when available, falling back to `100vh`.
- `--android-safe-top` and `--android-safe-bottom` are injected at runtime by `MainActivity.java` using Android's `ViewCompat.setOnApplyWindowInsetsListener` -- this is OS-level and works across all OEMs.
- The combination of these two mechanisms makes the available height calculation accurate on every Android device.
- No changes to native Java code are needed.

