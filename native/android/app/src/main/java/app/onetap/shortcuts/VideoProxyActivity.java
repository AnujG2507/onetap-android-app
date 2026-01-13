package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
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
        
        boolean isLargeVideo = fileSize > VIDEO_CACHE_THRESHOLD;
        
        if (isLargeVideo) {
            // Large video (>50MB): Use external player for better performance
            Log.d(TAG, "Large video detected, using external player");
            boolean externalSuccess = tryExternalPlayer(videoUri, mimeType);
            if (!externalSuccess) {
                Log.w(TAG, "External player failed for large video, trying internal as last resort");
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
     * Get file size from URI (works for file://, content://, and FileProvider URIs)
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
            if (cursor != null && cursor.moveToFirst()) {
                int sizeIndex = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE);
                if (sizeIndex >= 0) {
                    long size = cursor.getLong(sizeIndex);
                    cursor.close();
                    return size;
                }
                cursor.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not query file size: " + e.getMessage());
        }
        
        // Unknown size - treat as small (will use internal player)
        return 0;
    }
    
    private boolean tryExternalPlayer(Uri videoUri, String mimeType) {
        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(videoUri, mimeType);
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Query all apps that can handle this video
            List<ResolveInfo> handlers = getPackageManager().queryIntentActivities(
                viewIntent, PackageManager.MATCH_DEFAULT_ONLY);
            
            Log.d(TAG, "Found " + handlers.size() + " handlers for video");
            
            if (handlers.isEmpty()) {
                Log.w(TAG, "No video player apps found");
                return false;
            }
            
            // Grant URI permission to all potential handlers (for content:// URIs)
            if ("content".equals(videoUri.getScheme())) {
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
            
            // Launch the video player
            startActivity(viewIntent);
            Log.d(TAG, "External video player launched successfully");
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
            // If this is our own FileProvider URI, convert it to a direct file:// URI for maximum reliability.
            Uri dataToSend = videoUri;
            try {
                String expectedAuthority = getPackageName() + ".fileprovider";
                if (expectedAuthority.equals(videoUri.getAuthority())) {
                    String path = videoUri.getPath();
                    if (path != null && path.contains("/shortcuts/")) {
                        String fileName = path.substring(path.lastIndexOf("/") + 1);
                        File shortcutsDir = new File(getFilesDir(), "shortcuts");
                        File localFile = new File(shortcutsDir, fileName);
                        if (localFile.exists() && localFile.length() > 0) {
                            dataToSend = Uri.fromFile(localFile);
                            Log.d(TAG, "Converted FileProvider URI to file:// for internal player: " + dataToSend);
                        } else {
                            Log.w(TAG, "Local shortcut file missing/empty, keeping content URI: " + localFile.getAbsolutePath());
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to convert to file:// URI, keeping original content URI: " + e.getMessage());
            }

            // Launch OneTap with internal video player action
            Intent fallbackIntent = new Intent(this, MainActivity.class);
            fallbackIntent.setAction("app.onetap.PLAY_VIDEO");
            fallbackIntent.setDataAndType(dataToSend, mimeType);
            fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            fallbackIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            startActivity(fallbackIntent);
            Log.d(TAG, "Internal video player launched");

        } catch (Exception e) {
            Log.e(TAG, "Error launching internal player: " + e.getMessage());
        }
    }
}
