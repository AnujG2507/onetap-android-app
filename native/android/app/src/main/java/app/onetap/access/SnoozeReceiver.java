package app.onetap.access;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import java.util.HashSet;
import java.util.Set;

/**
 * BroadcastReceiver handling notification snooze:
 * - ACTION_SNOOZE_START: Replaces original notification with a live 10-min countdown timer
 * - ACTION_SNOOZE_FIRE: Re-fires the original notification when the timer expires
 */
public class SnoozeReceiver extends BroadcastReceiver {
    private static final String TAG = "SnoozeReceiver";

    public static final String ACTION_SNOOZE_START = "app.onetap.SNOOZE_START";
    public static final String ACTION_SNOOZE_FIRE = "app.onetap.SNOOZE_FIRE";

    private static final String PREFS_NAME = "snooze_prefs";
    private static final String KEY_ACTIVE_IDS = "snooze_active_ids";

    // Intent extra keys (same as NotificationClickActivity)
    public static final String EXTRA_ACTION_ID = "action_id";
    public static final String EXTRA_ACTION_NAME = "action_name";
    public static final String EXTRA_DESCRIPTION = "description";
    public static final String EXTRA_DESTINATION_TYPE = "destination_type";
    public static final String EXTRA_DESTINATION_DATA = "destination_data";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        if (actionId == null) {
            Log.w(TAG, "No action_id in intent, ignoring");
            return;
        }

        switch (action) {
            case ACTION_SNOOZE_START:
                handleSnoozeStart(context, intent, actionId);
                break;
            case ACTION_SNOOZE_FIRE:
                handleSnoozeFire(context, intent, actionId);
                break;
            default:
                Log.w(TAG, "Unknown action: " + action);
        }
    }

    private void handleSnoozeStart(Context context, Intent intent, String actionId) {
        String actionName = intent.getStringExtra(EXTRA_ACTION_NAME);
        String description = intent.getStringExtra(EXTRA_DESCRIPTION);
        String destinationType = intent.getStringExtra(EXTRA_DESTINATION_TYPE);
        String destinationData = intent.getStringExtra(EXTRA_DESTINATION_DATA);

        Log.d(TAG, "Snooze started for: " + actionName + " (id=" + actionId + ")");

        // 1. Cancel the original notification
        int originalNotifId = actionId.hashCode();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(originalNotifId);
        }

        // 2. Mark as snoozed in SharedPreferences
        addSnoozedId(context, actionId);

        // 3. Show countdown notification with live Chronometer
        NotificationHelper.showSnoozeCountdownNotification(
            context, actionId, actionName, description, destinationType, destinationData
        );

        // 4. Cancel any existing snooze alarm (prevents duplicates on re-snooze)
        int snoozeMins = getSnoozeDurationMinutes(context);
        long snoozeDurationMs = snoozeMins * 60 * 1000L;
        int requestCode = actionId.hashCode() + 2;

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent cancelIntent = new Intent(context, SnoozeReceiver.class);
        cancelIntent.setAction(ACTION_SNOOZE_FIRE);
        PendingIntent existingAlarm = PendingIntent.getBroadcast(
            context, requestCode, cancelIntent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (existingAlarm != null && alarmManager != null) {
            alarmManager.cancel(existingAlarm);
            existingAlarm.cancel();
            Log.d(TAG, "Cancelled existing snooze alarm for: " + actionId);
        }

        // 5. Schedule new alarm to re-fire after configured duration
        Intent fireIntent = new Intent(context, SnoozeReceiver.class);
        fireIntent.setAction(ACTION_SNOOZE_FIRE);
        fireIntent.putExtra(EXTRA_ACTION_ID, actionId);
        fireIntent.putExtra(EXTRA_ACTION_NAME, actionName);
        fireIntent.putExtra(EXTRA_DESCRIPTION, description);
        fireIntent.putExtra(EXTRA_DESTINATION_TYPE, destinationType);
        fireIntent.putExtra(EXTRA_DESTINATION_DATA, destinationData);

        PendingIntent pendingFire = PendingIntent.getBroadcast(
            context, requestCode, fireIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            long triggerAt = SystemClock.elapsedRealtime() + snoozeDurationMs;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingFire
                        );
                    } else {
                        alarmManager.setAndAllowWhileIdle(
                            AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingFire
                        );
                    }
                } else {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingFire
                    );
                }
                Log.d(TAG, "Snooze alarm scheduled for " + snoozeMins + " minutes");
            } catch (Exception e) {
                Log.e(TAG, "Failed to schedule snooze alarm", e);
            }
        }
    }

    private void handleSnoozeFire(Context context, Intent intent, String actionId) {
        String actionName = intent.getStringExtra(EXTRA_ACTION_NAME);
        String description = intent.getStringExtra(EXTRA_DESCRIPTION);
        String destinationType = intent.getStringExtra(EXTRA_DESTINATION_TYPE);
        String destinationData = intent.getStringExtra(EXTRA_DESTINATION_DATA);

        Log.d(TAG, "Snooze fired for: " + actionName + " (id=" + actionId + ")");

        // 1. Cancel the countdown notification
        int countdownNotifId = actionId.hashCode() + 1;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(countdownNotifId);
        }

        // 2. Remove from snoozed set
        removeSnoozedId(context, actionId);

        // 3. Re-fire the original notification
        NotificationHelper.showActionNotification(
            context, actionId, actionName, description, destinationType, destinationData
        );
    }

    // ========== SharedPreferences helpers for snoozed IDs ==========

    public static void addSnoozedId(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(prefs.getStringSet(KEY_ACTIVE_IDS, new HashSet<>()));
        ids.add(actionId);
        prefs.edit().putStringSet(KEY_ACTIVE_IDS, ids).apply();
    }

    public static void removeSnoozedId(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(prefs.getStringSet(KEY_ACTIVE_IDS, new HashSet<>()));
        ids.remove(actionId);
        prefs.edit().putStringSet(KEY_ACTIVE_IDS, ids).apply();
    }

    public static boolean isSnoozed(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Set<String> ids = prefs.getStringSet(KEY_ACTIVE_IDS, new HashSet<>());
        return ids.contains(actionId);
    }

    /**
     * Read snooze duration from app settings SharedPreferences.
     * Falls back to 10 minutes if the setting is missing or unreadable.
     */
    public static int getSnoozeDurationMinutes(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("app_settings", Context.MODE_PRIVATE);
            String json = prefs.getString("settings", null);
            if (json != null) {
                org.json.JSONObject obj = new org.json.JSONObject(json);
                return obj.optInt("snoozeDurationMinutes", 10);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to read snooze duration setting", e);
        }
        return 10;
    }
}
