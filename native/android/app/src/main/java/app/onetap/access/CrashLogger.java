package app.onetap.access;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * CrashLogger - Crash reporting helper for OneTap Shortcuts
 * 
 * This provides a central place for crash logging that can be connected
 * to Firebase Crashlytics or other crash reporting services in the future.
 * 
 * Currently logs to Android logcat and persists recent errors to SharedPreferences
 * for debugging purposes.
 * 
 * Key features:
 * - Breadcrumb trail for understanding user flow
 * - Non-fatal error recording with context
 * - Performance metrics
 * - Persistent error log for post-crash analysis
 */
public class CrashLogger {
    
    private static final String TAG = "CrashLogger";
    private static final String PREFS_NAME = "crash_log_prefs";
    private static final int MAX_BREADCRUMBS = 50;
    private static final int MAX_ERROR_LOG_SIZE = 10000; // chars
    
    // Singleton instance
    private static CrashLogger instance;
    
    // Breadcrumb storage (ring buffer)
    private final String[] breadcrumbs = new String[MAX_BREADCRUMBS];
    private int breadcrumbIndex = 0;
    
    // Context reference (weak to avoid leaks)
    private Context appContext;
    
    // Session info
    private String sessionId;
    private long sessionStartTime;
    
    private CrashLogger() {
        sessionId = generateSessionId();
        sessionStartTime = System.currentTimeMillis();
    }
    
    public static synchronized CrashLogger getInstance() {
        if (instance == null) {
            instance = new CrashLogger();
        }
        return instance;
    }
    
    /**
     * Initialize with application context.
     * Call this from Application.onCreate() or early in the app lifecycle.
     * Can be called multiple times safely - only first call with valid context takes effect.
     */
    public void initialize(Context context) {
        if (context != null && appContext == null) {
            // Always use application context to survive activity destruction
            appContext = context.getApplicationContext();
            Log.d(TAG, "CrashLogger initialized with context");
            
            // Install uncaught exception handler to capture crashes
            installUncaughtExceptionHandler();
        }
        addBreadcrumb("app", "CrashLogger initialized");
    }
    
