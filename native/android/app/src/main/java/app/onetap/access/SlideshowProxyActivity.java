package app.onetap.access;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * SlideshowProxyActivity - Transparent proxy activity for slideshow shortcut taps.
 * 
 * Purpose:
 * 1. Receives the shortcut tap intent with slideshow ID
 * 2. Records usage via NativeUsageTracker
 * 3. Opens the slideshow viewer in the main WebView app
 * 4. Finishes immediately (no visible UI)
 * 
 * The slideshow content (image URIs, thumbnails) is stored in the app's
 * local shortcut storage and accessed by the web layer via the slideshow ID.
 */
public class SlideshowProxyActivity extends Activity {
    private static final String TAG = "SlideshowProxyActivity";
    
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    public static final String EXTRA_SHORTCUT_TITLE = "shortcut_title";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Log.d(TAG, "SlideshowProxyActivity started");
        
        Intent receivedIntent = getIntent();
        if (receivedIntent == null) {
            Log.e(TAG, "No intent received");
            finish();
            return;
        }
        
        String shortcutId = receivedIntent.getStringExtra(EXTRA_SHORTCUT_ID);
        String shortcutTitle = receivedIntent.getStringExtra(EXTRA_SHORTCUT_TITLE);
        
        Log.d(TAG, "Slideshow shortcut tapped: id=" + shortcutId + ", title=" + shortcutTitle);
        
        if (shortcutId == null || shortcutId.isEmpty()) {
            Log.e(TAG, "No shortcut ID in intent");
            finish();
            return;
        }
        
        // Track the usage event
        NativeUsageTracker.recordTap(this, shortcutId);
        Log.d(TAG, "Recorded tap for slideshow shortcut: " + shortcutId);
        
        // Launch main app with slideshow viewer deep link
        openSlideshowViewer(shortcutId);
        
        finish();
    }
    
    private void openSlideshowViewer(String shortcutId) {
        try {
            // Create intent to open MainActivity with deep link to slideshow viewer
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setAction(Intent.ACTION_VIEW);
            
            // Use onetap:// scheme for internal deep link
            Uri deepLink = Uri.parse("onetap://slideshow/" + shortcutId);
            mainIntent.setData(deepLink);
            
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            
            startActivity(mainIntent);
            Log.d(TAG, "Launched slideshow viewer for: " + shortcutId);
            
        } catch (Exception e) {
            Log.e(TAG, "Failed to open slideshow viewer: " + e.getMessage());
        }
    }
}
