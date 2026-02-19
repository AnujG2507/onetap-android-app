

# Fix Status Bar Visibility on Android

## Problem

On Android, the status bar is fully transparent (`android:statusBarColor = transparent`) and the app background is near-white (`#fafafa`). Since the header areas use `pt-header-safe` which only adds padding (no background color change), the status bar area visually blends into the app content with zero separation. The clock, battery, and signal icons appear to float directly on the app surface.

## Solution

Add a subtle tinted background strip behind the Android status bar area so it's visually distinct from the main content. This will be done purely in CSS -- no Java changes needed.

## Changes

### 1. `src/index.css` -- Add a status bar background strip

Add a `::before` pseudo-element on the `body` that covers exactly the status bar area with a very subtle tint (slightly darker than the background). This creates a natural visual boundary.

```css
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--android-safe-top, 0px);
  background: hsl(0 0% 94%);  /* slightly darker than --background */
  z-index: 9999;
  pointer-events: none;
}
```

For dark mode, the tint will use a slightly lighter shade than the dark background:
```css
.dark body::before {
  background: hsl(0 0% 12%);  /* slightly lighter than dark --background */
}
```

This approach:
- Works globally across all pages/tabs without modifying individual headers
- Is zero-maintenance (no per-component changes)
- Gracefully degrades (when `--android-safe-top` is `0px`, the strip is invisible)
- Keeps the transparent status bar for the native Android feel while adding just enough contrast to make it visible

### 2. `native/android/app/src/main/res/values/styles.xml` -- No changes needed

The existing transparent status bar with light status bar icons is correct. The CSS fix handles the visual separation.

### 3. `index.html` -- No changes needed

The `theme-color` meta tag (`#fafafa`) remains correct as it matches the app background.

## Technical Notes

- The `z-index: 9999` ensures the strip renders above all app content but below native Android system UI
- `pointer-events: none` ensures it doesn't block touch interactions
- The strip height is exactly `var(--android-safe-top)`, which is 0 on web and the actual status bar height on Android -- so this has no effect in browser preview, only on the native app
