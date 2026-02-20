

## Fix: Enable Scrolling on the Settings Page

### Problem

The Settings page outer container (`div.flex-1.flex.flex-col`) has no explicit height constraint. The `ScrollArea` inside it uses `flex-1`, but since there is no bounded parent height, the ScrollArea simply expands to fit all content rather than constraining it and enabling scroll.

### Solution

Add a height constraint to the root `div` of `SettingsPage` so the `ScrollArea` can calculate overflow and scroll properly. The fix is to add `h-app-viewport` (a project utility that resolves to the available viewport height minus safe areas) alongside `overflow-hidden` to the root container.

### Change

**File: `src/components/SettingsPage.tsx`** (line 218)

Change:
```tsx
<div className="flex-1 flex flex-col">
```

To:
```tsx
<div className="h-app-viewport flex flex-col overflow-hidden">
```

This gives the container a fixed height equal to the usable viewport, allowing the `ScrollArea` with `flex-1` to fill the remaining space after the header and enable vertical scrolling for the settings cards.

### Why This Works

- `h-app-viewport` is already defined in `index.css` as `var(--app-available-height)`, which accounts for Android safe areas (status bar + nav bar).
- `overflow-hidden` prevents the outer div from scrolling, delegating all scroll behavior to the Radix `ScrollArea` inside.
- The header has `shrink-0`, so it keeps its size while the ScrollArea takes the rest.

No other files need changes.
