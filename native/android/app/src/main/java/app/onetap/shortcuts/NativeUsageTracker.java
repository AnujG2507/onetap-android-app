package app.onetap.shortcuts;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * NativeUsageTracker - Tracks shortcut usage events from home screen taps.
 * 
 * When shortcuts are tapped from the home screen, they go through proxy activities
 * (VideoProxyActivity, PDFProxyActivity, ContactProxyActivity, WhatsAppProxyActivity).
 * These proxy activities call recordTap() to store usage events in SharedPreferences.
 * 
 * On app startup, the JS layer calls getNativeUsageEvents() via ShortcutPlugin to
 * retrieve and clear these events, syncing them to the usageHistoryManager.
 * 
 * Storage format in SharedPreferences:
 * [{"id": "shortcut-uuid", "timestamp": 1234567890123}, ...]
 */
public class NativeUsageTracker {
    private static final String TAG = "NativeUsageTracker";
    private static final String PREFS_NAME = "shortcut_usage_tracking";
    private static final String KEY_EVENTS = "usage_events";
    
    /**
     * Record a tap event for a shortcut.
     * Called from proxy activities when handling home screen shortcut taps.
     * 
     * @param context Application context
     * @param shortcutId The unique ID of the shortcut that was tapped
     */
    public static void recordTap(Context context, String shortcutId) {
        if (shortcutId == null || shortcutId.isEmpty()) {
            Log.w(TAG, "Ignoring tap event with null/empty shortcutId");
            return;
        }
        
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        
        try {
            // Get existing events
            String eventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(eventsJson);
            
            // Create new event
            JSONObject event = new JSONObject();
            event.put("id", shortcutId);
            event.put("timestamp", System.currentTimeMillis());
            
            // Append to array
            events.put(event);
            
            // Save back
            prefs.edit().putString(KEY_EVENTS, events.toString()).apply();
            
            Log.d(TAG, "Recorded tap for shortcut: " + shortcutId + ", total pending: " + events.length());
        } catch (JSONException e) {
            Log.e(TAG, "Error recording tap event", e);
        }
    }
    
    /**
     * Data class for usage events returned to JS layer.
     */
    public static class UsageEvent {
        public final String shortcutId;
        public final long timestamp;
        
        public UsageEvent(String shortcutId, long timestamp) {
            this.shortcutId = shortcutId;
            this.timestamp = timestamp;
        }
    }
    
    /**
     * Get all pending usage events and clear the storage.
     * Called from ShortcutPlugin.getNativeUsageEvents() on app startup.
     * 
     * @param context Application context
     * @return List of usage events that were pending
     */
    public static List<UsageEvent> getAndClearEvents(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        List<UsageEvent> events = new ArrayList<>();
        
        try {
            String eventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray eventsArray = new JSONArray(eventsJson);
            
            for (int i = 0; i < eventsArray.length(); i++) {
                JSONObject eventObj = eventsArray.getJSONObject(i);
                String id = eventObj.getString("id");
                long timestamp = eventObj.getLong("timestamp");
                events.add(new UsageEvent(id, timestamp));
            }
            
            // Clear events after reading
            prefs.edit().remove(KEY_EVENTS).apply();
            
            Log.d(TAG, "Retrieved and cleared " + events.size() + " usage events");
        } catch (JSONException e) {
            Log.e(TAG, "Error reading usage events", e);
        }
        
        return events;
    }
    
    /**
     * Get count of pending events (for debugging).
     * 
     * @param context Application context
     * @return Number of pending usage events
     */
    public static int getPendingCount(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        
        try {
            String eventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(eventsJson);
            return events.length();
        } catch (JSONException e) {
            return 0;
        }
    }
}
