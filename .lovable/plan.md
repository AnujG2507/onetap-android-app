

# Fix Bottom Button Overlap with Android Navigation Bar

## Problem

On OnePlus (and potentially other OEMs with 3-button navigation), the "Add to Home Screen" button overlaps with the system navigation bar. This happens because:

1. **`env(safe-area-inset-bottom)` returns 0** on many Android devices with 3-button navigation -- the CSS environment variable is only reliably populated on devices using gesture navigation or devices with a notch/cutout.
2. **The fallback value of `16px` is too small** -- on 3-button navigation, the bar is typically ~48dp tall, so 16px is completely insufficient.
3. **Some components are missing `safe-bottom` entirely** -- `ContactShortcutCustomizer` and `SlideshowCustomizer` have no bottom padding protection at all.

## Solution

### 1. Increase the `safe-bottom` fallback and add a minimum padding (index.css)

Replace the current `safe-bottom` class with a more robust version that uses `max()` to ensure a minimum bottom padding of `24px` even when `env(safe-area-inset-bottom)` reports 0:

```css
.safe-bottom {
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 24px);
}
```

This ensures all screens get at least 24px of breathing room from the bottom edge, which prevents overlap with the 3-button navigation bar on OEMs like OnePlus and Xiaomi.

### 2. Add `safe-bottom` to ContactShortcutCustomizer.tsx

The confirm button container (line 264-273) currently has no safe-bottom padding. Wrap the bottom section in a container with `safe-bottom`:

Change the spacer + button area to include `safe-bottom` on the outer scrollable container or add it to a bottom-pinned wrapper, matching the pattern used in `ShortcutCustomizer`.

### 3. Fix SlideshowCustomizer.tsx bottom button

The slideshow customizer uses `pb-safe` (line 398) which is not a defined CSS class. Replace it with the standard `safe-bottom` class to use the corrected utility.

## Summary of File Changes

| File | Change |
|------|--------|
| `src/index.css` (line 104-106) | Update `.safe-bottom` to use `max()` for a 24px minimum |
| `src/components/ContactShortcutCustomizer.tsx` (line 274) | Add `safe-bottom` to the outer container |
| `src/components/SlideshowCustomizer.tsx` (line 398) | Replace undefined `pb-safe` with `safe-bottom` |

## Why This Fixes All OEMs

- `max()` picks the larger of the safe area inset and the fixed 24px minimum
- On gesture navigation devices: `env()` returns the correct inset (usually 20-34px), `max()` uses that
- On 3-button navigation (OnePlus, Xiaomi, etc.): `env()` returns 0, `max()` falls back to 24px
- Samsung is unaffected since it already reports correct inset values

