package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.util.Log;

import java.io.File;
import java.util.List;

/**
 * VideoProxyActivity - Transparent activity that handles video shortcut taps
 * 
 * Purpose:
 * 1. Receives the shortcut tap intent with content://, file://, or FileProvider URI
 * 2. Checks file size to determine playback strategy:
 *    - Videos <= 50MB: Play in OneTap's internal player (WebView)
 *    - Videos > 50MB: Play in device's default external video player
 * 3. Grants URI permissions at runtime to video player apps
 * 4. Falls back appropriately if the primary method fails
 * 5. Finishes immediately (no visible UI)
 */
public class VideoProxyActivity extends Activity {
    private static final String TAG = "VideoProxyActivity";
    
    // Threshold matching ShortcutPlugin.VIDEO_CACHE_THRESHOLD (50MB)
    private static final long VIDEO_CACHE_THRESHOLD = 50 * 1024 * 1024;

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
        
        // Determine file size to decide playback strategy
        long fileSize = getFileSize(videoUri);
        Log.d(TAG, "Detected file size: " + fileSize + " bytes (" + (fileSize / (1024 * 1024)) + " MB)");

        // IMPORTANT: If size is unknown/0, treat as "large" so we do NOT attempt internal playback.
        boolean isLargeVideo = fileSize <= 0 || fileSize > VIDEO_CACHE_THRESHOLD;

        if (isLargeVideo) {
            // Large video (>50MB) or unknown size: Use external player for better performance
            Log.d(TAG, "Large/unknown-size video detected, using external player");
            boolean externalSuccess = tryExternalPlayer(videoUri, mimeType);
            if (!externalSuccess) {
                Log.w(TAG, "External player failed for large/unknown video, trying internal as last resort");
                openInternalPlayer(videoUri, mimeType);
            }
        } else {
            // Small/medium video (<=50MB): Use internal player for better UX
            Log.d(TAG, "Small/medium video, using internal player");
            openInternalPlayer(videoUri, mimeType);
        }
        
        finish();
    }
    
    /**
     * Get file size from URI (works for file://, content://, and FileProvider URIs).
     *
     * IMPORTANT: Some providers report OpenableColumns.SIZE=0; we fall back to file descriptor stats.
     */
    private long getFileSize(Uri uri) {
        // file:// URIs - direct file access
        if ("file".equals(uri.getScheme())) {
            String path = uri.getPath();
            if (path != null) {
                File file = new File(path);
                if (file.exists()) {
                    return file.length();
                }
            }
        }

        // FileProvider URI pointing to our shortcuts directory
        String authority = uri.getAuthority();
        if (authority != null && authority.equals(getPackageName() + ".fileprovider")) {
            String path = uri.getPath();
            if (path != null && path.contains("/shortcuts/")) {
                String fileName = path.substring(path.lastIndexOf("/") + 1);
                File shortcutsDir = new File(getFilesDir(), "shortcuts");
                File localFile = new File(shortcutsDir, fileName);
                if (localFile.exists()) {
                    return localFile.length();
                }
            }
        }

        // content:// URIs - query content resolver
        try {
            android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE);
                        if (sizeIndex >= 0) {
                            long size = cursor.getLong(sizeIndex);
                            if (size > 0) return size;
                        }
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not query file size: " + e.getMessage());
        }

        // Fallback 1: AssetFileDescriptor length
        try {
            AssetFileDescriptor afd = getContentResolver().openAssetFileDescriptor(uri, "r");
            if (afd != null) {
                try {
                    long len = afd.getLength();
                    if (len > 0) return len;
                } finally {
                    afd.close();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not read size via AssetFileDescriptor: " + e.getMessage());
        }

        // Fallback 2: ParcelFileDescriptor statSize
        try {
            ParcelFileDescriptor pfd = getContentResolver().openFileDescriptor(uri, "r");
            if (pfd != null) {
                try {
                    long stat = pfd.getStatSize();
                    if (stat > 0) return stat;
                } finally {
                    pfd.close();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not read size via FileDescriptor: " + e.getMessage());
        }

        // Unknown size
        return 0;
    }
    
    private boolean tryExternalPlayer(Uri videoUri, String mimeType) {
        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(videoUri, mimeType);
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            // Grant URI permission to all potential handlers (for content:// and FileProvider URIs)
            String scheme = videoUri.getScheme();
            if ("content".equals(scheme)) {
                // Query all apps that can handle this video
                List<ResolveInfo> handlers = getPackageManager().queryIntentActivities(
                    viewIntent, PackageManager.MATCH_DEFAULT_ONLY);

                Log.d(TAG, "Found " + handlers.size() + " handlers for video");

                for (ResolveInfo handler : handlers) {
                    String packageName = handler.activityInfo.packageName;
                    try {
                        grantUriPermission(packageName, videoUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        Log.d(TAG, "Granted URI permission to: " + packageName);
                    } catch (Exception e) {
                        Log.w(TAG, "Failed to grant permission to " + packageName + ": " + e.getMessage());
                    }
                }
            }

            // Use a chooser so the user can pick their preferred video player app
            Intent chooser = Intent.createChooser(viewIntent, "Open video with...");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            startActivity(chooser);
            Log.d(TAG, "External video player chooser launched successfully");
            return true;

        } catch (android.content.ActivityNotFoundException e) {
            Log.w(TAG, "No activity found to handle video: " + e.getMessage());
            return false;
        } catch (SecurityException e) {
            Log.w(TAG, "Security exception launching video: " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error launching external player: " + e.getMessage());
            return false;
        }
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
                    playIntent.setClipData(android.content.ClipData.newUri(getContentResolver(), "onetap-video", videoUri));
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
