package app.onetap.access;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.OverScroller;
import android.widget.TextView;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * NativePdfViewerV2Activity
 *
 * Parallel reimplementation of the PDF viewer using a single custom View
 * instead of RecyclerView + Adapter. This eliminates the dual-coordinate-system
 * problem and removes all discrete bitmap swap artifacts.
 *
 * Architecture:
 * - PdfDocumentView: Custom View that owns scroll, zoom, pan, and rendering
 * - All page rendering happens via Canvas.drawBitmap() in onDraw()
 * - Background threads render bitmaps and post invalidate() — no setImageBitmap()
 * - Zero layout passes during zoom/scroll/pan
 *
 * The user must never see the rendering pipeline.
 */
public class NativePdfViewerV2Activity extends Activity {

    private static final String TAG = "PdfViewerV2";
    private static final String PREFS_NAME = "pdf_resume_positions_v2";
    private static final int AUTO_HIDE_DELAY_MS = 4000;

    private static final float MIN_ZOOM = 0.2f;
    private static final float MAX_ZOOM = 5.0f;
    private static final float DOUBLE_TAP_ZOOM = 2.5f;
    private static final int DOUBLE_TAP_ANIM_DURATION_MS = 250;

    private static final int SYNC_SCAN_PAGES = 10;
    private static final int PRERENDER_PAGES = 3;
    private static final int PAGE_GAP_DP = 4;

    private static final long MAX_BITMAP_BYTES = 100 * 1024 * 1024;
    private static final int MAX_BITMAP_DIMENSION = 4096;

    // Core
    private PdfDocumentView documentView;
    private PdfRenderer pdfRenderer;
    private ParcelFileDescriptor fileDescriptor;

    // Page dimensions (PDF points)
    private int[] pageWidths;
    private int[] pageHeights;
    private volatile int scannedPageCount = 0;
    private volatile boolean pageScanComplete = false;

    // Bitmap cache: key = "pageIndex_zoomBucket"
    private LruCache<String, Bitmap> bitmapCache;
    private final Set<String> pendingRenders = ConcurrentHashMap.newKeySet();
    private ExecutorService renderExecutor;
    private final AtomicInteger renderGeneration = new AtomicInteger(0);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // UI chrome
    private LinearLayout rootLayout;
    private FrameLayout headerSpace;
    private FrameLayout topBar;
    private ImageButton closeButton;
    private ImageButton openWithButton;
    private TextView pageIndicator;
    private boolean isTopBarVisible = true;
    private int statusBarHeight = 0;
    private final Handler hideHandler = new Handler(Looper.getMainLooper());
    private final Runnable hideRunnable = this::hideTopBar;
    private ValueAnimator doubleTapAnimator;

    // Error state
    private FrameLayout errorView;

    // Intent data
    private Uri pdfUri;
    private String pdfTitle;
    private String shortcutId;
    private boolean resumeEnabled = true;

    // Display
    private int screenWidth;
    private int screenHeight;
    private float density;

    // Crash logger
    private final CrashLogger crashLogger = CrashLogger.getInstance();

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        crashLogger.initialize(this);
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewerV2.onCreate started");

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        density = metrics.density;

        // Bitmap cache: 1/8 of max memory
        int maxMemory = (int) (Runtime.getRuntime().maxMemory() / 1024);
        bitmapCache = new LruCache<String, Bitmap>(maxMemory / 8) {
            @Override
            protected int sizeOf(String key, Bitmap bitmap) {
                return bitmap.getByteCount() / 1024;
            }
        };

        // Extract intent
        pdfUri = getIntent().getData();
        shortcutId = getIntent().getStringExtra("shortcut_id");
        pdfTitle = getIntent().getStringExtra("shortcut_title");
        resumeEnabled = getIntent().getBooleanExtra("resume", true);

        renderExecutor = Executors.newFixedThreadPool(2);

        if (pdfUri == null) {
            crashLogger.recordError("PdfViewerV2", "onCreate", "No PDF URI provided");
            buildUI();
            showCalmErrorState();
            return;
        }

        crashLogger.addBreadcrumb(CrashLogger.CAT_IO, "Opening PDF: " + pdfUri);

        buildUI();
        setupImmersiveMode();

        if (!openPdf(pdfUri)) {
            showCalmErrorState();
            return;
        }

        // Initialize document view with page data
        documentView.initDocument(pageWidths, pageHeights, scannedPageCount, pageScanComplete);

        // Restore resume state
        if (resumeEnabled && shortcutId != null) {
            loadResumeState();
        }

        // Trigger initial render
        requestVisiblePageRenders();

        scheduleHide();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        screenWidth = metrics.widthPixels;
        screenHeight = metrics.heightPixels;
        if (documentView != null) {
            documentView.onScreenSizeChanged(screenWidth, screenHeight);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        saveResumeState();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        crashLogger.addBreadcrumb(CrashLogger.CAT_LIFECYCLE, "PdfViewerV2.onDestroy");

        hideHandler.removeCallbacks(hideRunnable);

        if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
            doubleTapAnimator.cancel();
        }

