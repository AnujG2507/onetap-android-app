package app.onetap.access;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

/**
 * BroadcastReceiver for scheduled action alarms.
 * When an alarm fires, this receiver shows a notification and
 * schedules the next occurrence for recurring actions.
 */
public class ScheduledActionReceiver extends BroadcastReceiver {
    private static final String TAG = "ScheduledActionReceiver";
    
    public static final String ACTION_SCHEDULED = "app.onetap.SCHEDULED_ACTION";
    public static final String EXTRA_ACTION_ID = "action_id";
    public static final String EXTRA_ACTION_NAME = "action_name";
    public static final String EXTRA_DESCRIPTION = "action_description";
    public static final String EXTRA_DESTINATION_TYPE = "destination_type";
    public static final String EXTRA_DESTINATION_DATA = "destination_data";
    public static final String EXTRA_RECURRENCE = "recurrence";
    public static final String EXTRA_TRIGGER_TIME = "trigger_time";
    
    private static final String PREFS_NAME = "scheduled_actions_prefs";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_SCHEDULED.equals(intent.getAction())) {
            return;
        }
        
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String actionName = intent.getStringExtra(EXTRA_ACTION_NAME);
        String description = intent.getStringExtra(EXTRA_DESCRIPTION);
        String destinationType = intent.getStringExtra(EXTRA_DESTINATION_TYPE);
        String destinationData = intent.getStringExtra(EXTRA_DESTINATION_DATA);
        String recurrence = intent.getStringExtra(EXTRA_RECURRENCE);
        
        Log.d(TAG, "Received scheduled action: " + actionName + " (id: " + actionId + ")");
        
        if (actionId == null || actionName == null) {
            Log.e(TAG, "Missing required action data");
            return;
        }
        
        // Show notification
        NotificationHelper.showActionNotification(
            context,
            actionId,
            actionName,
            description,
            destinationType,
            destinationData
        );
        
        // For recurring actions, schedule the next occurrence
        if (recurrence != null && !"once".equals(recurrence)) {
            scheduleNextOccurrence(context, intent, recurrence);
        } else {
            // One-time action: remove from storage
            removeActionFromStorage(context, actionId);
        }
    }
    
    /**
     * Schedule the next occurrence for a recurring action.
     */
    private void scheduleNextOccurrence(Context context, Intent originalIntent, String recurrence) {
        String actionId = originalIntent.getStringExtra(EXTRA_ACTION_ID);
        long currentTrigger = originalIntent.getLongExtra(EXTRA_TRIGGER_TIME, System.currentTimeMillis());
        
        // Calculate next trigger time based on recurrence
        long nextTrigger = calculateNextTrigger(currentTrigger, recurrence);
        
        Log.d(TAG, "Scheduling next occurrence for " + actionId + " at " + nextTrigger);
        
        // Create new intent with updated trigger time
        Intent nextIntent = new Intent(originalIntent);
        nextIntent.putExtra(EXTRA_TRIGGER_TIME, nextTrigger);
        
        // Schedule the alarm
        scheduleAlarm(context, actionId, nextTrigger, nextIntent);
        
        // Update stored action with new trigger time
        updateStoredTriggerTime(context, actionId, nextTrigger);
    }
    
    /**
     * Calculate the next trigger time based on recurrence type.
     */
    private long calculateNextTrigger(long currentTrigger, String recurrence) {
        long oneDay = 24 * 60 * 60 * 1000L;
        long oneWeek = 7 * oneDay;
        long oneYear = 365 * oneDay;
        
        switch (recurrence) {
            case "daily":
                return currentTrigger + oneDay;
            case "weekly":
                return currentTrigger + oneWeek;
            case "yearly":
                return currentTrigger + oneYear;
            default:
                return currentTrigger + oneDay;
        }
    }
    
    /**
     * Schedule a notification trigger using AlarmManager.
     * Uses setExactAndAllowWhileIdle() for notification-style delivery (no alarm clock icon).
     */
    public static void scheduleAlarm(Context context, String actionId, long triggerTime, Intent intent) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager not available");
            return;
        }
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            actionId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: Check if we can schedule exact alarms
                if (alarmManager.canScheduleExactAlarms()) {
                    // Use setExactAndAllowWhileIdle for notification-style delivery
                    // This doesn't show alarm clock icon in status bar
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    );
                    Log.d(TAG, "Scheduled exact notification trigger for " + actionId);
                } else {
                    // Fall back to inexact alarm
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    );
                    Log.w(TAG, "Using inexact trigger - exact alarm permission not granted");
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Android 6-11: Use setExactAndAllowWhileIdle for reliable notification delivery
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                );
                Log.d(TAG, "Scheduled exact notification trigger for " + actionId);
            } else {
                // Older Android: setExact
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
            }
            
            Log.d(TAG, "Notification trigger scheduled for " + actionId + " at " + triggerTime);
        } catch (SecurityException e) {
            Log.e(TAG, "Security exception scheduling notification trigger", e);
        }
    }
    
    /**
     * Cancel a scheduled alarm.
     */
    public static void cancelAlarm(Context context, String actionId) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        
        Intent intent = new Intent(context, ScheduledActionReceiver.class);
        intent.setAction(ACTION_SCHEDULED);
        
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            actionId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        alarmManager.cancel(pendingIntent);
        Log.d(TAG, "Alarm cancelled for " + actionId);
    }
    
    /**
     * Create an intent with all action data for scheduling.
     */
    public static Intent createActionIntent(
        Context context,
        String actionId,
        String actionName,
        String description,
        String destinationType,
        String destinationData,
        long triggerTime,
        String recurrence
    ) {
        Intent intent = new Intent(context, ScheduledActionReceiver.class);
        intent.setAction(ACTION_SCHEDULED);
        intent.putExtra(EXTRA_ACTION_ID, actionId);
        intent.putExtra(EXTRA_ACTION_NAME, actionName);
        intent.putExtra(EXTRA_DESCRIPTION, description);
        intent.putExtra(EXTRA_DESTINATION_TYPE, destinationType);
        intent.putExtra(EXTRA_DESTINATION_DATA, destinationData);
        intent.putExtra(EXTRA_TRIGGER_TIME, triggerTime);
        intent.putExtra(EXTRA_RECURRENCE, recurrence);
        return intent;
    }
    
    /**
     * Remove a one-time action from storage after it fires.
     */
    private void removeActionFromStorage(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(actionId).apply();
        Log.d(TAG, "Removed one-time action from storage: " + actionId);
    }
    
    /**
     * Update the stored trigger time for a recurring action.
     */
    private void updateStoredTriggerTime(Context context, String actionId, long newTriggerTime) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String actionJson = prefs.getString(actionId, null);
        
        if (actionJson != null) {
            try {
                JSONObject action = new JSONObject(actionJson);
                action.put("triggerTime", newTriggerTime);
                prefs.edit().putString(actionId, action.toString()).apply();
                Log.d(TAG, "Updated trigger time for " + actionId);
            } catch (Exception e) {
                Log.e(TAG, "Error updating stored action", e);
            }
        }
    }
    
    /**
     * Store action data for restoration after reboot.
     */
    public static void storeAction(
        Context context,
        String actionId,
        String actionName,
        String description,
        String destinationType,
        String destinationData,
        long triggerTime,
        String recurrence
    ) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        
        try {
            JSONObject action = new JSONObject();
            action.put("id", actionId);
            action.put("name", actionName);
            action.put("description", description);
            action.put("destinationType", destinationType);
            action.put("destinationData", destinationData);
            action.put("triggerTime", triggerTime);
            action.put("recurrence", recurrence);
            
            prefs.edit().putString(actionId, action.toString()).apply();
            Log.d(TAG, "Stored action: " + actionId);
        } catch (Exception e) {
            Log.e(TAG, "Error storing action", e);
        }
    }
    
    /**
     * Remove action from storage.
     */
    public static void removeStoredAction(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(actionId).apply();
    }
}
