package app.onetap.access;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;
import android.util.Log;

/**
 * Quick Create Widget (1x1)
 * 
 * A minimal widget that launches the app directly into shortcut creation mode.
 * Single tap opens the app with the Access tab ready for creating a new shortcut.
 */
public class QuickCreateWidget extends AppWidgetProvider {
    private static final String TAG = "QuickCreateWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        Log.d(TAG, "onUpdate called for " + appWidgetIds.length + " widgets");
        
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        // Create intent to open app with "quick create" action
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("app.onetap.QUICK_CREATE");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 
            appWidgetId,  // Use widget ID as request code for uniqueness
            intent, 
            flags
        );
        
        // Set up widget view using programmatic RemoteViews
        RemoteViews views = new RemoteViews(context.getPackageName(), 
            context.getResources().getIdentifier("widget_quick_create", "layout", context.getPackageName()));
        
        // Set click listener on the entire widget
        views.setOnClickPendingIntent(
            context.getResources().getIdentifier("widget_container", "id", context.getPackageName()), 
            pendingIntent
        );
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
        Log.d(TAG, "Widget " + appWidgetId + " updated");
    }

    @Override
    public void onEnabled(Context context) {
        Log.d(TAG, "First Quick Create widget added");
    }

    @Override
    public void onDisabled(Context context) {
        Log.d(TAG, "Last Quick Create widget removed");
    }
}
