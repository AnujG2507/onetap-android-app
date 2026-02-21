package app.onetap.access;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Tracks when a notification is swiped away (dismissed) by the user.
 * If the notification was not snoozed and not clicked, the action ID
 * is recorded as dismissed so the JS layer can show it as "missed".
 */
public class NotificationDismissReceiver extends BroadcastReceiver {
    private static final String TAG = "NotifDismissReceiver";

    public static final String ACTION_DISMISSED = "app.onetap.NOTIFICATION_DISMISSED";
    public static final String EXTRA_ACTION_ID = "action_id";

    private static final String PREFS_NAME = "notification_dismiss_tracking";
    private static final String KEY_DISMISSED_IDS = "dismissed_notification_ids";

    @Override
    public void onReceive(Context context, Intent intent) {
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        if (actionId == null) {
            Log.w(TAG, "No action_id in dismiss intent");
            return;
        }

        // If snoozed, ignore — snooze receiver handles re-fire
        if (SnoozeReceiver.isSnoozed(context, actionId)) {
            Log.d(TAG, "Notification dismissed but snoozed, ignoring: " + actionId);
            return;
        }

        // If already clicked, ignore
        String[] clickedIds = NotificationClickActivity.peekClickedIds(context);
        for (String clicked : clickedIds) {
            if (actionId.equals(clicked)) {
                Log.d(TAG, "Notification dismissed but already clicked, ignoring: " + actionId);
                return;
            }
        }

        // Record as dismissed (missed)
        recordDismissedId(context, actionId);
        Log.d(TAG, "Notification dismissed (missed): " + actionId);
    }

    private static void recordDismissedId(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_DISMISSED_IDS, "[]");

        try {
            JSONArray ids = new JSONArray(json);

            // Avoid duplicates
            for (int i = 0; i < ids.length(); i++) {
                if (actionId.equals(ids.getString(i))) return;
            }

            ids.put(actionId);
            prefs.edit().putString(KEY_DISMISSED_IDS, ids.toString()).apply();
        } catch (JSONException e) {
            Log.e(TAG, "Error recording dismissed ID", e);
            JSONArray fresh = new JSONArray();
            fresh.put(actionId);
            prefs.edit().putString(KEY_DISMISSED_IDS, fresh.toString()).apply();
        }
    }

    /**
     * Get all dismissed IDs and clear the list.
     * Called by ShortcutPlugin to sync with JS layer.
     */
    public static String[] getAndClearDismissedIds(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_DISMISSED_IDS, "[]");

        try {
            JSONArray ids = new JSONArray(json);
            String[] result = new String[ids.length()];
            for (int i = 0; i < ids.length(); i++) {
                result[i] = ids.getString(i);
            }
            prefs.edit().putString(KEY_DISMISSED_IDS, "[]").apply();
            Log.d(TAG, "Retrieved and cleared " + result.length + " dismissed IDs");
            return result;
        } catch (JSONException e) {
            Log.e(TAG, "Error reading dismissed IDs", e);
            return new String[0];
        }
    }
}
