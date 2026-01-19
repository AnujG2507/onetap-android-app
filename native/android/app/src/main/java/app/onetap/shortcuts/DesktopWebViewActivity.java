package app.onetap.shortcuts;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Custom WebView Activity that allows setting a custom User-Agent.
 * This enables true desktop/mobile site viewing regardless of device.
 * Also intercepts deep links and keeps all navigation within the WebView.
 */
public class DesktopWebViewActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_VIEW_MODE = "view_mode";
    public static final String EXTRA_TITLE = "title";

    // Desktop User-Agent (Chrome on Windows)
    private static final String DESKTOP_USER_AGENT = 
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Mobile User-Agent (Chrome on Android)
    private static final String MOBILE_USER_AGENT = 
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    // Tracking parameters to strip from URLs
    private static final Set<String> TRACKING_PARAMS = new HashSet<>(Arrays.asList(
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
        "fbclid", "gclid", "dclid", "twclid", "msclkid", "mc_eid",
        "oly_anon_id", "oly_enc_id", "_openstat", "vero_id", "wickedid", "yclid",
        "ref", "ref_src", "ref_url", "source", "feature",
        "_ga", "_gl", "si", "igshid"
    ));

    // Deep link to web URL mappings
    private static final Map<String, String> DEEP_LINK_TO_WEB = new HashMap<>();
    static {
        DEEP_LINK_TO_WEB.put("youtube://", "https://www.youtube.com/");
        DEEP_LINK_TO_WEB.put("vnd.youtube:", "https://www.youtube.com/");
        DEEP_LINK_TO_WEB.put("instagram://", "https://www.instagram.com/");
        DEEP_LINK_TO_WEB.put("twitter://", "https://twitter.com/");
        DEEP_LINK_TO_WEB.put("x://", "https://x.com/");
        DEEP_LINK_TO_WEB.put("spotify://", "https://open.spotify.com/");
        DEEP_LINK_TO_WEB.put("fb://", "https://www.facebook.com/");
        DEEP_LINK_TO_WEB.put("messenger://", "https://www.messenger.com/");
        DEEP_LINK_TO_WEB.put("linkedin://", "https://www.linkedin.com/");
        DEEP_LINK_TO_WEB.put("reddit://", "https://www.reddit.com/");
        DEEP_LINK_TO_WEB.put("tiktok://", "https://www.tiktok.com/");
        DEEP_LINK_TO_WEB.put("discord://", "https://discord.com/");
    }

    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleText;
    private ImageButton closeButton;
    private ImageButton refreshButton;
    private SwipeRefreshLayout swipeRefreshLayout;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Remove title bar
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        
        // Create UI programmatically
        createUI();

        Intent intent = getIntent();
        String url = intent.getStringExtra(EXTRA_URL);
        String viewMode = intent.getStringExtra(EXTRA_VIEW_MODE);
        String title = intent.getStringExtra(EXTRA_TITLE);

        if (url == null || url.isEmpty()) {
            finish();
            return;
        }

        // Set initial title
        if (title != null && !title.isEmpty()) {
            titleText.setText(title);
        } else {
            titleText.setText("Loading...");
        }

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        
        // Enable desktop mode by default for wider viewport
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        // Set User-Agent based on view mode
        String userAgent = "desktop".equals(viewMode) ? DESKTOP_USER_AGENT : MOBILE_USER_AGENT;
        settings.setUserAgentString(userAgent);
        
        android.util.Log.d("DesktopWebView", "Opening URL: " + url + " with User-Agent mode: " + viewMode);

        // WebView client to handle page loading
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
                
                // Stop pull-to-refresh indicator
                if (swipeRefreshLayout != null && swipeRefreshLayout.isRefreshing()) {
                    swipeRefreshLayout.setRefreshing(false);
                }
                
                // Update title from page if available
                String pageTitle = view.getTitle();
                if (pageTitle != null && !pageTitle.isEmpty() && !pageTitle.equals(url)) {
                    titleText.setText(pageTitle);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return handleUrlLoading(view, url);
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrlLoading(view, url);
            }
        });

        // Chrome client for progress
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                if (newProgress == 100) {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                super.onReceivedTitle(view, title);
                if (title != null && !title.isEmpty()) {
                    titleText.setText(title);
                }
            }
        });

        // Clean URL before loading
        String cleanedUrl = stripTrackingParams(url);
        webView.loadUrl(cleanedUrl);
    }

    /**
     * Handle URL loading - intercept deep links and keep navigation in WebView
     */
    private boolean handleUrlLoading(WebView view, String url) {
        android.util.Log.d("DesktopWebView", "Intercepted URL: " + url);
        
        // Handle intent:// URLs
        if (url.startsWith("intent://")) {
            String fallbackUrl = extractIntentFallbackUrl(url);
            if (fallbackUrl != null) {
                android.util.Log.d("DesktopWebView", "Loading intent fallback URL: " + fallbackUrl);
                view.loadUrl(stripTrackingParams(fallbackUrl));
            }
            return true; // Block the intent:// URL
        }
        
        // Handle non-HTTP schemes (deep links)
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            // Skip tel:, mailto:, sms: - these should be blocked entirely
            if (url.startsWith("tel:") || url.startsWith("mailto:") || 
                url.startsWith("sms:") || url.startsWith("geo:") || url.startsWith("maps:")) {
                android.util.Log.d("DesktopWebView", "Blocking non-web URL: " + url);
                return true; // Block these URLs
            }
            
            // Try to convert deep link to web URL
            String webUrl = convertDeepLinkToWebUrl(url);
            if (webUrl != null) {
                android.util.Log.d("DesktopWebView", "Converted deep link to web URL: " + webUrl);
                view.loadUrl(stripTrackingParams(webUrl));
                return true;
            }
            
            // Block unknown deep links
            android.util.Log.d("DesktopWebView", "Blocking unknown deep link: " + url);
            return true;
        }
        
        // For HTTP/HTTPS URLs, strip tracking params
        String cleanedUrl = stripTrackingParams(url);
        if (!cleanedUrl.equals(url)) {
            android.util.Log.d("DesktopWebView", "Loading cleaned URL: " + cleanedUrl);
            view.loadUrl(cleanedUrl);
            return true;
        }
        
        // Allow normal navigation within WebView
        return false;
    }

    /**
     * Extract browser fallback URL from intent:// URL
     */
    private String extractIntentFallbackUrl(String intentUrl) {
        // Look for S.browser_fallback_url= parameter
        int start = intentUrl.indexOf("S.browser_fallback_url=");
        if (start == -1) {
            start = intentUrl.indexOf("browser_fallback_url=");
        }
        
        if (start != -1) {
            int valueStart = intentUrl.indexOf("=", start) + 1;
            int end = intentUrl.indexOf(";", valueStart);
            if (end == -1) {
                end = intentUrl.length();
            }
            
            String encoded = intentUrl.substring(valueStart, end);
            try {
                return URLDecoder.decode(encoded, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                return null;
            }
        }
        
        // Try to extract scheme from intent URL
        // intent://video/xyz#Intent;scheme=https;package=com.google.android.youtube;end
        int schemeStart = intentUrl.indexOf("scheme=");
        if (schemeStart != -1) {
            int schemeEnd = intentUrl.indexOf(";", schemeStart);
            String scheme = intentUrl.substring(schemeStart + 7, schemeEnd);
            
            // Get the path from intent://
            String path = intentUrl.substring(9); // Skip "intent://"
            int hashIndex = path.indexOf("#");
            if (hashIndex != -1) {
                path = path.substring(0, hashIndex);
            }
            
            return scheme + "://" + path;
        }
        
        return null;
    }

    /**
     * Convert a deep link scheme to its web URL equivalent
     */
    private String convertDeepLinkToWebUrl(String url) {
        String lowerUrl = url.toLowerCase();
        
        for (Map.Entry<String, String> entry : DEEP_LINK_TO_WEB.entrySet()) {
            if (lowerUrl.startsWith(entry.getKey())) {
                String path = url.substring(entry.getKey().length());
                
                // Handle YouTube video links
                if (entry.getKey().contains("youtube")) {
                    // youtube://video?v=xxx or youtube://watch?v=xxx
                    if (path.contains("v=")) {
                        int vStart = path.indexOf("v=") + 2;
                        int vEnd = path.indexOf("&", vStart);
                        if (vEnd == -1) vEnd = path.length();
                        String videoId = path.substring(vStart, vEnd);
                        return "https://www.youtube.com/watch?v=" + videoId;
                    }
                }
                
                // Handle Instagram user links
                if (entry.getKey().equals("instagram://")) {
                    if (path.contains("username=")) {
                        int uStart = path.indexOf("username=") + 9;
                        int uEnd = path.indexOf("&", uStart);
                        if (uEnd == -1) uEnd = path.length();
                        String username = path.substring(uStart, uEnd);
                        return "https://www.instagram.com/" + username;
                    }
                }
                
                // Handle Twitter/X user links
                if (entry.getKey().equals("twitter://") || entry.getKey().equals("x://")) {
                    if (path.contains("screen_name=")) {
                        int uStart = path.indexOf("screen_name=") + 12;
                        int uEnd = path.indexOf("&", uStart);
                        if (uEnd == -1) uEnd = path.length();
                        String username = path.substring(uStart, uEnd);
                        return "https://twitter.com/" + username;
                    }
                }
                
                // Default: append path to web base
                return entry.getValue() + path;
            }
        }
        
        return null;
    }

    /**
     * Strip tracking/UTM parameters from a URL
     */
    private String stripTrackingParams(String url) {
        try {
            Uri uri = Uri.parse(url);
            Set<String> paramNames = uri.getQueryParameterNames();
            
            // Check if any tracking params exist
            boolean hasTrackingParams = false;
            for (String param : paramNames) {
                if (TRACKING_PARAMS.contains(param.toLowerCase())) {
                    hasTrackingParams = true;
                    break;
                }
            }
            
            if (!hasTrackingParams) {
                return url;
            }
            
            // Rebuild URL without tracking params
            Uri.Builder builder = uri.buildUpon().clearQuery();
            for (String param : paramNames) {
                if (!TRACKING_PARAMS.contains(param.toLowerCase())) {
                    builder.appendQueryParameter(param, uri.getQueryParameter(param));
                }
            }
            
            return builder.build().toString();
        } catch (Exception e) {
            return url;
        }
    }

    private void createUI() {
        // Root layout
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFFFFFFF);

        // Create header bar
        FrameLayout header = new FrameLayout(this);
        header.setBackgroundColor(0xFFF8F8F8);
        int headerHeight = (int) (56 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams headerParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, headerHeight);
        header.setLayoutParams(headerParams);
        header.setElevation(4 * getResources().getDisplayMetrics().density);

        // Close button (left)
        closeButton = new ImageButton(this);
        closeButton.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        closeButton.setBackgroundColor(0x00000000);
        closeButton.setPadding(32, 16, 32, 16);
        closeButton.setOnClickListener(v -> finish());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT);
        closeParams.gravity = android.view.Gravity.START | android.view.Gravity.CENTER_VERTICAL;
        closeButton.setLayoutParams(closeParams);
        header.addView(closeButton);

        // Title (center)
        titleText = new TextView(this);
        titleText.setTextSize(16);
        titleText.setTextColor(0xFF000000);
        titleText.setMaxLines(1);
        titleText.setEllipsize(android.text.TextUtils.TruncateAt.END);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        titleParams.gravity = android.view.Gravity.CENTER;
        titleParams.leftMargin = (int) (64 * getResources().getDisplayMetrics().density);
        titleParams.rightMargin = (int) (64 * getResources().getDisplayMetrics().density);
        titleText.setLayoutParams(titleParams);
        header.addView(titleText);

        // Refresh button (right)
        refreshButton = new ImageButton(this);
        refreshButton.setImageResource(android.R.drawable.ic_menu_rotate);
        refreshButton.setBackgroundColor(0x00000000);
        refreshButton.setPadding(32, 16, 32, 16);
        refreshButton.setOnClickListener(v -> {
            if (webView != null) {
                webView.reload();
            }
        });
        FrameLayout.LayoutParams refreshParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT);
        refreshParams.gravity = android.view.Gravity.END | android.view.Gravity.CENTER_VERTICAL;
        refreshButton.setLayoutParams(refreshParams);
        header.addView(refreshButton);

        root.addView(header);

        // Progress bar (below header)
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, (int) (3 * getResources().getDisplayMetrics().density));
        progressParams.topMargin = headerHeight;
        progressBar.setLayoutParams(progressParams);
        root.addView(progressBar);

        // SwipeRefreshLayout wrapper for pull-to-refresh
        swipeRefreshLayout = new SwipeRefreshLayout(this);
        FrameLayout.LayoutParams swipeParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        swipeParams.topMargin = headerHeight;
        swipeRefreshLayout.setLayoutParams(swipeParams);
        
        // Set refresh colors
        swipeRefreshLayout.setColorSchemeColors(0xFF2196F3, 0xFF4CAF50, 0xFFFF9800);
        
        // Set refresh listener
        swipeRefreshLayout.setOnRefreshListener(() -> {
            if (webView != null) {
                webView.reload();
            }
        });

        // WebView (inside SwipeRefreshLayout)
        webView = new WebView(this);
        swipeRefreshLayout.addView(webView);
        
        // Only enable pull-to-refresh when WebView is scrolled to top
        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            swipeRefreshLayout.setEnabled(scrollY == 0);
        });
        
        root.addView(swipeRefreshLayout);

        setContentView(root);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }
}
