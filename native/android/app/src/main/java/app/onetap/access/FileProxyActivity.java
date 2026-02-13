package app.onetap.access;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * FileProxyActivity - Transparent proxy activity for generic file shortcut taps.
 * 
 * Handles file types that don't have specific proxy activities:
 * - Audio files (MP3, WAV, M4A, etc.)
 * - Other document types (DOCX, XLSX, etc.)
 * - Any file without a dedicated handler
 * 
 * Flow:
 * 1. Receives shortcut tap with file URI and shortcut_id
 * 2. Records the tap via NativeUsageTracker for usage statistics
 * 3. Opens the file in the default external app via ACTION_VIEW
 * 4. Finishes immediately (no visible UI)
 * 
 * This ensures tap tracking works for all file-based shortcuts, not just
 * videos, PDFs, and contacts.
 */
public class FileProxyActivity extends Activity {
    private static final String TAG = "FileProxyActivity";
    
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    public static final String EXTRA_MIME_TYPE = "mime_type";
    public static final String EXTRA_SHORTCUT_TITLE = "shortcut_title";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        if (intent == null) {
            Log.e(TAG, "No intent received");
            finish();
            return;
        }
        
        // Get file URI from intent data
        Uri fileUri = intent.getData();
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        String mimeType = intent.getStringExtra(EXTRA_MIME_TYPE);
        String shortcutTitle = intent.getStringExtra(EXTRA_SHORTCUT_TITLE);
        
        Log.d(TAG, "File proxy activated: uri=" + fileUri + ", shortcutId=" + shortcutId + 
              ", mimeType=" + mimeType + ", title=" + shortcutTitle);
        
        if (fileUri == null) {
            Log.e(TAG, "No file URI provided");
            finish();
            return;
        }
        
        // Track the usage event if we have a shortcut ID
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for file shortcut: " + shortcutId);
        } else {
            Log.w(TAG, "No shortcut ID provided, tap not tracked");
        }
        
        // Open the file in an external app, passing the shortcut title for better display
        openFileInExternalApp(fileUri, mimeType, shortcutTitle);
        
        finish();
    }
    
    private void openFileInExternalApp(Uri fileUri, String mimeType, String displayName) {
        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            
            // Set data and type appropriately
            if (mimeType != null && !mimeType.isEmpty() && !"*/*".equals(mimeType)) {
                viewIntent.setDataAndType(fileUri, mimeType);
            } else {
                viewIntent.setData(fileUri);
            }
            
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Set ClipData with meaningful display name for external app
            String label = (displayName != null && !displayName.isEmpty()) ? displayName : "File";
            try {
                android.content.ClipData clipData = android.content.ClipData.newUri(
                    getContentResolver(), label, fileUri);
                viewIntent.setClipData(clipData);
            } catch (Exception e) {
                Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
            }
            
            // Try to find an activity that can handle this
            if (viewIntent.resolveActivity(getPackageManager()) != null) {
                startActivity(viewIntent);
                Log.d(TAG, "Opened file in external app: " + fileUri);
            } else {
                // Fallback: let the system show a chooser
                Intent chooser = Intent.createChooser(viewIntent, "Open with");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(chooser);
                Log.d(TAG, "Opened file chooser for: " + fileUri);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to open file: " + e.getMessage());
        }
    }
}
