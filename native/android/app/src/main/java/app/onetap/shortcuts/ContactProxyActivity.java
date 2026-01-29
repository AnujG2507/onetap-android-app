package app.onetap.shortcuts;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

/**
 * Transparent proxy activity for contact call shortcuts.
 * Routes through this activity to check CALL_PHONE permission and fall back to dialer if denied.
 * This enables the "one tap" promise when permission is granted, while gracefully degrading
 * to the dialer (two taps) when permission is denied.
 */
public class ContactProxyActivity extends Activity {
    private static final String TAG = "ContactProxyActivity";
    
    public static final String EXTRA_PHONE_NUMBER = "phone_number";
    public static final String EXTRA_SHORTCUT_ID = "shortcut_id";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String phoneNumber = null;
        String shortcutId = intent.getStringExtra(EXTRA_SHORTCUT_ID);
        
        // Try to get phone number from extras first
        if (intent.hasExtra(EXTRA_PHONE_NUMBER)) {
            phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER);
        }
        
        // Fall back to parsing from data URI (tel:xxx format)
        if (phoneNumber == null && intent.getData() != null) {
            Uri data = intent.getData();
            if ("tel".equals(data.getScheme())) {
                phoneNumber = data.getSchemeSpecificPart();
            }
        }
        
        if (phoneNumber == null || phoneNumber.isEmpty()) {
            Log.e(TAG, "No phone number provided");
            finish();
            return;
        }
        
        Log.d(TAG, "Contact proxy activated for number: " + phoneNumber + ", shortcutId: " + shortcutId);
        
        // Track the usage event if we have a shortcut ID
        if (shortcutId != null && !shortcutId.isEmpty()) {
            NativeUsageTracker.recordTap(this, shortcutId);
            Log.d(TAG, "Recorded tap for contact shortcut: " + shortcutId);
        }
        
        // Check if we have CALL_PHONE permission
        boolean hasCallPermission = checkSelfPermission(Manifest.permission.CALL_PHONE) 
            == PackageManager.PERMISSION_GRANTED;
        
        Intent actionIntent;
        
        if (hasCallPermission) {
            // Permission granted - place call directly (one tap promise)
            actionIntent = new Intent(Intent.ACTION_CALL);
            actionIntent.setData(Uri.parse("tel:" + phoneNumber));
            
            try {
                actionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(actionIntent);
                Log.d(TAG, "Placed direct call to: " + phoneNumber);
                finish();
                return;
            } catch (SecurityException se) {
                // Unexpected - permission was granted but call failed
                Log.w(TAG, "Call failed despite permission, falling back to dialer", se);
            }
        } else {
            Log.d(TAG, "CALL_PHONE permission not granted, using dialer");
        }
        
        // Fall back to dialer (no permission required)
        actionIntent = new Intent(Intent.ACTION_DIAL);
        actionIntent.setData(Uri.parse("tel:" + phoneNumber));
        actionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        
        try {
            startActivity(actionIntent);
            Log.d(TAG, "Opened dialer for: " + phoneNumber);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open dialer", e);
        }
        
        finish();
    }
}