    /**
     * Install an uncaught exception handler to capture crashes.
     * This ensures crashes are logged even if they bypass our try-catch blocks.
     */
    private void installUncaughtExceptionHandler() {
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                // Log the crash
                Log.e(TAG, "UNCAUGHT EXCEPTION on thread " + thread.getName(), throwable);
                
                // Persist crash info synchronously (we're about to die)
                recordError("UncaughtException", thread.getName(), throwable,
                    "thread", thread.getName(),
                    "fatal", "true");
                
                // Give a moment for the sync write to complete
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ignored) {}
                
            } catch (Exception e) {
                Log.e(TAG, "Error in uncaught exception handler", e);
            }
            
            // Call the default handler (usually terminates the app)
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });
        
        Log.d(TAG, "Uncaught exception handler installed");
    }
    
    /**
     * Add a breadcrumb to track user flow.
     * Breadcrumbs are stored in a ring buffer and attached to crash reports.
     */
    public void addBreadcrumb(String category, String message) {
        String timestamp = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(new Date());
        String breadcrumb = timestamp + " [" + category + "] " + message;
        
        synchronized (breadcrumbs) {
            breadcrumbs[breadcrumbIndex] = breadcrumb;
            breadcrumbIndex = (breadcrumbIndex + 1) % MAX_BREADCRUMBS;
        }
        
        Log.d(TAG, "Breadcrumb: " + breadcrumb);
    }
    
    /**
     * Record a non-fatal error with context.
     * Use this for caught exceptions that indicate something went wrong.
     */
    public void recordError(String component, String operation, Throwable error, String... contextPairs) {
        StringBuilder sb = new StringBuilder();
        sb.append("ERROR in ").append(component).append(".").append(operation);
        sb.append("\n  Message: ").append(error.getMessage());
        sb.append("\n  Type: ").append(error.getClass().getSimpleName());
        
        // Add context pairs (key=value)
        if (contextPairs != null && contextPairs.length > 0) {
            sb.append("\n  Context: ");
            for (int i = 0; i < contextPairs.length - 1; i += 2) {
                sb.append(contextPairs[i]).append("=").append(contextPairs[i + 1]).append(", ");
            }
        }
        
        // Add recent breadcrumbs
        sb.append("\n  Recent breadcrumbs:");
        String[] recentBreadcrumbs = getRecentBreadcrumbs(10);
        for (String b : recentBreadcrumbs) {
            if (b != null) {
                sb.append("\n    ").append(b);
            }
        }
        
        String errorLog = sb.toString();
        Log.e(TAG, errorLog, error);
        
        // Persist to SharedPreferences for debugging
        persistError(component, operation, errorLog);
        
        // In production with Firebase, this would be:
        // FirebaseCrashlytics.getInstance().recordException(error);
    }
    
    /**
     * Record a non-fatal error without an exception object.
     * Use for logic errors or unexpected states.
     */
    public void recordError(String component, String operation, String message, String... contextPairs) {
        StringBuilder sb = new StringBuilder();
        sb.append("ERROR in ").append(component).append(".").append(operation);
        sb.append("\n  Message: ").append(message);
        
        // Add context pairs (key=value)
        if (contextPairs != null && contextPairs.length > 0) {
            sb.append("\n  Context: ");
            for (int i = 0; i < contextPairs.length - 1; i += 2) {
                sb.append(contextPairs[i]).append("=").append(contextPairs[i + 1]).append(", ");
            }
        }
        
        String errorLog = sb.toString();
        Log.e(TAG, errorLog);
        
        persistError(component, operation, errorLog);
    }
    
    /**
     * Log a warning (non-fatal, but notable).
     */
    public void logWarning(String component, String message) {
        String log = "WARN [" + component + "] " + message;
        Log.w(TAG, log);
        addBreadcrumb("warn", component + ": " + message);
    }
    
    /**
     * Log performance metric.
     */
    public void logPerformance(String component, String operation, long durationMs) {
        if (durationMs > 1000) {
            // Log slow operations
            Log.w(TAG, "SLOW: " + component + "." + operation + " took " + durationMs + "ms");
            addBreadcrumb("perf", component + "." + operation + " slow: " + durationMs + "ms");
        } else {
            Log.d(TAG, "PERF: " + component + "." + operation + " took " + durationMs + "ms");
        }
    }
    
    /**
     * Set custom key for crash reports.
     */
    public void setCustomKey(String key, String value) {
        Log.d(TAG, "CustomKey: " + key + "=" + value);
        // In production: FirebaseCrashlytics.getInstance().setCustomKey(key, value);
    }
    
    /**
     * Set user ID for crash correlation.
     */
    public void setUserId(String userId) {
        Log.d(TAG, "UserId set: " + (userId != null ? "present" : "null"));
        // In production: FirebaseCrashlytics.getInstance().setUserId(userId);
    }
    
    /**
     * Get recent breadcrumbs (most recent first).
     */
    public String[] getRecentBreadcrumbs(int count) {
        String[] result = new String[Math.min(count, MAX_BREADCRUMBS)];
        synchronized (breadcrumbs) {
            for (int i = 0; i < result.length; i++) {
                int idx = (breadcrumbIndex - 1 - i + MAX_BREADCRUMBS) % MAX_BREADCRUMBS;
                result[i] = breadcrumbs[idx];
            }
        }
        return result;
    }
    
    /**
     * Get session duration in seconds.
     */
    public long getSessionDurationSeconds() {
        return (System.currentTimeMillis() - sessionStartTime) / 1000;
    }
    
    /**
     * Get the current session ID.
     */
    public String getSessionId() {
        return sessionId;
    }
    
    // === Private helpers ===
    
    private String generateSessionId() {
        return Long.toHexString(System.currentTimeMillis()) + 
               Long.toHexString((long) (Math.random() * 0xFFFFFF));
    }
    
    private void persistError(String component, String operation, String errorLog) {
        if (appContext == null) {
            Log.e(TAG, "Cannot persist error - appContext is null. Call initialize() first.");
            return;
        }
        
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString("error_log", "");
            
            String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
            String newEntry = "\n=== " + timestamp + " ===\n" + errorLog;
            
            // Append to existing, trim if too long
            String combined = existing + newEntry;
            if (combined.length() > MAX_ERROR_LOG_SIZE) {
                combined = combined.substring(combined.length() - MAX_ERROR_LOG_SIZE);
            }
            
            // CRITICAL: Use commit() instead of apply() for synchronous write
            // This ensures logs are persisted even if the app crashes immediately after
            boolean success = prefs.edit()
                .putString("error_log", combined)
                .putString("last_error_component", component)
                .putString("last_error_operation", operation)
                .putLong("last_error_time", System.currentTimeMillis())
                .commit();  // Synchronous write - blocks until complete
            
            if (!success) {
                Log.e(TAG, "Failed to commit error log to SharedPreferences");
            } else {
                Log.d(TAG, "Error log persisted successfully");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to persist error log", e);
        }
    }
    
    /**
     * Get persisted error log for debugging.
     */
    public String getPersistedErrorLog() {
        if (appContext == null) return "";
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString("error_log", "");
        } catch (Exception e) {
            return "Failed to read error log";
        }
    }
    
    /**
     * Clear persisted error log.
     */
    public void clearErrorLog() {
        if (appContext == null) return;
        try {
            SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().remove("error_log").apply();
        } catch (Exception ignored) {}
    }
    
    // === Breadcrumb categories (constants for consistency) ===
    public static final String CAT_LIFECYCLE = "lifecycle";
    public static final String CAT_USER_ACTION = "user";
    public static final String CAT_RENDER = "render";
    public static final String CAT_IO = "io";
    public static final String CAT_UI = "ui";
    public static final String CAT_ZOOM = "zoom";
    public static final String CAT_SCROLL = "scroll";
    public static final String CAT_CACHE = "cache";
    public static final String CAT_ERROR = "error";
}
