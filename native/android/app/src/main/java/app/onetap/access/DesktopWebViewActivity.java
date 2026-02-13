package app.onetap.access;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.net.URLDecoder;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Custom WebView Activity that displays web content with desktop or mobile user agent.
 * This allows viewing desktop versions of websites in the app.
 * 
 * Features:
 * - Desktop/Mobile User-Agent switching
 * - Custom header with close, share, and refresh buttons
 * - Progress bar for loading indication
 * - Deep link interception (converts to web URLs)
 * - Tracking parameter removal
 * - Pull-to-refresh support
 */
public class DesktopWebViewActivity extends Activity {

    public static final String EXTRA_URL = "extra_url";
    public static final String EXTRA_VIEW_MODE = "extra_view_mode";
    public static final String EXTRA_TITLE = "extra_title";

    private static final String DESKTOP_USER_AGENT = 
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private static final String MOBILE_USER_AGENT = 
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    // Common tracking parameters to strip from URLs
    private static final Set<String> TRACKING_PARAMS = new HashSet<>(Arrays.asList(
        "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
        "fbclid", "gclid", "msclkid", "dclid", "zanpid", "igshid",
        "mc_cid", "mc_eid", "oly_anon_id", "oly_enc_id",
        "_ga", "_gl", "ref", "source", "si"
    ));

    // Map of deep link schemes to their web equivalents
    private static final Map<String, String> DEEP_LINK_TO_WEB = new HashMap<>();
    static {
        DEEP_LINK_TO_WEB.put("youtube", "https://www.youtube.com");
        DEEP_LINK_TO_WEB.put("vnd.youtube", "https://www.youtube.com");
        DEEP_LINK_TO_WEB.put("instagram", "https://www.instagram.com");
        DEEP_LINK_TO_WEB.put("twitter", "https://twitter.com");
        DEEP_LINK_TO_WEB.put("fb", "https://www.facebook.com");
        DEEP_LINK_TO_WEB.put("linkedin", "https://www.linkedin.com");
        DEEP_LINK_TO_WEB.put("reddit", "https://www.reddit.com");
        DEEP_LINK_TO_WEB.put("tiktok", "https://www.tiktok.com");
        DEEP_LINK_TO_WEB.put("spotify", "https://open.spotify.com");
        DEEP_LINK_TO_WEB.put("whatsapp", "https://web.whatsapp.com");
    }

    private String currentUrl;
    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleText;
    private ImageButton closeButton;
    private ImageButton shareButton;
    private ImageButton refreshButton;
    private SwipeRefreshLayout swipeRefreshLayout;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Get intent extras
        String url = getIntent().getStringExtra(EXTRA_URL);
        String viewMode = getIntent().getStringExtra(EXTRA_VIEW_MODE);
        String title = getIntent().getStringExtra(EXTRA_TITLE);

        if (url == null || url.isEmpty()) {
            android.util.Log.e("DesktopWebView", "No URL provided");
            finish();
            return;
        }

        // Store current URL
        currentUrl = url;

        // Default to desktop mode
        if (viewMode == null || viewMode.isEmpty()) {
            viewMode = "desktop";
        }

        // Create UI programmatically
        createUI();

        // Set title if provided
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
        
        // Set user agent based on view mode
        if ("desktop".equals(viewMode)) {
            settings.setUserAgentString(DESKTOP_USER_AGENT);
        } else {
            settings.setUserAgentString(MOBILE_USER_AGENT);
        }
        
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
                
                // Update current URL
                currentUrl = url;
                
                // Stop refresh animation if it was triggered by pull-to-refresh
                if (swipeRefreshLayout != null && swipeRefreshLayout.isRefreshing()) {
                    swipeRefreshLayout.setRefreshing(false);
                }
                
