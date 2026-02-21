package app.onetap.access;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Receives the PendingIntent callback fired by Android when a shortcut is
 * successfully pinned to the home screen (user tapped "Add" or dragged).
 *
 * The shortcut ID is stored in SharedPreferences so the JS layer can query
 * it via ShortcutPlugin.checkPinConfirmed().
 */
public class ShortcutPinConfirmReceiver extends BroadcastReceiver {
    private static final String TAG = "PinConfirmReceiver";

    public static final String ACTION_PINNED = "app.onetap.SHORTCUT_PINNED";
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";

    private static final String PREFS_NAME = "pin_confirmations";

    @Override
    public void onReceive(Context context, Intent intent) {
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        if (shortcutId == null || shortcutId.isEmpty()) {
            Log.w(TAG, "Pin callback received but no shortcut_id extra");
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong(shortcutId, System.currentTimeMillis()).apply();
        Log.d(TAG, "Pin confirmed for shortcut: " + shortcutId);
    }

    /**
     * Check if a shortcut was confirmed as pinned and consume the entry.
     * Returns true if the callback was received for this ID.
     */
    public static boolean checkAndClear(Context context, String shortcutId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long timestamp = prefs.getLong(shortcutId, 0);
        if (timestamp > 0) {
            prefs.edit().remove(shortcutId).apply();
            Log.d(TAG, "Consumed pin confirmation for: " + shortcutId);
            return true;
        }
        return false;
    }
}