        PdfRenderer rendererToClose = pdfRenderer;
        ParcelFileDescriptor fdToClose = fileDescriptor;
        pdfRenderer = null;
        fileDescriptor = null;

        if (renderExecutor != null) {
            renderExecutor.shutdownNow();
            try {
                renderExecutor.awaitTermination(500, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            renderExecutor = null;
        }

        if (bitmapCache != null) bitmapCache.evictAll();

        if (rendererToClose != null) {
            try { rendererToClose.close(); } catch (Exception e) {
                crashLogger.recordError("PdfViewerV2", "onDestroy", e);
            }
        }
        if (fdToClose != null) {
            try { fdToClose.close(); } catch (Exception e) {
                crashLogger.recordError("PdfViewerV2", "onDestroy", e);
            }
        }
    }

    @Override
    public void onBackPressed() {
        exitViewer();
    }

    private void exitViewer() {
        hideHandler.removeCallbacks(hideRunnable);
        saveResumeState();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask();
        } else {
            finish();
        }
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    // =========================================================================
    // PDF OPENING
    // =========================================================================

    private boolean openPdf(Uri uri) {
        try {
            fileDescriptor = getContentResolver().openFileDescriptor(uri, "r");
            if (fileDescriptor == null) return false;

            pdfRenderer = new PdfRenderer(fileDescriptor);
            int pageCount = pdfRenderer.getPageCount();
            crashLogger.setCustomKey("pdf_page_count", String.valueOf(pageCount));

            pageWidths = new int[pageCount];
            pageHeights = new int[pageCount];

            int syncCount = Math.min(pageCount, SYNC_SCAN_PAGES);
            for (int i = 0; i < syncCount; i++) {
                PdfRenderer.Page page = pdfRenderer.openPage(i);
                pageWidths[i] = page.getWidth();
                pageHeights[i] = page.getHeight();
                page.close();
            }
            scannedPageCount = syncCount;
            pageScanComplete = (syncCount >= pageCount);

            // Background scan remaining pages
            if (!pageScanComplete) {
                final int start = syncCount;
                renderExecutor.execute(() -> {
                    try {
                        for (int i = start; i < pageCount; i++) {
                            PdfRenderer r = pdfRenderer;
                            if (r == null) break;
                            synchronized (r) {
                                if (pdfRenderer == null) break;
                                PdfRenderer.Page page = r.openPage(i);
                                pageWidths[i] = page.getWidth();
                                pageHeights[i] = page.getHeight();
                                page.close();
                            }
                            scannedPageCount = i + 1;
                        }
                        pageScanComplete = true;
                        mainHandler.post(() -> {
                            if (documentView != null) {
                                documentView.onPageScanProgress(scannedPageCount, true);
                                requestVisiblePageRenders();
                            }
                        });
                    } catch (Exception e) {
                        pageScanComplete = true;
                        crashLogger.recordError("PdfViewerV2", "backgroundScan", e);
                    }
                });
            }

            return true;
        } catch (Exception e) {
            crashLogger.recordError("PdfViewerV2", "openPdf", e);
            return false;
        }
    }

    // =========================================================================
    // RENDERING
    // =========================================================================

    private String cacheKey(int pageIndex, float zoom) {
        // Bucket zoom to 1 decimal to prevent cache pollution
        return pageIndex + "_" + String.format(Locale.US, "%.1f", zoom);
    }

    /**
     * Request renders for pages currently visible in the document view.
     */
    private void requestVisiblePageRenders() {
        if (documentView == null || pdfRenderer == null || renderExecutor == null) return;

        float zoom = documentView.getZoomLevel();
        int[] visible = documentView.getVisiblePageRange();
        if (visible == null) return;

        int first = visible[0];
        int last = visible[1];

        // Render visible pages at current zoom
        for (int i = first; i <= last; i++) {
            scheduleRender(i, zoom);
        }

        // Prerender buffer
        int preFirst = Math.max(0, first - PRERENDER_PAGES);
        int preLast = Math.min(scannedPageCount - 1, last + PRERENDER_PAGES);
        for (int i = preFirst; i < first; i++) {
            scheduleRender(i, zoom);
        }
        for (int i = last + 1; i <= preLast; i++) {
            scheduleRender(i, zoom);
        }
    }

    private void scheduleRender(int pageIndex, float zoom) {
        if (pageIndex < 0 || pageIndex >= scannedPageCount) return;
        String key = cacheKey(pageIndex, zoom);
        if (bitmapCache.get(key) != null || pendingRenders.contains(key)) return;

        pendingRenders.add(key);
        final int gen = renderGeneration.get();
        renderExecutor.execute(() -> renderPage(pageIndex, zoom, gen));
    }

    private void renderPage(int pageIndex, float targetZoom, int generation) {
        try {
            if (renderGeneration.get() != generation) {
                pendingRenders.remove(cacheKey(pageIndex, targetZoom));
                return;
            }

            if (pageIndex >= pageWidths.length || pageWidths[pageIndex] == 0) {
                pendingRenders.remove(cacheKey(pageIndex, targetZoom));
                return;
            }

            int pageWidth = pageWidths[pageIndex];
            int pageHeight = pageHeights[pageIndex];

            float baseScale = (float) screenWidth / pageWidth;
            float scale = baseScale * targetZoom;

            int bmpW = Math.max(1, (int) (pageWidth * scale));
            int bmpH = Math.max(1, (int) (pageHeight * scale));

            // Clamp to safe dimensions
            int[] safe = getSafeBitmapDimensions(bmpW, bmpH);
            bmpW = safe[0];
            bmpH = safe[1];

            Bitmap bitmap = Bitmap.createBitmap(bmpW, bmpH, Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.WHITE);

            PdfRenderer r = pdfRenderer;
            if (r == null) {
                bitmap.recycle();
                pendingRenders.remove(cacheKey(pageIndex, targetZoom));
                return;
            }

            synchronized (r) {
                if (pdfRenderer == null || pageIndex >= r.getPageCount()) {
                    bitmap.recycle();
                    pendingRenders.remove(cacheKey(pageIndex, targetZoom));
                    return;
                }
                PdfRenderer.Page page = r.openPage(pageIndex);
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                page.close();
            }

            if (renderGeneration.get() != generation) {
                bitmap.recycle();
                pendingRenders.remove(cacheKey(pageIndex, targetZoom));
                return;
            }

            String key = cacheKey(pageIndex, targetZoom);
            bitmapCache.put(key, bitmap);
            pendingRenders.remove(key);

            // Trigger redraw — no setImageBitmap, just invalidate
            if (documentView != null) {
                documentView.postInvalidate();
            }

        } catch (OutOfMemoryError oom) {
            pendingRenders.remove(cacheKey(pageIndex, targetZoom));
            gracefulCacheEviction(pageIndex);
            crashLogger.recordError("PdfViewerV2", "renderPage", oom);
        } catch (Exception e) {
            pendingRenders.remove(cacheKey(pageIndex, targetZoom));
            crashLogger.recordError("PdfViewerV2", "renderPage", e);
        }
    }

    private int[] getSafeBitmapDimensions(int w, int h) {
        float scale = 1.0f;
        int maxDim = Math.max(w, h);
        if (maxDim > MAX_BITMAP_DIMENSION) {
            scale = (float) MAX_BITMAP_DIMENSION / maxDim;
        }
        w = (int) (w * scale);
        h = (int) (h * scale);
        long bytes = (long) w * h * 4;
        if (bytes > MAX_BITMAP_BYTES) {
            float memScale = (float) Math.sqrt((double) MAX_BITMAP_BYTES / bytes);
            w = (int) (w * memScale);
            h = (int) (h * memScale);
        }
        return new int[]{Math.max(1, w), Math.max(1, h)};
    }

    private void gracefulCacheEviction(int keepNearPage) {
        if (bitmapCache == null) return;
        java.util.Map<String, Bitmap> snapshot = bitmapCache.snapshot();
        for (String key : snapshot.keySet()) {
            try {
                int idx = key.indexOf('_');
                if (idx > 0) {
                    int pageIdx = Integer.parseInt(key.substring(0, idx));
                    if (Math.abs(pageIdx - keepNearPage) > 3) {
                        bitmapCache.remove(key);
                    }
                }
            } catch (NumberFormatException ignored) {}
        }
    }

    /**
     * Find the best available cached bitmap for a page.
     * Prefers exact zoom match, falls back to any available zoom level.
     */
    Bitmap findBestBitmap(int pageIndex, float targetZoom) {
        // Exact match
        Bitmap exact = bitmapCache.get(cacheKey(pageIndex, targetZoom));
        if (exact != null && !exact.isRecycled()) return exact;

        // Search all cached zoom levels for this page
        Bitmap best = null;
        float bestZoomDiff = Float.MAX_VALUE;
        java.util.Map<String, Bitmap> snapshot = bitmapCache.snapshot();
        String prefix = pageIndex + "_";
        for (java.util.Map.Entry<String, Bitmap> entry : snapshot.entrySet()) {
            if (entry.getKey().startsWith(prefix)) {
                Bitmap bmp = entry.getValue();
                if (bmp != null && !bmp.isRecycled()) {
                    try {
                        float cachedZoom = Float.parseFloat(entry.getKey().substring(prefix.length()));
                        float diff = Math.abs(cachedZoom - targetZoom);
                        if (diff < bestZoomDiff) {
                            bestZoomDiff = diff;
                            best = bmp;
                        }
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        return best;
    }

    // =========================================================================
    // RESUME STATE
    // =========================================================================

    private void loadResumeState() {
        if (shortcutId == null || !resumeEnabled) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        float scrollY = prefs.getFloat(shortcutId + "_scrollY", 0f);
        float zoom = prefs.getFloat(shortcutId + "_zoom", 1.0f);
        float panX = prefs.getFloat(shortcutId + "_panX", 0f);
        int savedWidth = prefs.getInt(shortcutId + "_screenWidth", screenWidth);

        if (documentView != null) {
            // Adjust scroll if screen width changed
            if (savedWidth != screenWidth) {
                float ratio = (float) screenWidth / savedWidth;
                scrollY *= ratio;
            }
            documentView.restoreState(scrollY, zoom, panX);
        }
    }

    private void saveResumeState() {
        if (shortcutId == null || !resumeEnabled || documentView == null) return;
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putFloat(shortcutId + "_scrollY", documentView.getScrollYPosition())
            .putFloat(shortcutId + "_zoom", documentView.getZoomLevel())
            .putFloat(shortcutId + "_panX", documentView.getPanX())
            .putInt(shortcutId + "_screenWidth", screenWidth)
            .putLong(shortcutId + "_timestamp", System.currentTimeMillis())
            .apply();
    }

    // =========================================================================
    // UI CHROME (reused patterns from V1)
    // =========================================================================

    private void setupImmersiveMode() {
        getWindow().setStatusBarColor(0xFF1C1C1E);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    private void buildUI() {
        rootLayout = new LinearLayout(this);
        rootLayout.setOrientation(LinearLayout.VERTICAL);
        rootLayout.setBackgroundColor(0xFF000000);
        rootLayout.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Header
        headerSpace = new FrameLayout(this);
        LinearLayout.LayoutParams hsp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(56));
        headerSpace.setLayoutParams(hsp);
        headerSpace.setBackgroundColor(0xFF1C1C1E);

        topBar = new FrameLayout(this);
        topBar.setBackgroundColor(0xFF1C1C1E);
        int topBarH = dpToPx(56);
        topBar.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, topBarH));
        topBar.setPadding(dpToPx(8), 0, dpToPx(8), 0);

        // Close button
        int btnSize = dpToPx(44);
        closeButton = new ImageButton(this);
        closeButton.setImageResource(R.drawable.ic_close_pdf);
        closeButton.setBackgroundResource(android.R.color.transparent);
        closeButton.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
        closeButton.setPadding(dpToPx(10), dpToPx(10), dpToPx(10), dpToPx(10));
        FrameLayout.LayoutParams closeP = new FrameLayout.LayoutParams(btnSize, btnSize);
        closeP.gravity = Gravity.START | Gravity.CENTER_VERTICAL;
        closeButton.setLayoutParams(closeP);
        closeButton.setOnClickListener(v -> exitViewer());
        topBar.addView(closeButton);

        // Page indicator (center)
        pageIndicator = new TextView(this);
        pageIndicator.setTextColor(0xFFFFFFFF);
        pageIndicator.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        pageIndicator.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
        FrameLayout.LayoutParams piP = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        piP.gravity = Gravity.CENTER;
        pageIndicator.setLayoutParams(piP);
        topBar.addView(pageIndicator);

        // Title (left of center, after close button)
        if (pdfTitle != null && !pdfTitle.isEmpty()) {
            TextView titleView = new TextView(this);
            titleView.setText(pdfTitle);
            titleView.setTextColor(0xFFFFFFFF);
            titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            titleView.setTypeface(Typeface.DEFAULT, Typeface.NORMAL);
            titleView.setSingleLine(true);
            titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
            titleView.setMaxWidth(screenWidth - dpToPx(160));
            FrameLayout.LayoutParams tp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            tp.gravity = Gravity.START | Gravity.CENTER_VERTICAL;
            tp.leftMargin = btnSize + dpToPx(4);
            titleView.setLayoutParams(tp);
            topBar.addView(titleView);
            // Move page indicator to end
            piP.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
            piP.rightMargin = btnSize + dpToPx(8);
            pageIndicator.setLayoutParams(piP);
        }

        // Open with button
        openWithButton = new ImageButton(this);
        openWithButton.setImageResource(R.drawable.ic_open_external);
        openWithButton.setBackgroundResource(android.R.color.transparent);
        openWithButton.setScaleType(android.widget.ImageView.ScaleType.CENTER_INSIDE);
        openWithButton.setPadding(dpToPx(10), dpToPx(10), dpToPx(10), dpToPx(10));
        FrameLayout.LayoutParams owP = new FrameLayout.LayoutParams(btnSize, btnSize);
        owP.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        openWithButton.setLayoutParams(owP);
        openWithButton.setOnClickListener(v -> openWithExternalApp());
        topBar.addView(openWithButton);

        headerSpace.addView(topBar);
        rootLayout.addView(headerSpace);

        // Content: PdfDocumentView
        documentView = new PdfDocumentView(this);
        documentView.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        rootLayout.addView(documentView);

        // Error view
        errorView = buildCalmErrorView();
        errorView.setVisibility(View.GONE);

        FrameLayout rootWrapper = new FrameLayout(this);
        rootWrapper.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        rootWrapper.addView(rootLayout);
        rootWrapper.addView(errorView);
        setContentView(rootWrapper);

        applyHeaderInsets();
    }

    private void applyHeaderInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(headerSpace, (v, insets) -> {
            statusBarHeight = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top;
            int headerHeight = dpToPx(56) + statusBarHeight;
            ViewGroup.LayoutParams p = headerSpace.getLayoutParams();
            if (isTopBarVisible && p.height != headerHeight) {
                p.height = headerHeight;
                headerSpace.setLayoutParams(p);
            }
            topBar.setPadding(dpToPx(8), statusBarHeight, dpToPx(8), 0);
            FrameLayout.LayoutParams tbp = (FrameLayout.LayoutParams) topBar.getLayoutParams();
            tbp.height = headerHeight;
            topBar.setLayoutParams(tbp);
            return insets;
        });
    }

    private void showTopBar() {
        if (topBar == null || headerSpace == null || isTopBarVisible) {
            if (isTopBarVisible) scheduleHide();
            return;
        }
        isTopBarVisible = true;
        int h = dpToPx(56) + statusBarHeight;
        ViewGroup.LayoutParams p = headerSpace.getLayoutParams();
        if (p.height != h) { p.height = h; headerSpace.setLayoutParams(p); }
        topBar.setVisibility(View.VISIBLE);
        headerSpace.animate().translationY(0).setDuration(200)
            .setInterpolator(new DecelerateInterpolator()).start();
        topBar.animate().alpha(1f).setDuration(200).start();
        scheduleHide();
    }

    private void hideTopBar() {
        if (topBar == null || headerSpace == null || !isTopBarVisible) return;
        isTopBarVisible = false;
        hideHandler.removeCallbacks(hideRunnable);
        int h = dpToPx(56) + statusBarHeight;
        headerSpace.animate().translationY(-h).setDuration(200)
            .setInterpolator(new AccelerateInterpolator()).start();
        topBar.animate().alpha(0f).setDuration(150).start();
    }

    private void toggleTopBar() {
        if (isTopBarVisible) hideTopBar(); else showTopBar();
    }

    private void scheduleHide() {
        hideHandler.removeCallbacks(hideRunnable);
        hideHandler.postDelayed(hideRunnable, AUTO_HIDE_DELAY_MS);
    }

    private void updatePageIndicator(int firstVisible, int totalPages) {
        if (pageIndicator != null && totalPages > 0) {
            pageIndicator.setText((firstVisible + 1) + " / " + totalPages);
        }
    }

    private FrameLayout buildCalmErrorView() {
        FrameLayout container = new FrameLayout(this);
        container.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        container.setBackgroundColor(0xFF1A1A1A);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cp.gravity = Gravity.CENTER;
        content.setLayoutParams(cp);
        content.setPadding(dpToPx(48), dpToPx(48), dpToPx(48), dpToPx(48));

        TextView icon = new TextView(this);
        icon.setText("—");
        icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 48);
        icon.setTextColor(0x66FFFFFF);
        icon.setGravity(Gravity.CENTER);
        content.addView(icon);

        TextView msg = new TextView(this);
        msg.setText("This document is no longer available");
        msg.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        msg.setTextColor(0xCCFFFFFF);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(0, dpToPx(24), 0, dpToPx(8));
        content.addView(msg);

        TextView hint = new TextView(this);
        hint.setText("Tap anywhere to close");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(0x88FFFFFF);
        hint.setGravity(Gravity.CENTER);
        content.addView(hint);

        container.addView(content);
        container.setOnClickListener(v -> exitViewer());
        return container;
    }

    private void showCalmErrorState() {
        if (documentView != null) documentView.setVisibility(View.GONE);
        if (topBar != null) topBar.setVisibility(View.GONE);
        if (errorView != null) errorView.setVisibility(View.VISIBLE);
        hideHandler.removeCallbacks(hideRunnable);
    }

    private void openWithExternalApp() {
        if (pdfUri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(pdfUri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String name = (pdfTitle != null && !pdfTitle.isEmpty()) ? pdfTitle : "Document";
            intent.setClipData(android.content.ClipData.newUri(getContentResolver(), name, pdfUri));
            startActivity(Intent.createChooser(intent, null));
        } catch (Exception e) {
            crashLogger.recordError("PdfViewerV2", "openWith", e);
        }
    }

    private int dpToPx(int dp) {
        return (int) (dp * density + 0.5f);
    }

    // =========================================================================
    // PdfDocumentView — The Heart of V2
    // =========================================================================

    /**
     * Custom View that renders PDF pages directly to Canvas.
     *
     * Owns: scrollY, zoomLevel, panX.
     * Renders cached bitmaps via drawBitmap() — no ImageView, no adapter, no layout passes.
     * Uses OverScroller for fling, ScaleGestureDetector for pinch, GestureDetector for taps.
     */
    private class PdfDocumentView extends View {

        // Document layout
        private int[] pgWidths;
        private int[] pgHeights;
        private float[] pageTopOffsets; // cumulative Y offset in document-space (at zoom=1)
        private float totalDocHeight;  // total document height at zoom=1
        private int docPageCount = 0;

        // View state
        private float scrollY = 0f;       // document-space Y offset
        private float zoomLevel = 1.0f;
        private float panX = 0f;          // horizontal pan when zoomed in

        // Gap between pages in pixels
        private int pageGapPx;

        // Gesture handling
        private ScaleGestureDetector scaleDetector;
        private GestureDetector gestureDetector;
        private OverScroller scroller;
        private boolean isScaling = false;
        private float lastTouchX, lastTouchY;
        private boolean isPanning = false;

        // Render scheduling
        private final Runnable renderAfterSettle = () -> {
            renderGeneration.incrementAndGet();
            pendingRenders.clear();
            requestVisiblePageRenders();
        };

        // Paint for drawing
        private final Paint bitmapPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
        private final Paint pageBgPaint = new Paint();
        private final Paint shadowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

        // Fast scroll
        private final Paint fastScrollPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float fastScrollAlpha = 0f;
        private final Handler fsHideHandler = new Handler(Looper.getMainLooper());
        private final Runnable fsHideRunnable = () -> {
            ValueAnimator fadeOut = ValueAnimator.ofFloat(fastScrollAlpha, 0f);
            fadeOut.setDuration(300);
            fadeOut.addUpdateListener(a -> { fastScrollAlpha = (float) a.getAnimatedValue(); invalidate(); });
            fadeOut.start();
        };

        public PdfDocumentView(Context context) {
            super(context);
            setBackgroundColor(0xFF1A1A1A);
            pageGapPx = (int) (PAGE_GAP_DP * density + 0.5f);

            pageBgPaint.setColor(Color.WHITE);
            pageBgPaint.setStyle(Paint.Style.FILL);

            shadowPaint.setColor(0x40000000);
            shadowPaint.setStyle(Paint.Style.FILL);

            fastScrollPaint.setColor(0xCCFFFFFF);
            fastScrollPaint.setStyle(Paint.Style.FILL);

            scroller = new OverScroller(context);

            scaleDetector = new ScaleGestureDetector(context,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    private float startZoom;

                    @Override
                    public boolean onScaleBegin(ScaleGestureDetector d) {
                        isScaling = true;
                        startZoom = zoomLevel;
                        scroller.forceFinished(true);
                        getParent().requestDisallowInterceptTouchEvent(true);
                        return true;
                    }

                    @Override
                    public boolean onScale(ScaleGestureDetector d) {
                        float newZoom = zoomLevel * d.getScaleFactor();
                        newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

                        float fx = d.getFocusX();
                        float fy = d.getFocusY();

                        // Adjust scrollY to keep focal point stable
                        // Point in document space under focal: docY = (scrollY + fy) / oldZoom
                        // After zoom: scrollY' = docY * newZoom - fy
                        float docY = (scrollY + fy) / zoomLevel;
                        float docX = (panX * -1 + fx) / zoomLevel; // not used for scrollY but for panX

                        zoomLevel = newZoom;
                        scrollY = docY * newZoom - fy;

                        // Adjust panX to keep horizontal focal stable
                        if (newZoom > 1.0f) {
                            panX = -(docX * newZoom - fx);
                        } else {
                            panX = 0;
                        }

                        clampScrollAndPan();
                        invalidate();
                        return true;
                    }

                    @Override
                    public void onScaleEnd(ScaleGestureDetector d) {
                        isScaling = false;
                        getParent().requestDisallowInterceptTouchEvent(false);
                        // Schedule high-res re-render after settle
                        mainHandler.removeCallbacks(renderAfterSettle);
                        mainHandler.postDelayed(renderAfterSettle, 150);
                    }
                });

            gestureDetector = new GestureDetector(context,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onSingleTapConfirmed(MotionEvent e) {
                        toggleTopBar();
                        return true;
                    }

                    @Override
                    public boolean onDoubleTap(MotionEvent e) {
                        float targetZoom;
                        if (zoomLevel < 0.9f) {
                            targetZoom = 1.0f;
                        } else if (zoomLevel > 1.5f) {
                            targetZoom = 1.0f;
                        } else {
                            targetZoom = DOUBLE_TAP_ZOOM;
                        }
                        animateZoomTo(targetZoom, e.getX(), e.getY());
                        return true;
                    }

                    @Override
                    public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                        if (isScaling) return false;

                        if (zoomLevel > 1.0f) {
                            // Bidirectional pan
                            panX -= dx;
                            scrollY += dy;
                        } else {
                            // Vertical scroll only
                            scrollY += dy;
                        }
                        clampScrollAndPan();
                        invalidate();

                        // Show fast scroll indicator
                        showFastScroll();

                        return true;
                    }

                    @Override
                    public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                        if (isScaling) return false;
                        int maxScrollY = (int) Math.max(0, totalDocHeight * zoomLevel - getHeight());
                        scroller.fling(
                            (int) -panX, (int) scrollY,
                            zoomLevel > 1.0f ? (int) -vx : 0, (int) -vy,
                            0, zoomLevel > 1.0f ? getMaxPanX() : 0,
                            0, maxScrollY);
                        postInvalidateOnAnimation();
                        return true;
                    }

                    @Override
                    public boolean onDown(MotionEvent e) {
                        scroller.forceFinished(true);
                        return true;
                    }
                });
        }

        void initDocument(int[] widths, int[] heights, int count, boolean complete) {
            this.pgWidths = widths;
            this.pgHeights = heights;
            this.docPageCount = count;
            recalcPageOffsets();
        }

        void onPageScanProgress(int count, boolean complete) {
            this.docPageCount = count;
            recalcPageOffsets();
            invalidate();
        }

        void onScreenSizeChanged(int newWidth, int newHeight) {
            recalcPageOffsets();
            clampScrollAndPan();
            renderGeneration.incrementAndGet();
            pendingRenders.clear();
            invalidate();
            mainHandler.postDelayed(() -> requestVisiblePageRenders(), 100);
        }

        private void recalcPageOffsets() {
            if (pgWidths == null || docPageCount == 0) return;
            pageTopOffsets = new float[docPageCount];
            float y = 0;
            for (int i = 0; i < docPageCount; i++) {
                pageTopOffsets[i] = y;
                // Page height at zoom=1 (fit-to-width)
                float fitScale = (float) screenWidth / Math.max(1, pgWidths[i]);
                float pageH = pgHeights[i] * fitScale;
                y += pageH + pageGapPx;
            }
            totalDocHeight = y - pageGapPx; // Remove last gap
            if (totalDocHeight < 0) totalDocHeight = 0;
        }

        void restoreState(float sy, float z, float px) {
            scrollY = sy;
            zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
            panX = px;
            clampScrollAndPan();
            invalidate();
        }

        float getScrollYPosition() { return scrollY; }
        float getZoomLevel() { return zoomLevel; }
        float getPanX() { return panX; }

        /**
         * Returns [firstVisiblePage, lastVisiblePage] or null.
         */
        int[] getVisiblePageRange() {
            if (pageTopOffsets == null || docPageCount == 0) return null;

            float viewTop = scrollY / zoomLevel;
            float viewBottom = (scrollY + getHeight()) / zoomLevel;

            int first = -1, last = -1;
            for (int i = 0; i < docPageCount; i++) {
                float pageTop = pageTopOffsets[i];
                float fitScale = (float) screenWidth / Math.max(1, pgWidths[i]);
                float pageBot = pageTop + pgHeights[i] * fitScale;

                if (pageBot >= viewTop && pageTop <= viewBottom) {
                    if (first == -1) first = i;
                    last = i;
                }
            }
            if (first == -1) return null;
            return new int[]{first, last};
        }

        // =================================================================
        // onDraw — THE CRITICAL PATH
        // =================================================================

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            if (pageTopOffsets == null || docPageCount == 0) return;

            int viewW = getWidth();
            int viewH = getHeight();

            // Determine visible document-space bounds
            float docViewTop = scrollY / zoomLevel;
            float docViewBottom = (scrollY + viewH) / zoomLevel;

            int firstVisible = -1;

            for (int i = 0; i < docPageCount; i++) {
                float fitScale = (float) screenWidth / Math.max(1, pgWidths[i]);
                float pageH = pgHeights[i] * fitScale;
                float pageTop = pageTopOffsets[i];
                float pageBottom = pageTop + pageH;

                // Skip off-screen pages
                if (pageBottom < docViewTop || pageTop > docViewBottom) continue;

                if (firstVisible == -1) firstVisible = i;

                // Calculate screen position
                float screenTop = pageTop * zoomLevel - scrollY;
                float screenLeft;
                float pageW = screenWidth * zoomLevel;

                if (zoomLevel <= 1.0f) {
                    // Center page horizontally
                    screenLeft = (viewW - pageW) / 2f;
                } else {
                    screenLeft = panX;
                }

                float screenW = screenWidth * zoomLevel;
                float screenH = pageH * zoomLevel;

                // Draw page shadow (subtle)
                float shadowOffset = 2 * density;
                canvas.drawRect(screenLeft + shadowOffset, screenTop + shadowOffset,
                    screenLeft + screenW + shadowOffset, screenTop + screenH + shadowOffset,
                    shadowPaint);

                // Draw page background (white)
                canvas.drawRect(screenLeft, screenTop, screenLeft + screenW,
                    screenTop + screenH, pageBgPaint);

                // Draw bitmap
                Bitmap bmp = findBestBitmap(i, zoomLevel);
                if (bmp != null && !bmp.isRecycled()) {
                    RectF dst = new RectF(screenLeft, screenTop,
                        screenLeft + screenW, screenTop + screenH);
                    canvas.drawBitmap(bmp, null, dst, bitmapPaint);
                }
                // If no bitmap: white page is already drawn — never gray, never placeholder
            }

            // Update page indicator
            if (firstVisible >= 0) {
                final int fv = firstVisible;
                mainHandler.post(() -> updatePageIndicator(fv, docPageCount));
            }

            // Draw fast scroll thumb
            drawFastScroll(canvas, viewW, viewH);
        }

        private void drawFastScroll(Canvas canvas, int viewW, int viewH) {
            if (fastScrollAlpha <= 0 || totalDocHeight <= 0 || docPageCount <= 3) return;

            float maxScroll = Math.max(1, totalDocHeight * zoomLevel - viewH);
            float fraction = scrollY / maxScroll;
            fraction = Math.max(0, Math.min(1, fraction));

            int thumbW = (int) (6 * density);
            int thumbH = Math.max((int) (48 * density), (int) (viewH * viewH / (totalDocHeight * zoomLevel)));
            int thumbX = viewW - thumbW - (int) (4 * density);
            int thumbY = (int) (fraction * (viewH - thumbH));

            fastScrollPaint.setAlpha((int) (0xCC * fastScrollAlpha));
            canvas.drawRoundRect(thumbX, thumbY, thumbX + thumbW, thumbY + thumbH,
                thumbW / 2f, thumbW / 2f, fastScrollPaint);
        }

        private void showFastScroll() {
            fastScrollAlpha = 1f;
            fsHideHandler.removeCallbacks(fsHideRunnable);
            fsHideHandler.postDelayed(fsHideRunnable, 1500);
        }

        // =================================================================
        // COMPUTE SCROLL (fling physics)
        // =================================================================

        @Override
        public void computeScroll() {
            if (scroller.computeScrollOffset()) {
                scrollY = scroller.getCurrY();
                if (zoomLevel > 1.0f) {
                    panX = -scroller.getCurrX();
                }
                clampScrollAndPan();
                showFastScroll();
                postInvalidateOnAnimation();
            } else if (!scroller.isFinished()) {
                // Fling ended — render at final position
                mainHandler.removeCallbacks(renderAfterSettle);
                mainHandler.postDelayed(renderAfterSettle, 50);
            }
        }

        // =================================================================
        // TOUCH HANDLING
        // =================================================================

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            scaleDetector.onTouchEvent(event);
            gestureDetector.onTouchEvent(event);

            // If scale is in progress, consume all events
            if (scaleDetector.isInProgress()) return true;

            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                // After any touch ends, schedule render
                mainHandler.removeCallbacks(renderAfterSettle);
                mainHandler.postDelayed(renderAfterSettle, 100);
            }

            return true;
        }

        // =================================================================
        // ZOOM ANIMATION
        // =================================================================

        private void animateZoomTo(float targetZoom, float fx, float fy) {
            if (doubleTapAnimator != null && doubleTapAnimator.isRunning()) {
                doubleTapAnimator.cancel();
            }

            final float startZoom = zoomLevel;
            final float startScrollY = scrollY;
            final float startPanX = panX;

            // Calculate target scroll to keep focal point stable
            float docY = (scrollY + fy) / zoomLevel;
            float targetScrollY = docY * targetZoom - fy;
            float targetPanX = targetZoom <= 1.0f ? 0 : panX;

            doubleTapAnimator = ValueAnimator.ofFloat(0f, 1f);
            doubleTapAnimator.setDuration(DOUBLE_TAP_ANIM_DURATION_MS);
            doubleTapAnimator.setInterpolator(new DecelerateInterpolator(1.5f));
            doubleTapAnimator.addUpdateListener(a -> {
                float t = (float) a.getAnimatedValue();
                zoomLevel = startZoom + (targetZoom - startZoom) * t;
                scrollY = startScrollY + (targetScrollY - startScrollY) * t;
                panX = startPanX + (targetPanX - startPanX) * t;
                clampScrollAndPan();
                invalidate();
            });
            doubleTapAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator a) {
                    renderGeneration.incrementAndGet();
                    pendingRenders.clear();
                    requestVisiblePageRenders();
                }
            });
            doubleTapAnimator.start();
        }

        // =================================================================
        // BOUNDS CLAMPING
        // =================================================================

        private void clampScrollAndPan() {
            // Clamp scrollY
            float maxScroll = totalDocHeight * zoomLevel - getHeight();
            if (maxScroll < 0) maxScroll = 0;
            scrollY = Math.max(0, Math.min(maxScroll, scrollY));

            // Clamp panX
            if (zoomLevel <= 1.0f) {
                panX = 0;
            } else {
                float maxPan = (screenWidth * zoomLevel - getWidth()) / 2f;
                if (maxPan < 0) maxPan = 0;
                panX = Math.max(-maxPan, Math.min(maxPan, panX));
            }
        }

        private int getMaxPanX() {
            if (zoomLevel <= 1.0f) return 0;
            float maxPan = (screenWidth * zoomLevel - getWidth()) / 2f;
            return Math.max(0, (int) maxPan);
        }
    }
}
