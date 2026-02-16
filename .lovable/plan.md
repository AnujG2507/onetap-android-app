

## Fix: Year Picker Drawer Not Opening on Android

### Root Cause

The Calendar component renders two Drawers (month and year) inside its own `div`. When the Calendar is placed inside a `Dialog` (as in ScheduledTimingPicker), the Drawers must fight the Dialog's overlay for pointer events and z-index. The month Drawer works but the year Drawer does not -- likely due to DOM ordering or a Vaul state conflict when two Drawers exist in the same nested-modal context on Android WebView.

### Solution

Lift the year picker out of the Drawer pattern entirely and use a simple inline overlay panel instead. This avoids the nested-modal problem completely. The month picker already works as a Drawer, so we leave it alone.

### Changes

**File: `src/components/ui/calendar.tsx`**

1. Remove the year Drawer component entirely (the `<Drawer open={showYearDrawer} ...>` block at the bottom).

2. Replace the year picker button's `onClick` to toggle a local `showYearPicker` state that renders an inline dropdown list directly below the header -- positioned absolutely within the Calendar's own container.

3. Add an inline year selection panel:
   - Rendered as an absolutely-positioned `div` with `z-50`, solid background, rounded corners, and shadow
   - Contains the same list of year buttons currently in the Drawer
   - Includes a backdrop overlay (`fixed inset-0`) to close on outside tap
   - Uses `pointer-events-auto` and `e.stopPropagation()` on the backdrop to prevent touch conflicts

4. Keep the month Drawer unchanged since it works correctly.

### Technical Details

```text
Before (broken):
  Dialog (ScheduledTimingPicker)
    --> Calendar div (overflow-hidden)
        --> Year button --> opens Drawer (nested modal = conflict on Android)

After (fixed):
  Dialog (ScheduledTimingPicker)
    --> Calendar div (overflow-hidden removed for picker)
        --> Year button --> toggles inline dropdown (no nested modal)
```

The inline panel approach:
- Renders inside the Calendar component's own DOM tree
- Uses `position: absolute` relative to the Calendar container
- Has a fixed backdrop to catch outside taps
- No portal, no overlay stacking, no z-index fight with the parent Dialog

This matches the existing memory note: "For mobile compatibility, complex pickers use Drawer-based bottom sheets instead of Radix DropdownMenus" -- but since the Drawer itself fails when nested inside a Dialog on Android, the inline panel is the correct fallback.

