package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * MessageProxyActivity - Transparent proxy for message shortcut taps.
 * 
 * This activity intercepts taps on messaging shortcuts (WhatsApp 0-1 msg, Telegram,
 * Signal, Slack) to record usage stats before forwarding to the target app.
 * 
 * Flow:
 * 1. Home screen shortcut tap → MessageProxyActivity
 * 2. Record tap via NativeUsageTracker
 * 3. Open the messaging URL via ACTION_VIEW
 * 4. Finish immediately (transparent, no UI)
 * 
 * Why needed:
 * Without a proxy, messaging shortcuts with direct ACTION_VIEW intents bypass
 * the app entirely, meaning taps are never counted in usage statistics.
 */
public class MessageProxyActivity extends Activity {
    private static final String TAG = "MessageProxyActivity";
    
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    public static final String EXTRA_URL = "url";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        if (intent == null) {
            Log.e(TAG, "No intent received");
            finish();
            return;
        }
        
        // Get URL from extras (preferred) or from intent data
        String url = intent.getStringExtra(EXTRA_URL);
        if (url == null && intent.getData() != null) {
            url = intent.getData().toString();
        }
        
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        
        Log.d(TAG, "Message shortcut tapped: id=" + shortcutId + ", url=" + url);
        
        // Track the tap for usage statistics
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for shortcut: " + shortcutId);
        } else {
            Log.w(TAG, "No shortcut ID provided, tap not tracked");
        }
        
        // Open the messaging URL in the appropriate app
        if (url != null && !url.isEmpty()) {
            try {
                Intent viewIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(viewIntent);
                Log.d(TAG, "Opened messaging URL: " + url);
            } catch (Exception e) {
                Log.e(TAG, "Failed to open messaging URL: " + url, e);
            }
        } else {
            Log.e(TAG, "No URL provided to open");
        }
        
        // Finish immediately - this activity is transparent and should not appear
        finish();
    }
}
