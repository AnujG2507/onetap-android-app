package app.onetap.access;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * Transparent proxy activity that handles PDF viewing.
 * 
 * This activity handles TWO scenarios:
 * 
 * 1. PDF SHORTCUT TAP (from home screen):
 *    - Receives intent with shortcut_id and resume_enabled extras
 *    - Forwards to MainActivity with VIEW_PDF action
 *    - Resume is controlled by the shortcut's setting
 * 
 * 2. EXTERNAL "OPEN WITH" (from Files app, browser, etc.):
 *    - Receives ACTION_VIEW intent with PDF URI
 *    - No shortcut_id (generates one from URI for position tracking)
 *    - Resume is enabled by default for external opens
 *    
 * Both scenarios route to the in-app PDF viewer via MainActivity.
 */
public class PDFProxyActivity extends Activity {
    
    private static final String TAG = "PDFProxyActivity";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent incomingIntent = getIntent();
        if (incomingIntent == null) {
            Log.e(TAG, "No intent received");
            finish();
            return;
        }
        
        String action = incomingIntent.getAction();
        Uri pdfUri = incomingIntent.getData();
        
        if (pdfUri == null) {
            Log.e(TAG, "No PDF URI in intent");
            finish();
            return;
        }
        
        String mimeType = incomingIntent.getType();
        
        // Check if this is from a shortcut (has shortcut_id) or external open
        String shortcutId = incomingIntent.getStringExtra("shortcut_id");
        String shortcutTitle = incomingIntent.getStringExtra("shortcut_title");
        boolean resumeEnabled;
        boolean isFromShortcut = (shortcutId != null);
        
        if (isFromShortcut) {
            // From shortcut - use the shortcut's resume setting
            resumeEnabled = incomingIntent.getBooleanExtra("resume_enabled", false);
            Log.d(TAG, "PDF from shortcut: uri=" + pdfUri + 
                  ", shortcutId=" + shortcutId + 
                  ", resumeEnabled=" + resumeEnabled);
            
            // Track the usage event for shortcut taps
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for PDF shortcut: " + shortcutId);
        } else {
            // From external "Open with" - generate ID from URI and enable resume by default
            shortcutId = "external_" + Math.abs(pdfUri.toString().hashCode());
            resumeEnabled = true; // Always resume for external opens
            Log.d(TAG, "PDF from external open: uri=" + pdfUri + 
                  ", generatedId=" + shortcutId + 
                  ", action=" + action);
        }
        
        openInternalViewer(pdfUri, shortcutId, shortcutTitle, resumeEnabled, mimeType);
        
        finish();
    }
    
    private void openInternalViewer(Uri pdfUri, String shortcutId, String shortcutTitle, boolean resumeEnabled, String mimeType) {
        try {
            // Take persistent URI permission if possible (for external opens)
            try {
                getContentResolver().takePersistableUriPermission(
                    pdfUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Log.d(TAG, "Acquired persistent URI permission");
            } catch (SecurityException e) {
                Log.d(TAG, "Could not take persistent permission (normal for some URIs): " + e.getMessage());
            }
            
            // Launch native PDF viewer directly (bypasses WebView for Drive-level smoothness)
            Intent viewerIntent = new Intent(this, NativePdfViewerActivity.class);
            viewerIntent.setDataAndType(pdfUri, mimeType != null ? mimeType : "application/pdf");
            viewerIntent.putExtra("shortcut_id", shortcutId);
            viewerIntent.putExtra("shortcut_title", shortcutTitle);
            viewerIntent.putExtra("resume", resumeEnabled);
            viewerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            viewerIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Set ClipData for better URI grant propagation
            if ("content".equals(pdfUri.getScheme())) {
                try {
                    viewerIntent.setClipData(android.content.ClipData.newUri(
                        getContentResolver(), "onetap-pdf", pdfUri));
                } catch (Exception e) {
                    Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                }
            }
            
            startActivity(viewerIntent);
            Log.d(TAG, "Launched native PDF viewer");
        } catch (Exception e) {
            Log.e(TAG, "Failed to open native viewer: " + e.getMessage());
        }
    }
}
