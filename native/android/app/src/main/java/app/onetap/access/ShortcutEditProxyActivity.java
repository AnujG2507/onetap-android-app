package app.onetap.access;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

/**
 * Transparent proxy activity that handles "Edit" actions from shortcut long-press menus.
 * 
 * When a user long-presses a shortcut on the home screen and selects an edit action,
 * this activity:
 * 1. Extracts the shortcut ID from the intent
 * 2. Stores it in SharedPreferences for the JS layer to pick up
 * 3. Launches the main app
 * 4. Finishes immediately (transparent, no UI)
 * 
 * The JS layer (usePendingShortcutEdit hook) checks for this pending edit on startup
 * and opens the ShortcutEditSheet if found.
 */
public class ShortcutEditProxyActivity extends Activity {
    
    private static final String TAG = "ShortcutEditProxy";
    private static final String PREFS_NAME = "onetap";
    private static final String KEY_PENDING_EDIT_ID = "pending_edit_shortcut_id";
    
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    public static final String ACTION_EDIT_SHORTCUT = "app.onetap.EDIT_SHORTCUT";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String shortcutId = null;
        
        // Try to get shortcut ID from extras
        if (intent != null) {
            shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
            Log.d(TAG, "Received edit request for shortcut: " + shortcutId);
        }
        
        if (shortcutId != null && !shortcutId.isEmpty()) {
            // Store pending edit ID for JS layer to pick up
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putString(KEY_PENDING_EDIT_ID, shortcutId).apply();
            Log.d(TAG, "Stored pending edit ID: " + shortcutId);
            
            // Launch main app
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(mainIntent);
        } else {
            Log.w(TAG, "No shortcut ID provided in edit intent");
        }
        
        // Always finish immediately - this is a transparent proxy
        finish();
    }
    
    /**
     * Get the pending edit shortcut ID and clear it.
     * Called by ShortcutPlugin to retrieve the ID for the JS layer.
     */
    public static String getPendingEditId(android.content.Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String id = prefs.getString(KEY_PENDING_EDIT_ID, null);
        return id;
    }
    
    /**
     * Clear the pending edit shortcut ID.
     * Called by ShortcutPlugin after the JS layer has consumed it.
     */
    public static void clearPendingEditId(android.content.Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        prefs.edit().remove(KEY_PENDING_EDIT_ID).apply();
        Log.d(TAG, "Cleared pending edit ID");
    }
}
