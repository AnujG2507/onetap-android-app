package app.onetap.access;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
            
            // GAP 6 fix: If this action was snoozed, cancel the pending snooze alarm
            // to prevent a duplicate notification after the snooze timer expires
            if (SnoozeReceiver.isSnoozed(this, actionId)) {
                Log.d(TAG, "Action was snoozed, cancelling snooze alarm for: " + actionId);
                cancelSnoozeAlarm(this, actionId);
                SnoozeReceiver.removeSnoozedId(this, actionId);
            }
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
            JSONArray fresh = new JSONArray();
            fresh.put(actionId);
            prefs.edit().putString(KEY_CLICKED_IDS, fresh.toString()).apply();
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
                    boolean isWhatsApp = data.optBoolean("isWhatsApp", false);
                    String quickMessage = data.optString("quickMessage", null);
                    
                    if (isWhatsApp) {
                        // WhatsApp reminder - open chat with optional message prefill
                        String cleanNumber = phoneNumber.replaceAll("[^0-9]", "");
                        String whatsappUrl = "https://wa.me/" + cleanNumber;
                        
                        // If there's a quick message, append it as text parameter
                        if (quickMessage != null && !quickMessage.isEmpty()) {
                            try {
                                whatsappUrl += "?text=" + java.net.URLEncoder.encode(quickMessage, "UTF-8");
                            } catch (java.io.UnsupportedEncodingException e) {
                                Log.w(TAG, "Failed to encode message, opening chat without prefill", e);
                            }
                        }
                        
                        actionIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(whatsappUrl));
                        Log.d(TAG, "Opening WhatsApp: " + (quickMessage != null ? "with message prefill" : "chat only"));
                    } else {
                        // Call reminder - use dialer or direct call
                        boolean hasCallPermission = checkSelfPermission(Manifest.permission.CALL_PHONE) 
                            == PackageManager.PERMISSION_GRANTED;
                        
                        if (hasCallPermission) {
                            actionIntent = new Intent(Intent.ACTION_CALL);
                            actionIntent.setData(Uri.parse("tel:" + phoneNumber));
                            
                            // Try direct call, fall back to dialer if it fails
                            try {
                                actionIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(actionIntent);
                                Log.d(TAG, "Executed direct call to: " + phoneNumber);
                                return; // Success, exit early
                            } catch (SecurityException se) {
                                Log.w(TAG, "CALL_PHONE failed despite permission, falling back to dialer", se);
                                // Fall back to dialer
                                actionIntent = new Intent(Intent.ACTION_DIAL);
                                actionIntent.setData(Uri.parse("tel:" + phoneNumber));
                            }
                        } else {
                            Log.d(TAG, "CALL_PHONE permission not granted, using dialer");
                            actionIntent = new Intent(Intent.ACTION_DIAL);
                            actionIntent.setData(Uri.parse("tel:" + phoneNumber));
                        }
                    }
                    break;
                    
                case "file":
                    String fileUri = data.getString("uri");
                    String mimeType = data.optString("mimeType", "*/*");
                    String displayName = data.optString("displayName", "File");
                    String actionId3 = getIntent().getStringExtra(EXTRA_ACTION_ID);
                    Uri parsedFileUri = Uri.parse(fileUri);

                    if (mimeType.startsWith("image/")) {
                        // Route images through SlideshowProxyActivity (matches shortcut behavior)
                        String slideshowId = actionId3 != null ? actionId3 : "reminder";
                        Intent imgIntent = new Intent(this, MainActivity.class);
                        imgIntent.setAction(Intent.ACTION_VIEW);
                        imgIntent.setData(Uri.parse("onetap://slideshow/" + slideshowId));
                        imgIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        startActivity(imgIntent);
                        Log.d(TAG, "Opened image reminder via slideshow viewer: " + slideshowId);
                        return;

                    } else if (mimeType.startsWith("video/")) {
                        // Route videos through VideoProxyActivity -> NativeVideoPlayerActivity
                        Intent vidIntent = new Intent(this, NativeVideoPlayerActivity.class);
                        vidIntent.setAction(Intent.ACTION_VIEW);
                        vidIntent.setDataAndType(parsedFileUri, mimeType);
                        vidIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if (displayName != null) vidIntent.putExtra("shortcut_title", displayName);
                        if ("content".equals(parsedFileUri.getScheme())) {
                            try {
                                vidIntent.setClipData(android.content.ClipData.newUri(
                                    getContentResolver(), "onetap-video", parsedFileUri));
                            } catch (Exception e) {
                                Log.w(TAG, "Failed to set ClipData for video: " + e.getMessage());
                            }
                        }
                        startActivity(vidIntent);
                        Log.d(TAG, "Opened video reminder via native player");
                        return;

                    } else if ("application/pdf".equals(mimeType)) {
                        // Route PDFs through PDFProxyActivity -> NativePdfViewerV2Activity
                        String pdfId = actionId3 != null ? actionId3 : "reminder";
                        Intent pdfIntent = new Intent(this, NativePdfViewerV2Activity.class);
                        pdfIntent.setDataAndType(parsedFileUri, "application/pdf");
                        pdfIntent.putExtra("shortcut_id", pdfId);
                        pdfIntent.putExtra("shortcut_title", displayName);
                        pdfIntent.putExtra("resume", true);
                        pdfIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if ("content".equals(parsedFileUri.getScheme())) {
                            try {
                                pdfIntent.setClipData(android.content.ClipData.newUri(
                                    getContentResolver(), "onetap-pdf", parsedFileUri));
                            } catch (Exception e) {
                                Log.w(TAG, "Failed to set ClipData for PDF: " + e.getMessage());
                            }
                        }
                        startActivity(pdfIntent);
                        Log.d(TAG, "Opened PDF reminder via native viewer");
                        return;

                    } else {
                        // Other file types: use generic ACTION_VIEW (same as before)
                        actionIntent = new Intent(Intent.ACTION_VIEW);
                        actionIntent.setDataAndType(parsedFileUri, mimeType);
                        actionIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try {
                            android.content.ClipData clipData = android.content.ClipData.newUri(
                                getContentResolver(), displayName, parsedFileUri);
                            actionIntent.setClipData(clipData);
                        } catch (Exception e) {
                            Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                        }
                    }
                    break;

                case "text":
                    String textContent = data.optString("text", "");
                    boolean isChecklist = data.optBoolean("isChecklist", false);
                    String actionId2 = getIntent().getStringExtra(EXTRA_ACTION_ID);
                    Intent textIntent = new Intent(this, TextProxyActivity.class);
                    textIntent.putExtra("shortcut_id", actionId2 != null ? actionId2 : "reminder");
                    textIntent.putExtra("text_content", textContent);
                    textIntent.putExtra("is_checklist", isChecklist);
                    textIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(textIntent);
                    Log.d(TAG, "Opened TextProxyActivity for text reminder");
                    return;
                    
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
    
    /**
     * Cancel a pending snooze alarm for the given action ID.
     */
    private static void cancelSnoozeAlarm(Context context, String actionId) {
        int requestCode = actionId.hashCode() + 2;
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent fireIntent = new Intent(context, SnoozeReceiver.class);
        fireIntent.setAction(SnoozeReceiver.ACTION_SNOOZE_FIRE);
        PendingIntent existingAlarm = PendingIntent.getBroadcast(
            context, requestCode, fireIntent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (existingAlarm != null && alarmManager != null) {
            alarmManager.cancel(existingAlarm);
            existingAlarm.cancel();
            Log.d(TAG, "Cancelled snooze alarm for: " + actionId);
        }
    }
}
