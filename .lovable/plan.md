

## Add "Snooze Again" Button to Countdown Notification

### Overview
Add a snooze action button directly on the countdown notification so users can extend (restart) the timer without waiting for it to expire. Tapping "Snooze again" cancels the current alarm, and restarts the countdown from scratch.

### Changes

**1. `NotificationHelper.java` -- Add snooze action to countdown notification**
- In `showSnoozeCountdownNotification()`, build a `PendingIntent` targeting `SnoozeReceiver` with `ACTION_SNOOZE_START` (same action as the original snooze), passing all action metadata
- Add it as an action button on the countdown notification: `"Snooze again"` with the same alarm icon
- This reuses the existing `handleSnoozeStart` flow which already cancels the old notification and schedules a new alarm

**2. `SnoozeReceiver.java` -- Cancel previous alarm before rescheduling**
- In `handleSnoozeStart()`, before scheduling a new `AlarmManager` alarm, explicitly cancel any existing pending alarm for this action ID (same request code `actionId.hashCode() + 2`)
- This prevents duplicate alarms stacking up when snooze is extended repeatedly
- Also cancel the existing countdown notification (ID `actionId.hashCode() + 1`) before showing the new one -- this is already handled since `showSnoozeCountdownNotification` uses `manager.notify()` with the same ID, which replaces the old one

### Technical Details

- The snooze-again button reuses `ACTION_SNOOZE_START`, so `handleSnoozeStart` runs again: cancels original notif (no-op if already gone), replaces countdown notif (same ID), cancels old alarm, schedules new alarm
- Request code for the "Snooze again" PendingIntent on the countdown notification: `actionId.hashCode() + 5` (unique from other intents)
- No new files, no manifest changes -- just two small edits

### Files Modified

| File | Change |
|------|--------|
| `NotificationHelper.java` | Add "Snooze again" action button to countdown notification |
| `SnoozeReceiver.java` | Cancel previous alarm before scheduling new one |

