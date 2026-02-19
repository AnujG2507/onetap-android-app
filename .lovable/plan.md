

# Fix: Sheet Menu Overlapping Android Status Bar and Navigation Bar

## Problem

The Sheet component (sliding menu) uses `inset-y-0 h-full` which stretches it edge-to-edge across the entire screen. On Android, this means the menu content goes underneath the status bar at the top and the navigation bar at the bottom. The close (X) button is also positioned at `top-4`, which gets hidden behind the status bar.

## Fix

**File: `src/components/ui/sheet.tsx`**

For the left/right sheet variants, add safe area padding so the content stays within the usable viewport:

1. Add `safe-top` and `safe-bottom` CSS classes to the left and right side variants in `sheetVariants`. These classes use the existing `--android-safe-top` and `--android-safe-bottom` CSS variables that are already injected by the native Android code.

2. Update the close button positioning from `top-4` to include the safe area offset using an inline style or a CSS utility, so it sits below the status bar.

Specifically:
- Left variant: add `safe-top safe-bottom` classes
- Right variant: add `safe-top safe-bottom` classes
- Close button: change from `top-4` to use a dynamic top value that accounts for `var(--android-safe-top)`

This fix applies globally to all sheets in the app (menu, trash, settings, etc.), ensuring none of them overlap with system UI.

