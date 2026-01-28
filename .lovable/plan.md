

## Missed Notifications System Enhancement - COMPLETED

This enhancement adds proper tracking to distinguish between clicked and missed notifications.

---

### Implementation Summary

#### Part 1: Translation Keys ✅
Added `missedNotifications` section to `src/i18n/locales/en.json` with:
- `title_one`, `title_other` - Pluralized titles
- `subtitle`, `missed`, `reschedule`, `dismissAll` - UI labels

#### Part 2: Data Model Extension ✅
Extended `ScheduledAction` interface in `src/types/scheduledAction.ts`:
- `lastNotificationTime?: number` - When notification was shown
- `notificationClicked?: boolean` - Whether user clicked it

#### Part 3: Web Plugin Click Tracking ✅
Updated `src/plugins/shortcutPluginWeb.ts`:
- Added `markNotificationShown()` call when notification is displayed
- Added `markNotificationClicked()` call when notification is clicked

#### Part 4: Manager Functions ✅
Added to `src/lib/scheduledActionsManager.ts`:
- `markNotificationClicked(id)` - Marks an action's notification as clicked
- `markNotificationShown(id)` - Marks notification as shown, resets clicked flag
- Updated `advanceToNextTrigger()` to reset tracking fields for recurring actions

#### Part 5: Missed Notifications Logic ✅
Updated `src/hooks/useMissedNotifications.ts`:
- Filters out actions where `notificationClicked === true`
- Changed from `sessionStorage` to `localStorage` for persistent dismissed IDs
- Added `syncNativeClickedIds()` to sync click data from Android on startup

#### Part 6: Native Android Click Tracking ✅
**New files:**
- `NotificationClickActivity.java` - Transparent activity that intercepts notification clicks:
  - Records clicked IDs in SharedPreferences
  - Executes the action after recording
  - Provides `getAndClearClickedIds()` for JS bridge

**Updated files:**
- `NotificationHelper.java` - Routes notification clicks through `NotificationClickActivity`
- `AndroidManifest.xml` - Registered `NotificationClickActivity`
- `ShortcutPlugin.java` - Added `getClickedNotificationIds()` plugin method
- `ShortcutPlugin.ts` - Added TypeScript interface for the new method
- `shortcutPluginWeb.ts` - Added web fallback (returns empty array)

---

### How It Works

1. **When notification is shown:**
   - Web: `markNotificationShown(id)` is called
   - Android: Notification is displayed with `NotificationClickActivity` as the click handler

2. **When notification is clicked:**
   - Web: `markNotificationClicked(id)` is called, then action executes
   - Android: `NotificationClickActivity` records the click in SharedPreferences, then executes the action

3. **When app opens:**
   - `useMissedNotifications` hook calls `getClickedNotificationIds()` to sync native data
   - Clicked IDs are marked in local storage via `markNotificationClicked()`
   - Past-due actions with `notificationClicked === true` are filtered out of the missed list

4. **Result:**
   - Only truly missed notifications appear in the banner
   - Clicked notifications are correctly tracked and excluded
