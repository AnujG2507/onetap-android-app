package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * LinkProxyActivity - Transparent proxy activity for URL shortcut taps.
 * 
 * Purpose:
 * 1. Receives shortcut tap with the URL and shortcut_id
 * 2. Records the tap via NativeUsageTracker for usage statistics
 * 3. Opens the URL in the default browser
 * 4. Finishes immediately (no visible UI)
 * 
 * This enables tap tracking for link shortcuts that previously opened
 * directly in the browser, bypassing the app entirely.
 */
public class LinkProxyActivity extends Activity {
    private static final String TAG = "LinkProxyActivity";
    
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
        
        // Get URL from intent data or extras
        String url = null;
        Uri data = intent.getData();
        
        if (data != null) {
            url = data.toString();
        }
        
        // Fall back to extra if data is null
        if (url == null || url.isEmpty()) {
            url = intent.getStringExtra(EXTRA_URL);
        }
        
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        
        Log.d(TAG, "Link proxy activated: url=" + url + ", shortcutId=" + shortcutId);
        
        if (url == null || url.isEmpty()) {
            Log.e(TAG, "No URL provided");
            finish();
            return;
        }
        
        // Track the usage event if we have a shortcut ID
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for link shortcut: " + shortcutId);
        }
        
        // Open the URL in the default browser
        openInBrowser(url);
        
        finish();
    }
    
    private void openInBrowser(String url) {
        try {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(browserIntent);
            Log.d(TAG, "Opened URL in browser: " + url);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open URL: " + e.getMessage());
        }
    }
}
