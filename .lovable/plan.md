

## Snooze Feature: Architecture Evaluation

### Overview

The snooze feature allows users to defer a scheduled action notification by a configurable duration (5/10/15/30 min). When snoozed, the original notification is replaced by a silent countdown timer notification. When the timer expires, the full notification re-fires. Users can also "Snooze again", "Cancel", or tap the countdown notification to execute immediately.

---

### Identified Gaps and Vulnerabilities

#### GAP 1: `SNOOZE_CANCEL` action not registered in AndroidManifest

**Severity: Critical (feature-breaking)**

The manifest registers `SNOOZE_START` and `SNOOZE_FIRE` in the SnoozeReceiver's intent filter, but **`SNOOZE_CANCEL` is missing**. This means when the user taps the "Cancel" button on the countdown notification, the broadcast is sent but the receiver's intent filter does not match it. On most Android versions, the explicit component targeting (`new Intent(context, SnoozeReceiver.class)`) will still deliver it, but this is inconsistent and may fail on certain OEM ROMs or stricter Android versions.

**Fix**: Add `<action android:name="app.onetap.SNOOZE_CANCEL" />` to the SnoozeReceiver intent filter in `AndroidManifest.xml`.

---

#### GAP 2: Swiping away the countdown notification leaves an orphaned alarm

**Severity: High (logic vulnerability)**

When the user swipes away the snooze countdown notification:
- The alarm continues running in the background
- After the snooze duration, `handleSnoozeFire` triggers and re-fires the original notification
- The user dismissed the countdown expecting the reminder to go away, but it comes back unexpectedly

The countdown notification has `setOngoing(false)` (line 376), so users CAN swipe it away. However, there is **no deleteIntent** set on the countdown notification to detect the swipe and cancel the alarm.

**Fix**: Add a `setDeleteIntent` on the countdown notification that triggers `ACTION_SNOOZE_CANCEL`, so swiping it away also cancels the pending alarm.

---

#### GAP 3: `scheduledRemindersEnabled` setting is not enforced at the native layer

**Severity: Medium (settings not respected)**

The Settings UI has a "Scheduled Reminders" toggle (`scheduledRemindersEnabled`), but the native `ScheduledActionReceiver.onReceive()` does NOT check this setting before showing a notification. If a user disables reminders, alarms that are already scheduled will still fire and show notifications.

The same applies to `reminderSoundEnabled` -- it is never read by `NotificationHelper.showActionNotification()` to conditionally suppress sound/vibration.

**Fix**: In `ScheduledActionReceiver.onReceive()`, read the `scheduledRemindersEnabled` setting from `app_settings` SharedPreferences. If disabled, skip showing the notification. For `reminderSoundEnabled`, use `.setDefaults(0)` and `.setSound(null)` when the setting is off.

---

#### GAP 4: Snooze duration reads setting at START time, not at FIRE time

**Severity: Low (minor inconsistency)**

The snooze button label in the notification says "Snooze X min" based on the setting at notification-creation time. If the user changes the snooze duration in settings between when the notification fires and when they tap Snooze, the button label will show the old value, but the actual snooze duration will use the new value (since `handleSnoozeStart` reads the setting fresh). This is actually correct behavior -- the actual duration is always current -- but the label on the original notification could be stale.

This is cosmetic and low priority.

---

#### GAP 5: No cap on "Snooze again" cycles

**Severity: Low (edge case)**

A user can repeatedly tap "Snooze again" on the countdown notification indefinitely. Each tap resets the timer. There is no maximum snooze count or total snooze duration. While most users will not abuse this, it means a reminder can be perpetually deferred and never acted upon. The action never gets marked as "missed" because the snooze state keeps it alive.

**Fix (optional)**: Consider adding a maximum snooze count (e.g., 3-5 snoozes) after which the notification fires without a snooze button, or automatically marking it as "missed".

---

#### GAP 6: Snooze countdown notification tap executes the action but does NOT cancel the pending alarm

**Severity: High (duplicate notification)**

When a user taps the countdown notification to "execute now":
1. `NotificationClickActivity` runs and executes the action
2. The notification is auto-cancelled (`setAutoCancel(true)`)
3. But the pending snooze alarm is **still running**

