package app.onetap.shortcuts;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.util.Map;

/**
 * BroadcastReceiver that restores all scheduled alarms after device reboot.
 * This ensures scheduled actions persist across device restarts.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";
    private static final String PREFS_NAME = "scheduled_actions_prefs";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            
            Log.d(TAG, "Device booted, restoring scheduled actions");
            restoreAllAlarms(context);
        }
    }
    
    /**
     * Restore all stored scheduled actions as alarms.
     */
    private void restoreAllAlarms(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Map<String, ?> allActions = prefs.getAll();
        
        int restoredCount = 0;
        int skippedCount = 0;
        long now = System.currentTimeMillis();
        
        for (Map.Entry<String, ?> entry : allActions.entrySet()) {
            String actionId = entry.getKey();
            Object value = entry.getValue();
            
            if (!(value instanceof String)) continue;
            
            try {
                JSONObject action = new JSONObject((String) value);
                
                String actionName = action.getString("name");
                String description = action.optString("description", null);
                String destinationType = action.getString("destinationType");
                String destinationData = action.getString("destinationData");
                long triggerTime = action.getLong("triggerTime");
                String recurrence = action.optString("recurrence", "once");
                
                // For past one-time actions, skip
                if (triggerTime < now && "once".equals(recurrence)) {
                    Log.d(TAG, "Skipping expired one-time action: " + actionId);
                    prefs.edit().remove(actionId).apply();
                    skippedCount++;
                    continue;
                }
                
                // For past recurring actions, calculate next occurrence
                if (triggerTime < now) {
                    triggerTime = calculateNextOccurrence(triggerTime, recurrence, now);
                    
                    // Update stored trigger time
                    action.put("triggerTime", triggerTime);
                    prefs.edit().putString(actionId, action.toString()).apply();
                }
                
                // Create and schedule the alarm
                Intent alarmIntent = ScheduledActionReceiver.createActionIntent(
                    context,
                    actionId,
                    actionName,
                    description,
                    destinationType,
                    destinationData,
                    triggerTime,
                    recurrence
                );
                
                ScheduledActionReceiver.scheduleAlarm(context, actionId, triggerTime, alarmIntent);
                restoredCount++;
                
                Log.d(TAG, "Restored alarm for: " + actionName + " at " + triggerTime);
                
            } catch (Exception e) {
                Log.e(TAG, "Error restoring action: " + actionId, e);
            }
        }
        
        Log.d(TAG, "Restoration complete: " + restoredCount + " restored, " + skippedCount + " skipped");
    }
    
    /**
     * Calculate the next occurrence after 'now' for a recurring action.
     */
    private long calculateNextOccurrence(long originalTrigger, String recurrence, long now) {
        long interval;
        
        switch (recurrence) {
            case "daily":
                interval = 24 * 60 * 60 * 1000L;
                break;
            case "weekly":
                interval = 7 * 24 * 60 * 60 * 1000L;
                break;
            case "yearly":
                interval = 365 * 24 * 60 * 60 * 1000L;
                break;
            default:
                return now + 60 * 1000; // Default: 1 minute from now
        }
        
        // Find the next occurrence after 'now'
        long next = originalTrigger;
        while (next <= now) {
            next += interval;
        }
        
        return next;
    }
}
