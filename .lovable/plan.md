

# Fix: Theme Buttons Overlapping Native Navigation Bar

## Problem

The theme selection buttons at the bottom of the side menu sit flush against the bottom edge with only `mb-2` padding. On Android, the system navigation bar (gesture bar / buttons) overlaps this area because the menu sheet doesn't account for the safe bottom inset.

## Solution

Add the `safe-bottom` class to the theme section's wrapper div so it gains `padding-bottom: var(--android-safe-bottom)`, pushing the buttons above the native navigation area.

## Technical Details

### `src/components/AppMenu.tsx`

Change the bottom section wrapper (line 224) from:

```
<div className="mt-auto pt-4">
```

to:

```
<div className="mt-auto pt-4 safe-bottom">
```

This uses the existing `safe-bottom` utility class (defined in `index.css`) which applies `padding-bottom: var(--android-safe-bottom, 16px)` -- the same pattern used by `BottomNav` and other bottom-anchored UI.

Single line change, no other files affected.

