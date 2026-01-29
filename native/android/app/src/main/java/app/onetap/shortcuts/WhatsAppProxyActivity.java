package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * WhatsAppProxyActivity - Handles WhatsApp shortcuts with multiple quick messages.
 * 
 * Philosophy:
 * - Never auto-send messages
 * - For single/zero messages, the shortcut goes directly to WhatsApp (no proxy needed)
 * - For multiple messages, this proxy opens the main app to show the message chooser
 * - All messages are drafts requiring user's final tap in WhatsApp
 * 
 * Intent extras:
 * - phone_number: The phone number to message
 * - quick_messages: JSON array of message strings
 * - contact_name: Display name for the chooser UI
 */
public class WhatsAppProxyActivity extends Activity {
    private static final String TAG = "WhatsAppProxyActivity";
    
    public static final String EXTRA_PHONE_NUMBER = "phone_number";
    public static final String EXTRA_QUICK_MESSAGES = "quick_messages";
    public static final String EXTRA_CONTACT_NAME = "contact_name";
    
    // SharedPreferences key for pending WhatsApp action
    private static final String PREFS_NAME = "whatsapp_pending";
    private static final String KEY_PHONE_NUMBER = "pending_phone_number";
    private static final String KEY_MESSAGES = "pending_messages";
    private static final String KEY_CONTACT_NAME = "pending_contact_name";
    private static final String KEY_TIMESTAMP = "pending_timestamp";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER);
        String messagesJson = intent.getStringExtra(EXTRA_QUICK_MESSAGES);
        String contactName = intent.getStringExtra(EXTRA_CONTACT_NAME);
        
        Log.d(TAG, "WhatsApp proxy opened: phone=" + phoneNumber + ", hasMessages=" + (messagesJson != null));
        
        if (phoneNumber == null || phoneNumber.isEmpty()) {
            Log.e(TAG, "No phone number provided");
            finish();
            return;
        }
        
        // Parse messages
        String[] messages = parseMessages(messagesJson);
        
        if (messages.length <= 1) {
            // Shouldn't happen (proxy is only for multiple messages), but handle gracefully
            String message = messages.length == 1 ? messages[0] : null;
            openWhatsAppDirectly(phoneNumber, message);
            finish();
            return;
        }
        
        // Store pending action for the main app to pick up
        storePendingAction(phoneNumber, messagesJson, contactName);
        
        // Open the main app - it will detect the pending action and show the chooser
        Intent mainIntent = new Intent(this, MainActivity.class);
        mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mainIntent.putExtra("open_whatsapp_chooser", true);
        startActivity(mainIntent);
        
        finish();
    }
    
    private String[] parseMessages(String messagesJson) {
        if (messagesJson == null || messagesJson.isEmpty()) {
            return new String[0];
        }
        
        try {
            JSONArray jsonArray = new JSONArray(messagesJson);
            String[] result = new String[jsonArray.length()];
            for (int i = 0; i < jsonArray.length(); i++) {
                result[i] = jsonArray.getString(i);
            }
            return result;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse messages JSON", e);
            return new String[0];
        }
    }
    
    private void openWhatsAppDirectly(String phoneNumber, String message) {
        String cleanNumber = phoneNumber.replaceAll("[^0-9]", "");
        String url = "https://wa.me/" + cleanNumber;
        
        if (message != null && !message.isEmpty()) {
            try {
                url += "?text=" + URLEncoder.encode(message, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                Log.w(TAG, "Failed to encode message", e);
            }
        }
        
        Intent whatsappIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        whatsappIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        
        try {
            startActivity(whatsappIntent);
            Log.d(TAG, "Opened WhatsApp directly");
        } catch (Exception e) {
            Log.e(TAG, "Failed to open WhatsApp", e);
        }
    }
    
    private void storePendingAction(String phoneNumber, String messagesJson, String contactName) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putString(KEY_PHONE_NUMBER, phoneNumber)
            .putString(KEY_MESSAGES, messagesJson)
            .putString(KEY_CONTACT_NAME, contactName)
            .putLong(KEY_TIMESTAMP, System.currentTimeMillis())
            .apply();
        
        Log.d(TAG, "Stored pending WhatsApp action");
    }
    
    /**
     * Check if there's a pending WhatsApp action and return the data.
     * Called by the JS layer on app startup.
     */
    public static PendingWhatsAppAction getPendingAction(android.content.Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String phoneNumber = prefs.getString(KEY_PHONE_NUMBER, null);
        String messagesJson = prefs.getString(KEY_MESSAGES, null);
        String contactName = prefs.getString(KEY_CONTACT_NAME, null);
        long timestamp = prefs.getLong(KEY_TIMESTAMP, 0);
        
        if (phoneNumber == null || messagesJson == null) {
            return null;
        }
        
        // Check if the pending action is stale (older than 1 minute)
        if (System.currentTimeMillis() - timestamp > 60000) {
            clearPendingAction(context);
            return null;
        }
        
        return new PendingWhatsAppAction(phoneNumber, messagesJson, contactName);
    }
    
    /**
     * Clear the pending WhatsApp action after it's been handled.
     */
    public static void clearPendingAction(android.content.Context context) {
        context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .clear()
            .apply();
        
        Log.d(TAG, "Cleared pending WhatsApp action");
    }
    
    /**
     * Data class for pending WhatsApp action.
     */
    public static class PendingWhatsAppAction {
        public final String phoneNumber;
        public final String messagesJson;
        public final String contactName;
        
        public PendingWhatsAppAction(String phoneNumber, String messagesJson, String contactName) {
            this.phoneNumber = phoneNumber;
            this.messagesJson = messagesJson;
            this.contactName = contactName;
        }
    }
}
