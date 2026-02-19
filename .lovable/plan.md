

# Fix: Cloud Sync Inflating Access Points Count + Add Dormant Filter

## Problem

When cloud sync completes, dormant access points (file-based shortcuts synced from another device that lack local files) are downloaded and added to localStorage. The "My Access Points" badge count on the home tab includes these dormant items, making the count jump unexpectedly. Dormant access points are also not filterable on the My Access Points page.

## Changes

### 1. `src/components/MyShortcutsButton.tsx` -- Exclude dormant from count

Update the `updateCount` function to filter out shortcuts where `syncState === 'dormant'` before counting. This way the badge only reflects active, usable access points.

```text
Before: shortcuts.length
After:  shortcuts.filter(s => s.syncState !== 'dormant').length
```

### 2. `src/components/MyShortcutsContent.tsx` -- Add dormant filter toggle

Add a "Show dormant" toggle/filter chip alongside the existing type filters. Changes:

- Add a new state `showDormant` (default: `false`) to control whether dormant items appear
- Filter out dormant shortcuts from `filteredShortcuts` when `showDormant` is false
- Update `typeCounts` to exclude dormant shortcuts from all counts (so the "All" count matches the badge)
- Add a filter chip or toggle at the end of the filter row that shows the dormant count and lets users reveal them (e.g., "Dormant (3)")
- When the dormant filter is active, dormant shortcuts appear in the list with their existing greyed-out styling and cloud-off badge

### 3. No cloud sync changes needed

The sync logic itself is correct -- it properly marks file-dependent shortcuts as dormant. The issue is purely in the UI counting/display layer.

## Technical Details

- The `isDormant()` helper from `src/types/shortcut.ts` checks `shortcut.syncState === 'dormant'` and is already used for styling in the list
- The dormant filter state will be session-only (not persisted) since it's a temporary view toggle
- Active (non-dormant) shortcuts remain the default view to keep the UI clean
- The type filter chips will only count non-dormant shortcuts, matching the badge behavior

