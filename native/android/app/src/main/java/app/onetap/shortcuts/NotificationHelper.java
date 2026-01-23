package app.onetap.shortcuts;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Helper class for creating and managing scheduled action notifications.
 * Notifications are minimal and calm, with direct action execution on tap.
 */
public class NotificationHelper {
    private static final String TAG = "NotificationHelper";
    
    public static final String CHANNEL_ID = "scheduled_actions";
    public static final String CHANNEL_NAME = "Scheduled Actions";
    public static final String CHANNEL_DESCRIPTION = "Notifications for scheduled actions";
    
    /**
     * Create the notification channel (required for Android 8.0+)
     */
    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(CHANNEL_DESCRIPTION);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 200});
            
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                Log.d(TAG, "Notification channel created");
            }
        }
    }
    
    /**
     * Show a notification for a scheduled action.
     * Tapping the notification will directly execute the action.
     */
    public static void showActionNotification(
        Context context,
        String actionId,
        String actionName,
        String destinationType,
        String destinationData
    ) {
        createNotificationChannel(context);
        
        // Build the intent that will execute the action
        Intent actionIntent = buildActionIntent(context, destinationType, destinationData);
        
        if (actionIntent == null) {
            Log.e(TAG, "Failed to build action intent for: " + destinationType);
            return;
        }
        
        // Create pending intent for notification tap
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            actionId.hashCode(),
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Get appropriate icon based on destination type
        int iconRes = getNotificationIcon(destinationType);
        
        // Build the notification - minimal and calm
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(actionName)
            .setContentText(getContentText(destinationType))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVibrate(new long[]{0, 200});
        
        // Show the notification
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.notify(actionId.hashCode(), builder.build());
            Log.d(TAG, "Notification shown for action: " + actionName);
        } catch (SecurityException e) {
            Log.e(TAG, "No notification permission", e);
        }
    }
    
    /**
     * Build an intent to execute the action based on destination type.
     */
    private static Intent buildActionIntent(Context context, String destinationType, String destinationData) {
        try {
            switch (destinationType) {
                case "url":
                    // Parse destination data as JSON to get URI
                    org.json.JSONObject urlData = new org.json.JSONObject(destinationData);
                    String url = urlData.getString("uri");
                    Intent urlIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    urlIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    return urlIntent;
                    
                case "contact":
                    // Open dialer with phone number
                    org.json.JSONObject contactData = new org.json.JSONObject(destinationData);
                    String phoneNumber = contactData.getString("phoneNumber");
                    Intent dialIntent = new Intent(Intent.ACTION_DIAL);
                    dialIntent.setData(Uri.parse("tel:" + phoneNumber));
                    dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    return dialIntent;
                    
                case "file":
                    // Open file with appropriate app
                    org.json.JSONObject fileData = new org.json.JSONObject(destinationData);
                    String fileUri = fileData.getString("uri");
                    String mimeType = fileData.optString("mimeType", "*/*");
                    
                    Intent fileIntent = new Intent(Intent.ACTION_VIEW);
                    fileIntent.setDataAndType(Uri.parse(fileUri), mimeType);
                    fileIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    fileIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    return fileIntent;
                    
                default:
                    Log.w(TAG, "Unknown destination type: " + destinationType);
                    return null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error building action intent", e);
            return null;
        }
    }
    
    /**
     * Get notification icon resource based on destination type.
     */
    private static int getNotificationIcon(String destinationType) {
        // Use launcher icon as fallback - in production, use specific icons
        return android.R.drawable.ic_popup_reminder;
    }
    
    /**
     * Get notification content text based on destination type.
     */
    private static String getContentText(String destinationType) {
        switch (destinationType) {
            case "url":
                return "Tap to open";
            case "contact":
                return "Tap to call";
            case "file":
                return "Tap to open file";
            default:
                return "Tap to execute";
        }
    }
    
    /**
     * Cancel a notification by action ID.
     */
    public static void cancelNotification(Context context, String actionId) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        manager.cancel(actionId.hashCode());
    }
}
