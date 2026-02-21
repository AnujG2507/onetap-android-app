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
            : getContentText(context, destinationType);
        
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
        // GAP 3 fix: Respect reminderSoundEnabled setting
        boolean soundEnabled = ScheduledActionReceiver.isReminderSoundEnabled(context);
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(actionName)
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDeleteIntent(dismissPendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingIntent, true)
            .addAction(android.R.drawable.ic_popup_reminder, context.getString(R.string.notification_snooze_duration, SnoozeReceiver.getSnoozeDurationMinutes(context)), snoozePendingIntent);
        
        if (soundEnabled) {
            builder.setDefaults(NotificationCompat.DEFAULT_ALL);
        } else {
            builder.setDefaults(0)
                   .setSound(null)
                   .setVibrate(null);
        }
        
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
                    // Route through internal viewers based on MIME type (matches shortcut behavior)
                    org.json.JSONObject fileData = new org.json.JSONObject(destinationData);
                    String fileUri = fileData.getString("uri");
                    String mimeType = fileData.optString("mimeType", "*/*");
                    String displayName = fileData.optString("displayName", "File");
                    Uri parsedUri = Uri.parse(fileUri);

                    if (mimeType.startsWith("image/")) {
                        // Images -> slideshow deep link via MainActivity
                        Intent imgIntent = new Intent(context, MainActivity.class);
                        imgIntent.setAction(Intent.ACTION_VIEW);
                        imgIntent.setData(Uri.parse("onetap://slideshow/reminder"));
                        imgIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        return imgIntent;

                    } else if (mimeType.startsWith("video/")) {
                        // Videos -> native video player
                        Intent vidIntent = new Intent(context, NativeVideoPlayerActivity.class);
                        vidIntent.setAction(Intent.ACTION_VIEW);
                        vidIntent.setDataAndType(parsedUri, mimeType);
                        vidIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if (displayName != null) vidIntent.putExtra("shortcut_title", displayName);
                        if ("content".equals(parsedUri.getScheme())) {
                            try {
                                vidIntent.setClipData(ClipData.newUri(
                                    context.getContentResolver(), "onetap-video", parsedUri));
                            } catch (Exception e) {
                                Log.w(TAG, "Failed to set ClipData for video: " + e.getMessage());
                            }
                        }
                        return vidIntent;

                    } else if ("application/pdf".equals(mimeType)) {
                        // PDFs -> native PDF viewer
                        Intent pdfIntent = new Intent(context, NativePdfViewerV2Activity.class);
                        pdfIntent.setDataAndType(parsedUri, "application/pdf");
                        pdfIntent.putExtra("shortcut_id", "reminder");
                        pdfIntent.putExtra("shortcut_title", displayName);
                        pdfIntent.putExtra("resume", true);
                        pdfIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if ("content".equals(parsedUri.getScheme())) {
                            try {
                                pdfIntent.setClipData(ClipData.newUri(
                                    context.getContentResolver(), "onetap-pdf", parsedUri));
                            } catch (Exception e) {
                                Log.w(TAG, "Failed to set ClipData for PDF: " + e.getMessage());
                            }
                        }
                        return pdfIntent;

                    } else {
                        // Other files -> generic ACTION_VIEW (external app)
                        Intent fileIntent = new Intent(Intent.ACTION_VIEW);
                        fileIntent.setDataAndType(parsedUri, mimeType);
                        fileIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try {
                            ClipData clipData = ClipData.newUri(
                                context.getContentResolver(), displayName, parsedUri);
                            fileIntent.setClipData(clipData);
                        } catch (Exception e) {
                            Log.w(TAG, "Failed to set ClipData: " + e.getMessage());
                        }
                        return fileIntent;
                    }
                    
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
    private static String getContentText(Context context, String destinationType) {
        switch (destinationType) {
            case "url":
                return context.getString(R.string.notification_tap_to_open);
            case "contact":
                return context.getString(R.string.notification_tap_to_call_or_message);
            case "file":
                return context.getString(R.string.notification_tap_to_open_file);
            default:
                return context.getString(R.string.notification_tap_to_execute);
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
        views.setTextViewText(R.id.snooze_action_name, actionName != null ? actionName : context.getString(R.string.notification_snoozed));
        views.setTextViewText(R.id.snooze_subtitle, context.getString(R.string.notification_tap_to_execute_now));

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
            .setContentTitle(context.getString(R.string.notification_snoozed_prefix) + (actionName != null ? actionName : context.getString(R.string.notification_snoozed)))
            .setCustomContentView(views)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(false)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDeleteIntent(buildSnoozeCancelPending(context, actionId)) // GAP 2 fix: cancel alarm on swipe-dismiss
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis() + (snoozeMins * 60 * 1000L))
            .setChronometerCountDown(true)
            .addAction(android.R.drawable.ic_popup_reminder, context.getString(R.string.notification_snooze_again), snoozeAgainPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, context.getString(R.string.notification_cancel), buildSnoozeCancelPending(context, actionId));
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
