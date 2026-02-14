

# Fix Minute Granularity and Calendar Navigation

## Issue 1: Minutes Only Show 5-Minute Intervals

**Root cause**: In `time-wheel-picker.tsx` line 200, the minute array is generated as:
```text
Array.from({ length: 12 }, (_, i) => i * 5)  // [0, 5, 10, 15, ... 55]
```

This only gives 12 options in 5-minute steps. Users cannot select individual minutes like 1, 2, 3, etc.

**Fix**: Change to all 60 minutes (0-59):
```text
Array.from({ length: 60 }, (_, i) => i)  // [0, 1, 2, 3, ... 59]
```

## Issue 2: Calendar Left/Right Buttons Not Working

**Root cause**: In `calendar.tsx`, the custom navigation buttons (prev/next month) are `motion.button` elements without `type="button"`. Inside a Dialog, the default button type can cause unintended behavior on some Android OEMs. Additionally, the custom caption wrapper lacks `pointer-events-auto`, which the Dialog overlay can interfere with.

**Fix** (in `calendar.tsx`):
- Add `type="button"` to both prev/next `motion.button` elements (lines 179 and 276) and all other interactive buttons in the caption (month dropdown trigger, year dropdown trigger, today button)
- Add `pointer-events-auto` and `relative z-10` to the custom caption container (line 299) to ensure it stays above the animated calendar grid and remains interactive inside Dialog overlays

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/time-wheel-picker.tsx` (line 200) | Change minutes from 5-min intervals to all 60 values |
| `src/components/ui/calendar.tsx` (lines 179, 196, 230, 262, 276, 299) | Add `type="button"` to all caption buttons; add `pointer-events-auto relative z-10` to caption wrapper |