                // Update title from page title
                String pageTitle = view.getTitle();
                if (pageTitle != null && !pageTitle.isEmpty()) {
                    titleText.setText(pageTitle);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrlLoading(view, request.getUrl().toString());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrlLoading(view, url);
            }
        });

        // WebChromeClient for progress updates
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (title != null && !title.isEmpty()) {
                    titleText.setText(title);
                }
            }
        });

        // Load URL with tracking params stripped
        String cleanUrl = stripTrackingParams(url);
        webView.loadUrl(cleanUrl);
    }

    /**
     * Handle URL loading - intercept deep links and convert to web URLs
     */
    private boolean handleUrlLoading(WebView view, String url) {
        if (url == null) return false;

        android.util.Log.d("DesktopWebView", "Intercepting URL: " + url);

        // Handle intent:// URLs
        if (url.startsWith("intent://")) {
            String fallbackUrl = extractIntentFallbackUrl(url);
            if (fallbackUrl != null) {
                android.util.Log.d("DesktopWebView", "Intent URL fallback: " + fallbackUrl);
                view.loadUrl(stripTrackingParams(fallbackUrl));
                return true;
            }
            // Block intent if no fallback
            return true;
        }

        // Check for deep link schemes and convert to web
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        
        if (scheme != null && !scheme.equals("http") && !scheme.equals("https")) {
            String webUrl = convertDeepLinkToWebUrl(url);
            if (webUrl != null) {
                android.util.Log.d("DesktopWebView", "Converted deep link to: " + webUrl);
                view.loadUrl(stripTrackingParams(webUrl));
                return true;
            }
            // Block unknown schemes
            android.util.Log.d("DesktopWebView", "Blocking unknown scheme: " + scheme);
            return true;
        }

        // Strip tracking params for regular URLs
        String cleanUrl = stripTrackingParams(url);
        if (!cleanUrl.equals(url)) {
            view.loadUrl(cleanUrl);
            return true;
        }

        return false; // Let WebView handle normally
    }

    /**
     * Extract fallback URL from intent:// URI
     */
    private String extractIntentFallbackUrl(String intentUrl) {
        try {
            // intent://...#Intent;...;S.browser_fallback_url=...;end
            if (intentUrl.contains("S.browser_fallback_url=")) {
                int start = intentUrl.indexOf("S.browser_fallback_url=") + 23;
                int end = intentUrl.indexOf(";", start);
                if (end == -1) end = intentUrl.indexOf("#", start);
                if (end == -1) end = intentUrl.length();
                String fallback = intentUrl.substring(start, end);
                return URLDecoder.decode(fallback, "UTF-8");
            }
        } catch (Exception e) {
            android.util.Log.e("DesktopWebView", "Error extracting fallback URL: " + e.getMessage());
        }
        return null;
    }

    /**
     * Convert deep link URL to web equivalent
     */
    private String convertDeepLinkToWebUrl(String deepLink) {
        try {
            Uri uri = Uri.parse(deepLink);
            String scheme = uri.getScheme();
            
            if (scheme == null) return null;
            
            String baseUrl = DEEP_LINK_TO_WEB.get(scheme.toLowerCase());
            if (baseUrl != null) {
                // Try to extract path from deep link
                String path = uri.getPath();
                String host = uri.getHost();
                
                StringBuilder webUrl = new StringBuilder(baseUrl);
                
                if (host != null && !host.isEmpty()) {
                    webUrl.append("/").append(host);
                }
                if (path != null && !path.isEmpty()) {
                    webUrl.append(path);
                }
                
                String query = uri.getQuery();
                if (query != null && !query.isEmpty()) {
                    webUrl.append("?").append(query);
                }
                
                return webUrl.toString();
            }
        } catch (Exception e) {
            android.util.Log.e("DesktopWebView", "Error converting deep link: " + e.getMessage());
        }
        return null;
    }

    /**
     * Strip tracking parameters from URL
     */
    private String stripTrackingParams(String url) {
        try {
            Uri uri = Uri.parse(url);
            String query = uri.getQuery();
            
            if (query == null || query.isEmpty()) {
                return url;
            }

            Set<String> paramNames = uri.getQueryParameterNames();
            StringBuilder cleanQuery = new StringBuilder();
            
            for (String param : paramNames) {
                if (!TRACKING_PARAMS.contains(param.toLowerCase())) {
                    if (cleanQuery.length() > 0) {
                        cleanQuery.append("&");
                    }
                    String value = uri.getQueryParameter(param);
                    cleanQuery.append(param);
                    if (value != null) {
                        cleanQuery.append("=").append(Uri.encode(value));
                    }
                }
            }

            Uri.Builder builder = uri.buildUpon().clearQuery();
            if (cleanQuery.length() > 0) {
                builder.encodedQuery(cleanQuery.toString());
            }
            
            return builder.build().toString();
        } catch (Exception e) {
            android.util.Log.e("DesktopWebView", "Error stripping tracking params: " + e.getMessage());
            return url;
        }
    }

    /**
     * Share the current URL
     */
    private void shareCurrentUrl() {
        if (currentUrl == null || currentUrl.isEmpty()) {
            return;
        }

        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");
        
        String shareTitle = titleText.getText().toString();
        if (shareTitle != null && !shareTitle.isEmpty() && !shareTitle.equals("Loading...")) {
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, shareTitle);
            shareIntent.putExtra(Intent.EXTRA_TEXT, shareTitle + "\n" + currentUrl);
        } else {
            shareIntent.putExtra(Intent.EXTRA_TEXT, currentUrl);
        }
        
        startActivity(Intent.createChooser(shareIntent, "Share link"));
    }

    /**
     * Create UI programmatically
     */
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
        titleParams.rightMargin = (int) (100 * getResources().getDisplayMetrics().density); // Increased for two buttons
        titleText.setLayoutParams(titleParams);
        header.addView(titleText);

        // Right side button container
        LinearLayout rightButtons = new LinearLayout(this);
        rightButtons.setOrientation(LinearLayout.HORIZONTAL);
        FrameLayout.LayoutParams rightButtonsParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.MATCH_PARENT);
        rightButtonsParams.gravity = android.view.Gravity.END | android.view.Gravity.CENTER_VERTICAL;
        rightButtons.setLayoutParams(rightButtonsParams);

        // Share button
        shareButton = new ImageButton(this);
        shareButton.setImageResource(android.R.drawable.ic_menu_share);
        shareButton.setBackgroundColor(0x00000000);
        shareButton.setPadding(24, 16, 24, 16);
        shareButton.setOnClickListener(v -> shareCurrentUrl());
        LinearLayout.LayoutParams shareParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT);
        shareButton.setLayoutParams(shareParams);
        rightButtons.addView(shareButton);

        // Refresh button
        refreshButton = new ImageButton(this);
        refreshButton.setImageResource(android.R.drawable.ic_menu_rotate);
        refreshButton.setBackgroundColor(0x00000000);
        refreshButton.setPadding(24, 16, 32, 16);
        refreshButton.setOnClickListener(v -> {
            if (webView != null) {
                webView.reload();
            }
        });
        LinearLayout.LayoutParams refreshParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT);
        refreshButton.setLayoutParams(refreshParams);
        rightButtons.addView(refreshButton);

        header.addView(rightButtons);

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
        SwipeRefreshLayout.LayoutParams webViewParams = new SwipeRefreshLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        webView.setLayoutParams(webViewParams);
        
        // Only enable pull-to-refresh when at the top
        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            swipeRefreshLayout.setEnabled(scrollY == 0);
        });
        
        swipeRefreshLayout.addView(webView);
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
