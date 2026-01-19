package app.onetap.shortcuts;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
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

/**
 * Custom WebView Activity that allows setting a custom User-Agent.
 * This enables true desktop/mobile site viewing regardless of device.
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

    private WebView webView;
    private ProgressBar progressBar;
    private TextView titleText;
    private ImageButton closeButton;
    private ImageButton refreshButton;

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
                
                // Update title from page if available
                String pageTitle = view.getTitle();
                if (pageTitle != null && !pageTitle.isEmpty() && !pageTitle.equals(url)) {
                    titleText.setText(pageTitle);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep navigation within this WebView
                return false;
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

        // Load URL
        webView.loadUrl(url);
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

        // WebView (below header)
        webView = new WebView(this);
        FrameLayout.LayoutParams webViewParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT);
        webViewParams.topMargin = headerHeight;
        webView.setLayoutParams(webViewParams);
        root.addView(webView);

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
