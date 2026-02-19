

# Fix: Include Shortcuts in the "Items" Count

## Problem Found

The "Items" metric displayed in the Cloud Sync card on the Profile page currently counts only **bookmarks** (saved links) and **reminders** (scheduled actions). However, the cloud sync also backs up **shortcuts** (access points stored in `quicklaunch_shortcuts`). This means the displayed count understates the actual number of items being synced.

For example, if you have 5 shortcuts, 3 bookmarks, and 2 reminders, the card says "5 Items" but cloud sync is actually handling 10 items.

## Fix

**File: `src/components/ProfilePage.tsx`**

Update the `refreshCounts` function to also include the shortcuts count from localStorage:

- Read `quicklaunch_shortcuts` from localStorage and parse it
- Add its length to the existing bookmarks + reminders count
- Result: `localItemCount = shortcuts + savedLinks + scheduledActions`

This is a one-line change inside the existing `refreshCounts` callback. No new imports needed since it reads directly from localStorage (same pattern used by `useUsageStats`).

## Other Metrics Audited (No Issues)

- **UsageInsights "Shortcuts" count**: Correctly reads from `quicklaunch_shortcuts` and shows shortcut count only (not bookmarks/reminders) -- this is intentional as it tracks shortcut usage specifically.
- **UsageInsights "Total Taps"**: Correctly sums `usageCount` across all shortcuts.
- **Sync status timestamp**: Correctly reads from `syncStatusManager` and displays relative time.
- **SyncStatusIndicator dot**: Display-only status indicator, no count logic.

