

# Streamline the Sync UI on Profile Page

## Problem

The current Profile page sync section is overly complex and technical:
- Shows 4 separate counts: local bookmarks, local reminders, cloud bookmarks, cloud reminders
- Displays "Last sync: arrow-up X uploaded, arrow-down Y downloaded" detail
- Has 3 action buttons: Sync Now, Upload, Download (Upload/Download are redundant with Sync)
- Has a separate Settings card just for the auto-sync toggle
- Feels like a developer dashboard, not a convenience feature

## Solution

Simplify to a single, clean sync card that shows only what matters: whether things are synced, and a single action to sync. Merge counts into a single "items" number. Remove separate upload/download buttons (keep them only in CloudBackupSection recovery tools). Fold auto-sync toggle into the sync card itself.

## Changes

### 1. `src/components/ProfilePage.tsx` -- Major simplification

**Remove:**
- Separate `isUploading`, `isDownloading` states and their handlers (`handleUpload`, `handleDownload`)
- Separate `cloudCount`, `cloudRemindersCount` states and their cloud count fetches
- The Upload/Download buttons grid
- The separate Settings card for auto-sync toggle
- The "Last sync: arrow-up X uploaded, arrow-down Y downloaded" line
- Imports for `Upload`, `Download`, `getCloudBookmarkCount`, `getCloudScheduledActionsCount`

**Simplify the Sync Status Card to show:**
- A single "items" count combining local bookmarks + reminders (e.g., "42 Items")
- A relative time label ("Synced 2 hours ago" or "Never synced")
- A single Sync Now button
- The auto-sync toggle moved into this card as a compact row

**Simplify `refreshCounts`:**
- Only count local items (no cloud API calls -- faster, simpler)
- Single `localItemCount` state replacing `localCount` + `localRemindersCount`

**Simplify toast messages:**
- On sync success with changes: "Everything is synced."
- On sync success without changes: "Already in sync."
- Remove uploaded/downloaded count details from toasts

### 2. `src/components/CloudBackupSection.tsx` -- Simplify toast messages

- Change sync success toast to show "Everything is synced." instead of "Added X from cloud, backed up Y to cloud."
- Keep recovery tools as-is (they serve a different purpose)

### 3. `src/i18n/locales/en.json` -- Update translations

- Add `items` key: "Items"
- Add `everythingSynced` key: "Everything is synced."  
- Update `syncCompleteChanges` to simpler message without counts
- Remove unused keys: `localBookmarks`, `cloudBookmarks`, `lastSyncInfo`

## Technical Details

**Before (Sync Status Card):**
```text
+----------------------------------+
| Sync Status      Auto-sync: ON   |
| Synced 2 hours ago               |
|                                  |
| [HDD] 12 bookmarks  [Cloud] 12  |
|        3 reminders          3    |
|        Local             Cloud   |
|                                  |
| Last sync: up-5 uploaded, down-2 |
+----------------------------------+
+----------------------------------+
| Quick Actions                    |
| [ -------- Sync Now --------- ] |
| [ Upload ]       [ Download ]   |
+----------------------------------+
+----------------------------------+
| Settings                         |
| Auto-sync    [toggle]           |
+----------------------------------+
```

**After (Single Sync Card):**
```text
+----------------------------------+
| Cloud Sync         Auto-sync [x] |
| 15 Items on this device          |
|                                  |
| [ -------- Sync Now --------- ] |
| Synced 2 hours ago               |
+----------------------------------+
```

Three cards replaced by one compact section. The sync feels like a simple, obvious convenience rather than a technical dashboard.
