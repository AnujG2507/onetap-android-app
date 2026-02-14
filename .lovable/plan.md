

# Fix Week Picker Left/Right Buttons

## Problem

The week picker navigation buttons in `ScheduledTimingPicker.tsx` are `motion.button` elements without explicit `type="button"`. Inside a Dialog, the default button type is `submit`, which can cause the Dialog to close or the click to be swallowed on certain Android OEMs (OnePlus, Xiaomi, etc.). This is the exact same root cause as the calendar navigation fix already applied.

## Solution

Add `type="button"` to all interactive `motion.button` elements in the `WeekCalendar` component:

| Location | Element | Line |
|----------|---------|------|
| Previous week arrow | `motion.button` with `ChevronLeft` | 243 |
| Next week arrow | `motion.button` with `ChevronRight` | 274 |
| Week dot indicators | `motion.button` in the dots loop | 395 |
| "Pick specific date" button | `motion.button` with `CalendarDays` | 414 |
| Day cells | `motion.button` for each date | 313 |

## File Changed

| File | Change |
|------|--------|
| `src/components/ScheduledTimingPicker.tsx` (lines 243, 274, 313, 395, 414) | Add `type="button"` to all `motion.button` elements in WeekCalendar |

This is a minimal, targeted fix following the same pattern already proven with the calendar component.

