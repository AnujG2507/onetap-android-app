

# Fix: Bottom Sheets Overlapping Android Navigation Bar

## Problem

All bottom sheets (action sheets, editors, bookmark sheets, etc.) use the `bottom` variant in `sheet.tsx`, which currently has no safe area padding. On Android with edge-to-edge rendering, the bottom action buttons and content get hidden behind the system navigation bar.

## Fix

**File: `src/components/ui/sheet.tsx`**

Add `safe-bottom` class to the `bottom` variant in `sheetVariants`. This uses the existing `--android-safe-bottom` CSS variable to add padding, keeping content above the navigation bar.

Change:
```
bottom: "inset-x-0 bottom-0 border-t w-full max-w-full overflow-x-hidden ..."
```
To:
```
bottom: "inset-x-0 bottom-0 border-t w-full max-w-full overflow-x-hidden safe-bottom ..."
```

This single change fixes all bottom sheets app-wide since they all use `side="bottom"` on `SheetContent`:
- BookmarkActionSheet
- ScheduledActionActionSheet
- ScheduledActionEditor
- SavedLinksSheet
- TrashSheet
- LanguagePicker
- BatteryOptimizationHelp
- MessageChooserSheet
- And any future bottom sheets

No individual component changes needed.