After the remaining snooze duration, `handleSnoozeFire` triggers, cancels the (already gone) countdown notification, removes the snoozed state, and **re-fires the original notification** via `showActionNotification`. The user gets a duplicate notification for an action they already executed.

**Fix**: In `NotificationClickActivity.onCreate()`, check if the action was snoozed (via `SnoozeReceiver.isSnoozed()`). If so, cancel the snooze alarm and remove the snoozed state before executing the action.

---

#### GAP 7: Reboot does not restore active snooze alarms

**Severity: Medium (snooze lost after reboot)**

`BootReceiver` restores scheduled action alarms from `scheduled_actions_prefs` SharedPreferences. However, active snooze alarms are tracked in `snooze_prefs` (just a set of IDs, no timing data). After a reboot:
- The snooze alarm is lost (AlarmManager is cleared)
- The snoozed ID remains in `snooze_prefs`
- The countdown notification is gone
- The original notification never re-fires

The action effectively vanishes -- it is neither shown as a notification nor as "missed".

**Fix**: Either (a) store snooze expiry time in `snooze_prefs` and restore snooze alarms in BootReceiver, or (b) clear the snoozed state on boot so the action falls through to the missed-notifications detection.

---

#### GAP 8: Missed notification detection ignores snoozed actions

**Severity: Medium (UX gap after reboot)**

Related to Gap 7: `NotificationDismissReceiver.onReceive()` explicitly ignores dismissed notifications for snoozed actions (line 35-38). This is correct during normal operation (the snooze receiver will re-fire). But after a reboot (Gap 7), the snoozed state is stale, and the action will never be detected as missed by the JS layer either, because:
- It was never dismissed (it was snoozed)
- `notificationClicked` is false
- But it is past-due

Actually, the JS `useMissedNotifications` hook WOULD catch it as past-due since it only checks `triggerTime < now && !notificationClicked && !dismissed`. So this gap is partially mitigated by the JS layer, but only when the user opens the app.

---

### Summary of Fixes by Priority

| Priority | Gap | Issue | Effort |
|----------|-----|-------|--------|
| Critical | 1 | SNOOZE_CANCEL not in manifest | Trivial (1 line) |
| High | 6 | Tap-to-execute does not cancel snooze alarm -> duplicate notification | Small |
| High | 2 | Swiping countdown notification leaves orphaned alarm | Small |
| Medium | 3 | Settings toggles not enforced in native layer | Medium |
| Medium | 7 | Snooze alarms lost on reboot | Medium |
| Low | 4 | Stale snooze duration label | Cosmetic |
| Low | 5 | No cap on re-snooze cycles | Design decision |

### Recommended Immediate Fixes

The Critical and High priority gaps (1, 6, 2) should be fixed as they directly cause broken or confusing user experiences. Specifically:

1. **AndroidManifest.xml**: Add `SNOOZE_CANCEL` to SnoozeReceiver intent filter
2. **NotificationClickActivity.java**: When handling a tap, check `SnoozeReceiver.isSnoozed()` and if true, cancel the snooze alarm + remove snoozed state
3. **NotificationHelper.java**: Add a `deleteIntent` on the countdown notification that triggers `SNOOZE_CANCEL`
4. **ScheduledActionReceiver.java**: Check `scheduledRemindersEnabled` before showing notification
5. **NotificationHelper.java**: Check `reminderSoundEnabled` when building the notification
6. **BootReceiver.java**: Clear stale snooze states on boot so missed detection works

### Files to Modify

| File | Changes |
|------|---------|
| `native/.../AndroidManifest.xml` | Add SNOOZE_CANCEL action to SnoozeReceiver |
| `native/.../NotificationClickActivity.java` | Cancel snooze alarm on tap-to-execute |
| `native/.../NotificationHelper.java` | Add deleteIntent to countdown notification; check reminderSoundEnabled |
| `native/.../ScheduledActionReceiver.java` | Check scheduledRemindersEnabled before showing notification |
| `native/.../BootReceiver.java` | Clear stale snooze states on boot |

