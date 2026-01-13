package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import java.util.List;

/**
 * VideoProxyActivity - Transparent activity that handles video shortcut taps
 * 
 * Purpose:
 * 1. Receives the shortcut tap intent with the content:// URI
 * 2. Grants URI permissions at runtime to video player apps
 * 3. Launches the default video player
 * 4. Falls back to OneTap's internal player if external fails
 * 5. Finishes immediately (no visible UI)
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
        
        // Try external player first
        boolean externalSuccess = tryExternalPlayer(videoUri, mimeType);
        
        if (!externalSuccess) {
            Log.d(TAG, "External player failed, falling back to internal player");
            openInternalPlayer(videoUri, mimeType);
        }
        
        finish();
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
            
            // Grant URI permission to all potential handlers
            for (ResolveInfo handler : handlers) {
                String packageName = handler.activityInfo.packageName;
                try {
                    grantUriPermission(packageName, videoUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    Log.d(TAG, "Granted URI permission to: " + packageName);
                } catch (Exception e) {
                    Log.w(TAG, "Failed to grant permission to " + packageName + ": " + e.getMessage());
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
                        java.io.File shortcutsDir = new java.io.File(getFilesDir(), "shortcuts");
                        java.io.File localFile = new java.io.File(shortcutsDir, fileName);
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
