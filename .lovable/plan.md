

## Snooze with Live 10-Minute Countdown Timer in Notification

### Overview
When a scheduled action notification appears, it will include a "Snooze" action button. Tapping it replaces the notification with a live countdown timer (10:00, 9:59, 9:58...) displayed directly in the notification panel. The user can tap the countdown notification at any time to execute the action immediately. When the timer reaches zero, the original high-priority notification re-fires with sound and vibration. If the original notification is swiped away (dismissed) without snoozing or tapping, it is recorded as a missed notification.

### How the Live Timer Works

Android's `Chronometer` widget supports countdown mode (`setCountDown(true)`) and can be embedded in a notification via `RemoteViews`. This gives a real-time ticking timer directly in the notification panel with zero battery cost (the OS handles the rendering). When the countdown completes, a `BroadcastReceiver` re-fires the original notification.

### New Files

**1. `SnoozeReceiver.java`**
A `BroadcastReceiver` handling two actions:
- `app.onetap.SNOOZE_START` -- Triggered by the "Snooze" action button on the notification
  - Cancels the original notification
  - Marks the action ID as "snoozed" in SharedPreferences (`snooze_active_ids`)
  - Shows a countdown notification using `Chronometer` with `setCountDown(true)` and `setBase(elapsedRealtime + 10min)` for a live ticking timer
  - The countdown notification is tappable (routes to `NotificationClickActivity` to execute the action)
  - Schedules a 10-minute `AlarmManager` exact alarm targeting itself with `ACTION_SNOOZE_FIRE`
- `app.onetap.SNOOZE_FIRE` -- Triggered when the 10-minute alarm fires
  - Cancels the countdown notification
  - Removes action ID from "snoozed" set
  - Calls `NotificationHelper.showActionNotification()` to re-fire the original notification with full sound/vibration

**2. `NotificationDismissReceiver.java`**
A `BroadcastReceiver` set as the `deleteIntent` on every notification:
- When a notification is swiped away, checks if the action was snoozed or clicked
- If neither, records the action ID in SharedPreferences (`dismissed_notification_ids`) for the JS missed-notifications layer

### Modified Files

**3. `NotificationHelper.java`**
- Add a second notification channel `CHANNEL_SNOOZE_TIMER` with `IMPORTANCE_LOW` (no sound, no vibration) for the countdown notification
- Add a "Snooze" action button (`addAction`) to every notification, with an alarm clock icon and the text "Snooze 10 min", pointing to `SnoozeReceiver` with `ACTION_SNOOZE_START`
- Add a `deleteIntent` on every notification pointing to `NotificationDismissReceiver` for dismiss tracking
- Add `showSnoozeCountdownNotification()` method that builds a notification with a `RemoteViews` layout containing a `Chronometer` widget for the live timer
- Pass all action data (actionId, actionName, description, destinationType, destinationData) through intent extras so the snooze and re-fire flow can reconstruct the original notification

**4. `AndroidManifest.xml`**
- Register `SnoozeReceiver` with intent filters for `app.onetap.SNOOZE_START` and `app.onetap.SNOOZE_FIRE`
- Register `NotificationDismissReceiver` with intent filter for `app.onetap.NOTIFICATION_DISMISSED`

**5. `ShortcutPlugin.java`**
- Add `getDismissedNotificationIds()` method that reads from `dismissed_notification_ids` SharedPreferences, returns the list, and clears it (same pattern as existing `getClickedNotificationIds`)

**6. `ShortcutPlugin.ts`**
- Add `getDismissedNotificationIds(): Promise<{ success: boolean; ids: string[]; error?: string }>` to the interface

**7. `shortcutPluginWeb.ts`**
- Add web stub returning `{ success: true, ids: [] }`

**8. `useMissedNotifications.ts`**
- In `syncNativeClickedIds()`, also call `getDismissedNotificationIds()` and add those IDs to the dismissed set so they appear in the missed notifications section

### New Layout File

**9. `res/layout/notification_snooze_countdown.xml`**
A simple `RemoteViews` layout containing:
- A `Chronometer` widget (the live timer, e.g. "09:42")
- A `TextView` for the action name (e.g. "Call Mom")
- A `TextView` subtitle ("Tap to execute now")

### Technical Details

**Notification IDs:**
- Original notification: `actionId.hashCode()`
- Countdown notification: `actionId.hashCode() + 1` (avoids collision)

**Chronometer usage:**
```java
RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_snooze_countdown);
views.setChronometer(R.id.snooze_timer, SystemClock.elapsedRealtime() + 600000, null, true);
// API 24+ supports countdown mode
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
    views.setChronometerCountDown(R.id.snooze_timer, true);
}
```

**Data flow through intents:**
All action metadata (ID, name, description, type, data) is passed through intent extras at every step so the snooze receiver can reconstruct the original notification when the timer expires.

**No config changes:** The snooze is purely transient. It does not modify trigger times, recurrence, or any stored scheduled action data.

### Summary

| File | Change |
|------|--------|
| `SnoozeReceiver.java` | New -- handles snooze start (live timer) and 10-min re-fire |
| `NotificationDismissReceiver.java` | New -- tracks swipe-dismiss for missed notifications |
| `notification_snooze_countdown.xml` | New -- RemoteViews layout with Chronometer widget |
| `NotificationHelper.java` | Add snooze button, dismiss intent, snooze channel, countdown method |
| `AndroidManifest.xml` | Register 2 new receivers |
| `ShortcutPlugin.java` | Add `getDismissedNotificationIds()` |
| `ShortcutPlugin.ts` | Add interface method |
| `shortcutPluginWeb.ts` | Add web stub |
| `useMissedNotifications.ts` | Sync dismissed IDs from native |

