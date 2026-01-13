/*
 * REPLACE YOUR EXISTING MainActivity.java WITH THIS FILE AFTER GIT PULL
 * 
 * To use: 
 * 1. Remove the block comment markers (/* at line 1 and */ at the end)
 * 2. Delete the existing MainActivity.java or MainActivity.kt in your local android folder
 * 3. Copy this uncommented version in its place
 * 
 * This MainActivity includes:
 * - ShortcutPlugin registration
 * - onNewIntent handling for Share Sheet override when app is already open
 */

/*
package app.onetap.shortcuts;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import app.onetap.shortcuts.plugins.ShortcutPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the ShortcutPlugin BEFORE calling super.onCreate()
        registerPlugin(ShortcutPlugin.class);
        super.onCreate(savedInstanceState);
        
        Log.d(TAG, "onCreate called");
        logIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        
        Log.d(TAG, "onNewIntent called");
        logIntent(intent);
        
        // CRITICAL: Update the stored intent so getIntent() returns the new one
        // This is essential for Share Sheet to work when app is already open
        setIntent(intent);
        
        // Notify Capacitor bridge about the new intent
        if (bridge != null) {
            bridge.onNewIntent(intent);
            Log.d(TAG, "Notified bridge of new intent");
        }
    }
    
    private void logIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "Intent is null");
            return;
        }
        
        String action = intent.getAction();
        String type = intent.getType();
        String data = intent.getDataString();
        
        Log.d(TAG, "Intent - action: " + action + ", type: " + type + ", data: " + data);
        
        if (Intent.ACTION_SEND.equals(action)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            Log.d(TAG, "ACTION_SEND - text extra: " + text);
        }
    }
}
*/
