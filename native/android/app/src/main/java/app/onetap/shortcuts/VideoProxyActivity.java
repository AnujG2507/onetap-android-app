package app.onetap.shortcuts;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
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

        Log.d(TAG, "Video URI: " + videoUri + ", MIME type: " + mimeType);

        if (videoUri == null) {
            Log.e(TAG, "No video URI in intent");
            finish();
            return;
        }

        // Default MIME type if not provided
        if (mimeType == null || mimeType.isEmpty()) {
            mimeType = "video/*";
        }

        // Some OEM players struggle with DocumentsProvider media URIs.
        // Normalize where possible to a MediaStore URI (content://media/...).
        Uri normalizedUri = normalizeVideoUri(videoUri);
        if (!normalizedUri.equals(videoUri)) {
            Log.d(TAG, "Normalized video URI: " + normalizedUri);
        }

        // Always use internal player (videos are limited to 100MB)
        Log.d(TAG, "Opening video in internal player");
        openInternalPlayer(normalizedUri, mimeType);

        finish();
    }

    /**
     * Normalize certain document URIs (e.g. com.android.providers.media.documents) to MediaStore URIs.
     * This improves compatibility with some players.
     */
    private Uri normalizeVideoUri(Uri uri) {
        if (uri == null) return Uri.EMPTY;

        try {
            if (!"content".equals(uri.getScheme())) return uri;

            // Example input:
            // content://com.android.providers.media.documents/document/video%3A1000501956
            if ("com.android.providers.media.documents".equals(uri.getAuthority())) {
                String docId = DocumentsContract.getDocumentId(uri); // "video:1000501956"
                if (docId != null) {
                    String[] split = docId.split(":");
                    if (split.length == 2) {
                        String type = split[0];
                        long id = Long.parseLong(split[1]);
                        if ("video".equals(type)) {
                            return ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to normalize video URI: " + e.getMessage());
        }

        return uri;
    }

    private void openInternalPlayer(Uri videoUri, String mimeType) {
        try {
            // Use a native player activity for reliable playback (avoids WebView MediaError issues).
            Intent playIntent = new Intent(this, NativeVideoPlayerActivity.class);
            playIntent.setAction(Intent.ACTION_VIEW);
            playIntent.setDataAndType(videoUri, mimeType);
            playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            playIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

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
