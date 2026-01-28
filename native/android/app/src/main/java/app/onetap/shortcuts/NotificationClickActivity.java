package app.onetap.shortcuts;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * Transparent activity that intercepts notification clicks to track them
 * before executing the actual action. This allows the JS layer to know
 * which notifications were clicked vs. missed.
 */
public class NotificationClickActivity extends Activity {
    private static final String TAG = "NotificationClickActivity";
    
    public static final String EXTRA_ACTION_ID = "action_id";
    public static final String EXTRA_DESTINATION_TYPE = "destination_type";
    public static final String EXTRA_DESTINATION_DATA = "destination_data";
    
    private static final String PREFS_NAME = "notification_click_tracking";
    private static final String KEY_CLICKED_IDS = "clicked_notification_ids";
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        Intent intent = getIntent();
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String destinationType = intent.getStringExtra(EXTRA_DESTINATION_TYPE);
        String destinationData = intent.getStringExtra(EXTRA_DESTINATION_DATA);
        
        Log.d(TAG, "Notification clicked: " + actionId);
        
        // Record the click
        if (actionId != null) {
            recordNotificationClick(this, actionId);
        }
        
        // Execute the action
        if (destinationType != null && destinationData != null) {
            executeAction(destinationType, destinationData);
        }
        
        // Finish immediately (this is a transparent activity)
        finish();
    }
    
    /**
     * Record that a notification was clicked in SharedPreferences.
     * The JS layer can retrieve this on startup.
     */
    public static void recordNotificationClick(Context context, String actionId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String clickedJson = prefs.getString(KEY_CLICKED_IDS, "[]");
        
        try {
            JSONArray clickedIds = new JSONArray(clickedJson);
            
            // Check if already recorded (avoid duplicates)
            boolean found = false;
            for (int i = 0; i < clickedIds.length(); i++) {
                if (actionId.equals(clickedIds.getString(i))) {
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                clickedIds.put(actionId);
                prefs.edit().putString(KEY_CLICKED_IDS, clickedIds.toString()).apply();
                Log.d(TAG, "Recorded notification click: " + actionId);
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error recording click", e);
            // Reset to just this ID
            try {
                JSONArray fresh = new JSONArray();
                fresh.put(actionId);
                prefs.edit().putString(KEY_CLICKED_IDS, fresh.toString()).apply();
            } catch (JSONException ignored) {}
        }
    }
    
    /**
     * Get all clicked notification IDs and clear the list.
     * Called by JS layer on startup to sync click data.
     */
    public static String[] getAndClearClickedIds(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String clickedJson = prefs.getString(KEY_CLICKED_IDS, "[]");
        
        try {
            JSONArray clickedIds = new JSONArray(clickedJson);
            String[] result = new String[clickedIds.length()];
            
            for (int i = 0; i < clickedIds.length(); i++) {
                result[i] = clickedIds.getString(i);
            }
            
            // Clear the list after reading
            prefs.edit().putString(KEY_CLICKED_IDS, "[]").apply();
            Log.d(TAG, "Retrieved and cleared " + result.length + " clicked notification IDs");
            
            return result;
        } catch (JSONException e) {
            Log.e(TAG, "Error reading clicked IDs", e);
            return new String[0];
        }
    }
    
    /**
     * Check clicked IDs without clearing (for debugging).
     */
    public static String[] peekClickedIds(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String clickedJson = prefs.getString(KEY_CLICKED_IDS, "[]");
        
        try {
            JSONArray clickedIds = new JSONArray(clickedJson);
            String[] result = new String[clickedIds.length()];
            
            for (int i = 0; i < clickedIds.length(); i++) {
                result[i] = clickedIds.getString(i);
            }
            
            return result;
        } catch (JSONException e) {
            return new String[0];
        }
    }
    
    /**
     * Execute the action based on destination type.
     */
    private void executeAction(String destinationType, String destinationData) {
        try {
            org.json.JSONObject data = new org.json.JSONObject(destinationData);
            Intent actionIntent = null;
            
            switch (destinationType) {
                case "url":
                    String url = data.getString("uri");
                    actionIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    break;
                    
                case "contact":
                    String phoneNumber = data.getString("phoneNumber");
                    actionIntent = new Intent(Intent.ACTION_DIAL);
                    actionIntent.setData(Uri.parse("tel:" + phoneNumber));
                    break;
                    
                case "file":
                    String fileUri = data.getString("uri");
                    String mimeType = data.optString("mimeType", "*/*");
                    actionIntent = new Intent(Intent.ACTION_VIEW);
                    actionIntent.setDataAndType(Uri.parse(fileUri), mimeType);
                    actionIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    break;
                    
                default:
                    Log.w(TAG, "Unknown destination type: " + destinationType);
                    return;
            }
            
            if (actionIntent != null) {
                actionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(actionIntent);
                Log.d(TAG, "Executed action: " + destinationType);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error executing action", e);
        }
    }
}
