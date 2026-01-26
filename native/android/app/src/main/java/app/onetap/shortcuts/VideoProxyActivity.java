package app.onetap.shortcuts;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * VideoProxyActivity - Transparent activity that handles video shortcut taps
 *
 * Purpose:
 * 1. Receives the shortcut tap intent with content://, file://, or FileProvider URI
 * 2. Opens the video in OneTap's internal player
 * 3. Grants URI permissions at runtime
 * 4. Finishes immediately (no visible UI)
 *
 * Note: Videos are limited to 100MB max when creating shortcuts.
 */
public class VideoProxyActivity extends Activity {
    private static final String TAG = "VideoProxyActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Log.d(TAG, "VideoProxyActivity started");

        Intent receivedIntent = getIntent();
        if (receivedIntent == null) {
            Log.e(TAG, "No intent received");
            finish();
            return;
        }

        Uri videoUri = receivedIntent.getData();
        String mimeType = receivedIntent.getType();
        String shortcutTitle = receivedIntent.getStringExtra("shortcut_title");

        Log.d(TAG, "Video URI: " + videoUri + ", MIME type: " + mimeType + ", Title: " + shortcutTitle);

        if (videoUri == null) {
            Log.e(TAG, "No video URI in intent");
            finish();
            return;
        }

        // Default MIME type if not provided
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = "video/*";
        }

        // Always use internal player (videos are limited to 100MB)
        Log.d(TAG, "Opening video in internal player");
        openInternalPlayer(videoUri, mimeType, shortcutTitle);

        finish();
    }

    private void openInternalPlayer(Uri videoUri, String mimeType, String shortcutTitle) {
        try {
            // Use a native player activity for reliable playback (avoids WebView MediaError issues).
            Intent playIntent = new Intent(this, NativeVideoPlayerActivity.class);
            playIntent.setAction(Intent.ACTION_VIEW);
            playIntent.setDataAndType(videoUri, mimeType);
            playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            playIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Pass the shortcut title for display in the player
            if (shortcutTitle != null && !shortcutTitle.isEmpty()) {
                playIntent.putExtra("shortcut_title", shortcutTitle);
            }

            // IMPORTANT: Some providers/launchers require ClipData to reliably propagate URI grants.
            if ("content".equals(videoUri.getScheme())) {
                try {
                    playIntent.setClipData(ClipData.newUri(getContentResolver(), "onetap-video", videoUri));
                } catch (Exception e) {
                    Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                }
            }

            startActivity(playIntent);
            Log.d(TAG, "Native internal video player launched");

        } catch (Exception e) {
            Log.e(TAG, "Error launching native internal player: " + e.getMessage());
        }
    }
}
