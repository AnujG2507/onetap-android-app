

## Add Configurable Snooze Duration Setting

### Overview
Replace the hardcoded 10-minute snooze duration with a user-configurable setting (5, 10, 15, or 30 minutes). The setting lives in the app settings UI and is synced to the native layer via the existing `syncSettings` mechanism so both the notification button label and the actual timer duration reflect the user's choice.

### Changes

**1. `src/lib/settingsManager.ts` -- Add new setting**
- Add `snoozeDurationMinutes` to `AppSettings` interface with type `5 | 10 | 15 | 30`
- Default value: `10` (preserves current behavior)

**2. `src/components/SettingsPage.tsx` -- Add snooze duration picker**
- Add a snooze duration selector inside the existing Notifications card (after the "Reminder Sound" toggle)
- Uses a `Select` dropdown with options: 5 min, 10 min, 15 min, 30 min
- Follows the same pattern as the trash retention days selector

**3. `native/android/app/src/main/java/app/onetap/access/SnoozeReceiver.java` -- Read duration from settings**
- Replace the hardcoded `SNOOZE_DURATION_MS = 10 * 60 * 1000` with a helper that reads `snoozeDurationMinutes` from `SharedPreferences` (`app_settings` -> `settings` JSON)
- Falls back to 10 minutes if the setting is missing
- Uses the configured duration for both the `AlarmManager` alarm and the log messages

**4. `native/android/app/src/main/java/app/onetap/access/NotificationHelper.java` -- Dynamic label and timer**
- Read snooze duration from `SharedPreferences` to:
  - Set the snooze action button text dynamically (e.g., "Snooze 5 min" instead of hardcoded "Snooze 10 min")
  - Set the Chronometer countdown base to the configured duration instead of hardcoded 10 minutes
  - Set the `setWhen()` value to match the configured duration

### Technical Details

**Settings flow (already exists, no new wiring needed):**
User changes setting in UI -> `settingsManager` saves to `localStorage` -> `useSettings` calls `syncSettingsToNative` -> `ShortcutPlugin.syncSettings` stores JSON in `SharedPreferences` (`app_settings`) -> Native Java reads it

**Reading the setting in Java:**
```java
private static int getSnoozeDurationMinutes(Context context) {
    try {
        SharedPreferences prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE);
        String json = prefs.getString("settings", null);
        if (json != null) {
            org.json.JSONObject obj = new org.json.JSONObject(json);
            return obj.optInt("snoozeDurationMinutes", 10);
        }
    } catch (Exception e) { /* ignore */ }
    return 10;
}
```

### Files Modified

| File | Change |
|------|--------|
| `src/lib/settingsManager.ts` | Add `snoozeDurationMinutes` field and type |
| `src/components/SettingsPage.tsx` | Add snooze duration Select in Notifications card |
| `SnoozeReceiver.java` | Read duration from SharedPreferences instead of hardcoded constant |
| `NotificationHelper.java` | Dynamic snooze button label and countdown duration |
