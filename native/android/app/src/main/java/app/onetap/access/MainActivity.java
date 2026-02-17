package app.onetap.access;

import android.content.Intent;
import android.os.Bundle;
import android.net.Uri;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import app.onetap.access.plugins.ShortcutPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    public static final String ACTION_QUICK_CREATE = "app.onetap.QUICK_CREATE";
    
    // Flag to indicate app was launched from Quick Create widget
    private boolean pendingQuickCreate = false;
    
    // Pending slideshow ID to open (from deep link)
    private String pendingSlideshowId = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the ShortcutPlugin BEFORE calling super.onCreate()
        registerPlugin(ShortcutPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Initialize crash logger early with application context
        // This ensures logs can be persisted even if activities crash
        CrashLogger.getInstance().initialize(getApplicationContext());
        CrashLogger.getInstance().addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "MainActivity.onCreate");
        
        Log.d(TAG, "onCreate called");
        logIntent(getIntent());
        
        // Check for Quick Create widget action
        handleQuickCreateIntent(getIntent());
        
        // Check for slideshow deep link
        handleSlideshowDeepLink(getIntent());
        
        // Inject Android navigation bar height as CSS variable into the WebView
        setupNavBarInsetInjection();
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        
        Log.d(TAG, "onNewIntent called");
        logIntent(intent);
        
        // CRITICAL: Update the stored intent so getIntent() returns the new one
        // This is essential for Share Sheet to work when app is already open
        setIntent(intent);
        
        // Check for Quick Create widget action
        handleQuickCreateIntent(intent);
        
        // Check for slideshow deep link
        handleSlideshowDeepLink(intent);
        
        // Notify Capacitor bridge about the new intent
        if (bridge != null) {
            bridge.onNewIntent(intent);
            Log.d(TAG, "Notified bridge of new intent");
        }
    }
    
    /**
     * Handle Quick Create widget action
     */
    private void handleQuickCreateIntent(Intent intent) {
        if (intent != null && ACTION_QUICK_CREATE.equals(intent.getAction())) {
            Log.d(TAG, "Quick Create widget action detected");
            pendingQuickCreate = true;
            // The JS side will check for this via getSharedContent
        }
    }
    
    /**
     * Handle slideshow deep link (onetap://slideshow/{shortcutId})
     */
    private void handleSlideshowDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        
        Uri data = intent.getData();
        String scheme = data.getScheme();
        String host = data.getHost();
        
        if ("onetap".equals(scheme) && "slideshow".equals(host)) {
            // Extract slideshow ID from path: /shortcutId
            String path = data.getPath();
            if (path != null && path.length() > 1) {
                pendingSlideshowId = path.substring(1); // Remove leading /
                Log.d(TAG, "Slideshow deep link detected, ID: " + pendingSlideshowId);
            }
        }
    }
    
    /**
     * Check if there's a pending Quick Create action
     */
    public boolean hasPendingQuickCreate() {
        return pendingQuickCreate;
    }
    
    /**
     * Clear the pending Quick Create flag
     */
    public void clearPendingQuickCreate() {
        pendingQuickCreate = false;
    }
    
    /**
     * Check if there's a pending slideshow to open
     */
    public String getPendingSlideshowId() {
        return pendingSlideshowId;
    }
    
    /**
     * Clear the pending slideshow ID
     */
    public void clearPendingSlideshowId() {
        pendingSlideshowId = null;
    }
    
    /**
     * Set up a WindowInsets listener on the WebView to detect the actual
     * navigation bar height and inject it as a CSS custom property.
     * Works for both 3-button nav (~48dp) and gesture nav (~0dp).
     */
    private void setupNavBarInsetInjection() {
        // Wait for the bridge/WebView to be ready
        getBridge().getWebView().post(() -> {
            WebView webView = getBridge().getWebView();
            float density = getResources().getDisplayMetrics().density;
            
            ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
                int navBarHeight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
                float cssPx = navBarHeight / density;
                String js = "document.documentElement.style.setProperty('--android-nav-height', '" + cssPx + "px')";
                webView.evaluateJavascript(js, null);
                Log.d(TAG, "Injected --android-nav-height: " + cssPx + "px (raw: " + navBarHeight + "px, density: " + density + ")");
                return ViewCompat.onApplyWindowInsets(view, insets);
            });
            
            // Trigger initial inset application
            webView.requestApplyInsets();
        });
    }
    
    private void logIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "Intent is null");
            return;
        }
        
        String action = intent.getAction();
        String type = intent.getType();
        String data = intent.getDataString();
        
        Log.d(TAG, "Intent - action: " + action + ", type: " + type + ", data: " + data);
        
        if (Intent.ACTION_SEND.equals(action)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            Log.d(TAG, "ACTION_SEND - text extra: " + text);
        }
    }
}
