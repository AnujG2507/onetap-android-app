package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * Transparent proxy activity that handles PDF shortcut taps.
 * 
 * This activity:
 * 1. Receives the PDF shortcut intent with URI and shortcut metadata
 * 2. Grants URI read permission
 * 3. Launches MainActivity with a special VIEW_PDF action
 * 4. MainActivity routes to the React PDF viewer with resume support
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
        
        Uri pdfUri = incomingIntent.getData();
        if (pdfUri == null) {
            Log.e(TAG, "No PDF URI in intent");
            finish();
            return;
        }
        
        String shortcutId = incomingIntent.getStringExtra("shortcut_id");
        boolean resumeEnabled = incomingIntent.getBooleanExtra("resume_enabled", false);
        String mimeType = incomingIntent.getType();
        
        Log.d(TAG, "PDF shortcut tapped: uri=" + pdfUri + 
              ", shortcutId=" + shortcutId + 
              ", resumeEnabled=" + resumeEnabled);
        
        openInternalViewer(pdfUri, shortcutId, resumeEnabled, mimeType);
        
        finish();
    }
    
    private void openInternalViewer(Uri pdfUri, String shortcutId, boolean resumeEnabled, String mimeType) {
        try {
            // Launch MainActivity with VIEW_PDF action
            Intent webIntent = new Intent(this, MainActivity.class);
            webIntent.setAction("app.onetap.VIEW_PDF");
            webIntent.setDataAndType(pdfUri, mimeType != null ? mimeType : "application/pdf");
            webIntent.putExtra("shortcut_id", shortcutId);
            webIntent.putExtra("resume", resumeEnabled);
            webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            webIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // Set ClipData for better URI grant propagation
            if ("content".equals(pdfUri.getScheme())) {
                try {
                    webIntent.setClipData(android.content.ClipData.newUri(
                        getContentResolver(), "onetap-pdf", pdfUri));
                } catch (Exception e) {
                    Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                }
            }
            
            startActivity(webIntent);
            Log.d(TAG, "Launched internal PDF viewer");
        } catch (Exception e) {
            Log.e(TAG, "Failed to open internal viewer: " + e.getMessage());
        }
    }
}
