package app.onetap.access;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Helper class for creating and managing scheduled action notifications.
 * Notifications provide one-tap access to execute actions directly.
 */
public class NotificationHelper {
    private static final String TAG = "NotificationHelper";
    
    public static final String CHANNEL_ID = "scheduled_actions";
    public static final String CHANNEL_NAME = "Scheduled Actions";
    public static final String CHANNEL_DESCRIPTION = "One-tap notifications for scheduled actions";

    public static final String CHANNEL_SNOOZE_ID = "snooze_timer";
    public static final String CHANNEL_SNOOZE_NAME = "Snooze Timer";
    public static final String CHANNEL_SNOOZE_DESCRIPTION = "Silent countdown timer for snoozed notifications";
    
    /**
     * Create the notification channel (required for Android 8.0+)
     * Configured for high-priority, prominent notifications.
     */
    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Main channel - high priority with sound and vibration
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(CHANNEL_DESCRIPTION);
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 150, 100, 150});
            channel.enableLights(true);
            channel.setLightColor(Color.BLUE);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(true);

            // Snooze timer channel - low priority, silent
            NotificationChannel snoozeChannel = new NotificationChannel(
                CHANNEL_SNOOZE_ID,
                CHANNEL_SNOOZE_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            snoozeChannel.setDescription(CHANNEL_SNOOZE_DESCRIPTION);
            snoozeChannel.enableVibration(false);
            snoozeChannel.setSound(null, null);
            snoozeChannel.setShowBadge(false);

            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
                manager.createNotificationChannel(snoozeChannel);
                Log.d(TAG, "Notification channels created");
            }
        }
    }
    
    /**
     * Show a notification for a scheduled action.
     * Tapping the notification will track the click and then execute the action.
     */
    public static void showActionNotification(
        Context context,
        String actionId,
        String actionName,
        String description,
        String destinationType,
        String destinationData
    ) {
        createNotificationChannel(context);
        
        // Build the intent that routes through NotificationClickActivity to track the click
        Intent clickIntent = new Intent(context, NotificationClickActivity.class);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_ACTION_ID, actionId);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_DESTINATION_TYPE, destinationType);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_DESTINATION_DATA, destinationData);
        clickIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        // Create pending intent for notification tap
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            actionId.hashCode(),
            clickIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        // Get appropriate icon - use app icon for consistent branding
        int iconRes = getNotificationIcon(destinationType);
        
        // Use description as content text if present, otherwise fall back to default
        String contentText = (description != null && !description.isEmpty()) 
            ? description 
            : getContentText(destinationType);
        
        // Build snooze intent
        Intent snoozeIntent = new Intent(context, SnoozeReceiver.class);
        snoozeIntent.setAction(SnoozeReceiver.ACTION_SNOOZE_START);
        snoozeIntent.putExtra(SnoozeReceiver.EXTRA_ACTION_ID, actionId);
        snoozeIntent.putExtra(SnoozeReceiver.EXTRA_ACTION_NAME, actionName);
        snoozeIntent.putExtra(SnoozeReceiver.EXTRA_DESCRIPTION, description);
        snoozeIntent.putExtra(SnoozeReceiver.EXTRA_DESTINATION_TYPE, destinationType);
        snoozeIntent.putExtra(SnoozeReceiver.EXTRA_DESTINATION_DATA, destinationData);

        PendingIntent snoozePendingIntent = PendingIntent.getBroadcast(
            context,
            actionId.hashCode() + 3, // Unique request code
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Build dismiss tracking intent
        Intent dismissIntent = new Intent(context, NotificationDismissReceiver.class);
        dismissIntent.setAction(NotificationDismissReceiver.ACTION_DISMISSED);
        dismissIntent.putExtra(NotificationDismissReceiver.EXTRA_ACTION_ID, actionId);

        PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(
            context,
            actionId.hashCode() + 4, // Unique request code
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Build the notification - prominent, one-tap access
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(actionName)
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDeleteIntent(dismissPendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingIntent, true)
            .addAction(android.R.drawable.ic_popup_reminder, "Snooze " + SnoozeReceiver.getSnoozeDurationMinutes(context) + " min", snoozePendingIntent);
        
        // Show the notification
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.notify(actionId.hashCode(), builder.build());
            Log.d(TAG, "Notification shown for action: " + actionName + " (snooze + dismiss tracking)");
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
                    // Directly place the call (one tap promise)
                    org.json.JSONObject contactData = new org.json.JSONObject(destinationData);
                    String phoneNumber = contactData.getString("phoneNumber");
                    Intent callIntent = new Intent(Intent.ACTION_CALL);
                    callIntent.setData(Uri.parse("tel:" + phoneNumber));
                    callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    return callIntent;
                    
                case "file":
                    // Open file with appropriate app
                    org.json.JSONObject fileData = new org.json.JSONObject(destinationData);
                    String fileUri = fileData.getString("uri");
                    String mimeType = fileData.optString("mimeType", "*/*");
                    String displayName = fileData.optString("displayName", "File");
                    
                    Intent fileIntent = new Intent(Intent.ACTION_VIEW);
                    fileIntent.setDataAndType(Uri.parse(fileUri), mimeType);
                    fileIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    fileIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    
                    // Set ClipData with meaningful display name for external app
                    try {
                        ClipData clipData = ClipData.newUri(
                            context.getContentResolver(), displayName, Uri.parse(fileUri));
                        fileIntent.setClipData(clipData);
                    } catch (Exception e) {
                        Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                    }
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
     * Returns context-aware icons for better visual identification.
     */
    private static int getNotificationIcon(String destinationType) {
        switch (destinationType) {
            case "url":
                return R.drawable.ic_notification_link;
            case "contact":
                return R.drawable.ic_notification_phone;
            case "file":
                return R.drawable.ic_notification_file;
            default:
                return R.drawable.ic_notification_default;
        }
    }
    
    /**
     * Get notification content text based on destination type.
     */
    private static String getContentText(String destinationType) {
        switch (destinationType) {
            case "url":
                return "Tap to open";
            case "contact":
                return "Tap to call or message";
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

    /**
     * Show a snooze countdown notification with a live Chronometer timer.
     * The timer counts down from 10:00 to 0:00 in real-time.
     * Tapping the notification executes the action immediately.
     */
    public static void showSnoozeCountdownNotification(
        Context context,
        String actionId,
        String actionName,
        String description,
        String destinationType,
        String destinationData
    ) {
        createNotificationChannel(context);

        // Build tap intent (execute action immediately)
        Intent clickIntent = new Intent(context, NotificationClickActivity.class);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_ACTION_ID, actionId);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_DESTINATION_TYPE, destinationType);
        clickIntent.putExtra(NotificationClickActivity.EXTRA_DESTINATION_DATA, destinationData);
        clickIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int snoozeNotifId = actionId.hashCode() + 1;

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            snoozeNotifId,
            clickIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Build RemoteViews with live Chronometer
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_snooze_countdown);
        
        // Set Chronometer for configured snooze duration countdown
        int snoozeMins = SnoozeReceiver.getSnoozeDurationMinutes(context);
        long countdownBase = SystemClock.elapsedRealtime() + (snoozeMins * 60 * 1000L);
        views.setChronometer(R.id.snooze_timer, countdownBase, null, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            views.setChronometerCountDown(R.id.snooze_timer, true);
        }

        // Set action name and subtitle
        views.setTextViewText(R.id.snooze_action_name, actionName != null ? actionName : "Snoozed");
        views.setTextViewText(R.id.snooze_subtitle, "Tap to execute now");

        int iconRes = getNotificationIcon(destinationType);

        // Build "Snooze again" action button
        Intent snoozeAgainIntent = new Intent(context, SnoozeReceiver.class);
        snoozeAgainIntent.setAction(SnoozeReceiver.ACTION_SNOOZE_START);
        snoozeAgainIntent.putExtra(SnoozeReceiver.EXTRA_ACTION_ID, actionId);
        snoozeAgainIntent.putExtra(SnoozeReceiver.EXTRA_ACTION_NAME, actionName);
        snoozeAgainIntent.putExtra(SnoozeReceiver.EXTRA_DESCRIPTION, description);
        snoozeAgainIntent.putExtra(SnoozeReceiver.EXTRA_DESTINATION_TYPE, destinationType);
        snoozeAgainIntent.putExtra(SnoozeReceiver.EXTRA_DESTINATION_DATA, destinationData);

        PendingIntent snoozeAgainPending = PendingIntent.getBroadcast(
            context,
            actionId.hashCode() + 5,
            snoozeAgainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_SNOOZE_ID)
            .setSmallIcon(iconRes)
            .setContentTitle("Snoozed: " + (actionName != null ? actionName : "Reminder"))
            .setCustomContentView(views)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis() + (snoozeMins * 60 * 1000L))
            .setChronometerCountDown(true)
            .addAction(android.R.drawable.ic_popup_reminder, "Snooze again", snoozeAgainPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Cancel", buildSnoozeCancelPending(context, actionId));
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(context);
            manager.notify(snoozeNotifId, builder.build());
            Log.d(TAG, "Snooze countdown notification shown for: " + actionName);
        } catch (SecurityException e) {
            Log.e(TAG, "No notification permission for snooze countdown", e);
        }
    }

    /**
     * Build a PendingIntent that cancels an active snooze (alarm + notification).
     */
    private static PendingIntent buildSnoozeCancelPending(Context context, String actionId) {
        Intent cancelIntent = new Intent(context, SnoozeReceiver.class);
        cancelIntent.setAction(SnoozeReceiver.ACTION_SNOOZE_CANCEL);
        cancelIntent.putExtra(SnoozeReceiver.EXTRA_ACTION_ID, actionId);

        return PendingIntent.getBroadcast(
            context,
            actionId.hashCode() + 6,
            cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
